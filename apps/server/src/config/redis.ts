import { createClient } from 'redis';
import { config } from './index';
import { logger, cacheLogger, systemLogger } from '../utils/logger';

// Type definitions for Redis client
type RedisClientType = ReturnType<typeof createClient>;

// Redis client instance
let redisClient: RedisClientType | null = null;
let isConnected = false;
let reconnectAttempts = 0;
const maxReconnectAttempts = 10;

// Redis configuration options
const getRedisOptions = () => {
  const options = {
    url: config.redis.url,
    socket: {
      host: config.redis.host,
      port: config.redis.port,
      reconnectStrategy: (retries: number) => {
        reconnectAttempts = retries;
        
        if (retries > maxReconnectAttempts) {
          cacheLogger.error(`Redis reconnection failed after ${maxReconnectAttempts} attempts`);
          return new Error('Redis reconnection failed');
        }
        
        const delay = Math.min(retries * config.redis.retryDelayOnFailover, 5000);
        cacheLogger.warn(`Redis reconnecting in ${delay}ms (attempt ${retries})`);
        return delay;
      },
      connectTimeout: 10000, // 10 seconds
      keepAlive: config.redis.keepAlive,
    },
    database: 0, // Default database
  };

  // Add password if provided
  if (config.redis.password) {
    (options as any).password = config.redis.password;
  }

  // Production-specific optimizations
  if (config.isProduction && config.redis.url.startsWith('rediss://')) {
    (options.socket as any).tls = true;
  }

  return options;
};

// Create Redis client with enhanced configuration
export const createRedisClient = async (): Promise<RedisClientType> => {
  if (redisClient && isConnected) {
    return redisClient;
  }

  const options = getRedisOptions();
  redisClient = createClient(options);

  // Event handlers
  redisClient.on('connect', () => {
    systemLogger.logRedisConnection('connected', {
      host: config.redis.host,
      port: config.redis.port,
      database: 0,
    });
    isConnected = true;
    reconnectAttempts = 0;
  });

  redisClient.on('ready', () => {
    cacheLogger.info('Redis client ready for commands');
  });

  redisClient.on('error', (error) => {
    systemLogger.logRedisConnection('error', {
      error: error.message,
      host: config.redis.host,
      port: config.redis.port,
    });
    isConnected = false;
  });

  redisClient.on('end', () => {
    systemLogger.logRedisConnection('disconnected');
    isConnected = false;
  });

  redisClient.on('reconnecting', () => {
    cacheLogger.info(`Redis client reconnecting (attempt ${reconnectAttempts})`);
  });

  // Connect to Redis
  try {
    await redisClient.connect();
    cacheLogger.info('✅ Redis client connected successfully');
    
    // Test the connection
    await redisClient.ping();
    cacheLogger.info('✅ Redis ping successful');
    
    return redisClient;
  } catch (error) {
    cacheLogger.error('❌ Failed to connect to Redis:', error);
    throw error;
  }
};

// Get existing Redis client
export const getRedisClient = (): RedisClientType => {
  if (!redisClient || !isConnected) {
    throw new Error('Redis client not initialized. Call createRedisClient() first.');
  }
  return redisClient;
};

// Redis connection health check
export const checkRedisHealth = async (): Promise<boolean> => {
  try {
    if (!redisClient || !isConnected) {
      return false;
    }
    
    const start = Date.now();
    await redisClient.ping();
    const latency = Date.now() - start;
    
    cacheLogger.debug(`Redis health check passed (${latency}ms)`);
    return true;
  } catch (error) {
    cacheLogger.error('Redis health check failed:', error);
    return false;
  }
};

// Enhanced Redis operations with error handling and logging
export class RedisManager {
  public client: RedisClientType;

  constructor(client: RedisClientType) {
    this.client = client;
  }

  // Set with TTL and error handling
  async set(key: string, value: string, ttl?: number): Promise<boolean> {
    try {
      const prefixedKey = `${config.cache.keyPrefix}${key}`;
      
      if (ttl) {
        await this.client.setEx(prefixedKey, ttl, value);
      } else {
        await this.client.set(prefixedKey, value);
      }
      
      cacheLogger.debug(`Cache SET: ${prefixedKey} (TTL: ${ttl || 'none'})`);
      return true;
    } catch (error) {
      cacheLogger.error(`Cache SET failed for key ${key}:`, error);
      return false;
    }
  }

  // Get with error handling
  async get(key: string): Promise<string | null> {
    try {
      const prefixedKey = `${config.cache.keyPrefix}${key}`;
      const value = await this.client.get(prefixedKey);
      
      cacheLogger.debug(`Cache GET: ${prefixedKey} (${value ? 'HIT' : 'MISS'})`);
      return value;
    } catch (error) {
      cacheLogger.error(`Cache GET failed for key ${key}:`, error);
      return null;
    }
  }

  // Delete key
  async del(key: string): Promise<boolean> {
    try {
      const prefixedKey = `${config.cache.keyPrefix}${key}`;
      const result = await this.client.del(prefixedKey);
      
      cacheLogger.debug(`Cache DEL: ${prefixedKey} (deleted: ${result})`);
      return result > 0;
    } catch (error) {
      cacheLogger.error(`Cache DEL failed for key ${key}:`, error);
      return false;
    }
  }

  // Check if key exists
  async exists(key: string): Promise<boolean> {
    try {
      const prefixedKey = `${config.cache.keyPrefix}${key}`;
      const result = await this.client.exists(prefixedKey);
      return result === 1;
    } catch (error) {
      cacheLogger.error(`Cache EXISTS failed for key ${key}:`, error);
      return false;
    }
  }

  // Set with JSON serialization
  async setJSON(key: string, value: any, ttl?: number): Promise<boolean> {
    try {
      const serialized = JSON.stringify(value);
      return await this.set(key, serialized, ttl);
    } catch (error) {
      cacheLogger.error(`Cache SET JSON failed for key ${key}:`, error);
      return false;
    }
  }

  // Get with JSON deserialization
  async getJSON<T = any>(key: string): Promise<T | null> {
    try {
      const value = await this.get(key);
      if (!value) return null;
      
      return JSON.parse(value) as T;
    } catch (error) {
      cacheLogger.error(`Cache GET JSON failed for key ${key}:`, error);
      return null;
    }
  }

  // Increment counter
  async incr(key: string, ttl?: number): Promise<number> {
    try {
      const prefixedKey = `${config.cache.keyPrefix}${key}`;
      const result = await this.client.incr(prefixedKey);
      
      if (ttl && result === 1) {
        await this.client.expire(prefixedKey, ttl);
      }
      
      return result;
    } catch (error) {
      cacheLogger.error(`Cache INCR failed for key ${key}:`, error);
      return 0;
    }
  }

  // Increment counter (alias for backward compatibility)
  async increment(key: string, ttl?: number): Promise<number> {
    return this.incr(key, ttl);
  }

  // Set multiple keys
  async mset(keyValuePairs: Record<string, string>): Promise<boolean> {
    try {
      const prefixedPairs: Record<string, string> = {};
      
      for (const [key, value] of Object.entries(keyValuePairs)) {
        prefixedPairs[`${config.cache.keyPrefix}${key}`] = value;
      }
      
      await this.client.mSet(prefixedPairs);
      cacheLogger.debug(`Cache MSET: ${Object.keys(keyValuePairs).length} keys`);
      return true;
    } catch (error) {
      cacheLogger.error('Cache MSET failed:', error);
      return false;
    }
  }

  // Get multiple keys
  async mget(keys: string[]): Promise<(string | null)[]> {
    try {
      const prefixedKeys = keys.map(key => `${config.cache.keyPrefix}${key}`);
      const values = await this.client.mGet(prefixedKeys);
      
      cacheLogger.debug(`Cache MGET: ${keys.length} keys`);
      return values;
    } catch (error) {
      cacheLogger.error('Cache MGET failed:', error);
      return new Array(keys.length).fill(null);
    }
  }

  // Pattern-based key deletion
  async deletePattern(pattern: string): Promise<number> {
    try {
      const prefixedPattern = `${config.cache.keyPrefix}${pattern}`;
      const keys = await this.client.keys(prefixedPattern);
      
      if (keys.length === 0) return 0;
      
      const result = await this.client.del(keys);
      cacheLogger.debug(`Cache DELETE PATTERN: ${pattern} (deleted: ${result})`);
      return result;
    } catch (error) {
      cacheLogger.error(`Cache DELETE PATTERN failed for pattern ${pattern}:`, error);
      return 0;
    }
  }

  // Get cache statistics
  async getStats(): Promise<{
    connected: boolean;
    memory: string;
    keyspace: Record<string, any>;
    clients: number;
  }> {
    try {
      const info = await this.client.info();
      const sections = info.split('\r\n');
      
      const stats = {
        connected: isConnected,
        memory: '0',
        keyspace: {},
        clients: 0,
      };

      sections.forEach(line => {
        if (line.startsWith('used_memory_human:')) {
          stats.memory = line.split(':')[1];
        }
        if (line.startsWith('connected_clients:')) {
          stats.clients = parseInt(line.split(':')[1]);
        }
        if (line.startsWith('db0:')) {
          const dbInfo = line.split(':')[1];
          const matches = dbInfo.match(/keys=(\d+),expires=(\d+)/);
          if (matches) {
            stats.keyspace = {
              keys: parseInt(matches[1]),
              expires: parseInt(matches[2]),
            };
          }
        }
      });

      return stats;
    } catch (error) {
      cacheLogger.error('Failed to get Redis stats:', error);
      return {
        connected: false,
        memory: '0',
        keyspace: {},
        clients: 0,
      };
    }
  }

  // Flush all keys with prefix
  async flushPrefix(): Promise<boolean> {
    try {
      const keys = await this.client.keys(`${config.cache.keyPrefix}*`);
      if (keys.length === 0) return true;
      
      const result = await this.client.del(keys);
      cacheLogger.info(`Flushed ${result} keys with prefix ${config.cache.keyPrefix}`);
      return true;
    } catch (error) {
      cacheLogger.error('Failed to flush cache prefix:', error);
      return false;
    }
  }

  // ========================================
  // HASH OPERATIONS
  // ========================================

  /**
   * Set hash field value or multiple fields
   * @param key - Hash key
   * @param fieldOrHash - Field name or hash object
   * @param value - Field value (when using single field)
   * @returns Number of fields that were added
   */
  async hSet(key: string, field: string, value: string): Promise<number>;
  async hSet(key: string, hash: Record<string, string>): Promise<number>;
  async hSet(key: string, fieldOrHash: string | Record<string, string>, value?: string): Promise<number> {
    try {
      const prefixedKey = `${config.cache.keyPrefix}${key}`;
      
      if (typeof fieldOrHash === 'string' && value !== undefined) {
        const result = await this.client.hSet(prefixedKey, fieldOrHash, value);
        cacheLogger.debug(`Cache HSET: ${prefixedKey}.${fieldOrHash}`);
        return result;
      } else if (typeof fieldOrHash === 'object') {
        const result = await this.client.hSet(prefixedKey, fieldOrHash);
        cacheLogger.debug(`Cache HSET: ${prefixedKey} (${Object.keys(fieldOrHash).length} fields)`);
        return result;
      }
      
      throw new Error('Invalid hSet arguments');
    } catch (error) {
      cacheLogger.error(`Cache HSET failed for key ${key}:`, error);
      return 0;
    }
  }

  /**
   * Get all fields and values in a hash
   * @param key - Hash key
   * @returns Hash object with all fields and values
   */
  async hGetAll(key: string): Promise<Record<string, string>> {
    try {
      const prefixedKey = `${config.cache.keyPrefix}${key}`;
      const result = await this.client.hGetAll(prefixedKey);
      
      cacheLogger.debug(`Cache HGETALL: ${prefixedKey} (${Object.keys(result).length} fields)`);
      return result;
    } catch (error) {
      cacheLogger.error(`Cache HGETALL failed for key ${key}:`, error);
      return {};
    }
  }

  /**
   * Get hash field value
   * @param key - Hash key
   * @param field - Field name
   * @returns Field value or null if not exists
   */
  async hGet(key: string, field: string): Promise<string | null> {
    try {
      const prefixedKey = `${config.cache.keyPrefix}${key}`;
      const result = await this.client.hGet(prefixedKey, field);
      
      cacheLogger.debug(`Cache HGET: ${prefixedKey}.${field} (${result ? 'HIT' : 'MISS'})`);
      return result || null;
    } catch (error) {
      cacheLogger.error(`Cache HGET failed for key ${key}.${field}:`, error);
      return null;
    }
  }

  /**
   * Delete hash fields
   * @param key - Hash key
   * @param fields - Field names to delete
   * @returns Number of fields that were removed
   */
  async hDel(key: string, ...fields: string[]): Promise<number> {
    try {
      const prefixedKey = `${config.cache.keyPrefix}${key}`;
      const result = await this.client.hDel(prefixedKey, fields);
      
      cacheLogger.debug(`Cache HDEL: ${prefixedKey} (${fields.length} fields, ${result} removed)`);
      return result;
    } catch (error) {
      cacheLogger.error(`Cache HDEL failed for key ${key}:`, error);
      return 0;
    }
  }

  // ========================================
  // SET OPERATIONS
  // ========================================

  /**
   * Add members to a set
   * @param key - Set key
   * @param members - Members to add
   * @returns Number of elements that were added
   */
  async sAdd(key: string, ...members: string[]): Promise<number> {
    try {
      const prefixedKey = `${config.cache.keyPrefix}${key}`;
      const result = await this.client.sAdd(prefixedKey, members);
      
      cacheLogger.debug(`Cache SADD: ${prefixedKey} (${members.length} members, ${result} added)`);
      return result;
    } catch (error) {
      cacheLogger.error(`Cache SADD failed for key ${key}:`, error);
      return 0;
    }
  }

  /**
   * Remove members from a set
   * @param key - Set key
   * @param members - Members to remove
   * @returns Number of elements that were removed
   */
  async sRem(key: string, ...members: string[]): Promise<number> {
    try {
      const prefixedKey = `${config.cache.keyPrefix}${key}`;
      const result = await this.client.sRem(prefixedKey, members);
      
      cacheLogger.debug(`Cache SREM: ${prefixedKey} (${members.length} members, ${result} removed)`);
      return result;
    } catch (error) {
      cacheLogger.error(`Cache SREM failed for key ${key}:`, error);
      return 0;
    }
  }

  /**
   * Get all members in a set
   * @param key - Set key
   * @returns Array of set members
   */
  async sMembers(key: string): Promise<string[]> {
    try {
      const prefixedKey = `${config.cache.keyPrefix}${key}`;
      const result = await this.client.sMembers(prefixedKey);
      
      cacheLogger.debug(`Cache SMEMBERS: ${prefixedKey} (${result.length} members)`);
      return result;
    } catch (error) {
      cacheLogger.error(`Cache SMEMBERS failed for key ${key}:`, error);
      return [];
    }
  }

  /**
   * Get the number of members in a set
   * @param key - Set key
   * @returns Number of members in the set
   */
  async sCard(key: string): Promise<number> {
    try {
      const prefixedKey = `${config.cache.keyPrefix}${key}`;
      const result = await this.client.sCard(prefixedKey);
      
      cacheLogger.debug(`Cache SCARD: ${prefixedKey} (${result} members)`);
      return result;
    } catch (error) {
      cacheLogger.error(`Cache SCARD failed for key ${key}:`, error);
      return 0;
    }
  }

  /**
   * Check if member is in a set
   * @param key - Set key
   * @param member - Member to check
   * @returns 1 if member exists, 0 otherwise
   */
  async sIsMember(key: string, member: string): Promise<number> {
    try {
      const prefixedKey = `${config.cache.keyPrefix}${key}`;
      const result = await this.client.sIsMember(prefixedKey, member);
      
      cacheLogger.debug(`Cache SISMEMBER: ${prefixedKey}.${member} (${result ? 'EXISTS' : 'NOT_EXISTS'})`);
      return result ? 1 : 0;
    } catch (error) {
      cacheLogger.error(`Cache SISMEMBER failed for key ${key}.${member}:`, error);
      return 0;
    }
  }

  // ========================================
  // KEY OPERATIONS
  // ========================================

  /**
   * Delete one or more keys
   * @param keys - Keys to delete
   * @returns Number of keys that were removed
   */
  async delete(key: string): Promise<number>;
  async delete(...keys: string[]): Promise<number>;
  async delete(...keys: string[]): Promise<number> {
    try {
      const prefixedKeys = keys.map(key => `${config.cache.keyPrefix}${key}`);
      const result = await this.client.del(prefixedKeys);
      
      cacheLogger.debug(`Cache DELETE: ${keys.length} keys (${result} deleted)`);
      return result;
    } catch (error) {
      cacheLogger.error(`Cache DELETE failed for keys ${keys.join(', ')}:`, error);
      return 0;
    }
  }

  /**
   * Find keys matching a pattern
   * @param pattern - Pattern to match
   * @returns Array of matching keys (without prefix)
   */
  async keys(pattern: string): Promise<string[]> {
    try {
      const prefixedPattern = `${config.cache.keyPrefix}${pattern}`;
      const result = await this.client.keys(prefixedPattern);
      
      // Remove prefix from returned keys
      const unprefixedKeys = result.map(key => key.replace(config.cache.keyPrefix, ''));
      
      cacheLogger.debug(`Cache KEYS: ${pattern} (${result.length} matches)`);
      return unprefixedKeys;
    } catch (error) {
      cacheLogger.error(`Cache KEYS failed for pattern ${pattern}:`, error);
      return [];
    }
  }

  /**
   * Set key expiration time
   * @param key - Key to set expiration
   * @param seconds - Expiration time in seconds
   * @returns 1 if timeout was set, 0 if key doesn't exist
   */
  async expire(key: string, seconds: number): Promise<number> {
    try {
      const prefixedKey = `${config.cache.keyPrefix}${key}`;
      const result = await this.client.expire(prefixedKey, seconds);
      
      cacheLogger.debug(`Cache EXPIRE: ${prefixedKey} (${seconds}s, ${result ? 'SET' : 'FAILED'})`);
      return result ? 1 : 0;
    } catch (error) {
      cacheLogger.error(`Cache EXPIRE failed for key ${key}:`, error);
      return 0;
    }
  }

  /**
   * Get key time to live
   * @param key - Key to check
   * @returns TTL in seconds, -1 if no expiration, -2 if key doesn't exist
   */
  async ttl(key: string): Promise<number> {
    try {
      const prefixedKey = `${config.cache.keyPrefix}${key}`;
      const result = await this.client.ttl(prefixedKey);
      
      cacheLogger.debug(`Cache TTL: ${prefixedKey} (${result}s)`);
      return result;
    } catch (error) {
      cacheLogger.error(`Cache TTL failed for key ${key}:`, error);
      return -2;
    }
  }

  // ========================================
  // PUB/SUB OPERATIONS
  // ========================================

  /**
   * Publish message to channel
   * @param channel - Channel name
   * @param message - Message to publish
   * @returns Number of subscribers that received the message
   */
  async publish(channel: string, message: string): Promise<number> {
    try {
      const result = await this.client.publish(channel, message);
      
      cacheLogger.debug(`Cache PUBLISH: ${channel} (${result} subscribers)`);
      return result;
    } catch (error) {
      cacheLogger.error(`Cache PUBLISH failed for channel ${channel}:`, error);
      return 0;
    }
  }

  /**
   * Subscribe to channel
   * @param channel - Channel name
   * @param callback - Message callback function
   */
  async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    try {
      // Note: This is a simplified implementation
      // In production, you might want to use a separate subscriber client
      await this.client.subscribe(channel, callback);
      
      cacheLogger.debug(`Cache SUBSCRIBE: ${channel}`);
    } catch (error) {
      cacheLogger.error(`Cache SUBSCRIBE failed for channel ${channel}:`, error);
    }
  }

  /**
   * Unsubscribe from channel
   * @param channel - Channel name
   */
  async unsubscribe(channel: string): Promise<void> {
    try {
      await this.client.unsubscribe(channel);
      
      cacheLogger.debug(`Cache UNSUBSCRIBE: ${channel}`);
    } catch (error) {
      cacheLogger.error(`Cache UNSUBSCRIBE failed for channel ${channel}:`, error);
    }
  }

  // ========================================
  // UTILITY OPERATIONS
  // ========================================

  /**
   * Check if multiple keys exist
   * @param keys - Keys to check
   * @returns Number of existing keys
   */
  async existsMultiple(...keys: string[]): Promise<number> {
    try {
      const prefixedKeys = keys.map(key => `${config.cache.keyPrefix}${key}`);
      const result = await this.client.exists(prefixedKeys);
      
      cacheLogger.debug(`Cache EXISTS: ${keys.length} keys (${result} exist)`);
      return result;
    } catch (error) {
      cacheLogger.error(`Cache EXISTS failed for keys ${keys.join(', ')}:`, error);
      return 0;
    }
  }

  /**
   * Ping Redis server
   * @returns PONG response
   */
  async ping(): Promise<string> {
    try {
      const result = await this.client.ping();
      return result;
    } catch (error) {
      cacheLogger.error('Cache PING failed:', error);
      return 'ERROR';
    }
  }

  /**
   * Flush all keys in current database
   * @returns OK if successful
   */
  async flushAll(): Promise<string> {
    try {
      const result = await this.client.flushAll();
      cacheLogger.info('Cache FLUSHALL executed');
      return result;
    } catch (error) {
      cacheLogger.error('Cache FLUSHALL failed:', error);
      return 'ERROR';
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    try {
      await this.client.quit();
      cacheLogger.info('Redis client disconnected');
    } catch (error) {
      cacheLogger.error('Error during Redis disconnect:', error);
    }
  }
}

// Create Redis manager instance
let redisManager: RedisManager | null = null;

export const getRedisManager = (): RedisManager => {
  if (!redisManager) {
    const client = getRedisClient();
    redisManager = new RedisManager(client);
  }
  return redisManager;
};

// Initialize Redis connection
export const connectRedis = async (): Promise<RedisClientType> => {
  try {
    const client = await createRedisClient();
    redisManager = new RedisManager(client);
    
    // Set up periodic health checks
    if (config.monitoring.healthCheck.enabled) {
      setInterval(async () => {
        const isHealthy = await checkRedisHealth();
        if (!isHealthy) {
          cacheLogger.warn('Redis health check failed');
        }
      }, config.monitoring.healthCheck.interval);
    }
    
    return client;
  } catch (error) {
    cacheLogger.error('Failed to initialize Redis connection:', error);
    throw error;
  }
};

// Graceful shutdown
export const disconnectRedis = async (): Promise<void> => {
  if (redisClient && isConnected) {
    try {
      await redisClient.quit();
      cacheLogger.info('Redis client disconnected gracefully');
    } catch (error) {
      cacheLogger.error('Error during Redis disconnect:', error);
    } finally {
      redisClient = null;
      redisManager = null;
      isConnected = false;
    }
  }
};

// Export connection status
export const isRedisConnected = (): boolean => isConnected;

// Export for backward compatibility
export { connectRedis as default };
