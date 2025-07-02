import { Server as SocketIOServer } from "socket.io"
import type { Server as HttpServer } from "http"
import { verifySocketToken } from "../middleware/auth"
import { setupMessageHandlers } from "./handlers/messageHandlers"
import { setupPresenceHandlers } from "./handlers/presenceHandlers"
import { setupTypingHandlers } from "./handlers/typingHandlers"
import { setupGroupHandlers } from "./handlers/groupHandlers"
import { setupNotificationHandlers } from "./handlers/notificationHandlers"
import { setupCallHandlers } from "./handlers/callHandlers"
import { socketRateLimiter, advancedSocketRateLimiter, burstProtectionMiddleware, ipRateLimiter } from "./middleware/socketRateLimiter"
import { logger } from "../utils/logger"
import { ChatMetrics } from "../utils/metrics"
import { config } from "../config"

// Advanced rate limiting configuration for different event types
const EVENT_RATE_LIMITS = {
  "message:send": { max: 30, window: 60 * 1000 }, // 30 messages per minute
  "message:edit": { max: 10, window: 60 * 1000 }, // 10 edits per minute
  "message:delete": { max: 10, window: 60 * 1000 }, // 10 deletes per minute
  "message:react": { max: 50, window: 60 * 1000 }, // 50 reactions per minute
  "typing:status": { max: 100, window: 60 * 1000 }, // 100 typing events per minute
  "presence:update": { max: 20, window: 60 * 1000 }, // 20 presence updates per minute
  "call:offer": { max: 10, window: 60 * 1000 }, // 10 call offers per minute
  "call:answer": { max: 10, window: 60 * 1000 }, // 10 call answers per minute
  "group:create": { max: 5, window: 60 * 1000 }, // 5 group creations per minute
  "group:join": { max: 20, window: 60 * 1000 }, // 20 group joins per minute
  "notification:mark_read": { max: 100, window: 60 * 1000 }, // 100 notification reads per minute
}

export const initializeSocketIO = (httpServer: HttpServer): SocketIOServer => {
  // Create Socket.IO server with advanced configuration
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: config.corsOrigins || ["http://localhost:3000", "http://localhost:3001"],
      methods: ["GET", "POST"],
      credentials: true,
    },
    // Enable WebSocket compression for better performance
    perMessageDeflate: {
      threshold: 2048, // Only compress messages larger than 2KB
      zlibDeflateOptions: {
        chunkSize: 16 * 1024, // 16KB chunks
        memLevel: 7, // Memory level (1-9, 9 is highest)
        level: 3, // Compression level (0-9, 0 is no compression, 9 is highest)
      },
    },
    // Connection management settings
    pingTimeout: 20000, // 20 seconds
    pingInterval: 25000, // 25 seconds
    connectTimeout: 10000, // 10 seconds
    maxHttpBufferSize: 5e6, // 5MB max buffer size
    // Transport configuration
    transports: ["websocket", "polling"],
    allowUpgrades: true,
    // Socket.IO path
    path: "/socket.io",
    // Enable sticky sessions for horizontal scaling
    sticky: true,
    // Connection state recovery
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
      skipMiddlewares: true,
    },
    // Adapter configuration for clustering
    adapter: undefined, // Will be set up separately for Redis adapter if needed
  })

  // Apply security and rate limiting middleware
  io.use(verifySocketToken) // Authentication middleware
  io.use(ipRateLimiter(100, 60 * 1000)) // IP-based rate limiting: 100 connections per IP per minute
  io.use(burstProtectionMiddleware(15, 2000)) // Burst protection: max 15 rapid requests in 2 seconds
  io.use(socketRateLimiter) // Basic rate limiting
  io.use(advancedSocketRateLimiter(EVENT_RATE_LIMITS)) // Advanced per-event rate limiting

  // Global error handler
  io.engine.on("connection_error", (err) => {
    logger.error("Socket.IO connection error:", {
      code: err.code,
      message: err.message,
      context: err.context,
    })
    ChatMetrics.incrementApiErrors("SOCKET", "connection_error", 500, "connection_error")
  })

  // Handle connection
  io.on("connection", (socket) => {
    const userId = socket.data.user?._id
    const userAgent = socket.handshake.headers["user-agent"]
    const clientIP = socket.handshake.address

    logger.info(`User connected: ${userId}`, {
      socketId: socket.id,
      userAgent,
      clientIP,
      transport: socket.conn.transport.name,
    })

    // Track connection metrics
    ChatMetrics.setActiveConnections(io.engine.clientsCount)
    ChatMetrics.recordApiRequest("SOCKET", "connection", 200, 0)

    // Join user's personal room for direct messaging
    socket.join(`user:${userId}`)

    // Setup all event handlers
    setupMessageHandlers(io, socket)
    setupPresenceHandlers(io, socket)
    setupTypingHandlers(io, socket)
    setupGroupHandlers(io, socket)
    setupNotificationHandlers(io, socket)
    setupCallHandlers(io, socket)

    // Handle transport upgrade
    socket.conn.on("upgrade", () => {
      logger.info(`Transport upgraded to ${socket.conn.transport.name} for user ${userId}`)
    })

    // Handle transport upgrade error
    socket.conn.on("upgradeError", (error) => {
      logger.error(`Transport upgrade error for user ${userId}:`, error)
    })

    // Handle disconnection with detailed logging
    socket.on("disconnect", (reason, description) => {
      logger.info(`User disconnected: ${userId}`, {
        socketId: socket.id,
        reason,
        description,
        transport: socket.conn.transport.name,
      })

      // Update connection metrics
      ChatMetrics.setActiveConnections(io.engine.clientsCount)
      ChatMetrics.recordApiRequest("SOCKET", "disconnect", 200, 0)
    })

    // Handle socket errors
    socket.on("error", (error) => {
      logger.error(`Socket error for user ${userId}:`, {
        error: error.message,
        stack: error.stack,
        socketId: socket.id,
      })
      ChatMetrics.incrementApiErrors("SOCKET", "socket_error", 500, "socket_error")
    })

    // Handle reconnection events
    socket.on("reconnect", (attemptNumber) => {
      logger.info(`User reconnected: ${userId} after ${attemptNumber} attempts`)
      ChatMetrics.recordApiRequest("SOCKET", "reconnect", 200, 0)
    })

    socket.on("reconnect_attempt", (attemptNumber) => {
      logger.debug(`Reconnection attempt ${attemptNumber} for user ${userId}`)
    })

    socket.on("reconnect_error", (error) => {
      logger.error(`Reconnection error for user ${userId}:`, error)
      ChatMetrics.incrementApiErrors("SOCKET", "reconnect_error", 500, "reconnect_error")
    })

    socket.on("reconnect_failed", () => {
      logger.error(`Reconnection failed for user ${userId}`)
      ChatMetrics.incrementApiErrors("SOCKET", "reconnect_failed", 500, "reconnect_failed")
    })

    // Handle connection recovery
    socket.on("connection_recovery", (recoveryData) => {
      logger.info(`Connection recovered for user ${userId}`, {
        recoveredEvents: recoveryData?.length || 0,
      })
    })

    // Heartbeat mechanism for connection health monitoring
    const heartbeatInterval = setInterval(() => {
      if (socket.connected) {
        socket.emit("heartbeat", { timestamp: Date.now() })
      } else {
        clearInterval(heartbeatInterval)
      }
    }, 30000) // Send heartbeat every 30 seconds

    // Handle heartbeat response
    socket.on("heartbeat_response", (data) => {
      const latency = Date.now() - data.timestamp
      logger.debug(`Heartbeat response from user ${userId}, latency: ${latency}ms`)
      
      // Track latency metrics
      ChatMetrics.recordApiRequest("SOCKET", "heartbeat", 200, latency)
    })

    // Clean up on disconnect
    socket.on("disconnect", () => {
      clearInterval(heartbeatInterval)
    })
  })

  // Server-level event handlers
  io.on("connect_error", (error) => {
    logger.error("Socket.IO server connect error:", error)
    ChatMetrics.incrementApiErrors("SOCKET", "server_connect_error", 500, "server_connect_error")
  })

  // Graceful shutdown handler
  const gracefulShutdown = () => {
    logger.info("Initiating graceful Socket.IO shutdown...")
    
    // Close all connections
    io.close((err) => {
      if (err) {
        logger.error("Error during Socket.IO shutdown:", err)
      } else {
        logger.info("Socket.IO server closed successfully")
      }
    })
  }

  // Register shutdown handlers
  process.on("SIGTERM", gracefulShutdown)
  process.on("SIGINT", gracefulShutdown)

  // Log server initialization
  logger.info("Socket.IO server initialized successfully", {
    transports: ["websocket", "polling"],
    cors: config.corsOrigins,
    maxConnections: "unlimited",
    compression: "enabled",
  })

  return io
}

// Health check endpoint for Socket.IO
export const getSocketIOHealth = (io: SocketIOServer) => {
  return {
    status: "healthy",
    connections: io.engine.clientsCount,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
  }
}

// Utility function to broadcast to all connected users
export const broadcastToAll = (io: SocketIOServer, event: string, data: any) => {
  io.emit(event, data)
  logger.info(`Broadcasted event ${event} to all connected users`, {
    connectedUsers: io.engine.clientsCount,
  })
}

// Utility function to broadcast to specific users
export const broadcastToUsers = (io: SocketIOServer, userIds: string[], event: string, data: any) => {
  userIds.forEach((userId) => {
    io.to(`user:${userId}`).emit(event, data)
  })
  logger.info(`Broadcasted event ${event} to ${userIds.length} users`)
}

// Utility function to get connected users count
export const getConnectedUsersCount = (io: SocketIOServer): number => {
  return io.engine.clientsCount
}

// Utility function to get user's socket instances
export const getUserSockets = async (io: SocketIOServer, userId: string) => {
  const sockets = await io.in(`user:${userId}`).fetchSockets()
  return sockets
}

// Utility function to disconnect a user from all their sessions
export const disconnectUser = async (io: SocketIOServer, userId: string, reason?: string) => {
  const sockets = await getUserSockets(io, userId)
  sockets.forEach((socket) => {
    socket.disconnect(true)
    logger.info(`Disconnected user ${userId} from socket ${socket.id}`, { reason })
  })
}
