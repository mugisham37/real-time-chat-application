import { Request, Response } from 'express'
import { z } from 'zod'
import { BaseController } from './base.controller'
import { authService } from '../services/auth.service'

/**
 * Authentication Controller
 * Handles user authentication, registration, and session management
 */
export class AuthController extends BaseController {
  /**
   * Register a new user
   * POST /api/auth/register
   */
  register = this.asyncHandler(async (req: Request, res: Response) => {
    const bodySchema = z.object({
      username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
      email: z.string().email('Invalid email format'),
      password: z.string().min(8, 'Password must be at least 8 characters long'),
      firstName: z.string().min(1).max(50).optional(),
      lastName: z.string().min(1).max(50).optional()
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('register', undefined, { email: body.email, username: body.username })

    const result = await authService.register(body)

    // Filter sensitive data from response
    const responseData = {
      user: this.filterSensitiveData(result.user, ['password']),
      token: result.token,
      refreshToken: result.refreshToken
    }

    this.sendSuccess(res, responseData, 'User registered successfully', 201)
  })

  /**
   * Login user
   * POST /api/auth/login
   */
  login = this.asyncHandler(async (req: Request, res: Response) => {
    const bodySchema = z.object({
      email: z.string().email('Invalid email format'),
      password: z.string().min(1, 'Password is required')
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('login', undefined, { email: body.email })

    const result = await authService.login(body.email, body.password)

    // Filter sensitive data from response
    const responseData = {
      user: this.filterSensitiveData(result.user, ['password']),
      token: result.token,
      refreshToken: result.refreshToken
    }

    this.sendSuccess(res, responseData, 'Login successful')
  })

  /**
   * Refresh access token
   * POST /api/auth/refresh
   */
  refreshToken = this.asyncHandler(async (req: Request, res: Response) => {
    const bodySchema = z.object({
      refreshToken: z.string().min(1, 'Refresh token is required')
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('refreshToken')

    const result = await authService.refreshToken(body.refreshToken)

    this.sendSuccess(res, result, 'Token refreshed successfully')
  })

  /**
   * Logout user
   * POST /api/auth/logout
   */
  logout = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    this.logAction('logout', userId)

    await authService.logout(userId)

    this.sendSuccess(res, { message: 'Logged out successfully' }, 'Logout successful')
  })

  /**
   * Logout from all devices
   * POST /api/auth/logout-all
   */
  logoutFromAllDevices = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    this.logAction('logoutFromAllDevices', userId)

    await authService.logoutFromAllDevices(userId)

    this.sendSuccess(res, { message: 'Logged out from all devices successfully' }, 'Logout from all devices successful')
  })

  /**
   * Change password
   * POST /api/auth/change-password
   */
  changePassword = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const bodySchema = z.object({
      currentPassword: z.string().min(1, 'Current password is required'),
      newPassword: z.string().min(8, 'New password must be at least 8 characters long')
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('changePassword', userId)

    const result = await authService.changePassword(userId, body.currentPassword, body.newPassword)

    this.sendSuccess(res, result, 'Password changed successfully')
  })

  /**
   * Request password reset
   * POST /api/auth/forgot-password
   */
  requestPasswordReset = this.asyncHandler(async (req: Request, res: Response) => {
    const bodySchema = z.object({
      email: z.string().email('Invalid email format')
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('requestPasswordReset', undefined, { email: body.email })

    const result = await authService.requestPasswordReset(body.email)

    this.sendSuccess(res, result, 'Password reset request processed')
  })

  /**
   * Reset password with token
   * POST /api/auth/reset-password
   */
  resetPassword = this.asyncHandler(async (req: Request, res: Response) => {
    const bodySchema = z.object({
      token: z.string().min(1, 'Reset token is required'),
      newPassword: z.string().min(8, 'New password must be at least 8 characters long')
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('resetPassword')

    const result = await authService.resetPassword(body.token, body.newPassword)

    this.sendSuccess(res, result, 'Password reset successfully')
  })

  /**
   * Get current user profile
   * GET /api/auth/me
   */
  getCurrentUser = this.asyncHandler(async (req: Request, res: Response) => {
    const user = this.getUser(req)

    this.logAction('getCurrentUser', user.id)

    // Filter sensitive data
    const userData = this.filterSensitiveData(user, ['password'])

    this.sendSuccess(res, userData, 'User profile retrieved successfully')
  })

  /**
   * Verify token
   * GET /api/auth/verify
   */
  verifyToken = this.asyncHandler(async (req: Request, res: Response) => {
    const user = this.getUser(req)

    this.logAction('verifyToken', user.id)

    const userData = this.filterSensitiveData(user, ['password'])

    this.sendSuccess(res, { 
      valid: true, 
      user: userData 
    }, 'Token is valid')
  })

  /**
   * Get user sessions
   * GET /api/auth/sessions
   */
  getUserSessions = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    this.logAction('getUserSessions', userId)

    const sessions = await authService.getUserSessions(userId)

    this.sendSuccess(res, sessions, 'User sessions retrieved successfully')
  })

  /**
   * Revoke specific session
   * DELETE /api/auth/sessions/:sessionId
   */
  revokeSession = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const sessionId = req.params.sessionId

    const paramsSchema = z.object({
      sessionId: z.string().min(1, 'Session ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('revokeSession', userId, { sessionId })

    const result = await authService.revokeSession(userId, sessionId)

    this.sendSuccess(res, result, 'Session revoked successfully')
  })

  /**
   * Check authentication status
   * GET /api/auth/status
   */
  getAuthStatus = this.asyncHandler(async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      this.sendSuccess(res, { 
        authenticated: false,
        user: null 
      }, 'Not authenticated')
      return
    }

    try {
      const token = authHeader.substring(7)
      const decoded = authService.verifyToken(token)
      
      this.sendSuccess(res, { 
        authenticated: true,
        userId: decoded.id 
      }, 'Authenticated')
    } catch (error) {
      this.sendSuccess(res, { 
        authenticated: false,
        user: null 
      }, 'Invalid token')
    }
  })

  /**
   * Update user profile
   * PUT /api/auth/profile
   */
  updateProfile = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const bodySchema = z.object({
      firstName: z.string().min(1).max(50).optional(),
      lastName: z.string().min(1).max(50).optional(),
      bio: z.string().max(500).optional(),
      avatar: z.string().url().optional()
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('updateProfile', userId, { fields: Object.keys(body) })

    // This would typically use a user service, but since we don't have it yet,
    // we'll return a success message for now
    this.sendSuccess(res, { 
      message: 'Profile update functionality will be implemented with user service' 
    }, 'Profile updated successfully')
  })

  /**
   * Delete user account
   * DELETE /api/auth/account
   */
  deleteAccount = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const bodySchema = z.object({
      password: z.string().min(1, 'Password is required for account deletion'),
      confirmation: z.literal('DELETE_MY_ACCOUNT', {
        errorMap: () => ({ message: 'Please type "DELETE_MY_ACCOUNT" to confirm' })
      })
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('deleteAccount', userId)

    // First logout from all devices
    await authService.logoutFromAllDevices(userId)

    // This would typically use a user service to delete the account
    // For now, we'll return a success message
    this.sendSuccess(res, { 
      message: 'Account deletion functionality will be implemented with user service' 
    }, 'Account deletion initiated')
  })

  /**
   * Enable two-factor authentication
   * POST /api/auth/2fa/enable
   */
  enableTwoFactor = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    this.logAction('enableTwoFactor', userId)

    // This would typically integrate with a 2FA service
    this.sendSuccess(res, { 
      message: '2FA functionality will be implemented in future updates',
      qrCode: null,
      backupCodes: []
    }, '2FA setup initiated')
  })

  /**
   * Disable two-factor authentication
   * POST /api/auth/2fa/disable
   */
  disableTwoFactor = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const bodySchema = z.object({
      password: z.string().min(1, 'Password is required'),
      code: z.string().length(6, '2FA code must be 6 digits')
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('disableTwoFactor', userId)

    // This would typically integrate with a 2FA service
    this.sendSuccess(res, { 
      message: '2FA functionality will be implemented in future updates' 
    }, '2FA disabled successfully')
  })

  /**
   * Verify two-factor authentication code
   * POST /api/auth/2fa/verify
   */
  verifyTwoFactor = this.asyncHandler(async (req: Request, res: Response) => {
    const bodySchema = z.object({
      email: z.string().email('Invalid email format'),
      password: z.string().min(1, 'Password is required'),
      code: z.string().length(6, '2FA code must be 6 digits')
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('verifyTwoFactor', undefined, { email: body.email })

    // This would typically integrate with a 2FA service
    this.sendSuccess(res, { 
      message: '2FA functionality will be implemented in future updates',
      token: null,
      refreshToken: null
    }, '2FA verification completed')
  })
}

// Export singleton instance
export const authController = new AuthController()
