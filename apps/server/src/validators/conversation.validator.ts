import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { BaseValidator } from './base.validator'

/**
 * Conversation Validator
 * Validates all conversation-related requests with comprehensive business logic
 */
export class ConversationValidator extends BaseValidator {
  /**
   * Validate create conversation request
   */
  validateCreateConversation = (req: Request, res: Response, next: NextFunction) => {
    try {
      const bodySchema = z.object({
        participants: z.array(z.string().min(1, 'Participant ID cannot be empty'))
          .min(2, 'At least 2 participants are required')
          .max(100, 'Cannot have more than 100 participants')
          .refine(participants => {
            // Check for duplicates
            const uniqueParticipants = new Set(participants)
            return uniqueParticipants.size === participants.length
          }, {
            message: 'Duplicate participants are not allowed'
          })
          .refine(participants => {
            // Ensure current user is included
            return participants.includes(req.user?.id || '')
          }, {
            message: 'Current user must be included in participants'
          }),
        type: z.enum(['DIRECT', 'GROUP']).optional()
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Auto-determine conversation type if not provided
      if (!body.type) {
        body.type = body.participants.length === 2 ? 'DIRECT' : 'GROUP'
      }

      // Validate conversation type consistency
      if (body.type === 'DIRECT' && body.participants.length !== 2) {
        throw new Error('Direct conversations must have exactly 2 participants')
      }

      if (body.type === 'GROUP' && body.participants.length < 3) {
        throw new Error('Group conversations must have at least 3 participants')
      }

      this.logValidation('createConversation', req.user?.id, { 
        participantCount: body.participants.length,
        type: body.type
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get conversation request
   */
  validateGetConversation = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
          .min(1, 'Conversation ID is required')
          .max(100, 'Invalid conversation ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      this.logValidation('getConversation', req.user?.id, { 
        conversationId: params.id
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get user conversations request
   */
  validateGetUserConversations = (req: Request, res: Response, next: NextFunction) => {
    try {
      const querySchema = z.object({
        limit: z.coerce.number()
          .min(1, 'Limit must be at least 1')
          .max(100, 'Limit cannot exceed 100')
          .default(20),
        skip: z.coerce.number()
          .min(0, 'Skip cannot be negative')
          .default(0)
      })

      const query = this.validateData(querySchema as any, req.query, 'query parameters') as any

      this.logValidation('getUserConversations', req.user?.id, { 
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
   * Validate get conversation messages request
   */
  validateGetConversationMessages = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
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
          .optional()
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')
      const query = this.validateData(querySchema as any, req.query, 'query parameters') as any

      // Validate date range if before is provided
      if (query.before) {
        const beforeDate = new Date(query.before)
        const now = new Date()
        
        if (beforeDate > now) {
          throw new Error('Before date cannot be in the future')
        }

        // Limit how far back messages can be retrieved (e.g., 1 year)
        const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
        if (beforeDate < oneYearAgo) {
          throw new Error('Cannot retrieve messages older than 1 year')
        }
      }

      this.logValidation('getConversationMessages', req.user?.id, { 
        conversationId: params.id,
        limit: query.limit,
        before: query.before
      })

      req.params = params
      req.query = query
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate update conversation request
   */
  validateUpdateConversation = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
          .min(1, 'Conversation ID is required')
          .max(100, 'Invalid conversation ID format')
      })

      const bodySchema = z.object({
        name: z.string()
          .min(1, 'Name cannot be empty')
          .max(100, 'Name cannot exceed 100 characters')
          .regex(/^[a-zA-Z0-9\s\-_.,!?()]+$/, 'Name contains invalid characters')
          .optional(),
        description: z.string()
          .max(500, 'Description cannot exceed 500 characters')
          .optional(),
        avatar: z.string()
          .url('Invalid avatar URL')
          .max(2000, 'Avatar URL too long')
          .optional(),
        settings: z.record(z.any())
          .optional()
          .refine(data => {
            if (data && Object.keys(data).length > 50) {
              throw new Error('Settings cannot have more than 50 properties')
            }
            return true
          }, {
            message: 'Settings too large'
          })
      }).refine(data => Object.keys(data).length > 0, {
        message: 'At least one field must be provided for update'
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')
      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Validate avatar URL if provided
      if (body.avatar) {
        this.validateImageUrl(body.avatar)
      }

      // Validate settings size
      if (body.settings) {
        const settingsString = JSON.stringify(body.settings)
        if (settingsString.length > 10000) { // 10KB limit
          throw new Error('Settings size cannot exceed 10KB')
        }
      }

      this.logValidation('updateConversation', req.user?.id, { 
        conversationId: params.id,
        updates: Object.keys(body)
      })

      req.params = params
      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate add participant request
   */
  validateAddParticipant = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
          .min(1, 'Conversation ID is required')
          .max(100, 'Invalid conversation ID format')
      })

      const bodySchema = z.object({
        participantId: z.string()
          .min(1, 'Participant ID is required')
          .max(100, 'Invalid participant ID format')
          .refine(val => val !== req.user?.id, {
            message: 'Cannot add yourself as participant'
          })
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')
      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      this.logValidation('addParticipant', req.user?.id, { 
        conversationId: params.id,
        participantId: body.participantId
      })

      req.params = params
      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate remove participant request
   */
  validateRemoveParticipant = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
          .min(1, 'Conversation ID is required')
          .max(100, 'Invalid conversation ID format'),
        participantId: z.string()
          .min(1, 'Participant ID is required')
          .max(100, 'Invalid participant ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      this.logValidation('removeParticipant', req.user?.id, { 
        conversationId: params.id,
        participantId: params.participantId
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate search conversations request
   */
  validateSearchConversations = (req: Request, res: Response, next: NextFunction) => {
    try {
      const querySchema = z.object({
        query: z.string()
          .min(1, 'Search query is required')
          .max(100, 'Search query too long')
          .regex(/^[a-zA-Z0-9\s\-_.,!?()]+$/, 'Search query contains invalid characters'),
        limit: z.coerce.number()
          .min(1, 'Limit must be at least 1')
          .max(50, 'Limit cannot exceed 50')
          .default(10)
      })

      const query = this.validateData(querySchema as any, req.query, 'query parameters') as any

      // Rate limiting for search to prevent abuse
      this.validateSearchRateLimit(req)

      this.logValidation('searchConversations', req.user?.id, { 
        searchQuery: query.query,
        limit: query.limit
      })

      req.query = query
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate conversation action requests (archive, pin, mute, etc.)
   */
  validateConversationAction = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
          .min(1, 'Conversation ID is required')
          .max(100, 'Invalid conversation ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      // Extract action from path
      const action = this.extractConversationAction(req.path)
      
      // Validate action-specific requirements
      if (action === 'mute') {
        const bodySchema = z.object({
          duration: z.enum(['1h', '8h', '24h', '7d', 'forever']).default('forever')
        })

        let body = this.sanitizeObject(req.body)
        body = this.validateData(bodySchema, body, 'request body')
        req.body = body
      }

      this.logValidation('conversationAction', req.user?.id, { 
        conversationId: params.id,
        action
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Extract conversation action from request path
   */
  private extractConversationAction(path: string): string {
    if (path.includes('/archive')) return 'archive'
    if (path.includes('/unarchive')) return 'unarchive'
    if (path.includes('/pin')) return 'pin'
    if (path.includes('/unpin')) return 'unpin'
    if (path.includes('/mute')) return 'mute'
    if (path.includes('/unmute')) return 'unmute'
    if (path.includes('/leave')) return 'leave'
    if (path.includes('/read')) return 'read'
    return 'unknown'
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
   * Validate search rate limiting
   */
  private validateSearchRateLimit(req: Request): void {
    // Rate limiting for search to prevent abuse
    const maxSearchesPerMinute = 20
    const windowMs = 60 * 1000 // 1 minute
    
    this.validateRateLimit(req, maxSearchesPerMinute, windowMs)
  }

  /**
   * Validate conversation permissions
   */
  validateConversationPermissions = (req: Request, res: Response, next: NextFunction) => {
    try {
      // This would validate:
      // 1. User is a participant in the conversation
      // 2. User has permission to perform the action
      // 3. Conversation is not archived/deleted
      // 4. User is not blocked by other participants
      
      const userId = req.user?.id
      if (!userId) {
        throw new Error('User authentication required')
      }

      // Placeholder - would integrate with conversation service
      this.logValidation('conversationPermissions', userId)

      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate conversation size limits
   */
  validateConversationLimits = (req: Request, res: Response, next: NextFunction) => {
    try {
      // This would validate:
      // 1. User hasn't exceeded max conversations limit
      // 2. Group size limits
      // 3. Message history limits
      
      const userId = req.user?.id
      if (!userId) {
        throw new Error('User authentication required')
      }

      // Placeholder - would integrate with conversation service
      this.logValidation('conversationLimits', userId)

      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Create comprehensive validation middleware for conversation endpoints
   */
  createConversationValidation = (validationType: 'create' | 'update' | 'participants' | 'messages' | 'actions') => {
    const validators = [this.validateConversationPermissions, this.validateConversationLimits]

    switch (validationType) {
      case 'create':
        validators.push(this.validateCreateConversation)
        break
      case 'update':
        validators.push(this.validateUpdateConversation)
        break
      case 'participants':
        validators.push(this.validateAddParticipant)
        break
      case 'messages':
        validators.push(this.validateGetConversationMessages)
        break
      case 'actions':
        validators.push(this.validateConversationAction)
        break
    }

    return this.chainValidators(...validators)
  }
}

// Export singleton instance
export const conversationValidator = new ConversationValidator()
