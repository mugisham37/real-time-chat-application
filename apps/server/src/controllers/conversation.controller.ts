import { Request, Response } from 'express'
import { z } from 'zod'
import { BaseController } from './base.controller'
import { conversationService } from '../services/conversation.service'

/**
 * Conversation Controller
 * Handles conversation management, messaging, and participant operations
 */
export class ConversationController extends BaseController {
  /**
   * Create a new conversation
   * POST /api/conversations
   */
  createConversation = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const bodySchema = z.object({
      participants: z.array(z.string().min(1)).min(2, 'At least 2 participants are required'),
      type: z.enum(['DIRECT', 'GROUP']).optional()
    })

    const body = this.getBodyParams(req, bodySchema)

    // Ensure the current user is included in participants
    const participants = Array.from(new Set([userId, ...body.participants]))

    this.logAction('createConversation', userId, { 
      participantCount: participants.length,
      type: body.type 
    })

    const conversation = await conversationService.createConversation(participants)

    this.sendSuccess(res, conversation, 'Conversation created successfully', 201)
  })

  /**
   * Get conversation by ID
   * GET /api/conversations/:id
   */
  getConversation = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const conversationId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Conversation ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('getConversation', userId, { conversationId })

    const conversation = await conversationService.getConversation(conversationId, userId)

    this.sendSuccess(res, conversation, 'Conversation retrieved successfully')
  })

  /**
   * Get user's conversations
   * GET /api/conversations
   */
  getUserConversations = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const querySchema = z.object({
      limit: z.coerce.number().min(1).max(100).default(20),
      skip: z.coerce.number().min(0).default(0)
    })

    const query = this.getQueryParams(req, querySchema)

    this.logAction('getUserConversations', userId, { 
      limit: query.limit,
      skip: query.skip 
    })

    const conversations = await conversationService.getUserConversations(
      userId,
      query.limit,
      query.skip
    )

    const pagination = this.calculatePagination(
      Math.floor((query.skip ?? 0) / (query.limit ?? 20)) + 1,
      query.limit ?? 20,
      conversations.length // This would be total count in a real implementation
    )

    this.sendSuccess(res, conversations, 'Conversations retrieved successfully', 200, pagination)
  })

  /**
   * Get conversation messages
   * GET /api/conversations/:id/messages
   */
  getConversationMessages = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const conversationId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Conversation ID is required')
    })

    const querySchema = z.object({
      limit: z.coerce.number().min(1).max(100).default(20),
      before: z.string().datetime().optional()
    })

    this.getPathParams(req, paramsSchema)
    const query = this.getQueryParams(req, querySchema)

    this.logAction('getConversationMessages', userId, { 
      conversationId,
      limit: query.limit,
      before: query.before 
    })

    const messages = await conversationService.getConversationMessages(
      conversationId,
      userId,
      query.limit,
      query.before
    )

    this.sendSuccess(res, messages, 'Messages retrieved successfully')
  })

  /**
   * Update conversation
   * PUT /api/conversations/:id
   */
  updateConversation = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const conversationId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Conversation ID is required')
    })

    const bodySchema = z.object({
      name: z.string().min(1).max(100).optional(),
      description: z.string().max(500).optional(),
      avatar: z.string().url().optional(),
      settings: z.record(z.any()).optional()
    })

    this.getPathParams(req, paramsSchema)
    const body = this.getBodyParams(req, bodySchema)

    this.logAction('updateConversation', userId, { 
      conversationId,
      updates: Object.keys(body) 
    })

    const updatedConversation = await conversationService.updateConversation(
      conversationId,
      userId,
      body
    )

    this.sendSuccess(res, updatedConversation, 'Conversation updated successfully')
  })

  /**
   * Add participant to conversation
   * POST /api/conversations/:id/participants
   */
  addParticipant = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const conversationId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Conversation ID is required')
    })

    const bodySchema = z.object({
      participantId: z.string().min(1, 'Participant ID is required')
    })

    this.getPathParams(req, paramsSchema)
    const body = this.getBodyParams(req, bodySchema)

    this.logAction('addParticipant', userId, { 
      conversationId,
      participantId: body.participantId 
    })

    const updatedConversation = await conversationService.addParticipant(
      conversationId,
      userId,
      body.participantId
    )

    this.sendSuccess(res, updatedConversation, 'Participant added successfully')
  })

  /**
   * Remove participant from conversation
   * DELETE /api/conversations/:id/participants/:participantId
   */
  removeParticipant = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const conversationId = req.params.id
    const participantId = req.params.participantId

    const paramsSchema = z.object({
      id: z.string().min(1, 'Conversation ID is required'),
      participantId: z.string().min(1, 'Participant ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('removeParticipant', userId, { 
      conversationId,
      participantId 
    })

    const updatedConversation = await conversationService.removeParticipant(
      conversationId,
      userId,
      participantId
    )

    this.sendSuccess(res, updatedConversation, 'Participant removed successfully')
  })

  /**
   * Delete conversation
   * DELETE /api/conversations/:id
   */
  deleteConversation = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const conversationId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Conversation ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('deleteConversation', userId, { conversationId })

    const deleted = await conversationService.deleteConversation(conversationId, userId)

    if (deleted) {
      this.sendSuccess(res, { deleted: true }, 'Conversation deleted successfully')
    } else {
      this.sendSuccess(res, { deleted: false }, 'Conversation could not be deleted')
    }
  })

  /**
   * Mark messages as read
   * POST /api/conversations/:id/read
   */
  markMessagesAsRead = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const conversationId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Conversation ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('markMessagesAsRead', userId, { conversationId })

    await conversationService.markMessagesAsRead(conversationId, userId)

    this.sendSuccess(res, { marked: true }, 'Messages marked as read successfully')
  })

  /**
   * Get unread message count
   * GET /api/conversations/unread-count
   */
  getUnreadMessageCount = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    this.logAction('getUnreadMessageCount', userId)

    const count = await conversationService.getUnreadMessageCount(userId)

    this.sendSuccess(res, { count }, 'Unread message count retrieved successfully')
  })

  /**
   * Search conversations
   * GET /api/conversations/search
   */
  searchConversations = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const querySchema = z.object({
      query: z.string().min(1, 'Search query is required'),
      limit: z.coerce.number().min(1).max(50).default(10)
    })

    const query = this.getQueryParams(req, querySchema)

    this.logAction('searchConversations', userId, { 
      searchQuery: query.query,
      limit: query.limit 
    })

    const conversations = await conversationService.searchConversations(
      userId,
      query.query,
      query.limit
    )

    this.sendSuccess(res, conversations, 'Conversations search completed successfully')
  })

  /**
   * Get conversation statistics
   * GET /api/conversations/:id/stats
   */
  getConversationStats = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const conversationId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Conversation ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('getConversationStats', userId, { conversationId })

    const stats = await conversationService.getConversationStats(conversationId, userId)

    // Transform dates to ISO strings for JSON response
    const transformedStats = {
      ...stats,
      createdAt: stats.createdAt.toISOString(),
      lastMessageAt: stats.lastMessageAt?.toISOString() || null
    }

    this.sendSuccess(res, transformedStats, 'Conversation statistics retrieved successfully')
  })

  /**
   * Leave conversation
   * POST /api/conversations/:id/leave
   */
  leaveConversation = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const conversationId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Conversation ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('leaveConversation', userId, { conversationId })

    const updatedConversation = await conversationService.removeParticipant(
      conversationId,
      userId,
      userId // User is removing themselves
    )

    this.sendSuccess(res, updatedConversation, 'Left conversation successfully')
  })

  /**
   * Get conversation participants
   * GET /api/conversations/:id/participants
   */
  getConversationParticipants = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const conversationId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Conversation ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('getConversationParticipants', userId, { conversationId })

    const conversation = await conversationService.getConversation(conversationId, userId)

    // Extract and format participant information
    const participants = conversation.participants.map((participant: any) => ({
      id: participant.userId || participant.user?.id || participant.id,
      username: participant.user?.username || participant.username,
      firstName: participant.user?.firstName || participant.firstName,
      lastName: participant.user?.lastName || participant.lastName,
      avatar: participant.user?.avatar || participant.avatar,
      isOnline: participant.user?.isOnline || participant.isOnline,
      joinedAt: participant.joinedAt || participant.createdAt
    }))

    this.sendSuccess(res, participants, 'Conversation participants retrieved successfully')
  })

  /**
   * Archive conversation
   * POST /api/conversations/:id/archive
   */
  archiveConversation = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const conversationId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Conversation ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('archiveConversation', userId, { conversationId })

    // This would typically update the user's relationship with the conversation
    // For now, return a success message
    const result = {
      conversationId,
      archived: true,
      archivedAt: new Date(),
      message: 'Archive functionality will be implemented with user preferences'
    }

    this.sendSuccess(res, result, 'Conversation archived successfully')
  })

  /**
   * Unarchive conversation
   * POST /api/conversations/:id/unarchive
   */
  unarchiveConversation = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const conversationId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Conversation ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('unarchiveConversation', userId, { conversationId })

    // This would typically update the user's relationship with the conversation
    const result = {
      conversationId,
      archived: false,
      unarchivedAt: new Date(),
      message: 'Unarchive functionality will be implemented with user preferences'
    }

    this.sendSuccess(res, result, 'Conversation unarchived successfully')
  })

  /**
   * Pin conversation
   * POST /api/conversations/:id/pin
   */
  pinConversation = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const conversationId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Conversation ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('pinConversation', userId, { conversationId })

    // This would typically update the user's relationship with the conversation
    const result = {
      conversationId,
      pinned: true,
      pinnedAt: new Date(),
      message: 'Pin functionality will be implemented with user preferences'
    }

    this.sendSuccess(res, result, 'Conversation pinned successfully')
  })

  /**
   * Unpin conversation
   * POST /api/conversations/:id/unpin
   */
  unpinConversation = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const conversationId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Conversation ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('unpinConversation', userId, { conversationId })

    // This would typically update the user's relationship with the conversation
    const result = {
      conversationId,
      pinned: false,
      unpinnedAt: new Date(),
      message: 'Unpin functionality will be implemented with user preferences'
    }

    this.sendSuccess(res, result, 'Conversation unpinned successfully')
  })

  /**
   * Mute conversation
   * POST /api/conversations/:id/mute
   */
  muteConversation = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const conversationId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Conversation ID is required')
    })

    const bodySchema = z.object({
      duration: z.enum(['1h', '8h', '24h', '7d', 'forever']).default('forever')
    })

    this.getPathParams(req, paramsSchema)
    const body = this.getBodyParams(req, bodySchema)

    this.logAction('muteConversation', userId, { 
      conversationId,
      duration: body.duration 
    })

    // Calculate mute expiry
    let muteUntil: Date | null = null
    if (body.duration !== 'forever') {
      const now = new Date()
      switch (body.duration) {
        case '1h':
          muteUntil = new Date(now.getTime() + 60 * 60 * 1000)
          break
        case '8h':
          muteUntil = new Date(now.getTime() + 8 * 60 * 60 * 1000)
          break
        case '24h':
          muteUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000)
          break
        case '7d':
          muteUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
          break
      }
    }

    const result = {
      conversationId,
      muted: true,
      mutedAt: new Date(),
      muteUntil,
      duration: body.duration,
      message: 'Mute functionality will be implemented with user preferences'
    }

    this.sendSuccess(res, result, 'Conversation muted successfully')
  })

  /**
   * Unmute conversation
   * POST /api/conversations/:id/unmute
   */
  unmuteConversation = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const conversationId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Conversation ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('unmuteConversation', userId, { conversationId })

    const result = {
      conversationId,
      muted: false,
      unmutedAt: new Date(),
      message: 'Unmute functionality will be implemented with user preferences'
    }

    this.sendSuccess(res, result, 'Conversation unmuted successfully')
  })
}

// Export singleton instance
export const conversationController = new ConversationController()
