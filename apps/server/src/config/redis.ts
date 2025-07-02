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
  private client: RedisClientType;

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
