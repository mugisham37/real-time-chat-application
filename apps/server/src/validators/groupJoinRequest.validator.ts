import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { BaseValidator } from './base.validator'

/**
 * Group Join Request Validator
 * Validates all group join request operations with comprehensive business logic
 */
export class GroupJoinRequestValidator extends BaseValidator {
  /**
   * Validate create request
   */
  validateCreateRequest = (req: Request, res: Response, next: NextFunction) => {
    try {
      const bodySchema = z.object({
        groupId: z.string()
          .min(1, 'Group ID is required')
          .max(100, 'Invalid group ID format'),
        message: z.string()
          .max(500, 'Message cannot exceed 500 characters')
          .optional(),
        expiresInHours: z.number()
          .positive('Expiry hours must be positive')
          .max(8760, 'Expiry cannot exceed 1 year (8760 hours)')
          .optional()
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Validate expiry time constraints
      if (body.expiresInHours) {
        this.validateExpiryConstraints(body.expiresInHours)
      }

      // Rate limiting for join request creation
      this.validateJoinRequestCreationRateLimit(req)

      this.logValidation('createRequest', req.user?.id, {
        groupId: body.groupId,
        hasMessage: !!body.message,
        expiresInHours: body.expiresInHours
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get request
   */
  validateGetRequest = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
          .min(1, 'Request ID is required')
          .max(100, 'Invalid request ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      this.logValidation('getRequest', req.user?.id, { 
        requestId: params.id 
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get group pending requests
   */
  validateGetGroupPendingRequests = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        groupId: z.string()
          .min(1, 'Group ID is required')
          .max(100, 'Invalid group ID format')
      })

      const querySchema = z.object({
        limit: z.coerce.number()
          .min(1, 'Limit must be at least 1')
          .max(100, 'Limit cannot exceed 100')
          .default(20),
        skip: z.coerce.number()
          .min(0, 'Skip cannot be negative')
          .default(0),
        sortBy: z.enum(['createdAt', 'updatedAt']).default('createdAt'),
        sortOrder: z.enum(['asc', 'desc']).default('desc')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')
      const query = this.validateData(querySchema as any, req.query, 'query parameters') as any

      this.logValidation('getGroupPendingRequests', req.user?.id, { 
        groupId: params.groupId,
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
   * Validate get user pending requests
   */
  validateGetUserPendingRequests = (req: Request, res: Response, next: NextFunction) => {
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

      this.logValidation('getUserPendingRequests', req.user?.id, {
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
   * Validate approve request
   */
  validateApproveRequest = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
          .min(1, 'Request ID is required')
          .max(100, 'Invalid request ID format')
      })

      const bodySchema = z.object({
        welcomeMessage: z.string()
          .max(500, 'Welcome message cannot exceed 500 characters')
          .optional(),
        assignRole: z.enum(['MEMBER', 'MODERATOR']).default('MEMBER')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')
      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      this.logValidation('approveRequest', req.user?.id, { 
        requestId: params.id,
        assignRole: body.assignRole
      })

      req.params = params
      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate reject request
   */
  validateRejectRequest = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
          .min(1, 'Request ID is required')
          .max(100, 'Invalid request ID format')
      })

      const bodySchema = z.object({
        reason: z.string()
          .max(500, 'Rejection reason cannot exceed 500 characters')
          .optional()
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')
      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      this.logValidation('rejectRequest', req.user?.id, { 
        requestId: params.id,
        hasReason: !!body.reason
      })

      req.params = params
      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate cancel request
   */
  validateCancelRequest = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
          .min(1, 'Request ID is required')
          .max(100, 'Invalid request ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      this.logValidation('cancelRequest', req.user?.id, { 
        requestId: params.id 
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get group join request statistics
   */
  validateGetGroupJoinRequestStats = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        groupId: z.string()
          .min(1, 'Group ID is required')
          .max(100, 'Invalid group ID format')
      })

      const querySchema = z.object({
        period: z.enum(['day', 'week', 'month', 'year']).default('month')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')
      const query = this.validateData(querySchema as any, req.query, 'query parameters') as any

      this.logValidation('getGroupJoinRequestStats', req.user?.id, { 
        groupId: params.groupId,
        period: query.period
      })

      req.params = params
      req.query = query
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get user join request statistics
   */
  validateGetUserJoinRequestStats = (req: Request, res: Response, next: NextFunction) => {
    try {
      const querySchema = z.object({
        period: z.enum(['day', 'week', 'month', 'year']).default('month')
      })

      const query = this.validateData(querySchema as any, req.query, 'query parameters') as any

      this.logValidation('getUserJoinRequestStats', req.user?.id, {
        period: query.period
      })

      req.query = query
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate check pending request
   */
  validateCheckPendingRequest = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        groupId: z.string()
          .min(1, 'Group ID is required')
          .max(100, 'Invalid group ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      this.logValidation('checkPendingRequest', req.user?.id, { 
        groupId: params.groupId 
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get request by group and user
   */
  validateGetRequestByGroupAndUser = (req: Request, res: Response, next: NextFunction) => {
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

      this.logValidation('getRequestByGroupAndUser', req.user?.id, { 
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
   * Validate bulk approve requests
   */
  validateBulkApproveRequests = (req: Request, res: Response, next: NextFunction) => {
    try {
      const bodySchema = z.object({
        requestIds: z.array(z.string().min(1, 'Request ID cannot be empty'))
          .min(1, 'At least one request ID is required')
          .max(50, 'Cannot approve more than 50 requests at once')
          .refine(ids => {
            // Check for duplicates
            const uniqueIds = new Set(ids)
            return uniqueIds.size === ids.length
          }, {
            message: 'Duplicate request IDs are not allowed'
          }),
        welcomeMessage: z.string()
          .max(500, 'Welcome message cannot exceed 500 characters')
          .optional(),
        assignRole: z.enum(['MEMBER', 'MODERATOR']).default('MEMBER')
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Rate limiting for bulk operations
      this.validateBulkOperationRateLimit(req, body.requestIds.length)

      this.logValidation('bulkApproveRequests', req.user?.id, {
        requestCount: body.requestIds.length,
        assignRole: body.assignRole
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate bulk reject requests
   */
  validateBulkRejectRequests = (req: Request, res: Response, next: NextFunction) => {
    try {
      const bodySchema = z.object({
        requestIds: z.array(z.string().min(1, 'Request ID cannot be empty'))
          .min(1, 'At least one request ID is required')
          .max(50, 'Cannot reject more than 50 requests at once')
          .refine(ids => {
            // Check for duplicates
            const uniqueIds = new Set(ids)
            return uniqueIds.size === ids.length
          }, {
            message: 'Duplicate request IDs are not allowed'
          }),
        reason: z.string()
          .max(500, 'Rejection reason cannot exceed 500 characters')
          .optional()
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Rate limiting for bulk operations
      this.validateBulkOperationRateLimit(req, body.requestIds.length)

      this.logValidation('bulkRejectRequests', req.user?.id, {
        requestCount: body.requestIds.length,
        hasReason: !!body.reason
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate cleanup expired requests (Admin only)
   */
  validateCleanupExpiredRequests = (req: Request, res: Response, next: NextFunction) => {
    try {
      this.validateAdmin(req)

      const bodySchema = z.object({
        olderThanDays: z.number()
          .positive('Days must be positive')
          .min(7, 'Cannot cleanup requests newer than 7 days')
          .max(365, 'Cannot cleanup requests older than 1 year')
          .default(30)
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      this.logValidation('cleanupExpiredRequests', req.user?.id, {
        olderThanDays: body.olderThanDays
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get all requests (Admin only)
   */
  validateGetAllRequests = (req: Request, res: Response, next: NextFunction) => {
    try {
      this.validateAdmin(req)

      const querySchema = z.object({
        status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
        groupId: z.string()
          .max(100, 'Invalid group ID format')
          .optional(),
        userId: z.string()
          .max(100, 'Invalid user ID format')
          .optional(),
        limit: z.coerce.number()
          .min(1, 'Limit must be at least 1')
          .max(100, 'Limit cannot exceed 100')
          .default(20),
        skip: z.coerce.number()
          .min(0, 'Skip cannot be negative')
          .default(0),
        sortBy: z.enum(['createdAt', 'updatedAt']).default('createdAt'),
        sortOrder: z.enum(['asc', 'desc']).default('desc'),
        startDate: z.string()
          .datetime('Invalid start date format')
          .optional(),
        endDate: z.string()
          .datetime('Invalid end date format')
          .optional()
      }).refine(data => {
        if (data.startDate && data.endDate) {
          const start = new Date(data.startDate)
          const end = new Date(data.endDate)
          if (start >= end) {
            throw new Error('Start date must be before end date')
          }
          
          // Limit date range to 1 year
          const maxRange = 365 * 24 * 60 * 60 * 1000
          if (end.getTime() - start.getTime() > maxRange) {
            throw new Error('Date range cannot exceed 1 year')
          }
        }
        return true
      }, {
        message: 'Invalid date range'
      })

      const query = this.validateData(querySchema as any, req.query, 'query parameters') as any

      this.logValidation('getAllRequests', req.user?.id, { 
        filters: {
          status: query.status,
          groupId: query.groupId,
          userId: query.userId
        },
        pagination: {
          limit: query.limit,
          skip: query.skip
        }
      })

      req.query = query
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate update request message
   */
  validateUpdateRequestMessage = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
          .min(1, 'Request ID is required')
          .max(100, 'Invalid request ID format')
      })

      const bodySchema = z.object({
        message: z.string()
          .max(500, 'Message cannot exceed 500 characters')
          .optional()
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')
      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      this.logValidation('updateRequestMessage', req.user?.id, { 
        requestId: params.id 
      })

      req.params = params
      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get request activity
   */
  validateGetRequestActivity = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
          .min(1, 'Request ID is required')
          .max(100, 'Invalid request ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      this.logValidation('getRequestActivity', req.user?.id, { 
        requestId: params.id 
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
      throw new Error('Request expiry cannot be less than 1 hour')
    }

    // Maximum expiry of 1 year
    if (expiresInHours > 8760) {
      throw new Error('Request expiry cannot exceed 1 year')
    }

    // Recommended expiry ranges
    if (expiresInHours > 720) { // 30 days
      console.warn(`Long request expiry set: ${expiresInHours} hours`)
    }
  }

  /**
   * Validate join request creation rate limiting
   */
  private validateJoinRequestCreationRateLimit(req: Request): void {
    const maxRequestsPerDay = 10
    const windowMs = 24 * 60 * 60 * 1000 // 24 hours
    
    this.validateRateLimit(req, maxRequestsPerDay, windowMs)
  }

  /**
   * Validate bulk operation rate limiting
   */
  private validateBulkOperationRateLimit(req: Request, operationCount: number): void {
    const maxBulkOperationsPerHour = 3
    const windowMs = 60 * 60 * 1000 // 1 hour
    
    this.validateRateLimit(req, maxBulkOperationsPerHour, windowMs)

    // Additional validation for large operations
    if (operationCount > 20) {
      const maxLargeBulkOperationsPerDay = 1
      const dayWindowMs = 24 * 60 * 60 * 1000 // 24 hours
      this.validateRateLimit(req, maxLargeBulkOperationsPerDay, dayWindowMs)
    }
  }

  /**
   * Validate join request permissions
   */
  validateJoinRequestPermissions = (req: Request, res: Response, next: NextFunction) => {
    try {
      // This would validate:
      // 1. User is not already a member of the group
      // 2. Group allows join requests
      // 3. User hasn't been banned from the group
      // 4. User doesn't have a pending request already
      
      const userId = req.user?.id
      if (!userId) {
        throw new Error('User authentication required for join request operations')
      }

      // Placeholder - would integrate with group service
      this.logValidation('joinRequestPermissions', userId)

      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate join request limits
   */
  validateJoinRequestLimits = (req: Request, res: Response, next: NextFunction) => {
    try {
      // This would validate:
      // 1. User hasn't exceeded daily join request limits
      // 2. Group hasn't exceeded pending request limits
      // 3. User hasn't exceeded total pending requests across all groups
      
      const userId = req.user?.id
      if (!userId) {
        throw new Error('User authentication required')
      }

      // Placeholder - would integrate with join request service
      this.logValidation('joinRequestLimits', userId)

      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate group admin permissions for request management
   */
  validateGroupAdminPermissions = (req: Request, res: Response, next: NextFunction) => {
    try {
      // This would validate:
      // 1. User is admin/moderator of the group
      // 2. User has permission to approve/reject requests
      // 3. Group allows request management by this user
      
      const userId = req.user?.id
      if (!userId) {
        throw new Error('User authentication required for request management')
      }

      // Placeholder - would integrate with group service
      this.logValidation('groupAdminPermissions', userId)

      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Create comprehensive validation middleware for join request endpoints
   */
  createJoinRequestValidation = (validationType: 'create' | 'respond' | 'manage' | 'admin' | 'bulk') => {
    const validators = [this.validateJoinRequestPermissions, this.validateJoinRequestLimits]

    switch (validationType) {
      case 'create':
        validators.push(this.validateCreateRequest)
        break
      case 'respond':
        validators.push(this.validateGroupAdminPermissions, this.validateApproveRequest)
        break
      case 'manage':
        validators.push(this.validateUpdateRequestMessage)
        break
      case 'admin':
        validators.push(this.validateCleanupExpiredRequests)
        break
      case 'bulk':
        validators.push(this.validateGroupAdminPermissions, this.validateBulkApproveRequests)
        break
    }

    return this.chainValidators(...validators)
  }
}

// Export singleton instance
export const groupJoinRequestValidator = new GroupJoinRequestValidator()
