import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { config } from '../config';
import { getRedisManager } from '../config/redis';
import { logger, securityLogger } from '../utils/logger';
import { ApiError } from './errorHandler';

// Redis store for distributed rate limiting
class RedisStore {
  private redis = getRedisManager();
  private keyPrefix = 'rate_limit:';

  async increment(key: string, windowMs: number): Promise<{ totalHits: number; timeToExpire?: number }> {
    try {
      const redisKey = `${this.keyPrefix}${key}`;
      const current = await this.redis.incr(redisKey);
      
      // Set TTL on first increment
      if (current === 1) {
        await this.redis.client.expire(`${config.cache.keyPrefix}${redisKey}`, Math.ceil(windowMs / 1000));
      }
      
      // Get TTL for the key
      const ttl = await this.redis.client.ttl(`${config.cache.keyPrefix}${redisKey}`);
      
      return {
        totalHits: current,
        timeToExpire: ttl > 0 ? ttl * 1000 : undefined,
      };
    } catch (error) {
      logger.error('Redis rate limit store error:', error);
      // Fallback to allowing the request if Redis fails
      return { totalHits: 1 };
    }
  }

  async decrement(key: string): Promise<void> {
    try {
      const redisKey = `${this.keyPrefix}${key}`;
      const current = await this.redis.get(redisKey);
      if (current && parseInt(current) > 0) {
        await this.redis.client.decr(`${config.cache.keyPrefix}${redisKey}`);
      }
    } catch (error) {
      logger.error('Redis rate limit decrement error:', error);
    }
  }

  async resetKey(key: string): Promise<void> {
    try {
      const redisKey = `${this.keyPrefix}${key}`;
      await this.redis.del(redisKey);
    } catch (error) {
      logger.error('Redis rate limit reset error:', error);
    }
  }
}

// Create Redis store instance
const redisStore = new RedisStore();

// Key generator function
const generateKey = (req: Request, suffix?: string): string => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const userId = (req as any).user?.id;
  const baseKey = userId ? `user:${userId}` : `ip:${ip}`;
  return suffix ? `${baseKey}:${suffix}` : baseKey;
};

// Enhanced rate limit handler
const createRateLimitHandler = (type: string) => {
  return (req: Request, res: Response) => {
    const key = generateKey(req, type);
    const userAgent = req.get('User-Agent') || 'unknown';
    
    securityLogger.logRateLimitExceeded(
      req.ip || 'unknown',
      req.path,
      res.getHeader('X-RateLimit-Remaining') as number || 0
    );

    logger.warn(`Rate limit exceeded for ${type}`, {
      key,
      ip: req.ip,
      userAgent,
      path: req.path,
      method: req.method,
    });

    const error = new ApiError(
      429,
      `Too many ${type} requests. Please try again later.`,
      'RATE_LIMIT_EXCEEDED',
      {
        type,
        retryAfter: res.getHeader('Retry-After'),
      }
    );
    throw error;
  };
};

// Skip function for successful requests (optional)
const skipSuccessfulRequests = (req: Request, res: Response): boolean => {
  return config.rateLimit.skipSuccessfulRequests && res.statusCode < 400;
};

// Skip function for failed requests (optional)
const skipFailedRequests = (req: Request, res: Response): boolean => {
  return config.rateLimit.skipFailedRequests && res.statusCode >= 400;
};

// Base rate limiter configuration
const createBaseRateLimiter = (options: {
  windowMs: number;
  max: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
  skip?: (req: Request, res: Response) => boolean;
  onLimitReached?: (req: Request, res: Response) => void;
}) => {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    message: options.message || 'Too many requests, please try again later.',
    standardHeaders: config.rateLimit.standardHeaders,
    legacyHeaders: config.rateLimit.legacyHeaders,
    keyGenerator: options.keyGenerator || ((req) => generateKey(req)),
    skip: options.skip || ((req, res) => {
      return skipSuccessfulRequests(req, res) || skipFailedRequests(req, res);
    }),
    handler: options.onLimitReached || createRateLimitHandler('general'),
    // Use default memory store for now, Redis integration can be added later
    // store: undefined, // Uses default MemoryStore
  });
};

// General API rate limiter
export const rateLimiter = createBaseRateLimiter({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: 'Too many API requests, please try again later.',
  keyGenerator: (req) => generateKey(req, 'api'),
});

// Authentication rate limiter (stricter)
export const authRateLimiter = createBaseRateLimiter({
  windowMs: config.rateLimit.auth.windowMs,
  max: config.rateLimit.auth.maxRequests,
  message: 'Too many authentication attempts, please try again later.',
  keyGenerator: (req) => generateKey(req, 'auth'),
  onLimitReached: createRateLimitHandler('authentication'),
});

// Upload rate limiter
export const uploadRateLimiter = createBaseRateLimiter({
  windowMs: config.rateLimit.upload.windowMs,
  max: config.rateLimit.upload.maxRequests,
  message: 'Too many upload attempts, please try again later.',
  keyGenerator: (req) => generateKey(req, 'upload'),
  onLimitReached: createRateLimitHandler('upload'),
});

// Message sending rate limiter
export const messageRateLimiter = createBaseRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 messages per minute
  message: 'Too many messages sent, please slow down.',
  keyGenerator: (req) => generateKey(req, 'message'),
  onLimitReached: createRateLimitHandler('message'),
});

// Search rate limiter
export const searchRateLimiter = createBaseRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 searches per minute
  message: 'Too many search requests, please try again later.',
  keyGenerator: (req) => generateKey(req, 'search'),
  onLimitReached: createRateLimitHandler('search'),
});

// Password reset rate limiter (very strict)
export const passwordResetRateLimiter = createBaseRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 attempts per hour
  message: 'Too many password reset attempts, please try again later.',
  keyGenerator: (req) => {
    // Use email from request body for password reset attempts
    const email = req.body?.email;
    return email ? `email:${email}:password_reset` : generateKey(req, 'password_reset');
  },
  onLimitReached: createRateLimitHandler('password_reset'),
});

// Registration rate limiter
export const registrationRateLimiter = createBaseRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 registrations per hour per IP
  message: 'Too many registration attempts, please try again later.',
  keyGenerator: (req) => generateKey(req, 'registration'),
  onLimitReached: createRateLimitHandler('registration'),
});

// WebSocket connection rate limiter
export const websocketRateLimiter = createBaseRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 connection attempts per minute
  message: 'Too many WebSocket connection attempts, please try again later.',
  keyGenerator: (req) => generateKey(req, 'websocket'),
  onLimitReached: createRateLimitHandler('websocket'),
});

// Admin actions rate limiter
export const adminRateLimiter = createBaseRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 50, // 50 admin actions per minute
  message: 'Too many admin actions, please slow down.',
  keyGenerator: (req) => generateKey(req, 'admin'),
  onLimitReached: createRateLimitHandler('admin'),
});

// Brute force protection for login attempts
export const bruteForceProtection = (options?: {
  maxAttempts?: number;
  windowMs?: number;
  blockDurationMs?: number;
}) => {
  const maxAttempts = options?.maxAttempts || config.security.bruteForce.freeRetries;
  const windowMs = options?.windowMs || config.security.bruteForce.minWait;
  const blockDurationMs = options?.blockDurationMs || config.security.bruteForce.maxWait;

  return async (req: Request, res: Response, next: Function) => {
    try {
      const key = generateKey(req, 'brute_force');
      const redis = getRedisManager();
      
      // Check current attempt count
      const attempts = await redis.get(key);
      const attemptCount = attempts ? parseInt(attempts) : 0;
      
      if (attemptCount >= maxAttempts) {
        const ttl = await redis.client.ttl(`${config.cache.keyPrefix}${key}`);
        const remainingTime = ttl > 0 ? ttl : 0;
        
        securityLogger.logSuspiciousActivity('brute_force_blocked', {
          ip: req.ip,
          attempts: attemptCount,
          remainingTime,
          userAgent: req.get('User-Agent'),
        });
        
        const error = new ApiError(
          429,
          'Account temporarily locked due to too many failed attempts.',
          'RATE_LIMIT_EXCEEDED',
          {
            retryAfter: remainingTime,
            attempts: attemptCount,
          }
        );
        return next(error);
      }
      
      // Store attempt count for failed login
      res.on('finish', async () => {
        if (res.statusCode === 401 || res.statusCode === 403) {
          const newCount = await redis.incr(key);
          
          if (newCount === 1) {
            // Set expiration on first attempt
            await redis.client.expire(`${config.cache.keyPrefix}${key}`, Math.ceil(windowMs / 1000));
          }
          
          securityLogger.logSuspiciousActivity('failed_login_attempt', {
            ip: req.ip,
            attempts: newCount,
            userAgent: req.get('User-Agent'),
            path: req.path,
          });
        } else if (res.statusCode >= 200 && res.statusCode < 300) {
          // Clear attempts on successful login
          await redis.del(key);
        }
      });
      
      next();
    } catch (error) {
      logger.error('Brute force protection error:', error);
      // Continue on error to not block legitimate requests
      next();
    }
  };
};

// Rate limit status endpoint
export const getRateLimitStatus = async (req: Request, res: Response) => {
  try {
    const redis = getRedisManager();
    const key = generateKey(req);
    const stats = await redis.getStats();
    
    // Get current limits for the user/IP
    const limits = {
      api: await redis.get(`${key}:api`),
      auth: await redis.get(`${key}:auth`),
      upload: await redis.get(`${key}:upload`),
      message: await redis.get(`${key}:message`),
    };
    
    res.json({
      success: true,
      data: {
        limits,
        redis: stats,
        config: {
          api: {
            windowMs: config.rateLimit.windowMs,
            max: config.rateLimit.maxRequests,
          },
          auth: config.rateLimit.auth,
          upload: config.rateLimit.upload,
        },
      },
    });
  } catch (error) {
    logger.error('Rate limit status error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_STATUS_ERROR',
        message: 'Failed to get rate limit status',
      },
    });
  }
};

// Clear rate limits for a user (admin only)
export const clearRateLimits = async (req: Request, res: Response) => {
  try {
    const { userId, ip } = req.body;
    const redis = getRedisManager();
    
    let pattern: string;
    if (userId) {
      pattern = `user:${userId}:*`;
    } else if (ip) {
      pattern = `ip:${ip}:*`;
    } else {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PARAMETERS',
          message: 'Either userId or ip must be provided',
        },
      });
    }
    
    const cleared = await redis.deletePattern(pattern);
    
    logger.info(`Cleared ${cleared} rate limit entries for pattern: ${pattern}`, {
      clearedBy: (req as any).user?.id,
      pattern,
      count: cleared,
    });
    
    res.json({
      success: true,
      data: {
        cleared,
        pattern,
      },
    });
  } catch (error) {
    logger.error('Clear rate limits error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CLEAR_RATE_LIMITS_ERROR',
        message: 'Failed to clear rate limits',
      },
    });
  }
};

// Export rate limiter factory for custom limits
export const createCustomRateLimiter = (options: {
  windowMs: number;
  max: number;
  message?: string;
  keyPrefix?: string;
}) => {
  return createBaseRateLimiter({
    windowMs: options.windowMs,
    max: options.max,
    message: options.message,
    keyGenerator: (req) => generateKey(req, options.keyPrefix),
  });
};

// Export all rate limiters
export default {
  rateLimiter,
  authRateLimiter,
  uploadRateLimiter,
  messageRateLimiter,
  searchRateLimiter,
  passwordResetRateLimiter,
  registrationRateLimiter,
  websocketRateLimiter,
  adminRateLimiter,
  bruteForceProtection,
  createCustomRateLimiter,
  getRateLimitStatus,
  clearRateLimits,
};
