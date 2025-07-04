import type { Server as SocketIOServer } from "socket.io"
import { logger } from "../utils/logger"
import { getRedisManager } from "../config/redis"
import { SOCKET_EVENTS, SOCKET_ROOMS } from "../socket"

/**
 * Socket Service - Centralized service for Socket.IO operations
 * Bridges controllers and services with real-time Socket.IO functionality
 */
export class SocketService {
  private io: SocketIOServer | null = null
  private redis = getRedisManager()

  /**
   * Initialize the socket service with Socket.IO server instance
   */
  initialize(io: SocketIOServer): void {
    this.io = io
    logger.info("SocketService initialized successfully")
  }

  /**
   * Get Socket.IO server instance
   */
  getIO(): SocketIOServer {
    if (!this.io) {
      throw new Error("SocketService not initialized. Call initialize() first.")
    }
    return this.io
  }

  // ========================================
  // MESSAGE EVENTS
  // ========================================

  /**
   * Emit new message to conversation participants
   */
  async emitNewMessage(conversationId: string, message: any, excludeUserId?: string): Promise<void> {
    try {
      const io = this.getIO()
      
      // Emit to conversation room
      const room = SOCKET_ROOMS.CONVERSATION(conversationId)
      io.to(room).emit(SOCKET_EVENTS.MESSAGE_RECEIVED, message)

      // Also emit to individual user rooms for better delivery guarantee
      if (message.conversation?.participants) {
        for (const participant of message.conversation.participants) {
          const participantId = typeof participant === 'string' ? participant : participant.id
          
          if (participantId !== excludeUserId) {
            io.to(SOCKET_ROOMS.USER(participantId)).emit(SOCKET_EVENTS.MESSAGE_RECEIVED, message)
          }
        }
      }

      // Cache message for recovery
      await this.redis.setJSON(`message:${message.id}`, message, 60 * 60 * 24) // 24 hours

      logger.debug(`Emitted new message to conversation ${conversationId}`, {
        messageId: message.id,
        senderId: message.senderId
      })
    } catch (error) {
      logger.error("Error emitting new message:", error)
    }
  }

  /**
   * Emit message update to conversation participants
   */
  async emitMessageUpdate(conversationId: string, message: any): Promise<void> {
    try {
      const io = this.getIO()
      
      // Emit to conversation room
      const room = SOCKET_ROOMS.CONVERSATION(conversationId)
      io.to(room).emit(SOCKET_EVENTS.MESSAGE_UPDATED, message)

      // Update cache
      await this.redis.setJSON(`message:${message.id}`, message, 60 * 60 * 24)

      logger.debug(`Emitted message update for conversation ${conversationId}`, {
        messageId: message.id
      })
    } catch (error) {
      logger.error("Error emitting message update:", error)
    }
  }

  /**
   * Emit message deletion to conversation participants
   */
  async emitMessageDelete(conversationId: string, messageId: string): Promise<void> {
    try {
      const io = this.getIO()
      
      // Emit to conversation room
      const room = SOCKET_ROOMS.CONVERSATION(conversationId)
      io.to(room).emit(SOCKET_EVENTS.MESSAGE_DELETED, {
        messageId,
        conversationId,
        deletedAt: new Date().toISOString()
      })

      // Remove from cache
      await this.redis.del(`message:${messageId}`)

      logger.debug(`Emitted message deletion for conversation ${conversationId}`, {
        messageId
      })
    } catch (error) {
      logger.error("Error emitting message deletion:", error)
    }
  }

  /**
   * Emit message reaction update to conversation participants
   */
  async emitMessageReaction(conversationId: string, messageId: string, reactions: any[]): Promise<void> {
    try {
      const io = this.getIO()
      
      // Emit to conversation room
      const room = SOCKET_ROOMS.CONVERSATION(conversationId)
      io.to(room).emit(SOCKET_EVENTS.MESSAGE_REACTION_UPDATED, {
        messageId,
        reactions,
        updatedAt: new Date().toISOString()
      })

      logger.debug(`Emitted message reaction update for conversation ${conversationId}`, {
        messageId,
        reactionCount: reactions.length
      })
    } catch (error) {
      logger.error("Error emitting message reaction:", error)
    }
  }

  /**
   * Emit message read status to conversation participants
   */
  async emitMessageRead(conversationId: string, messageId: string, userId: string): Promise<void> {
    try {
      const io = this.getIO()
      
      // Emit to conversation room (excluding the reader)
      const room = SOCKET_ROOMS.CONVERSATION(conversationId)
      io.to(room).except(SOCKET_ROOMS.USER(userId)).emit(SOCKET_EVENTS.MESSAGE_READ_STATUS, {
        messageId,
        userId,
        readAt: new Date().toISOString()
      })

      logger.debug(`Emitted message read status for conversation ${conversationId}`, {
        messageId,
        userId
      })
    } catch (error) {
      logger.error("Error emitting message read status:", error)
    }
  }

  /**
   * Emit message delivery status to sender
   */
  async emitMessageDelivered(senderId: string, messageId: string, deliveredToUserId: string): Promise<void> {
    try {
      const io = this.getIO()
      
      // Emit to sender
      io.to(SOCKET_ROOMS.USER(senderId)).emit(SOCKET_EVENTS.MESSAGE_DELIVERED, {
        messageId,
        deliveredToUserId,
        deliveredAt: new Date().toISOString()
      })

      logger.debug(`Emitted message delivery status to sender ${senderId}`, {
        messageId,
        deliveredToUserId
      })
    } catch (error) {
      logger.error("Error emitting message delivery status:", error)
    }
  }

  // ========================================
  // PRESENCE EVENTS
  // ========================================

  /**
   * Emit user online status
   */
  async emitUserOnline(userId: string, userInfo: any): Promise<void> {
    try {
      const io = this.getIO()
      
      // Broadcast to all connected users
      io.emit(SOCKET_EVENTS.PRESENCE_ONLINE, {
        userId,
        user: userInfo,
        onlineAt: new Date().toISOString()
      })

      // Cache online status
      await this.redis.setJSON(`presence:${userId}`, {
        status: 'online',
        lastSeen: new Date().toISOString(),
        user: userInfo
      }, 60 * 60) // 1 hour

      logger.debug(`Emitted user online status for ${userId}`)
    } catch (error) {
      logger.error("Error emitting user online status:", error)
    }
  }

  /**
   * Emit user offline status
   */
  async emitUserOffline(userId: string): Promise<void> {
    try {
      const io = this.getIO()
      
      // Broadcast to all connected users
      io.emit(SOCKET_EVENTS.PRESENCE_OFFLINE, {
        userId,
        offlineAt: new Date().toISOString()
      })

      // Update cache
      await this.redis.setJSON(`presence:${userId}`, {
        status: 'offline',
        lastSeen: new Date().toISOString()
      }, 60 * 60 * 24) // 24 hours

      logger.debug(`Emitted user offline status for ${userId}`)
    } catch (error) {
      logger.error("Error emitting user offline status:", error)
    }
  }

  /**
   * Emit presence status update
   */
  async emitPresenceUpdate(userId: string, status: string, userInfo?: any): Promise<void> {
    try {
      const io = this.getIO()
      
      // Broadcast to all connected users
      io.emit(SOCKET_EVENTS.PRESENCE_UPDATED, {
        userId,
        status,
        user: userInfo,
        updatedAt: new Date().toISOString()
      })

      // Update cache
      await this.redis.setJSON(`presence:${userId}`, {
        status,
        lastSeen: new Date().toISOString(),
        user: userInfo
      }, 60 * 60) // 1 hour

      logger.debug(`Emitted presence update for ${userId}`, { status })
    } catch (error) {
      logger.error("Error emitting presence update:", error)
    }
  }

  // ========================================
  // TYPING EVENTS
  // ========================================

  /**
   * Emit typing status to conversation participants
   */
  async emitTypingStatus(conversationId: string, userId: string, isTyping: boolean, userInfo?: any): Promise<void> {
    try {
      const io = this.getIO()
      
      // Emit to conversation room (excluding the typer)
      const room = SOCKET_ROOMS.CONVERSATION(conversationId)
      io.to(room).except(SOCKET_ROOMS.USER(userId)).emit(SOCKET_EVENTS.TYPING_UPDATED, {
        conversationId,
        userId,
        user: userInfo,
        isTyping,
        timestamp: new Date().toISOString()
      })

      // Cache typing status with short TTL
      if (isTyping) {
        await this.redis.setJSON(`typing:${conversationId}:${userId}`, {
          userId,
          user: userInfo,
          startedAt: new Date().toISOString()
        }, 10) // 10 seconds
      } else {
        await this.redis.del(`typing:${conversationId}:${userId}`)
      }

      logger.debug(`Emitted typing status for conversation ${conversationId}`, {
        userId,
        isTyping
      })
    } catch (error) {
      logger.error("Error emitting typing status:", error)
    }
  }

  // ========================================
  // GROUP EVENTS
  // ========================================

  /**
   * Emit group creation to participants
   */
  async emitGroupCreated(group: any): Promise<void> {
    try {
      const io = this.getIO()
      
      // Emit to all group members
      if (group.members) {
        for (const member of group.members) {
          const memberId = typeof member === 'string' ? member : member.userId || member.id
          io.to(SOCKET_ROOMS.USER(memberId)).emit(SOCKET_EVENTS.GROUP_ADDED, group)
        }
      }

      logger.debug(`Emitted group creation for group ${group.id}`, {
        memberCount: group.members?.length || 0
      })
    } catch (error) {
      logger.error("Error emitting group creation:", error)
    }
  }

  /**
   * Emit group update to members
   */
  async emitGroupUpdate(groupId: string, group: any): Promise<void> {
    try {
      const io = this.getIO()
      
      // Emit to group room
      const room = SOCKET_ROOMS.GROUP(groupId)
      io.to(room).emit(SOCKET_EVENTS.GROUP_UPDATED, group)

      logger.debug(`Emitted group update for group ${groupId}`)
    } catch (error) {
      logger.error("Error emitting group update:", error)
    }
  }

  /**
   * Emit member joined group
   */
  async emitMemberJoined(groupId: string, member: any, group?: any): Promise<void> {
    try {
      const io = this.getIO()
      
      // Emit to group room
      const room = SOCKET_ROOMS.GROUP(groupId)
      io.to(room).emit(SOCKET_EVENTS.GROUP_MEMBER_JOINED, {
        groupId,
        member,
        group,
        joinedAt: new Date().toISOString()
      })

      // Emit to new member
      const memberId = typeof member === 'string' ? member : member.userId || member.id
      io.to(SOCKET_ROOMS.USER(memberId)).emit(SOCKET_EVENTS.GROUP_ADDED, group)

      logger.debug(`Emitted member joined for group ${groupId}`, {
        memberId
      })
    } catch (error) {
      logger.error("Error emitting member joined:", error)
    }
  }

  /**
   * Emit member left group
   */
  async emitMemberLeft(groupId: string, memberId: string, group?: any): Promise<void> {
    try {
      const io = this.getIO()
      
      // Emit to group room
      const room = SOCKET_ROOMS.GROUP(groupId)
      io.to(room).emit(SOCKET_EVENTS.GROUP_MEMBER_LEFT, {
        groupId,
        memberId,
        group,
        leftAt: new Date().toISOString()
      })

      // Emit to removed member
      io.to(SOCKET_ROOMS.USER(memberId)).emit(SOCKET_EVENTS.GROUP_REMOVED, {
        groupId,
        group
      })

      logger.debug(`Emitted member left for group ${groupId}`, {
        memberId
      })
    } catch (error) {
      logger.error("Error emitting member left:", error)
    }
  }

  // ========================================
  // NOTIFICATION EVENTS
  // ========================================

  /**
   * Emit notification to user
   */
  async emitNotification(userId: string, notification: any): Promise<void> {
    try {
      const io = this.getIO()
      
      // Emit to user
      io.to(SOCKET_ROOMS.USER(userId)).emit(SOCKET_EVENTS.NOTIFICATION_UNREAD_COUNT, notification)

      // Cache notification
      await this.redis.setJSON(`notification:${notification.id}`, notification, 60 * 60 * 24 * 7) // 7 days

      logger.debug(`Emitted notification to user ${userId}`, {
        notificationId: notification.id,
        type: notification.type
      })
    } catch (error) {
      logger.error("Error emitting notification:", error)
    }
  }

  /**
   * Emit unread count update to user
   */
  async emitUnreadCount(userId: string, count: number): Promise<void> {
    try {
      const io = this.getIO()
      
      // Emit to user
      io.to(SOCKET_ROOMS.USER(userId)).emit(SOCKET_EVENTS.NOTIFICATION_UNREAD_COUNT, {
        userId,
        unreadCount: count,
        updatedAt: new Date().toISOString()
      })

      logger.debug(`Emitted unread count to user ${userId}`, { count })
    } catch (error) {
      logger.error("Error emitting unread count:", error)
    }
  }

  // ========================================
  // CALL EVENTS
  // ========================================

  /**
   * Emit incoming call to user
   */
  async emitIncomingCall(userId: string, callData: any): Promise<void> {
    try {
      const io = this.getIO()
      
      // Emit to user
      io.to(SOCKET_ROOMS.USER(userId)).emit(SOCKET_EVENTS.CALL_INCOMING, callData)

      logger.debug(`Emitted incoming call to user ${userId}`, {
        callId: callData.id,
        callerId: callData.callerId
      })
    } catch (error) {
      logger.error("Error emitting incoming call:", error)
    }
  }

  /**
   * Emit call answered
   */
  async emitCallAnswered(callId: string, answerData: any): Promise<void> {
    try {
      const io = this.getIO()
      
      // Emit to call room
      const room = SOCKET_ROOMS.CALL(callId)
      io.to(room).emit(SOCKET_EVENTS.CALL_ANSWERED, answerData)

      logger.debug(`Emitted call answered for call ${callId}`)
    } catch (error) {
      logger.error("Error emitting call answered:", error)
    }
  }

  /**
   * Emit call ended
   */
  async emitCallEnded(callId: string, endData: any): Promise<void> {
    try {
      const io = this.getIO()
      
      // Emit to call room
      const room = SOCKET_ROOMS.CALL(callId)
      io.to(room).emit(SOCKET_EVENTS.CALL_ENDED, endData)

      logger.debug(`Emitted call ended for call ${callId}`)
    } catch (error) {
      logger.error("Error emitting call ended:", error)
    }
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  /**
   * Join user to conversation room
   */
  async joinConversationRoom(userId: string, conversationId: string): Promise<void> {
    try {
      const io = this.getIO()
      const userSockets = await io.in(SOCKET_ROOMS.USER(userId)).fetchSockets()
      
      for (const socket of userSockets) {
        await socket.join(SOCKET_ROOMS.CONVERSATION(conversationId))
      }

      logger.debug(`User ${userId} joined conversation room ${conversationId}`)
    } catch (error) {
      logger.error("Error joining conversation room:", error)
    }
  }

  /**
   * Leave user from conversation room
   */
  async leaveConversationRoom(userId: string, conversationId: string): Promise<void> {
    try {
      const io = this.getIO()
      const userSockets = await io.in(SOCKET_ROOMS.USER(userId)).fetchSockets()
      
      for (const socket of userSockets) {
        await socket.leave(SOCKET_ROOMS.CONVERSATION(conversationId))
      }

      logger.debug(`User ${userId} left conversation room ${conversationId}`)
    } catch (error) {
      logger.error("Error leaving conversation room:", error)
    }
  }

  /**
   * Join user to group room
   */
  async joinGroupRoom(userId: string, groupId: string): Promise<void> {
    try {
      const io = this.getIO()
      const userSockets = await io.in(SOCKET_ROOMS.USER(userId)).fetchSockets()
      
      for (const socket of userSockets) {
        await socket.join(SOCKET_ROOMS.GROUP(groupId))
      }

      logger.debug(`User ${userId} joined group room ${groupId}`)
    } catch (error) {
      logger.error("Error joining group room:", error)
    }
  }

  /**
   * Leave user from group room
   */
  async leaveGroupRoom(userId: string, groupId: string): Promise<void> {
    try {
      const io = this.getIO()
      const userSockets = await io.in(SOCKET_ROOMS.USER(userId)).fetchSockets()
      
      for (const socket of userSockets) {
        await socket.leave(SOCKET_ROOMS.GROUP(groupId))
      }

      logger.debug(`User ${userId} left group room ${groupId}`)
    } catch (error) {
      logger.error("Error leaving group room:", error)
    }
  }

  /**
   * Get connected users count
   */
  async getConnectedUsersCount(): Promise<number> {
    try {
      const io = this.getIO()
      return io.engine.clientsCount
    } catch (error) {
      logger.error("Error getting connected users count:", error)
      return 0
    }
  }

  /**
   * Check if user is online
   */
  async isUserOnline(userId: string): Promise<boolean> {
    try {
      const io = this.getIO()
      const sockets = await io.in(SOCKET_ROOMS.USER(userId)).fetchSockets()
      return sockets.length > 0
    } catch (error) {
      logger.error("Error checking if user is online:", error)
      return false
    }
  }

  /**
   * Broadcast to all connected users
   */
  async broadcastToAll(event: string, data: any): Promise<void> {
    try {
      const io = this.getIO()
      io.emit(event, data)
      
      logger.debug(`Broadcasted event ${event} to all users`, {
        connectedUsers: io.engine.clientsCount
      })
    } catch (error) {
      logger.error("Error broadcasting to all users:", error)
    }
  }

  /**
   * Broadcast to specific users
   */
  async broadcastToUsers(userIds: string[], event: string, data: any): Promise<void> {
    try {
      const io = this.getIO()
      
      for (const userId of userIds) {
        io.to(SOCKET_ROOMS.USER(userId)).emit(event, data)
      }
      
      logger.debug(`Broadcasted event ${event} to ${userIds.length} users`)
    } catch (error) {
      logger.error("Error broadcasting to users:", error)
    }
  }

  /**
   * Disconnect user from all sessions
   */
  async disconnectUser(userId: string, reason?: string): Promise<void> {
    try {
      const io = this.getIO()
      const sockets = await io.in(SOCKET_ROOMS.USER(userId)).fetchSockets()
      
      for (const socket of sockets) {
        socket.disconnect(true)
      }
      
      logger.info(`Disconnected user ${userId} from all sessions`, { reason })
    } catch (error) {
      logger.error("Error disconnecting user:", error)
    }
  }
}

// Export singleton instance
export const socketService = new SocketService()
