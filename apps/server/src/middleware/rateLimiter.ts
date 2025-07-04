import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { logger, securityLogger } from '../utils/logger';
import { ApiError } from '../utils/apiError';
import { 
  rateLimiter,
  advancedRateLimiter,
  socketRateLimiter,
  trackFailedLogin,
  resetFailedLogins,
  isAccountBlocked,
  isIpBlocked,
  blockIp,
  burstProtection,
  createRateLimitMiddleware,
  adaptiveRateLimiter
} from '../security/rateLimiting';

/**
 * Enhanced Rate Limiting Middleware using Advanced Security System
 * Integrates the comprehensive rate limiting from security/rateLimiting.ts
 */

// Key generator function
const generateKey = (req: Request, suffix?: string): string => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const userId = (req as any).user?.id;
  const baseKey = userId ? `user:${userId}` : `ip:${ip}`;
  return suffix ? `${baseKey}:${suffix}` : baseKey;
};

// Get user tier for rate limiting
const getUserTier = (req: Request): 'free' | 'premium' | 'enterprise' => {
  const user = (req as any).user;
  if (!user) return 'free';
  
  // Determine tier based on user role or subscription
  if (user.role === 'enterprise' || user.subscription === 'enterprise') return 'enterprise';
  if (user.role === 'premium' || user.subscription === 'premium') return 'premium';
  return 'free';
};

// Enhanced rate limit handler with security logging
const createEnhancedRateLimitHandler = (type: string) => {
  return (req: Request, res: Response) => {
    const key = generateKey(req, type);
    const userAgent = req.get('User-Agent') || 'unknown';
    const ip = req.ip || 'unknown';
    
    // Log rate limit exceeded
    securityLogger.logRateLimitExceeded(ip, req.path, 0);
    
    // Check for burst activity (fire and forget)
    burstProtection.detectBurst(key, 50, 10).then(burstResult => {
      if (burstResult.isBurst) {
        burstProtection.applyBurstProtection(key, burstResult.burstLevel);
        
        logger.error(`Burst protection activated for ${type}`, {
          key,
          ip,
          burstLevel: burstResult.burstLevel,
          requestCount: burstResult.requestCount,
          userAgent,
          path: req.path,
        });
      }
    }).catch(error => {
      logger.error('Burst protection error:', error);
    });
    
    logger.warn(`Rate limit exceeded for ${type}`, {
      key,
      ip,
      userAgent,
      path: req.path,
      method: req.method,
    });

    const retryAfter = res.getHeader('Retry-After') as number || 60;
    const error = ApiError.rateLimitExceeded(retryAfter, {
      path: req.path,
      method: req.method,
      ip,
      userAgent,
    });
    
    res.status(error.statusCode).json(error.toJSON());
  };
};

// General API rate limiter with tier-based limits
export const apiRateLimiter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tier = getUserTier(req);
    const ip = req.ip || 'unknown';
    const userId = (req as any).user?.id;
    
    // Check if IP is blocked
    if (await isIpBlocked(ip)) {
      throw ApiError.forbidden('IP address is temporarily blocked');
    }
    
    // Check if account is blocked (for authenticated users)
    if (userId && await isAccountBlocked(userId)) {
      throw ApiError.forbidden('Account is temporarily blocked');
    }
    
    const result = await advancedRateLimiter(generateKey(req, 'api'), {
      tier,
      action: 'read',
      ip,
      userId,
    });
    
    // Set rate limit headers
    res.set({
      'X-RateLimit-Limit': result.limit.toString(),
      'X-RateLimit-Remaining': result.remaining.toString(),
      'X-RateLimit-Reset': result.resetAt.getTime().toString(),
      'X-RateLimit-Window': result.windowInSeconds.toString(),
    });
    
    if (!result.success) {
      createEnhancedRateLimitHandler('api')(req, res);
      return;
    }
    
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
    } else {
      logger.error('API rate limiter error:', error);
      next(); // Allow request to proceed on error
    }
  }
};

// Authentication rate limiter with enhanced security
export const authRateLimiter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ip = req.ip || 'unknown';
    const email = req.body?.email || 'unknown';
    
    // Check if IP is blocked
    if (await isIpBlocked(ip)) {
      throw ApiError.forbidden('IP address is temporarily blocked due to suspicious activity');
    }
    
    const result = await rateLimiter(`auth:${ip}`, 10, 900); // 10 attempts per 15 minutes
    
    // Set headers
    res.set({
      'X-RateLimit-Limit': '10',
      'X-RateLimit-Remaining': result.remaining.toString(),
      'X-RateLimit-Reset': result.resetAt.getTime().toString(),
    });
    
    if (!result.success) {
      // Log suspicious authentication activity
      securityLogger.logSuspiciousActivity('auth_rate_limit_exceeded', {
        ip,
        email,
        userAgent: req.get('User-Agent'),
        path: req.path,
      });
      
      throw ApiError.rateLimitExceeded(Math.ceil((result.resetAt.getTime() - Date.now()) / 1000), {
        path: req.path,
        ip,
        email,
      });
    }
    
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
    } else {
      logger.error('Auth rate limiter error:', error);
      next();
    }
  }
};

// Upload rate limiter with file type consideration
export const uploadRateLimiter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tier = getUserTier(req);
    const userId = (req as any).user?.id;
    
    if (!userId) {
      throw ApiError.unauthorized('Authentication required for file uploads');
    }
    
    const canUpload = await socketRateLimiter.limitFileUploads(userId, tier);
    
    if (!canUpload) {
      throw ApiError.rateLimitExceeded(3600, { // 1 hour retry
        userId,
        tier,
        action: 'file_upload',
      });
    }
    
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
    } else {
      logger.error('Upload rate limiter error:', error);
      next();
    }
  }
};

// Message rate limiter with user tier support
export const messageRateLimiter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tier = getUserTier(req);
    const userId = (req as any).user?.id;
    
    if (!userId) {
      throw ApiError.unauthorized('Authentication required for messaging');
    }
    
    const canSend = await socketRateLimiter.limitMessageSending(userId, tier);
    
    if (!canSend) {
      throw ApiError.rateLimitExceeded(60, { // 1 minute retry
        userId,
        tier,
        action: 'message_send',
      });
    }
    
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
    } else {
      logger.error('Message rate limiter error:', error);
      next();
    }
  }
};

// Search rate limiter
export const searchRateLimiter = createRateLimitMiddleware({
  limit: 30,
  windowInSeconds: 60,
  keyGenerator: (req) => generateKey(req, 'search'),
  onLimitReached: createEnhancedRateLimitHandler('search'),
});

// Password reset rate limiter with enhanced tracking
export const passwordResetRateLimiter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const email = req.body?.email;
    const ip = req.ip || 'unknown';
    
    if (!email) {
      throw ApiError.badRequest('Email is required for password reset');
    }
    
    // Rate limit by email and IP
    const emailResult = await rateLimiter(`password_reset:email:${email}`, 3, 3600); // 3 per hour per email
    const ipResult = await rateLimiter(`password_reset:ip:${ip}`, 10, 3600); // 10 per hour per IP
    
    if (!emailResult.success) {
      throw ApiError.rateLimitExceeded(Math.ceil((emailResult.resetAt.getTime() - Date.now()) / 1000), {
        email,
        reason: 'email_limit',
      });
    }
    
    if (!ipResult.success) {
      throw ApiError.rateLimitExceeded(Math.ceil((ipResult.resetAt.getTime() - Date.now()) / 1000), {
        ip,
        reason: 'ip_limit',
      });
    }
    
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
    } else {
      logger.error('Password reset rate limiter error:', error);
      next();
    }
  }
};

// Registration rate limiter
export const registrationRateLimiter = createRateLimitMiddleware({
  limit: 5,
  windowInSeconds: 3600, // 1 hour
  keyGenerator: (req) => generateKey(req, 'registration'),
  onLimitReached: createEnhancedRateLimitHandler('registration'),
});

// WebSocket connection rate limiter
export const websocketRateLimiter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ip = req.ip || 'unknown';
    
    const canConnect = await socketRateLimiter.limitSocketConnections(ip, 20, 60);
    
    if (!canConnect) {
      throw ApiError.rateLimitExceeded(60, {
        ip,
        action: 'websocket_connection',
      });
    }
    
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
    } else {
      logger.error('WebSocket rate limiter error:', error);
      next();
    }
  }
};

// Admin actions rate limiter
export const adminRateLimiter = createRateLimitMiddleware({
  limit: 100,
  windowInSeconds: 60,
  keyGenerator: (req) => generateKey(req, 'admin'),
  onLimitReached: createEnhancedRateLimitHandler('admin'),
});

// Enhanced brute force protection with account locking
export const bruteForceProtection = (options?: {
  maxAttempts?: number;
  windowMs?: number;
  blockDurationMs?: number;
}) => {
  const maxAttempts = options?.maxAttempts || 5;
  const windowMs = options?.windowMs || 15 * 60 * 1000; // 15 minutes
  const blockDurationMs = options?.blockDurationMs || 30 * 60 * 1000; // 30 minutes

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ip = req.ip || 'unknown';
      const email = req.body?.email || 'unknown';
      
      // Check if IP is already blocked
      if (await isIpBlocked(ip)) {
        throw ApiError.forbidden('IP address is temporarily blocked');
      }
      
      // Track failed login attempts on response
      res.on('finish', async () => {
        if (res.statusCode === 401 || res.statusCode === 403) {
          const result = await trackFailedLogin(email, ip);
          
          if (result.blocked) {
            securityLogger.logSuspiciousActivity('account_locked', {
              email,
              ip,
              attempts: result.attempts,
              userAgent: req.get('User-Agent'),
            });
          }
        } else if (res.statusCode >= 200 && res.statusCode < 300) {
          // Reset failed attempts on successful login
          await resetFailedLogins(email);
        }
      });
      
      next();
    } catch (error) {
      if (error instanceof ApiError) {
        next(error);
      } else {
        logger.error('Brute force protection error:', error);
        next();
      }
    }
  };
};

// Adaptive rate limiter that adjusts based on system load
export const adaptiveApiRateLimiter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tier = getUserTier(req);
    const baseLimit = tier === 'enterprise' ? 1000 : tier === 'premium' ? 500 : 100;
    
    // Get system load (simplified - in production, use actual system metrics)
    const systemLoad = process.cpuUsage().system / 1000000 / 1000; // Rough approximation
    
    const result = await adaptiveRateLimiter.adaptiveLimit(
      generateKey(req, 'adaptive_api'),
      baseLimit,
      60, // 1 minute window
      systemLoad
    );
    
    // Set headers
    res.set({
      'X-RateLimit-Limit': result.adjustedLimit.toString(),
      'X-RateLimit-Remaining': result.remaining.toString(),
      'X-RateLimit-Reset': result.resetAt.getTime().toString(),
      'X-System-Load': systemLoad.toFixed(2),
    });
    
    if (!result.success) {
      throw ApiError.rateLimitExceeded(Math.ceil((result.resetAt.getTime() - Date.now()) / 1000), {
        adjustedLimit: result.adjustedLimit,
        systemLoad,
      });
    }
    
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
    } else {
      logger.error('Adaptive rate limiter error:', error);
      next();
    }
  }
};

// Rate limit status endpoint
export const getRateLimitStatus = async (req: Request, res: Response) => {
  try {
    const key = generateKey(req);
    const tier = getUserTier(req);
    
    // Get current rate limit status for different endpoints
    const status = {
      api: await rateLimiter(`${key}:api`, 1, 60),
      auth: await rateLimiter(`${key}:auth`, 1, 900),
      upload: await rateLimiter(`${key}:upload`, 1, 3600),
      message: await rateLimiter(`${key}:message`, 1, 60),
      tier,
      timestamp: new Date().toISOString(),
    };
    
    res.json({
      success: true,
      data: status,
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
    const { userId, ip, email } = req.body;
    
    if (!userId && !ip && !email) {
      throw ApiError.badRequest('Either userId, ip, or email must be provided');
    }
    
    let cleared = 0;
    
    if (userId) {
      await resetFailedLogins(userId);
      cleared++;
    }
    
    if (email) {
      await resetFailedLogins(email);
      cleared++;
    }
    
    logger.info(`Cleared rate limits`, {
      clearedBy: (req as any).user?.id,
      userId,
      ip,
      email,
      count: cleared,
    });
    
    res.json({
      success: true,
      data: {
        cleared,
        userId,
        ip,
        email,
      },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error('Clear rate limits error:', error);
    throw ApiError.internal('Failed to clear rate limits');
  }
};

// Export all rate limiters
export default {
  apiRateLimiter,
  authRateLimiter,
  uploadRateLimiter,
  messageRateLimiter,
  searchRateLimiter,
  passwordResetRateLimiter,
  registrationRateLimiter,
  websocketRateLimiter,
  adminRateLimiter,
  bruteForceProtection,
  adaptiveApiRateLimiter,
  getRateLimitStatus,
  clearRateLimits,
};
