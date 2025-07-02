import type { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { ApiError } from './errorHandler';
import { logger } from '../utils/logger';

/**
 * CORS configuration
 */
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://localhost:3000',
      'https://localhost:3001',
      // Add production domains here
      process.env.CLIENT_URL,
      process.env.FRONTEND_URL,
    ].filter(Boolean);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn('CORS blocked request from origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-API-Key',
    'X-Client-Version',
    'X-Request-ID',
  ],
  exposedHeaders: [
    'X-Total-Count',
    'X-Page-Count',
    'X-Current-Page',
    'X-Rate-Limit-Remaining',
    'X-Rate-Limit-Reset',
  ],
  maxAge: 86400, // 24 hours
};

/**
 * Helmet security configuration
 */
const helmetOptions = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'ws:', 'wss:'],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Disable for Socket.IO compatibility
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
};

/**
 * Apply CORS middleware
 */
export const applyCors = cors(corsOptions);

/**
 * Apply Helmet security middleware
 */
export const applyHelmet = helmet(helmetOptions);

/**
 * Request ID middleware for tracing
 */
export const requestId = (req: Request, res: Response, next: NextFunction): void => {
  const requestId = req.headers['x-request-id'] as string || 
    `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-ID', requestId);
  
  // Add to logger context
  (req as any).requestId = requestId;
  
  next();
};

/**
 * API Key validation middleware
 */
export const validateApiKey = (req: Request, res: Response, next: NextFunction): void => {
  const apiKey = req.headers['x-api-key'] as string;
  const validApiKeys = process.env.API_KEYS?.split(',') || [];

  if (!apiKey) {
    return next(ApiError.unauthorized('API key is required'));
  }

  if (!validApiKeys.includes(apiKey)) {
    logger.warn('Invalid API key attempt:', {
      apiKey: apiKey.substring(0, 8) + '...',
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });
    return next(ApiError.unauthorized('Invalid API key'));
  }

  next();
};

/**
 * IP whitelist middleware
 */
export const ipWhitelist = (allowedIPs: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIP = req.ip || req.connection.remoteAddress || '';
    
    if (!allowedIPs.includes(clientIP)) {
      logger.warn('IP not in whitelist:', {
        ip: clientIP,
        userAgent: req.get('User-Agent'),
        url: req.url,
      });
      return next(ApiError.forbidden('Access denied from this IP address'));
    }

    next();
  };
};

/**
 * User agent validation middleware
 */
export const validateUserAgent = (req: Request, res: Response, next: NextFunction): void => {
  const userAgent = req.get('User-Agent');
  
  if (!userAgent) {
    return next(ApiError.badRequest('User-Agent header is required'));
  }

  // Block known bad user agents
  const blockedUserAgents = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /scraper/i,
    // Add more patterns as needed
  ];

  const isBlocked = blockedUserAgents.some(pattern => pattern.test(userAgent));
  
  if (isBlocked) {
    logger.warn('Blocked user agent:', {
      userAgent,
      ip: req.ip,
      url: req.url,
    });
    return next(ApiError.forbidden('Access denied'));
  }

  next();
};

/**
 * Request size limiter middleware
 */
export const limitRequestSize = (maxSize: number = 10 * 1024 * 1024) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = parseInt(req.get('Content-Length') || '0', 10);
    
    if (contentLength > maxSize) {
      return next(ApiError.badRequest(`Request too large. Maximum size: ${maxSize} bytes`));
    }

    next();
  };
};

/**
 * Request timeout middleware
 */
export const requestTimeout = (timeoutMs: number = 30000) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        logger.warn('Request timeout:', {
          url: req.url,
          method: req.method,
          timeout: timeoutMs,
        });
        next(ApiError.internal('Request timeout'));
      }
    }, timeoutMs);

    // Clear timeout when response is finished
    res.on('finish', () => clearTimeout(timeout));
    res.on('close', () => clearTimeout(timeout));

    next();
  };
};

/**
 * Content type validation middleware
 */
export const validateContentType = (allowedTypes: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentType = req.get('Content-Type');
    
    if (!contentType) {
      return next(ApiError.badRequest('Content-Type header is required'));
    }

    const isAllowed = allowedTypes.some(type => contentType.includes(type));
    
    if (!isAllowed) {
      return next(ApiError.badRequest(`Invalid Content-Type. Allowed: ${allowedTypes.join(', ')}`));
    }

    next();
  };
};

/**
 * Security headers middleware
 */
export const securityHeaders = (req: Request, res: Response, next: NextFunction): void => {
  // Remove server information
  res.removeHeader('X-Powered-By');
  
  // Add security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  // Add custom security headers
  res.setHeader('X-API-Version', process.env.API_VERSION || '1.0.0');
  res.setHeader('X-Server-Time', new Date().toISOString());

  next();
};

/**
 * Request logging middleware for security monitoring
 */
export const securityLogger = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  
  // Log request details
  logger.info('Incoming request:', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    referer: req.get('Referer'),
    requestId: (req as any).requestId,
    timestamp: new Date().toISOString(),
  });

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    logger.info('Request completed:', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      requestId: (req as any).requestId,
    });

    // Log suspicious activity
    if (res.statusCode >= 400) {
      logger.warn('Error response:', {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        requestId: (req as any).requestId,
      });
    }
  });

  next();
};

/**
 * Honeypot middleware to catch bots
 */
export const honeypot = (req: Request, res: Response, next: NextFunction): void => {
  // Check for honeypot fields in request body
  const honeypotFields = ['website', 'url', 'homepage', 'link'];
  
  if (req.body) {
    for (const field of honeypotFields) {
      if (req.body[field]) {
        logger.warn('Honeypot triggered:', {
          field,
          value: req.body[field],
          ip: req.ip,
          userAgent: req.get('User-Agent'),
        });
        return next(ApiError.forbidden('Access denied'));
      }
    }
  }

  next();
};

/**
 * Brute force protection middleware
 */
export const bruteForceProtection = (options: {
  maxAttempts: number;
  windowMs: number;
  blockDurationMs: number;
}) => {
  const attempts = new Map<string, {
    count: number;
    firstAttempt: number;
    blockedUntil?: number;
  }>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    
    let attemptData = attempts.get(key);
    
    // Clean up old entries
    if (attemptData && now - attemptData.firstAttempt > options.windowMs) {
      attempts.delete(key);
      attemptData = undefined;
    }

    // Check if currently blocked
    if (attemptData?.blockedUntil && now < attemptData.blockedUntil) {
      const remainingTime = Math.ceil((attemptData.blockedUntil - now) / 1000);
      return next(ApiError.tooManyRequests(`Blocked for ${remainingTime} seconds`));
    }

    // Initialize or increment attempts
    if (!attemptData) {
      attempts.set(key, {
        count: 1,
        firstAttempt: now,
      });
    } else {
      attemptData.count++;
      
      // Block if too many attempts
      if (attemptData.count > options.maxAttempts) {
        attemptData.blockedUntil = now + options.blockDurationMs;
        
        logger.warn('Brute force protection triggered:', {
          ip: key,
          attempts: attemptData.count,
          blockedUntil: new Date(attemptData.blockedUntil).toISOString(),
        });
        
        return next(ApiError.tooManyRequests('Too many failed attempts'));
      }
    }

    // Reset on successful response
    res.on('finish', () => {
      if (res.statusCode < 400) {
        attempts.delete(key);
      }
    });

    next();
  };
};

/**
 * SQL injection detection middleware
 */
export const sqlInjectionProtection = (req: Request, res: Response, next: NextFunction): void => {
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/gi,
    /(\b(OR|AND)\s+\d+\s*=\s*\d+)/gi,
    /(\'|\"|;|--|\*|\|)/g,
    /(\b(WAITFOR|DELAY)\b)/gi,
  ];

  const checkForSqlInjection = (obj: any, path: string = ''): boolean => {
    if (typeof obj === 'string') {
      return sqlPatterns.some(pattern => pattern.test(obj));
    }
    
    if (Array.isArray(obj)) {
      return obj.some((item, index) => 
        checkForSqlInjection(item, `${path}[${index}]`)
      );
    }
    
    if (obj && typeof obj === 'object') {
      return Object.entries(obj).some(([key, value]) => 
        checkForSqlInjection(value, path ? `${path}.${key}` : key)
      );
    }
    
    return false;
  };

  // Check request body and query parameters
  if (checkForSqlInjection(req.body) || checkForSqlInjection(req.query)) {
    logger.warn('SQL injection attempt detected:', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.url,
      body: req.body,
      query: req.query,
    });
    
    return next(ApiError.badRequest('Invalid request data'));
  }

  next();
};

/**
 * XSS protection middleware
 */
export const xssProtection = (req: Request, res: Response, next: NextFunction): void => {
  const xssPatterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /<img[^>]+src[\\s]*=[\\s]*["\']javascript:/gi,
  ];

  const checkForXss = (obj: any): boolean => {
    if (typeof obj === 'string') {
      return xssPatterns.some(pattern => pattern.test(obj));
    }
    
    if (Array.isArray(obj)) {
      return obj.some(item => checkForXss(item));
    }
    
    if (obj && typeof obj === 'object') {
      return Object.values(obj).some(value => checkForXss(value));
    }
    
    return false;
  };

  if (checkForXss(req.body) || checkForXss(req.query)) {
    logger.warn('XSS attempt detected:', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.url,
    });
    
    return next(ApiError.badRequest('Invalid request data'));
  }

  next();
};

/**
 * Combined security middleware stack
 */
export const securityStack = [
  requestId,
  securityHeaders,
  applyCors,
  applyHelmet,
  securityLogger,
  limitRequestSize(),
  requestTimeout(),
  honeypot,
  sqlInjectionProtection,
  xssProtection,
];

/**
 * Admin-only security middleware stack
 */
export const adminSecurityStack = [
  ...securityStack,
  validateApiKey,
  bruteForceProtection({
    maxAttempts: 3,
    windowMs: 15 * 60 * 1000, // 15 minutes
    blockDurationMs: 60 * 60 * 1000, // 1 hour
  }),
];
