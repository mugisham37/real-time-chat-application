import type { Server as SocketIOServer, Socket } from "socket.io"
import { logger } from "../../utils/logger"
import { getRedisManager } from "../../config/redis"
import { validateSocketEvent } from "../utils/validateSocketEvent"
import { typingStatusSchema } from "../validators/typingStatusSchema"

// Import repositories - we'll need to create these imports based on the actual repository structure
// For now, I'll create placeholder interfaces that match the expected repository pattern

interface ConversationRepository {
  findById(id: string): Promise<any>
}

interface GroupRepository {
  findById(id: string): Promise<any>
}

interface UserRepository {
  findById(id: string, select?: string): Promise<any>
}

// These will be imported from the actual repositories
const conversationRepository: ConversationRepository = {} as ConversationRepository
const groupRepository: GroupRepository = {} as GroupRepository
const userRepository: UserRepository = {} as UserRepository

export const setupTypingHandlers = (io: SocketIOServer, socket: Socket & { data: { user?: any } }) => {
  const userId = socket.data.user?._id

  // Start/stop typing
  socket.on("typing:status", async (data, callback) => {
    try {
      // Validate event data
      const validationResult = validateSocketEvent(typingStatusSchema, data)
      if (!validationResult.success) {
        return callback({
          success: false,
          message: "Validation error",
          errors: validationResult.errors,
        })
      }

      const { conversationId, isTyping } = data

      try {
        // Check if conversation exists and user is a participant
        let isGroup = false
        let participants = []

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

        // Update typing status in Redis
        const typingKey = `typing:${conversationId}`
        const redisManager = getRedisManager()

        if (isTyping) {
          // Set typing status with expiration (5 seconds)
          await redisManager.setJSON(typingKey, { [userId.toString()]: Date.now() }, 5)
        } else {
          // Remove typing status
          const currentTyping = await redisManager.getJSON(typingKey) as Record<string, number> || {}
          delete currentTyping[userId.toString()]
          
          if (Object.keys(currentTyping).length > 0) {
            await redisManager.setJSON(typingKey, currentTyping, 5)
          } else {
            await redisManager.delete(typingKey)
          }
        }

        // Get user details for the typing indicator
        const user = {
          _id: userId,
          username: socket.data.user.username,
          firstName: socket.data.user.firstName,
          lastName: socket.data.user.lastName,
        }

        // Emit typing status to all participants except the sender
        if (isGroup) {
          socket.to(`group:${conversationId}`).emit("typing:updated", {
            conversationId,
            user,
            isTyping,
          })
        } else {
          participants.forEach((participantId: string) => {
            if (participantId !== userId.toString()) {
              io.to(`user:${participantId}`).emit("typing:updated", {
                conversationId,
                user,
                isTyping,
              })
            }
          })
        }

        callback({
          success: true,
          data: {
            conversationId,
            isTyping,
          },
        })
      } catch (error) {
        logger.error("Error updating typing status:", error)
        callback({
          success: false,
          message: "Failed to update typing status",
        })
      }
    } catch (error) {
      logger.error("Error in typing:status handler:", error)
      callback({
        success: false,
        message: "Failed to update typing status",
      })
    }
  })

  // Get who is typing
  socket.on("typing:get", async (data, callback) => {
    try {
      const { conversationId } = data

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

        // Get typing users from Redis
        const typingKey = `typing:${conversationId}`
        const redisManager = getRedisManager()
        const typingUsers = await redisManager.getJSON(typingKey) as Record<string, number> || {}

        // Filter out expired typing indicators (older than 5 seconds)
        const now = Date.now()
        const activeTypingUsers: Record<string, number> = {}

        for (const [userId, timestamp] of Object.entries(typingUsers)) {
          if (now - timestamp < 5000) {
            activeTypingUsers[userId] = timestamp
          }
        }

        // Update Redis with active typing users only
        if (Object.keys(activeTypingUsers).length > 0) {
          await redisManager.setJSON(typingKey, activeTypingUsers, 5)
        } else {
          await redisManager.delete(typingKey)
        }

        // Get user details for active typing users
        const typingUserDetails = []
        for (const userId of Object.keys(activeTypingUsers)) {
          const user = await userRepository.findById(userId, "username firstName lastName avatar")
          if (user) {
            typingUserDetails.push({
              _id: user._id,
              username: user.username,
              firstName: user.firstName,
              lastName: user.lastName,
              avatar: user.avatar,
            })
          }
        }

        callback({
          success: true,
          data: {
            conversationId,
            typingUsers: typingUserDetails,
          },
        })
      } catch (error) {
        logger.error("Error getting typing status:", error)
        callback({
          success: false,
          message: "Failed to get typing status",
        })
      }
    } catch (error) {
      logger.error("Error in typing:get handler:", error)
      callback({
        success: false,
        message: "Failed to get typing status",
      })
    }
  })

  // Clear typing status when user sends a message
  socket.on("typing:clear", async (data, callback) => {
    try {
      const { conversationId } = data

      if (!conversationId) {
        return callback({
          success: false,
          message: "Conversation ID is required",
        })
      }

      try {
        // Remove typing status from Redis
        const typingKey = `typing:${conversationId}`
        const redisManager = getRedisManager()
        const currentTyping = await redisManager.getJSON(typingKey) as Record<string, number> || {}
        
        delete currentTyping[userId.toString()]
        
        if (Object.keys(currentTyping).length > 0) {
          await redisManager.setJSON(typingKey, currentTyping, 5)
        } else {
          await redisManager.delete(typingKey)
        }

        // Get user details for the typing indicator
        const user = {
          _id: userId,
          username: socket.data.user.username,
          firstName: socket.data.user.firstName,
          lastName: socket.data.user.lastName,
        }

        // Check if it's a group or direct conversation
        const conversation = await conversationRepository.findById(conversationId)
        let isGroup = false

        if (!conversation) {
          const group = await groupRepository.findById(conversationId)
          if (group) {
            isGroup = true
          }
        }

        // Emit typing cleared to all participants except the sender
        if (isGroup) {
          socket.to(`group:${conversationId}`).emit("typing:updated", {
            conversationId,
            user,
            isTyping: false,
          })
        } else if (conversation) {
          conversation.participants.forEach((participantId: any) => {
            if (participantId.toString() !== userId.toString()) {
              io.to(`user:${participantId.toString()}`).emit("typing:updated", {
                conversationId,
                user,
                isTyping: false,
              })
            }
          })
        }

        callback({
          success: true,
          data: {
            conversationId,
            isTyping: false,
          },
        })
      } catch (error) {
        logger.error("Error clearing typing status:", error)
        callback({
          success: false,
          message: "Failed to clear typing status",
        })
      }
    } catch (error) {
      logger.error("Error in typing:clear handler:", error)
      callback({
        success: false,
        message: "Failed to clear typing status",
      })
    }
  })

  // Auto-clear typing status on disconnect
  socket.on("disconnect", async () => {
    try {
      const redisManager = getRedisManager()
      
      // Get all typing keys for this user and clear them
      const keys = await redisManager.keys("typing:*")
      
      for (const key of keys) {
        const typingUsers = await redisManager.getJSON(key) as Record<string, number> || {}
        
        if (typingUsers[userId.toString()]) {
          delete typingUsers[userId.toString()]
          
          if (Object.keys(typingUsers).length > 0) {
            await redisManager.setJSON(key, typingUsers, 5)
          } else {
            await redisManager.delete(key)
          }

          // Extract conversation ID from key
          const conversationId = key.replace("typing:", "")

          // Get user details for the typing indicator
          const user = {
            _id: userId,
            username: socket.data.user.username,
            firstName: socket.data.user.firstName,
            lastName: socket.data.user.lastName,
          }

          // Emit typing cleared to all participants
          const conversation = await conversationRepository.findById(conversationId)
          let isGroup = false

          if (!conversation) {
            const group = await groupRepository.findById(conversationId)
            if (group) {
              isGroup = true
            }
          }

          if (isGroup) {
            socket.to(`group:${conversationId}`).emit("typing:updated", {
              conversationId,
              user,
              isTyping: false,
            })
          } else if (conversation) {
            conversation.participants.forEach((participantId: any) => {
              if (participantId.toString() !== userId.toString()) {
                io.to(`user:${participantId.toString()}`).emit("typing:updated", {
                  conversationId,
                  user,
                  isTyping: false,
                })
              }
            })
          }
        }
      }
    } catch (error) {
      logger.error("Error clearing typing status on disconnect:", error)
    }
  })
}
