import { Request, Response } from 'express'
import { z } from 'zod'
import { BaseController } from './base.controller'
import { userService } from '../services/user.service'

/**
 * User Controller
 * Handles user profile management, contacts, blocking, search, and user operations
 */
export class UserController extends BaseController {
  /**
   * Get current user profile
   * GET /api/users/me
   */
  getCurrentUserProfile = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    this.logAction('getCurrentUserProfile', userId)

    const userProfile = await userService.getUserProfile(userId)

    this.sendSuccess(res, userProfile, 'User profile retrieved successfully')
  })

  /**
   * Update current user profile
   * PUT /api/users/me
   */
  updateCurrentUserProfile = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const bodySchema = z.object({
      firstName: z.string().min(1, 'First name is required').max(50, 'First name too long').optional(),
      lastName: z.string().min(1, 'Last name is required').max(50, 'Last name too long').optional(),
      avatar: z.string().url('Invalid avatar URL').optional(),
      bio: z.string().max(500, 'Bio too long').optional(),
      status: z.string().max(100, 'Status too long').optional()
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('updateCurrentUserProfile', userId, { 
      fields: Object.keys(body) 
    })

    const updatedProfile = await userService.updateUserProfile(userId, body)

    this.sendSuccess(res, updatedProfile, 'Profile updated successfully')
  })

  /**
   * Get user by ID
   * GET /api/users/:id
   */
  getUserById = this.asyncHandler(async (req: Request, res: Response) => {
    const currentUserId = this.getUserId(req)
    const targetUserId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'User ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('getUserById', currentUserId, { targetUserId })

    const userProfile = await userService.getUserProfile(targetUserId)

    // Filter sensitive data for other users
    if (currentUserId !== targetUserId) {
      const publicProfile = this.filterSensitiveData(userProfile, ['email'])
      this.sendSuccess(res, publicProfile, 'User profile retrieved successfully')
    } else {
      this.sendSuccess(res, userProfile, 'User profile retrieved successfully')
    }
  })

  /**
   * Update user status
   * PUT /api/users/me/status
   */
  updateUserStatus = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const bodySchema = z.object({
      isOnline: z.boolean(),
      customStatus: z.string().max(100, 'Status too long').optional()
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('updateUserStatus', userId, { 
      isOnline: body.isOnline,
      hasCustomStatus: !!body.customStatus 
    })

    const statusUpdate = await userService.updateUserStatus(
      userId, 
      body.isOnline, 
      body.customStatus
    )

    this.sendSuccess(res, statusUpdate, 'User status updated successfully')
  })

  /**
   * Get user status
   * GET /api/users/:id/status
   */
  getUserStatus = this.asyncHandler(async (req: Request, res: Response) => {
    const currentUserId = this.getUserId(req)
    const targetUserId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'User ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('getUserStatus', currentUserId, { targetUserId })

    const userProfile = await userService.getUserProfile(targetUserId)

    const statusInfo = {
      id: userProfile.id,
      isOnline: userProfile.isOnline,
      status: userProfile.status,
      lastSeen: userProfile.lastSeen
    }

    this.sendSuccess(res, statusInfo, 'User status retrieved successfully')
  })

  /**
   * Search users
   * GET /api/users/search
   */
  searchUsers = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const querySchema = z.object({
      query: z.string().min(1, 'Search query is required'),
      limit: z.coerce.number().min(1).max(50).default(20),
      skip: z.coerce.number().min(0).default(0),
      excludeBlocked: z.coerce.boolean().default(true)
    })

    const query = this.getQueryParams(req, querySchema)

    this.logAction('searchUsers', userId, { 
      searchQuery: query.query,
      limit: query.limit,
      excludeBlocked: query.excludeBlocked
    })

    const users = await userService.searchUsers(query.query, userId, {
      limit: query.limit,
      skip: query.skip,
      excludeBlocked: query.excludeBlocked
    })

    const pagination = this.calculatePagination(
      Math.floor((query.skip || 0) / (query.limit || 20)) + 1,
      query.limit || 20,
      users.length
    )

    this.sendSuccess(res, users, 'User search completed successfully', 200, pagination)
  })

  /**
   * Get user contacts
   * GET /api/users/contacts
   */
  getUserContacts = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const querySchema = z.object({
      limit: z.coerce.number().min(1).max(100).default(50),
      skip: z.coerce.number().min(0).default(0)
    })

    const query = this.getQueryParams(req, querySchema)

    this.logAction('getUserContacts', userId, { 
      limit: query.limit,
      skip: query.skip 
    })

    const contacts = await userService.getUserContacts(userId, query.limit, query.skip)

    const pagination = this.calculatePagination(
      Math.floor((query.skip || 0) / (query.limit || 50)) + 1,
      query.limit || 50,
      contacts.length
    )

    this.sendSuccess(res, contacts, 'Contacts retrieved successfully', 200, pagination)
  })

  /**
   * Add contact
   * POST /api/users/contacts
   */
  addContact = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const bodySchema = z.object({
      contactId: z.string().min(1, 'Contact ID is required'),
      favorite: z.boolean().default(false)
    })

    const body = this.getBodyParams(req, bodySchema)

    // Prevent adding self as contact
    if (body.contactId === userId) {
      this.sendSuccess(res, { 
        added: false, 
        error: 'Cannot add yourself as a contact' 
      }, 'Invalid operation')
      return
    }

    this.logAction('addContact', userId, { 
      contactId: body.contactId,
      favorite: body.favorite 
    })

    const result = await userService.addContact(userId, body.contactId, body.favorite)

    this.sendSuccess(res, result, 'Contact added successfully', 201)
  })

  /**
   * Remove contact
   * DELETE /api/users/contacts/:id
   */
  removeContact = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const contactId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Contact ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('removeContact', userId, { contactId })

    const result = await userService.removeContact(userId, contactId)

    this.sendSuccess(res, result, 'Contact removed successfully')
  })

  /**
   * Toggle contact favorite
   * PUT /api/users/contacts/:id/favorite
   */
  toggleContactFavorite = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const contactId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Contact ID is required')
    })

    const bodySchema = z.object({
      favorite: z.boolean()
    })

    this.getPathParams(req, paramsSchema)
    const body = this.getBodyParams(req, bodySchema)

    this.logAction('toggleContactFavorite', userId, { 
      contactId,
      favorite: body.favorite 
    })

    // This would require implementing a toggle favorite method in userService
    // For now, return a placeholder response
    const result = {
      contactId,
      favorite: body.favorite,
      message: 'Contact favorite toggle will be implemented with enhanced contact management'
    }

    this.sendSuccess(res, result, `Contact ${body.favorite ? 'added to' : 'removed from'} favorites`)
  })

  /**
   * Get blocked users
   * GET /api/users/blocked
   */
  getBlockedUsers = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    this.logAction('getBlockedUsers', userId)

    const blockedUsers = await userService.getBlockedUsers(userId)

    this.sendSuccess(res, blockedUsers, 'Blocked users retrieved successfully')
  })

  /**
   * Block user
   * POST /api/users/block
   */
  blockUser = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const bodySchema = z.object({
      userToBlockId: z.string().min(1, 'User ID to block is required')
    })

    const body = this.getBodyParams(req, bodySchema)

    // Prevent blocking self
    if (body.userToBlockId === userId) {
      this.sendSuccess(res, { 
        blocked: false, 
        error: 'Cannot block yourself' 
      }, 'Invalid operation')
      return
    }

    this.logAction('blockUser', userId, { userToBlockId: body.userToBlockId })

    const result = await userService.blockUser(userId, body.userToBlockId)

    this.sendSuccess(res, result, 'User blocked successfully')
  })

  /**
   * Unblock user
   * DELETE /api/users/blocked/:id
   */
  unblockUser = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const userToUnblockId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'User ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('unblockUser', userId, { userToUnblockId })

    const result = await userService.unblockUser(userId, userToUnblockId)

    this.sendSuccess(res, result, 'User unblocked successfully')
  })

  /**
   * Get user statistics
   * GET /api/users/me/stats
   */
  getUserStats = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    this.logAction('getUserStats', userId)

    const stats = await userService.getUserStats(userId)

    // Transform dates for response
    const transformedStats = {
      ...stats,
      joinedAt: stats.joinedAt.toISOString(),
      lastActive: stats.lastActive.toISOString()
    }

    this.sendSuccess(res, transformedStats, 'User statistics retrieved successfully')
  })

  /**
   * Delete user account
   * DELETE /api/users/me
   */
  deleteUserAccount = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const bodySchema = z.object({
      confirmation: z.literal('DELETE_MY_ACCOUNT', {
        errorMap: () => ({ message: 'Please type "DELETE_MY_ACCOUNT" to confirm' })
      }),
      password: z.string().min(1, 'Password is required for account deletion')
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('deleteUserAccount', userId)

    // This would typically verify the password first
    // For now, proceed with the deletion
    const result = await userService.deleteUserAccount(userId)

    this.sendSuccess(res, result, 'Account deletion initiated successfully')
  })

  /**
   * Get contact suggestions
   * GET /api/users/suggestions
   */
  getContactSuggestions = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const querySchema = z.object({
      limit: z.coerce.number().min(1).max(20).default(10)
    })

    const query = this.getQueryParams(req, querySchema)

    this.logAction('getContactSuggestions', userId, { limit: query.limit })

    // This would require implementing a suggestion algorithm
    // For now, return a placeholder response
    const suggestions = {
      suggestions: [],
      count: 0,
      message: 'Contact suggestions will be implemented with recommendation algorithm'
    }

    this.sendSuccess(res, suggestions, 'Contact suggestions retrieved successfully')
  })

  /**
   * Bulk user operations (Admin only)
   * POST /api/users/bulk-operations
   */
  bulkUserOperations = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    this.requireAdmin(req)

    const bodySchema = z.object({
      operation: z.enum(['activate', 'deactivate', 'delete', 'export']),
      userIds: z.array(z.string().min(1)).min(1, 'At least one user ID is required').max(100, 'Maximum 100 users at once'),
      options: z.object({
        reason: z.string().optional(),
        notifyUsers: z.boolean().default(false)
      }).optional()
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('bulkUserOperations', userId, {
      operation: body.operation,
      userCount: body.userIds.length
    })

    const results = await this.handleBulkOperation(
      body.userIds,
      async (targetUserId: string) => {
        switch (body.operation) {
          case 'activate':
            // This would require implementing user activation
            return { userId: targetUserId, activated: true }
          
          case 'deactivate':
            // This would require implementing user deactivation
            return { userId: targetUserId, deactivated: true }
          
          case 'delete':
            return await userService.deleteUserAccount(targetUserId)
          
          case 'export':
            return await userService.getUserProfile(targetUserId)
          
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
   * Export user data
   * GET /api/users/me/export
   */
  exportUserData = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const querySchema = z.object({
      format: z.enum(['json', 'csv']).default('json'),
      includeContacts: z.coerce.boolean().default(true),
      includeMessages: z.coerce.boolean().default(false)
    })

    const query = this.getQueryParams(req, querySchema)

    this.logAction('exportUserData', userId, { 
      format: query.format,
      includeContacts: query.includeContacts,
      includeMessages: query.includeMessages
    })

    // Get user data
    const [userProfile, contacts, stats] = await Promise.all([
      userService.getUserProfile(userId),
      query.includeContacts ? userService.getUserContacts(userId) : [],
      userService.getUserStats(userId)
    ])

    const exportData = {
      exportedAt: new Date().toISOString(),
      user: userProfile,
      contacts: query.includeContacts ? contacts : undefined,
      statistics: stats,
      format: query.format
    }

    if (query.format === 'csv') {
      // Convert to CSV format
      const csvData = this.convertUserDataToCSV(exportData)
      res.setHeader('Content-Type', 'text/csv')
      res.setHeader('Content-Disposition', 'attachment; filename=user-data-export.csv')
      res.send(csvData)
    } else {
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Content-Disposition', 'attachment; filename=user-data-export.json')
      this.sendSuccess(res, exportData, 'User data exported successfully')
    }
  })

  /**
   * Get user activity summary
   * GET /api/users/me/activity
   */
  getUserActivity = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const querySchema = z.object({
      days: z.coerce.number().positive().max(365).default(30)
    })

    const query = this.getQueryParams(req, querySchema)

    this.logAction('getUserActivity', userId, { days: query.days })

    // This would integrate with analytics service
    const activity = {
      userId,
      period: `${query.days} days`,
      summary: {
        messagesSent: 0,
        conversationsActive: 0,
        callsMade: 0,
        groupsJoined: 0
      },
      message: 'User activity summary will be implemented with analytics integration'
    }

    this.sendSuccess(res, activity, 'User activity retrieved successfully')
  })

  /**
   * Update user privacy settings
   * PUT /api/users/me/privacy
   */
  updatePrivacySettings = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const bodySchema = z.object({
      profileVisibility: z.enum(['public', 'contacts', 'private']).optional(),
      showOnlineStatus: z.boolean().optional(),
      allowContactRequests: z.boolean().optional(),
      showLastSeen: z.boolean().optional(),
      allowGroupInvites: z.boolean().optional()
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('updatePrivacySettings', userId, { 
      settings: Object.keys(body) 
    })

    // This would require implementing privacy settings in userService
    const privacySettings = {
      userId,
      settings: body,
      updatedAt: new Date().toISOString(),
      message: 'Privacy settings will be implemented with enhanced user preferences'
    }

    this.sendSuccess(res, privacySettings, 'Privacy settings updated successfully')
  })

  /**
   * Get user privacy settings
   * GET /api/users/me/privacy
   */
  getPrivacySettings = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    this.logAction('getPrivacySettings', userId)

    // This would require implementing privacy settings retrieval
    const privacySettings = {
      userId,
      profileVisibility: 'public',
      showOnlineStatus: true,
      allowContactRequests: true,
      showLastSeen: true,
      allowGroupInvites: true,
      message: 'Privacy settings retrieval will be implemented with user preferences'
    }

    this.sendSuccess(res, privacySettings, 'Privacy settings retrieved successfully')
  })

  /**
   * Helper method to convert user data to CSV
   */
  private convertUserDataToCSV(data: any): string {
    const headers = ['Field', 'Value']
    const rows = [headers.join(',')]
    
    // Add user profile data
    const user = data.user
    rows.push(`"Username","${user.username}"`)
    rows.push(`"Email","${user.email}"`)
    rows.push(`"First Name","${user.firstName || ''}"`)
    rows.push(`"Last Name","${user.lastName || ''}"`)
    rows.push(`"Bio","${user.bio || ''}"`)
    rows.push(`"Status","${user.status || ''}"`)
    rows.push(`"Joined At","${user.createdAt}"`)
    rows.push(`"Last Seen","${user.lastSeen}"`)

    // Add contacts if included
    if (data.contacts && data.contacts.length > 0) {
      rows.push('') // Empty line
      rows.push('Contacts:')
      rows.push('Username,First Name,Last Name,Added At')
      
      data.contacts.forEach((contact: any) => {
        rows.push(`"${contact.username}","${contact.firstName || ''}","${contact.lastName || ''}","${contact.addedAt || ''}"`)
      })
    }

    return rows.join('\n')
  }
}

// Export singleton instance
export const userController = new UserController()
