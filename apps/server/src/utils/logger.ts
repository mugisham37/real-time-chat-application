import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { config } from '../config/config';

// Ensure logs directory exists
const logsDir = path.dirname(config.logging.file);
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom log levels
const customLevels = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
    trace: 5,
  },
  colors: {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'blue',
    trace: 'cyan',
  },
};

// Add colors to winston
winston.addColors(customLevels.colors);

// Define log format for files
const fileFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS',
  }),
  winston.format.errors({ stack: true }),
  winston.format.metadata({
    fillExcept: ['message', 'level', 'timestamp', 'label'],
  }),
  winston.format.json()
);

// Define log format for console (development)
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({
    format: 'HH:mm:ss.SSS',
  }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, metadata, stack }) => {
    let logMessage = `${timestamp} [${level}]: ${message}`;
    
    // Add metadata if present
    if (metadata && Object.keys(metadata).length > 0) {
      logMessage += ` ${JSON.stringify(metadata, null, 2)}`;
    }
    
    // Add stack trace for errors
    if (stack) {
      logMessage += `\n${stack}`;
    }
    
    return logMessage;
  })
);

// Create transports array
const transports: winston.transport[] = [];

// Console transport (always enabled in development)
if (config.isDevelopment) {
  transports.push(
    new winston.transports.Console({
      format: consoleFormat,
      level: config.logging.level,
    })
  );
}

// File transports (enabled in production or when LOG_FILE is set)
if (config.isProduction || config.logging.file) {
  // Error log file
  transports.push(
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 10,
      tailable: true,
    })
  );

  // Combined log file
  transports.push(
    new winston.transports.File({
      filename: config.logging.file,
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 10,
      tailable: true,
    })
  );

  // HTTP log file for request logging
  transports.push(
    new winston.transports.File({
      filename: path.join(logsDir, 'http.log'),
      level: 'http',
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true,
    })
  );
}

// Create logger instance
export const logger = winston.createLogger({
  levels: customLevels.levels,
  level: config.logging.level,
  format: fileFormat,
  defaultMeta: {
    service: 'chat-app-server',
    environment: config.nodeEnv,
    version: process.env.npm_package_version || '1.0.0',
  },
  transports,
  exitOnError: false,
});

// Create specialized loggers for different components
export const createChildLogger = (component: string) => {
  return logger.child({ component });
};

// Specialized loggers
export const authLogger = createChildLogger('auth');
export const dbLogger = createChildLogger('database');
export const socketLogger = createChildLogger('socket');
export const apiLogger = createChildLogger('api');
export const uploadLogger = createChildLogger('upload');
export const cacheLogger = createChildLogger('cache');
export const metricsLogger = createChildLogger('metrics');

// Stream for Morgan HTTP logging
export const httpLogStream = {
  write: (message: string) => {
    logger.http(message.trim());
  },
};

// Performance logging utilities
export const performanceLogger = {
  startTimer: (label: string) => {
    const start = process.hrtime.bigint();
    return {
      end: (metadata?: Record<string, any>) => {
        const end = process.hrtime.bigint();
        const duration = Number(end - start) / 1000000; // Convert to milliseconds
        logger.debug(`Performance: ${label}`, {
          duration: `${duration.toFixed(2)}ms`,
          ...metadata,
        });
        return duration;
      },
    };
  },
  
  logMemoryUsage: () => {
    const memUsage = process.memoryUsage();
    logger.debug('Memory Usage', {
      rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
      external: `${Math.round(memUsage.external / 1024 / 1024)}MB`,
    });
  },
};

// Error logging utilities
export const errorLogger = {
  logError: (error: Error, context?: Record<string, any>) => {
    logger.error('Application Error', {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      context,
    });
  },
  
  logApiError: (error: Error, req?: any, context?: Record<string, any>) => {
    logger.error('API Error', {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      request: req ? {
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: req.body,
        params: req.params,
        query: req.query,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      } : undefined,
      context,
    });
  },
  
  logSocketError: (error: Error, socketId?: string, context?: Record<string, any>) => {
    socketLogger.error('Socket Error', {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      socketId,
      context,
    });
  },
};

// Security logging utilities
export const securityLogger = {
  logAuthAttempt: (success: boolean, email: string, ip: string, userAgent?: string) => {
    const level = success ? 'info' : 'warn';
    logger.log(level, `Authentication ${success ? 'Success' : 'Failed'}`, {
      email,
      ip,
      userAgent,
      success,
    });
  },
  
  logSuspiciousActivity: (activity: string, details: Record<string, any>) => {
    logger.warn('Suspicious Activity Detected', {
      activity,
      ...details,
    });
  },
  
  logRateLimitExceeded: (ip: string, endpoint: string, attempts: number) => {
    logger.warn('Rate Limit Exceeded', {
      ip,
      endpoint,
      attempts,
    });
  },
};

// Business logic logging utilities
export const businessLogger = {
  logUserAction: (userId: string, action: string, details?: Record<string, any>) => {
    logger.info('User Action', {
      userId,
      action,
      ...details,
    });
  },
  
  logMessageSent: (messageId: string, senderId: string, conversationId: string, type: string) => {
    logger.info('Message Sent', {
      messageId,
      senderId,
      conversationId,
      type,
    });
  },
  
  logGroupActivity: (groupId: string, action: string, userId: string, details?: Record<string, any>) => {
    logger.info('Group Activity', {
      groupId,
      action,
      userId,
      ...details,
    });
  },
  
  logFileUpload: (userId: string, filename: string, size: number, type: string) => {
    uploadLogger.info('File Upload', {
      userId,
      filename,
      size,
      type,
    });
  },
};

// System monitoring logging
export const systemLogger = {
  logSystemStart: () => {
    logger.info('System Starting', {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
      uptime: process.uptime(),
    });
  },
  
  logSystemShutdown: () => {
    logger.info('System Shutting Down', {
      uptime: process.uptime(),
    });
  },
  
  logDatabaseConnection: (status: 'connected' | 'disconnected' | 'error', details?: Record<string, any>) => {
    const level = status === 'error' ? 'error' : 'info';
    dbLogger.log(level, `Database ${status}`, details);
  },
  
  logRedisConnection: (status: 'connected' | 'disconnected' | 'error', details?: Record<string, any>) => {
    const level = status === 'error' ? 'error' : 'info';
    cacheLogger.log(level, `Redis ${status}`, details);
  },
};

// Graceful shutdown logging
process.on('SIGINT', () => {
  systemLogger.logSystemShutdown();
  logger.end();
});

process.on('SIGTERM', () => {
  systemLogger.logSystemShutdown();
  logger.end();
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  errorLogger.logError(error, { type: 'uncaughtException' });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', {
    reason,
    promise,
  });
});

export default logger;
