import type { Socket, ExtendedError } from "socket.io"
import { getRedisManager } from "../../config/redis"
import { logger } from "../../utils/logger"

// Rate limit configuration
const RATE_LIMIT_WINDOW = 60 * 1000 // 1 minute
const RATE_LIMIT_MAX = 100 // 100 events per minute
const RATE_LIMIT_BLOCK_DURATION = 5 * 60 * 1000 // 5 minutes

export const socketRateLimiter = async (socket: Socket, next: (err?: ExtendedError) => void) => {
  try {
    const userId = socket.data?.user?._id

    if (!userId) {
      return next()
    }

    const redisManager = getRedisManager()

    // Check if user is blocked
    const isBlocked = await redisManager.get(`socket:ratelimit:blocked:${userId}`)

    if (isBlocked) {
      logger.warn(`Rate limit: User ${userId} is blocked from socket connections`)
      return next(new Error("Too many requests. Please try again later."))
    }

    // Get current count
    const key = `socket:ratelimit:${userId}`
    const count = await redisManager.get(key)

    if (count && parseInt(count) >= RATE_LIMIT_MAX) {
      // Block user
      await redisManager.set(`socket:ratelimit:blocked:${userId}`, "1", Math.floor(RATE_LIMIT_BLOCK_DURATION / 1000))

      logger.warn(
        `Rate limit exceeded: User ${userId} has been blocked for ${RATE_LIMIT_BLOCK_DURATION / 1000} seconds`,
      )
      return next(new Error("Too many requests. Please try again later."))
    }

    // Increment count
    if (count) {
      await redisManager.increment(key)
    } else {
      await redisManager.set(key, "1", Math.floor(RATE_LIMIT_WINDOW / 1000))
    }

    // Add event listener to count events
    const originalEmit = socket.emit
    socket.emit = function (event, ...args) {
      if (event !== "error" && event !== "connect" && event !== "disconnect") {
        redisManager.increment(key).catch((err) => {
          logger.error(`Error incrementing rate limit count for user ${userId}:`, err)
        })
      }
      return originalEmit.apply(this, [event, ...args])
    }

    next()
  } catch (error) {
    logger.error("Error in socket rate limiter:", error)
    next()
  }
}

// Advanced rate limiter with different limits for different event types
export const advancedSocketRateLimiter = (limits: Record<string, { max: number; window: number }>) => {
  return async (socket: Socket, next: (err?: ExtendedError) => void) => {
    try {
      const userId = socket.data?.user?._id

      if (!userId) {
        return next()
      }

      const redisManager = getRedisManager()

      // Check global block
      const isBlocked = await redisManager.get(`socket:ratelimit:blocked:${userId}`)
      if (isBlocked) {
        logger.warn(`Rate limit: User ${userId} is globally blocked from socket connections`)
        return next(new Error("Too many requests. Please try again later."))
      }

      // Override socket.on to add per-event rate limiting
      const originalOn = socket.on
      socket.on = function (event: string, listener: (...args: any[]) => void) {
        const wrappedListener = async (...args: any[]) => {
          const eventLimit = limits[event]
          if (eventLimit) {
            const eventKey = `socket:ratelimit:${userId}:${event}`
            const eventCount = await redisManager.get(eventKey)

            if (eventCount && parseInt(eventCount) >= eventLimit.max) {
              logger.warn(`Rate limit exceeded for event ${event} by user ${userId}`)
              // Send error response if callback is provided
              const callback = args[args.length - 1]
              if (typeof callback === 'function') {
                callback({
                  success: false,
                  message: `Rate limit exceeded for ${event}. Please slow down.`,
                })
              }
              return
            }

            // Increment event-specific counter
            if (eventCount) {
              await redisManager.increment(eventKey)
            } else {
              await redisManager.set(eventKey, "1", Math.floor(eventLimit.window / 1000))
            }
          }

          // Call original listener
          listener.apply(this, args)
        }

        return originalOn.call(this, event, wrappedListener)
      }

      next()
    } catch (error) {
      logger.error("Error in advanced socket rate limiter:", error)
      next()
    }
  }
}

// Burst protection middleware
export const burstProtectionMiddleware = (maxBurst: number = 10, burstWindow: number = 1000) => {
  return async (socket: Socket, next: (err?: ExtendedError) => void) => {
    try {
      const userId = socket.data?.user?._id

      if (!userId) {
        return next()
      }

      const redisManager = getRedisManager()
      const burstKey = `socket:burst:${userId}`

      // Get current burst count
      const burstCount = await redisManager.get(burstKey)

      if (burstCount && parseInt(burstCount) >= maxBurst) {
        logger.warn(`Burst protection triggered for user ${userId}`)
        return next(new Error("Too many rapid requests. Please slow down."))
      }

      // Increment burst counter with short expiration
      if (burstCount) {
        await redisManager.increment(burstKey)
      } else {
        await redisManager.set(burstKey, "1", Math.floor(burstWindow / 1000))
      }

      next()
    } catch (error) {
      logger.error("Error in burst protection middleware:", error)
      next()
    }
  }
}

// IP-based rate limiting for additional security
export const ipRateLimiter = (maxPerIP: number = 50, window: number = 60 * 1000) => {
  return async (socket: Socket, next: (err?: ExtendedError) => void) => {
    try {
      const clientIP = socket.handshake.address
      const redisManager = getRedisManager()
      const ipKey = `socket:ip:ratelimit:${clientIP}`

      const ipCount = await redisManager.get(ipKey)

      if (ipCount && parseInt(ipCount) >= maxPerIP) {
        logger.warn(`IP rate limit exceeded for ${clientIP}`)
        return next(new Error("Too many connections from this IP. Please try again later."))
      }

      // Increment IP counter
      if (ipCount) {
        await redisManager.increment(ipKey)
      } else {
        await redisManager.set(ipKey, "1", Math.floor(window / 1000))
      }

      next()
    } catch (error) {
      logger.error("Error in IP rate limiter:", error)
      next()
    }
  }
}
