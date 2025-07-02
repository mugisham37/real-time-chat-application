import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { userRepository } from '../repositories/UserRepository';
import { userSessionRepository } from '../repositories/UserSessionRepository';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginCredentials {
  emailOrUsername: string;
  password: string;
  deviceInfo?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface AuthResult {
  user: any;
  tokens: AuthTokens;
  session: any;
}

/**
 * Authentication service that handles user authentication, registration,
 * session management, and security features
 */
export class AuthService {
  private readonly JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
  private readonly JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-super-secret-refresh-key';
  private readonly JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
  private readonly JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
  private readonly BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12');
  private readonly MAX_LOGIN_ATTEMPTS = parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5');
  private readonly LOCKOUT_TIME = parseInt(process.env.LOCKOUT_TIME || '900000'); // 15 minutes

  /**
   * Register a new user
   */
  async register(data: RegisterData): Promise<AuthResult> {
    try {
      // Check if user already exists
      const existingUser = await userRepository.findByEmailOrUsername(data.email, data.username);
      if (existingUser) {
        throw new Error('User with this email or username already exists');
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(data.password, this.BCRYPT_ROUNDS);

      // Create user
      const user = await userRepository.create({
        ...data,
        password: hashedPassword,
        isVerified: false, // Email verification required
        verificationToken: crypto.randomBytes(32).toString('hex'),
      });

      // Generate tokens and create session
      const tokens = this.generateTokens(user.id);
      const session = await this.createSession(user.id, tokens, {});

      return {
        user: this.sanitizeUser(user),
        tokens,
        session,
      };
    } catch (error) {
      throw new Error(`Registration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Login user with credentials
   */
  async login(credentials: LoginCredentials): Promise<AuthResult> {
    try {
      // Find user by email or username
      const user = await userRepository.findByEmailOrUsername(credentials.emailOrUsername);
      if (!user) {
        throw new Error('Invalid credentials');
      }

      // Check if account is locked
      if (user.isLocked && user.lockUntil && user.lockUntil > new Date()) {
        const remainingTime = Math.ceil((user.lockUntil.getTime() - Date.now()) / 60000);
        throw new Error(`Account is locked. Try again in ${remainingTime} minutes`);
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(credentials.password, user.password);
      if (!isPasswordValid) {
        await this.handleFailedLogin(user.id);
        throw new Error('Invalid credentials');
      }

      // Check if account is active
      if (!user.isActive) {
        throw new Error('Account is deactivated');
      }

      // Reset login attempts on successful login
      await userRepository.update(user.id, {
        loginAttempts: 0,
        isLocked: false,
        lockUntil: null,
        lastLoginAt: new Date(),
      });

      // Generate tokens and create session
      const tokens = this.generateTokens(user.id);
      const session = await this.createSession(user.id, tokens, {
        deviceInfo: credentials.deviceInfo,
        ipAddress: credentials.ipAddress,
        userAgent: credentials.userAgent,
      });

      return {
        user: this.sanitizeUser(user),
        tokens,
        session,
      };
    } catch (error) {
      throw new Error(`Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, this.JWT_REFRESH_SECRET) as any;
      
      // Find session by refresh token
      const session = await userSessionRepository.findByRefreshToken(refreshToken);
      if (!session || !session.isActive) {
        throw new Error('Invalid refresh token');
      }

      // Check if session has expired
      if (session.expiresAt < new Date()) {
        throw new Error('Refresh token has expired');
      }

      // Generate new tokens
      const newTokens = this.generateTokens(decoded.userId);
      
      // Update session with new refresh token
      await userSessionRepository.updateRefreshToken(
        session.token,
        newTokens.refreshToken,
        new Date(Date.now() + this.parseTimeToMs(this.JWT_REFRESH_EXPIRES_IN))
      );

      return newTokens;
    } catch (error) {
      throw new Error(`Token refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Logout user (deactivate session)
   */
  async logout(token: string): Promise<void> {
    try {
      await userSessionRepository.deactivateSession(token);
    } catch (error) {
      throw new Error(`Logout failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Logout from all devices
   */
  async logoutAll(userId: string): Promise<void> {
    try {
      await userSessionRepository.deactivateAllUserSessions(userId);
    } catch (error) {
      throw new Error(`Logout all failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Verify email with verification token
   */
  async verifyEmail(token: string): Promise<any> {
    try {
      const user = await userRepository.findByVerificationToken(token);
      if (!user) {
        throw new Error('Invalid verification token');
      }

      // Update user as verified
      const updatedUser = await userRepository.update(user.id, {
        isVerified: true,
        verificationToken: null,
        emailVerifiedAt: new Date(),
      });

      return this.sanitizeUser(updatedUser);
    } catch (error) {
      throw new Error(`Email verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Request password reset
   */
  async requestPasswordReset(email: string): Promise<void> {
    try {
      const user = await userRepository.findByEmail(email);
      if (!user) {
        // Don't reveal if email exists
        return;
      }

      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetExpires = new Date(Date.now() + 3600000); // 1 hour

      await userRepository.update(user.id, {
        passwordResetToken: resetToken,
        passwordResetExpires: resetExpires,
      });

      // TODO: Send password reset email
      // await emailService.sendPasswordResetEmail(user.email, resetToken);
    } catch (error) {
      throw new Error(`Password reset request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Reset password with reset token
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    try {
      const user = await userRepository.findByPasswordResetToken(token);
      if (!user || !user.passwordResetExpires || user.passwordResetExpires < new Date()) {
        throw new Error('Invalid or expired reset token');
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, this.BCRYPT_ROUNDS);

      // Update user password and clear reset token
      await userRepository.update(user.id, {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetExpires: null,
        passwordChangedAt: new Date(),
      });

      // Deactivate all sessions for security
      await userSessionRepository.deactivateAllUserSessions(user.id);
    } catch (error) {
      throw new Error(`Password reset failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Change password (authenticated user)
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    try {
      const user = await userRepository.findById(userId, '+password');
      if (!user) {
        throw new Error('User not found');
      }

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
      if (!isCurrentPasswordValid) {
        throw new Error('Current password is incorrect');
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, this.BCRYPT_ROUNDS);

      // Update password
      await userRepository.update(userId, {
        password: hashedPassword,
        passwordChangedAt: new Date(),
      });

      // Deactivate all other sessions for security
      // Keep current session active by not deactivating all
    } catch (error) {
      throw new Error(`Password change failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate session token
   */
  async validateSession(token: string): Promise<{ isValid: boolean; user?: any; session?: any }> {
    try {
      // Verify JWT token
      const decoded = jwt.verify(token, this.JWT_SECRET) as any;
      
      // Validate session in database
      const result = await userSessionRepository.validateSession(token);
      
      if (!result.isValid) {
        return { isValid: false };
      }

      return {
        isValid: true,
        user: this.sanitizeUser(result.session.user),
        session: result.session,
      };
    } catch (error) {
      return { isValid: false };
    }
  }

  /**
   * Generate JWT tokens
   */
  private generateTokens(userId: string): AuthTokens {
    const accessToken = jwt.sign(
      { userId, type: 'access' },
      this.JWT_SECRET,
      { expiresIn: this.JWT_EXPIRES_IN }
    );

    const refreshToken = jwt.sign(
      { userId, type: 'refresh' },
      this.JWT_REFRESH_SECRET,
      { expiresIn: this.JWT_REFRESH_EXPIRES_IN }
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: this.parseTimeToMs(this.JWT_EXPIRES_IN),
    };
  }

  /**
   * Create user session
   */
  private async createSession(
    userId: string,
    tokens: AuthTokens,
    sessionData: {
      deviceInfo?: string;
      ipAddress?: string;
      userAgent?: string;
    }
  ) {
    return await userSessionRepository.create({
      userId,
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: new Date(Date.now() + this.parseTimeToMs(this.JWT_REFRESH_EXPIRES_IN)),
      ...sessionData,
    });
  }

  /**
   * Handle failed login attempt
   */
  private async handleFailedLogin(userId: string): Promise<void> {
    const user = await userRepository.findById(userId);
    if (!user) return;

    const attempts = (user.loginAttempts || 0) + 1;

    if (attempts >= this.MAX_LOGIN_ATTEMPTS) {
      // Lock account
      await userRepository.update(userId, {
        loginAttempts: attempts,
        isLocked: true,
        lockUntil: new Date(Date.now() + this.LOCKOUT_TIME),
      });
    } else {
      // Increment attempts
      await userRepository.update(userId, {
        loginAttempts: attempts,
      });
    }
  }

  /**
   * Remove sensitive data from user object
   */
  private sanitizeUser(user: any): any {
    const { password, verificationToken, passwordResetToken, ...sanitized } = user;
    return sanitized;
  }

  /**
   * Parse time string to milliseconds
   */
  private parseTimeToMs(timeString: string): number {
    const unit = timeString.slice(-1);
    const value = parseInt(timeString.slice(0, -1));

    switch (unit) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      default: return parseInt(timeString);
    }
  }
}

// Export singleton instance
export const authService = new AuthService();
