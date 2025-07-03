import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { BaseValidator } from './base.validator'

/**
 * Message Validator
 * Validates all message operations with comprehensive business logic and security
 */
export class MessageValidator extends BaseValidator {
  /**
   * Validate create message request
   */
  validateCreateMessage = (req: Request, res: Response, next: NextFunction) => {
    try {
      const bodySchema = z.object({
        conversationId: z.string()
          .min(1, 'Conversation ID is required')
          .max(100, 'Invalid conversation ID format'),
        content: z.string()
          .min(1, 'Message content is required')
          .max(10000, 'Message content cannot exceed 10,000 characters'),
        type: z.enum(['TEXT', 'IMAGE', 'FILE', 'AUDIO', 'VIDEO', 'SYSTEM']).default('TEXT'),
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
        replyTo: z.string()
          .max(100, 'Invalid reply message ID format')
          .optional(),
        metadata: z.record(z.any())
          .optional()
          .refine(data => {
            if (data && Object.keys(data).length > 20) {
              throw new Error('Metadata cannot have more than 20 properties')
            }
            return true
          }, {
            message: 'Metadata too large'
          })
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Additional validations
      this.validateMessageContent(body.content, body.type)
      this.validateAttachments(body.attachments, body.type)
      this.validateMentions(body.mentions)

      // Validate metadata size
      if (body.metadata) {
        const metadataString = JSON.stringify(body.metadata)
        if (metadataString.length > 5000) { // 5KB limit
          throw new Error('Metadata size cannot exceed 5KB')
        }
      }

      // Rate limiting for message creation
      this.validateMessageCreationRateLimit(req)

      this.logValidation('createMessage', req.user?.id, {
        conversationId: body.conversationId,
        type: body.type,
        contentLength: body.content.length,
        attachmentCount: body.attachments?.length || 0,
        mentionCount: body.mentions?.length || 0,
        isReply: !!body.replyTo
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get message request
   */
  validateGetMessage = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
          .min(1, 'Message ID is required')
          .max(100, 'Invalid message ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      this.logValidation('getMessage', req.user?.id, { 
        messageId: params.id 
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate update message request
   */
  validateUpdateMessage = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
          .min(1, 'Message ID is required')
          .max(100, 'Invalid message ID format')
      })

      const bodySchema = z.object({
        content: z.string()
          .min(1, 'Message content cannot be empty')
          .max(10000, 'Message content cannot exceed 10,000 characters')
          .optional(),
        attachments: z.array(z.object({
          url: z.string().url('Invalid attachment URL'),
          type: z.string().min(1, 'Attachment type is required'),
          name: z.string().min(1, 'Attachment name is required'),
          size: z.number().positive('Attachment size must be positive')
        })).max(10, 'Cannot have more than 10 attachments').optional(),
        metadata: z.record(z.any()).optional()
      }).refine(data => Object.keys(data).length > 0, {
        message: 'At least one field must be provided for update'
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')
      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Additional validations for updates
      if (body.content) {
        this.validateMessageContent(body.content, 'TEXT')
      }

      if (body.attachments) {
        this.validateAttachments(body.attachments, 'FILE')
      }

      this.logValidation('updateMessage', req.user?.id, {
        messageId: params.id,
        hasContent: !!body.content,
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
   * Validate delete message request
   */
  validateDeleteMessage = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
          .min(1, 'Message ID is required')
          .max(100, 'Invalid message ID format')
      })

      const querySchema = z.object({
        hard: z.coerce.boolean().default(false)
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')
      const query = this.validateData(querySchema as any, req.query, 'query parameters') as any

      this.logValidation('deleteMessage', req.user?.id, {
        messageId: params.id,
        hardDelete: query.hard
      })

      req.params = params
      req.query = query
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate add reaction request
   */
  validateAddReaction = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
          .min(1, 'Message ID is required')
          .max(100, 'Invalid message ID format')
      })

      const bodySchema = z.object({
        reactionType: z.string()
          .min(1, 'Reaction type is required')
          .max(50, 'Reaction type too long')
          .regex(/^[a-zA-Z0-9_+-]+$/, 'Reaction type contains invalid characters')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')
      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Validate reaction type against allowed reactions
      this.validateReactionType(body.reactionType)

      // Rate limiting for reactions
      this.validateReactionRateLimit(req)

      this.logValidation('addReaction', req.user?.id, {
        messageId: params.id,
        reactionType: body.reactionType
      })

      req.params = params
      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate remove reaction request
   */
  validateRemoveReaction = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
          .min(1, 'Message ID is required')
          .max(100, 'Invalid message ID format'),
        reactionType: z.string()
          .min(1, 'Reaction type is required')
          .max(50, 'Reaction type too long')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      this.logValidation('removeReaction', req.user?.id, {
        messageId: params.id,
        reactionType: params.reactionType
      })

      req.params = params
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
        id: z.string()
          .min(1, 'Message ID is required')
          .max(100, 'Invalid message ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      this.logValidation('markAsRead', req.user?.id, { 
        messageId: params.id 
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate search messages request
   */
  validateSearchMessages = (req: Request, res: Response, next: NextFunction) => {
    try {
      const querySchema = z.object({
        query: z.string()
          .min(1, 'Search query is required')
          .max(100, 'Search query too long')
          .regex(/^[a-zA-Z0-9\s\-_.,!?()'"]+$/, 'Search query contains invalid characters'),
        conversationId: z.string()
          .max(100, 'Invalid conversation ID format')
          .optional(),
        limit: z.coerce.number()
          .min(1, 'Limit must be at least 1')
          .max(100, 'Limit cannot exceed 100')
          .default(20),
        skip: z.coerce.number()
          .min(0, 'Skip cannot be negative')
          .default(0),
        startDate: z.string()
          .datetime('Invalid start date format')
          .optional(),
        endDate: z.string()
          .datetime('Invalid end date format')
          .optional(),
        messageType: z.enum(['TEXT', 'IMAGE', 'FILE', 'AUDIO', 'VIDEO', 'SYSTEM']).optional()
      }).refine(data => {
        if (data.startDate && data.endDate) {
          const start = new Date(data.startDate)
          const end = new Date(data.endDate)
          if (start >= end) {
            throw new Error('Start date must be before end date')
          }
          
          // Limit search range to 1 year
          const maxRange = 365 * 24 * 60 * 60 * 1000
          if (end.getTime() - start.getTime() > maxRange) {
            throw new Error('Search date range cannot exceed 1 year')
          }
        }
        return true
      }, {
        message: 'Invalid date range'
      })

      const query = this.validateData(querySchema as any, req.query, 'query parameters') as any

      // Rate limiting for search operations
      this.validateSearchRateLimit(req)

      this.logValidation('searchMessages', req.user?.id, {
        searchQuery: query.query,
        conversationId: query.conversationId,
        limit: query.limit,
        messageType: query.messageType
      })

      req.query = query
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get conversation message stats request
   */
  validateGetConversationMessageStats = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        conversationId: z.string()
          .min(1, 'Conversation ID is required')
          .max(100, 'Invalid conversation ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      this.logValidation('getConversationMessageStats', req.user?.id, { 
        conversationId: params.conversationId 
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get user message stats request
   */
  validateGetUserMessageStats = (req: Request, res: Response, next: NextFunction) => {
    try {
      const querySchema = z.object({
        period: z.enum(['day', 'week', 'month', 'year']).default('month')
      })

      const query = this.validateData(querySchema as any, req.query, 'query parameters') as any

      this.logValidation('getUserMessageStats', req.user?.id, {
        period: query.period
      })

      req.query = query
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get message thread request
   */
  validateGetMessageThread = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
          .min(1, 'Message ID is required')
          .max(100, 'Invalid message ID format')
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

      this.logValidation('getMessageThread', req.user?.id, { 
        messageId: params.id,
        limit: query.limit
      })

      req.params = params
      req.query = query
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get message reactions request
   */
  validateGetMessageReactions = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
          .min(1, 'Message ID is required')
          .max(100, 'Invalid message ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      this.logValidation('getMessageReactions', req.user?.id, { 
        messageId: params.id 
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get conversation messages request
   */
  validateGetConversationMessages = (req: Request, res: Response, next: NextFunction) => {
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
        before: z.string()
          .datetime('Invalid before date format')
          .optional(),
        after: z.string()
          .datetime('Invalid after date format')
          .optional(),
        messageType: z.enum(['TEXT', 'IMAGE', 'FILE', 'AUDIO', 'VIDEO', 'SYSTEM']).optional()
      }).refine(data => {
        if (data.before && data.after) {
          const before = new Date(data.before)
          const after = new Date(data.after)
          if (after >= before) {
            throw new Error('After date must be before the before date')
          }
        }
        return true
      }, {
        message: 'Invalid date range'
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')
      const query = this.validateData(querySchema as any, req.query, 'query parameters') as any

      this.logValidation('getConversationMessages', req.user?.id, {
        conversationId: params.conversationId,
        limit: query.limit,
        messageType: query.messageType
      })

      req.params = params
      req.query = query
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate toggle message pin request
   */
  validateToggleMessagePin = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
          .min(1, 'Message ID is required')
          .max(100, 'Invalid message ID format')
      })

      const bodySchema = z.object({
        pinned: z.boolean()
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')
      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      this.logValidation('toggleMessagePin', req.user?.id, {
        messageId: params.id,
        pinned: body.pinned
      })

      req.params = params
      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate report message request
   */
  validateReportMessage = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
          .min(1, 'Message ID is required')
          .max(100, 'Invalid message ID format')
      })

      const bodySchema = z.object({
        reason: z.string()
          .min(1, 'Report reason is required')
          .max(500, 'Reason cannot exceed 500 characters'),
        category: z.enum(['spam', 'harassment', 'inappropriate_content', 'violence', 'other'], {
          errorMap: () => ({ message: 'Invalid report category' })
        }),
        additionalInfo: z.string()
          .max(1000, 'Additional info cannot exceed 1000 characters')
          .optional()
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')
      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Rate limiting for reports
      this.validateReportRateLimit(req)

      this.logValidation('reportMessage', req.user?.id, {
        messageId: params.id,
        category: body.category
      })

      req.params = params
      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get message history request
   */
  validateGetMessageHistory = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
          .min(1, 'Message ID is required')
          .max(100, 'Invalid message ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      this.logValidation('getMessageHistory', req.user?.id, { 
        messageId: params.id 
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate bulk message operations request (Admin only)
   */
  validateBulkMessageOperations = (req: Request, res: Response, next: NextFunction) => {
    try {
      this.validateAdmin(req)

      const bodySchema = z.object({
        operation: z.enum(['delete', 'moderate', 'export'], {
          errorMap: () => ({ message: 'Invalid bulk operation' })
        }),
        messageIds: z.array(z.string().min(1, 'Message ID cannot be empty'))
          .min(1, 'At least one message ID is required')
          .max(100, 'Cannot process more than 100 messages at once')
          .refine(ids => {
            // Check for duplicates
            const uniqueIds = new Set(ids)
            return uniqueIds.size === ids.length
          }, {
            message: 'Duplicate message IDs are not allowed'
          }),
        options: z.object({
          hardDelete: z.boolean().default(false),
          reason: z.string().max(500).optional(),
          moderationAction: z.enum(['warn', 'delete', 'flag']).optional()
        }).optional()
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Rate limiting for bulk operations
      this.validateBulkOperationRateLimit(req, body.messageIds.length)

      this.logValidation('bulkMessageOperations', req.user?.id, {
        operation: body.operation,
        messageCount: body.messageIds.length
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
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
  private validateAttachments(attachments: any[] | undefined, messageType: string): void {
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
  private validateMentions(mentions: string[] | undefined): void {
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
   * Validate reaction type
   */
  private validateReactionType(reactionType: string): void {
    const allowedReactions = [
      'like', 'love', 'laugh', 'wow', 'sad', 'angry',
      'thumbs_up', 'thumbs_down', 'heart', 'fire',
      'clap', 'party', 'rocket', 'eyes'
    ]

    if (!allowedReactions.includes(reactionType.toLowerCase())) {
      throw new Error(`Reaction type '${reactionType}' is not allowed`)
    }
  }

  /**
   * Validate message creation rate limiting
   */
  private validateMessageCreationRateLimit(req: Request): void {
    const maxMessagesPerMinute = 30
    const windowMs = 60 * 1000 // 1 minute
    
    this.validateRateLimit(req, maxMessagesPerMinute, windowMs)
  }

  /**
   * Validate reaction rate limiting
   */
  private validateReactionRateLimit(req: Request): void {
    const maxReactionsPerMinute = 60
    const windowMs = 60 * 1000 // 1 minute
    
    this.validateRateLimit(req, maxReactionsPerMinute, windowMs)
  }

  /**
   * Validate search rate limiting
   */
  private validateSearchRateLimit(req: Request): void {
    const maxSearchesPerMinute = 20
    const windowMs = 60 * 1000 // 1 minute
    
    this.validateRateLimit(req, maxSearchesPerMinute, windowMs)
  }

  /**
   * Validate report rate limiting
   */
  private validateReportRateLimit(req: Request): void {
    const maxReportsPerHour = 10
    const windowMs = 60 * 60 * 1000 // 1 hour
    
    this.validateRateLimit(req, maxReportsPerHour, windowMs)
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
   * Validate message permissions
   */
  validateMessagePermissions = (req: Request, res: Response, next: NextFunction) => {
    try {
      // This would validate:
      // 1. User is a participant in the conversation
      // 2. User has permission to send messages
      // 3. Conversation is not archived/deleted
      // 4. User is not muted in the conversation
      
      const userId = req.user?.id
      if (!userId) {
        throw new Error('User authentication required for message operations')
      }

      // Placeholder - would integrate with conversation service
      this.logValidation('messagePermissions', userId)

      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate message limits
   */
  validateMessageLimits = (req: Request, res: Response, next: NextFunction) => {
    try {
      // This would validate:
      // 1. User hasn't exceeded daily message limits
      // 2. Conversation hasn't exceeded message limits
      // 3. User hasn't exceeded attachment size limits
      
      const userId = req.user?.id
      if (!userId) {
        throw new Error('User authentication required')
      }

      // Placeholder - would integrate with message service
      this.logValidation('messageLimits', userId)

      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Create comprehensive validation middleware for message endpoints
   */
  createMessageValidation = (validationType: 'create' | 'update' | 'react' | 'search' | 'admin') => {
    const validators = [this.validateMessagePermissions, this.validateMessageLimits]

    switch (validationType) {
      case 'create':
        validators.push(this.validateCreateMessage)
        break
      case 'update':
        validators.push(this.validateUpdateMessage)
        break
      case 'react':
        validators.push(this.validateAddReaction)
        break
      case 'search':
        validators.push(this.validateSearchMessages)
        break
      case 'admin':
        validators.push(this.validateBulkMessageOperations)
        break
    }

    return this.chainValidators(...validators)
  }
}

// Export singleton instance
export const messageValidator = new MessageValidator()
