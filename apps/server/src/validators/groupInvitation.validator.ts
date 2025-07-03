import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { BaseValidator } from './base.validator'

/**
 * Group Invitation Validator
 * Validates all group invitation requests with comprehensive business logic
 */
export class GroupInvitationValidator extends BaseValidator {
  /**
   * Validate create invitation request
   */
  validateCreateInvitation = (req: Request, res: Response, next: NextFunction) => {
    try {
      const bodySchema = z.object({
        groupId: z.string()
          .min(1, 'Group ID is required')
          .max(100, 'Invalid group ID format'),
        inviteeId: z.string()
          .min(1, 'Invitee ID is required')
          .max(100, 'Invalid invitee ID format')
          .refine(val => val !== req.user?.id, {
            message: 'Cannot invite yourself'
          }),
        expiresInHours: z.number()
          .positive('Expiry hours must be positive')
          .max(8760, 'Expiry cannot exceed 1 year (8760 hours)')
          .optional(),
        message: z.string()
          .max(500, 'Invitation message cannot exceed 500 characters')
          .optional()
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Validate expiry time constraints
      if (body.expiresInHours) {
        this.validateExpiryConstraints(body.expiresInHours)
      }

      // Rate limiting for invitation creation
      this.validateInvitationCreationRateLimit(req)

      this.logValidation('createInvitation', req.user?.id, {
        groupId: body.groupId,
        inviteeId: body.inviteeId,
        expiresInHours: body.expiresInHours
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get invitation request
   */
  validateGetInvitation = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
          .min(1, 'Invitation ID is required')
          .max(100, 'Invalid invitation ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      this.logValidation('getInvitation', req.user?.id, { 
        invitationId: params.id 
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get pending invitations request
   */
  validateGetPendingInvitations = (req: Request, res: Response, next: NextFunction) => {
    try {
      const querySchema = z.object({
        limit: z.coerce.number()
          .min(1, 'Limit must be at least 1')
          .max(100, 'Limit cannot exceed 100')
          .default(20),
        skip: z.coerce.number()
          .min(0, 'Skip cannot be negative')
          .default(0),
        groupId: z.string()
          .max(100, 'Invalid group ID format')
          .optional()
      })

      const query = this.validateData(querySchema as any, req.query, 'query parameters') as any

      this.logValidation('getPendingInvitations', req.user?.id, {
        limit: query.limit,
        groupId: query.groupId
      })

      req.query = query
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get group pending invitations request
   */
  validateGetGroupPendingInvitations = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        groupId: z.string()
          .min(1, 'Group ID is required')
          .max(100, 'Invalid group ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      this.logValidation('getGroupPendingInvitations', req.user?.id, { 
        groupId: params.groupId 
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate accept invitation request
   */
  validateAcceptInvitation = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
          .min(1, 'Invitation ID is required')
          .max(100, 'Invalid invitation ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      this.logValidation('acceptInvitation', req.user?.id, { 
        invitationId: params.id 
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate reject invitation request
   */
  validateRejectInvitation = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
          .min(1, 'Invitation ID is required')
          .max(100, 'Invalid invitation ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      this.logValidation('rejectInvitation', req.user?.id, { 
        invitationId: params.id 
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate cancel invitation request
   */
  validateCancelInvitation = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
          .min(1, 'Invitation ID is required')
          .max(100, 'Invalid invitation ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      this.logValidation('cancelInvitation', req.user?.id, { 
        invitationId: params.id 
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get group invitation statistics request
   */
  validateGetGroupInvitationStats = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        groupId: z.string()
          .min(1, 'Group ID is required')
          .max(100, 'Invalid group ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      this.logValidation('getGroupInvitationStats', req.user?.id, { 
        groupId: params.groupId 
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get user invitation statistics request
   */
  validateGetUserInvitationStats = (req: Request, res: Response, next: NextFunction) => {
    try {
      this.logValidation('getUserInvitationStats', req.user?.id)

      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate bulk invite users request
   */
  validateBulkInviteUsers = (req: Request, res: Response, next: NextFunction) => {
    try {
      const bodySchema = z.object({
        groupId: z.string()
          .min(1, 'Group ID is required')
          .max(100, 'Invalid group ID format'),
        inviteeIds: z.array(z.string().min(1, 'Invitee ID cannot be empty'))
          .min(1, 'At least one invitee ID is required')
          .max(50, 'Cannot invite more than 50 users at once')
          .refine(ids => {
            // Check for duplicates
            const uniqueIds = new Set(ids)
            return uniqueIds.size === ids.length
          }, {
            message: 'Duplicate invitee IDs are not allowed'
          })
          .refine(ids => {
            // Ensure current user is not in the list
            return !ids.includes(req.user?.id || '')
          }, {
            message: 'Cannot invite yourself'
          }),
        expiresInHours: z.number()
          .positive('Expiry hours must be positive')
          .max(8760, 'Expiry cannot exceed 1 year (8760 hours)')
          .optional(),
        message: z.string()
          .max(500, 'Invitation message cannot exceed 500 characters')
          .optional()
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Validate expiry time constraints
      if (body.expiresInHours) {
        this.validateExpiryConstraints(body.expiresInHours)
      }

      // Rate limiting for bulk invitations
      this.validateBulkInvitationRateLimit(req, body.inviteeIds.length)

      this.logValidation('bulkInviteUsers', req.user?.id, {
        groupId: body.groupId,
        inviteeCount: body.inviteeIds.length,
        expiresInHours: body.expiresInHours
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate check pending invitation request
   */
  validateCheckPendingInvitation = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        groupId: z.string()
          .min(1, 'Group ID is required')
          .max(100, 'Invalid group ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      this.logValidation('checkPendingInvitation', req.user?.id, { 
        groupId: params.groupId 
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get invitation by group and user request
   */
  validateGetInvitationByGroupAndUser = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        groupId: z.string()
          .min(1, 'Group ID is required')
          .max(100, 'Invalid group ID format'),
        userId: z.string()
          .min(1, 'User ID is required')
          .max(100, 'Invalid user ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      this.logValidation('getInvitationByGroupAndUser', req.user?.id, { 
        groupId: params.groupId,
        userId: params.userId 
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate cleanup expired invitations request (Admin only)
   */
  validateCleanupExpiredInvitations = (req: Request, res: Response, next: NextFunction) => {
    try {
      this.validateAdmin(req)

      this.logValidation('cleanupExpiredInvitations', req.user?.id)

      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get sent invitations request
   */
  validateGetSentInvitations = (req: Request, res: Response, next: NextFunction) => {
    try {
      const querySchema = z.object({
        status: z.enum(['PENDING', 'ACCEPTED', 'DECLINED']).optional(),
        limit: z.coerce.number()
          .min(1, 'Limit must be at least 1')
          .max(100, 'Limit cannot exceed 100')
          .default(20),
        skip: z.coerce.number()
          .min(0, 'Skip cannot be negative')
          .default(0),
        groupId: z.string()
          .max(100, 'Invalid group ID format')
          .optional()
      })

      const query = this.validateData(querySchema as any, req.query, 'query parameters') as any

      this.logValidation('getSentInvitations', req.user?.id, { 
        status: query.status,
        limit: query.limit,
        groupId: query.groupId
      })

      req.query = query
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate resend invitation request
   */
  validateResendInvitation = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
          .min(1, 'Invitation ID is required')
          .max(100, 'Invalid invitation ID format')
      })

      const bodySchema = z.object({
        expiresInHours: z.number()
          .positive('Expiry hours must be positive')
          .max(8760, 'Expiry cannot exceed 1 year (8760 hours)')
          .optional(),
        message: z.string()
          .max(500, 'Invitation message cannot exceed 500 characters')
          .optional()
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')
      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Validate expiry time constraints
      if (body.expiresInHours) {
        this.validateExpiryConstraints(body.expiresInHours)
      }

      // Rate limiting for resending invitations
      this.validateResendInvitationRateLimit(req)

      this.logValidation('resendInvitation', req.user?.id, { 
        invitationId: params.id,
        expiresInHours: body.expiresInHours 
      })

      req.params = params
      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate update invitation message request
   */
  validateUpdateInvitationMessage = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
          .min(1, 'Invitation ID is required')
          .max(100, 'Invalid invitation ID format')
      })

      const bodySchema = z.object({
        message: z.string()
          .max(500, 'Invitation message cannot exceed 500 characters')
          .optional()
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')
      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      this.logValidation('updateInvitationMessage', req.user?.id, { 
        invitationId: params.id 
      })

      req.params = params
      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get invitation activity request
   */
  validateGetInvitationActivity = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
          .min(1, 'Invitation ID is required')
          .max(100, 'Invalid invitation ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      this.logValidation('getInvitationActivity', req.user?.id, { 
        invitationId: params.id 
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate expiry constraints
   */
  private validateExpiryConstraints(expiresInHours: number): void {
    // Minimum expiry of 1 hour
    if (expiresInHours < 1) {
      throw new Error('Invitation expiry cannot be less than 1 hour')
    }

    // Maximum expiry of 1 year
    if (expiresInHours > 8760) {
      throw new Error('Invitation expiry cannot exceed 1 year')
    }

    // Recommended expiry ranges
    if (expiresInHours > 720) { // 30 days
      // Log warning for very long expiry times
      console.warn(`Long invitation expiry set: ${expiresInHours} hours`)
    }
  }

  /**
   * Validate invitation creation rate limiting
   */
  private validateInvitationCreationRateLimit(req: Request): void {
    const maxInvitationsPerHour = 20
    const windowMs = 60 * 60 * 1000 // 1 hour
    
    this.validateRateLimit(req, maxInvitationsPerHour, windowMs)
  }

  /**
   * Validate bulk invitation rate limiting
   */
  private validateBulkInvitationRateLimit(req: Request, inviteeCount: number): void {
    const maxBulkInvitationsPerDay = 5
    const windowMs = 24 * 60 * 60 * 1000 // 24 hours
    
    this.validateRateLimit(req, maxBulkInvitationsPerDay, windowMs)

    // Additional validation for large bulk operations
    if (inviteeCount > 20) {
      const maxLargeBulkInvitationsPerWeek = 2
      const weekWindowMs = 7 * 24 * 60 * 60 * 1000 // 1 week
      this.validateRateLimit(req, maxLargeBulkInvitationsPerWeek, weekWindowMs)
    }
  }

  /**
   * Validate resend invitation rate limiting
   */
  private validateResendInvitationRateLimit(req: Request): void {
    const maxResendsPerDay = 10
    const windowMs = 24 * 60 * 60 * 1000 // 24 hours
    
    this.validateRateLimit(req, maxResendsPerDay, windowMs)
  }

  /**
   * Validate invitation permissions
   */
  validateInvitationPermissions = (req: Request, res: Response, next: NextFunction) => {
    try {
      // This would validate:
      // 1. User has permission to invite to the group
      // 2. User is a member/admin of the group
      // 3. Group allows invitations
      // 4. Invitee is not already a member
      
      const userId = req.user?.id
      if (!userId) {
        throw new Error('User authentication required for invitation operations')
      }

      // Placeholder - would integrate with group service
      this.logValidation('invitationPermissions', userId)

      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate invitation limits
   */
  validateInvitationLimits = (req: Request, res: Response, next: NextFunction) => {
    try {
      // This would validate:
      // 1. User hasn't exceeded daily/weekly invitation limits
      // 2. Group hasn't exceeded member limits
      // 3. Invitee hasn't exceeded pending invitation limits
      
      const userId = req.user?.id
      if (!userId) {
        throw new Error('User authentication required')
      }

      // Placeholder - would integrate with invitation service
      this.logValidation('invitationLimits', userId)

      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Create comprehensive validation middleware for invitation endpoints
   */
  createInvitationValidation = (validationType: 'create' | 'respond' | 'manage' | 'admin' | 'bulk') => {
    const validators = [this.validateInvitationPermissions, this.validateInvitationLimits]

    switch (validationType) {
      case 'create':
        validators.push(this.validateCreateInvitation)
        break
      case 'respond':
        validators.push(this.validateAcceptInvitation)
        break
      case 'manage':
        validators.push(this.validateUpdateInvitationMessage)
        break
      case 'admin':
        validators.push(this.validateCleanupExpiredInvitations)
        break
      case 'bulk':
        validators.push(this.validateBulkInviteUsers)
        break
    }

    return this.chainValidators(...validators)
  }
}

// Export singleton instance
export const groupInvitationValidator = new GroupInvitationValidator()
