import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { BaseValidator } from './base.validator'

/**
 * User Validator
 * Validates all user-related requests with comprehensive business logic and security
 */
export class UserValidator extends BaseValidator {
  /**
   * Validate update current user profile request
   */
  validateUpdateCurrentUserProfile = (req: Request, res: Response, next: NextFunction) => {
    try {
      const bodySchema = z.object({
        firstName: z.string()
          .min(1, 'First name is required')
          .max(50, 'First name cannot exceed 50 characters')
          .regex(/^[a-zA-Z\s\-']+$/, 'First name can only contain letters, spaces, hyphens, and apostrophes')
          .optional(),
        lastName: z.string()
          .min(1, 'Last name is required')
          .max(50, 'Last name cannot exceed 50 characters')
          .regex(/^[a-zA-Z\s\-']+$/, 'Last name can only contain letters, spaces, hyphens, and apostrophes')
          .optional(),
        avatar: z.string()
          .url('Invalid avatar URL')
          .max(2000, 'Avatar URL too long')
          .optional(),
        bio: z.string()
          .max(500, 'Bio cannot exceed 500 characters')
          .optional(),
        status: z.string()
          .max(100, 'Status cannot exceed 100 characters')
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

      // Validate bio content if provided
      if (body.bio) {
        this.validateBioContent(body.bio)
      }

      // Validate status content if provided
      if (body.status) {
        this.validateStatusContent(body.status)
      }

      this.logValidation('updateCurrentUserProfile', req.user?.id, { 
        fields: Object.keys(body) 
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get user by ID request
   */
  validateGetUserById = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
          .min(1, 'User ID is required')
          .max(100, 'Invalid user ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      this.logValidation('getUserById', req.user?.id, { 
        targetUserId: params.id 
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate update user status request
   */
  validateUpdateUserStatus = (req: Request, res: Response, next: NextFunction) => {
    try {
      const bodySchema = z.object({
        isOnline: z.boolean(),
        customStatus: z.string()
          .max(100, 'Custom status cannot exceed 100 characters')
          .optional()
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Validate custom status content if provided
      if (body.customStatus) {
        this.validateStatusContent(body.customStatus)
      }

      this.logValidation('updateUserStatus', req.user?.id, { 
        isOnline: body.isOnline,
        hasCustomStatus: !!body.customStatus 
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate search users request
   */
  validateSearchUsers = (req: Request, res: Response, next: NextFunction) => {
    try {
      const querySchema = z.object({
        query: z.string()
          .min(1, 'Search query is required')
          .max(100, 'Search query too long')
          .regex(/^[a-zA-Z0-9\s\-_.,!?()@]+$/, 'Search query contains invalid characters'),
        limit: z.coerce.number()
          .min(1, 'Limit must be at least 1')
          .max(50, 'Limit cannot exceed 50')
          .default(20),
        skip: z.coerce.number()
          .min(0, 'Skip cannot be negative')
          .default(0),
        excludeBlocked: z.coerce.boolean().default(true)
      })

      const query = this.validateData(querySchema as any, req.query, 'query parameters') as any

      // Rate limiting for search operations
      this.validateSearchRateLimit(req)

      this.logValidation('searchUsers', req.user?.id, { 
        searchQuery: query.query,
        limit: query.limit,
        excludeBlocked: query.excludeBlocked
      })

      req.query = query
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get user contacts request
   */
  validateGetUserContacts = (req: Request, res: Response, next: NextFunction) => {
    try {
      const querySchema = z.object({
        limit: z.coerce.number()
          .min(1, 'Limit must be at least 1')
          .max(100, 'Limit cannot exceed 100')
          .default(50),
        skip: z.coerce.number()
          .min(0, 'Skip cannot be negative')
          .default(0)
      })

      const query = this.validateData(querySchema as any, req.query, 'query parameters') as any

      this.logValidation('getUserContacts', req.user?.id, { 
        limit: query.limit,
        skip: query.skip 
      })

      req.query = query
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate add contact request
   */
  validateAddContact = (req: Request, res: Response, next: NextFunction) => {
    try {
      const bodySchema = z.object({
        contactId: z.string()
          .min(1, 'Contact ID is required')
          .max(100, 'Invalid contact ID format')
          .refine(val => val !== req.user?.id, {
            message: 'Cannot add yourself as a contact'
          }),
        favorite: z.boolean().default(false)
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Rate limiting for adding contacts
      this.validateContactOperationRateLimit(req)

      this.logValidation('addContact', req.user?.id, { 
        contactId: body.contactId,
        favorite: body.favorite 
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate remove contact request
   */
  validateRemoveContact = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
          .min(1, 'Contact ID is required')
          .max(100, 'Invalid contact ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      this.logValidation('removeContact', req.user?.id, { 
        contactId: params.id 
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate toggle contact favorite request
   */
  validateToggleContactFavorite = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
          .min(1, 'Contact ID is required')
          .max(100, 'Invalid contact ID format')
      })

      const bodySchema = z.object({
        favorite: z.boolean()
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')
      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      this.logValidation('toggleContactFavorite', req.user?.id, { 
        contactId: params.id,
        favorite: body.favorite 
      })

      req.params = params
      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate block user request
   */
  validateBlockUser = (req: Request, res: Response, next: NextFunction) => {
    try {
      const bodySchema = z.object({
        userToBlockId: z.string()
          .min(1, 'User ID to block is required')
          .max(100, 'Invalid user ID format')
          .refine(val => val !== req.user?.id, {
            message: 'Cannot block yourself'
          })
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Rate limiting for blocking operations
      this.validateBlockOperationRateLimit(req)

      this.logValidation('blockUser', req.user?.id, { 
        userToBlockId: body.userToBlockId 
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate unblock user request
   */
  validateUnblockUser = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
          .min(1, 'User ID is required')
          .max(100, 'Invalid user ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      this.logValidation('unblockUser', req.user?.id, { 
        userToUnblockId: params.id 
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate delete user account request
   */
  validateDeleteUserAccount = (req: Request, res: Response, next: NextFunction) => {
    try {
      const bodySchema = z.object({
        confirmation: z.literal('DELETE_MY_ACCOUNT', {
          errorMap: () => ({ message: 'Please type "DELETE_MY_ACCOUNT" to confirm' })
        }),
        password: z.string()
          .min(1, 'Password is required for account deletion')
          .max(128, 'Password cannot exceed 128 characters')
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      this.logValidation('deleteUserAccount', req.user?.id)

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get contact suggestions request
   */
  validateGetContactSuggestions = (req: Request, res: Response, next: NextFunction) => {
    try {
      const querySchema = z.object({
        limit: z.coerce.number()
          .min(1, 'Limit must be at least 1')
          .max(20, 'Limit cannot exceed 20')
          .default(10)
      })

      const query = this.validateData(querySchema as any, req.query, 'query parameters') as any

      this.logValidation('getContactSuggestions', req.user?.id, { 
        limit: query.limit 
      })

      req.query = query
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate bulk user operations request (Admin only)
   */
  validateBulkUserOperations = (req: Request, res: Response, next: NextFunction) => {
    try {
      this.validateAdmin(req)

      const bodySchema = z.object({
        operation: z.enum(['activate', 'deactivate', 'delete', 'export'], {
          errorMap: () => ({ message: 'Invalid bulk operation' })
        }),
        userIds: z.array(z.string().min(1, 'User ID cannot be empty'))
          .min(1, 'At least one user ID is required')
          .max(100, 'Cannot process more than 100 users at once')
          .refine(ids => {
            // Check for duplicates
            const uniqueIds = new Set(ids)
            return uniqueIds.size === ids.length
          }, {
            message: 'Duplicate user IDs are not allowed'
          }),
        options: z.object({
          reason: z.string()
            .max(500, 'Reason cannot exceed 500 characters')
            .optional(),
          notifyUsers: z.boolean().default(false)
        }).optional()
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Rate limiting for bulk operations
      this.validateBulkOperationRateLimit(req, body.userIds.length)

      this.logValidation('bulkUserOperations', req.user?.id, {
        operation: body.operation,
        userCount: body.userIds.length
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate export user data request
   */
  validateExportUserData = (req: Request, res: Response, next: NextFunction) => {
    try {
      const querySchema = z.object({
        format: z.enum(['json', 'csv']).default('json'),
        includeContacts: z.coerce.boolean().default(true),
        includeMessages: z.coerce.boolean().default(false)
      })

      const query = this.validateData(querySchema as any, req.query, 'query parameters') as any

      // Rate limiting for data export
      this.validateDataExportRateLimit(req)

      this.logValidation('exportUserData', req.user?.id, { 
        format: query.format,
        includeContacts: query.includeContacts,
        includeMessages: query.includeMessages
      })

      req.query = query
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get user activity request
   */
  validateGetUserActivity = (req: Request, res: Response, next: NextFunction) => {
    try {
      const querySchema = z.object({
        days: z.coerce.number()
          .positive('Days must be positive')
          .max(365, 'Days cannot exceed 365')
          .default(30)
      })

      const query = this.validateData(querySchema as any, req.query, 'query parameters') as any

      this.logValidation('getUserActivity', req.user?.id, { 
        days: query.days 
      })

      req.query = query
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate update privacy settings request
   */
  validateUpdatePrivacySettings = (req: Request, res: Response, next: NextFunction) => {
    try {
      const bodySchema = z.object({
        profileVisibility: z.enum(['public', 'contacts', 'private']).optional(),
        showOnlineStatus: z.boolean().optional(),
        allowContactRequests: z.boolean().optional(),
        showLastSeen: z.boolean().optional(),
        allowGroupInvites: z.boolean().optional()
      }).refine(data => Object.keys(data).length > 0, {
        message: 'At least one privacy setting must be provided'
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      this.logValidation('updatePrivacySettings', req.user?.id, { 
        settings: Object.keys(body) 
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
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
   * Validate bio content
   */
  private validateBioContent(bio: string): void {
    // Check for suspicious patterns
    const suspiciousPatterns = [
      /<script/i,
      /javascript:/i,
      /data:text\/html/i,
      /vbscript:/i,
      /<iframe/i
    ]

    if (suspiciousPatterns.some(pattern => pattern.test(bio))) {
      throw new Error('Bio contains potentially malicious patterns')
    }

    // Check for excessive special characters
    const specialCharCount = (bio.match(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/g) || []).length
    if (specialCharCount > bio.length * 0.3) {
      throw new Error('Bio contains too many special characters')
    }

    // Check for spam patterns
    if (/(.)\1{4,}/.test(bio)) {
      throw new Error('Bio contains excessive character repetition')
    }
  }

  /**
   * Validate status content
   */
  private validateStatusContent(status: string): void {
    // Check for suspicious patterns
    const suspiciousPatterns = [
      /<script/i,
      /javascript:/i,
      /data:text\/html/i,
      /vbscript:/i
    ]

    if (suspiciousPatterns.some(pattern => pattern.test(status))) {
      throw new Error('Status contains potentially malicious patterns')
    }

    // Check for excessive special characters
    const specialCharCount = (status.match(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/g) || []).length
    if (specialCharCount > status.length * 0.4) {
      throw new Error('Status contains too many special characters')
    }
  }

  /**
   * Validate search rate limiting
   */
  private validateSearchRateLimit(req: Request): void {
    const maxSearchesPerMinute = 30
    const windowMs = 60 * 1000 // 1 minute
    
    this.validateRateLimit(req, maxSearchesPerMinute, windowMs)
  }

  /**
   * Validate contact operation rate limiting
   */
  private validateContactOperationRateLimit(req: Request): void {
    const maxContactOperationsPerHour = 100
    const windowMs = 60 * 60 * 1000 // 1 hour
    
    this.validateRateLimit(req, maxContactOperationsPerHour, windowMs)
  }

  /**
   * Validate block operation rate limiting
   */
  private validateBlockOperationRateLimit(req: Request): void {
    const maxBlockOperationsPerHour = 20
    const windowMs = 60 * 60 * 1000 // 1 hour
    
    this.validateRateLimit(req, maxBlockOperationsPerHour, windowMs)
  }

  /**
   * Validate bulk operation rate limiting
   */
  private validateBulkOperationRateLimit(req: Request, operationCount: number): void {
    const maxBulkOperationsPerHour = 5
    const windowMs = 60 * 60 * 1000 // 1 hour
    
    this.validateRateLimit(req, maxBulkOperationsPerHour, windowMs)

    // Additional validation for large operations
    if (operationCount > 50) {
      const maxLargeBulkOperationsPerDay = 2
      const dayWindowMs = 24 * 60 * 60 * 1000 // 24 hours
      this.validateRateLimit(req, maxLargeBulkOperationsPerDay, dayWindowMs)
    }
  }

  /**
   * Validate data export rate limiting
   */
  private validateDataExportRateLimit(req: Request): void {
    const maxExportsPerDay = 5
    const windowMs = 24 * 60 * 60 * 1000 // 24 hours
    
    this.validateRateLimit(req, maxExportsPerDay, windowMs)
  }

  /**
   * Validate user operation permissions
   */
  validateUserOperationPermissions = (req: Request, res: Response, next: NextFunction) => {
    try {
      // This would validate:
      // 1. User has permission to perform user operations
      // 2. User can only access their own data unless admin
      // 3. Privacy settings compliance
      
      const userId = req.user?.id
      if (!userId) {
        throw new Error('User authentication required for user operations')
      }

      // Placeholder - would integrate with user service
      this.logValidation('userPermissions', userId)

      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate user limits
   */
  validateUserLimits = (req: Request, res: Response, next: NextFunction) => {
    try {
      // This would validate:
      // 1. User hasn't exceeded contact limits
      // 2. User hasn't exceeded blocking limits
      // 3. User operation frequency limits
      
      const userId = req.user?.id
      if (!userId) {
        throw new Error('User authentication required')
      }

      // Placeholder - would integrate with user service
      this.logValidation('userLimits', userId)

      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Create comprehensive validation middleware for user endpoints
   */
  createUserValidation = (validationType: 'profile' | 'contacts' | 'blocking' | 'admin' | 'privacy') => {
    const validators = [this.validateUserOperationPermissions, this.validateUserLimits]

    switch (validationType) {
      case 'profile':
        validators.push(this.validateUpdateCurrentUserProfile)
        break
      case 'contacts':
        validators.push(this.validateAddContact)
        break
      case 'blocking':
        validators.push(this.validateBlockUser)
        break
      case 'admin':
        validators.push(this.validateBulkUserOperations)
        break
      case 'privacy':
        validators.push(this.validateUpdatePrivacySettings)
        break
    }

    return this.chainValidators(...validators)
  }
}

// Export singleton instance
export const userValidator = new UserValidator()
