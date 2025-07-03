import { Request, Response } from 'express'
import { z } from 'zod'
import { BaseController } from './base.controller'
import { notificationService } from '../services/notification.service'
import { NotificationBuilder } from '../utils/notificationBuilder'
import { validateNotificationData } from '../utils/typeGuards'

/**
 * Notification Controller
 * Handles real-time notifications, preferences, and notification management
 */
export class NotificationController extends BaseController {
  /**
   * Get user notifications with advanced filtering
   * GET /api/notifications
   */
  getNotifications = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const querySchema = z.object({
      limit: z.coerce.number().min(1).max(100).default(20),
      skip: z.coerce.number().min(0).default(0),
      isRead: z.coerce.boolean().optional(),
      type: z.enum(['new_message', 'mention', 'message_reaction', 'group_invite', 'incoming_call', 'missed_call', 'call_ended']).optional(),
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional()
    })

    const query = this.getQueryParams(req, querySchema)

    this.logAction('getNotifications', userId, {
      limit: query.limit,
      skip: query.skip,
      filters: { isRead: query.isRead, type: query.type }
    })

    const result = await notificationService.getUserNotifications(userId, {
      limit: query.limit,
      skip: query.skip,
      isRead: query.isRead,
      type: query.type
    })

    // Transform notifications for response
    const transformedNotifications = result.notifications.map(notification => ({
      ...notification,
      createdAt: notification.createdAt?.toISOString() || null,
      updatedAt: notification.updatedAt?.toISOString() || null
    }))

    const pagination = this.calculatePagination(
      Math.floor((query.skip || 0) / (query.limit || 20)) + 1,
      query.limit || 20,
      result.totalCount
    )

    this.sendSuccess(res, {
      notifications: transformedNotifications,
      unreadCount: result.unreadCount,
      totalCount: result.totalCount
    }, 'Notifications retrieved successfully', 200, pagination)
  })

  /**
   * Get unread notifications count
   * GET /api/notifications/unread-count
   */
  getUnreadCount = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    this.logAction('getUnreadCount', userId)

    const unreadCount = await notificationService.getUnreadCount(userId)

    this.sendSuccess(res, { unreadCount }, 'Unread count retrieved successfully')
  })

  /**
   * Mark notification as read
   * PUT /api/notifications/:id/read
   */
  markAsRead = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const notificationId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Notification ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('markAsRead', userId, { notificationId })

    const notification = await notificationService.markAsRead(notificationId, userId)

    // Transform notification for response
    const transformedNotification = {
      ...notification,
      createdAt: notification.createdAt?.toISOString() || null,
      updatedAt: notification.updatedAt?.toISOString() || null
    }

    this.sendSuccess(res, transformedNotification, 'Notification marked as read successfully')
  })

  /**
   * Mark all notifications as read
   * PUT /api/notifications/mark-all-read
   */
  markAllAsRead = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    this.logAction('markAllAsRead', userId)

    const result = await notificationService.markAllAsRead(userId)

    this.sendSuccess(res, result, 'All notifications marked as read successfully')
  })

  /**
   * Delete notification
   * DELETE /api/notifications/:id
   */
  deleteNotification = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const notificationId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Notification ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('deleteNotification', userId, { notificationId })

    const deleted = await notificationService.deleteNotification(notificationId, userId)

    this.sendSuccess(res, { deleted }, 'Notification deleted successfully')
  })

  /**
   * Delete all notifications
   * DELETE /api/notifications/all
   */
  deleteAllNotifications = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    this.logAction('deleteAllNotifications', userId)

    const result = await notificationService.deleteAllNotifications(userId)

    this.sendSuccess(res, result, 'All notifications deleted successfully')
  })

  /**
   * Get notification preferences
   * GET /api/notifications/preferences
   */
  getNotificationPreferences = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    this.logAction('getNotificationPreferences', userId)

    const preferences = await notificationService.getNotificationPreferences(userId)

    this.sendSuccess(res, preferences, 'Notification preferences retrieved successfully')
  })

  /**
   * Update notification preferences
   * PUT /api/notifications/preferences
   */
  updateNotificationPreferences = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const bodySchema = z.object({
      messages: z.boolean().optional(),
      mentions: z.boolean().optional(),
      reactions: z.boolean().optional(),
      calls: z.boolean().optional(),
      groups: z.boolean().optional(),
      email: z.boolean().optional(),
      push: z.boolean().optional()
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('updateNotificationPreferences', userId, { preferences: Object.keys(body) })

    const updatedPreferences = await notificationService.updateNotificationPreferences(userId, body)

    this.sendSuccess(res, updatedPreferences, 'Notification preferences updated successfully')
  })

  /**
   * Create custom notification (Admin only)
   * POST /api/notifications/create
   */
  createNotification = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    this.requireAdmin(req)

    // Use NotificationBuilder for proper validation and type safety
    const { recipient, type, content, relatedId, relatedType, metadata } = req.body

    this.logAction('createNotification', userId, {
      recipient,
      type
    })

    // Validate and create notification using NotificationBuilder
    const validatedNotificationData = NotificationBuilder.createCustomNotification({
      recipient,
      sender: userId,
      type,
      content,
      relatedId,
      relatedType,
      metadata
    })

    const notification = await notificationService.createNotification(validatedNotificationData)

    // Transform notification for response
    const transformedNotification = {
      ...notification,
      createdAt: notification.createdAt?.toISOString() || null,
      updatedAt: notification.updatedAt?.toISOString() || null
    }

    this.sendSuccess(res, transformedNotification, 'Notification created successfully', 201)
  })

  /**
   * Bulk mark notifications as read
   * PUT /api/notifications/bulk/mark-read
   */
  bulkMarkAsRead = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const bodySchema = z.object({
      notificationIds: z.array(z.string().min(1)).min(1, 'At least one notification ID is required').max(100, 'Maximum 100 notifications at once')
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('bulkMarkAsRead', userId, {
      notificationCount: body.notificationIds.length
    })

    const results = await this.handleBulkOperation(
      body.notificationIds,
      async (notificationId: string) => {
        return await notificationService.markAsRead(notificationId, userId)
      },
      { continueOnError: true }
    )

    this.sendSuccess(res, {
      successful: results.successful.length,
      failed: results.failed.length,
      errors: results.failed
    }, 'Bulk mark as read completed')
  })

  /**
   * Bulk delete notifications
   * DELETE /api/notifications/bulk
   */
  bulkDeleteNotifications = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const bodySchema = z.object({
      notificationIds: z.array(z.string().min(1)).min(1, 'At least one notification ID is required').max(100, 'Maximum 100 notifications at once')
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('bulkDeleteNotifications', userId, {
      notificationCount: body.notificationIds.length
    })

    const results = await this.handleBulkOperation(
      body.notificationIds,
      async (notificationId: string) => {
        return await notificationService.deleteNotification(notificationId, userId)
      },
      { continueOnError: true }
    )

    this.sendSuccess(res, {
      successful: results.successful.length,
      failed: results.failed.length,
      errors: results.failed
    }, 'Bulk delete completed')
  })

  /**
   * Get notification statistics (Admin only)
   * GET /api/notifications/stats
   */
  getNotificationStats = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    this.requireAdmin(req)

    const querySchema = z.object({
      period: z.enum(['day', 'week', 'month']).default('week'),
      userId: z.string().optional()
    })

    const query = this.getQueryParams(req, querySchema)

    this.logAction('getNotificationStats', userId, {
      period: query.period,
      targetUserId: query.userId
    })

    // This would require implementing statistics collection in the service
    const stats = {
      period: query.period,
      totalNotifications: 0,
      notificationsByType: {},
      readRate: 0,
      averageReadTime: 0,
      message: 'Notification statistics will be implemented with analytics integration'
    }

    this.sendSuccess(res, stats, 'Notification statistics retrieved successfully')
  })

  /**
   * Clean up old notifications (Admin only)
   * POST /api/notifications/cleanup
   */
  cleanupOldNotifications = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    this.requireAdmin(req)

    const bodySchema = z.object({
      olderThanDays: z.number().positive().max(365).default(30)
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('cleanupOldNotifications', userId, {
      olderThanDays: body.olderThanDays
    })

    const deletedCount = await notificationService.cleanupOldNotifications(body.olderThanDays)

    this.sendSuccess(res, {
      deletedCount,
      olderThanDays: body.olderThanDays,
      cleanedUp: true,
      timestamp: new Date().toISOString()
    }, `Cleaned up ${deletedCount} old notifications successfully`)
  })

  /**
   * Test notification system
   * POST /api/notifications/test
   */
  testNotification = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const bodySchema = z.object({
      type: z.enum(['new_message', 'mention', 'message_reaction', 'group_invite', 'incoming_call']).default('new_message'),
      content: z.string().min(1).max(500).default('This is a test notification')
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('testNotification', userId, { type: body.type })

    // Use validateNotificationData for proper type safety
    const validatedNotificationData = validateNotificationData({
      recipient: userId,
      sender: userId,
      type: body.type,
      content: body.content,
      metadata: { isTest: true }
    })

    const notification = await notificationService.createNotification(validatedNotificationData)

    // Transform notification for response
    const transformedNotification = {
      ...notification,
      createdAt: notification.createdAt?.toISOString() || null,
      updatedAt: notification.updatedAt?.toISOString() || null
    }

    this.sendSuccess(res, transformedNotification, 'Test notification sent successfully')
  })

  /**
   * Get notification delivery status
   * GET /api/notifications/:id/delivery-status
   */
  getDeliveryStatus = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const notificationId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Notification ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('getDeliveryStatus', userId, { notificationId })

    // This would require implementing delivery tracking
    const deliveryStatus = {
      notificationId,
      status: 'delivered',
      deliveredAt: new Date().toISOString(),
      readAt: null,
      deviceInfo: {
        platform: 'web',
        userAgent: req.get('User-Agent')
      },
      message: 'Delivery status tracking will be implemented with push notification service'
    }

    this.sendSuccess(res, deliveryStatus, 'Delivery status retrieved successfully')
  })

  /**
   * Subscribe to push notifications
   * POST /api/notifications/push/subscribe
   */
  subscribeToPush = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const bodySchema = z.object({
      endpoint: z.string().url('Invalid endpoint URL'),
      keys: z.object({
        p256dh: z.string().min(1, 'p256dh key is required'),
        auth: z.string().min(1, 'auth key is required')
      }),
      deviceInfo: z.object({
        type: z.enum(['web', 'mobile', 'desktop']).default('web'),
        platform: z.string().optional(),
        userAgent: z.string().optional()
      }).optional()
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('subscribeToPush', userId, {
      deviceType: body.deviceInfo?.type || 'web'
    })

    // This would require implementing push notification subscription
    const subscription = {
      userId,
      endpoint: body.endpoint,
      keys: body.keys,
      deviceInfo: body.deviceInfo || { type: 'web' as const },
      subscribedAt: new Date().toISOString(),
      isActive: true,
      message: 'Push notification subscription will be implemented with push service'
    }

    this.sendSuccess(res, subscription, 'Push notification subscription created successfully', 201)
  })

  /**
   * Unsubscribe from push notifications
   * DELETE /api/notifications/push/unsubscribe
   */
  unsubscribeFromPush = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const bodySchema = z.object({
      endpoint: z.string().url('Invalid endpoint URL')
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('unsubscribeFromPush', userId, { endpoint: body.endpoint })

    // This would require implementing push notification unsubscription
    const result = {
      unsubscribed: true,
      endpoint: body.endpoint,
      unsubscribedAt: new Date().toISOString(),
      message: 'Push notification unsubscription will be implemented with push service'
    }

    this.sendSuccess(res, result, 'Push notification unsubscription completed successfully')
  })
}

// Export singleton instance
export const notificationController = new NotificationController()
