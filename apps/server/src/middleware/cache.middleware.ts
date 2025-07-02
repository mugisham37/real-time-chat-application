import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { CACHE_TTL } from '@chatapp/shared';

// Redis client will be imported when available
// import { redisClient } from '../config/redis';

interface CacheOptions {
  ttl?: number; // Time to live in seconds
  keyGenerator?: (req: Request) => string;
  condition?: (req: Request, res: Response) => boolean;
  skipCache?: boolean;
}

/**
 * Cache middleware for Express routes
 * Caches successful responses and serves them from cache if available
 */
export const cache = (options: CacheOptions = {}) => {
  const {
    ttl = CACHE_TTL.CONVERSATIONS,
    keyGenerator = defaultKeyGenerator,
    condition = defaultCondition,
    skipCache = false
  } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Skip cache if disabled or condition not met
    if (skipCache || !condition(req, res)) {
      return next();
    }

    try {
      // Generate cache key
      const cacheKey = keyGenerator(req);

      // TODO: Check Redis cache when available
      // const cachedData = await redisClient.get(cacheKey);
      // if (cachedData) {
      //   const parsed = JSON.parse(cachedData);
      //   logger.debug(`Cache hit for key: ${cacheKey}`);
      //   return res.status(parsed.statusCode).json(parsed.data);
      // }

      logger.debug(`Cache miss for key: ${cacheKey}`);

      // Store original json method
      const originalJson = res.json;

      // Override json method to cache the response
      res.json = function(data: any) {
        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const cacheData = {
            statusCode: res.statusCode,
            data,
            timestamp: new Date().toISOString(),
          };

          // TODO: Store in Redis when available
          // redisClient.setex(cacheKey, ttl, JSON.stringify(cacheData))
          //   .catch(err => logger.error(`Cache set error for ${cacheKey}:`, err));

          logger.debug(`Response cached for key: ${cacheKey}, TTL: ${ttl}s`);
        }

        // Call original json method
        return originalJson.call(this, data);
      };

      next();
    } catch (error) {
      logger.error('Cache middleware error:', error);
      next(); // Continue without caching on error
    }
  };
};

/**
 * Default cache key generator
 */
function defaultKeyGenerator(req: Request): string {
  const userId = (req as any).user?.id || 'anonymous';
  const method = req.method;
  const path = req.route?.path || req.path;
  const query = JSON.stringify(req.query);
  const body = method === 'GET' ? '' : JSON.stringify(req.body);
  
  return `cache:${method}:${path}:${userId}:${query}:${body}`;
}

/**
 * Default cache condition - only cache GET requests
 */
function defaultCondition(req: Request, res: Response): boolean {
  return req.method === 'GET';
}

/**
 * Cache middleware for user profiles
 */
export const cacheUserProfile = cache({
  ttl: CACHE_TTL.USER_PROFILE,
  keyGenerator: (req) => `cache:user:profile:${req.params.userId || (req as any).user?.id}`,
  condition: (req) => req.method === 'GET',
});

/**
 * Cache middleware for conversations
 */
export const cacheConversations = cache({
  ttl: CACHE_TTL.CONVERSATIONS,
  keyGenerator: (req) => {
    const userId = (req as any).user?.id;
    const page = req.query.page || 1;
    const limit = req.query.limit || 20;
    return `cache:conversations:${userId}:${page}:${limit}`;
  },
});

/**
 * Cache middleware for messages
 */
export const cacheMessages = cache({
  ttl: CACHE_TTL.MESSAGES,
  keyGenerator: (req) => {
    const conversationId = req.params.conversationId;
    const page = req.query.page || 1;
    const limit = req.query.limit || 50;
    return `cache:messages:${conversationId}:${page}:${limit}`;
  },
});

/**
 * Cache middleware for online users
 */
export const cacheOnlineUsers = cache({
  ttl: CACHE_TTL.ONLINE_USERS,
  keyGenerator: () => 'cache:users:online',
});

/**
 * Cache middleware for search results
 */
export const cacheSearchResults = cache({
  ttl: CACHE_TTL.SEARCH_RESULTS,
  keyGenerator: (req) => {
    const query = req.query.q;
    const type = req.query.type || 'all';
    const page = req.query.page || 1;
    const limit = req.query.limit || 20;
    return `cache:search:${query}:${type}:${page}:${limit}`;
  },
});

/**
 * Clear cache for specific patterns
 */
export const clearCache = async (pattern: string): Promise<void> => {
  try {
    // TODO: Implement Redis cache clearing when available
    // const keys = await redisClient.keys(pattern);
    // if (keys.length > 0) {
    //   await redisClient.del(keys);
    //   logger.info(`Cleared ${keys.length} cache entries matching pattern: ${pattern}`);
    // }
    
    logger.debug(`Cache clear requested for pattern: ${pattern}`);
  } catch (error) {
    logger.error(`Error clearing cache for pattern ${pattern}:`, error);
    throw error;
  }
};

/**
 * Cache invalidation utilities
 */
export const invalidateCache = {
  /**
   * Invalidate user-related cache
   */
  user: async (userId: string): Promise<void> => {
    await Promise.all([
      clearCache(`cache:user:profile:${userId}`),
      clearCache(`cache:conversations:${userId}:*`),
      clearCache(`cache:users:online`),
    ]);
  },

  /**
   * Invalidate conversation-related cache
   */
  conversation: async (conversationId: string, participantIds: string[] = []): Promise<void> => {
    const promises = [
      clearCache(`cache:messages:${conversationId}:*`),
    ];

    // Clear conversations cache for all participants
    participantIds.forEach(userId => {
      promises.push(clearCache(`cache:conversations:${userId}:*`));
    });

    await Promise.all(promises);
  },

  /**
   * Invalidate message-related cache
   */
  message: async (conversationId: string, participantIds: string[] = []): Promise<void> => {
    await invalidateCache.conversation(conversationId, participantIds);
  },

  /**
   * Invalidate group-related cache
   */
  group: async (groupId: string, memberIds: string[] = []): Promise<void> => {
    const promises = memberIds.map(userId => 
      clearCache(`cache:conversations:${userId}:*`)
    );
    await Promise.all(promises);
  },

  /**
   * Invalidate search cache
   */
  search: async (): Promise<void> => {
    await clearCache('cache:search:*');
  },

  /**
   * Invalidate all cache
   */
  all: async (): Promise<void> => {
    await clearCache('cache:*');
  },
};

/**
 * Cache warming utilities
 */
export const warmCache = {
  /**
   * Warm user profile cache
   */
  userProfile: async (userId: string): Promise<void> => {
    try {
      // TODO: Pre-load user profile data when repositories are available
      // const user = await userRepository.findById(userId);
      // if (user) {
      //   const cacheKey = `cache:user:profile:${userId}`;
      //   await redisClient.setex(cacheKey, CACHE_TTL.USER_PROFILE, JSON.stringify(user));
      // }
      
      logger.debug(`Cache warming requested for user profile: ${userId}`);
    } catch (error) {
      logger.error(`Error warming cache for user ${userId}:`, error);
    }
  },

  /**
   * Warm conversations cache
   */
  conversations: async (userId: string): Promise<void> => {
    try {
      // TODO: Pre-load conversations data when repositories are available
      logger.debug(`Cache warming requested for user conversations: ${userId}`);
    } catch (error) {
      logger.error(`Error warming conversations cache for user ${userId}:`, error);
    }
  },
};

/**
 * Cache statistics and monitoring
 */
export const cacheStats = {
  /**
   * Get cache hit/miss statistics
   */
  getStats: async (): Promise<{
    hits: number;
    misses: number;
    hitRate: number;
    totalKeys: number;
  }> => {
    try {
      // TODO: Implement cache statistics when Redis is available
      return {
        hits: 0,
        misses: 0,
        hitRate: 0,
        totalKeys: 0,
      };
    } catch (error) {
      logger.error('Error getting cache stats:', error);
      throw error;
    }
  },

  /**
   * Get cache memory usage
   */
  getMemoryUsage: async (): Promise<{
    used: number;
    total: number;
    percentage: number;
  }> => {
    try {
      // TODO: Implement memory usage tracking when Redis is available
      return {
        used: 0,
        total: 0,
        percentage: 0,
      };
    } catch (error) {
      logger.error('Error getting cache memory usage:', error);
      throw error;
    }
  },
};

/**
 * Cache health check
 */
export const cacheHealthCheck = async (): Promise<{
  status: 'healthy' | 'unhealthy';
  latency: number;
  error?: string;
}> => {
  const startTime = Date.now();
  
  try {
    // TODO: Implement Redis health check when available
    // await redisClient.ping();
    
    const latency = Date.now() - startTime;
    return {
      status: 'healthy',
      latency,
    };
  } catch (error) {
    const latency = Date.now() - startTime;
    return {
      status: 'unhealthy',
      latency,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};
