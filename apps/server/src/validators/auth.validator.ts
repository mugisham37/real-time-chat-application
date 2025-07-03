import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { BaseValidator } from './base.validator'

/**
 * Authentication Validator
 * Validates all authentication-related requests with comprehensive security checks
 */
export class AuthValidator extends BaseValidator {
  /**
   * Validate user registration request
   */
  validateRegister = (req: Request, res: Response, next: NextFunction) => {
    try {
      const bodySchema = z.object({
        username: z.string()
          .min(3, 'Username must be at least 3 characters long')
          .max(30, 'Username cannot exceed 30 characters')
          .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores')
          .refine(val => !val.includes('admin') && !val.includes('system'), {
            message: 'Username cannot contain reserved words'
          }),
        email: z.string()
          .email('Invalid email format')
          .max(254, 'Email cannot exceed 254 characters')
          .toLowerCase()
          .refine(val => !val.includes('+'), {
            message: 'Email aliases with + are not allowed'
          }),
        password: z.string()
          .min(8, 'Password must be at least 8 characters long')
          .max(128, 'Password cannot exceed 128 characters')
          .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
            'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
        firstName: z.string()
          .min(1, 'First name is required')
          .max(50, 'First name cannot exceed 50 characters')
          .regex(/^[a-zA-Z\s'-]+$/, 'First name can only contain letters, spaces, hyphens, and apostrophes')
          .optional(),
        lastName: z.string()
          .min(1, 'Last name is required')
          .max(50, 'Last name cannot exceed 50 characters')
          .regex(/^[a-zA-Z\s'-]+$/, 'Last name can only contain letters, spaces, hyphens, and apostrophes')
          .optional()
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Additional security validations
      this.validatePasswordStrength(body.password)
      this.validateEmailDomain(body.email)
      this.validateUsernameBlacklist(body.username)

      this.logValidation('register', undefined, { 
        email: body.email,
        username: body.username,
        hasFirstName: !!body.firstName,
        hasLastName: !!body.lastName
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate user login request
   */
  validateLogin = (req: Request, res: Response, next: NextFunction) => {
    try {
      const bodySchema = z.object({
        email: z.string()
          .email('Invalid email format')
          .max(254, 'Email cannot exceed 254 characters')
          .toLowerCase(),
        password: z.string()
          .min(1, 'Password is required')
          .max(128, 'Password cannot exceed 128 characters')
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Rate limiting for login attempts
      this.validateLoginRateLimit(req, body.email)

      this.logValidation('login', undefined, { 
        email: body.email,
        userAgent: req.headers['user-agent']?.substring(0, 100),
        ip: req.ip
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate refresh token request
   */
  validateRefreshToken = (req: Request, res: Response, next: NextFunction) => {
    try {
      const bodySchema = z.object({
        refreshToken: z.string()
          .min(1, 'Refresh token is required')
          .max(1000, 'Invalid refresh token format')
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      this.logValidation('refreshToken', undefined, { 
        tokenPreview: body.refreshToken.substring(0, 10) + '...'
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate change password request
   */
  validateChangePassword = (req: Request, res: Response, next: NextFunction) => {
    try {
      const bodySchema = z.object({
        currentPassword: z.string()
          .min(1, 'Current password is required')
          .max(128, 'Password cannot exceed 128 characters'),
        newPassword: z.string()
          .min(8, 'New password must be at least 8 characters long')
          .max(128, 'New password cannot exceed 128 characters')
          .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
            'New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character')
      }).refine(data => data.currentPassword !== data.newPassword, {
        message: 'New password must be different from current password'
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Additional password validations
      this.validatePasswordStrength(body.newPassword)
      this.validatePasswordHistory(req.user?.id, body.newPassword)

      this.logValidation('changePassword', req.user?.id)

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate forgot password request
   */
  validateForgotPassword = (req: Request, res: Response, next: NextFunction) => {
    try {
      const bodySchema = z.object({
        email: z.string()
          .email('Invalid email format')
          .max(254, 'Email cannot exceed 254 characters')
          .toLowerCase()
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Rate limiting for password reset requests
      this.validatePasswordResetRateLimit(req, body.email)

      this.logValidation('forgotPassword', undefined, { 
        email: body.email,
        ip: req.ip
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate reset password request
   */
  validateResetPassword = (req: Request, res: Response, next: NextFunction) => {
    try {
      const bodySchema = z.object({
        token: z.string()
          .min(1, 'Reset token is required')
          .max(500, 'Invalid token format'),
        newPassword: z.string()
          .min(8, 'New password must be at least 8 characters long')
          .max(128, 'New password cannot exceed 128 characters')
          .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
            'New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character')
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Additional password validations
      this.validatePasswordStrength(body.newPassword)

      this.logValidation('resetPassword', undefined, { 
        tokenPreview: body.token.substring(0, 10) + '...'
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate update profile request
   */
  validateUpdateProfile = (req: Request, res: Response, next: NextFunction) => {
    try {
      const bodySchema = z.object({
        firstName: z.string()
          .min(1, 'First name cannot be empty')
          .max(50, 'First name cannot exceed 50 characters')
          .regex(/^[a-zA-Z\s'-]+$/, 'First name can only contain letters, spaces, hyphens, and apostrophes')
          .optional(),
        lastName: z.string()
          .min(1, 'Last name cannot be empty')
          .max(50, 'Last name cannot exceed 50 characters')
          .regex(/^[a-zA-Z\s'-]+$/, 'Last name can only contain letters, spaces, hyphens, and apostrophes')
          .optional(),
        bio: z.string()
          .max(500, 'Bio cannot exceed 500 characters')
          .optional(),
        avatar: z.string()
          .url('Invalid avatar URL')
          .max(2000, 'Avatar URL too long')
          .optional()
      }).refine(data => Object.keys(data).length > 0, {
        message: 'At least one field must be provided for update'
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Validate avatar URL if provided
      if (body.avatar) {
        this.validateImageUrl(body.avatar)
      }

      this.logValidation('updateProfile', req.user?.id, { 
        fields: Object.keys(body)
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate delete account request
   */
  validateDeleteAccount = (req: Request, res: Response, next: NextFunction) => {
    try {
      const bodySchema = z.object({
        password: z.string()
          .min(1, 'Password is required for account deletion')
          .max(128, 'Password cannot exceed 128 characters'),
        confirmation: z.literal('DELETE_MY_ACCOUNT', {
          errorMap: () => ({ message: 'Please type "DELETE_MY_ACCOUNT" to confirm' })
        })
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      this.logValidation('deleteAccount', req.user?.id, { 
        confirmed: body.confirmation === 'DELETE_MY_ACCOUNT'
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate session revocation request
   */
  validateRevokeSession = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        sessionId: z.string()
          .min(1, 'Session ID is required')
          .max(100, 'Invalid session ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      this.logValidation('revokeSession', req.user?.id, { 
        sessionId: params.sessionId
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate two-factor authentication setup
   */
  validateTwoFactorSetup = (req: Request, res: Response, next: NextFunction) => {
    try {
      const bodySchema = z.object({
        password: z.string()
          .min(1, 'Password is required')
          .max(128, 'Password cannot exceed 128 characters'),
        code: z.string()
          .length(6, '2FA code must be 6 digits')
          .regex(/^\d{6}$/, '2FA code must contain only digits')
          .optional()
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      this.logValidation('twoFactorSetup', req.user?.id, { 
        hasCode: !!body.code
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate two-factor authentication verification
   */
  validateTwoFactorVerify = (req: Request, res: Response, next: NextFunction) => {
    try {
      const bodySchema = z.object({
        email: z.string()
          .email('Invalid email format')
          .max(254, 'Email cannot exceed 254 characters')
          .toLowerCase(),
        password: z.string()
          .min(1, 'Password is required')
          .max(128, 'Password cannot exceed 128 characters'),
        code: z.string()
          .length(6, '2FA code must be 6 digits')
          .regex(/^\d{6}$/, '2FA code must contain only digits')
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Rate limiting for 2FA attempts
      this.validateTwoFactorRateLimit(req, body.email)

      this.logValidation('twoFactorVerify', undefined, { 
        email: body.email
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate password strength beyond basic requirements
   */
  private validatePasswordStrength(password: string): void {
    // Check for common passwords
    const commonPasswords = [
      'password', '123456', 'password123', 'admin', 'qwerty',
      'letmein', 'welcome', 'monkey', '1234567890'
    ]
    
    if (commonPasswords.some(common => password.toLowerCase().includes(common))) {
      throw new Error('Password contains common patterns and is not secure')
    }

    // Check for repeated characters
    if (/(.)\1{2,}/.test(password)) {
      throw new Error('Password cannot contain more than 2 consecutive identical characters')
    }

    // Check for keyboard patterns
    const keyboardPatterns = ['qwerty', 'asdf', '1234', 'abcd']
    if (keyboardPatterns.some(pattern => password.toLowerCase().includes(pattern))) {
      throw new Error('Password cannot contain keyboard patterns')
    }
  }

  /**
   * Validate email domain against blacklist
   */
  private validateEmailDomain(email: string): void {
    const domain = email.split('@')[1]?.toLowerCase()
    
    // Blacklisted domains (temporary email services)
    const blacklistedDomains = [
      '10minutemail.com', 'tempmail.org', 'guerrillamail.com',
      'mailinator.com', 'throwaway.email'
    ]
    
    if (blacklistedDomains.includes(domain)) {
      throw new Error('Email domain is not allowed')
    }
  }

  /**
   * Validate username against blacklist
   */
  private validateUsernameBlacklist(username: string): void {
    const blacklistedUsernames = [
      'admin', 'administrator', 'root', 'system', 'support',
      'help', 'api', 'www', 'mail', 'ftp', 'test', 'demo'
    ]
    
    if (blacklistedUsernames.includes(username.toLowerCase())) {
      throw new Error('Username is reserved and cannot be used')
    }
  }

  /**
   * Validate image URL for avatar
   */
  private validateImageUrl(url: string): void {
    const allowedDomains = [
      'imgur.com', 'cloudinary.com', 'amazonaws.com',
      'googleusercontent.com', 'gravatar.com'
    ]
    
    try {
      const urlObj = new URL(url)
      const domain = urlObj.hostname.toLowerCase()
      
      if (!allowedDomains.some(allowed => domain.includes(allowed))) {
        throw new Error('Avatar URL must be from an approved image hosting service')
      }
    } catch {
      throw new Error('Invalid avatar URL format')
    }
  }

  /**
   * Validate password history (placeholder - would integrate with user service)
   */
  private validatePasswordHistory(userId: string | undefined, newPassword: string): void {
    // This would check against user's password history
    // For now, just a placeholder
    if (!userId) return
    
    // In a real implementation, this would:
    // 1. Fetch user's password history
    // 2. Hash the new password with the same salt as previous passwords
    // 3. Compare against recent passwords (e.g., last 5)
  }

  /**
   * Validate login rate limiting
   */
  private validateLoginRateLimit(req: Request, email: string): void {
    // This would implement rate limiting based on:
    // 1. IP address (e.g., 10 attempts per 15 minutes)
    // 2. Email address (e.g., 5 attempts per 15 minutes)
    // 3. Global rate limiting
    
    const maxAttemptsPerIP = 10
    const maxAttemptsPerEmail = 5
    const windowMs = 15 * 60 * 1000 // 15 minutes
    
    // Placeholder implementation
    this.validateRateLimit(req, maxAttemptsPerIP, windowMs)
  }

  /**
   * Validate password reset rate limiting
   */
  private validatePasswordResetRateLimit(req: Request, email: string): void {
    // Rate limiting for password reset requests
    const maxResetRequests = 3
    const windowMs = 60 * 60 * 1000 // 1 hour
    
    this.validateRateLimit(req, maxResetRequests, windowMs)
  }

  /**
   * Validate two-factor authentication rate limiting
   */
  private validateTwoFactorRateLimit(req: Request, email: string): void {
    // Rate limiting for 2FA attempts
    const maxAttempts = 5
    const windowMs = 15 * 60 * 1000 // 15 minutes
    
    this.validateRateLimit(req, maxAttempts, windowMs)
  }

  /**
   * Create comprehensive validation middleware for auth endpoints
   */
  createAuthValidation = (validationType: 'register' | 'login' | 'password' | 'profile' | 'security') => {
    const validators = [this.validateSecurityHeaders]

    switch (validationType) {
      case 'register':
        validators.push(this.validateRegister)
        break
      case 'login':
        validators.push(this.validateLogin)
        break
      case 'password':
        validators.push(this.validateChangePassword)
        break
      case 'profile':
        validators.push(this.validateUpdateProfile)
        break
      case 'security':
        validators.push(this.validateTwoFactorSetup)
        break
    }

    return this.chainValidators(...validators)
  }

  /**
   * Validate security headers
   */
  private validateSecurityHeaders = (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate CSRF token for state-changing operations
      if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
        const csrfToken = req.headers['x-csrf-token']
        if (!csrfToken) {
          throw new Error('CSRF token is required')
        }
      }

      // Validate origin for sensitive operations
      const origin = req.headers.origin
      const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000']
      
      if (origin && !allowedOrigins.includes(origin)) {
        throw new Error('Request origin not allowed')
      }

      next()
    } catch (error) {
      next(error)
    }
  }
}

// Export singleton instance
export const authValidator = new AuthValidator()
