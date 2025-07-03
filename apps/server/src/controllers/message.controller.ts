import { Request, Response } from 'express'
import { z } from 'zod'
import { BaseController } from './base.controller'
import { messageService } from '../services/message.service'

/**
 * Message Controller
 * Handles message creation, retrieval, updates, reactions, and search
 */
export class MessageController extends BaseController {
  /**
   * Create a new message
   * POST /api/messages
   */
  createMessage = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const bodySchema = z.object({
      conversationId: z.string().min(1, 'Conversation ID is required'),
      content: z.string().min(1, 'Message content is required').max(10000, 'Message too long'),
      type: z.enum(['TEXT', 'IMAGE', 'FILE', 'AUDIO', 'VIDEO', 'SYSTEM']).default('TEXT'),
      attachments: z.array(z.object({
        url: z.string().url('Invalid attachment URL'),
        type: z.string().min(1, 'Attachment type is required'),
        name: z.string().min(1, 'Attachment name is required'),
        size: z.number().positive('Attachment size must be positive')
      })).optional(),
      mentions: z.array(z.string()).optional(),
      replyTo: z.string().optional(),
      metadata: z.record(z.any()).optional()
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('createMessage', userId, {
      conversationId: body.conversationId,
      type: body.type,
      hasAttachments: body.attachments && body.attachments.length > 0,
      mentionsCount: body.mentions?.length || 0,
      isReply: !!body.replyTo
    })

    const message = await messageService.createMessage({
      conversationId: body.conversationId,
      senderId: userId,
      content: body.content,
      type: body.type,
      attachments: body.attachments,
      mentions: body.mentions,
      replyTo: body.replyTo,
      metadata: body.metadata
    })

    // Transform dates for response
    const transformedMessage = this.transformMessageDates(message)

    this.sendSuccess(res, transformedMessage, 'Message created successfully', 201)
  })

  /**
   * Get message by ID
   * GET /api/messages/:id
   */
  getMessage = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const messageId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Message ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('getMessage', userId, { messageId })

    const message = await messageService.getMessage(messageId, userId)

    const transformedMessage = this.transformMessageDates(message)

    this.sendSuccess(res, transformedMessage, 'Message retrieved successfully')
  })

  /**
   * Update message
   * PUT /api/messages/:id
   */
  updateMessage = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const messageId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Message ID is required')
    })

    const bodySchema = z.object({
      content: z.string().min(1).max(10000).optional(),
      attachments: z.array(z.object({
        url: z.string().url(),
        type: z.string().min(1),
        name: z.string().min(1),
        size: z.number().positive()
      })).optional(),
      metadata: z.record(z.any()).optional()
    })

    this.getPathParams(req, paramsSchema)
    const body = this.getBodyParams(req, bodySchema)

    this.logAction('updateMessage', userId, {
      messageId,
      hasContent: !!body.content,
      hasAttachments: body.attachments && body.attachments.length > 0
    })

    const updatedMessage = await messageService.updateMessage(messageId, userId, body)

    const transformedMessage = this.transformMessageDates(updatedMessage)

    this.sendSuccess(res, transformedMessage, 'Message updated successfully')
  })

  /**
   * Delete message
   * DELETE /api/messages/:id
   */
  deleteMessage = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const messageId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Message ID is required')
    })

    const querySchema = z.object({
      hard: z.coerce.boolean().default(false)
    })

    this.getPathParams(req, paramsSchema)
    const query = this.getQueryParams(req, querySchema)

    this.logAction('deleteMessage', userId, {
      messageId,
      hardDelete: query.hard
    })

    const deletedMessage = await messageService.deleteMessage(messageId, userId, query.hard)

    const transformedMessage = this.transformMessageDates(deletedMessage)

    this.sendSuccess(res, transformedMessage, 'Message deleted successfully')
  })

  /**
   * Add reaction to message
   * POST /api/messages/:id/reactions
   */
  addReaction = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const messageId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Message ID is required')
    })

    const bodySchema = z.object({
      reactionType: z.string().min(1, 'Reaction type is required').max(50, 'Reaction type too long')
    })

    this.getPathParams(req, paramsSchema)
    const body = this.getBodyParams(req, bodySchema)

    this.logAction('addReaction', userId, {
      messageId,
      reactionType: body.reactionType
    })

    const updatedMessage = await messageService.addReaction(messageId, userId, body.reactionType)

    const transformedMessage = this.transformMessageDates(updatedMessage)

    this.sendSuccess(res, transformedMessage, 'Reaction added successfully')
  })

  /**
   * Remove reaction from message
   * DELETE /api/messages/:id/reactions/:reactionType
   */
  removeReaction = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const messageId = req.params.id
    const reactionType = req.params.reactionType

    const paramsSchema = z.object({
      id: z.string().min(1, 'Message ID is required'),
      reactionType: z.string().min(1, 'Reaction type is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('removeReaction', userId, {
      messageId,
      reactionType
    })

    const updatedMessage = await messageService.removeReaction(messageId, userId, reactionType)

    const transformedMessage = this.transformMessageDates(updatedMessage)

    this.sendSuccess(res, transformedMessage, 'Reaction removed successfully')
  })

  /**
   * Mark message as read
   * POST /api/messages/:id/read
   */
  markAsRead = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const messageId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Message ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('markAsRead', userId, { messageId })

    const message = await messageService.markMessageAsRead(messageId, userId)

    const transformedMessage = this.transformMessageDates(message)

    this.sendSuccess(res, transformedMessage, 'Message marked as read successfully')
  })

  /**
   * Search messages
   * GET /api/messages/search
   */
  searchMessages = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const querySchema = z.object({
      query: z.string().min(1, 'Search query is required'),
      conversationId: z.string().optional(),
      limit: z.coerce.number().min(1).max(100).default(20),
      skip: z.coerce.number().min(0).default(0),
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional()
    })

    const query = this.getQueryParams(req, querySchema)

    this.logAction('searchMessages', userId, {
      searchQuery: query.query,
      conversationId: query.conversationId,
      limit: query.limit
    })

    const messages = await messageService.searchMessages(userId, query.query, {
      conversationId: query.conversationId,
      limit: query.limit,
      skip: query.skip,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined
    })

    const transformedMessages = messages.map(message => this.transformMessageDates(message))

    const pagination = this.calculatePagination(
      Math.floor((query.skip || 0) / (query.limit || 20)) + 1,
      query.limit || 20,
      transformedMessages.length
    )

    this.sendSuccess(res, transformedMessages, 'Message search completed successfully', 200, pagination)
  })

  /**
   * Get conversation message statistics
   * GET /api/messages/conversations/:conversationId/stats
   */
  getConversationMessageStats = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const conversationId = req.params.conversationId

    const paramsSchema = z.object({
      conversationId: z.string().min(1, 'Conversation ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('getConversationMessageStats', userId, { conversationId })

    const stats = await messageService.getConversationMessageStats(conversationId, userId)

    this.sendSuccess(res, stats, 'Conversation message statistics retrieved successfully')
  })

  /**
   * Get user message statistics
   * GET /api/messages/my-stats
   */
  getUserMessageStats = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    this.logAction('getUserMessageStats', userId)

    const stats = await messageService.getUserMessageStats(userId)

    this.sendSuccess(res, stats, 'User message statistics retrieved successfully')
  })

  /**
   * Get message thread (replies)
   * GET /api/messages/:id/thread
   */
  getMessageThread = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const messageId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Message ID is required')
    })

    const querySchema = z.object({
      limit: z.coerce.number().min(1).max(100).default(20),
      skip: z.coerce.number().min(0).default(0)
    })

    this.getPathParams(req, paramsSchema)
    const query = this.getQueryParams(req, querySchema)

    this.logAction('getMessageThread', userId, { messageId })

    // First verify user has access to the original message
    await messageService.getMessage(messageId, userId)

    // This would require implementing thread retrieval in the service
    const thread = {
      originalMessageId: messageId,
      replies: [],
      totalReplies: 0,
      message: 'Message thread retrieval will be implemented with database integration'
    }

    const pagination = this.calculatePagination(
      Math.floor((query.skip || 0) / (query.limit || 20)) + 1,
      query.limit || 20,
      0
    )

    this.sendSuccess(res, thread, 'Message thread retrieved successfully', 200, pagination)
  })

  /**
   * Get message reactions
   * GET /api/messages/:id/reactions
   */
  getMessageReactions = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const messageId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Message ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('getMessageReactions', userId, { messageId })

    const message = await messageService.getMessage(messageId, userId)

    // Extract reactions from message
    const reactions = message.reactions || []

    // Group reactions by type
    const groupedReactions = reactions.reduce((acc: any, reaction: any) => {
      if (!acc[reaction.type]) {
        acc[reaction.type] = {
          type: reaction.type,
          count: 0,
          users: []
        }
      }
      acc[reaction.type].count++
      acc[reaction.type].users.push({
        userId: reaction.userId,
        createdAt: reaction.createdAt
      })
      return acc
    }, {})

    const reactionSummary = {
      messageId,
      totalReactions: reactions.length,
      reactionTypes: Object.values(groupedReactions),
      userReaction: reactions.find((r: any) => r.userId === userId)?.type || null
    }

    this.sendSuccess(res, reactionSummary, 'Message reactions retrieved successfully')
  })

  /**
   * Get messages by conversation with pagination
   * GET /api/messages/conversations/:conversationId
   */
  getConversationMessages = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const conversationId = req.params.conversationId

    const paramsSchema = z.object({
      conversationId: z.string().min(1, 'Conversation ID is required')
    })

    const querySchema = z.object({
      limit: z.coerce.number().min(1).max(100).default(20),
      before: z.string().datetime().optional(),
      after: z.string().datetime().optional(),
      messageType: z.enum(['TEXT', 'IMAGE', 'FILE', 'AUDIO', 'VIDEO', 'SYSTEM']).optional()
    })

    this.getPathParams(req, paramsSchema)
    const query = this.getQueryParams(req, querySchema)

    this.logAction('getConversationMessages', userId, {
      conversationId,
      limit: query.limit,
      messageType: query.messageType
    })

    // This would use the conversation service to get messages
    // For now, return a placeholder response
    const messages = {
      conversationId,
      messages: [],
      hasMore: false,
      message: 'Conversation messages retrieval will be implemented with conversation service integration'
    }

    this.sendSuccess(res, messages, 'Conversation messages retrieved successfully')
  })

  /**
   * Pin/Unpin message
   * POST /api/messages/:id/pin
   */
  toggleMessagePin = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const messageId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Message ID is required')
    })

    const bodySchema = z.object({
      pinned: z.boolean()
    })

    this.getPathParams(req, paramsSchema)
    const body = this.getBodyParams(req, bodySchema)

    this.logAction('toggleMessagePin', userId, {
      messageId,
      pinned: body.pinned
    })

    // First verify user has access to the message
    const message = await messageService.getMessage(messageId, userId)

    // This would require implementing pin functionality in the service
    const result = {
      messageId,
      pinned: body.pinned,
      pinnedBy: userId,
      pinnedAt: body.pinned ? new Date().toISOString() : null,
      message: 'Message pin functionality will be implemented with database integration'
    }

    this.sendSuccess(res, result, `Message ${body.pinned ? 'pinned' : 'unpinned'} successfully`)
  })

  /**
   * Report message
   * POST /api/messages/:id/report
   */
  reportMessage = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const messageId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Message ID is required')
    })

    const bodySchema = z.object({
      reason: z.string().min(1, 'Report reason is required').max(500, 'Reason too long'),
      category: z.enum(['spam', 'harassment', 'inappropriate_content', 'violence', 'other'])
    })

    this.getPathParams(req, paramsSchema)
    const body = this.getBodyParams(req, bodySchema)

    this.logAction('reportMessage', userId, {
      messageId,
      category: body.category
    })

    // First verify user has access to the message
    await messageService.getMessage(messageId, userId)

    // This would integrate with content moderation service
    const report = {
      messageId,
      reportedBy: userId,
      reason: body.reason,
      category: body.category,
      reportedAt: new Date().toISOString(),
      status: 'pending',
      message: 'Message reporting will be implemented with content moderation service integration'
    }

    this.sendSuccess(res, report, 'Message reported successfully', 201)
  })

  /**
   * Get message edit history
   * GET /api/messages/:id/history
   */
  getMessageHistory = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const messageId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Message ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('getMessageHistory', userId, { messageId })

    // First verify user has access to the message
    const message = await messageService.getMessage(messageId, userId)

    // This would require implementing edit history tracking
    const history = {
      messageId,
      currentVersion: message,
      editHistory: [],
      totalEdits: 0,
      message: 'Message edit history will be implemented with version tracking system'
    }

    this.sendSuccess(res, history, 'Message history retrieved successfully')
  })

  /**
   * Bulk operations on messages (Admin only)
   * POST /api/messages/bulk
   */
  bulkMessageOperations = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    this.requireAdmin(req)

    const bodySchema = z.object({
      operation: z.enum(['delete', 'moderate', 'export']),
      messageIds: z.array(z.string().min(1)).min(1, 'At least one message ID is required').max(100, 'Maximum 100 messages at once'),
      options: z.object({
        hardDelete: z.boolean().default(false),
        reason: z.string().optional()
      }).optional()
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('bulkMessageOperations', userId, {
      operation: body.operation,
      messageCount: body.messageIds.length
    })

    const results = await this.handleBulkOperation(
      body.messageIds,
      async (messageId: string) => {
        switch (body.operation) {
          case 'delete':
            return await messageService.deleteMessage(messageId, userId, body.options?.hardDelete || false)
          
          case 'moderate':
            // This would integrate with content moderation
            return { messageId, moderated: true, moderatedBy: userId }
          
          case 'export':
            return await messageService.getMessage(messageId, userId)
          
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
   * Helper method to transform message dates
   */
  private transformMessageDates(message: any): any {
    return {
      ...message,
      createdAt: message.createdAt?.toISOString() || null,
      updatedAt: message.updatedAt?.toISOString() || null,
      editedAt: message.editedAt?.toISOString() || null,
      reactions: message.reactions?.map((reaction: any) => ({
        ...reaction,
        createdAt: reaction.createdAt?.toISOString() || null
      })) || []
    }
  }
}

// Export singleton instance
export const messageController = new MessageController()
