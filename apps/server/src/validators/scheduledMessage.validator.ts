import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { BaseValidator } from './base.validator'

/**
 * Scheduled Message Validator
 * Validates all scheduled message requests with comprehensive business logic and security
 */
export class ScheduledMessageValidator extends BaseValidator {
  /**
   * Validate schedule message request
   */
  validateScheduleMessage = (req: Request, res: Response, next: NextFunction) => {
    try {
      const bodySchema = z.object({
        conversationId: z.string()
          .min(1, 'Conversation ID is required')
          .max(100, 'Invalid conversation ID format'),
        conversationType: z.enum(['DIRECT', 'GROUP'], {
          errorMap: () => ({ message: 'Conversation type must be DIRECT or GROUP' })
        }),
        content: z.string()
          .min(1, 'Message content is required')
          .max(10000, 'Message content cannot exceed 10,000 characters'),
        type: z.enum(['TEXT', 'IMAGE', 'FILE', 'AUDIO', 'VIDEO']).default('TEXT'),
        scheduledFor: z.string()
          .datetime('Invalid scheduled date format'),
        attachments: z.array(z.object({
          url: z.string()
            .url('Invalid attachment URL')
            .max(2000, 'Attachment URL too long'),
          type: z.string()
            .min(1, 'Attachment type is required')
            .max(100, 'Attachment type too long'),
          name: z.string()
            .min(1, 'Attachment name is required')
            .max(255, 'Attachment name too long'),
          size: z.number()
            .positive('Attachment size must be positive')
            .max(100 * 1024 * 1024, 'Attachment size cannot exceed 100MB')
        })).max(10, 'Cannot have more than 10 attachments').optional(),
        mentions: z.array(z.string().min(1, 'Mention ID cannot be empty'))
          .max(50, 'Cannot mention more than 50 users')
          .optional(),
        replyToId: z.string()
          .max(100, 'Invalid reply message ID format')
          .optional()
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Validate scheduled time
      this.validateScheduledTime(body.scheduledFor)

      // Validate message content
      this.validateMessageContent(body.content, body.type)

      // Validate attachments
      if (body.attachments) {
        this.validateAttachments(body.attachments, body.type)
      }

      // Validate mentions
      if (body.mentions) {
        this.validateMentions(body.mentions)
      }

      // Rate limiting for scheduling messages
      this.validateScheduleMessageRateLimit(req)

      this.logValidation('scheduleMessage', req.user?.id, {
        conversationId: body.conversationId,
        conversationType: body.conversationType,
        scheduledFor: body.scheduledFor,
        hasAttachments: body.attachments && body.attachments.length > 0,
        mentionCount: body.mentions?.length || 0
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get user scheduled messages request
   */
  validateGetUserScheduledMessages = (req: Request, res: Response, next: NextFunction) => {
    try {
      const querySchema = z.object({
        status: z.enum(['SCHEDULED', 'SENT', 'CANCELLED']).optional(),
        limit: z.coerce.number()
          .min(1, 'Limit must be at least 1')
          .max(100, 'Limit cannot exceed 100')
          .default(20),
        skip: z.coerce.number()
          .min(0, 'Skip cannot be negative')
          .default(0)
      })

      const query = this.validateData(querySchema as any, req.query, 'query parameters') as any

      this.logValidation('getUserScheduledMessages', req.user?.id, {
        status: query.status,
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
   * Validate update scheduled message request
   */
  validateUpdateScheduledMessage = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
          .min(1, 'Message ID is required')
          .max(100, 'Invalid message ID format')
      })

      const bodySchema = z.object({
        content: z.string()
          .min(1, 'Content cannot be empty')
          .max(10000, 'Content cannot exceed 10,000 characters')
          .optional(),
        scheduledFor: z.string()
          .datetime('Invalid scheduled date format')
          .optional(),
        attachments: z.array(z.object({
          url: z.string().url('Invalid attachment URL'),
          type: z.string().min(1, 'Attachment type is required'),
          name: z.string().min(1, 'Attachment name is required'),
          size: z.number().positive('Attachment size must be positive')
        })).max(10, 'Cannot have more than 10 attachments').optional()
      }).refine(data => Object.keys(data).length > 0, {
        message: 'At least one field must be provided for update'
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')
      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Validate scheduled time if provided
      if (body.scheduledFor) {
        this.validateScheduledTime(body.scheduledFor)
      }

      // Validate content if provided
      if (body.content) {
        this.validateMessageContent(body.content, 'TEXT')
      }

      // Validate attachments if provided
      if (body.attachments) {
        this.validateAttachments(body.attachments, 'FILE')
      }

      this.logValidation('updateScheduledMessage', req.user?.id, {
        messageId: params.id,
        hasContent: !!body.content,
        hasScheduledFor: !!body.scheduledFor,
        attachmentCount: body.attachments?.length || 0
      })

      req.params = params
      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate cancel scheduled message request
   */
  validateCancelScheduledMessage = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
          .min(1, 'Message ID is required')
          .max(100, 'Invalid message ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      this.logValidation('cancelScheduledMessage', req.user?.id, { 
        messageId: params.id 
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get conversation scheduled messages request
   */
  validateGetConversationScheduledMessages = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        conversationId: z.string()
          .min(1, 'Conversation ID is required')
          .max(100, 'Invalid conversation ID format')
      })

      const querySchema = z.object({
        limit: z.coerce.number()
          .min(1, 'Limit must be at least 1')
          .max(100, 'Limit cannot exceed 100')
          .default(20),
        skip: z.coerce.number()
          .min(0, 'Skip cannot be negative')
          .default(0)
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')
      const query = this.validateData(querySchema as any, req.query, 'query parameters') as any

      this.logValidation('getConversationScheduledMessages', req.user?.id, {
        conversationId: params.conversationId,
        limit: query.limit,
        skip: query.skip
      })

      req.params = params
      req.query = query
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate bulk cancel scheduled messages request
   */
  validateBulkCancelScheduledMessages = (req: Request, res: Response, next: NextFunction) => {
    try {
      const bodySchema = z.object({
        messageIds: z.array(z.string().min(1, 'Message ID cannot be empty'))
          .min(1, 'At least one message ID is required')
          .max(50, 'Cannot cancel more than 50 messages at once')
          .refine(ids => {
            // Check for duplicates
            const uniqueIds = new Set(ids)
            return uniqueIds.size === ids.length
          }, {
            message: 'Duplicate message IDs are not allowed'
          })
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Rate limiting for bulk operations
      this.validateBulkOperationRateLimit(req, body.messageIds.length)

      this.logValidation('bulkCancelScheduledMessages', req.user?.id, {
        messageCount: body.messageIds.length
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate process due scheduled messages request (Admin only)
   */
  validateProcessDueScheduledMessages = (req: Request, res: Response, next: NextFunction) => {
    try {
      this.validateAdmin(req)

      this.logValidation('processDueScheduledMessages', req.user?.id)

      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get all scheduled messages request (Admin only)
   */
  validateGetAllScheduledMessages = (req: Request, res: Response, next: NextFunction) => {
    try {
      this.validateAdmin(req)

      const querySchema = z.object({
        limit: z.coerce.number()
          .min(1, 'Limit must be at least 1')
          .max(100, 'Limit cannot exceed 100')
          .default(50),
        offset: z.coerce.number()
          .min(0, 'Offset cannot be negative')
          .default(0),
        status: z.enum(['SCHEDULED', 'SENT', 'CANCELLED']).optional()
      })

      const query = this.validateData(querySchema as any, req.query, 'query parameters') as any

      this.logValidation('getAllScheduledMessages', req.user?.id, {
        limit: query.limit,
        offset: query.offset,
        status: query.status
      })

      req.query = query
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate cleanup old scheduled messages request (Admin only)
   */
  validateCleanupOldScheduledMessages = (req: Request, res: Response, next: NextFunction) => {
    try {
      this.validateAdmin(req)

      const bodySchema = z.object({
        olderThanDays: z.number()
          .positive('Days must be positive')
          .max(365, 'Cannot exceed 1 year')
          .default(30)
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      this.logValidation('cleanupOldScheduledMessages', req.user?.id, {
        olderThanDays: body.olderThanDays
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get upcoming scheduled messages request
   */
  validateGetUpcomingScheduledMessages = (req: Request, res: Response, next: NextFunction) => {
    try {
      const querySchema = z.object({
        hours: z.coerce.number()
          .positive('Hours must be positive')
          .max(168, 'Hours cannot exceed 1 week (168 hours)')
          .default(24),
        limit: z.coerce.number()
          .min(1, 'Limit must be at least 1')
          .max(50, 'Limit cannot exceed 50')
          .default(10)
      })

      const query = this.validateData(querySchema as any, req.query, 'query parameters') as any

      this.logValidation('getUpcomingScheduledMessages', req.user?.id, {
        hours: query.hours,
        limit: query.limit
      })

      req.query = query
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate reschedule message request
   */
  validateRescheduleMessage = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
          .min(1, 'Message ID is required')
          .max(100, 'Invalid message ID format')
      })

      const bodySchema = z.object({
        scheduledFor: z.string()
          .datetime('Invalid scheduled date format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')
      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Validate scheduled time
      this.validateScheduledTime(body.scheduledFor)

      this.logValidation('rescheduleMessage', req.user?.id, {
        messageId: params.id,
        newScheduledFor: body.scheduledFor
      })

      req.params = params
      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate scheduled time
   */
  private validateScheduledTime(scheduledFor: string): void {
    const scheduledDate = new Date(scheduledFor)
    const now = new Date()

    // Check if scheduled time is in the future
    if (scheduledDate <= now) {
      throw new Error('Scheduled time must be in the future')
    }

    // Check if scheduled time is not too far in the future (1 year max)
    const oneYearFromNow = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
    if (scheduledDate > oneYearFromNow) {
      throw new Error('Scheduled time cannot be more than 1 year in the future')
    }

    // Check if scheduled time is at least 1 minute in the future
    const oneMinuteFromNow = new Date(now.getTime() + 60 * 1000)
    if (scheduledDate < oneMinuteFromNow) {
      throw new Error('Scheduled time must be at least 1 minute in the future')
    }
  }

  /**
   * Validate message content
   */
  private validateMessageContent(content: string, messageType: string): void {
    // Check for empty content after trimming
    if (content.trim().length === 0) {
      throw new Error('Message content cannot be empty')
    }

    // Check for suspicious patterns
    const suspiciousPatterns = [
      /<script/i,
      /javascript:/i,
      /data:text\/html/i,
      /vbscript:/i,
      /<iframe/i,
      /<object/i,
      /<embed/i
    ]

    if (suspiciousPatterns.some(pattern => pattern.test(content))) {
      throw new Error('Message content contains potentially malicious patterns')
    }

    // Check for excessive repetition (spam detection)
    const words = content.toLowerCase().split(/\s+/)
    const wordCount = words.reduce((acc, word) => {
      acc[word] = (acc[word] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const maxWordRepetition = Math.max(...Object.values(wordCount))
    if (maxWordRepetition > 10 && words.length > 20) {
      throw new Error('Message appears to be spam (excessive word repetition)')
    }

    // Check for excessive capitalization
    const uppercaseRatio = (content.match(/[A-Z]/g) || []).length / content.length
    if (uppercaseRatio > 0.7 && content.length > 20) {
      throw new Error('Message contains excessive capitalization')
    }
  }

  /**
   * Validate attachments
   */
  private validateAttachments(attachments: any[], messageType: string): void {
    if (!attachments || attachments.length === 0) return

    // Validate attachment count based on message type
    const maxAttachments = messageType === 'FILE' ? 10 : 5
    if (attachments.length > maxAttachments) {
      throw new Error(`Cannot have more than ${maxAttachments} attachments for ${messageType} messages`)
    }

    // Validate each attachment
    attachments.forEach((attachment, index) => {
      // Validate file size
      if (attachment.size > 100 * 1024 * 1024) { // 100MB
        throw new Error(`Attachment ${index + 1} exceeds maximum size of 100MB`)
      }

      // Validate file type
      const allowedTypes = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'video/mp4', 'video/webm', 'video/quicktime',
        'audio/mpeg', 'audio/wav', 'audio/ogg',
        'application/pdf', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain', 'text/csv'
      ]

      if (!allowedTypes.includes(attachment.type)) {
        throw new Error(`Attachment ${index + 1} has unsupported file type: ${attachment.type}`)
      }

      // Validate URL format
      try {
        new URL(attachment.url)
      } catch {
        throw new Error(`Attachment ${index + 1} has invalid URL format`)
      }
    })

    // Validate total attachment size
    const totalSize = attachments.reduce((sum, att) => sum + att.size, 0)
    if (totalSize > 500 * 1024 * 1024) { // 500MB total
      throw new Error('Total attachment size cannot exceed 500MB')
    }
  }

  /**
   * Validate mentions
   */
  private validateMentions(mentions: string[]): void {
    if (!mentions || mentions.length === 0) return

    // Check for duplicate mentions
    const uniqueMentions = new Set(mentions)
    if (uniqueMentions.size !== mentions.length) {
      throw new Error('Duplicate mentions are not allowed')
    }

    // Validate mention format (assuming they are user IDs)
    mentions.forEach((mention, index) => {
      if (mention.length > 100) {
        throw new Error(`Mention ${index + 1} has invalid format`)
      }
    })
  }

  /**
   * Validate schedule message rate limiting
   */
  private validateScheduleMessageRateLimit(req: Request): void {
    const maxSchedulesPerHour = 50
    const windowMs = 60 * 60 * 1000 // 1 hour
    
    this.validateRateLimit(req, maxSchedulesPerHour, windowMs)
  }

  /**
   * Validate bulk operation rate limiting
   */
  private validateBulkOperationRateLimit(req: Request, operationCount: number): void {
    const maxBulkOperationsPerHour = 10
    const windowMs = 60 * 60 * 1000 // 1 hour
    
    this.validateRateLimit(req, maxBulkOperationsPerHour, windowMs)

    // Additional validation for large operations
    if (operationCount > 25) {
      const maxLargeBulkOperationsPerDay = 3
      const dayWindowMs = 24 * 60 * 60 * 1000 // 24 hours
      this.validateRateLimit(req, maxLargeBulkOperationsPerDay, dayWindowMs)
    }
  }

  /**
   * Validate scheduled message permissions
   */
  validateScheduledMessagePermissions = (req: Request, res: Response, next: NextFunction) => {
    try {
      // This would validate:
      // 1. User has permission to schedule messages
      // 2. User is a participant in the conversation
      // 3. Conversation allows scheduled messages
      // 4. User hasn't exceeded scheduling limits
      
      const userId = req.user?.id
      if (!userId) {
        throw new Error('User authentication required for scheduled message operations')
      }

      // Placeholder - would integrate with conversation service
      this.logValidation('scheduledMessagePermissions', userId)

      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate scheduled message limits
   */
  validateScheduledMessageLimits = (req: Request, res: Response, next: NextFunction) => {
    try {
      // This would validate:
      // 1. User hasn't exceeded daily/weekly scheduling limits
      // 2. Total pending scheduled messages limit
      // 3. Per-conversation scheduling limits
      
      const userId = req.user?.id
      if (!userId) {
        throw new Error('User authentication required')
      }

      // Placeholder - would integrate with scheduled message service
      this.logValidation('scheduledMessageLimits', userId)

      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Create comprehensive validation middleware for scheduled message endpoints
   */
  createScheduledMessageValidation = (validationType: 'schedule' | 'update' | 'cancel' | 'admin' | 'bulk') => {
    const validators = [this.validateScheduledMessagePermissions, this.validateScheduledMessageLimits]

    switch (validationType) {
      case 'schedule':
        validators.push(this.validateScheduleMessage)
        break
      case 'update':
        validators.push(this.validateUpdateScheduledMessage)
        break
      case 'cancel':
        validators.push(this.validateCancelScheduledMessage)
        break
      case 'admin':
        validators.push(this.validateGetAllScheduledMessages)
        break
      case 'bulk':
        validators.push(this.validateBulkCancelScheduledMessages)
        break
    }

    return this.chainValidators(...validators)
  }
}

// Export singleton instance
export const scheduledMessageValidator = new ScheduledMessageValidator()
