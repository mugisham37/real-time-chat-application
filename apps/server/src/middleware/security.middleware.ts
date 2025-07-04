import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { logger, securityLogger } from '../utils/logger';
import { ApiError } from '../utils/apiError';
import { 
  encryption,
  messageEncryption,
  sessionSecurity,
  fieldEncryption,
  apiSecurity
} from '../security/encryption';
import {
  isIpBlocked,
  isAccountBlocked,
  burstProtection,
  trackFailedLogin,
  resetFailedLogins
} from '../security/rateLimiting';

/**
 * Enhanced Security Middleware integrating encryption and rate limiting
 * Provides comprehensive security features for the chat application
 */

// Security headers middleware
export const securityHeaders = (req: Request, res: Response, next: NextFunction) => {
  // Set security headers
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' ws: wss:;",
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });

  // Remove server information
  res.removeHeader('X-Powered-By');
  res.removeHeader('Server');

  next();
};

// IP blocking middleware
export const ipBlockingMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    
    if (await isIpBlocked(ip)) {
      securityLogger.logSuspiciousActivity('blocked_ip_access_attempt', {
        ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method,
      });
      
      throw ApiError.forbidden('Access denied from this IP address');
    }
    
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
    } else {
      logger.error('IP blocking middleware error:', error);
      next();
    }
  }
};

// Account blocking middleware
export const accountBlockingMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    
    if (user && await isAccountBlocked(user.id)) {
      securityLogger.logSuspiciousActivity('blocked_account_access_attempt', {
        userId: user.id,
        email: user.email,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
      });
      
      throw ApiError.forbidden('Account is temporarily blocked');
    }
    
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
    } else {
      logger.error('Account blocking middleware error:', error);
      next();
    }
  }
};

// Request signature validation middleware
export const requestSignatureMiddleware = (options?: {
  requireSignature?: boolean;
  maxAge?: number;
}) => {
  const requireSignature = options?.requireSignature || false;
  const maxAge = options?.maxAge || 300000; // 5 minutes

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const signature = req.get('X-Signature');
      const timestamp = req.get('X-Timestamp');
      const apiKey = req.get('X-API-Key');

      // Skip if signature not required and not provided
      if (!requireSignature && !signature) {
        return next();
      }

      if (requireSignature && (!signature || !timestamp || !apiKey)) {
        throw ApiError.unauthorized('Request signature required');
      }

      if (signature && timestamp && apiKey) {
        // Validate API key
        const keyData = apiSecurity.validateApiKey(apiKey);
        if (!keyData) {
          throw ApiError.unauthorized('Invalid API key');
        }

        // Get request body
        const body = JSON.stringify(req.body || {});
        const timestampNum = parseInt(timestamp);

        // Verify signature
        const isValid = apiSecurity.verifyRequestSignature(
          req.method,
          req.originalUrl,
          body,
          timestampNum,
          signature,
          config.encryption.secret,
          maxAge
        );

        if (!isValid) {
          securityLogger.logSuspiciousActivity('invalid_request_signature', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            path: req.path,
            method: req.method,
            apiKey: apiKey.substring(0, 10) + '...',
          });
          
          throw ApiError.unauthorized('Invalid request signature');
        }

        // Attach API key data to request
        (req as any).apiKeyData = keyData;
      }

      next();
    } catch (error) {
      if (error instanceof ApiError) {
        next(error);
      } else {
        logger.error('Request signature middleware error:', error);
        next();
      }
    }
  };
};

// Session security middleware
export const sessionSecurityMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionToken = req.get('X-Session-Token') || req.cookies?.sessionToken;
    
    if (sessionToken) {
      const sessionData = sessionSecurity.decryptSessionData(sessionToken);
      
      if (!sessionData) {
        // Invalid or expired session
        res.clearCookie('sessionToken');
        throw ApiError.unauthorized('Invalid or expired session');
      }
      
      // Attach session data to request
      (req as any).sessionData = sessionData;
      
      // Refresh session if needed (extend expiry)
      const now = Date.now();
      const sessionAge = now - sessionData.createdAt;
      const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
      
      if (sessionAge > maxAge / 2) { // Refresh when half expired
        const newSessionData = {
          ...sessionData,
          createdAt: now,
          expiresAt: now + maxAge,
        };
        
        const newToken = sessionSecurity.encryptSessionData(newSessionData);
        res.cookie('sessionToken', newToken, {
          httpOnly: true,
          secure: config.isProduction,
          sameSite: 'strict',
          maxAge,
        });
      }
    }
    
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
    } else {
      logger.error('Session security middleware error:', error);
      next();
    }
  }
};

// Message encryption middleware
export const messageEncryptionMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    
    if (req.body && req.body.content && user) {
      // Encrypt message content if it's a message creation/update
      if (req.path.includes('/messages') && (req.method === 'POST' || req.method === 'PUT')) {
        const conversationId = req.body.conversationId || req.params.conversationId;
        
        if (conversationId) {
          // Encrypt the message content
          req.body.encryptedContent = messageEncryption.encryptMessage(
            req.body.content,
            user.id,
            conversationId
          );
          
          // Keep original content for processing but mark as encrypted
          req.body._isEncrypted = true;
        }
      }
    }
    
    next();
  } catch (error) {
    logger.error('Message encryption middleware error:', error);
    next();
  }
};

// Data encryption middleware for sensitive fields
export const dataEncryptionMiddleware = (fieldsToEncrypt: string[] = []) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.body && fieldsToEncrypt.length > 0) {
        req.body = fieldEncryption.encryptUserFields(req.body, fieldsToEncrypt);
      }
      
      next();
    } catch (error) {
      logger.error('Data encryption middleware error:', error);
      next();
    }
  };
};

// Data decryption middleware for responses
export const dataDecryptionMiddleware = (fieldsToDecrypt: string[] = []) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Override res.json to decrypt data before sending
      const originalJson = res.json;
      
      res.json = function(data: any) {
        if (data && fieldsToDecrypt.length > 0) {
          if (Array.isArray(data)) {
            data = data.map(item => fieldEncryption.decryptUserFields(item, fieldsToDecrypt));
          } else if (typeof data === 'object') {
            data = fieldEncryption.decryptUserFields(data, fieldsToDecrypt);
          }
        }
        
        return originalJson.call(this, data);
      };
      
      next();
    } catch (error) {
      logger.error('Data decryption middleware error:', error);
      next();
    }
  };
};

// Burst protection middleware
export const burstProtectionMiddleware = (threshold: number = 100) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ip = req.ip || 'unknown';
      const key = `burst:${ip}`;
      
      const burstResult = await burstProtection.detectBurst(key, threshold, 10);
      
      if (burstResult.isBurst) {
        await burstProtection.applyBurstProtection(key, burstResult.burstLevel);
        
        securityLogger.logSuspiciousActivity('burst_detected', {
          ip,
          burstLevel: burstResult.burstLevel,
          requestCount: burstResult.requestCount,
          userAgent: req.get('User-Agent'),
          path: req.path,
        });
        
        throw ApiError.rateLimitExceeded(60, {
          burstLevel: burstResult.burstLevel,
          requestCount: burstResult.requestCount,
        });
      }
      
      next();
    } catch (error) {
      if (error instanceof ApiError) {
        next(error);
      } else {
        logger.error('Burst protection middleware error:', error);
        next();
      }
    }
  };
};

// Authentication tracking middleware
export const authTrackingMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ip = req.ip || 'unknown';
    const userAgent = req.get('User-Agent') || 'unknown';
    
    // Track authentication attempts on response
    res.on('finish', async () => {
      const email = req.body?.email;
      
      if (req.path.includes('/auth/login') || req.path.includes('/auth/register')) {
        const success = res.statusCode >= 200 && res.statusCode < 300;
        
        if (email) {
          securityLogger.logAuthAttempt(success, email, ip, userAgent);
          
          if (!success && req.path.includes('/auth/login')) {
            await trackFailedLogin(email, ip);
          } else if (success && req.path.includes('/auth/login')) {
            await resetFailedLogins(email);
          }
        }
      }
    });
    
    next();
  } catch (error) {
    logger.error('Auth tracking middleware error:', error);
    next();
  }
};

// Content sanitization middleware
export const contentSanitizationMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.body) {
      // Sanitize string fields to prevent XSS
      const sanitizeObject = (obj: any): any => {
        if (typeof obj === 'string') {
          return obj
            .replace(/[<>]/g, '') // Remove angle brackets
            .replace(/javascript:/gi, '') // Remove javascript: protocol
            .replace(/on\w+=/gi, '') // Remove event handlers
            .trim();
        } else if (Array.isArray(obj)) {
          return obj.map(sanitizeObject);
        } else if (typeof obj === 'object' && obj !== null) {
          const sanitized: any = {};
          for (const [key, value] of Object.entries(obj)) {
            sanitized[key] = sanitizeObject(value);
          }
          return sanitized;
        }
        return obj;
      };
      
      req.body = sanitizeObject(req.body);
    }
    
    next();
  } catch (error) {
    logger.error('Content sanitization middleware error:', error);
    next();
  }
};

// File upload security middleware
export const fileUploadSecurityMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.file || req.files) {
      const files = req.files ? (Array.isArray(req.files) ? req.files : Object.values(req.files).flat()) : [req.file];
      
      for (const file of files) {
        if (file) {
          // Check file type
          const allowedTypes = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'video/mp4', 'video/webm',
            'audio/mpeg', 'audio/wav', 'audio/ogg',
            'application/pdf', 'text/plain'
          ];
          
          if (!allowedTypes.includes(file.mimetype)) {
            throw ApiError.unsupportedFileType(allowedTypes);
          }
          
          // Check file size (100MB max)
          if (file.size > 100 * 1024 * 1024) {
            throw ApiError.fileTooLarge('100MB');
          }
          
          // Sanitize filename
          if (file.originalname) {
            file.originalname = file.originalname
              .replace(/[^a-zA-Z0-9._-]/g, '_')
              .substring(0, 255);
          }
        }
      }
    }
    
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
    } else {
      logger.error('File upload security middleware error:', error);
      next();
    }
  }
};

// Request logging middleware
export const requestLoggingMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const requestId = encryption.generateSecureToken(16);
  
  // Add request ID to request
  (req as any).requestId = requestId;
  
  // Log request
  logger.info('Incoming request', {
    requestId,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: (req as any).user?.id,
  });
  
  // Log response
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    logger.info('Request completed', {
      requestId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration,
      ip: req.ip,
      userId: (req as any).user?.id,
    });
  });
  
  next();
};

// CORS security middleware
export const corsSecurityMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const origin = req.get('Origin');
  const allowedOrigins = [config.server.corsOrigin, config.server.clientUrl];
  
  if (origin && allowedOrigins.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
  }
  
  res.set({
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-API-Key, X-Signature, X-Timestamp',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400', // 24 hours
  });
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  next();
};

// Export all security middleware
export default {
  securityHeaders,
  ipBlockingMiddleware,
  accountBlockingMiddleware,
  requestSignatureMiddleware,
  sessionSecurityMiddleware,
  messageEncryptionMiddleware,
  dataEncryptionMiddleware,
  dataDecryptionMiddleware,
  burstProtectionMiddleware,
  authTrackingMiddleware,
  contentSanitizationMiddleware,
  fileUploadSecurityMiddleware,
  requestLoggingMiddleware,
  corsSecurityMiddleware,
};
