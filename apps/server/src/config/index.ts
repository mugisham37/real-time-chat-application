import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

// Environment validation schema
const envSchema = z.object({
  // Server Configuration
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('5000'),
  HOST: z.string().default('localhost'),
  
  // Database Configuration
  DATABASE_URL: z.string().min(1, 'Database URL is required'),
  
  // Redis Configuration
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().transform(Number).default('6379'),
  
  // JWT Configuration
  JWT_SECRET: z.string().min(32, 'JWT secret must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT refresh secret must be at least 32 characters'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  
  // Encryption Configuration
  ENCRYPTION_SECRET: z.string().min(32, 'Encryption secret must be at least 32 characters').optional(),
  
  // Client Configuration
  CLIENT_URL: z.string().url().default('http://localhost:3000'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  
  // Email Configuration
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().transform(Number).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),
  FROM_EMAIL: z.string().email().optional(),
  FROM_NAME: z.string().optional(),
  
  // File Upload Configuration
  MAX_FILE_SIZE: z.string().transform(Number).default('10485760'), // 10MB
  UPLOAD_DIR: z.string().default('./uploads'),
  UPLOAD_PATH: z.string().default('./uploads'),
  ALLOWED_FILE_TYPES: z.string().default('image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain'),
  
  // Logging Configuration
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FILE: z.string().default('logs/app.log'),
  LOG_FORMAT: z.string().default('combined'),
  
  // Rate Limiting Configuration
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default('900000'), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).default('100'),
  
  // WebRTC Configuration
  TURN_SERVER_URL: z.string().optional(),
  TURN_SERVER_USERNAME: z.string().optional(),
  TURN_SERVER_CREDENTIAL: z.string().optional(),
  
  // Monitoring Configuration
  METRICS_ENABLED: z.string().transform(val => val === 'true').default('false'),
  METRICS_PORT: z.string().transform(Number).default('9090'),
  
  // Cache Configuration
  CACHE_TTL: z.string().transform(Number).default('3600'), // 1 hour
  CACHE_MAX_KEYS: z.string().transform(Number).default('10000'),
  ENABLE_CACHE: z.string().transform(val => val === 'true').default('true'),
  DEFAULT_CACHE_EXPIRY: z.string().transform(Number).default('300'), // 5 minutes
  
  // Search Configuration
  SEARCH_ENABLED: z.string().transform(val => val === 'true').default('true'),
  SEARCH_INDEX_BATCH_SIZE: z.string().transform(Number).default('100'),
  
  // Notification Configuration
  PUSH_NOTIFICATIONS_ENABLED: z.string().transform(val => val === 'true').default('false'),
  FCM_SERVER_KEY: z.string().optional(),
  
  // Security Configuration
  BCRYPT_ROUNDS: z.string().transform(Number).default('12'),
  SESSION_SECRET: z.string().min(32, 'Session secret must be at least 32 characters'),
  
  // Media Processing Configuration
  IMAGE_MAX_WIDTH: z.string().transform(Number).default('1920'),
  IMAGE_MAX_HEIGHT: z.string().transform(Number).default('1080'),
  IMAGE_QUALITY: z.string().transform(Number).default('80'),
  THUMBNAIL_WIDTH: z.string().transform(Number).default('200'),
  THUMBNAIL_HEIGHT: z.string().transform(Number).default('200'),
  
  // Backup Configuration
  BACKUP_ENABLED: z.string().transform(val => val === 'true').default('false'),
  BACKUP_INTERVAL_HOURS: z.string().transform(Number).default('24'),
  BACKUP_RETENTION_DAYS: z.string().transform(Number).default('30'),
  
  // Socket.IO Configuration
  SOCKET_CORS_ORIGIN: z.string().default('http://localhost:3000'),
  SOCKET_PING_TIMEOUT: z.string().transform(Number).default('60000'),
  SOCKET_PING_INTERVAL: z.string().transform(Number).default('25000'),
  
  // Feature Flags
  ENABLE_MESSAGE_ENCRYPTION: z.string().transform(val => val === 'true').default('false'),
  ENABLE_READ_RECEIPTS: z.string().transform(val => val !== 'false').default('true'),
  ENABLE_TYPING_INDICATORS: z.string().transform(val => val !== 'false').default('true'),
  ENABLE_PRESENCE: z.string().transform(val => val !== 'false').default('true'),
  
  // Pagination Configuration
  DEFAULT_PAGE_SIZE: z.string().transform(Number).default('20'),
  MAX_PAGE_SIZE: z.string().transform(Number).default('100'),
  
  // NextAuth Configuration (for compatibility)
  NEXTAUTH_SECRET: z.string().optional(),
  NEXTAUTH_URL: z.string().url().optional(),
  
  // API Configuration
  API_URL: z.string().url().default('http://localhost:4000'),
  NEXT_PUBLIC_API_URL: z.string().url().default('http://localhost:4000'),
  NEXT_PUBLIC_SOCKET_URL: z.string().url().default('http://localhost:4000'),
});

// Validate environment variables with detailed error reporting
let env: z.infer<typeof envSchema>;
try {
  env = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('❌ Environment validation failed:');
    error.errors.forEach((err) => {
      console.error(`  - ${err.path.join('.')}: ${err.message}`);
    });
    process.exit(1);
  }
  throw error;
}

// Generate encryption secret if not provided
const generateEncryptionSecret = (): string => {
  const crypto = require('crypto');
  return crypto.randomBytes(32).toString('hex');
};

// Configuration object
export const config = {
  // Environment
  nodeEnv: env.NODE_ENV,
  isDevelopment: env.NODE_ENV === 'development',
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  
  // Server
  server: {
    port: env.PORT,
    host: env.HOST,
    clientUrl: env.CLIENT_URL,
    corsOrigin: env.CORS_ORIGIN,
    apiUrl: env.API_URL,
  },
  
  // Database
  database: {
    url: env.DATABASE_URL,
    maxConnections: env.NODE_ENV === 'production' ? 20 : 5,
    connectionTimeout: 30000,
    queryTimeout: 10000,
  },
  
  // Redis
  redis: {
    url: env.REDIS_URL,
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
    maxRetries: 3,
    retryDelayOnFailover: 100,
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    keepAlive: 30000,
  },
  
  // JWT
  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
    refreshSecret: env.JWT_REFRESH_SECRET,
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
    algorithm: 'HS256' as const,
    issuer: 'chat-app',
    audience: 'chat-app-users',
  },
  
  // Encryption
  encryption: {
    enabled: env.ENABLE_MESSAGE_ENCRYPTION,
    secret: env.ENCRYPTION_SECRET || generateEncryptionSecret(),
    algorithm: 'aes-256-gcm' as const,
    keyDerivation: 'pbkdf2' as const,
    iterations: 100000,
  },
  
  // Email
  email: {
    smtp: {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
    from: env.EMAIL_FROM || env.FROM_EMAIL,
    fromName: env.FROM_NAME || 'Chat Application',
    templates: {
      welcome: 'welcome',
      resetPassword: 'reset-password',
      emailVerification: 'email-verification',
    },
  },
  
  // File Upload
  upload: {
    maxFileSize: env.MAX_FILE_SIZE,
    uploadDir: path.resolve(env.UPLOAD_DIR || env.UPLOAD_PATH),
    allowedTypes: env.ALLOWED_FILE_TYPES.split(',').map(type => type.trim()),
    imageFormats: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    documentFormats: ['application/pdf', 'text/plain', 'application/msword'],
    tempDir: path.resolve('./temp'),
  },
  
  // Logging
  logging: {
    level: env.LOG_LEVEL,
    file: env.LOG_FILE,
    format: env.LOG_FORMAT,
    maxSize: '10m',
    maxFiles: 10,
    datePattern: 'YYYY-MM-DD',
    enableConsole: env.NODE_ENV === 'development',
    enableFile: env.NODE_ENV === 'production',
  },
  
  // Rate Limiting
  rateLimit: {
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
    standardHeaders: true,
    legacyHeaders: false,
    // Specific limits for different endpoints
    auth: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 5,
    },
    upload: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 10,
    },
    api: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 100,
    },
  },
  
  // WebRTC
  webrtc: {
    turnServer: {
      url: env.TURN_SERVER_URL,
      username: env.TURN_SERVER_USERNAME,
      credential: env.TURN_SERVER_CREDENTIAL,
    },
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  },
  
  // Monitoring
  monitoring: {
    enabled: env.METRICS_ENABLED,
    port: env.METRICS_PORT,
    healthCheck: {
      enabled: true,
      interval: 30000, // 30 seconds
      timeout: 5000, // 5 seconds
    },
    metrics: {
      collectDefaultMetrics: true,
      requestDuration: true,
      requestCount: true,
      errorRate: true,
    },
  },
  
  // Cache
  cache: {
    enabled: env.ENABLE_CACHE,
    ttl: env.CACHE_TTL,
    maxKeys: env.CACHE_MAX_KEYS,
    defaultExpiry: env.DEFAULT_CACHE_EXPIRY,
    defaultTtl: env.DEFAULT_CACHE_EXPIRY, // Add this for backward compatibility
    keyPrefix: 'chat-app:',
    // Cache strategies for different data types
    strategies: {
      user: { ttl: 3600, maxKeys: 10000 }, // 1 hour
      conversation: { ttl: 1800, maxKeys: 50000 }, // 30 minutes
      message: { ttl: 7200, maxKeys: 100000 }, // 2 hours
      session: { ttl: 86400, maxKeys: 50000 }, // 24 hours
    },
  },
  
  // Search
  search: {
    enabled: env.SEARCH_ENABLED,
    indexBatchSize: env.SEARCH_INDEX_BATCH_SIZE,
    maxResults: 100,
    highlightEnabled: true,
    fuzzySearch: true,
    minQueryLength: 2,
  },
  
  // Notifications
  notifications: {
    pushEnabled: env.PUSH_NOTIFICATIONS_ENABLED,
    fcmServerKey: env.FCM_SERVER_KEY,
    webPush: {
      vapidKeys: {
        publicKey: process.env.VAPID_PUBLIC_KEY,
        privateKey: process.env.VAPID_PRIVATE_KEY,
      },
      subject: 'mailto:admin@chatapp.com',
    },
    email: {
      enabled: !!env.SMTP_HOST,
      templates: {
        mention: 'mention-notification',
        groupInvite: 'group-invite',
        messageDigest: 'message-digest',
      },
    },
  },
  
  // Security
  security: {
    bcryptRounds: env.BCRYPT_ROUNDS,
    sessionSecret: env.SESSION_SECRET,
    cors: {
      origin: env.CORS_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      maxAge: 86400, // 24 hours
    },
    helmet: {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "ws:", "wss:"],
          fontSrc: ["'self'", "https:", "data:"],
        },
      },
      crossOriginEmbedderPolicy: false,
    },
    bruteForce: {
      freeRetries: 2,
      minWait: 5 * 60 * 1000, // 5 minutes
      maxWait: 60 * 60 * 1000, // 1 hour
      failuresBeforeDelay: 3,
    },
  },
  
  // Media Processing
  media: {
    image: {
      maxWidth: env.IMAGE_MAX_WIDTH,
      maxHeight: env.IMAGE_MAX_HEIGHT,
      quality: env.IMAGE_QUALITY,
      formats: ['jpeg', 'png', 'webp'],
      enableOptimization: true,
    },
    thumbnail: {
      width: env.THUMBNAIL_WIDTH,
      height: env.THUMBNAIL_HEIGHT,
      quality: 70,
      format: 'webp',
    },
    video: {
      maxSize: 100 * 1024 * 1024, // 100MB
      allowedFormats: ['mp4', 'webm', 'mov'],
      thumbnailEnabled: true,
    },
    audio: {
      maxSize: 50 * 1024 * 1024, // 50MB
      allowedFormats: ['mp3', 'wav', 'ogg', 'm4a'],
      transcriptionEnabled: false,
    },
  },
  
  // Backup
  backup: {
    enabled: env.BACKUP_ENABLED,
    intervalHours: env.BACKUP_INTERVAL_HOURS,
    retentionDays: env.BACKUP_RETENTION_DAYS,
    location: './backups',
    compression: true,
    encryption: true,
  },
  
  // Socket.IO
  socket: {
    cors: {
      origin: env.SOCKET_CORS_ORIGIN,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: env.SOCKET_PING_TIMEOUT,
    pingInterval: env.SOCKET_PING_INTERVAL,
    maxHttpBufferSize: 1e6, // 1MB
    allowEIO3: true,
    transports: ['websocket', 'polling'],
    adapter: {
      type: 'redis',
      options: {
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
        password: env.REDIS_PASSWORD,
      },
    },
  },
  
  // Feature Flags
  features: {
    messageEncryption: env.ENABLE_MESSAGE_ENCRYPTION,
    readReceipts: env.ENABLE_READ_RECEIPTS,
    typingIndicators: env.ENABLE_TYPING_INDICATORS,
    presence: env.ENABLE_PRESENCE,
    voiceCalls: true,
    videoCalls: true,
    fileSharing: true,
    groupChats: true,
    messageReactions: true,
    messageEditing: true,
    messageForwarding: true,
    messageSearch: env.SEARCH_ENABLED,
    userBlocking: true,
    messageThreads: false, // Future feature
    messageScheduling: false, // Future feature
  },
  
  // Pagination
  pagination: {
    defaultPageSize: env.DEFAULT_PAGE_SIZE,
    maxPageSize: env.MAX_PAGE_SIZE,
    defaultSortOrder: 'desc' as const,
    allowedSortFields: ['createdAt', 'updatedAt', 'name'],
  },
  
  // API Configuration
  api: {
    version: 'v1',
    prefix: '/api',
    timeout: 30000, // 30 seconds
    maxRequestSize: '10mb',
    enableCompression: true,
    enableEtag: true,
  },
} as const;

// Export individual config sections for convenience
export const {
  nodeEnv,
  isDevelopment,
  isProduction,
  isTest,
  server,
  database,
  redis,
  jwt,
  encryption,
  email,
  upload,
  logging,
  rateLimit,
  webrtc,
  monitoring,
  cache,
  search,
  notifications,
  security,
  media,
  backup,
  socket,
  features,
  pagination,
  api,
} = config;

// Type definitions for configuration
export type Config = typeof config;
export type ConfigSection<T extends keyof Config> = Config[T];

// Configuration validation utilities
export const validateConfig = () => {
  const requiredSecrets = [
    config.jwt.secret,
    config.jwt.refreshSecret,
    config.security.sessionSecret,
  ];

  const missingSecrets = requiredSecrets.filter(secret => !secret || secret.length < 32);
  
  if (missingSecrets.length > 0) {
    throw new Error('Configuration validation failed: Some required secrets are missing or too short');
  }

  if (config.isProduction) {
    if (!config.database.url.includes('postgresql://')) {
      console.warn('⚠️  Warning: Using non-PostgreSQL database in production');
    }
    
    if (config.logging.level === 'debug') {
      console.warn('⚠️  Warning: Debug logging enabled in production');
    }
    
    if (!config.email.smtp.host && config.notifications.email.enabled) {
      console.warn('⚠️  Warning: Email notifications enabled but SMTP not configured');
    }
  }

  return true;
};

// Environment-specific configuration overrides
export const getEnvironmentConfig = () => {
  const baseConfig = config;
  
  switch (config.nodeEnv) {
    case 'development':
      return {
        ...baseConfig,
        logging: {
          ...baseConfig.logging,
          level: 'debug' as const,
          enableConsole: true,
        },
        monitoring: {
          ...baseConfig.monitoring,
          enabled: false,
        },
        cache: {
          ...baseConfig.cache,
          enabled: false, // Disable cache in development for easier debugging
        },
      };
      
    case 'test':
      return {
        ...baseConfig,
        database: {
          ...baseConfig.database,
          url: process.env.TEST_DATABASE_URL || baseConfig.database.url,
        },
        logging: {
          ...baseConfig.logging,
          level: 'error' as const,
          enableConsole: false,
          enableFile: false,
        },
        redis: {
          ...baseConfig.redis,
          url: process.env.TEST_REDIS_URL || 'redis://localhost:6380',
        },
      };
      
    case 'production':
      return {
        ...baseConfig,
        logging: {
          ...baseConfig.logging,
          enableConsole: false,
          enableFile: true,
        },
        monitoring: {
          ...baseConfig.monitoring,
          enabled: true,
        },
      };
      
    default:
      return baseConfig;
  }
};

// Configuration helpers
export const isFeatureEnabled = (feature: keyof typeof config.features): boolean => {
  return config.features[feature];
};

export const getCacheStrategy = (type: keyof typeof config.cache.strategies) => {
  return config.cache.strategies[type];
};

export const getRateLimitConfig = (type: keyof typeof config.rateLimit) => {
  if (type === 'windowMs' || type === 'maxRequests' || typeof config.rateLimit[type] === 'boolean') {
    return config.rateLimit[type];
  }
  return config.rateLimit[type as keyof typeof config.rateLimit];
};

// Initialize configuration validation
try {
  validateConfig();
  console.log('✅ Configuration validation passed');
} catch (error) {
  console.error('❌ Configuration validation failed:', error);
  if (config.isProduction) {
    process.exit(1);
  }
}

export default config;
