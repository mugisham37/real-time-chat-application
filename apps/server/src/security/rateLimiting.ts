import { getRedisManager } from "../config/redis"
import { logger } from "../utils/logger"

/**
 * Rate limiter for API endpoints
 */
export const rateLimiter = async (
  key: string,
  limit: number,
  windowInSeconds: number,
): Promise<{
  success: boolean
  remaining: number
  resetAt: Date
}> => {
  try {
    const redisManager = getRedisManager()
    
    // Get current timestamp
    const now = Date.now()

    // Create a sliding window key
    const windowKey = `ratelimit:${key}:${Math.floor(now / (windowInSeconds * 1000))}`

    // Increment counter for this window
    const count = await redisManager.incr(windowKey, windowInSeconds)

    // Calculate remaining requests and reset time
    const remaining = Math.max(0, limit - count)
    const resetAt = new Date(Math.ceil(now / (windowInSeconds * 1000)) * windowInSeconds * 1000)

    return {
      success: count <= limit,
      remaining,
      resetAt,
    }
  } catch (error) {
    logger.error(`Rate limiter error for key ${key}:`, error)
    // Default to allowing the request if Redis fails
    return {
      success: true,
      remaining: 0,
      resetAt: new Date(),
    }
  }
}

/**
 * Advanced rate limiter with different tiers and dynamic limits
 */
export const advancedRateLimiter = async (
  key: string,
  options: {
    tier?: "free" | "premium" | "enterprise"
    action?: "read" | "write" | "delete"
    ip?: string
    userId?: string
  } = {},
): Promise<{
  success: boolean
  remaining: number
  resetAt: Date
  limit: number
  windowInSeconds: number
}> => {
  try {
    const { tier = "free", action = "read", ip, userId } = options

    // Define limits based on tier and action
    const limits = {
      free: {
        read: { limit: 100, window: 60 }, // 100 reads per minute
        write: { limit: 20, window: 60 }, // 20 writes per minute
        delete: { limit: 10, window: 60 }, // 10 deletes per minute
      },
      premium: {
        read: { limit: 500, window: 60 }, // 500 reads per minute
        write: { limit: 100, window: 60 }, // 100 writes per minute
        delete: { limit: 50, window: 60 }, // 50 deletes per minute
      },
      enterprise: {
        read: { limit: 1000, window: 60 }, // 1000 reads per minute
        write: { limit: 200, window: 60 }, // 200 writes per minute
        delete: { limit: 100, window: 60 }, // 100 deletes per minute
      },
    }

    const { limit, window: windowInSeconds } = limits[tier][action]

    // Create composite key including tier, action, and identifier
    const identifier = userId || ip || key
    const compositeKey = `ratelimit:${tier}:${action}:${identifier}`

    // Use the basic rate limiter with the determined limits
    const result = await rateLimiter(compositeKey, limit, windowInSeconds)

    return {
      ...result,
      limit,
      windowInSeconds,
    }
  } catch (error) {
    logger.error(`Advanced rate limiter error:`, error)
    // Default to allowing the request if there's an error
    return {
      success: true,
      remaining: 0,
      resetAt: new Date(),
      limit: 0,
      windowInSeconds: 0,
    }
  }
}

/**
 * Check if an IP is temporarily blocked
 */
export const isIpBlocked = async (ip: string): Promise<boolean> => {
  try {
    const redisManager = getRedisManager()
    const blocked = await redisManager.get(`blocked:ip:${ip}`)
    return blocked === "1"
  } catch (error) {
    logger.error(`Error checking if IP ${ip} is blocked:`, error)
    return false
  }
}

/**
 * Block an IP temporarily
 */
export const blockIp = async (ip: string, durationInSeconds = 3600): Promise<void> => {
  try {
    const redisManager = getRedisManager()
    await redisManager.set(`blocked:ip:${ip}`, "1", durationInSeconds)
    logger.warn(`IP ${ip} blocked for ${durationInSeconds} seconds`)
  } catch (error) {
    logger.error(`Error blocking IP ${ip}:`, error)
  }
}

/**
 * Track failed login attempts
 */
export const trackFailedLogin = async (
  identifier: string,
  ip: string,
): Promise<{
  attempts: number
  blocked: boolean
  resetAt: Date
}> => {
  try {
    const redisManager = getRedisManager()
    const key = `login:failed:${identifier}`
    const ipKey = `login:failed:ip:${ip}`
    const windowInSeconds = 3600 // 1 hour window

    // Increment counters
    const attempts = await redisManager.incr(key, windowInSeconds)
    await redisManager.incr(ipKey, windowInSeconds)

    // Get expiration time
    const ttl = await redisManager.ttl(key)
    const resetAt = new Date(Date.now() + ttl * 1000)

    // Check if account should be temporarily locked (5 failed attempts)
    const blocked = attempts >= 5

    if (blocked) {
      // Block the account for 30 minutes
      await redisManager.set(`blocked:account:${identifier}`, "1", 1800)
      logger.warn(`Account ${identifier} blocked for 30 minutes due to failed login attempts`)
    }

    // Check if IP should be blocked (10 failed attempts across accounts)
    const ipAttempts = await redisManager.get(ipKey)
    if (ipAttempts && Number.parseInt(ipAttempts) >= 10) {
      await blockIp(ip)
    }

    return {
      attempts,
      blocked,
      resetAt,
    }
  } catch (error) {
    logger.error(`Error tracking failed login for ${identifier}:`, error)
    return {
      attempts: 0,
      blocked: false,
      resetAt: new Date(),
    }
  }
}

/**
 * Reset failed login attempts
 */
export const resetFailedLogins = async (identifier: string): Promise<void> => {
  try {
    const redisManager = getRedisManager()
    await redisManager.delete(`login:failed:${identifier}`)
    await redisManager.delete(`blocked:account:${identifier}`)
  } catch (error) {
    logger.error(`Error resetting failed logins for ${identifier}:`, error)
  }
}

/**
 * Check if an account is temporarily blocked
 */
export const isAccountBlocked = async (identifier: string): Promise<boolean> => {
  try {
    const redisManager = getRedisManager()
    const blocked = await redisManager.get(`blocked:account:${identifier}`)
    return blocked === "1"
  } catch (error) {
    logger.error(`Error checking if account ${identifier} is blocked:`, error)
    return false
  }
}

/**
 * Socket-specific rate limiting
 */
export const socketRateLimiter = {
  /**
   * Rate limit socket events
   */
  limitSocketEvent: async (
    socketId: string,
    eventType: string,
    limit: number = 30,
    windowInSeconds: number = 60
  ): Promise<boolean> => {
    const key = `socket:${socketId}:${eventType}`
    const result = await rateLimiter(key, limit, windowInSeconds)
    return result.success
  },

  /**
   * Rate limit socket connections per IP
   */
  limitSocketConnections: async (
    ip: string,
    limit: number = 10,
    windowInSeconds: number = 60
  ): Promise<boolean> => {
    const key = `socket:connections:${ip}`
    const result = await rateLimiter(key, limit, windowInSeconds)
    return result.success
  },

  /**
   * Rate limit message sending
   */
  limitMessageSending: async (
    userId: string,
    tier: "free" | "premium" | "enterprise" = "free"
  ): Promise<boolean> => {
    const limits = {
      free: { limit: 60, window: 60 }, // 1 message per second
      premium: { limit: 120, window: 60 }, // 2 messages per second
      enterprise: { limit: 300, window: 60 }, // 5 messages per second
    }

    const { limit, window } = limits[tier]
    const key = `messages:${userId}`
    const result = await rateLimiter(key, limit, window)
    return result.success
  },

  /**
   * Rate limit file uploads
   */
  limitFileUploads: async (
    userId: string,
    tier: "free" | "premium" | "enterprise" = "free"
  ): Promise<boolean> => {
    const limits = {
      free: { limit: 10, window: 3600 }, // 10 uploads per hour
      premium: { limit: 50, window: 3600 }, // 50 uploads per hour
      enterprise: { limit: 200, window: 3600 }, // 200 uploads per hour
    }

    const { limit, window } = limits[tier]
    const key = `uploads:${userId}`
    const result = await rateLimiter(key, limit, window)
    return result.success
  }
}

/**
 * Distributed rate limiting for microservices
 */
export const distributedRateLimiter = {
  /**
   * Global rate limiting across all instances
   */
  globalLimit: async (
    key: string,
    limit: number,
    windowInSeconds: number
  ): Promise<{
    success: boolean
    remaining: number
    resetAt: Date
    globalCount: number
  }> => {
    try {
      const redisManager = getRedisManager()
      const globalKey = `global:ratelimit:${key}`
      
      // Use Redis atomic operations for distributed counting
      const pipeline = [
        ['INCR', globalKey],
        ['EXPIRE', globalKey, windowInSeconds],
        ['TTL', globalKey]
      ]

      // Execute pipeline (this would need to be implemented with Redis pipeline)
      const globalCount = await redisManager.incr(globalKey, windowInSeconds)
      const ttl = await redisManager.ttl(globalKey)
      
      const remaining = Math.max(0, limit - globalCount)
      const resetAt = new Date(Date.now() + ttl * 1000)

      return {
        success: globalCount <= limit,
        remaining,
        resetAt,
        globalCount
      }
    } catch (error) {
      logger.error(`Global rate limiter error for key ${key}:`, error)
      return {
        success: true,
        remaining: 0,
        resetAt: new Date(),
        globalCount: 0
      }
    }
  },

  /**
   * Service-specific rate limiting
   */
  serviceLimit: async (
    serviceName: string,
    operation: string,
    limit: number,
    windowInSeconds: number
  ): Promise<boolean> => {
    const key = `service:${serviceName}:${operation}`
    const result = await rateLimiter(key, limit, windowInSeconds)
    return result.success
  }
}

/**
 * Adaptive rate limiting based on system load
 */
export const adaptiveRateLimiter = {
  /**
   * Adjust limits based on system metrics
   */
  getAdaptiveLimit: async (
    baseLimit: number,
    systemLoad: number = 0.5
  ): Promise<number> => {
    try {
      // Reduce limits when system load is high
      if (systemLoad > 0.8) {
        return Math.floor(baseLimit * 0.5) // 50% of base limit
      } else if (systemLoad > 0.6) {
        return Math.floor(baseLimit * 0.7) // 70% of base limit
      } else if (systemLoad > 0.4) {
        return Math.floor(baseLimit * 0.9) // 90% of base limit
      }
      
      return baseLimit
    } catch (error) {
      logger.error('Error calculating adaptive limit:', error)
      return baseLimit
    }
  },

  /**
   * Rate limit with adaptive adjustment
   */
  adaptiveLimit: async (
    key: string,
    baseLimit: number,
    windowInSeconds: number,
    systemLoad?: number
  ): Promise<{
    success: boolean
    remaining: number
    resetAt: Date
    adjustedLimit: number
  }> => {
    const adjustedLimit = await adaptiveRateLimiter.getAdaptiveLimit(baseLimit, systemLoad)
    const result = await rateLimiter(key, adjustedLimit, windowInSeconds)
    
    return {
      ...result,
      adjustedLimit
    }
  }
}

/**
 * Rate limiting middleware factory
 */
export const createRateLimitMiddleware = (
  options: {
    limit: number
    windowInSeconds: number
    keyGenerator?: (req: any) => string
    skipSuccessfulRequests?: boolean
    skipFailedRequests?: boolean
    onLimitReached?: (req: any, res: any) => void
  }
) => {
  return async (req: any, res: any, next: any) => {
    try {
      const key = options.keyGenerator ? options.keyGenerator(req) : req.ip
      const result = await rateLimiter(key, options.limit, options.windowInSeconds)
      
      // Set rate limit headers
      res.set({
        'X-RateLimit-Limit': options.limit.toString(),
        'X-RateLimit-Remaining': result.remaining.toString(),
        'X-RateLimit-Reset': result.resetAt.getTime().toString(),
      })
      
      if (!result.success) {
        if (options.onLimitReached) {
          options.onLimitReached(req, res)
        } else {
          res.status(429).json({
            error: 'Too Many Requests',
            message: 'Rate limit exceeded',
            retryAfter: Math.ceil((result.resetAt.getTime() - Date.now()) / 1000)
          })
        }
        return
      }
      
      next()
    } catch (error) {
      logger.error('Rate limit middleware error:', error)
      next() // Allow request to proceed on error
    }
  }
}

/**
 * Burst protection for sudden traffic spikes
 */
export const burstProtection = {
  /**
   * Detect and handle traffic bursts
   */
  detectBurst: async (
    key: string,
    threshold: number = 100,
    windowInSeconds: number = 10
  ): Promise<{
    isBurst: boolean
    requestCount: number
    burstLevel: 'low' | 'medium' | 'high' | 'critical'
  }> => {
    try {
      const redisManager = getRedisManager()
      const burstKey = `burst:${key}`
      
      const requestCount = await redisManager.incr(burstKey, windowInSeconds)
      
      let burstLevel: 'low' | 'medium' | 'high' | 'critical' = 'low'
      let isBurst = false
      
      if (requestCount > threshold * 4) {
        burstLevel = 'critical'
        isBurst = true
      } else if (requestCount > threshold * 2) {
        burstLevel = 'high'
        isBurst = true
      } else if (requestCount > threshold * 1.5) {
        burstLevel = 'medium'
        isBurst = true
      } else if (requestCount > threshold) {
        burstLevel = 'low'
        isBurst = true
      }
      
      if (isBurst) {
        logger.warn(`Traffic burst detected for ${key}`, {
          requestCount,
          threshold,
          burstLevel
        })
      }
      
      return {
        isBurst,
        requestCount,
        burstLevel
      }
    } catch (error) {
      logger.error(`Error detecting burst for ${key}:`, error)
      return {
        isBurst: false,
        requestCount: 0,
        burstLevel: 'low'
      }
    }
  },

  /**
   * Apply burst protection measures
   */
  applyBurstProtection: async (
    key: string,
    burstLevel: 'low' | 'medium' | 'high' | 'critical'
  ): Promise<void> => {
    try {
      const redisManager = getRedisManager()
      
      switch (burstLevel) {
        case 'critical':
          // Block for 1 hour
          await redisManager.set(`burst:block:${key}`, "1", 3600)
          logger.error(`Critical burst protection activated for ${key}`)
          break
        case 'high':
          // Block for 30 minutes
          await redisManager.set(`burst:block:${key}`, "1", 1800)
          logger.warn(`High burst protection activated for ${key}`)
          break
        case 'medium':
          // Block for 10 minutes
          await redisManager.set(`burst:block:${key}`, "1", 600)
          logger.warn(`Medium burst protection activated for ${key}`)
          break
        case 'low':
          // Block for 2 minutes
          await redisManager.set(`burst:block:${key}`, "1", 120)
          logger.info(`Low burst protection activated for ${key}`)
          break
      }
    } catch (error) {
      logger.error(`Error applying burst protection for ${key}:`, error)
    }
  },

  /**
   * Check if key is under burst protection
   */
  isBurstBlocked: async (key: string): Promise<boolean> => {
    try {
      const redisManager = getRedisManager()
      const blocked = await redisManager.get(`burst:block:${key}`)
      return blocked === "1"
    } catch (error) {
      logger.error(`Error checking burst block for ${key}:`, error)
      return false
    }
  }
}

export const security = {
  rateLimiter,
  advancedRateLimiter,
  isIpBlocked,
  blockIp,
  trackFailedLogin,
  resetFailedLogins,
  isAccountBlocked,
  socketRateLimiter,
  distributedRateLimiter,
  adaptiveRateLimiter,
  createRateLimitMiddleware,
  burstProtection,
}
