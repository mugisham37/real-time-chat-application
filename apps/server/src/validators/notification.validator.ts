import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { BaseValidator } from './base.validator'

/**
 * Notification Validator
 * Validates all notification-related requests with comprehensive business logic
 */
export class NotificationValidator extends BaseValidator {
  /**
   * Validate get notifications request
   */
  validateGetNotifications = (req: Request, res: Response, next: NextFunction) => {
    try {
      const querySchema = z.object({
        limit: z.coerce.number().min(1).max(100).default(20),
        skip: z.coerce.number().min(0).default(0),
        isRead: z.coerce.boolean().optional(),
        type: z.enum([
          'new_message', 'mention', 'message_reaction', 'group_invite', 
          'incoming_call', 'missed_call', 'call_ended'
        ]).optional(),
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional()
      }).refine(data => {
        if (data.startDate && data.endDate) {
          const start = new Date(data.startDate)
          const end = new Date(data.endDate)
          if (start >= end) {
            throw new Error('Start date must be before end date')
          }
        }
        return true
      }, {
        message: 'Invalid date range'
      })

      const query = this.validateData(querySchema as any, req.query, 'query parameters') as any

      this.logValidation('getNotifications', req.user?.id, {
        limit: query.limit,
        filters: { isRead: query.isRead, type: query.type }
      })

      req.query = query
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate mark as read request
   */
  validateMarkAsRead = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string().min(1, 'Notification ID is required')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      this.logValidation('markAsRead', req.user?.id, { 
        notificationId: params.id 
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate update notification preferences request
   */
  validateUpdatePreferences = (req: Request, res: Response, next: NextFunction) => {
    try {
      const bodySchema = z.object({
        messages: z.boolean().optional(),
        mentions: z.boolean().optional(),
        reactions: z.boolean().optional(),
        calls: z.boolean().optional(),
        groups: z.boolean().optional(),
        email: z.boolean().optional(),
        push: z.boolean().optional()
      }).refine(data => Object.keys(data).length > 0, {
        message: 'At least one preference must be provided'
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      this.logValidation('updatePreferences', req.user?.id, {
        preferences: Object.keys(body)
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate create notification request (Admin only)
   */
  validateCreateNotification = (req: Request, res: Response, next: NextFunction) => {
    try {
      this.validateAdmin(req)

      const bodySchema = z.object({
        recipient: z.string().min(1, 'Recipient is required'),
        type: z.enum([
          'new_message', 'mention', 'message_reaction', 'group_invite',
          'incoming_call', 'missed_call', 'call_ended'
        ]),
        content: z.string().min(1, 'Content is required').max(500, 'Content too long'),
        relatedId: z.string().optional(),
        relatedType: z.string().optional(),
        metadata: z.record(z.any()).optional()
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      this.logValidation('createNotification', req.user?.id, {
        recipient: body.recipient,
        type: body.type
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate bulk operations request
   */
  validateBulkOperations = (req: Request, res: Response, next: NextFunction) => {
    try {
      const bodySchema = z.object({
        notificationIds: z.array(z.string().min(1))
          .min(1, 'At least one notification ID is required')
          .max(100, 'Maximum 100 notifications at once'),
        operation: z.enum(['mark_read', 'delete']).optional()
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Rate limiting for bulk operations
      this.validateBulkOperationRateLimit(req, body.notificationIds.length)

      this.logValidation('bulkOperations', req.user?.id, {
        operation: body.operation,
        count: body.notificationIds.length
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate push subscription request
   */
  validatePushSubscription = (req: Request, res: Response, next: NextFunction) => {
    try {
      const bodySchema = z.object({
        endpoint: z.string().url('Invalid endpoint URL'),
        keys: z.object({
          p256dh: z.string().min(1, 'p256dh key is required'),
          auth: z.string().min(1, 'auth key is required')
        }),
        deviceInfo: z.object({
          type: z.enum(['web', 'mobile', 'desktop']).default('web'),
          platform: z.string().optional(),
          userAgent: z.string().optional()
        }).optional()
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      this.logValidation('pushSubscription', req.user?.id, {
        deviceType: body.deviceInfo?.type || 'web'
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate bulk operation rate limiting
   */
  private validateBulkOperationRateLimit(req: Request, operationCount: number): void {
    const maxBulkOperationsPerHour = 10
    const windowMs = 60 * 60 * 1000 // 1 hour
    
    this.validateRateLimit(req, maxBulkOperationsPerHour, windowMs)

    // Additional validation for large operations
    if (operationCount > 50) {
      const maxLargeBulkOperationsPerDay = 3
      const dayWindowMs = 24 * 60 * 60 * 1000 // 24 hours
      this.validateRateLimit(req, maxLargeBulkOperationsPerDay, dayWindowMs)
    }
  }

  /**
   * Create comprehensive validation middleware for notification endpoints
   */
  createNotificationValidation = (validationType: 'get' | 'update' | 'create' | 'bulk' | 'push') => {
    const validators: Array<(req: Request, res: Response, next: NextFunction) => void> = []

    switch (validationType) {
      case 'get':
        validators.push(this.validateGetNotifications)
        break
      case 'update':
        validators.push(this.validateUpdatePreferences)
        break
      case 'create':
        validators.push(this.validateCreateNotification)
        break
      case 'bulk':
        validators.push(this.validateBulkOperations)
        break
      case 'push':
        validators.push(this.validatePushSubscription)
        break
    }

    return this.chainValidators(...validators)
  }
}

// Export singleton instance
export const notificationValidator = new NotificationValidator()
