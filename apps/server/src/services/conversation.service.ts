import { conversationRepository, messageRepository, userRepository } from "@chatapp/database"
import { ApiError } from "../utils/apiError"
import { logger } from "../utils/logger"
import { getRedisManager } from "../config/redis"
import { analyticsService } from "./analytics.service"

export class ConversationService {
  private redis = getRedisManager()

  /**
   * Create a new conversation
   */
  async createConversation(participants: string[]): Promise<any> {
    try {
      if (participants.length < 2) {
        throw ApiError.badRequest("A conversation requires at least 2 participants")
      }

      // Check if conversation already exists
      const existingConversation = await conversationRepository.findByParticipants(participants)

      if (existingConversation) {
        return existingConversation
      }

      // Create new conversation
      let conversation
      if (participants.length === 2) {
        conversation = await conversationRepository.createDirectConversation(participants)
      } else {
        // For group conversations, we need to create through the group repository
        // For now, let's use createDirectConversation and handle groups differently
        throw ApiError.badRequest("Group conversations should be created through the group service")
      }

      // Cache conversation data
      await this.cacheConversationData(conversation)

      // Track conversation creation
      for (const participantId of participants) {
        await analyticsService.trackUserActivity(participantId, {
          type: "group_created",
          metadata: { conversationId: conversation.id, participantCount: participants.length }
        })
      }

      logger.info(`Conversation created: ${conversation.id}`, {
        participants: participants.length,
        type: conversation.type
      })

      return conversation
    } catch (error) {
      logger.error("Error creating conversation:", error)
      throw error
    }
  }

  /**
   * Get conversation by ID
   */
  async getConversation(id: string, userId: string): Promise<any> {
    try {
      // Try to get from cache first
      const cachedConversation = await this.redis.getJSON(`conversation:${id}`)
      
      let conversation
      if (cachedConversation) {
        conversation = cachedConversation
      } else {
        conversation = await conversationRepository.findById(id)
        if (conversation) {
          await this.cacheConversationData(conversation)
        }
      }

      if (!conversation) {
        throw ApiError.notFound("Conversation not found")
      }

      // Check if user is a participant
      const isParticipant = conversation.participants.some((participant: any) => 
        participant.userId === userId || participant.user?.id === userId || participant.id === userId
      )

      if (!isParticipant) {
        throw ApiError.forbidden("You are not a participant in this conversation")
      }

      return conversation
    } catch (error) {
      logger.error(`Error getting conversation ${id}:`, error)
      throw error
    }
  }

  /**
   * Get user conversations
   */
  async getUserConversations(userId: string, limit = 20, skip = 0): Promise<any[]> {
    try {
      // Try to get from cache first
      const cacheKey = `user:${userId}:conversations:${limit}:${skip}`
      const cachedConversations = await this.redis.getJSON(cacheKey)

      if (cachedConversations) {
        return cachedConversations as any[]
      }

      const conversations = await conversationRepository.getUserConversations(userId, { limit, offset: skip })

      // Cache the result for 5 minutes
      await this.redis.setJSON(cacheKey, conversations, 300)

      return conversations
    } catch (error) {
      logger.error(`Error getting conversations for user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Get conversation messages
   */
  async getConversationMessages(
    conversationId: string,
    userId: string,
    limit = 20,
    before?: string,
  ): Promise<any[]> {
    try {
      // Check if user is a participant
      const conversation = await conversationRepository.findById(conversationId)

      if (!conversation) {
        throw ApiError.notFound("Conversation not found")
      }

      const isParticipant = conversation.participants.some((participant: any) => 
        participant.userId === userId || participant.user?.id === userId
      )

      if (!isParticipant) {
        throw ApiError.forbidden("You are not a participant in this conversation")
      }

      // Parse before date if provided
      let beforeDate: Date | undefined
      if (before) {
        beforeDate = new Date(before)
        if (isNaN(beforeDate.getTime())) {
          throw ApiError.badRequest("Invalid before date format")
        }
      }

      // Get messages
      const messages = await messageRepository.getConversationMessages(
        conversationId,
        { limit, before: beforeDate }
      )

      // Mark messages as read for this user
      await this.markMessagesAsRead(conversationId, userId)

      return messages
    } catch (error) {
      logger.error(`Error getting messages for conversation ${conversationId}:`, error)
      throw error
    }
  }

  /**
   * Update conversation
   */
  async updateConversation(
    id: string,
    userId: string,
    updateData: {
      name?: string
      description?: string
      avatar?: string
      settings?: Record<string, any>
    }
  ): Promise<any> {
    try {
      // Check if user is a participant
      const conversation = await conversationRepository.findById(id)

      if (!conversation) {
        throw ApiError.notFound("Conversation not found")
      }

      const isParticipant = conversation.participants.some((participant: any) => 
        participant.userId === userId || participant.user?.id === userId || participant.id === userId
      )

      if (!isParticipant) {
        throw ApiError.forbidden("You are not a participant in this conversation")
      }

      // Update conversation - ConversationRepository doesn't have update method for direct conversations
      // We can only update group conversations through the group service
      if (conversation.type === 'DIRECT') {
        throw ApiError.badRequest("Direct conversations cannot be updated")
      }
      
      // For group conversations, we should use the group service
      throw ApiError.badRequest("Group conversations should be updated through the group service")
    } catch (error) {
      logger.error(`Error updating conversation ${id}:`, error)
      throw error
    }
  }

  /**
   * Add participant to conversation
   */
  async addParticipant(conversationId: string, userId: string, newParticipantId: string): Promise<any> {
    try {
      // Check if user is a participant
      const conversation = await conversationRepository.findById(conversationId)

      if (!conversation) {
        throw ApiError.notFound("Conversation not found")
      }

      const isParticipant = conversation.participants.some((participant: any) => 
        participant.userId === userId || participant.user?.id === userId
      )

      if (!isParticipant) {
        throw ApiError.forbidden("You are not a participant in this conversation")
      }

      // Check if new participant already exists
      const isAlreadyParticipant = conversation.participants.some((participant: any) => 
        participant.userId === newParticipantId || participant.user?.id === newParticipantId
      )

      if (isAlreadyParticipant) {
        throw ApiError.conflict("User is already a participant in this conversation")
      }

      // Add participant
      await conversationRepository.addParticipant(conversationId, newParticipantId)
      
      // Get updated conversation
      const updatedConversation = await conversationRepository.findById(conversationId)

      if (!updatedConversation) {
        throw ApiError.notFound("Conversation not found")
      }

      // Update cache
      await this.cacheConversationData(updatedConversation)

      // Invalidate user conversations cache for all participants
      for (const participant of updatedConversation.participants) {
        const participantId = typeof participant === 'string' ? participant : participant.id
        await this.invalidateUserConversationsCache(participantId)
      }

      // Track activity
      await analyticsService.trackUserActivity(newParticipantId, {
        type: "group_joined",
        metadata: { conversationId, addedBy: userId }
      })

      logger.info(`Participant added to conversation: ${conversationId}`, {
        userId,
        newParticipantId
      })

      return updatedConversation
    } catch (error) {
      logger.error(`Error adding participant to conversation ${conversationId}:`, error)
      throw error
    }
  }

  /**
   * Remove participant from conversation
   */
  async removeParticipant(conversationId: string, userId: string, participantToRemove: string): Promise<any> {
    try {
      // Check if user is a participant
      const conversation = await conversationRepository.findById(conversationId)

      if (!conversation) {
        throw ApiError.notFound("Conversation not found")
      }

      const isParticipant = conversation.participants.some((participant: any) => 
        participant.userId === userId || participant.user?.id === userId
      )

      if (!isParticipant) {
        throw ApiError.forbidden("You are not a participant in this conversation")
      }

      // Check if participant to remove exists
      const participantExists = conversation.participants.some((participant: any) => 
        participant.userId === participantToRemove || participant.user?.id === participantToRemove
      )

      if (!participantExists) {
        throw ApiError.notFound("Participant not found in conversation")
      }

      // Remove participant
      await conversationRepository.removeParticipant(conversationId, participantToRemove)
      
      // Get updated conversation
      const updatedConversation = await conversationRepository.findById(conversationId)

      if (!updatedConversation) {
        throw ApiError.notFound("Conversation not found")
      }

      // Update cache
      await this.cacheConversationData(updatedConversation)

      // Invalidate user conversations cache for all participants
      for (const participant of updatedConversation.participants) {
        const participantId = typeof participant === 'string' ? participant : participant.id
        await this.invalidateUserConversationsCache(participantId)
      }

      // Also invalidate cache for removed participant
      await this.invalidateUserConversationsCache(participantToRemove)

      logger.info(`Participant removed from conversation: ${conversationId}`, {
        userId,
        participantToRemove
      })

      return updatedConversation
    } catch (error) {
      logger.error(`Error removing participant from conversation ${conversationId}:`, error)
      throw error
    }
  }

  /**
   * Delete conversation
   */
  async deleteConversation(id: string, userId: string): Promise<boolean> {
    try {
      // Check if user is a participant
      const conversation = await conversationRepository.findById(id)

      if (!conversation) {
        throw ApiError.notFound("Conversation not found")
      }

      const isParticipant = conversation.participants.some((participant: any) => 
        participant.userId === userId || participant.user?.id === userId || participant.id === userId
      )

      if (!isParticipant) {
        throw ApiError.forbidden("You are not a participant in this conversation")
      }

      // Delete conversation
      const deleted = await conversationRepository.delete(id)

      if (deleted) {
        // Remove from cache
        await this.redis.del(`conversation:${id}`)

        // Invalidate user conversations cache for all participants
        for (const participant of conversation.participants) {
          const participantId = typeof participant === 'string' ? participant : participant.id
          await this.invalidateUserConversationsCache(participantId)
        }

        logger.info(`Conversation deleted: ${id}`, { userId })
      }

      return deleted
    } catch (error) {
      logger.error(`Error deleting conversation ${id}:`, error)
      throw error
    }
  }

  /**
   * Mark messages as read
   */
  async markMessagesAsRead(conversationId: string, userId: string): Promise<void> {
    try {
      await messageRepository.markAsReadByConversation(conversationId, userId)

      // Update unread count in cache
      await this.redis.del(`user:${userId}:unread_count`)

      logger.debug(`Messages marked as read for conversation ${conversationId}`, { userId })
    } catch (error) {
      logger.error(`Error marking messages as read for conversation ${conversationId}:`, error)
      // Don't throw, this is not critical
    }
  }

  /**
   * Get unread message count for user
   */
  async getUnreadMessageCount(userId: string): Promise<number> {
    try {
      // Try cache first
      const cachedCount = await this.redis.get(`user:${userId}:unread_count`)
      
      if (cachedCount !== null) {
        return parseInt(cachedCount, 10)
      }

      // Get from database
      const count = await messageRepository.getUnreadCountForUser(userId)

      // Cache for 5 minutes
      await this.redis.set(`user:${userId}:unread_count`, count.toString(), 300)

      return count
    } catch (error) {
      logger.error(`Error getting unread message count for user ${userId}:`, error)
      return 0
    }
  }

  /**
   * Search conversations
   */
  async searchConversations(userId: string, query: string, limit = 10): Promise<any[]> {
    try {
      const conversations = await conversationRepository.search(userId, query)
      return conversations
    } catch (error) {
      logger.error(`Error searching conversations for user ${userId}:`, error)
      return []
    }
  }

  /**
   * Get conversation statistics
   */
  async getConversationStats(conversationId: string, userId: string): Promise<{
    totalMessages: number
    totalParticipants: number
    createdAt: Date
    lastMessageAt?: Date
    messagesByDay: Record<string, number>
  }> {
    try {
      // Check if user is a participant
      const conversation = await this.getConversation(conversationId, userId)

      const [totalMessages, lastMessage, messagesByDay] = await Promise.all([
        messageRepository.getMessageCountByConversation(conversationId),
        messageRepository.getLastMessageByConversation(conversationId),
        this.getMessagesByDay(conversationId, 30) // Last 30 days
      ])

      return {
        totalMessages,
        totalParticipants: conversation.participants.length,
        createdAt: conversation.createdAt,
        lastMessageAt: lastMessage?.createdAt,
        messagesByDay
      }
    } catch (error) {
      logger.error(`Error getting conversation stats for ${conversationId}:`, error)
      throw error
    }
  }

  /**
   * Helper methods
   */
  private async cacheConversationData(conversation: any): Promise<void> {
    try {
      await this.redis.setJSON(`conversation:${conversation.id}`, conversation, 3600) // Cache for 1 hour
    } catch (error) {
      logger.error(`Error caching conversation data for ${conversation.id}:`, error)
      // Don't throw, caching is non-critical
    }
  }

  private async invalidateUserConversationsCache(userId: string): Promise<void> {
    try {
      const keys = await this.redis.keys(`user:${userId}:conversations:*`)
      if (keys.length > 0) {
        await this.redis.delete(...keys)
      }
    } catch (error) {
      logger.error(`Error invalidating user conversations cache for ${userId}:`, error)
      // Don't throw, cache invalidation is non-critical
    }
  }

  private async getMessagesByDay(conversationId: string, days: number): Promise<Record<string, number>> {
    try {
      const messagesByDay: Record<string, number> = {}

      for (let i = 0; i < days; i++) {
        const date = new Date()
        date.setDate(date.getDate() - i)
        const dateStr = date.toISOString().split("T")[0] // YYYY-MM-DD

        const count = await messageRepository.getMessageCountByConversationAndDate(conversationId, date)
        messagesByDay[dateStr] = count
      }

      return messagesByDay
    } catch (error) {
      logger.error(`Error getting messages by day for conversation ${conversationId}:`, error)
      return {}
    }
  }
}

// Export singleton instance
export const conversationService = new ConversationService()
