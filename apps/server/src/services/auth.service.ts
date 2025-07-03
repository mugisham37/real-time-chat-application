import jwt, { SignOptions } from "jsonwebtoken"
import { config } from "../config"
import { userRepository } from "@chatapp/database"
import { ApiError } from "../utils/apiError"
import { logger } from "../utils/logger"
import { getRedisManager } from "../config/redis"
import { analyticsService } from "./analytics.service"

export class AuthService {
  private redis = getRedisManager()

  /**
   * Generate JWT token
   */
  generateToken(id: string): string {
    const options: SignOptions = {
      expiresIn: config.jwt.expiresIn as string,
    }
    return jwt.sign({ id }, config.jwt.secret, options)
  }

  /**
   * Generate refresh token
   */
  generateRefreshToken(id: string): string {
    const options: SignOptions = {
      expiresIn: config.jwt.refreshExpiresIn as string,
    }
    return jwt.sign({ id }, config.jwt.refreshSecret, options)
  }

  /**
   * Register a new user
   */
  async register(userData: {
    username: string
    email: string
    password: string
    firstName?: string
    lastName?: string
  }): Promise<{
    user: any
    token: string
    refreshToken: string
  }> {
    try {
      // Check if user already exists
      const existingUser = await userRepository.findByEmailOrUsername(userData.email)

      if (existingUser) {
        if (existingUser.email === userData.email) {
          throw ApiError.conflict("Email already in use")
        }
        throw ApiError.conflict("Username already taken")
      }

      // Create new user
      const user = await userRepository.create(userData)

      // Generate tokens
      const token = this.generateToken(user.id)
      const refreshToken = this.generateRefreshToken(user.id)

      // Store refresh token in Redis with expiration
      await this.redis.set(
        `refresh_token:${user.id}`,
        refreshToken,
        this.parseExpirationTime(config.jwt.refreshExpiresIn)
      )

      // Track registration activity
      await analyticsService.trackUserActivity(user.id, {
        type: "login",
        metadata: { action: "register", timestamp: Date.now() }
      })

      // Update system counters
      await this.redis.incr("system:total_users")
      const today = new Date().toISOString().split("T")[0]
      await this.redis.incr(`analytics:new_users_by_date:${today}`)

      // Cache user data
      await this.cacheUserData(user)

      logger.info(`User registered successfully: ${user.id}`, {
        userId: user.id,
        email: user.email,
        username: user.username
      })

      // Return user data and tokens
      return {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          avatar: user.avatar,
          isOnline: user.isOnline,
          createdAt: user.createdAt,
        },
        token,
        refreshToken,
      }
    } catch (error) {
      logger.error("Registration error:", error)
      throw error
    }
  }

  /**
   * Login user
   */
  async login(
    email: string,
    password: string,
  ): Promise<{
    user: any
    token: string
    refreshToken: string
  }> {
    try {
      // Check if user exists
      const user = await userRepository.findByEmail(email, true)

      if (!user) {
        throw ApiError.unauthorized("Invalid credentials")
      }

      // Check if password is correct
      const isMatch = await userRepository.verifyPassword(user.id, password)

      if (!isMatch) {
        throw ApiError.unauthorized("Invalid credentials")
      }

      // Update user status to online
      await userRepository.updateOnlineStatus(user.id, true)

      // Generate tokens
      const token = this.generateToken(user.id)
      const refreshToken = this.generateRefreshToken(user.id)

      // Store refresh token in Redis
      await this.redis.set(
        `refresh_token:${user.id}`,
        refreshToken,
        this.parseExpirationTime(config.jwt.refreshExpiresIn)
      )

      // Track login activity
      await analyticsService.trackUserActivity(user.id, {
        type: "login",
        metadata: { action: "login", timestamp: Date.now() }
      })

      // Cache user data
      await this.cacheUserData(user)

      // Add to global user activity tracking
      await this.redis.client.zAdd("analytics:global_user_activity", {
        score: Date.now(),
        value: user.id,
      })

      logger.info(`User logged in successfully: ${user.id}`, {
        userId: user.id,
        email: user.email
      })

      // Return user data and tokens
      return {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          avatar: user.avatar,
          isOnline: true,
          lastSeen: new Date(),
        },
        token,
        refreshToken,
      }
    } catch (error) {
      logger.error("Login error:", error)
      throw error
    }
  }

  /**
   * Refresh token
   */
  async refreshToken(refreshToken: string): Promise<{
    token: string
    refreshToken: string
  }> {
    try {
      if (!refreshToken) {
        throw ApiError.badRequest("Refresh token is required")
      }

      // Verify refresh token
      const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret) as { id: string }

      // Check if refresh token exists in Redis
      const storedToken = await this.redis.get(`refresh_token:${decoded.id}`)
      if (!storedToken || storedToken !== refreshToken) {
        throw ApiError.unauthorized("Invalid refresh token")
      }

      // Check if user exists
      const user = await userRepository.findById(decoded.id)

      if (!user) {
        throw ApiError.unauthorized("Invalid refresh token")
      }

      // Generate new tokens
      const newToken = this.generateToken(user.id)
      const newRefreshToken = this.generateRefreshToken(user.id)

      // Update refresh token in Redis
      await this.redis.set(
        `refresh_token:${user.id}`,
        newRefreshToken,
        this.parseExpirationTime(config.jwt.refreshExpiresIn)
      )

      logger.info(`Token refreshed for user: ${user.id}`)

      // Return new tokens
      return {
        token: newToken,
        refreshToken: newRefreshToken,
      }
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw ApiError.unauthorized("Invalid refresh token")
      }
      if (error instanceof jwt.TokenExpiredError) {
        throw ApiError.unauthorized("Refresh token expired")
      }
      logger.error("Token refresh error:", error)
      throw error
    }
  }

  /**
   * Logout user
   */
  async logout(userId: string): Promise<void> {
    try {
      // Update user status to offline
      await userRepository.updateOnlineStatus(userId, false)

      // Remove refresh token from Redis
      await this.redis.del(`refresh_token:${userId}`)

      // Remove cached user data
      await this.redis.del(`user:${userId}`)

      // Remove from global activity tracking
      await this.redis.client.zRem("analytics:global_user_activity", userId)

      logger.info(`User logged out: ${userId}`)
    } catch (error) {
      logger.error("Logout error:", error)
      throw error
    }
  }

  /**
   * Logout from all devices
   */
  async logoutFromAllDevices(userId: string): Promise<void> {
    try {
      // Update user status to offline
      await userRepository.updateOnlineStatus(userId, false)

      // Remove all refresh tokens for this user
      const pattern = `refresh_token:${userId}*`
      const keys = await this.redis.keys(pattern)
      if (keys.length > 0) {
        await this.redis.delete(...keys)
      }

      // Remove cached user data
      await this.redis.del(`user:${userId}`)

      // Remove from global activity tracking
      await this.redis.client.zRem("analytics:global_user_activity", userId)

      logger.info(`User logged out from all devices: ${userId}`)
    } catch (error) {
      logger.error("Logout from all devices error:", error)
      throw error
    }
  }

  /**
   * Verify token
   */
  verifyToken(token: string): { id: string } {
    try {
      return jwt.verify(token, config.jwt.secret) as { id: string }
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw ApiError.unauthorized("Invalid token")
      }
      if (error instanceof jwt.TokenExpiredError) {
        throw ApiError.unauthorized("Token expired")
      }
      throw error
    }
  }

  /**
   * Change password
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<{ message: string }> {
    try {
      // Verify current password
      const isCurrentPasswordValid = await userRepository.verifyPassword(userId, currentPassword)
      if (!isCurrentPasswordValid) {
        throw ApiError.unauthorized("Current password is incorrect")
      }

      // Update password
      await userRepository.updatePassword(userId, newPassword)

      // Logout from all devices for security
      await this.logoutFromAllDevices(userId)

      // Track password change activity
      await analyticsService.trackUserActivity(userId, {
        type: "profile_updated",
        metadata: { action: "password_change", timestamp: Date.now() }
      })

      logger.info(`Password changed for user: ${userId}`)

      return { message: "Password changed successfully. Please log in again." }
    } catch (error) {
      logger.error(`Password change error for user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Request password reset
   */
  async requestPasswordReset(email: string): Promise<{ message: string }> {
    try {
      const user = await userRepository.findByEmail(email)
      if (!user) {
        // Don't reveal if email exists or not
        return { message: "If the email exists, a password reset link has been sent." }
      }

      // Generate reset token
      const resetToken = jwt.sign(
        { id: user.id, type: "password_reset" },
        config.jwt.secret,
        { expiresIn: "1h" }
      )

      // Store reset token in Redis with 1 hour expiration
      await this.redis.set(`password_reset:${user.id}`, resetToken, 3600)

      // In a real application, you would send an email here
      logger.info(`Password reset requested for user: ${user.id}`)

      return { message: "If the email exists, a password reset link has been sent." }
    } catch (error) {
      logger.error("Password reset request error:", error)
      throw error
    }
  }

  /**
   * Reset password with token
   */
  async resetPassword(
    token: string,
    newPassword: string
  ): Promise<{ message: string }> {
    try {
      // Verify reset token
      const decoded = jwt.verify(token, config.jwt.secret) as { id: string; type: string }

      if (decoded.type !== "password_reset") {
        throw ApiError.unauthorized("Invalid reset token")
      }

      // Check if token exists in Redis
      const storedToken = await this.redis.get(`password_reset:${decoded.id}`)
      if (!storedToken || storedToken !== token) {
        throw ApiError.unauthorized("Invalid or expired reset token")
      }

      // Update password
      await userRepository.updatePassword(decoded.id, newPassword)

      // Remove reset token
      await this.redis.del(`password_reset:${decoded.id}`)

      // Logout from all devices
      await this.logoutFromAllDevices(decoded.id)

      // Track password reset activity
      await analyticsService.trackUserActivity(decoded.id, {
        type: "profile_updated",
        metadata: { action: "password_reset", timestamp: Date.now() }
      })

      logger.info(`Password reset completed for user: ${decoded.id}`)

      return { message: "Password reset successfully. Please log in with your new password." }
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
        throw ApiError.unauthorized("Invalid or expired reset token")
      }
      logger.error("Password reset error:", error)
      throw error
    }
  }

  /**
   * Get user sessions
   */
  async getUserSessions(userId: string): Promise<any[]> {
    try {
      // Get all refresh tokens for this user
      const pattern = `refresh_token:${userId}*`
      const keys = await this.redis.keys(pattern)

      const sessions = []
      for (const key of keys) {
        const token = await this.redis.get(key)
        if (token) {
          try {
            const decoded = jwt.verify(token, config.jwt.refreshSecret) as any
            const ttl = await this.redis.ttl(key)
            
            sessions.push({
              id: key.replace(`refresh_token:${userId}:`, '') || 'default',
              createdAt: new Date(decoded.iat * 1000),
              expiresAt: new Date(decoded.exp * 1000),
              isActive: ttl > 0,
            })
          } catch (error) {
            // Invalid token, remove it
            await this.redis.del(key)
          }
        }
      }

      return sessions
    } catch (error) {
      logger.error(`Error getting user sessions for ${userId}:`, error)
      return []
    }
  }

  /**
   * Revoke specific session
   */
  async revokeSession(userId: string, sessionId: string): Promise<{ message: string }> {
    try {
      const key = sessionId === 'default' 
        ? `refresh_token:${userId}` 
        : `refresh_token:${userId}:${sessionId}`
      
      const deleted = await this.redis.del(key)
      
      if (deleted) {
        logger.info(`Session revoked for user ${userId}: ${sessionId}`)
        return { message: "Session revoked successfully" }
      } else {
        throw ApiError.notFound("Session not found")
      }
    } catch (error) {
      logger.error(`Error revoking session for user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Helper methods
   */
  private parseExpirationTime(expiration: string): number {
    // Convert JWT expiration format to seconds
    const match = expiration.match(/^(\d+)([smhd])$/)
    if (!match) return 3600 // Default 1 hour

    const value = parseInt(match[1])
    const unit = match[2]

    switch (unit) {
      case 's': return value
      case 'm': return value * 60
      case 'h': return value * 60 * 60
      case 'd': return value * 60 * 60 * 24
      default: return 3600
    }
  }

  private async cacheUserData(user: any): Promise<void> {
    try {
      const userData = {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        isOnline: user.isOnline,
        lastSeen: user.lastSeen,
      }

      await this.redis.setJSON(`user:${user.id}`, userData, 3600) // Cache for 1 hour
    } catch (error) {
      logger.error(`Error caching user data for ${user.id}:`, error)
      // Don't throw, caching is non-critical
    }
  }
}

// Export singleton instance
export const authService = new AuthService()
