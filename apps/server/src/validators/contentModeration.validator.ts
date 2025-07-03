import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { BaseValidator } from './base.validator'

/**
 * Content Moderation Validator
 * Validates all content moderation requests with comprehensive security and business logic
 */
export class ContentModerationValidator extends BaseValidator {
  /**
   * Validate moderate message request (Moderator only)
   */
  validateModerateMessage = (req: Request, res: Response, next: NextFunction) => {
    try {
      this.validateModerator(req)

      const bodySchema = z.object({
        messageId: z.string()
          .min(1, 'Message ID is required')
          .max(100, 'Invalid message ID format'),
        content: z.string()
          .min(1, 'Content is required')
          .max(10000, 'Content too long for moderation'),
        senderId: z.string()
          .min(1, 'Sender ID is required')
          .max(100, 'Invalid sender ID format'),
        conversationId: z.string()
          .min(1, 'Conversation ID is required')
          .max(100, 'Invalid conversation ID format')
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Additional content validation
      this.validateContentForModeration(body.content)

      this.logValidation('moderateMessage', req.user?.id, { 
        messageId: body.messageId,
        senderId: body.senderId,
        contentLength: body.content.length
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate report user request
   */
  validateReportUser = (req: Request, res: Response, next: NextFunction) => {
    try {
      const bodySchema = z.object({
        reportedUserId: z.string()
          .min(1, 'Reported user ID is required')
          .max(100, 'Invalid user ID format')
          .refine(val => val !== req.user?.id, {
            message: 'Cannot report yourself'
          }),
        messageId: z.string()
          .max(100, 'Invalid message ID format')
          .optional(),
        conversationId: z.string()
          .max(100, 'Invalid conversation ID format')
          .optional(),
        reason: z.string()
          .min(1, 'Reason is required')
          .max(200, 'Reason too long'),
        category: z.enum(['spam', 'harassment', 'inappropriate_content', 'fake_account', 'other'], {
          errorMap: () => ({ message: 'Invalid report category' })
        }),
        description: z.string()
          .min(10, 'Description must be at least 10 characters')
          .max(1000, 'Description cannot exceed 1000 characters')
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Rate limiting for reports to prevent spam
      this.validateReportRateLimit(req)

      // Validate report content
      this.validateReportContent(body.description, body.reason)

      this.logValidation('reportUser', req.user?.id, { 
        reportedUserId: body.reportedUserId,
        category: body.category,
        hasMessage: !!body.messageId
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get user moderation status request
   */
  validateGetUserModerationStatus = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        userId: z.string()
          .min(1, 'User ID is required')
          .max(100, 'Invalid user ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      // Users can only view their own status unless they're moderator/admin
      if (req.user?.id !== params.userId) {
        this.validateModerator(req)
      }

      this.logValidation('getUserModerationStatus', req.user?.id, { 
        targetUserId: params.userId
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get moderation reports request (Moderator only)
   */
  validateGetModerationReports = (req: Request, res: Response, next: NextFunction) => {
    try {
      this.validateModerator(req)

      const querySchema = z.object({
        status: z.enum(['pending', 'reviewed', 'resolved', 'dismissed']).optional(),
        category: z.enum(['spam', 'harassment', 'inappropriate_content', 'fake_account', 'other']).optional(),
        reporterId: z.string().max(100).optional(),
        reportedUserId: z.string().max(100).optional(),
        limit: z.coerce.number()
          .min(1, 'Limit must be at least 1')
          .max(100, 'Limit cannot exceed 100')
          .default(20),
        offset: z.coerce.number()
          .min(0, 'Offset cannot be negative')
          .default(0)
      })

      const query = this.validateData(querySchema as any, req.query, 'query parameters') as any

      this.logValidation('getModerationReports', req.user?.id, { 
        filters: {
          status: query.status,
          category: query.category
        },
        pagination: {
          limit: query.limit,
          offset: query.offset
        }
      })

      req.query = query
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate review report request (Moderator only)
   */
  validateReviewReport = (req: Request, res: Response, next: NextFunction) => {
    try {
      this.validateModerator(req)

      const paramsSchema = z.object({
        reportId: z.string()
          .min(1, 'Report ID is required')
          .max(100, 'Invalid report ID format')
      })

      const bodySchema = z.object({
        status: z.enum(['reviewed', 'resolved', 'dismissed'], {
          errorMap: () => ({ message: 'Status must be reviewed, resolved, or dismissed' })
        }),
        action: z.enum(['none', 'warn', 'mute', 'ban']).optional(),
        notes: z.string()
          .max(1000, 'Notes cannot exceed 1000 characters')
          .optional(),
        actionDuration: z.number()
          .positive('Duration must be positive')
          .max(525600, 'Duration cannot exceed 1 year (525600 minutes)')
          .optional()
      }).refine(data => {
        // If action is mute, duration is required
        if (data.action === 'mute' && !data.actionDuration) {
          throw new Error('Duration is required for mute action')
        }
        // If action is none, duration should not be provided
        if (data.action === 'none' && data.actionDuration) {
          throw new Error('Duration should not be provided for no action')
        }
        return true
      }, {
        message: 'Invalid action and duration combination'
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')
      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Validate moderation action permissions
      this.validateModerationActionPermissions(req, body.action)

      this.logValidation('reviewReport', req.user?.id, { 
        reportId: params.reportId,
        status: body.status,
        action: body.action
      })

      req.params = params
      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate manual moderation action request (Moderator only)
   */
  validateManualModerationAction = (req: Request, res: Response, next: NextFunction) => {
    try {
      this.validateModerator(req)

      const bodySchema = z.object({
        targetUserId: z.string()
          .min(1, 'Target user ID is required')
          .max(100, 'Invalid user ID format')
          .refine(val => val !== req.user?.id, {
            message: 'Cannot perform moderation action on yourself'
          }),
        action: z.enum(['warn', 'mute', 'ban', 'unban', 'unmute'], {
          errorMap: () => ({ message: 'Invalid moderation action' })
        }),
        reason: z.string()
          .min(1, 'Reason is required')
          .max(500, 'Reason cannot exceed 500 characters'),
        duration: z.number()
          .positive('Duration must be positive')
          .max(525600, 'Duration cannot exceed 1 year (525600 minutes)')
          .optional(),
        messageId: z.string()
          .max(100, 'Invalid message ID format')
          .optional()
      }).refine(data => {
        // Mute action requires duration
        if (data.action === 'mute' && !data.duration) {
          throw new Error('Duration is required for mute action')
        }
        // Unban and unmute should not have duration
        if (['unban', 'unmute'].includes(data.action) && data.duration) {
          throw new Error('Duration should not be provided for unban/unmute actions')
        }
        return true
      }, {
        message: 'Invalid action and duration combination'
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Validate moderation action permissions
      this.validateModerationActionPermissions(req, body.action)

      // Validate target user permissions
      this.validateTargetUserPermissions(req, body.targetUserId)

      this.logValidation('manualModerationAction', req.user?.id, { 
        targetUserId: body.targetUserId,
        action: body.action,
        duration: body.duration
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate create moderation rule request (Admin only)
   */
  validateCreateModerationRule = (req: Request, res: Response, next: NextFunction) => {
    try {
      this.validateAdmin(req)

      const bodySchema = z.object({
        type: z.enum(['profanity', 'spam', 'harassment', 'inappropriate_content', 'custom'], {
          errorMap: () => ({ message: 'Invalid rule type' })
        }),
        pattern: z.string()
          .min(1, 'Pattern is required')
          .max(500, 'Pattern too long')
          .refine(val => {
            // Validate regex pattern
            try {
              new RegExp(val)
              return true
            } catch {
              return false
            }
          }, {
            message: 'Invalid regex pattern'
          }),
        severity: z.enum(['low', 'medium', 'high', 'critical'], {
          errorMap: () => ({ message: 'Invalid severity level' })
        }),
        action: z.enum(['warn', 'delete', 'mute', 'ban', 'review'], {
          errorMap: () => ({ message: 'Invalid action type' })
        }),
        enabled: z.boolean().default(true),
        description: z.string()
          .max(1000, 'Description cannot exceed 1000 characters')
          .optional()
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Validate rule pattern safety
      this.validateRulePatternSafety(body.pattern, body.type)

      this.logValidation('createModerationRule', req.user?.id, { 
        type: body.type,
        severity: body.severity,
        action: body.action
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate update moderation rule request (Admin only)
   */
  validateUpdateModerationRule = (req: Request, res: Response, next: NextFunction) => {
    try {
      this.validateAdmin(req)

      const paramsSchema = z.object({
        ruleId: z.string()
          .min(1, 'Rule ID is required')
          .max(100, 'Invalid rule ID format')
      })

      const bodySchema = z.object({
        pattern: z.string()
          .min(1, 'Pattern cannot be empty')
          .max(500, 'Pattern too long')
          .refine(val => {
            try {
              new RegExp(val)
              return true
            } catch {
              return false
            }
          }, {
            message: 'Invalid regex pattern'
          })
          .optional(),
        severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        action: z.enum(['warn', 'delete', 'mute', 'ban', 'review']).optional(),
        enabled: z.boolean().optional(),
        description: z.string()
          .max(1000, 'Description cannot exceed 1000 characters')
          .optional()
      }).refine(data => Object.keys(data).length > 0, {
        message: 'At least one field must be provided for update'
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')
      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Validate rule pattern safety if provided
      if (body.pattern) {
        this.validateRulePatternSafety(body.pattern, 'custom')
      }

      this.logValidation('updateModerationRule', req.user?.id, { 
        ruleId: params.ruleId,
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
   * Validate bulk moderation actions request (Admin only)
   */
  validateBulkModerationActions = (req: Request, res: Response, next: NextFunction) => {
    try {
      this.validateAdmin(req)

      const bodySchema = z.object({
        action: z.enum(['cleanup_old_reports', 'bulk_unmute', 'bulk_unban', 'export_reports'], {
          errorMap: () => ({ message: 'Invalid bulk action' })
        }),
        filters: z.object({
          olderThanDays: z.number()
            .positive('Days must be positive')
            .max(365, 'Cannot exceed 1 year')
            .optional(),
          status: z.array(z.string())
            .max(10, 'Too many status filters')
            .optional(),
          category: z.array(z.string())
            .max(10, 'Too many category filters')
            .optional()
        }).optional()
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Validate bulk action requirements
      this.validateBulkActionRequirements(body.action, body.filters)

      this.logValidation('bulkModerationActions', req.user?.id, { 
        action: body.action,
        filters: body.filters
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate content for moderation
   */
  private validateContentForModeration(content: string): void {
    // Check for extremely long content that might cause performance issues
    if (content.length > 10000) {
      throw new Error('Content too long for moderation processing')
    }

    // Check for suspicious patterns that might indicate malicious content
    const suspiciousPatterns = [
      /<script/i,
      /javascript:/i,
      /data:text\/html/i,
      /vbscript:/i
    ]

    if (suspiciousPatterns.some(pattern => pattern.test(content))) {
      throw new Error('Content contains potentially malicious patterns')
    }
  }

  /**
   * Validate report content
   */
  private validateReportContent(description: string, reason: string): void {
    // Check for spam reports (repeated content)
    if (description.toLowerCase() === reason.toLowerCase()) {
      throw new Error('Description and reason cannot be identical')
    }

    // Check for minimum meaningful content
    const words = description.trim().split(/\s+/)
    if (words.length < 3) {
      throw new Error('Description must contain at least 3 words')
    }

    // Check for profanity in reports (ironic but necessary)
    const profanityPatterns = [
      /f[u*]ck/i,
      /sh[i*]t/i,
      /d[a*]mn/i
    ]

    if (profanityPatterns.some(pattern => pattern.test(description))) {
      throw new Error('Please use appropriate language in your report')
    }
  }

  /**
   * Validate report rate limiting
   */
  private validateReportRateLimit(req: Request): void {
    // Rate limiting for reports to prevent spam
    const maxReportsPerHour = 10
    const maxReportsPerDay = 50
    const windowMs = 60 * 60 * 1000 // 1 hour
    
    this.validateRateLimit(req, maxReportsPerHour, windowMs)
  }

  /**
   * Validate moderation action permissions
   */
  private validateModerationActionPermissions(req: Request, action?: string): void {
    if (!action) return

    const userRole = req.user?.role
    const userPermissions = req.user?.permissions || []

    // Ban actions require admin privileges
    if (['ban', 'unban'].includes(action) && userRole !== 'admin') {
      throw new Error('Only administrators can perform ban actions')
    }

    // Check specific permissions
    const requiredPermissions: Record<string, string> = {
      'warn': 'moderate_users',
      'mute': 'moderate_users',
      'unmute': 'moderate_users',
      'ban': 'ban_users',
      'unban': 'ban_users'
    }

    const requiredPermission = requiredPermissions[action]
    if (requiredPermission && !userPermissions.includes(requiredPermission)) {
      throw new Error(`Insufficient permissions for ${action} action`)
    }
  }

  /**
   * Validate target user permissions
   */
  private validateTargetUserPermissions(req: Request, targetUserId: string): void {
    // Prevent moderators from acting on other moderators/admins
    // This would typically check the target user's role from the database
    // For now, just a placeholder validation
    
    if (targetUserId === req.user?.id) {
      throw new Error('Cannot perform moderation actions on yourself')
    }

    // Additional checks would be implemented here:
    // 1. Check if target user is admin/moderator
    // 2. Check if current user has higher privileges
    // 3. Check if target user is already banned/muted
  }

  /**
   * Validate rule pattern safety
   */
  private validateRulePatternSafety(pattern: string, type: string): void {
    // Check for potentially dangerous regex patterns
    const dangerousPatterns = [
      /\(\?\=/,  // Positive lookahead
      /\(\?\!/,  // Negative lookahead
      /\(\?\<=/,  // Positive lookbehind
      /\(\?\<!/,  // Negative lookbehind
      /\{[0-9]+,\}/,  // Large quantifiers
      /\*\+/,    // Catastrophic backtracking
      /\+\*/     // Catastrophic backtracking
    ]

    if (dangerousPatterns.some(dangerous => dangerous.test(pattern))) {
      throw new Error('Pattern contains potentially dangerous regex constructs')
    }

    // Check pattern length
    if (pattern.length > 500) {
      throw new Error('Pattern too long - may cause performance issues')
    }

    // Test pattern compilation
    try {
      const regex = new RegExp(pattern, 'i')
      // Test with a sample string to ensure it doesn't hang
      const testString = 'test string for pattern validation'
      const startTime = Date.now()
      regex.test(testString)
      const endTime = Date.now()
      
      if (endTime - startTime > 100) { // 100ms threshold
        throw new Error('Pattern takes too long to execute')
      }
    } catch (error) {
      throw new Error('Invalid or unsafe regex pattern')
    }
  }

  /**
   * Validate bulk action requirements
   */
  private validateBulkActionRequirements(action: string, filters: any): void {
    switch (action) {
      case 'cleanup_old_reports':
        if (!filters?.olderThanDays) {
          throw new Error('Cleanup action requires olderThanDays filter')
        }
        if (filters.olderThanDays < 30) {
          throw new Error('Cleanup can only target reports older than 30 days')
        }
        break

      case 'bulk_unmute':
      case 'bulk_unban':
        // These actions might have specific requirements
        break

      case 'export_reports':
        // Export might have date range requirements
        break
    }
  }

  /**
   * Create comprehensive validation middleware for moderation endpoints
   */
  createModerationValidation = (validationType: 'report' | 'moderate' | 'admin' | 'review') => {
    const validators: Array<(req: Request, res: Response, next: NextFunction) => void> = []

    switch (validationType) {
      case 'report':
        validators.push(this.validateReportUser)
        break
      case 'moderate':
        validators.push(this.validateManualModerationAction)
        break
      case 'admin':
        validators.push(this.validateBulkModerationActions)
        break
      case 'review':
        validators.push(this.validateReviewReport)
        break
    }

    return this.chainValidators(...validators)
  }
}

// Export singleton instance
export const contentModerationValidator = new ContentModerationValidator()
