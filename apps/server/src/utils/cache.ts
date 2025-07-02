import { config } from '../config/index';
import { logger, cacheLogger } from './logger';
import { ChatMetrics } from './metrics';

// Cache interface
interface CacheItem<T = any> {
  value: T;
  expiresAt: number;
  createdAt: number;
  accessCount: number;
  lastAccessed: number;
}

/**
 * In-memory cache implementation with TTL and LRU eviction
 */
class MemoryCache {
  private cache: Map<string, CacheItem> = new Map();
  private maxKeys: number;
  private defaultTTL: number;

  constructor(maxKeys: number = config.cache.maxKeys, defaultTTL: number = config.cache.ttl) {
    this.maxKeys = maxKeys;
    this.defaultTTL = defaultTTL * 1000; // Convert to milliseconds
    
    // Clean up expired items every 5 minutes
    setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  /**
   * Get value from cache
   */
  get<T = any>(key: string): T | null {
    const start = Date.now();
    
    try {
      const item = this.cache.get(key);
      
      if (!item) {
        ChatMetrics.incrementCacheMisses('memory');
        ChatMetrics.recordCacheOperation('get', Date.now() - start, false);
        return null;
      }
      
      // Check if expired
      if (Date.now() > item.expiresAt) {
        this.cache.delete(key);
        ChatMetrics.incrementCacheMisses('memory');
        ChatMetrics.recordCacheOperation('get', Date.now() - start, false);
        return null;
      }
      
      // Update access info
      item.accessCount++;
      item.lastAccessed = Date.now();
      
      ChatMetrics.incrementCacheHits('memory');
      ChatMetrics.recordCacheOperation('get', Date.now() - start, true);
      
      cacheLogger.debug('Cache hit', { key, accessCount: item.accessCount });
      return item.value;
    } catch (error) {
      cacheLogger.error('Cache get error:', error);
      ChatMetrics.recordCacheOperation('get', Date.now() - start, false);
      return null;
    }
  }

  /**
   * Set value in cache
   */
  set<T = any>(key: string, value: T, ttl?: number): void {
    const start = Date.now();
    
    try {
      const expiresAt = Date.now() + (ttl ? ttl * 1000 : this.defaultTTL);
      
      // Check if we need to evict items
      if (this.cache.size >= this.maxKeys && !this.cache.has(key)) {
        this.evictLRU();
      }
      
      const item: CacheItem<T> = {
        value,
        expiresAt,
        createdAt: Date.now(),
        accessCount: 0,
        lastAccessed: Date.now(),
      };
      
      this.cache.set(key, item);
      
      ChatMetrics.recordCacheOperation('set', Date.now() - start, true);
      cacheLogger.debug('Cache set', { key, ttl, size: this.cache.size });
    } catch (error) {
      cacheLogger.error('Cache set error:', error);
      ChatMetrics.recordCacheOperation('set', Date.now() - start, false);
    }
  }

  /**
   * Delete value from cache
   */
  delete(key: string): boolean {
    const start = Date.now();
    
    try {
      const deleted = this.cache.delete(key);
      ChatMetrics.recordCacheOperation('del', Date.now() - start, deleted);
      
      if (deleted) {
        cacheLogger.debug('Cache delete', { key, size: this.cache.size });
      }
      
      return deleted;
    } catch (error) {
      cacheLogger.error('Cache delete error:', error);
      ChatMetrics.recordCacheOperation('del', Date.now() - start, false);
      return false;
    }
  }

  /**
   * Check if key exists in cache
   */
  has(key: string): boolean {
    const item = this.cache.get(key);
    if (!item) return false;
    
    // Check if expired
    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
    cacheLogger.info('Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxKeys: number;
    hitRate: number;
    memoryUsage: number;
  } {
    const size = this.cache.size;
    const memoryUsage = this.estimateMemoryUsage();
    
    return {
      size,
      maxKeys: this.maxKeys,
      hitRate: 0, // Would need to track hits/misses for accurate calculation
      memoryUsage,
    };
  }

  /**
   * Get all keys
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Evict least recently used item
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();
    
    for (const [key, item] of this.cache.entries()) {
      if (item.lastAccessed < oldestTime) {
        oldestTime = item.lastAccessed;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
      cacheLogger.debug('LRU eviction', { key: oldestKey });
    }
  }

  /**
   * Clean up expired items
   */
  private cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiresAt) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      cacheLogger.debug('Cache cleanup', { cleanedCount, remainingSize: this.cache.size });
    }
  }

  /**
   * Estimate memory usage (rough calculation)
   */
  private estimateMemoryUsage(): number {
    let totalSize = 0;
    
    for (const [key, item] of this.cache.entries()) {
      totalSize += key.length * 2; // UTF-16 characters
      totalSize += JSON.stringify(item.value).length * 2;
      totalSize += 64; // Overhead for item metadata
    }
    
    return totalSize;
  }
}

// Create global cache instance
const memoryCache = new MemoryCache();

/**
 * Cache utility functions
 */
export const cache = {
  /**
   * Get value from cache
   */
  get: <T = any>(key: string): T | null => {
    return memoryCache.get<T>(key);
  },

  /**
   * Set value in cache
   */
  set: <T = any>(key: string, value: T, ttl?: number): void => {
    memoryCache.set(key, value, ttl);
  },

  /**
   * Delete value from cache
   */
  delete: (key: string): boolean => {
    return memoryCache.delete(key);
  },

  /**
   * Check if key exists
   */
  has: (key: string): boolean => {
    return memoryCache.has(key);
  },

  /**
   * Clear all cache
   */
  clear: (): void => {
    memoryCache.clear();
  },

  /**
   * Get cache statistics
   */
  getStats: () => {
    return memoryCache.getStats();
  },

  /**
   * Get all keys
   */
  keys: (): string[] => {
    return memoryCache.keys();
  },

  /**
   * Get cache size
   */
  size: (): number => {
    return memoryCache.size();
  },

  /**
   * Get or set pattern (cache-aside)
   */
  getOrSet: async <T = any>(
    key: string,
    factory: () => Promise<T> | T,
    ttl?: number
  ): Promise<T> => {
    // Try to get from cache first
    const cached = memoryCache.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Not in cache, get from factory
    try {
      const value = await factory();
      memoryCache.set(key, value, ttl);
      return value;
    } catch (error) {
      cacheLogger.error('Cache factory error:', error);
      throw error;
    }
  },

  /**
   * Memoize function results
   */
  memoize: <TArgs extends any[], TReturn>(
    fn: (...args: TArgs) => Promise<TReturn> | TReturn,
    keyGenerator?: (...args: TArgs) => string,
    ttl?: number
  ) => {
    return async (...args: TArgs): Promise<TReturn> => {
      const key = keyGenerator ? keyGenerator(...args) : `memoized:${fn.name}:${JSON.stringify(args)}`;
      
      return cache.getOrSet(key, () => fn(...args), ttl);
    };
  },

  /**
   * Cache with tags for bulk invalidation
   */
  setWithTags: <T = any>(key: string, value: T, tags: string[], ttl?: number): void => {
    memoryCache.set(key, value, ttl);
    
    // Store tag mappings
    for (const tag of tags) {
      const tagKey = `tag:${tag}`;
      const taggedKeys = memoryCache.get<string[]>(tagKey) || [];
      if (!taggedKeys.includes(key)) {
        taggedKeys.push(key);
        memoryCache.set(tagKey, taggedKeys, ttl);
      }
    }
  },

  /**
   * Invalidate all keys with specific tag
   */
  invalidateTag: (tag: string): void => {
    const tagKey = `tag:${tag}`;
    const taggedKeys = memoryCache.get<string[]>(tagKey);
    
    if (taggedKeys) {
      for (const key of taggedKeys) {
        memoryCache.delete(key);
      }
      memoryCache.delete(tagKey);
      cacheLogger.debug('Tag invalidated', { tag, keysInvalidated: taggedKeys.length });
    }
  },

  /**
   * Batch operations
   */
  mget: <T = any>(keys: string[]): (T | null)[] => {
    return keys.map(key => memoryCache.get<T>(key));
  },

  mset: <T = any>(items: Array<{ key: string; value: T; ttl?: number }>): void => {
    for (const item of items) {
      memoryCache.set(item.key, item.value, item.ttl);
    }
  },

  mdel: (keys: string[]): number => {
    let deletedCount = 0;
    for (const key of keys) {
      if (memoryCache.delete(key)) {
        deletedCount++;
      }
    }
    return deletedCount;
  },
};

/**
 * Cache decorators
 */
export const cached = (ttl?: number, keyGenerator?: (...args: any[]) => string) => {
  return (target: any, propertyName: string, descriptor: PropertyDescriptor) => {
    const method = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const key = keyGenerator 
        ? keyGenerator(...args)
        : `${target.constructor.name}:${propertyName}:${JSON.stringify(args)}`;
      
      return cache.getOrSet(key, () => method.apply(this, args), ttl);
    };
  };
};

/**
 * Cache invalidation decorator
 */
export const invalidateCache = (keyPattern: string | ((...args: any[]) => string)) => {
  return (target: any, propertyName: string, descriptor: PropertyDescriptor) => {
    const method = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const result = await method.apply(this, args);
      
      const pattern = typeof keyPattern === 'function' 
        ? keyPattern(...args)
        : keyPattern;
      
      // Simple pattern matching - in production, you'd want more sophisticated pattern matching
      const keys = cache.keys();
      const keysToDelete = keys.filter(key => key.includes(pattern));
      
      for (const key of keysToDelete) {
        cache.delete(key);
      }
      
      cacheLogger.debug('Cache invalidated', { pattern, keysInvalidated: keysToDelete.length });
      
      return result;
    };
  };
};

/**
 * Specialized cache utilities for chat application
 */
export const chatCache = {
  // User cache
  getUser: (userId: string) => cache.get(`user:${userId}`),
  setUser: (userId: string, user: any, ttl = 3600) => cache.set(`user:${userId}`, user, ttl),
  invalidateUser: (userId: string) => cache.delete(`user:${userId}`),

  // Conversation cache
  getConversation: (conversationId: string) => cache.get(`conversation:${conversationId}`),
  setConversation: (conversationId: string, conversation: any, ttl = 1800) => 
    cache.set(`conversation:${conversationId}`, conversation, ttl),
  invalidateConversation: (conversationId: string) => cache.delete(`conversation:${conversationId}`),

  // Message cache
  getMessages: (conversationId: string, page = 1) => cache.get(`messages:${conversationId}:${page}`),
  setMessages: (conversationId: string, page: number, messages: any[], ttl = 600) => 
    cache.set(`messages:${conversationId}:${page}`, messages, ttl),
  invalidateMessages: (conversationId: string) => {
    const keys = cache.keys().filter(key => key.startsWith(`messages:${conversationId}:`));
    for (const key of keys) {
      cache.delete(key);
    }
  },

  // Group cache
  getGroup: (groupId: string) => cache.get(`group:${groupId}`),
  setGroup: (groupId: string, group: any, ttl = 3600) => cache.set(`group:${groupId}`, group, ttl),
  invalidateGroup: (groupId: string) => cache.delete(`group:${groupId}`),

  // Session cache
  getSession: (sessionId: string) => cache.get(`session:${sessionId}`),
  setSession: (sessionId: string, session: any, ttl = 86400) => cache.set(`session:${sessionId}`, session, ttl),
  invalidateSession: (sessionId: string) => cache.delete(`session:${sessionId}`),

  // Rate limiting cache
  getRateLimit: (key: string) => cache.get(`ratelimit:${key}`),
  setRateLimit: (key: string, count: number, ttl: number) => cache.set(`ratelimit:${key}`, count, ttl),
  incrementRateLimit: (key: string, ttl: number) => {
    const current = cache.get<number>(`ratelimit:${key}`) || 0;
    cache.set(`ratelimit:${key}`, current + 1, ttl);
    return current + 1;
  },
};

export default cache;
