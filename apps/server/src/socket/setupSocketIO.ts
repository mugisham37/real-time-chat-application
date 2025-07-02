import type { Server as SocketIOServer } from "socket.io"
import { logger } from "../utils/logger"
import { verifySocketToken } from "../middleware/auth"
import { setupMessageHandlers } from "./handlers/messageHandlers"
import { setupPresenceHandlers } from "./handlers/presenceHandlers"
import { setupTypingHandlers } from "./handlers/typingHandlers"
import { setupGroupHandlers } from "./handlers/groupHandlers"
import { setupNotificationHandlers } from "./handlers/notificationHandlers"
import { setupCallHandlers } from "./handlers/callHandlers"
import { socketRateLimiter } from "./middleware/socketRateLimiter"
import { ChatMetrics } from "../utils/metrics"

export const setupSocketIO = (io: SocketIOServer): void => {
  // Middleware for authentication
  io.use(verifySocketToken)

  // Middleware for rate limiting
  io.use(socketRateLimiter)

  // Connection event
  io.on("connection", (socket) => {
    const userId = socket.data.user?._id

    logger.info(`User connected: ${userId}`, { socketId: socket.id })

    // Update active users metric
    io.of("/")
      .adapter.sockets(new Set())
      .then((sockets) => {
        ChatMetrics.setActiveConnections(sockets.size)
      })
      .catch((err) => {
        logger.error("Error getting active sockets:", err)
      })

    // Set up event handlers
    setupMessageHandlers(io, socket)
    setupPresenceHandlers(io, socket)
    setupTypingHandlers(io, socket)
    setupGroupHandlers(io, socket)
    setupNotificationHandlers(io, socket)
    setupCallHandlers(io, socket)

    // Handle disconnection
    socket.on("disconnect", (reason) => {
      logger.info(`User disconnected: ${userId}`, { socketId: socket.id, reason })

      // Update active users metric
      io.of("/")
        .adapter.sockets(new Set())
        .then((sockets) => {
          ChatMetrics.setActiveConnections(sockets.size)
        })
        .catch((err) => {
          logger.error("Error getting active sockets:", err)
        })
    })

    // Handle errors
    socket.on("error", (error) => {
      logger.error(`Socket error for user ${userId}:`, error)
      ChatMetrics.incrementApiErrors("SOCKET", "socket_error", 500, "socket_error")
    })

    // Handle reconnection attempts
    socket.on("reconnect_attempt", (attemptNumber) => {
      logger.info(`Reconnection attempt ${attemptNumber} for user ${userId}`)
    })

    // Handle successful reconnection
    socket.on("reconnect", (attemptNumber) => {
      logger.info(`Reconnected after ${attemptNumber} attempts for user ${userId}`)
    })

    // Handle reconnection errors
    socket.on("reconnect_error", (error) => {
      logger.error(`Reconnection error for user ${userId}:`, error)
    })

    // Handle reconnection failures
    socket.on("reconnect_failed", () => {
      logger.error(`Reconnection failed for user ${userId}`)
    })

    // Log when the Socket.IO server starts
    logger.info("Socket.IO server initialized")
  })
}
