import { Request, Response } from 'express'
import { z } from 'zod'
import { BaseController } from './base.controller'
import { groupService } from '../services/group.service'

/**
 * Group Controller
 * Handles group creation, management, membership, and operations
 */
export class GroupController extends BaseController {
  /**
   * Create a new group
   * POST /api/groups
   */
  createGroup = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const bodySchema = z.object({
      name: z.string().min(1, 'Group name is required').max(100, 'Group name too long'),
      description: z.string().max(500, 'Description too long').optional(),
      avatar: z.string().url('Invalid avatar URL').optional(),
      memberIds: z.array(z.string()).optional().default([]),
      isPublic: z.boolean().optional().default(true)
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('createGroup', userId, {
      groupName: body.name,
      memberCount: body.memberIds?.length || 0,
      isPublic: body.isPublic
    })

    const group = await groupService.createGroup({
      name: body.name,
      description: body.description,
      avatar: body.avatar,
      creatorId: userId,
      memberIds: body.memberIds,
      isPublic: body.isPublic
    })

    // Transform dates for response
    const transformedGroup = this.transformGroupDates(group)

    this.sendSuccess(res, transformedGroup, 'Group created successfully', 201)
  })

  /**
   * Get group by ID
   * GET /api/groups/:id
   */
  getGroup = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const groupId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Group ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('getGroup', userId, { groupId })

    const group = await groupService.getGroup(groupId, userId)

    const transformedGroup = this.transformGroupDates(group)

    this.sendSuccess(res, transformedGroup, 'Group retrieved successfully')
  })

  /**
   * Get user's groups
   * GET /api/groups/my-groups
   */
  getUserGroups = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const querySchema = z.object({
      limit: z.coerce.number().min(1).max(100).default(20),
      skip: z.coerce.number().min(0).default(0)
    })

    const query = this.getQueryParams(req, querySchema)

    this.logAction('getUserGroups', userId, {
      limit: query.limit,
      skip: query.skip
    })

    const groups = await groupService.getUserGroups(userId, query.limit, query.skip)

    const transformedGroups = groups.map(group => this.transformGroupDates(group))

    const pagination = this.calculatePagination(
      Math.floor((query.skip || 0) / (query.limit || 20)) + 1,
      query.limit || 20,
      transformedGroups.length // This would be total count in a real implementation
    )

    this.sendSuccess(res, transformedGroups, 'User groups retrieved successfully', 200, pagination)
  })

  /**
   * Update group
   * PUT /api/groups/:id
   */
  updateGroup = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const groupId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Group ID is required')
    })

    const bodySchema = z.object({
      name: z.string().min(1).max(100).optional(),
      description: z.string().max(500).optional(),
      avatar: z.string().url().optional(),
      isPublic: z.boolean().optional(),
      maxMembers: z.number().positive().max(10000).optional()
    })

    this.getPathParams(req, paramsSchema)
    const body = this.getBodyParams(req, bodySchema)

    this.logAction('updateGroup', userId, {
      groupId,
      updates: Object.keys(body)
    })

    const updatedGroup = await groupService.updateGroup(groupId, userId, body)

    const transformedGroup = this.transformGroupDates(updatedGroup)

    this.sendSuccess(res, transformedGroup, 'Group updated successfully')
  })

  /**
   * Join group
   * POST /api/groups/:id/join
   */
  joinGroup = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const groupId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Group ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('joinGroup', userId, { groupId })

    const updatedGroup = await groupService.joinGroup(groupId, userId)

    const transformedGroup = this.transformGroupDates(updatedGroup)

    this.sendSuccess(res, transformedGroup, 'Joined group successfully')
  })

  /**
   * Leave group
   * POST /api/groups/:id/leave
   */
  leaveGroup = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const groupId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Group ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('leaveGroup', userId, { groupId })

    const result = await groupService.leaveGroup(groupId, userId)

    this.sendSuccess(res, result, 'Left group successfully')
  })

  /**
   * Add member to group
   * POST /api/groups/:id/members
   */
  addMember = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const groupId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Group ID is required')
    })

    const bodySchema = z.object({
      memberId: z.string().min(1, 'Member ID is required')
    })

    this.getPathParams(req, paramsSchema)
    const body = this.getBodyParams(req, bodySchema)

    this.logAction('addMember', userId, {
      groupId,
      memberId: body.memberId
    })

    const updatedGroup = await groupService.addMember(groupId, userId, body.memberId)

    const transformedGroup = this.transformGroupDates(updatedGroup)

    this.sendSuccess(res, transformedGroup, 'Member added successfully')
  })

  /**
   * Remove member from group
   * DELETE /api/groups/:id/members/:memberId
   */
  removeMember = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const groupId = req.params.id
    const memberId = req.params.memberId

    const paramsSchema = z.object({
      id: z.string().min(1, 'Group ID is required'),
      memberId: z.string().min(1, 'Member ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('removeMember', userId, {
      groupId,
      memberId
    })

    const updatedGroup = await groupService.removeMember(groupId, userId, memberId)

    const transformedGroup = this.transformGroupDates(updatedGroup)

    this.sendSuccess(res, transformedGroup, 'Member removed successfully')
  })

  /**
   * Update member role
   * PUT /api/groups/:id/members/:memberId/role
   */
  updateMemberRole = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const groupId = req.params.id
    const memberId = req.params.memberId

    const paramsSchema = z.object({
      id: z.string().min(1, 'Group ID is required'),
      memberId: z.string().min(1, 'Member ID is required')
    })

    const bodySchema = z.object({
      role: z.enum(['ADMIN', 'MODERATOR', 'MEMBER'], {
        errorMap: () => ({ message: 'Role must be ADMIN, MODERATOR, or MEMBER' })
      })
    })

    this.getPathParams(req, paramsSchema)
    const body = this.getBodyParams(req, bodySchema)

    this.logAction('updateMemberRole', userId, {
      groupId,
      memberId,
      newRole: body.role
    })

    const updatedGroup = await groupService.updateMemberRole(groupId, userId, memberId, body.role)

    const transformedGroup = this.transformGroupDates(updatedGroup)

    this.sendSuccess(res, transformedGroup, 'Member role updated successfully')
  })

  /**
   * Delete group
   * DELETE /api/groups/:id
   */
  deleteGroup = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const groupId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Group ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('deleteGroup', userId, { groupId })

    const result = await groupService.deleteGroup(groupId, userId)

    this.sendSuccess(res, result, 'Group deleted successfully')
  })

  /**
   * Search public groups
   * GET /api/groups/search
   */
  searchPublicGroups = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const querySchema = z.object({
      query: z.string().min(1, 'Search query is required'),
      limit: z.coerce.number().min(1).max(50).default(20),
      skip: z.coerce.number().min(0).default(0)
    })

    const query = this.getQueryParams(req, querySchema)

    this.logAction('searchPublicGroups', userId, {
      searchQuery: query.query,
      limit: query.limit
    })

    const groups = await groupService.searchPublicGroups(query.query, query.limit, query.skip)

    const transformedGroups = groups.map(group => this.transformGroupDates(group))

    const pagination = this.calculatePagination(
      Math.floor((query.skip || 0) / (query.limit || 20)) + 1,
      query.limit || 20,
      transformedGroups.length
    )

    this.sendSuccess(res, transformedGroups, 'Public groups search completed successfully', 200, pagination)
  })

  /**
   * Get group statistics
   * GET /api/groups/:id/stats
   */
  getGroupStats = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const groupId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Group ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('getGroupStats', userId, { groupId })

    const stats = await groupService.getGroupStats(groupId, userId)

    // Transform dates for response
    const transformedStats = {
      ...stats,
      createdAt: stats.createdAt.toISOString(),
      lastActivity: stats.lastActivity?.toISOString() || null
    }

    this.sendSuccess(res, transformedStats, 'Group statistics retrieved successfully')
  })

  /**
   * Get popular groups
   * GET /api/groups/popular
   */
  getPopularGroups = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const querySchema = z.object({
      limit: z.coerce.number().min(1).max(50).default(10)
    })

    const query = this.getQueryParams(req, querySchema)

    this.logAction('getPopularGroups', userId, { limit: query.limit })

    const groups = await groupService.getPopularGroups(query.limit)

    const transformedGroups = groups.map(group => this.transformGroupDates(group))

    this.sendSuccess(res, transformedGroups, 'Popular groups retrieved successfully')
  })

  /**
   * Get group members
   * GET /api/groups/:id/members
   */
  getGroupMembers = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const groupId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Group ID is required')
    })

    const querySchema = z.object({
      limit: z.coerce.number().min(1).max(100).default(50),
      skip: z.coerce.number().min(0).default(0),
      role: z.enum(['ADMIN', 'MODERATOR', 'MEMBER']).optional()
    })

    this.getPathParams(req, paramsSchema)
    const query = this.getQueryParams(req, querySchema)

    this.logAction('getGroupMembers', userId, { groupId, role: query.role })

    const group = await groupService.getGroup(groupId, userId)

    // Filter members by role if specified
    let members = group.members
    if (query.role) {
      members = members.filter(member => member.role === query.role)
    }

    // Apply pagination
    const skip = query.skip || 0
    const limit = query.limit || 50
    const paginatedMembers = members.slice(skip, skip + limit)

    // Transform member data
    const transformedMembers = paginatedMembers.map(member => ({
      userId: member.userId,
      role: member.role,
      joinedAt: member.joinedAt?.toISOString() || null,
      user: member.user ? {
        id: member.user.id,
        username: member.user.username,
        firstName: member.user.firstName,
        lastName: member.user.lastName,
        avatar: member.user.avatar,
        isOnline: member.user.isOnline
      } : null
    }))

    const pagination = this.calculatePagination(
      Math.floor(skip / limit) + 1,
      limit,
      members.length
    )

    this.sendSuccess(res, {
      members: transformedMembers,
      totalMembers: members.length,
      membersByRole: {
        ADMIN: members.filter(m => m.role === 'ADMIN').length,
        MODERATOR: members.filter(m => m.role === 'MODERATOR').length,
        MEMBER: members.filter(m => m.role === 'MEMBER').length
      }
    }, 'Group members retrieved successfully', 200, pagination)
  })

  /**
   * Bulk member operations
   * POST /api/groups/:id/members/bulk
   */
  bulkMemberOperations = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const groupId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Group ID is required')
    })

    const bodySchema = z.object({
      operation: z.enum(['add', 'remove', 'update_role']),
      memberIds: z.array(z.string().min(1)).min(1, 'At least one member ID is required'),
      role: z.enum(['ADMIN', 'MODERATOR', 'MEMBER']).optional()
    })

    this.getPathParams(req, paramsSchema)
    const body = this.getBodyParams(req, bodySchema)

    // Validate role is provided for update_role operation
    if (body.operation === 'update_role' && !body.role) {
      this.sendSuccess(res, {
        successful: 0,
        failed: body.memberIds.length,
        error: 'Role is required for update_role operation'
      }, 'Role is required for update_role operation')
      return
    }

    this.logAction('bulkMemberOperations', userId, {
      groupId,
      operation: body.operation,
      memberCount: body.memberIds.length
    })

    const results = await this.handleBulkOperation(
      body.memberIds,
      async (memberId: string) => {
        switch (body.operation) {
          case 'add':
            return await groupService.addMember(groupId, userId, memberId)
          
          case 'remove':
            return await groupService.removeMember(groupId, userId, memberId)
          
          case 'update_role':
            if (!body.role) throw new Error('Role is required')
            return await groupService.updateMemberRole(groupId, userId, memberId, body.role)
          
          default:
            throw new Error(`Unknown operation: ${body.operation}`)
        }
      },
      { continueOnError: true }
    )

    this.sendSuccess(res, {
      operation: body.operation,
      successful: results.successful.length,
      failed: results.failed.length,
      errors: results.failed
    }, `Bulk ${body.operation} operation completed`)
  })

  /**
   * Get group activity feed
   * GET /api/groups/:id/activity
   */
  getGroupActivity = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const groupId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Group ID is required')
    })

    const querySchema = z.object({
      limit: z.coerce.number().min(1).max(100).default(20),
      skip: z.coerce.number().min(0).default(0),
      type: z.enum(['message', 'member_join', 'member_leave', 'role_change', 'group_update']).optional()
    })

    this.getPathParams(req, paramsSchema)
    const query = this.getQueryParams(req, querySchema)

    // Check if user has access to group
    await groupService.getGroup(groupId, userId)

    this.logAction('getGroupActivity', userId, { groupId, type: query.type })

    // This would require implementing activity tracking
    const activity = {
      groupId,
      activities: [],
      totalActivities: 0,
      message: 'Group activity feed will be implemented with activity tracking system'
    }

    const pagination = this.calculatePagination(
      Math.floor((query.skip || 0) / (query.limit || 20)) + 1,
      query.limit || 20,
      0
    )

    this.sendSuccess(res, activity, 'Group activity retrieved successfully', 200, pagination)
  })

  /**
   * Export group data (Admin only)
   * GET /api/groups/:id/export
   */
  exportGroupData = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const groupId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Group ID is required')
    })

    const querySchema = z.object({
      format: z.enum(['json', 'csv']).default('json'),
      includeMessages: z.coerce.boolean().default(false),
      includeMembers: z.coerce.boolean().default(true)
    })

    this.getPathParams(req, paramsSchema)
    const query = this.getQueryParams(req, querySchema)

    // Check if user is admin of the group
    const group = await groupService.getGroup(groupId, userId)
    const userMember = group.members.find(member => member.userId === userId)
    
    if (!userMember || (userMember.role !== 'ADMIN' && userMember.role !== 'OWNER')) {
      this.requireAdmin(req) // Fallback to system admin check
    }

    this.logAction('exportGroupData', userId, { 
      groupId, 
      format: query.format,
      includeMessages: query.includeMessages
    })

    const exportData = {
      group: this.transformGroupDates(group),
      exportedAt: new Date().toISOString(),
      exportedBy: userId,
      format: query.format,
      includeMessages: query.includeMessages,
      includeMembers: query.includeMembers
    }

    if (query.format === 'csv') {
      // Convert to CSV format
      const csvData = this.convertGroupToCSV(exportData)
      res.setHeader('Content-Type', 'text/csv')
      res.setHeader('Content-Disposition', `attachment; filename=group-${groupId}-export.csv`)
      res.send(csvData)
    } else {
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Content-Disposition', `attachment; filename=group-${groupId}-export.json`)
      this.sendSuccess(res, exportData, 'Group data exported successfully')
    }
  })

  /**
   * Helper method to transform group dates
   */
  private transformGroupDates(group: any): any {
    return {
      ...group,
      createdAt: group.createdAt?.toISOString() || null,
      updatedAt: group.updatedAt?.toISOString() || null,
      members: group.members?.map((member: any) => ({
        ...member,
        joinedAt: member.joinedAt?.toISOString() || null
      })) || []
    }
  }

  /**
   * Helper method to convert group data to CSV
   */
  private convertGroupToCSV(data: any): string {
    const headers = ['Group ID', 'Name', 'Description', 'Member Count', 'Created At', 'Is Public']
    const rows = [headers.join(',')]
    
    const group = data.group
    const values = [
      group.id,
      `"${group.name}"`,
      `"${group.description || ''}"`,
      group.members?.length || 0,
      group.createdAt,
      group.isPublic
    ]
    rows.push(values.join(','))

    // Add members if included
    if (data.includeMembers && group.members?.length > 0) {
      rows.push('') // Empty line
      rows.push('Members:')
      rows.push('User ID,Role,Joined At')
      
      group.members.forEach((member: any) => {
        rows.push(`${member.userId},${member.role},${member.joinedAt || ''}`)
      })
    }

    return rows.join('\n')
  }
}

// Export singleton instance
export const groupController = new GroupController()
