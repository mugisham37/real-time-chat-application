import { messageRepository, conversationRepository, userRepository } from "@chatapp/database"
import { ApiError } from "../utils/apiError"
import { logger } from "../utils/logger"
import { getRedisManager } from "../config/redis"
import { analyticsService } from "./analytics.service"
import { notificationService } from "./notification.service"
import { encrypt, decrypt, isEncrypted } from "../utils/encryption"
import { config } from "../config"

export class MessageService {
  private redis = getRedisManager()

  /**
   * Create a new message
   */
  async createMessage(messageData: {
    conversationId: string
    senderId: string
    content: string
    type?: string
    attachments?: Array<{
      url: string
      type: string
      name: string
      size: number
    }>
    mentions?: string[]
    replyTo?: string
    metadata?: Record<string, any>
  }): Promise<any> {
    try {
      const { conversationId, senderId, content, type = "TEXT", attachments, mentions, replyTo, metadata } = messageData

      // Check if conversation exists and user is a participant
      const conversation = await conversationRepository.findById(conversationId)

      if (!conversation) {
        throw ApiError.notFound("Conversation not found")
      }

      // Check if user is a participant in the conversation
      const isParticipant = conversation.participants.some((participant: any) => 
        participant.id === senderId || participant === senderId
      )

      if (!isParticipant) {
        throw ApiError.forbidden("You are not a participant in this conversation")
      }

      // Encrypt message content if enabled
      let processedContent = content
      if (config.encryption?.enabled && type === "TEXT") {
        processedContent = encrypt(content)
      }

      // Create message
      const message = await messageRepository.create({
        conversationId,
        senderId,
        content: processedContent,
        type,
        attachments: attachments || [],
        mentions: mentions || [],
        replyTo,
        metadata: metadata || {},
        createdAt: new Date(),
        updatedAt: new Date()
      })

      // Cache message
      await this.cacheMessage(message)

      // Update conversation's last message
      await conversationRepository.updateLastMessage(conversationId, message.id)

      // Track message activity
      await analyticsService.trackUserActivity(senderId, {
        type: "message_sent",
        metadata: { 
          conversationId, 
          messageType: type,
          hasAttachments: attachments && attachments.length > 0,
          mentionsCount: mentions ? mentions.length : 0
        }
      })

      // Create notifications for other participants
      for (const participant of conversation.participants) {
        const participantId = typeof participant === 'string' ? participant : participant.id
        
        if (participantId !== senderId) {
          // Create message notification
          await notificationService.createMessageNotification(
            senderId,
            participantId,
            message.id,
            content,
            conversationId,
            conversation.type || "DIRECT"
          )

          // Track message received activity
          await analyticsService.trackUserActivity(participantId, {
            type: "message_read",
            metadata: { conversationId, senderId, messageId: message.id }
          })
        }
      }

      // Create mention notifications
      if (mentions && mentions.length > 0) {
        for (const mentionedUserId of mentions) {
          await notificationService.createMentionNotification(
            senderId,
            mentionedUserId,
            message.id,
            conversationId,
            conversation.type || "DIRECT"
          )
        }
      }

      // If message content is encrypted, decrypt it for the response
      if (config.encryption?.enabled && type === "TEXT" && isEncrypted(message.content)) {
        message.content = decrypt(message.content)
      }

      logger.info(`Message created: ${message.id}`, {
        conversationId,
        senderId,
        type,
        hasAttachments: attachments && attachments.length > 0
      })

      return message
    } catch (error) {
      logger.error("Error creating message:", error)
      throw error
    }
  }

  /**
   * Get message by ID
   */
  async getMessage(id: string, userId: string): Promise<any> {
    try {
      // Try to get from cache first
      const cachedMessage = await this.redis.getJSON(`message:${id}`)
      
      let message
      if (cachedMessage) {
        message = cachedMessage
      } else {
        message = await messageRepository.findById(id)
        if (message) {
          await this.cacheMessage(message)
        }
      }

      if (!message) {
        throw ApiError.notFound("Message not found")
      }

      // Check if user has access to this message
      const conversation = await conversationRepository.findById(message.conversationId)

      if (!conversation) {
        throw ApiError.notFound("Conversation not found")
      }

      const isParticipant = conversation.participants.some((participant: any) => 
        participant.id === userId || participant === userId
      )

      if (!isParticipant) {
        throw ApiError.forbidden("You do not have access to this message")
      }

      // Decrypt message content if encrypted
      if (config.encryption?.enabled && message.type === "TEXT" && isEncrypted(message.content)) {
        message.content = decrypt(message.content)
      }

      return message
    } catch (error) {
      logger.error(`Error getting message ${id}:`, error)
      throw error
    }
  }

  /**
   * Update message
   */
  async updateMessage(
    id: string,
    userId: string,
    updateData: {
      content?: string
      attachments?: Array<{
        url: string
        type: string
        name: string
        size: number
      }>
      metadata?: Record<string, any>
    }
  ): Promise<any> {
    try {
      // Get original message
      const originalMessage = await messageRepository.findById(id)

      if (!originalMessage) {
        throw ApiError.notFound("Message not found")
      }

      // Check if user is the sender
      if (originalMessage.senderId !== userId) {
        throw ApiError.forbidden("You can only edit your own messages")
      }

      // Check if message is too old to edit (e.g., 24 hours)
      const messageAge = Date.now() - new Date(originalMessage.createdAt).getTime()
      const maxEditAge = 24 * 60 * 60 * 1000 // 24 hours
      
      if (messageAge > maxEditAge) {
        throw ApiError.badRequest("Message is too old to edit")
      }

      // Encrypt content if provided and encryption is enabled
      let processedContent = updateData.content
      if (processedContent && config.encryption?.enabled && originalMessage.type === "TEXT") {
        processedContent = encrypt(processedContent)
      }

      // Update message
      const updatedMessage = await messageRepository.update(id, {
        ...updateData,
        content: processedContent || originalMessage.content,
        updatedAt: new Date(),
        isEdited: true
      })

      if (!updatedMessage) {
        throw ApiError.notFound("Message not found")
      }

      // Update cache
      await this.cacheMessage(updatedMessage)

      // Decrypt content for response if encrypted
      if (config.encryption?.enabled && updatedMessage.type === "TEXT" && isEncrypted(updatedMessage.content)) {
        updatedMessage.content = decrypt(updatedMessage.content)
      }

      logger.info(`Message updated: ${id}`, { userId, updateData })

      return updatedMessage
    } catch (error) {
      logger.error(`Error updating message ${id}:`, error)
      throw error
    }
  }

  /**
   * Delete message
   */
  async deleteMessage(id: string, userId: string, hard = false): Promise<any> {
    try {
      const message = await messageRepository.findById(id)

      if (!message) {
        throw ApiError.notFound("Message not found")
      }

      // Check if user is the sender
      if (message.senderId !== userId) {
        throw ApiError.forbidden("You can only delete your own messages")
      }

      let deletedMessage
      if (hard) {
        // Hard delete - completely remove from database
        deletedMessage = await messageRepository.hardDelete(id)
      } else {
        // Soft delete - mark as deleted
        deletedMessage = await messageRepository.update(id, {
          isDeleted: true,
          content: "[This message was deleted]",
          updatedAt: new Date()
        })
      }

      // Remove from cache
      await this.redis.del(`message:${id}`)

      logger.info(`Message deleted: ${id}`, { userId, hard })

      return deletedMessage
    } catch (error) {
      logger.error(`Error deleting message ${id}:`, error)
      throw error
    }
  }

  /**
   * Add reaction to message
   */
  async addReaction(id: string, userId: string, reactionType: string): Promise<any> {
    try {
      const message = await messageRepository.findById(id)

      if (!message) {
        throw ApiError.notFound("Message not found")
      }

      // Check if user has access to this message
      const conversation = await conversationRepository.findById(message.conversationId)

      if (!conversation) {
        throw ApiError.notFound("Conversation not found")
      }

      const isParticipant = conversation.participants.some((participant: any) => 
        participant.id === userId || participant === userId
      )

      if (!isParticipant) {
        throw ApiError.forbidden("You do not have access to this message")
      }

      // Add reaction
      const updatedMessage = await messageRepository.addReaction(id, userId, reactionType)

      if (!updatedMessage) {
        throw ApiError.notFound("Message not found")
      }

      // Update cache
      await this.cacheMessage(updatedMessage)

      // Create reaction notification if not reacting to own message
      if (message.senderId !== userId) {
        await notificationService.createReactionNotification(
          userId,
          message.senderId,
          id,
          reactionType
        )
      }

      // Decrypt message content if encrypted
      if (config.encryption?.enabled && updatedMessage.type === "TEXT" && isEncrypted(updatedMessage.content)) {
        updatedMessage.content = decrypt(updatedMessage.content)
      }

      logger.info(`Reaction added to message: ${id}`, { userId, reactionType })

      return updatedMessage
    } catch (error) {
      logger.error(`Error adding reaction to message ${id}:`, error)
      throw error
    }
  }

  /**
   * Remove reaction from message
   */
  async removeReaction(id: string, userId: string, reactionType: string): Promise<any> {
    try {
      const message = await messageRepository.findById(id)

      if (!message) {
        throw ApiError.notFound("Message not found")
      }

      // Remove reaction
      const updatedMessage = await messageRepository.removeReaction(id, userId, reactionType)

      if (!updatedMessage) {
        throw ApiError.notFound("Message not found")
      }

      // Update cache
      await this.cacheMessage(updatedMessage)

      // Decrypt message content if encrypted
      if (config.encryption?.enabled && updatedMessage.type === "TEXT" && isEncrypted(updatedMessage.content)) {
        updatedMessage.content = decrypt(updatedMessage.content)
      }

      logger.info(`Reaction removed from message: ${id}`, { userId, reactionType })

      return updatedMessage
    } catch (error) {
      logger.error(`Error removing reaction from message ${id}:`, error)
      throw error
    }
  }

  /**
   * Mark message as read
   */
  async markMessageAsRead(id: string, userId: string): Promise<any> {
    try {
      const message = await messageRepository.markAsRead(id, userId)

      if (!message) {
        throw ApiError.notFound("Message not found")
      }

      // Update cache
      await this.cacheMessage(message)

      // Track read activity
      await analyticsService.trackUserActivity(userId, {
        type: "message_read",
        metadata: { messageId: id, senderId: message.senderId }
      })

      // Decrypt message content if encrypted
      if (config.encryption?.enabled && message.type === "TEXT" && isEncrypted(message.content)) {
        message.content = decrypt(message.content)
      }

      logger.debug(`Message marked as read: ${id}`, { userId })

      return message
    } catch (error) {
      logger.error(`Error marking message ${id} as read:`, error)
      throw error
    }
  }

  /**
   * Search messages
   */
  async searchMessages(
    userId: string, 
    query: string, 
    options: {
      conversationId?: string
      limit?: number
      skip?: number
      startDate?: Date
      endDate?: Date
    } = {}
  ): Promise<any[]> {
    try {
      const { conversationId, limit = 20, skip = 0, startDate, endDate } = options

      // If searching in a specific conversation, check access
      if (conversationId) {
        const conversation = await conversationRepository.findById(conversationId)
        
        if (!conversation) {
          throw ApiError.notFound("Conversation not found")
        }

        const isParticipant = conversation.participants.some((participant: any) => 
          participant.id === userId || participant === userId
        )

        if (!isParticipant) {
          throw ApiError.forbidden("You do not have access to this conversation")
        }
      }

      // Search messages
      const messages = await messageRepository.search({
        query,
        userId,
        conversationId,
        limit,
        skip,
        startDate,
        endDate
      })

      // Decrypt message contents if encrypted
      if (config.encryption?.enabled) {
        return messages.map((message) => {
          if (message.type === "TEXT" && isEncrypted(message.content)) {
            try {
              message.content = decrypt(message.content)
            } catch (error) {
              logger.error(`Error decrypting message ${message.id}:`, error)
              message.content = "[Encrypted content]"
            }
          }
          return message
        })
      }

      return messages
    } catch (error) {
      logger.error(`Error searching messages with query ${query}:`, error)
      throw error
    }
  }

  /**
   * Get message statistics for a conversation
   */
  async getConversationMessageStats(conversationId: string, userId: string): Promise<{
    totalMessages: number
    messagesByType: Record<string, number>
    messagesByUser: Record<string, number>
    messagesByDay: Record<string, number>
    averageMessagesPerDay: number
    mostActiveDay: string
    mostActiveUser: string
  }> {
    try {
      // Check if user has access to conversation
      const conversation = await conversationRepository.findById(conversationId)
      
      if (!conversation) {
        throw ApiError.notFound("Conversation not found")
      }

      const isParticipant = conversation.participants.some((participant: any) => 
        participant.id === userId || participant === userId
      )

      if (!isParticipant) {
        throw ApiError.forbidden("You do not have access to this conversation")
      }

      // Get message statistics
      const [
        totalMessages,
        messagesByType,
        messagesByUser,
        messagesByDay
      ] = await Promise.all([
        messageRepository.getMessageCountByConversation(conversationId),
        messageRepository.getMessageCountByType(conversationId),
        messageRepository.getMessageCountByUser(conversationId),
        this.getMessagesByDay(conversationId, 30) // Last 30 days
      ])

      // Calculate average messages per day
      const daysWithMessages = Object.values(messagesByDay).filter(count => count > 0).length
      const averageMessagesPerDay = daysWithMessages > 0 ? totalMessages / daysWithMessages : 0

      // Find most active day
      const mostActiveDay = Object.entries(messagesByDay).reduce((a, b) => 
        messagesByDay[a[0]] > messagesByDay[b[0]] ? a : b
      )[0]

      // Find most active user
      const mostActiveUser = Object.entries(messagesByUser).reduce((a, b) => 
        messagesByUser[a[0]] > messagesByUser[b[0]] ? a : b
      )[0]

      return {
        totalMessages,
        messagesByType,
        messagesByUser,
        messagesByDay,
        averageMessagesPerDay,
        mostActiveDay,
        mostActiveUser
      }
    } catch (error) {
      logger.error(`Error getting message stats for conversation ${conversationId}:`, error)
      throw error
    }
  }

  /**
   * Get user message statistics
   */
  async getUserMessageStats(userId: string): Promise<{
    totalMessagesSent: number
    totalMessagesReceived: number
    messagesByType: Record<string, number>
    messagesByDay: Record<string, number>
    averageMessagesPerDay: number
    mostActiveConversation: string
    favoriteReaction: string
  }> {
    try {
      const [
        totalMessagesSent,
        totalMessagesReceived,
        messagesByType,
        messagesByDay,
        mostActiveConversation,
        favoriteReaction
      ] = await Promise.all([
        messageRepository.getMessageCountBySender(userId),
        messageRepository.getMessageCountByRecipient(userId),
        messageRepository.getMessageCountByTypeForUser(userId),
        this.getUserMessagesByDay(userId, 30), // Last 30 days
        messageRepository.getMostActiveConversationForUser(userId),
        messageRepository.getFavoriteReactionForUser(userId)
      ])

      // Calculate average messages per day
      const daysWithMessages = Object.values(messagesByDay).filter(count => count > 0).length
      const averageMessagesPerDay = daysWithMessages > 0 ? totalMessagesSent / daysWithMessages : 0

      return {
        totalMessagesSent,
        totalMessagesReceived,
        messagesByType,
        messagesByDay,
        averageMessagesPerDay,
        mostActiveConversation,
        favoriteReaction
      }
    } catch (error) {
      logger.error(`Error getting message stats for user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Helper methods
   */
  private async cacheMessage(message: any): Promise<void> {
    try {
      await this.redis.setJSON(`message:${message.id}`, message, 3600) // Cache for 1 hour
    } catch (error) {
      logger.error(`Error caching message ${message.id}:`, error)
      // Don't throw, caching is non-critical
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

  private async getUserMessagesByDay(userId: string, days: number): Promise<Record<string, number>> {
    try {
      const messagesByDay: Record<string, number> = {}

      for (let i = 0; i < days; i++) {
        const date = new Date()
        date.setDate(date.getDate() - i)
        const dateStr = date.toISOString().split("T")[0] // YYYY-MM-DD

        const count = await messageRepository.getMessageCountByUserAndDate(userId, date)
        messagesByDay[dateStr] = count
      }

      return messagesByDay
    } catch (error) {
      logger.error(`Error getting messages by day for user ${userId}:`, error)
      return {}
    }
  }
}

// Export singleton instance
export const messageService = new MessageService()
