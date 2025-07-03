import type { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { BaseValidator } from './base.validator'

/**
 * Presence Validator
 * Validates all presence-related requests with comprehensive business logic
 */
export class PresenceValidator extends BaseValidator {
  /**
   * Validate update presence request
   */
  validateUpdatePresence = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const bodySchema = z.object({
        status: z.enum(['online', 'away', 'busy', 'invisible', 'offline']),
        customMessage: z.string().max(100).optional(),
        deviceInfo: z.object({
          type: z.enum(['web', 'mobile', 'desktop']),
          userAgent: z.string().optional(),
          platform: z.string().optional()
        }).optional()
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Validate custom message if provided
      if (body.customMessage) {
        this.validateCustomMessage(body.customMessage)
      }

      this.logValidation('updatePresence', req.user?.id, {
        status: body.status,
        hasCustomMessage: !!body.customMessage,
        deviceType: body.deviceInfo?.type
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get user presence request
   */
  validateGetUserPresence = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const paramsSchema = z.object({
        userId: z.string().min(1, 'User ID is required')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      this.logValidation('getUserPresence', req.user?.id, { 
        targetUserId: params.userId 
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get multiple users presence request
   */
  validateGetMultiplePresence = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const bodySchema = z.object({
        userIds: z.array(z.string().min(1))
          .min(1, 'At least one user ID is required')
          .max(100, 'Maximum 100 users at once')
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      this.logValidation('getMultiplePresence', req.user?.id, {
        userCount: body.userIds.length
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate set typing indicator request
   */
  validateSetTypingIndicator = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const bodySchema = z.object({
        conversationId: z.string().min(1, 'Conversation ID is required'),
        isTyping: z.boolean()
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Rate limiting for typing indicators
      this.validateTypingIndicatorRateLimit(req)

      this.logValidation('setTypingIndicator', req.user?.id, {
        conversationId: body.conversationId,
        isTyping: body.isTyping
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get typing users request
   */
  validateGetTypingUsers = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const paramsSchema = z.object({
        conversationId: z.string().min(1, 'Conversation ID is required')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      this.logValidation('getTypingUsers', req.user?.id, { 
        conversationId: params.conversationId 
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate set activity status request
   */
  validateSetActivityStatus = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const bodySchema = z.object({
        activity: z.enum(['idle', 'active', 'in_call', 'in_meeting', 'gaming', 'custom']),
        details: z.string().max(100).optional(),
        expiresInMinutes: z.number().positive().max(1440).optional() // Max 24 hours
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Validate activity details content
      if (body.details) {
        this.validateActivityDetails(body.details, body.activity)
      }

      this.logValidation('setActivityStatus', req.user?.id, {
        activity: body.activity,
        hasDetails: !!body.details,
        expiresInMinutes: body.expiresInMinutes
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get user activity status request
   */
  validateGetUserActivityStatus = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const paramsSchema = z.object({
        userId: z.string()
          .min(1, 'User ID is required')
          .max(100, 'Invalid user ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      this.logValidation('getUserActivityStatus', req.user?.id, { 
        targetUserId: params.userId 
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate update location request
   */
  validateUpdateLocation = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const bodySchema = z.object({
        latitude: z.number()
          .min(-90, 'Latitude must be between -90 and 90')
          .max(90, 'Latitude must be between -90 and 90')
          .optional(),
        longitude: z.number()
          .min(-180, 'Longitude must be between -180 and 180')
          .max(180, 'Longitude must be between -180 and 180')
          .optional(),
        country: z.string()
          .max(100, 'Country name too long')
          .regex(/^[a-zA-Z\s\-']+$/, 'Country name contains invalid characters')
          .optional(),
        city: z.string()
          .max(100, 'City name too long')
          .regex(/^[a-zA-Z\s\-']+$/, 'City name contains invalid characters')
          .optional(),
        timezone: z.string()
          .max(50, 'Timezone string too long')
          .regex(/^[A-Za-z_\/]+$/, 'Invalid timezone format')
          .optional(),
        isShared: z.boolean().default(false)
      }).refine(data => {
        // If coordinates are provided, both latitude and longitude must be present
        if ((data.latitude !== undefined) !== (data.longitude !== undefined)) {
          throw new Error('Both latitude and longitude must be provided together')
        }
        return true
      }, {
        message: 'Incomplete coordinate data'
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Validate location data consistency
      if (body.latitude !== undefined && body.longitude !== undefined) {
        this.validateCoordinates(body.latitude, body.longitude)
      }

      // Rate limiting for location updates
      this.validateLocationUpdateRateLimit(req)

      this.logValidation('updateLocation', req.user?.id, {
        hasCoordinates: !!(body.latitude && body.longitude),
        isShared: body.isShared,
        country: body.country
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get user location request
   */
  validateGetUserLocation = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const paramsSchema = z.object({
        userId: z.string()
          .min(1, 'User ID is required')
          .max(100, 'Invalid user ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      this.logValidation('getUserLocation', req.user?.id, { 
        targetUserId: params.userId 
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get nearby users request
   */
  validateGetNearbyUsers = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const querySchema = z.object({
        radiusKm: z.coerce.number()
          .positive('Radius must be positive')
          .max(100, 'Radius cannot exceed 100km')
          .default(10),
        limit: z.coerce.number()
          .min(1, 'Limit must be at least 1')
          .max(50, 'Limit cannot exceed 50')
          .default(20)
      })

      const query = this.validateData(querySchema as any, req.query, 'query parameters') as any

      this.logValidation('getNearbyUsers', req.user?.id, {
        radiusKm: query.radiusKm,
        limit: query.limit
      })

      req.query = query
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get presence statistics request (Admin only)
   */
  validateGetPresenceStatistics = (req: Request, res: Response, next: NextFunction): void => {
    try {
      this.validateAdmin(req)

      this.logValidation('getPresenceStatistics', req.user?.id)

      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate cleanup expired presence request (Admin only)
   */
  validateCleanupExpiredPresence = (req: Request, res: Response, next: NextFunction): void => {
    try {
      this.validateAdmin(req)

      this.logValidation('cleanupExpiredPresence', req.user?.id)

      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate bulk update presence request (Admin only)
   */
  validateBulkUpdatePresence = (req: Request, res: Response, next: NextFunction): void => {
    try {
      this.validateAdmin(req)

      const bodySchema = z.object({
        updates: z.array(z.object({
          userId: z.string().min(1, 'User ID is required'),
          status: z.enum(['online', 'away', 'busy', 'invisible', 'offline']),
          customMessage: z.string().max(100).optional()
        }))
          .min(1, 'At least one update is required')
          .max(100, 'Cannot update more than 100 users at once')
          .refine(updates => {
            // Check for duplicate user IDs
            const userIds = updates.map(u => u.userId)
            const uniqueIds = new Set(userIds)
            return uniqueIds.size === userIds.length
          }, {
            message: 'Duplicate user IDs are not allowed'
          })
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Rate limiting for bulk operations
      this.validateBulkPresenceUpdateRateLimit(req, body.updates.length)

      this.logValidation('bulkUpdatePresence', req.user?.id, {
        updateCount: body.updates.length
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate presence permissions
   */
  validatePresencePermissions = (req: Request, res: Response, next: NextFunction): void => {
    try {
      // This would validate:
      // 1. User has permission to update presence
      // 2. User can view other users' presence based on privacy settings
      // 3. Location sharing permissions
      
      const userId = req.user?.id
      if (!userId) {
        throw new Error('User authentication required for presence operations')
      }

      // Placeholder - would integrate with presence service
      this.logValidation('presencePermissions', userId)

      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate location privacy
   */
  validateLocationPrivacy = (req: Request, res: Response, next: NextFunction): void => {
    try {
      // This would validate:
      // 1. User has enabled location sharing
      // 2. Target user allows location visibility
      // 3. Privacy settings compliance
      
      const userId = req.user?.id
      if (!userId) {
        throw new Error('User authentication required for location operations')
      }

      // Placeholder - would integrate with privacy service
      this.logValidation('locationPrivacy', userId)

      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Create comprehensive validation middleware for presence endpoints
   */
  createPresenceValidation = (validationType: 'status' | 'typing' | 'activity' | 'location' | 'admin') => {
    const validators = [this.validatePresencePermissions]

    switch (validationType) {
      case 'status':
        validators.push(this.validateUpdatePresence)
        break
      case 'typing':
        validators.push(this.validateSetTypingIndicator)
        break
      case 'activity':
        validators.push(this.validateSetActivityStatus)
        break
      case 'location':
        validators.push(this.validateLocationPrivacy, this.validateUpdateLocation)
        break
      case 'admin':
        validators.push(this.validateBulkUpdatePresence)
        break
    }

    return this.chainValidators(...validators)
  }

  // Private helper methods

  /**
   * Validate custom message content
   */
  private validateCustomMessage(message: string): void {
    // Check for suspicious patterns
    const suspiciousPatterns = [
      /<script/i,
      /javascript:/i,
      /data:text\/html/i,
      /vbscript:/i,
      /<iframe/i
    ]

    if (suspiciousPatterns.some(pattern => pattern.test(message))) {
      throw new Error('Custom message contains potentially malicious patterns')
    }

    // Check for excessive special characters
    const specialCharCount = (message.match(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/g) || []).length
    if (specialCharCount > message.length * 0.3) {
      throw new Error('Custom message contains too many special characters')
    }

    // Check for spam patterns
    if (/(.)\1{4,}/.test(message)) {
      throw new Error('Custom message contains excessive character repetition')
    }
  }

  /**
   * Validate activity details content
   */
  private validateActivityDetails(details: string, activity: string): void {
    // Activity-specific validation
    switch (activity) {
      case 'gaming':
        if (details.length < 3) {
          throw new Error('Gaming activity details should specify the game')
        }
        break
      case 'in_meeting':
        if (details.includes('http') || details.includes('www')) {
          throw new Error('Meeting details should not contain URLs')
        }
        break
      case 'custom':
        if (details.length < 5) {
          throw new Error('Custom activity details must be at least 5 characters')
        }
        break
    }

    // General content validation
    this.validateCustomMessage(details)
  }

  /**
   * Validate coordinates
   */
  private validateCoordinates(latitude: number, longitude: number): void {
    // Check for obviously invalid coordinates (e.g., 0,0 which is in the ocean)
    if (latitude === 0 && longitude === 0) {
      throw new Error('Coordinates appear to be invalid (0,0)')
    }

    // Check for precision (too many decimal places might indicate fake data)
    const latPrecision = latitude.toString().split('.')[1]?.length || 0
    const lonPrecision = longitude.toString().split('.')[1]?.length || 0
    
    if (latPrecision > 8 || lonPrecision > 8) {
      throw new Error('Coordinate precision is too high')
    }
  }

  /**
   * Validate presence update rate limiting
   */
  private validatePresenceUpdateRateLimit(req: Request): void {
    const maxUpdatesPerMinute = 30
    const windowMs = 60 * 1000 // 1 minute
    
    this.validateRateLimit(req, maxUpdatesPerMinute, windowMs)
  }

  /**
   * Validate typing indicator rate limiting
   */
  private validateTypingIndicatorRateLimit(req: Request): void {
    const maxIndicatorsPerMinute = 60
    const windowMs = 60 * 1000 // 1 minute
    
    this.validateRateLimit(req, maxIndicatorsPerMinute, windowMs)
  }

  /**
   * Validate location update rate limiting
   */
  private validateLocationUpdateRateLimit(req: Request): void {
    const maxUpdatesPerHour = 100
    const windowMs = 60 * 60 * 1000 // 1 hour
    
    this.validateRateLimit(req, maxUpdatesPerHour, windowMs)
  }

  /**
   * Validate bulk presence update rate limiting
   */
  private validateBulkPresenceUpdateRateLimit(req: Request, updateCount: number): void {
    const maxBulkOperationsPerHour = 5
    const windowMs = 60 * 60 * 1000 // 1 hour
    
    this.validateRateLimit(req, maxBulkOperationsPerHour, windowMs)

    // Additional validation for large operations
    if (updateCount > 50) {
      const maxLargeBulkOperationsPerDay = 2
      const dayWindowMs = 24 * 60 * 60 * 1000 // 24 hours
      this.validateRateLimit(req, maxLargeBulkOperationsPerDay, dayWindowMs)
    }
  }
}

// Export singleton instance
export const presenceValidator = new PresenceValidator()
