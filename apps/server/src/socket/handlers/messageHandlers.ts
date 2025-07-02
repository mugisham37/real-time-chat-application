import type { Server as SocketIOServer } from "socket.io"
import { logger } from "../../utils/logger"
import { getRedisManager } from "../../config/redis"
import { validateZodEvent } from "../utils/validateZodEvent"
import { 
  messageEventSchema,
  messageEditSchema,
  messageReactionSchema
} from "../validators/zodSchemas"
import type { 
  AuthenticatedSocket,
  SendMessageData,
  MessageReactionData,
  SocketCallback,
  SafeError
} from "../../types/socketHandlers"

// Import repositories - we'll need to create these imports based on the actual repository structure
// For now, I'll create placeholder interfaces that match the expected repository pattern

interface MessageRepository {
  create(data: any): Promise<any>
  findById(id: string): Promise<any>
  markAsRead(messageId: string, userId: string): Promise<any>
  edit(messageId: string, content: string, userId: string): Promise<any>
  delete(messageId: string, userId: string): Promise<any>
  addReaction(messageId: string, userId: string, reactionType: string): Promise<any>
  getConversationMessages(conversationId: string, limit: number, before?: Date): Promise<any[]>
  markAsDelivered(messageId: string, userId: string): Promise<any>
}

interface ConversationRepository {
  findById(id: string): Promise<any>
  updateUnreadCount(conversationId: string, userId: string, increment: boolean): Promise<any>
}

interface GroupRepository {
  findById(id: string): Promise<any>
}

// These will be imported from the actual repositories
const messageRepository: MessageRepository = {} as MessageRepository
const conversationRepository: ConversationRepository = {} as ConversationRepository
const groupRepository: GroupRepository = {} as GroupRepository

export const setupMessageHandlers = (io: SocketIOServer, socket: AuthenticatedSocket) => {
  const userId = socket.data.user?._id

  if (!userId) {
    logger.error('User ID not found in socket data')
    return
  }

  // Send a new message
  socket.on("message:send", async (data: any, callback: SocketCallback) => {
    try {
      // Validate event data
      const validationResult = validateZodEvent(messageEventSchema, data)
      if (!validationResult.success) {
        return callback({
          success: false,
          message: "Validation error",
          errors: validationResult.errors,
        })
      }

      const { conversationId, content, contentType = "text", mediaUrl, mediaDetails, replyTo, mentions } = data

      // Check if conversation exists and user is a participant
      let isGroup = false
      let participants = []
      let conversation = null
      let group = null

      try {
        conversation = await conversationRepository.findById(conversationId)

        if (!conversation) {
          // Check if it's a group
          group = await groupRepository.findById(conversationId)
          if (!group) {
            return callback({
              success: false,
              message: "Conversation not found",
            })
          }

          // Check if user is a member of the group
          const isMember = group.members.some((member: any) => member.user.toString() === userId.toString())
          if (!isMember) {
            return callback({
              success: false,
              message: "You are not a member of this group",
            })
          }

          isGroup = true
          participants = group.members.map((member: any) => member.user.toString())
        } else {
          // Check if user is a participant in the conversation
          const isParticipant = conversation.participants.some(
            (participant: any) => participant.toString() === userId.toString(),
          )

          if (!isParticipant) {
            return callback({
              success: false,
              message: "You are not a participant in this conversation",
            })
          }

          participants = conversation.participants.map((participant: any) => participant.toString())
        }

        // Create message data
        const messageData = {
          conversationId,
          conversationType: isGroup ? "Group" : "Conversation",
          sender: userId,
          content,
          contentType,
          mediaUrl,
          mediaDetails,
          replyTo,
          mentions,
          deliveredTo: [{ user: userId, deliveredAt: new Date() }],
          readBy: [{ user: userId, readAt: new Date() }],
        }

        // Create new message
        const newMessage = await messageRepository.create(messageData)

        // Get populated message
        const populatedMessage = await messageRepository.findById(newMessage._id.toString())

        // Emit message to all participants
        if (isGroup) {
          // Emit to group room
          io.to(`group:${conversationId}`).emit("message:received", populatedMessage)
        } else {
          // Emit to all participants
          participants.forEach((participantId: string) => {
            if (participantId !== userId.toString()) {
              io.to(`user:${participantId}`).emit("message:received", populatedMessage)
            }
          })
        }

        // Store message in Redis for recovery
        const redisManager = getRedisManager()
        await redisManager.setJSON(`message:${newMessage._id}`, populatedMessage, 60 * 60 * 24) // 24 hours

        // Return success response
        callback({
          success: true,
          data: populatedMessage,
        })
      } catch (error) {
        logger.error("Error in message:send handler:", error)
        callback({
          success: false,
          message: "Failed to send message",
        })
      }
    } catch (error) {
      logger.error("Error in message:send handler:", error)
      callback({
        success: false,
        message: "Failed to send message",
      })
    }
  })

  // Mark message as read
  socket.on("message:read", async (data: any, callback: SocketCallback) => {
    try {
      const { messageId } = data

      if (!messageId) {
        return callback({
          success: false,
          message: "Message ID is required",
        })
      }

      try {
        // Mark message as read
        const updatedMessage = await messageRepository.markAsRead(messageId, userId)

        if (!updatedMessage) {
          return callback({
            success: false,
            message: "Message not found",
          })
        }

        // Emit read status to all participants
        if (updatedMessage.conversationType === "Group") {
          io.to(`group:${updatedMessage.conversationId}`).emit("message:read_status", {
            messageId,
            userId,
            readAt: new Date(),
          })
        } else {
          const conversation = await conversationRepository.findById(updatedMessage.conversationId.toString())
          if (conversation) {
            conversation.participants.forEach((participant: any) => {
              if (participant.toString() !== userId) {
                io.to(`user:${participant.toString()}`).emit("message:read_status", {
                  messageId,
                  userId,
                  readAt: new Date(),
                })
              }
            })
          }
        }

        callback({
          success: true,
          data: {
            messageId,
            readAt: new Date(),
          },
        })
      } catch (error) {
        logger.error("Error marking message as read:", error)
        callback({
          success: false,
          message: "Failed to mark message as read",
        })
      }
    } catch (error) {
      logger.error("Error in message:read handler:", error)
      callback({
        success: false,
        message: "Failed to mark message as read",
      })
    }
  })

  // Edit message
  socket.on("message:edit", async (data: any, callback: SocketCallback) => {
    try {
      // Validate event data
      const validationResult = validateZodEvent(messageEditSchema, data)
      if (!validationResult.success) {
        return callback({
          success: false,
          message: "Validation error",
          errors: validationResult.errors,
        })
      }

      if (!validationResult.value) {
        return callback({
          success: false,
          message: "Validation failed",
        })
      }

      const { messageId, content } = validationResult.value

      try {
        // Edit message
        const updatedMessage = await messageRepository.edit(messageId, content, userId)

        if (!updatedMessage) {
          return callback({
            success: false,
            message: "Failed to edit message",
          })
        }

        // Emit updated message to all participants
        if (updatedMessage.conversationType === "Group") {
          io.to(`group:${updatedMessage.conversationId}`).emit("message:updated", updatedMessage)
        } else {
          const conversation = await conversationRepository.findById(updatedMessage.conversationId.toString())
          if (conversation) {
            conversation.participants.forEach((participant: any) => {
              io.to(`user:${participant.toString()}`).emit("message:updated", updatedMessage)
            })
          }
        }

        callback({
          success: true,
          data: updatedMessage,
        })
      } catch (error) {
        logger.error("Error editing message:", error)
        callback({
          success: false,
          message: (error as Error).message || "Failed to edit message",
        })
      }
    } catch (error) {
      logger.error("Error in message:edit handler:", error)
      callback({
        success: false,
        message: "Failed to edit message",
      })
    }
  })

  // Delete message
  socket.on("message:delete", async (data: any, callback: SocketCallback) => {
    try {
      const { messageId } = data

      if (!messageId) {
        return callback({
          success: false,
          message: "Message ID is required",
        })
      }

      try {
        // Delete message
        const deletedMessage = await messageRepository.delete(messageId, userId)

        if (!deletedMessage) {
          return callback({
            success: false,
            message: "Failed to delete message",
          })
        }

        // Emit deleted message to all participants
        if (deletedMessage.conversationType === "Group") {
          io.to(`group:${deletedMessage.conversationId}`).emit("message:deleted", {
            messageId,
            conversationId: deletedMessage.conversationId,
          })
        } else {
          const conversation = await conversationRepository.findById(deletedMessage.conversationId.toString())
          if (conversation) {
            conversation.participants.forEach((participant: any) => {
              io.to(`user:${participant.toString()}`).emit("message:deleted", {
                messageId,
                conversationId: deletedMessage.conversationId,
              })
            })
          }
        }

        callback({
          success: true,
          data: {
            messageId,
            conversationId: deletedMessage.conversationId,
          },
        })
      } catch (error) {
        logger.error("Error deleting message:", error)
        callback({
          success: false,
          message: (error as Error).message || "Failed to delete message",
        })
      }
    } catch (error) {
      logger.error("Error in message:delete handler:", error)
      callback({
        success: false,
        message: "Failed to delete message",
      })
    }
  })

  // Add reaction to message
  socket.on("message:react", async (data: any, callback: SocketCallback) => {
    try {
      // Validate event data
      const validationResult = validateZodEvent(messageReactionSchema, data)
      if (!validationResult.success) {
        return callback({
          success: false,
          message: "Validation error",
          errors: validationResult.errors,
        })
      }

      if (!validationResult.value) {
        return callback({
          success: false,
          message: "Validation failed",
        })
      }

      const { messageId, reactionType } = validationResult.value

      try {
        // Add reaction
        const updatedMessage = await messageRepository.addReaction(messageId, userId, reactionType)

        if (!updatedMessage) {
          return callback({
            success: false,
            message: "Failed to add reaction",
          })
        }

        // Emit reaction update to all participants
        if (updatedMessage.conversationType === "Group") {
          io.to(`group:${updatedMessage.conversationId}`).emit("message:reaction_updated", {
            messageId,
            reactions: updatedMessage.reactions,
          })
        } else {
          const conversation = await conversationRepository.findById(updatedMessage.conversationId.toString())
          if (conversation) {
            conversation.participants.forEach((participant: any) => {
              io.to(`user:${participant.toString()}`).emit("message:reaction_updated", {
                messageId,
                reactions: updatedMessage.reactions,
              })
            })
          }
        }

        callback({
          success: true,
          data: {
            messageId,
            reactions: updatedMessage.reactions,
          },
        })
      } catch (error) {
        logger.error("Error adding reaction:", error)
        callback({
          success: false,
          message: (error as Error).message || "Failed to add reaction",
        })
      }
    } catch (error) {
      logger.error("Error in message:react handler:", error)
      callback({
        success: false,
        message: "Failed to add reaction",
      })
    }
  })

  // Get message history
  socket.on("message:history", async (data: any, callback: SocketCallback) => {
    try {
      const { conversationId, limit = 20, before } = data

      if (!conversationId) {
        return callback({
          success: false,
          message: "Conversation ID is required",
        })
      }

      try {
        // Check if conversation exists and user is a participant
        let isGroup = false
        const conversation = await conversationRepository.findById(conversationId)

        if (!conversation) {
          // Check if it's a group
          const group = await groupRepository.findById(conversationId)
          if (!group) {
            return callback({
              success: false,
              message: "Conversation not found",
            })
          }

          // Check if user is a member of the group
          const isMember = group.members.some((member: any) => member.user.toString() === userId.toString())
          if (!isMember) {
            return callback({
              success: false,
              message: "You are not a member of this group",
            })
          }

          isGroup = true
        } else {
          // Check if user is a participant in the conversation
          const isParticipant = conversation.participants.some(
            (participant: any) => participant.toString() === userId.toString(),
          )

          if (!isParticipant) {
            return callback({
              success: false,
              message: "You are not a participant in this conversation",
            })
          }
        }

        // Parse before date if provided
        let beforeDate: Date | undefined
        if (before) {
          beforeDate = new Date(before)
          if (isNaN(beforeDate.getTime())) {
            return callback({
              success: false,
              message: "Invalid before date format",
            })
          }
        }

        // Get messages
        const messages = await messageRepository.getConversationMessages(conversationId, limit, beforeDate)

        // Reset unread count for this user
        if (!isGroup) {
          await conversationRepository.updateUnreadCount(conversationId, userId, false)
        }

        callback({
          success: true,
          data: messages,
        })
      } catch (error) {
        logger.error("Error getting message history:", error)
        callback({
          success: false,
          message: "Failed to get message history",
        })
      }
    } catch (error) {
      logger.error("Error in message:history handler:", error)
      callback({
        success: false,
        message: "Failed to get message history",
      })
    }
  })

  // Mark messages as delivered
  socket.on("message:delivered", async (data: any, callback: SocketCallback) => {
    try {
      const { messageIds } = data

      if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
        return callback({
          success: false,
          message: "Message IDs are required",
        })
      }

      try {
        const deliveredMessages = []

        // Mark each message as delivered
        for (const messageId of messageIds) {
          const message = await messageRepository.findById(messageId)

          if (!message) {
            continue
          }

          // Check if already delivered to this user
          const alreadyDelivered = message.deliveredTo.some((delivered: any) => delivered.user.toString() === userId)

          if (!alreadyDelivered) {
            // Add user to deliveredTo array
            await messageRepository.markAsDelivered(messageId, userId)
            deliveredMessages.push(messageId)
          }
        }

        // Emit delivery status to senders
        for (const messageId of deliveredMessages) {
          const message = await messageRepository.findById(messageId)
          if (message) {
            io.to(`user:${message.sender.toString()}`).emit("message:delivery_status", {
              messageId,
              userId,
              deliveredAt: new Date(),
            })
          }
        }

        callback({
          success: true,
          data: {
            deliveredMessages,
          },
        })
      } catch (error) {
        logger.error("Error marking messages as delivered:", error)
        callback({
          success: false,
          message: "Failed to mark messages as delivered",
        })
      }
    } catch (error) {
      logger.error("Error in message:delivered handler:", error)
      callback({
        success: false,
        message: "Failed to mark messages as delivered",
      })
    }
  })
}
