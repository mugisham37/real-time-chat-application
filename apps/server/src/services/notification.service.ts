import { notificationRepository, userRepository } from "@chatapp/database"
import { ApiError } from "../utils/apiError"
import { logger } from "../utils/logger"
import { getRedisManager } from "../config/redis"
import { analyticsService } from "./analytics.service"

export class NotificationService {
  private redis = getRedisManager()

  /**
   * Create a new notification
   */
  async createNotification(notificationData: {
    recipient: string
    sender?: string
    type: string
    content: string
    relatedId?: string
    relatedType?: string
    metadata?: Record<string, any>
  }): Promise<any> {
    try {
      // Check if recipient exists
      const recipient = await userRepository.findById(notificationData.recipient)

      if (!recipient) {
        throw ApiError.notFound("Recipient not found")
      }

      // Create notification
      const notification = await notificationRepository.create({
        ...notificationData,
        isRead: false,
        createdAt: new Date(),
        updatedAt: new Date()
      })

      // Cache notification
      await this.cacheNotification(notification)

      // Increment unread count in Redis
      await this.redis.incr(`user:${notificationData.recipient}:unread_notifications`)

      // Track notification creation
      if (notificationData.sender) {
        await analyticsService.trackUserActivity(notificationData.sender, {
          type: "profile_updated",
          metadata: { 
            action: "notification_sent", 
            type: notificationData.type,
            recipient: notificationData.recipient 
          }
        })
      }

      logger.info(`Notification created: ${notification.id}`, {
        recipient: notificationData.recipient,
        type: notificationData.type
      })

      return notification
    } catch (error) {
      logger.error("Error creating notification:", error)
      throw error
    }
  }

  /**
   * Get user notifications
   */
  async getUserNotifications(
    userId: string,
    options: {
      limit?: number
      skip?: number
      isRead?: boolean
      type?: string
    } = {},
  ): Promise<{
    notifications: any[]
    unreadCount: number
    totalCount: number
  }> {
    try {
      const { limit = 20, skip = 0, isRead, type } = options

      // Try to get from cache first for recent notifications
      const cacheKey = `user:${userId}:notifications:${limit}:${skip}:${isRead}:${type}`
      const cachedData = await this.redis.getJSON(cacheKey)

      if (cachedData && skip === 0) {
        return cachedData as any
      }

      // Get notifications from database
      const [notifications, unreadCount, totalCount] = await Promise.all([
        notificationRepository.findByUserId(userId, { limit, skip, isRead, type }),
        this.getUnreadCount(userId),
        notificationRepository.countByUserId(userId, { isRead, type })
      ])

      const result = {
        notifications,
        unreadCount,
        totalCount
      }

      // Cache recent notifications for 2 minutes
      if (skip === 0) {
        await this.redis.setJSON(cacheKey, result, 120)
      }

      return result
    } catch (error) {
      logger.error(`Error getting notifications for user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Get unread notifications count
   */
  async getUnreadCount(userId: string): Promise<number> {
    try {
      // Try to get from Redis first
      const cachedCount = await this.redis.get(`user:${userId}:unread_notifications`)

      if (cachedCount !== null) {
        return parseInt(cachedCount, 10)
      }

      // If not in Redis, get from database
      const unreadCount = await notificationRepository.countUnreadByUserId(userId)

      // Update Redis
      await this.redis.set(`user:${userId}:unread_notifications`, unreadCount.toString(), 300)

      return unreadCount
    } catch (error) {
      logger.error(`Error getting unread notifications count for user ${userId}:`, error)
      return 0
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(id: string, userId: string): Promise<any> {
    try {
      const notification = await notificationRepository.markAsRead(id, userId)

      if (!notification) {
        throw ApiError.notFound("Notification not found")
      }

      // Update cache
      await this.cacheNotification(notification)

      // Update unread count in Redis
      const unreadCount = await notificationRepository.countUnreadByUserId(userId)
      await this.redis.set(`user:${userId}:unread_notifications`, unreadCount.toString(), 300)

      // Invalidate cached notifications
      await this.invalidateNotificationsCache(userId)

      logger.debug(`Notification marked as read: ${id}`, { userId })

      return notification
    } catch (error) {
      logger.error(`Error marking notification ${id} as read:`, error)
      throw error
    }
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(userId: string): Promise<{ modifiedCount: number }> {
    try {
      const result = await notificationRepository.markAllAsReadByUserId(userId)

      // Update unread count in Redis
      await this.redis.set(`user:${userId}:unread_notifications`, "0", 300)

      // Invalidate cached notifications
      await this.invalidateNotificationsCache(userId)

      logger.info(`All notifications marked as read for user: ${userId}`, {
        modifiedCount: result.modifiedCount
      })

      return result
    } catch (error) {
      logger.error(`Error marking all notifications as read for user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Delete notification
   */
  async deleteNotification(id: string, userId: string): Promise<boolean> {
    try {
      const result = await notificationRepository.deleteByIdAndUserId(id, userId)

      if (!result) {
        throw ApiError.notFound("Notification not found")
      }

      // Remove from cache
      await this.redis.del(`notification:${id}`)

      // Update unread count in Redis
      const unreadCount = await notificationRepository.countUnreadByUserId(userId)
      await this.redis.set(`user:${userId}:unread_notifications`, unreadCount.toString(), 300)

      // Invalidate cached notifications
      await this.invalidateNotificationsCache(userId)

      logger.info(`Notification deleted: ${id}`, { userId })

      return true
    } catch (error) {
      logger.error(`Error deleting notification ${id}:`, error)
      throw error
    }
  }

  /**
   * Delete all notifications for user
   */
  async deleteAllNotifications(userId: string): Promise<{ deletedCount: number }> {
    try {
      const result = await notificationRepository.deleteAllByUserId(userId)

      // Update unread count in Redis
      await this.redis.set(`user:${userId}:unread_notifications`, "0", 300)

      // Invalidate cached notifications
      await this.invalidateNotificationsCache(userId)

      logger.info(`All notifications deleted for user: ${userId}`, {
        deletedCount: result.deletedCount
      })

      return result
    } catch (error) {
      logger.error(`Error deleting all notifications for user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Create message notification
   */
  async createMessageNotification(
    senderId: string,
    recipientId: string,
    messageId: string,
    messageContent: string,
    conversationId: string,
    conversationType: string,
  ): Promise<void> {
    try {
      // Don't notify self
      if (senderId === recipientId) {
        return
      }

      // Check if user has notifications enabled
      const recipient = await userRepository.findById(recipientId)
      if (!recipient || !recipient.notificationSettings?.messages) {
        return
      }

      // Get sender details
      const sender = await userRepository.findById(senderId)

      if (!sender) {
        logger.error(`Sender ${senderId} not found for notification`)
        return
      }

      // Create notification content
      const senderName = sender.firstName && sender.lastName 
        ? `${sender.firstName} ${sender.lastName}` 
        : sender.username

      const content = messageContent.length > 50 
        ? `${messageContent.substring(0, 50)}...` 
        : messageContent

      // Create notification
      await this.createNotification({
        recipient: recipientId,
        sender: senderId,
        type: "new_message",
        content: `${senderName}: ${content}`,
        relatedId: conversationId,
        relatedType: conversationType === "GROUP" ? "Group" : "Conversation",
        metadata: {
          messageId,
          conversationType,
          senderName
        }
      })
    } catch (error) {
      logger.error("Error creating message notification:", error)
      // Don't throw, just log - notifications are non-critical
    }
  }

  /**
   * Create mention notification
   */
  async createMentionNotification(
    senderId: string,
    mentionedUserId: string,
    messageId: string,
    conversationId: string,
    conversationType: string,
  ): Promise<void> {
    try {
      // Don't notify self
      if (senderId === mentionedUserId) {
        return
      }

      // Check if user has mentions notifications enabled
      const mentionedUser = await userRepository.findById(mentionedUserId)
      if (!mentionedUser || !mentionedUser.notificationSettings?.mentions) {
        return
      }

      // Get sender details
      const sender = await userRepository.findById(senderId)

      if (!sender) {
        logger.error(`Sender ${senderId} not found for notification`)
        return
      }

      // Create notification content
      const senderName = sender.firstName && sender.lastName 
        ? `${sender.firstName} ${sender.lastName}` 
        : sender.username

      // Create notification
      await this.createNotification({
        recipient: mentionedUserId,
        sender: senderId,
        type: "mention",
        content: `${senderName} mentioned you in a message`,
        relatedId: messageId,
        relatedType: "Message",
        metadata: {
          conversationId,
          conversationType,
          senderName
        }
      })
    } catch (error) {
      logger.error("Error creating mention notification:", error)
      // Don't throw, just log - notifications are non-critical
    }
  }

  /**
   * Create reaction notification
   */
  async createReactionNotification(
    reactorId: string,
    messageOwnerId: string,
    messageId: string,
    reactionType: string,
  ): Promise<void> {
    try {
      // Don't notify self
      if (reactorId === messageOwnerId) {
        return
      }

      // Check if user has reaction notifications enabled
      const messageOwner = await userRepository.findById(messageOwnerId)
      if (!messageOwner || !messageOwner.notificationSettings?.reactions) {
        return
      }

      // Get reactor details
      const reactor = await userRepository.findById(reactorId)

      if (!reactor) {
        logger.error(`Reactor ${reactorId} not found for notification`)
        return
      }

      // Create notification content
      const reactorName = reactor.firstName && reactor.lastName 
        ? `${reactor.firstName} ${reactor.lastName}` 
        : reactor.username

      // Create notification
      await this.createNotification({
        recipient: messageOwnerId,
        sender: reactorId,
        type: "message_reaction",
        content: `${reactorName} reacted with ${reactionType} to your message`,
        relatedId: messageId,
        relatedType: "Message",
        metadata: {
          reactionType,
          reactorName
        }
      })
    } catch (error) {
      logger.error("Error creating reaction notification:", error)
      // Don't throw, just log - notifications are non-critical
    }
  }

  /**
   * Create group invitation notification
   */
  async createGroupInviteNotification(
    inviterId: string,
    inviteeId: string,
    groupId: string,
    groupName: string,
  ): Promise<void> {
    try {
      // Get inviter details
      const inviter = await userRepository.findById(inviterId)

      if (!inviter) {
        logger.error(`Inviter ${inviterId} not found for notification`)
        return
      }

      // Create notification content
      const inviterName = inviter.firstName && inviter.lastName 
        ? `${inviter.firstName} ${inviter.lastName}` 
        : inviter.username

      // Create notification
      await this.createNotification({
        recipient: inviteeId,
        sender: inviterId,
        type: "group_invite",
        content: `${inviterName} invited you to join the group "${groupName}"`,
        relatedId: groupId,
        relatedType: "Group",
        metadata: {
          groupName,
          inviterName
        }
      })
    } catch (error) {
      logger.error("Error creating group invite notification:", error)
      // Don't throw, just log - notifications are non-critical
    }
  }

  /**
   * Create call notification
   */
  async createCallNotification(
    callerId: string,
    recipientId: string,
    callId: string,
    callType: "audio" | "video",
    status: "incoming" | "missed" | "ended"
  ): Promise<void> {
    try {
      // Don't notify self
      if (callerId === recipientId) {
        return
      }

      // Get caller details
      const caller = await userRepository.findById(callerId)

      if (!caller) {
        logger.error(`Caller ${callerId} not found for notification`)
        return
      }

      // Create notification content
      const callerName = caller.firstName && caller.lastName 
        ? `${caller.firstName} ${caller.lastName}` 
        : caller.username

      let content: string
      let type: string

      switch (status) {
        case "incoming":
          content = `Incoming ${callType} call from ${callerName}`
          type = "incoming_call"
          break
        case "missed":
          content = `You missed a ${callType} call from ${callerName}`
          type = "missed_call"
          break
        case "ended":
          content = `${callType} call with ${callerName} ended`
          type = "call_ended"
          break
        default:
          return
      }

      // Create notification
      await this.createNotification({
        recipient: recipientId,
        sender: callerId,
        type,
        content,
        relatedId: callId,
        relatedType: "Call",
        metadata: {
          callType,
          callerName,
          status
        }
      })
    } catch (error) {
      logger.error("Error creating call notification:", error)
      // Don't throw, just log - notifications are non-critical
    }
  }

  /**
   * Get notification preferences for user
   */
  async getNotificationPreferences(userId: string): Promise<any> {
    try {
      const user = await userRepository.findById(userId)
      
      if (!user) {
        throw ApiError.notFound("User not found")
      }

      return user.notificationSettings || {
        messages: true,
        mentions: true,
        reactions: true,
        calls: true,
        groups: true,
        email: false,
        push: true
      }
    } catch (error) {
      logger.error(`Error getting notification preferences for user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Update notification preferences for user
   */
  async updateNotificationPreferences(
    userId: string, 
    preferences: {
      messages?: boolean
      mentions?: boolean
      reactions?: boolean
      calls?: boolean
      groups?: boolean
      email?: boolean
      push?: boolean
    }
  ): Promise<any> {
    try {
      const updatedUser = await userRepository.updateNotificationSettings(userId, preferences)

      if (!updatedUser) {
        throw ApiError.notFound("User not found")
      }

      logger.info(`Notification preferences updated for user: ${userId}`, preferences)

      return updatedUser.notificationSettings
    } catch (error) {
      logger.error(`Error updating notification preferences for user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Clean up old notifications
   * This should be called periodically by a cron job
   */
  async cleanupOldNotifications(olderThanDays = 30): Promise<number> {
    try {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays)

      const result = await notificationRepository.deleteOlderThan(cutoffDate)

      logger.info(`Cleaned up ${result.deletedCount} old notifications`)

      return result.deletedCount
    } catch (error) {
      logger.error("Error cleaning up old notifications:", error)
      throw error
    }
  }

  /**
   * Helper methods
   */
  private async cacheNotification(notification: any): Promise<void> {
    try {
      await this.redis.setJSON(`notification:${notification.id}`, notification, 3600) // Cache for 1 hour
    } catch (error) {
      logger.error(`Error caching notification ${notification.id}:`, error)
      // Don't throw, caching is non-critical
    }
  }

  private async invalidateNotificationsCache(userId: string): Promise<void> {
    try {
      const keys = await this.redis.keys(`user:${userId}:notifications:*`)
      if (keys.length > 0) {
        await this.redis.delete(...keys)
      }
    } catch (error) {
      logger.error(`Error invalidating notifications cache for user ${userId}:`, error)
      // Don't throw, cache invalidation is non-critical
    }
  }
}

// Export singleton instance
export const notificationService = new NotificationService()
