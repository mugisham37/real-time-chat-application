import { Request, Response } from 'express'
import { z } from 'zod'
import { BaseController } from './base.controller'
import { presenceService } from '../services/presence.service'
import { socketService } from '../services/socket.service'

/**
 * Presence Controller
 * Handles user presence, activity status, typing indicators, and location sharing
 */
export class PresenceController extends BaseController {
  /**
   * Update user presence status
   * PUT /api/presence/status
   */
  updatePresence = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const bodySchema = z.object({
      status: z.enum(['online', 'away', 'busy', 'invisible', 'offline']),
      customMessage: z.string().max(100).optional(),
      deviceInfo: z.object({
        type: z.enum(['web', 'mobile', 'desktop']),
        userAgent: z.string().optional(),
        platform: z.string().optional()
      }).optional()
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('updatePresence', userId, {
      status: body.status,
      hasCustomMessage: !!body.customMessage,
      deviceType: body.deviceInfo?.type
    })

    const presence = await presenceService.updatePresence(
      userId,
      body.status,
      body.customMessage,
      body.deviceInfo
    )

    // Transform dates for response
    const transformedPresence = {
      ...presence,
      lastSeen: presence.lastSeen.toISOString()
    }

    // Emit real-time presence update
    try {
      await socketService.emitPresenceUpdate(userId, transformedPresence.status, transformedPresence)
    } catch (error) {
      console.error('Failed to emit presence update:', error)
    }

    this.sendSuccess(res, transformedPresence, 'Presence updated successfully')
  })

  /**
   * Get user presence
   * GET /api/presence/user/:userId
   */
  getUserPresence = this.asyncHandler(async (req: Request, res: Response) => {
    const currentUserId = this.getUserId(req)
    const targetUserId = req.params.userId

    const paramsSchema = z.object({
      userId: z.string().min(1, 'User ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('getUserPresence', currentUserId, { targetUserId })

    const presence = await presenceService.getUserPresence(targetUserId)

    if (!presence) {
      this.sendSuccess(res, null, 'User presence not found')
      return
    }

    // Transform dates for response
    const transformedPresence = {
      ...presence,
      lastSeen: presence.lastSeen.toISOString()
    }

    this.sendSuccess(res, transformedPresence, 'User presence retrieved successfully')
  })

  /**
   * Get multiple users presence
   * POST /api/presence/users
   */
  getMultipleUsersPresence = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const bodySchema = z.object({
      userIds: z.array(z.string().min(1)).min(1, 'At least one user ID is required').max(100, 'Maximum 100 users at once')
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('getMultipleUsersPresence', userId, {
      userCount: body.userIds.length
    })

    const presences = await presenceService.getMultipleUsersPresence(body.userIds)

    // Transform dates for response
    const transformedPresences: Record<string, any> = {}
    for (const [id, presence] of Object.entries(presences)) {
      if (presence) {
        transformedPresences[id] = {
          ...presence,
          lastSeen: presence.lastSeen.toISOString()
        }
      } else {
        transformedPresences[id] = null
      }
    }

    this.sendSuccess(res, transformedPresences, 'Multiple users presence retrieved successfully')
  })

  /**
   * Get online users
   * GET /api/presence/online
   */
  getOnlineUsers = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const querySchema = z.object({
      limit: z.coerce.number().min(1).max(500).default(100)
    })

    const query = this.getQueryParams(req, querySchema)

    this.logAction('getOnlineUsers', userId, { limit: query.limit })

    const onlineUsers = await presenceService.getOnlineUsers(query.limit)

    this.sendSuccess(res, {
      onlineUsers,
      count: onlineUsers.length
    }, 'Online users retrieved successfully')
  })

  /**
   * Get online users count
   * GET /api/presence/online/count
   */
  getOnlineUsersCount = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    this.logAction('getOnlineUsersCount', userId)

    const count = await presenceService.getOnlineUsersCount()

    this.sendSuccess(res, { count }, 'Online users count retrieved successfully')
  })

  /**
   * Set typing indicator
   * POST /api/presence/typing
   */
  setTypingIndicator = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const bodySchema = z.object({
      conversationId: z.string().min(1, 'Conversation ID is required'),
      isTyping: z.boolean()
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('setTypingIndicator', userId, {
      conversationId: body.conversationId,
      isTyping: body.isTyping
    })

    await presenceService.setTypingIndicator(userId, body.conversationId, body.isTyping)

    // Emit real-time typing status
    try {
      await socketService.emitTypingStatus(body.conversationId, userId, body.isTyping)
    } catch (error) {
      console.error('Failed to emit typing status:', error)
    }

    this.sendSuccess(res, {
      userId,
      conversationId: body.conversationId,
      isTyping: body.isTyping,
      timestamp: new Date().toISOString()
    }, `Typing indicator ${body.isTyping ? 'set' : 'cleared'} successfully`)
  })

  /**
   * Get typing users in conversation
   * GET /api/presence/typing/:conversationId
   */
  getTypingUsers = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const conversationId = req.params.conversationId

    const paramsSchema = z.object({
      conversationId: z.string().min(1, 'Conversation ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('getTypingUsers', userId, { conversationId })

    const typingUsers = await presenceService.getTypingUsers(conversationId)

    // Transform dates for response
    const transformedTypingUsers = typingUsers.map(indicator => ({
      ...indicator,
      startedAt: indicator.startedAt.toISOString(),
      expiresAt: indicator.expiresAt.toISOString()
    }))

    this.sendSuccess(res, {
      conversationId,
      typingUsers: transformedTypingUsers,
      count: transformedTypingUsers.length
    }, 'Typing users retrieved successfully')
  })

  /**
   * Set activity status
   * PUT /api/presence/activity
   */
  setActivityStatus = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const bodySchema = z.object({
      activity: z.enum(['idle', 'active', 'in_call', 'in_meeting', 'gaming', 'custom']),
      details: z.string().max(100).optional(),
      expiresInMinutes: z.number().positive().max(1440).optional() // Max 24 hours
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('setActivityStatus', userId, {
      activity: body.activity,
      hasDetails: !!body.details,
      expiresInMinutes: body.expiresInMinutes
    })

    const activityStatus = await presenceService.setActivityStatus(
      userId,
      body.activity,
      body.details,
      body.expiresInMinutes
    )

    // Transform dates for response
    const transformedActivity = {
      ...activityStatus,
      startedAt: activityStatus.startedAt.toISOString(),
      expiresAt: activityStatus.expiresAt?.toISOString() || null
    }

    this.sendSuccess(res, transformedActivity, 'Activity status set successfully')
  })

  /**
   * Get user activity status
   * GET /api/presence/activity/:userId
   */
  getUserActivityStatus = this.asyncHandler(async (req: Request, res: Response) => {
    const currentUserId = this.getUserId(req)
    const targetUserId = req.params.userId

    const paramsSchema = z.object({
      userId: z.string().min(1, 'User ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('getUserActivityStatus', currentUserId, { targetUserId })

    const activityStatus = await presenceService.getUserActivityStatus(targetUserId)

    if (!activityStatus) {
      this.sendSuccess(res, null, 'User activity status not found')
      return
    }

    // Transform dates for response
    const transformedActivity = {
      ...activityStatus,
      startedAt: activityStatus.startedAt.toISOString(),
      expiresAt: activityStatus.expiresAt?.toISOString() || null
    }

    this.sendSuccess(res, transformedActivity, 'User activity status retrieved successfully')
  })

  /**
   * Clear activity status
   * DELETE /api/presence/activity
   */
  clearActivityStatus = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    this.logAction('clearActivityStatus', userId)

    await presenceService.clearActivityStatus(userId)

    this.sendSuccess(res, {
      cleared: true,
      timestamp: new Date().toISOString()
    }, 'Activity status cleared successfully')
  })

  /**
   * Update user location
   * PUT /api/presence/location
   */
  updateLocation = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const bodySchema = z.object({
      latitude: z.number().min(-90).max(90).optional(),
      longitude: z.number().min(-180).max(180).optional(),
      country: z.string().max(100).optional(),
      city: z.string().max(100).optional(),
      timezone: z.string().max(50).optional(),
      isShared: z.boolean().default(false)
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('updateLocation', userId, {
      hasCoordinates: !!(body.latitude && body.longitude),
      isShared: body.isShared,
      country: body.country
    })

    const location = await presenceService.updateUserLocation(
      userId,
      {
        latitude: body.latitude,
        longitude: body.longitude,
        country: body.country,
        city: body.city,
        timezone: body.timezone
      },
      body.isShared
    )

    // Transform dates for response
    const transformedLocation = {
      ...location,
      lastUpdated: location.lastUpdated.toISOString()
    }

    this.sendSuccess(res, transformedLocation, 'Location updated successfully')
  })

  /**
   * Get user location
   * GET /api/presence/location/:userId
   */
  getUserLocation = this.asyncHandler(async (req: Request, res: Response) => {
    const currentUserId = this.getUserId(req)
    const targetUserId = req.params.userId

    const paramsSchema = z.object({
      userId: z.string().min(1, 'User ID is required')
    })

    this.getPathParams(req, paramsSchema)

    // Users can only view their own location unless it's shared
    if (currentUserId !== targetUserId) {
      const location = await presenceService.getUserLocation(targetUserId)
      if (!location || !location.isShared) {
        this.sendSuccess(res, null, 'Location not available or not shared')
        return
      }
    }

    this.logAction('getUserLocation', currentUserId, { targetUserId })

    const location = await presenceService.getUserLocation(targetUserId)

    if (!location) {
      this.sendSuccess(res, null, 'User location not found')
      return
    }

    // Transform dates for response and filter sensitive data if not own location
    let transformedLocation: any = {
      ...location,
      lastUpdated: location.lastUpdated.toISOString()
    }

    // If viewing someone else's location, only show public info
    if (currentUserId !== targetUserId) {
      transformedLocation = {
        userId: location.userId,
        country: location.country,
        city: location.city,
        timezone: location.timezone,
        lastUpdated: location.lastUpdated.toISOString(),
        isShared: location.isShared
      }
    }

    this.sendSuccess(res, transformedLocation, 'User location retrieved successfully')
  })

  /**
   * Get nearby users
   * GET /api/presence/nearby
   */
  getNearbyUsers = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const querySchema = z.object({
      radiusKm: z.coerce.number().positive().max(100).default(10),
      limit: z.coerce.number().min(1).max(50).default(20)
    })

    const query = this.getQueryParams(req, querySchema)

    this.logAction('getNearbyUsers', userId, {
      radiusKm: query.radiusKm,
      limit: query.limit
    })

    const nearbyUsers = await presenceService.getNearbyUsers(userId, query.radiusKm, query.limit)

    // Transform dates for response
    const transformedNearbyUsers = nearbyUsers.map(user => ({
      ...user,
      location: {
        ...user.location,
        lastUpdated: user.location.lastUpdated.toISOString()
      }
    }))

    this.sendSuccess(res, {
      nearbyUsers: transformedNearbyUsers,
      count: transformedNearbyUsers.length,
      radiusKm: query.radiusKm
    }, 'Nearby users retrieved successfully')
  })

  /**
   * Get presence statistics (Admin only)
   * GET /api/presence/stats
   */
  getPresenceStatistics = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    this.requireAdmin(req)

    this.logAction('getPresenceStatistics', userId)

    const stats = await presenceService.getPresenceStatistics()

    this.sendSuccess(res, stats, 'Presence statistics retrieved successfully')
  })

  /**
   * Clean up expired presence data (Admin only)
   * POST /api/presence/cleanup
   */
  cleanupExpiredPresence = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    this.requireAdmin(req)

    this.logAction('cleanupExpiredPresence', userId)

    const cleanedCount = await presenceService.cleanupExpiredPresence()

    this.sendSuccess(res, {
      cleanedCount,
      cleanedUp: true,
      timestamp: new Date().toISOString()
    }, `Cleaned up ${cleanedCount} expired presence records successfully`)
  })

  /**
   * Get my presence summary
   * GET /api/presence/me
   */
  getMyPresence = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    this.logAction('getMyPresence', userId)

    const [presence, activityStatus, location] = await Promise.all([
      presenceService.getUserPresence(userId),
      presenceService.getUserActivityStatus(userId),
      presenceService.getUserLocation(userId)
    ])

    const summary = {
      presence: presence ? {
        ...presence,
        lastSeen: presence.lastSeen.toISOString()
      } : null,
      activity: activityStatus ? {
        ...activityStatus,
        startedAt: activityStatus.startedAt.toISOString(),
        expiresAt: activityStatus.expiresAt?.toISOString() || null
      } : null,
      location: location ? {
        ...location,
        lastUpdated: location.lastUpdated.toISOString()
      } : null
    }

    this.sendSuccess(res, summary, 'Presence summary retrieved successfully')
  })

  /**
   * Bulk update presence for multiple users (Admin only)
   * POST /api/presence/bulk-update
   */
  bulkUpdatePresence = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    this.requireAdmin(req)

    const bodySchema = z.object({
      updates: z.array(z.object({
        userId: z.string().min(1),
        status: z.enum(['online', 'away', 'busy', 'invisible', 'offline']),
        customMessage: z.string().max(100).optional()
      })).min(1, 'At least one update is required').max(100, 'Maximum 100 updates at once')
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('bulkUpdatePresence', userId, {
      updateCount: body.updates.length
    })

    const results = await this.handleBulkOperation(
      body.updates,
      async (update) => {
        return await presenceService.updatePresence(
          update.userId,
          update.status,
          update.customMessage
        )
      },
      { continueOnError: true }
    )

    this.sendSuccess(res, {
      successful: results.successful.length,
      failed: results.failed.length,
      errors: results.failed
    }, 'Bulk presence update completed')
  })
}

// Export singleton instance
export const presenceController = new PresenceController()
