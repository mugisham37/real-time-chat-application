import { messageRepository } from "@chatapp/database"
import { logger } from "../utils/logger"
import { getRedisManager } from "../config/redis"
import { ApiError } from "../utils/apiError"
import { conversationRepository } from "@chatapp/database"
import { groupRepository } from "@chatapp/database"

export class ScheduledMessageService {
  private redis = getRedisManager()

  /**
   * Schedule a message
   */
  async scheduleMessage(
    messageData: {
      senderId: string
      conversationId: string
      conversationType: "DIRECT" | "GROUP"
      content: string
      type?: string
      attachments?: Array<{
        url: string
        type: string
        name: string
        size: number
      }>
      mentions?: string[]
      replyToId?: string
    },
    scheduledFor: Date,
  ): Promise<any> {
    try {
      // Validate conversation exists and user has access
      if (messageData.conversationType === "DIRECT") {
        const conversation = await conversationRepository.findById(messageData.conversationId)
        if (!conversation) {
          throw ApiError.notFound("Conversation not found")
        }

        // Check if user is a participant
        const isParticipant = conversation.participants.some(
          participant => participant.userId === messageData.senderId
        )
        if (!isParticipant) {
          throw ApiError.forbidden("You are not a participant in this conversation")
        }
      } else if (messageData.conversationType === "GROUP") {
        const group = await groupRepository.findById(messageData.conversationId)
        if (!group) {
          throw ApiError.notFound("Group not found")
        }

        // Check if user is a member
        const isMember = group.members.some(member => member.userId === messageData.senderId)
        if (!isMember) {
          throw ApiError.forbidden("You are not a member of this group")
        }
      }

      // Create scheduled message
      const message = await messageRepository.create({
        ...messageData,
        status: "SCHEDULED",
        scheduledFor,
      })

      // Store scheduled message ID in Redis sorted set with score as timestamp
      await this.redis.client.zAdd("scheduled_messages", {
        score: scheduledFor.getTime(),
        value: message.id,
      })

      logger.info(`Message scheduled: ${message.id} for ${scheduledFor.toISOString()}`)

      return message
    } catch (error) {
      logger.error("Error scheduling message:", error)
      throw error
    }
  }

  /**
   * Get scheduled messages for a user
   */
  async getUserScheduledMessages(userId: string): Promise<any[]> {
    try {
      // Find all scheduled messages where the user is the sender
      const messages = await messageRepository.findScheduledBySenderId(userId)
      return messages
    } catch (error) {
      logger.error(`Error getting scheduled messages for user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Cancel a scheduled message
   */
  async cancelScheduledMessage(messageId: string, userId: string): Promise<boolean> {
    try {
      // Find the message
      const message = await messageRepository.findById(messageId)

      if (!message) {
        throw ApiError.notFound("Scheduled message not found")
      }

      // Check if the message is scheduled
      if (message.status !== "SCHEDULED") {
        throw ApiError.badRequest("Message is not scheduled")
      }

      // Check if the user is the sender
      if (message.senderId !== userId) {
        throw ApiError.forbidden("You can only cancel your own scheduled messages")
      }

      // Delete the message
      await messageRepository.delete(messageId)

      // Remove from Redis sorted set
      await this.redis.client.zRem("scheduled_messages", messageId)

      logger.info(`Scheduled message cancelled: ${messageId}`)

      return true
    } catch (error) {
      logger.error(`Error cancelling scheduled message ${messageId}:`, error)
      throw error
    }
  }

  /**
   * Update a scheduled message
   */
  async updateScheduledMessage(
    messageId: string,
    userId: string,
    updates: {
      content?: string
      scheduledFor?: Date
      attachments?: Array<{
        url: string
        type: string
        name: string
        size: number
      }>
    },
  ): Promise<any> {
    try {
      // Find the message
      const message = await messageRepository.findById(messageId)

      if (!message) {
        throw ApiError.notFound("Scheduled message not found")
      }

      // Check if the message is scheduled
      if (message.status !== "SCHEDULED") {
        throw ApiError.badRequest("Message is not scheduled")
      }

      // Check if the user is the sender
      if (message.senderId !== userId) {
        throw ApiError.forbidden("You can only update your own scheduled messages")
      }

      // Update the message
      const updateData: any = {}

      if (updates.content) {
        updateData.content = updates.content
      }

      if (updates.attachments) {
        updateData.attachments = updates.attachments
      }

      const updatedMessage = await messageRepository.update(messageId, updateData)

      // If scheduledFor is updated, update Redis sorted set
      if (updates.scheduledFor) {
        // Update message scheduledFor
        await messageRepository.update(messageId, { scheduledFor: updates.scheduledFor })

        // Update Redis sorted set
        await this.redis.client.zRem("scheduled_messages", messageId)
        await this.redis.client.zAdd("scheduled_messages", {
          score: updates.scheduledFor.getTime(),
          value: messageId,
        })
      }

      logger.info(`Scheduled message updated: ${messageId}`)

      return updatedMessage
    } catch (error) {
      logger.error(`Error updating scheduled message ${messageId}:`, error)
      throw error
    }
  }

  /**
   * Process due scheduled messages
   * This should be called by a cron job
   */
  async processDueScheduledMessages(): Promise<number> {
    try {
      const now = Date.now()

      // Get all scheduled messages due for sending
      const dueMessageIds = await this.redis.client.zRangeByScore("scheduled_messages", 0, now)

      if (dueMessageIds.length === 0) {
        return 0
      }

      logger.info(`Processing ${dueMessageIds.length} due scheduled messages`)

      let processedCount = 0

      // Process each message
      for (const messageId of dueMessageIds) {
        try {
          // Get message details
          const message = await messageRepository.findById(messageId)

          if (!message) {
            // Message not found, remove from Redis
            await this.redis.client.zRem("scheduled_messages", messageId)
            continue
          }

          // Check if message is still scheduled
          if (message.status !== "SCHEDULED") {
            // Message already processed, remove from Redis
            await this.redis.client.zRem("scheduled_messages", messageId)
            continue
          }

          // Update message status to sent
          await messageRepository.update(messageId, { status: "SENT" })

          // Remove from Redis
          await this.redis.client.zRem("scheduled_messages", messageId)

          processedCount++
        } catch (error) {
          logger.error(`Error processing scheduled message ${messageId}:`, error)
          // Continue with next message
        }
      }

      logger.info(`Successfully processed ${processedCount} scheduled messages`)

      return processedCount
    } catch (error) {
      logger.error("Error processing due scheduled messages:", error)
      throw error
    }
  }

  /**
   * Get scheduled message statistics for a user
   */
  async getUserScheduledMessageStats(userId: string): Promise<{
    totalScheduled: number
    totalSent: number
    totalCancelled: number
    upcomingCount: number
    nextScheduledAt?: Date
  }> {
    try {
      const stats = await messageRepository.getScheduledMessageStats(userId)
      
      // Get upcoming messages count
      const upcomingMessages = await this.getUserScheduledMessages(userId)
      const upcomingCount = upcomingMessages.filter(msg => 
        msg.status === "SCHEDULED" && new Date(msg.scheduledFor) > new Date()
      ).length

      // Get next scheduled message time
      const nextMessage = upcomingMessages
        .filter(msg => msg.status === "SCHEDULED" && new Date(msg.scheduledFor) > new Date())
        .sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime())[0]

      return {
        ...stats,
        upcomingCount,
        nextScheduledAt: nextMessage ? new Date(nextMessage.scheduledFor) : undefined
      }
    } catch (error) {
      logger.error(`Error getting scheduled message stats for user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Get all scheduled messages (admin only)
   */
  async getAllScheduledMessages(
    options: {
      limit?: number
      offset?: number
      status?: string
    } = {}
  ): Promise<{
    messages: any[]
    total: number
  }> {
    try {
      const { limit = 50, offset = 0, status } = options

      const result = await messageRepository.findAllScheduled({
        limit,
        offset,
        status
      })

      return result
    } catch (error) {
      logger.error("Error getting all scheduled messages:", error)
      throw error
    }
  }

  /**
   * Clean up old scheduled messages
   */
  async cleanupOldScheduledMessages(olderThanDays: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays)

      const deletedCount = await messageRepository.deleteOldScheduled(cutoffDate)

      logger.info(`Cleaned up ${deletedCount} old scheduled messages`)

      return deletedCount
    } catch (error) {
      logger.error("Error cleaning up old scheduled messages:", error)
      throw error
    }
  }

  /**
   * Bulk cancel scheduled messages
   */
  async bulkCancelScheduledMessages(
    messageIds: string[],
    userId: string
  ): Promise<{
    successful: string[]
    failed: Array<{ messageId: string; error: string }>
  }> {
    try {
      const successful: string[] = []
      const failed: Array<{ messageId: string; error: string }> = []

      for (const messageId of messageIds) {
        try {
          await this.cancelScheduledMessage(messageId, userId)
          successful.push(messageId)
        } catch (error) {
          failed.push({
            messageId,
            error: error instanceof Error ? error.message : "Unknown error"
          })
        }
      }

      logger.info(`Bulk cancel completed`, {
        successful: successful.length,
        failed: failed.length,
        userId
      })

      return { successful, failed }
    } catch (error) {
      logger.error(`Error bulk cancelling scheduled messages:`, error)
      throw error
    }
  }

  /**
   * Get scheduled messages for a conversation
   */
  async getConversationScheduledMessages(
    conversationId: string,
    userId: string,
    options: {
      limit?: number
      offset?: number
    } = {}
  ): Promise<any[]> {
    try {
      const { limit = 20, offset = 0 } = options

      // Verify user has access to conversation
      const conversation = await conversationRepository.findById(conversationId)
      if (!conversation) {
        throw ApiError.notFound("Conversation not found")
      }

      const isParticipant = conversation.participants.some(
        participant => participant.userId === userId
      )
      if (!isParticipant) {
        throw ApiError.forbidden("You are not a participant in this conversation")
      }

      const messages = await messageRepository.findScheduledByConversationId(
        conversationId,
        { limit, offset }
      )

      return messages
    } catch (error) {
      logger.error(`Error getting scheduled messages for conversation ${conversationId}:`, error)
      throw error
    }
  }
}

// Export singleton instance
export const scheduledMessageService = new ScheduledMessageService()
