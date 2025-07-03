import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { BaseValidator } from './base.validator'

/**
 * Group Validator
 * Validates all group-related requests with comprehensive business logic
 */
export class GroupValidator extends BaseValidator {
  /**
   * Validate create group request
   */
  validateCreateGroup = (req: Request, res: Response, next: NextFunction) => {
    try {
      const bodySchema = z.object({
        name: z.string()
          .min(1, 'Group name is required')
          .max(100, 'Group name cannot exceed 100 characters')
          .regex(/^[a-zA-Z0-9\s\-_.,!?()]+$/, 'Group name contains invalid characters'),
        description: z.string()
          .max(500, 'Description cannot exceed 500 characters')
          .optional(),
        avatar: z.string()
          .url('Invalid avatar URL')
          .max(2000, 'Avatar URL too long')
          .optional(),
        memberIds: z.array(z.string().min(1, 'Member ID cannot be empty'))
          .max(1000, 'Cannot add more than 1000 members at once')
          .optional()
          .default([]),
        isPublic: z.boolean()
          .optional()
          .default(true),
        maxMembers: z.number()
          .positive('Max members must be positive')
          .max(10000, 'Max members cannot exceed 10000')
          .optional()
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Validate group name uniqueness (would integrate with service)
      this.validateGroupNameAvailability(body.name)

      // Validate avatar URL if provided
      if (body.avatar) {
        this.validateImageUrl(body.avatar)
      }

      // Validate member IDs if provided
      if (body.memberIds && body.memberIds.length > 0) {
        this.validateMemberIds(body.memberIds)
      }

      // Rate limiting for group creation
      this.validateGroupCreationRateLimit(req)

      this.logValidation('createGroup', req.user?.id, {
        groupName: body.name,
        memberCount: body.memberIds?.length || 0,
        isPublic: body.isPublic
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get group request
   */
  validateGetGroup = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
          .min(1, 'Group ID is required')
          .max(100, 'Invalid group ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      this.logValidation('getGroup', req.user?.id, { 
        groupId: params.id 
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get user groups request
   */
  validateGetUserGroups = (req: Request, res: Response, next: NextFunction) => {
    try {
      const querySchema = z.object({
        limit: z.coerce.number()
          .min(1, 'Limit must be at least 1')
          .max(100, 'Limit cannot exceed 100')
          .default(20),
        skip: z.coerce.number()
          .min(0, 'Skip cannot be negative')
          .default(0),
        type: z.enum(['all', 'owned', 'member']).default('all')
      })

      const query = this.validateData(querySchema as any, req.query, 'query parameters') as any

      this.logValidation('getUserGroups', req.user?.id, {
        limit: query.limit,
        skip: query.skip,
        type: query.type
      })

      req.query = query
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate update group request
   */
  validateUpdateGroup = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
          .min(1, 'Group ID is required')
          .max(100, 'Invalid group ID format')
      })

      const bodySchema = z.object({
        name: z.string()
          .min(1, 'Group name cannot be empty')
          .max(100, 'Group name cannot exceed 100 characters')
          .regex(/^[a-zA-Z0-9\s\-_.,!?()]+$/, 'Group name contains invalid characters')
          .optional(),
        description: z.string()
          .max(500, 'Description cannot exceed 500 characters')
          .optional(),
        avatar: z.string()
          .url('Invalid avatar URL')
          .max(2000, 'Avatar URL too long')
          .optional(),
        isPublic: z.boolean().optional(),
        maxMembers: z.number()
          .positive('Max members must be positive')
          .max(10000, 'Max members cannot exceed 10000')
          .optional()
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

      this.logValidation('updateGroup', req.user?.id, {
        groupId: params.id,
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
   * Validate join group request
   */
  validateJoinGroup = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
          .min(1, 'Group ID is required')
          .max(100, 'Invalid group ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      // Rate limiting for group joins
      this.validateGroupJoinRateLimit(req)

      this.logValidation('joinGroup', req.user?.id, { 
        groupId: params.id 
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate leave group request
   */
  validateLeaveGroup = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
          .min(1, 'Group ID is required')
          .max(100, 'Invalid group ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      this.logValidation('leaveGroup', req.user?.id, { 
        groupId: params.id 
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate add member request
   */
  validateAddMember = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
          .min(1, 'Group ID is required')
          .max(100, 'Invalid group ID format')
      })

      const bodySchema = z.object({
        memberId: z.string()
          .min(1, 'Member ID is required')
          .max(100, 'Invalid member ID format')
          .refine(val => val !== req.user?.id, {
            message: 'Cannot add yourself as a member'
          })
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')
      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      this.logValidation('addMember', req.user?.id, {
        groupId: params.id,
        memberId: body.memberId
      })

      req.params = params
      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate remove member request
   */
  validateRemoveMember = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
          .min(1, 'Group ID is required')
          .max(100, 'Invalid group ID format'),
        memberId: z.string()
          .min(1, 'Member ID is required')
          .max(100, 'Invalid member ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      this.logValidation('removeMember', req.user?.id, {
        groupId: params.id,
        memberId: params.memberId
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate update member role request
   */
  validateUpdateMemberRole = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
          .min(1, 'Group ID is required')
          .max(100, 'Invalid group ID format'),
        memberId: z.string()
          .min(1, 'Member ID is required')
          .max(100, 'Invalid member ID format')
      })

      const bodySchema = z.object({
        role: z.enum(['ADMIN', 'MODERATOR', 'MEMBER'], {
          errorMap: () => ({ message: 'Role must be ADMIN, MODERATOR, or MEMBER' })
        })
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')
      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Prevent users from changing their own role
      if (params.memberId === req.user?.id) {
        throw new Error('Cannot change your own role')
      }

      this.logValidation('updateMemberRole', req.user?.id, {
        groupId: params.id,
        memberId: params.memberId,
        newRole: body.role
      })

      req.params = params
      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate delete group request
   */
  validateDeleteGroup = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
          .min(1, 'Group ID is required')
          .max(100, 'Invalid group ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      this.logValidation('deleteGroup', req.user?.id, { 
        groupId: params.id 
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate search public groups request
   */
  validateSearchPublicGroups = (req: Request, res: Response, next: NextFunction) => {
    try {
      const querySchema = z.object({
        query: z.string()
          .min(1, 'Search query is required')
          .max(100, 'Search query too long')
          .regex(/^[a-zA-Z0-9\s\-_.,!?()]+$/, 'Search query contains invalid characters'),
        limit: z.coerce.number()
          .min(1, 'Limit must be at least 1')
          .max(50, 'Limit cannot exceed 50')
          .default(20),
        skip: z.coerce.number()
          .min(0, 'Skip cannot be negative')
          .default(0)
      })

      const query = this.validateData(querySchema as any, req.query, 'query parameters') as any

      // Rate limiting for search
      this.validateGroupSearchRateLimit(req)

      this.logValidation('searchPublicGroups', req.user?.id, {
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
   * Validate get group statistics request
   */
  validateGetGroupStats = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
          .min(1, 'Group ID is required')
          .max(100, 'Invalid group ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      this.logValidation('getGroupStats', req.user?.id, { 
        groupId: params.id 
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get popular groups request
   */
  validateGetPopularGroups = (req: Request, res: Response, next: NextFunction) => {
    try {
      const querySchema = z.object({
        limit: z.coerce.number()
          .min(1, 'Limit must be at least 1')
          .max(50, 'Limit cannot exceed 50')
          .default(10)
      })

      const query = this.validateData(querySchema as any, req.query, 'query parameters') as any

      this.logValidation('getPopularGroups', req.user?.id, { 
        limit: query.limit 
      })

      req.query = query
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get group members request
   */
  validateGetGroupMembers = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
          .min(1, 'Group ID is required')
          .max(100, 'Invalid group ID format')
      })

      const querySchema = z.object({
        limit: z.coerce.number()
          .min(1, 'Limit must be at least 1')
          .max(100, 'Limit cannot exceed 100')
          .default(50),
        skip: z.coerce.number()
          .min(0, 'Skip cannot be negative')
          .default(0),
        role: z.enum(['ADMIN', 'MODERATOR', 'MEMBER']).optional()
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')
      const query = this.validateData(querySchema as any, req.query, 'query parameters') as any

      this.logValidation('getGroupMembers', req.user?.id, { 
        groupId: params.id,
        role: query.role 
      })

      req.params = params
      req.query = query
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate bulk member operations request
   */
  validateBulkMemberOperations = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        id: z.string()
          .min(1, 'Group ID is required')
          .max(100, 'Invalid group ID format')
      })

      const bodySchema = z.object({
        operation: z.enum(['add', 'remove', 'update_role'], {
          errorMap: () => ({ message: 'Operation must be add, remove, or update_role' })
        }),
        memberIds: z.array(z.string().min(1, 'Member ID cannot be empty'))
          .min(1, 'At least one member ID is required')
          .max(100, 'Cannot process more than 100 members at once'),
        role: z.enum(['ADMIN', 'MODERATOR', 'MEMBER']).optional()
      }).refine(data => {
        if (data.operation === 'update_role' && !data.role) {
          throw new Error('Role is required for update_role operation')
        }
        return true
      }, {
        message: 'Invalid bulk operation configuration'
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')
      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Prevent users from including themselves in bulk operations
      if (body.memberIds.includes(req.user?.id || '')) {
        throw new Error('Cannot include yourself in bulk member operations')
      }

      // Rate limiting for bulk operations
      this.validateBulkOperationRateLimit(req, body.memberIds.length)

      this.logValidation('bulkMemberOperations', req.user?.id, {
        groupId: params.id,
        operation: body.operation,
        memberCount: body.memberIds.length
      })

      req.params = params
      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate group name availability
   */
  private validateGroupNameAvailability(name: string): void {
    // Check for reserved group names
    const reservedNames = [
      'admin', 'administrator', 'system', 'support',
      'help', 'api', 'www', 'mail', 'test', 'demo'
    ]
    
    if (reservedNames.includes(name.toLowerCase())) {
      throw new Error('Group name is reserved and cannot be used')
    }

    // This would integrate with group service to check uniqueness
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
   * Validate member IDs
   */
  private validateMemberIds(memberIds: string[]): void {
    // Check for duplicates
    const uniqueIds = new Set(memberIds)
    if (uniqueIds.size !== memberIds.length) {
      throw new Error('Duplicate member IDs are not allowed')
    }

    // Validate ID format
    const invalidIds = memberIds.filter(id => !id || id.length > 100)
    if (invalidIds.length > 0) {
      throw new Error('Invalid member ID format detected')
    }
  }

  /**
   * Validate group creation rate limiting
   */
  private validateGroupCreationRateLimit(req: Request): void {
    const maxGroupsPerDay = 10
    const windowMs = 24 * 60 * 60 * 1000 // 24 hours
    
    this.validateRateLimit(req, maxGroupsPerDay, windowMs)
  }

  /**
   * Validate group join rate limiting
   */
  private validateGroupJoinRateLimit(req: Request): void {
    const maxJoinsPerHour = 20
    const windowMs = 60 * 60 * 1000 // 1 hour
    
    this.validateRateLimit(req, maxJoinsPerHour, windowMs)
  }

  /**
   * Validate group search rate limiting
   */
  private validateGroupSearchRateLimit(req: Request): void {
    const maxSearchesPerMinute = 30
    const windowMs = 60 * 1000 // 1 minute
    
    this.validateRateLimit(req, maxSearchesPerMinute, windowMs)
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
   * Validate group permissions
   */
  validateGroupPermissions = (req: Request, res: Response, next: NextFunction) => {
    try {
      // This would validate:
      // 1. User is a member of the group
      // 2. User has appropriate role for the action
      // 3. Group is not archived/deleted
      
      const userId = req.user?.id
      if (!userId) {
        throw new Error('User authentication required for group operations')
      }

      // Placeholder - would integrate with group service
      this.logValidation('groupPermissions', userId)

      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Create comprehensive validation middleware for group endpoints
   */
  createGroupValidation = (validationType: 'create' | 'update' | 'members' | 'admin' | 'search') => {
    const validators = [this.validateGroupPermissions]

    switch (validationType) {
      case 'create':
        validators.push(this.validateCreateGroup)
        break
      case 'update':
        validators.push(this.validateUpdateGroup)
        break
      case 'members':
        validators.push(this.validateAddMember)
        break
      case 'admin':
        validators.push(this.validateBulkMemberOperations)
        break
      case 'search':
        validators.push(this.validateSearchPublicGroups)
        break
    }

    return this.chainValidators(...validators)
  }
}

// Export singleton instance
export const groupValidator = new GroupValidator()
