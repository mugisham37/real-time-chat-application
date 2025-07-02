import type { Server as SocketIOServer, Socket } from "socket.io"
import { logger } from "../../utils/logger"
import { getRedisManager } from "../../config/redis"
import { validateSocketEvent } from "../utils/validateSocketEvent"
import { presenceStatusSchema } from "../validators/presenceStatusSchema"

// Import user repository - we'll need to create this import based on the actual repository structure
// For now, I'll create placeholder interface that matches the expected repository pattern

interface UserRepository {
  updateStatus(userId: string, isOnline: boolean, customStatus?: string): Promise<any>
  getContacts(userId: string): Promise<any[]>
  findById(id: string, select?: string): Promise<any>
}

// This will be imported from the actual repository
const userRepository: UserRepository = {} as UserRepository

export const setupPresenceHandlers = (io: SocketIOServer, socket: Socket & { data: { user?: any } }) => {
  const userId = socket.data.user?._id

  // Join user's personal room for direct messages
  socket.join(`user:${userId}`)

  // Handle initial presence setup
  const setupPresence = async () => {
    try {
      // Update user status in database
      await userRepository.updateStatus(userId, true)

      // Store presence in Redis
      const redisManager = getRedisManager()
      await redisManager.hSet(`user:presence:${userId}`, {
        status: "online",
        lastSeen: new Date().toISOString(),
        socketId: socket.id,
      })

      // Add user to online users set
      await redisManager.sAdd("online:users", userId.toString())

      // Add socket ID to user's connections
      await redisManager.sAdd(`user:connections:${userId}`, socket.id)

      // Broadcast user's online status to relevant users
      // Get user's contacts
      const contacts = await userRepository.getContacts(userId)
      const contactIds = contacts.map((contact) => contact.user._id.toString())

      // Broadcast to contacts
      contactIds.forEach((contactId) => {
        io.to(`user:${contactId}`).emit("presence:online", {
          userId: userId.toString(),
          status: "online",
          lastSeen: new Date(),
        })
      })

      logger.info(`User ${userId} is now online`)
    } catch (error) {
      logger.error(`Error setting up presence for user ${userId}:`, error)
    }
  }

  // Set up presence when socket connects
  setupPresence()

  // Update user presence status
  socket.on("presence:update", async (data, callback) => {
    try {
      // Validate event data
      const validationResult = validateSocketEvent(presenceStatusSchema, data)
      if (!validationResult.success) {
        return callback({
          success: false,
          message: "Validation error",
          errors: validationResult.errors,
        })
      }

      const { status, customStatus } = data

      try {
        // Update user status in database
        await userRepository.updateStatus(userId, status === "online", customStatus)

        // Update presence in Redis
        const redisManager = getRedisManager()
        await redisManager.hSet(`user:presence:${userId}`, {
          status,
          customStatus: customStatus || "",
          lastSeen: new Date().toISOString(),
        })

        // If user is going offline, remove from online users set
        if (status !== "online") {
          await redisManager.sRem("online:users", userId.toString())
        } else {
          await redisManager.sAdd("online:users", userId.toString())
        }

        // Get user's contacts
        const contacts = await userRepository.getContacts(userId)
        const contactIds = contacts.map((contact) => contact.user._id.toString())

        // Broadcast updated status to contacts
        contactIds.forEach((contactId) => {
          io.to(`user:${contactId}`).emit("presence:updated", {
            userId: userId.toString(),
            status,
            customStatus,
            lastSeen: new Date(),
          })
        })

        callback({
          success: true,
          data: {
            status,
            customStatus,
            lastSeen: new Date(),
          },
        })
      } catch (error) {
        logger.error(`Error updating presence for user ${userId}:`, error)
        callback({
          success: false,
          message: "Failed to update presence",
        })
      }
    } catch (error) {
      logger.error(`Error in presence:update handler:`, error)
      callback({
        success: false,
        message: "Failed to update presence",
      })
    }
  })

  // Get user presence
  socket.on("presence:get", async (data, callback) => {
    try {
      const { userIds } = data

      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return callback({
          success: false,
          message: "User IDs are required",
        })
      }

      try {
        const presenceData: Record<string, any> = {}
        const redisManager = getRedisManager()

        // Get presence data for each user
        for (const id of userIds) {
          const presence = await redisManager.hGetAll(`user:presence:${id}`)

          if (Object.keys(presence).length > 0) {
            presenceData[id] = presence
          } else {
            // If no Redis data, get from database
            const user = await userRepository.findById(id, "status")
            if (user) {
              presenceData[id] = {
                status: user.status.online ? "online" : "offline",
                lastSeen: user.status.lastSeen.toISOString(),
                customStatus: user.status.customStatus || "",
              }
            }
          }
        }

        callback({
          success: true,
          data: presenceData,
        })
      } catch (error) {
        logger.error(`Error getting presence data:`, error)
        callback({
          success: false,
          message: "Failed to get presence data",
        })
      }
    } catch (error) {
      logger.error(`Error in presence:get handler:`, error)
      callback({
        success: false,
        message: "Failed to get presence data",
      })
    }
  })

  // Subscribe to presence updates
  socket.on("presence:subscribe", async (data, callback) => {
    try {
      const { userIds } = data

      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return callback({
          success: false,
          message: "User IDs are required",
        })
      }

      try {
        // Store subscription in Redis
        const redisManager = getRedisManager()
        await redisManager.sAdd(`user:presence:subscriptions:${userId}`, ...userIds)

        callback({
          success: true,
          data: {
            subscribedTo: userIds,
          },
        })
      } catch (error) {
        logger.error(`Error subscribing to presence updates:`, error)
        callback({
          success: false,
          message: "Failed to subscribe to presence updates",
        })
      }
    } catch (error) {
      logger.error(`Error in presence:subscribe handler:`, error)
      callback({
        success: false,
        message: "Failed to subscribe to presence updates",
      })
    }
  })

  // Unsubscribe from presence updates
  socket.on("presence:unsubscribe", async (data, callback) => {
    try {
      const { userIds } = data

      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return callback({
          success: false,
          message: "User IDs are required",
        })
      }

      try {
        // Remove subscription from Redis
        const redisManager = getRedisManager()
        await redisManager.sRem(`user:presence:subscriptions:${userId}`, ...userIds)

        callback({
          success: true,
          data: {
            unsubscribedFrom: userIds,
          },
        })
      } catch (error) {
        logger.error(`Error unsubscribing from presence updates:`, error)
        callback({
          success: false,
          message: "Failed to unsubscribe from presence updates",
        })
      }
    } catch (error) {
      logger.error(`Error in presence:unsubscribe handler:`, error)
      callback({
        success: false,
        message: "Failed to unsubscribe from presence updates",
      })
    }
  })

  // Get online users count
  socket.on("presence:online_count", async (data, callback) => {
    try {
      const redisManager = getRedisManager()
      const onlineUsers = await redisManager.sCard("online:users")

      callback({
        success: true,
        data: {
          onlineCount: onlineUsers,
        },
      })
    } catch (error) {
      logger.error(`Error getting online users count:`, error)
      callback({
        success: false,
        message: "Failed to get online users count",
      })
    }
  })

  // Get online users list (for admin/debugging purposes)
  socket.on("presence:online_users", async (data, callback) => {
    try {
      const { limit = 50 } = data
      const redisManager = getRedisManager()
      const onlineUserIds = await redisManager.sMembers("online:users")

      // Limit the results
      const limitedUserIds = onlineUserIds.slice(0, limit)

      // Get user details for online users
      const onlineUsers = []
      for (const userId of limitedUserIds) {
        const user = await userRepository.findById(userId, "username firstName lastName avatar")
        if (user) {
          const presence = await redisManager.hGetAll(`user:presence:${userId}`)
          onlineUsers.push({
            ...user,
            presence: presence || { status: "online" },
          })
        }
      }

      callback({
        success: true,
        data: {
          onlineUsers,
          total: onlineUserIds.length,
        },
      })
    } catch (error) {
      logger.error(`Error getting online users list:`, error)
      callback({
        success: false,
        message: "Failed to get online users list",
      })
    }
  })

  // Handle disconnection
  socket.on("disconnect", async (reason) => {
    try {
      const redisManager = getRedisManager()

      // Remove socket ID from user's connections
      await redisManager.sRem(`user:connections:${userId}`, socket.id)

      // Check if user has any other active connections
      const activeConnections = await redisManager.sMembers(`user:connections:${userId}`)

      // If no other connections, update status to offline
      if (activeConnections.length === 0) {
        // Update user status in database
        await userRepository.updateStatus(userId, false)

        // Update presence in Redis
        await redisManager.hSet(`user:presence:${userId}`, {
          status: "offline",
          lastSeen: new Date().toISOString(),
        })

        // Remove user from online users set
        await redisManager.sRem("online:users", userId.toString())

        // Get users who are subscribed to this user's presence
        const subscribers = await redisManager.sMembers(`user:presence:subscribers:${userId}`)

        // Broadcast offline status to subscribers
        subscribers.forEach((subscriberId) => {
          io.to(`user:${subscriberId}`).emit("presence:offline", {
            userId: userId.toString(),
            lastSeen: new Date(),
          })
        })

        // Also broadcast to contacts
        try {
          const contacts = await userRepository.getContacts(userId)
          const contactIds = contacts.map((contact) => contact.user._id.toString())

          contactIds.forEach((contactId) => {
            io.to(`user:${contactId}`).emit("presence:offline", {
              userId: userId.toString(),
              lastSeen: new Date(),
            })
          })
        } catch (error) {
          logger.error(`Error broadcasting offline status to contacts for user ${userId}:`, error)
        }

        logger.info(`User ${userId} is now offline (reason: ${reason})`)
      }
    } catch (error) {
      logger.error(`Error handling disconnect for user ${userId}:`, error)
    }
  })
}
