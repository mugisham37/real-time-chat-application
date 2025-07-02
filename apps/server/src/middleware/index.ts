/**
 * Middleware exports
 * Central export file for all middleware modules
 */

// Error handling middleware
export * from './errorHandler';

// Authentication and authorization middleware
export * from './auth';

// Validation middleware
export * from './validation.middleware';

// Cache middleware
export * from './cache.middleware';

// Upload middleware
export * from './upload.middleware';

// Security middleware
export * from './security.middleware';


// Re-export commonly used middleware combinations
import {
  authenticate,
  optionalAuth,
  authorize,
  requireConversationAccess,
  requireGroupAccess,
  requireOwnership,
} from './auth';

import {
  validate,
  validateBody,
  validateQuery,
  validateParams,
  validateLogin,
  validateRegister,
  validateSendMessage,
  validateCreateGroup,
  sanitizeRequest,
} from './validation.middleware';

import {
  cache,
  cacheUserProfile,
  cacheConversations,
  cacheMessages,
  invalidateCache,
} from './cache.middleware';

import {
  uploadImage,
  uploadDocument,
  uploadAvatar,
  uploadAnyFile,
  handleUploadError,
  validateUploadedFile,
  cleanupUploadedFiles,
} from './upload.middleware';

import {
  securityStack,
  adminSecurityStack,
  applyCors,
  requestId,
  securityHeaders,
  bruteForceProtection,
} from './security.middleware';

import { errorHandler, ApiError } from './errorHandler';

// Create rate limiter functions (will be moved to separate file later)
const createRateLimiter = (windowMs: number, max: number, message: string) => {
  const requests = new Map<string, { count: number; resetTime: number }>();
  
  return (req: any, res: any, next: any) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean up old entries
    for (const [k, v] of requests.entries()) {
      if (v.resetTime < windowStart) {
        requests.delete(k);
      }
    }

    // Get or create request data
    let requestData = requests.get(key);
    if (!requestData || requestData.resetTime < windowStart) {
      requestData = { count: 0, resetTime: now + windowMs };
      requests.set(key, requestData);
    }

    // Increment request count
    requestData.count++;

    // Check if limit exceeded
    if (requestData.count > max) {
      return next(ApiError.tooManyRequests(message));
    }

    next();
  };
};

// Rate limiter instances
const rateLimiter = createRateLimiter(15 * 60 * 1000, 100, 'Too many requests, please try again later');
const authRateLimiter = createRateLimiter(15 * 60 * 1000, 5, 'Too many login attempts, please try again later');
const uploadRateLimiter = createRateLimiter(15 * 60 * 1000, 10, 'Too many upload attempts, please try again later');

// Not found handler
const notFoundHandler = (req: any, res: any) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
};

/**
 * Common middleware stacks for different route types
 */

// Basic middleware stack for all routes
export const basicMiddleware = [
  requestId,
  securityHeaders,
  applyCors,
  sanitizeRequest,
];

// Authentication required middleware stack
export const authMiddleware = [
  ...basicMiddleware,
  authenticate,
];

// Optional authentication middleware stack
export const optionalAuthMiddleware = [
  ...basicMiddleware,
  optionalAuth,
];

// Admin routes middleware stack
export const adminMiddleware = [
  ...adminSecurityStack,
  authenticate,
  authorize(['admin']),
];

// API routes middleware stack with rate limiting
export const apiMiddleware = [
  ...basicMiddleware,
  rateLimiter,
  authenticate,
];

// Public API routes (no auth required)
export const publicApiMiddleware = [
  ...basicMiddleware,
  rateLimiter,
];

// Auth routes middleware stack (login, register, etc.)
export const authRoutesMiddleware = [
  ...basicMiddleware,
  authRateLimiter,
  bruteForceProtection({
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
    blockDurationMs: 30 * 60 * 1000, // 30 minutes
  }),
];

// Upload routes middleware stack
export const uploadMiddleware = [
  ...authMiddleware,
  uploadRateLimiter,
];

// Message routes middleware stack
export const messageMiddleware = [
  ...authMiddleware,
  requireConversationAccess(),
];

// Group routes middleware stack
export const groupMiddleware = [
  ...authMiddleware,
  requireGroupAccess(),
];

// User profile routes middleware stack
export const profileMiddleware = [
  ...authMiddleware,
  requireOwnership(),
];

// Search routes middleware stack
export const searchMiddleware = [
  ...authMiddleware,
  cache({ ttl: 300 }), // 5 minutes cache
];

/**
 * Middleware application helpers
 */

// Apply error handling middleware (should be last)
export const applyErrorHandling = [
  errorHandler,
  notFoundHandler,
];

// Apply upload error handling
export const applyUploadErrorHandling = [
  handleUploadError,
  cleanupUploadedFiles,
  errorHandler,
];

/**
 * Validation middleware combinations
 */
export const authValidation = {
  login: validateLogin,
  register: validateRegister,
};

export const messageValidation = {
  send: validateSendMessage,
  // Add other message validations as needed
};

export const groupValidation = {
  create: validateCreateGroup,
  // Add other group validations as needed
};

/**
 * Cache middleware combinations
 */
export const cacheMiddleware = {
  userProfile: cacheUserProfile,
  conversations: cacheConversations,
  messages: cacheMessages,
  search: cache({ ttl: 300 }),
  shortTerm: cache({ ttl: 60 }),
  longTerm: cache({ ttl: 3600 }),
};

/**
 * Upload middleware combinations
 */
export const uploadTypes = {
  image: [uploadImage, validateUploadedFile],
  document: [uploadDocument, validateUploadedFile],
  avatar: [uploadAvatar, validateUploadedFile],
  any: [uploadAnyFile, validateUploadedFile],
};

/**
 * Security middleware combinations
 */
export const securityMiddleware = {
  basic: securityStack,
  admin: adminSecurityStack,
  bruteForce: bruteForceProtection({
    maxAttempts: 10,
    windowMs: 15 * 60 * 1000,
    blockDurationMs: 60 * 60 * 1000,
  }),
};

/**
 * Utility functions for middleware composition
 */

/**
 * Compose multiple middleware arrays into one
 */
export const composeMiddleware = (...middlewareArrays: any[][]) => {
  return middlewareArrays.flat();
};

/**
 * Create conditional middleware
 */
export const conditionalMiddleware = (
  condition: (req: any) => boolean,
  middleware: any
) => {
  return (req: any, res: any, next: any) => {
    if (condition(req)) {
      return middleware(req, res, next);
    }
    next();
  };
};

/**
 * Create async middleware wrapper
 */
export const asyncMiddleware = (fn: any) => {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Middleware timing utility
 */
export const timeMiddleware = (name: string) => {
  return (req: any, res: any, next: any) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`${name} middleware took ${duration}ms`);
    });
    next();
  };
};

/**
 * Request context middleware
 */
export const requestContext = (req: any, res: any, next: any) => {
  req.context = {
    startTime: Date.now(),
    requestId: req.headers['x-request-id'],
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    method: req.method,
    url: req.url,
  };
  next();
};

/**
 * Response time middleware
 */
export const responseTime = (req: any, res: any, next: any) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    res.setHeader('X-Response-Time', `${duration}ms`);
  });
  next();
};

// Export individual middleware for direct use
export {
  // Auth
  authenticate,
  optionalAuth,
  authorize,
  requireConversationAccess,
  requireGroupAccess,
  requireOwnership,
  
  // Validation
  validate,
  validateBody,
  validateQuery,
  validateParams,
  validateLogin,
  validateRegister,
  validateSendMessage,
  validateCreateGroup,
  sanitizeRequest,
  
  // Cache
  cache,
  cacheUserProfile,
  cacheConversations,
  cacheMessages,
  invalidateCache,
  
  // Upload
  uploadImage,
  uploadDocument,
  uploadAvatar,
  uploadAnyFile,
  handleUploadError,
  validateUploadedFile,
  cleanupUploadedFiles,
  
  // Security
  securityStack,
  adminSecurityStack,
  applyCors,
  requestId,
  securityHeaders,
  bruteForceProtection,
  
  // Error handling
  errorHandler,
  ApiError,
  
  // Rate limiting
  rateLimiter,
  authRateLimiter,
  uploadRateLimiter,
  
  // Not found
  notFoundHandler,
};
