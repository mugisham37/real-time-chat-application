import { Request, Response } from 'express'
import { z } from 'zod'
import { BaseController } from './base.controller'
import { scheduledMessageService } from '../services/scheduledMessage.service'

/**
 * Scheduled Message Controller
 * Handles message scheduling, management, and automated delivery
 */
export class ScheduledMessageController extends BaseController {
  /**
   * Schedule a message
   * POST /api/scheduled-messages
   */
  scheduleMessage = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const bodySchema = z.object({
      conversationId: z.string().min(1, 'Conversation ID is required'),
      conversationType: z.enum(['DIRECT', 'GROUP']),
      content: z.string().min(1, 'Message content is required').max(10000, 'Message too long'),
      type: z.enum(['TEXT', 'IMAGE', 'FILE', 'AUDIO', 'VIDEO']).default('TEXT'),
      scheduledFor: z.string().datetime('Invalid scheduled date'),
      attachments: z.array(z.object({
        url: z.string().url('Invalid attachment URL'),
        type: z.string().min(1, 'Attachment type is required'),
        name: z.string().min(1, 'Attachment name is required'),
        size: z.number().positive('Attachment size must be positive')
      })).optional(),
      mentions: z.array(z.string()).optional(),
      replyToId: z.string().optional()
    })

    const body = this.getBodyParams(req, bodySchema)

    // Validate scheduled time is in the future
    const scheduledDate = new Date(body.scheduledFor)
    if (scheduledDate <= new Date()) {
      this.sendSuccess(res, {
        scheduled: false,
        error: 'Scheduled time must be in the future'
      }, 'Invalid scheduled time')
      return
    }

    this.logAction('scheduleMessage', userId, {
      conversationId: body.conversationId,
      conversationType: body.conversationType,
      scheduledFor: body.scheduledFor,
      hasAttachments: body.attachments && body.attachments.length > 0
    })

    const scheduledMessage = await scheduledMessageService.scheduleMessage(
      {
        senderId: userId,
        conversationId: body.conversationId,
        conversationType: body.conversationType,
        content: body.content,
        type: body.type,
        attachments: body.attachments,
        mentions: body.mentions,
        replyToId: body.replyToId
      },
      scheduledDate
    )

    // Transform dates for response
    const transformedMessage = {
      ...scheduledMessage,
      createdAt: scheduledMessage.createdAt?.toISOString() || null,
      scheduledFor: scheduledMessage.scheduledFor?.toISOString() || null
    }

    this.sendSuccess(res, transformedMessage, 'Message scheduled successfully', 201)
  })

  /**
   * Get user's scheduled messages
   * GET /api/scheduled-messages/my-messages
   */
  getUserScheduledMessages = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const querySchema = z.object({
      status: z.enum(['SCHEDULED', 'SENT', 'CANCELLED']).optional(),
      limit: z.coerce.number().min(1).max(100).default(20),
      skip: z.coerce.number().min(0).default(0)
    })

    const query = this.getQueryParams(req, querySchema)

    this.logAction('getUserScheduledMessages', userId, {
      status: query.status,
      limit: query.limit
    })

    const messages = await scheduledMessageService.getUserScheduledMessages(userId)

    // Filter by status if provided
    let filteredMessages = messages
    if (query.status) {
      filteredMessages = messages.filter(msg => msg.status === query.status)
    }

    // Apply pagination
    const skip = query.skip || 0
    const limit = query.limit || 20
    const paginatedMessages = filteredMessages.slice(skip, skip + limit)

    // Transform dates for response
    const transformedMessages = paginatedMessages.map(message => ({
      ...message,
      createdAt: message.createdAt?.toISOString() || null,
      scheduledFor: message.scheduledFor?.toISOString() || null,
      updatedAt: message.updatedAt?.toISOString() || null
    }))

    const pagination = this.calculatePagination(
      Math.floor(skip / limit) + 1,
      limit,
      filteredMessages.length
    )

    this.sendSuccess(res, {
      messages: transformedMessages,
      totalCount: filteredMessages.length
    }, 'Scheduled messages retrieved successfully', 200, pagination)
  })

  /**
   * Update scheduled message
   * PUT /api/scheduled-messages/:id
   */
  updateScheduledMessage = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const messageId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Message ID is required')
    })

    const bodySchema = z.object({
      content: z.string().min(1).max(10000).optional(),
      scheduledFor: z.string().datetime().optional(),
      attachments: z.array(z.object({
        url: z.string().url(),
        type: z.string().min(1),
        name: z.string().min(1),
        size: z.number().positive()
      })).optional()
    })

    this.getPathParams(req, paramsSchema)
    const body = this.getBodyParams(req, bodySchema)

    // Validate scheduled time is in the future if provided
    if (body.scheduledFor) {
      const scheduledDate = new Date(body.scheduledFor)
      if (scheduledDate <= new Date()) {
        this.sendSuccess(res, {
          updated: false,
          error: 'Scheduled time must be in the future'
        }, 'Invalid scheduled time')
        return
      }
    }

    this.logAction('updateScheduledMessage', userId, {
      messageId,
      hasContent: !!body.content,
      hasScheduledFor: !!body.scheduledFor
    })

    const updates: any = {}
    if (body.content) updates.content = body.content
    if (body.attachments) updates.attachments = body.attachments
    if (body.scheduledFor) updates.scheduledFor = new Date(body.scheduledFor)

    const updatedMessage = await scheduledMessageService.updateScheduledMessage(
      messageId,
      userId,
      updates
    )

    // Transform dates for response
    const transformedMessage = {
      ...updatedMessage,
      createdAt: updatedMessage.createdAt?.toISOString() || null,
      scheduledFor: updatedMessage.scheduledFor?.toISOString() || null,
      updatedAt: updatedMessage.updatedAt?.toISOString() || null
    }

    this.sendSuccess(res, transformedMessage, 'Scheduled message updated successfully')
  })

  /**
   * Cancel scheduled message
   * DELETE /api/scheduled-messages/:id
   */
  cancelScheduledMessage = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const messageId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Message ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('cancelScheduledMessage', userId, { messageId })

    const cancelled = await scheduledMessageService.cancelScheduledMessage(messageId, userId)

    this.sendSuccess(res, {
      cancelled,
      messageId,
      cancelledAt: new Date().toISOString()
    }, cancelled ? 'Scheduled message cancelled successfully' : 'Failed to cancel scheduled message')
  })

  /**
   * Get scheduled message statistics
   * GET /api/scheduled-messages/stats
   */
  getScheduledMessageStats = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    this.logAction('getScheduledMessageStats', userId)

    const stats = await scheduledMessageService.getUserScheduledMessageStats(userId)

    // Transform dates for response
    const transformedStats = {
      ...stats,
      nextScheduledAt: stats.nextScheduledAt?.toISOString() || null
    }

    this.sendSuccess(res, transformedStats, 'Scheduled message statistics retrieved successfully')
  })

  /**
   * Get conversation scheduled messages
   * GET /api/scheduled-messages/conversation/:conversationId
   */
  getConversationScheduledMessages = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const conversationId = req.params.conversationId

    const paramsSchema = z.object({
      conversationId: z.string().min(1, 'Conversation ID is required')
    })

    const querySchema = z.object({
      limit: z.coerce.number().min(1).max(100).default(20),
      skip: z.coerce.number().min(0).default(0)
    })

    this.getPathParams(req, paramsSchema)
    const query = this.getQueryParams(req, querySchema)

    this.logAction('getConversationScheduledMessages', userId, {
      conversationId,
      limit: query.limit
    })

    const messages = await scheduledMessageService.getConversationScheduledMessages(
      conversationId,
      userId,
      {
        limit: query.limit,
        offset: query.skip
      }
    )

    // Transform dates for response
    const transformedMessages = messages.map(message => ({
      ...message,
      createdAt: message.createdAt?.toISOString() || null,
      scheduledFor: message.scheduledFor?.toISOString() || null,
      updatedAt: message.updatedAt?.toISOString() || null
    }))

    const pagination = this.calculatePagination(
      Math.floor((query.skip || 0) / (query.limit || 20)) + 1,
      query.limit || 20,
      transformedMessages.length
    )

    this.sendSuccess(res, {
      conversationId,
      messages: transformedMessages
    }, 'Conversation scheduled messages retrieved successfully', 200, pagination)
  })

  /**
   * Bulk cancel scheduled messages
   * POST /api/scheduled-messages/bulk-cancel
   */
  bulkCancelScheduledMessages = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const bodySchema = z.object({
      messageIds: z.array(z.string().min(1)).min(1, 'At least one message ID is required').max(50, 'Maximum 50 messages at once')
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('bulkCancelScheduledMessages', userId, {
      messageCount: body.messageIds.length
    })

    const result = await scheduledMessageService.bulkCancelScheduledMessages(body.messageIds, userId)

    this.sendSuccess(res, {
      successful: result.successful.length,
      failed: result.failed.length,
      successfulIds: result.successful,
      errors: result.failed
    }, 'Bulk cancel operation completed')
  })

  /**
   * Process due scheduled messages (Admin only)
   * POST /api/scheduled-messages/process-due
   */
  processDueScheduledMessages = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    this.requireAdmin(req)

    this.logAction('processDueScheduledMessages', userId)

    const processedCount = await scheduledMessageService.processDueScheduledMessages()

    this.sendSuccess(res, {
      processedCount,
      processedAt: new Date().toISOString()
    }, `Processed ${processedCount} due scheduled messages successfully`)
  })

  /**
   * Get all scheduled messages (Admin only)
   * GET /api/scheduled-messages/all
   */
  getAllScheduledMessages = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    this.requireAdmin(req)

    const querySchema = z.object({
      limit: z.coerce.number().min(1).max(100).default(50),
      offset: z.coerce.number().min(0).default(0),
      status: z.enum(['SCHEDULED', 'SENT', 'CANCELLED']).optional()
    })

    const query = this.getQueryParams(req, querySchema)

    this.logAction('getAllScheduledMessages', userId, {
      limit: query.limit,
      status: query.status
    })

    const result = await scheduledMessageService.getAllScheduledMessages({
      limit: query.limit,
      offset: query.offset,
      status: query.status
    })

    // Transform dates for response
    const transformedMessages = result.messages.map(message => ({
      ...message,
      createdAt: message.createdAt?.toISOString() || null,
      scheduledFor: message.scheduledFor?.toISOString() || null,
      updatedAt: message.updatedAt?.toISOString() || null
    }))

    const pagination = this.calculatePagination(
      Math.floor((query.offset || 0) / (query.limit || 50)) + 1,
      query.limit || 50,
      result.total
    )

    this.sendSuccess(res, {
      messages: transformedMessages,
      total: result.total
    }, 'All scheduled messages retrieved successfully', 200, pagination)
  })

  /**
   * Clean up old scheduled messages (Admin only)
   * POST /api/scheduled-messages/cleanup
   */
  cleanupOldScheduledMessages = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    this.requireAdmin(req)

    const bodySchema = z.object({
      olderThanDays: z.number().positive().max(365).default(30)
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('cleanupOldScheduledMessages', userId, {
      olderThanDays: body.olderThanDays
    })

    const deletedCount = await scheduledMessageService.cleanupOldScheduledMessages(body.olderThanDays)

    this.sendSuccess(res, {
      deletedCount,
      olderThanDays: body.olderThanDays,
      cleanedUp: true,
      timestamp: new Date().toISOString()
    }, `Cleaned up ${deletedCount} old scheduled messages successfully`)
  })

  /**
   * Get scheduled message by ID
   * GET /api/scheduled-messages/:id
   */
  getScheduledMessage = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const messageId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Message ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('getScheduledMessage', userId, { messageId })

    // Get user's scheduled messages and find the specific one
    const userMessages = await scheduledMessageService.getUserScheduledMessages(userId)
    const message = userMessages.find(msg => msg.id === messageId)

    if (!message) {
      this.sendSuccess(res, null, 'Scheduled message not found')
      return
    }

    // Transform dates for response
    const transformedMessage = {
      ...message,
      createdAt: message.createdAt?.toISOString() || null,
      scheduledFor: message.scheduledFor?.toISOString() || null,
      updatedAt: message.updatedAt?.toISOString() || null
    }

    this.sendSuccess(res, transformedMessage, 'Scheduled message retrieved successfully')
  })

  /**
   * Get upcoming scheduled messages
   * GET /api/scheduled-messages/upcoming
   */
  getUpcomingScheduledMessages = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const querySchema = z.object({
      hours: z.coerce.number().positive().max(168).default(24), // Max 1 week
      limit: z.coerce.number().min(1).max(50).default(10)
    })

    const query = this.getQueryParams(req, querySchema)

    this.logAction('getUpcomingScheduledMessages', userId, {
      hours: query.hours,
      limit: query.limit
    })

    const userMessages = await scheduledMessageService.getUserScheduledMessages(userId)

    // Filter for upcoming messages within the specified time frame
    const now = new Date()
    const cutoffTime = new Date(now.getTime() + query.hours * 60 * 60 * 1000)

    const upcomingMessages = userMessages
      .filter(msg => 
        msg.status === 'SCHEDULED' && 
        new Date(msg.scheduledFor) > now && 
        new Date(msg.scheduledFor) <= cutoffTime
      )
      .sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime())
      .slice(0, query.limit)

    // Transform dates for response
    const transformedMessages = upcomingMessages.map(message => ({
      ...message,
      createdAt: message.createdAt?.toISOString() || null,
      scheduledFor: message.scheduledFor?.toISOString() || null,
      updatedAt: message.updatedAt?.toISOString() || null,
      timeUntilSend: new Date(message.scheduledFor).getTime() - now.getTime()
    }))

    this.sendSuccess(res, {
      messages: transformedMessages,
      count: transformedMessages.length,
      timeFrame: `${query.hours} hours`
    }, 'Upcoming scheduled messages retrieved successfully')
  })

  /**
   * Reschedule message
   * POST /api/scheduled-messages/:id/reschedule
   */
  rescheduleMessage = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const messageId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Message ID is required')
    })

    const bodySchema = z.object({
      scheduledFor: z.string().datetime('Invalid scheduled date')
    })

    this.getPathParams(req, paramsSchema)
    const body = this.getBodyParams(req, bodySchema)

    // Validate scheduled time is in the future
    const scheduledDate = new Date(body.scheduledFor)
    if (scheduledDate <= new Date()) {
      this.sendSuccess(res, {
        rescheduled: false,
        error: 'Scheduled time must be in the future'
      }, 'Invalid scheduled time')
      return
    }

    this.logAction('rescheduleMessage', userId, {
      messageId,
      newScheduledFor: body.scheduledFor
    })

    const updatedMessage = await scheduledMessageService.updateScheduledMessage(
      messageId,
      userId,
      { scheduledFor: scheduledDate }
    )

    // Transform dates for response
    const transformedMessage = {
      ...updatedMessage,
      createdAt: updatedMessage.createdAt?.toISOString() || null,
      scheduledFor: updatedMessage.scheduledFor?.toISOString() || null,
      updatedAt: updatedMessage.updatedAt?.toISOString() || null
    }

    this.sendSuccess(res, {
      rescheduled: true,
      message: transformedMessage,
      previousScheduledFor: body.scheduledFor
    }, 'Message rescheduled successfully')
  })
}

// Export singleton instance
export const scheduledMessageController = new ScheduledMessageController()
