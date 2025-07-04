/**
 * Enhanced Middleware exports with integrated security and rate limiting
 * Central export file for all middleware modules with comprehensive security features
 */

// Core middleware exports
export * from './errorHandler';
export * from './auth';
export * from './validation.middleware';
export * from './cache.middleware';
export * from './upload.middleware';

// Enhanced security and rate limiting exports
export * from './security.middleware';
export * from './rateLimiter';

// Import enhanced security and rate limiting middleware
import {
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
} from './security.middleware';

import {
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
} from './rateLimiter';

// Import existing middleware
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

import { errorHandler, ApiError } from './errorHandler';

/**
 * Enhanced Security Middleware Stacks
 * These stacks integrate encryption, rate limiting, and comprehensive security features
 */

// Core security middleware stack (applied to all routes)
export const coreSecurityStack = [
  requestLoggingMiddleware,
  corsSecurityMiddleware,
  securityHeaders,
  ipBlockingMiddleware,
  contentSanitizationMiddleware,
  burstProtectionMiddleware(50), // Lower threshold for general protection
];

// Basic API middleware stack with rate limiting
export const basicApiStack = [
  ...coreSecurityStack,
  apiRateLimiter,
  sessionSecurityMiddleware,
];

// Authentication middleware stack with enhanced security
export const authenticationStack = [
  ...coreSecurityStack,
  authRateLimiter,
  authTrackingMiddleware,
  bruteForceProtection(),
  sessionSecurityMiddleware,
];

// Authenticated API middleware stack
export const authenticatedApiStack = [
  ...basicApiStack,
  authenticate,
  accountBlockingMiddleware,
];

// Message handling middleware stack with encryption
export const messageStack = [
  ...authenticatedApiStack,
  messageRateLimiter,
  messageEncryptionMiddleware,
  requireConversationAccess(),
];

// File upload middleware stack with security
export const uploadStack = [
  ...authenticatedApiStack,
  uploadRateLimiter,
  fileUploadSecurityMiddleware,
];

// Admin middleware stack with enhanced security
export const adminStack = [
  ...coreSecurityStack,
  adminRateLimiter,
  requestSignatureMiddleware({ requireSignature: true }),
  authenticate,
  authorize(['admin']),
  accountBlockingMiddleware,
];

// Group management middleware stack
export const groupStack = [
  ...authenticatedApiStack,
  requireGroupAccess(),
];

// User profile middleware stack with data encryption
export const profileStack = [
  ...authenticatedApiStack,
  dataEncryptionMiddleware(['email', 'phone']),
  requireOwnership(),
];

// Search middleware stack with caching and rate limiting
export const searchStack = [
  ...authenticatedApiStack,
  searchRateLimiter,
  cache({ ttl: 300 }), // 5 minutes cache
];

// WebSocket middleware stack
export const websocketStack = [
  corsSecurityMiddleware,
  securityHeaders,
  websocketRateLimiter,
  ipBlockingMiddleware,
];

// Password reset middleware stack
export const passwordResetStack = [
  ...coreSecurityStack,
  passwordResetRateLimiter,
  authTrackingMiddleware,
];

// Registration middleware stack
export const registrationStack = [
  ...coreSecurityStack,
  registrationRateLimiter,
  authTrackingMiddleware,
];

/**
 * Specialized Middleware Combinations
 */

// High-security middleware for sensitive operations
export const highSecurityStack = [
  ...coreSecurityStack,
  adaptiveApiRateLimiter,
  requestSignatureMiddleware({ requireSignature: true }),
  authenticate,
  accountBlockingMiddleware,
  burstProtectionMiddleware(25), // Stricter burst protection
];

// Public API middleware (no authentication required)
export const publicApiStack = [
  ...coreSecurityStack,
  apiRateLimiter,
];

// Optional authentication middleware
export const optionalAuthStack = [
  ...basicApiStack,
  optionalAuth,
];

/**
 * Data Protection Middleware
 */

// Sensitive data encryption middleware
export const sensitiveDataStack = [
  ...authenticatedApiStack,
  dataEncryptionMiddleware(['email', 'phone', 'personalInfo']),
];

// Response data decryption middleware
export const dataDecryptionStack = [
  dataDecryptionMiddleware(['email', 'phone', 'personalInfo']),
];

/**
 * Route-Specific Middleware Stacks
 */

// Auth routes (login, register, password reset)
export const authRoutes = {
  login: [
    ...authenticationStack,
    validateLogin,
  ],
  register: [
    ...registrationStack,
    validateRegister,
  ],
  passwordReset: [
    ...passwordResetStack,
    validate,
  ],
  refreshToken: [
    ...authenticationStack,
    sessionSecurityMiddleware,
  ],
};

// Message routes
export const messageRoutes = {
  send: [
    ...messageStack,
    validateSendMessage,
  ],
  get: [
    ...authenticatedApiStack,
    requireConversationAccess(),
    cache({ ttl: 60 }),
  ],
  update: [
    ...messageStack,
    requireOwnership(),
  ],
  delete: [
    ...authenticatedApiStack,
    requireOwnership(),
  ],
};

// Group routes
export const groupRoutes = {
  create: [
    ...authenticatedApiStack,
    validateCreateGroup,
  ],
  join: [
    ...groupStack,
  ],
  leave: [
    ...groupStack,
  ],
  manage: [
    ...groupStack,
    authorize(['admin', 'moderator']),
  ],
};

// User routes
export const userRoutes = {
  profile: [
    ...profileStack,
    ...dataDecryptionStack,
  ],
  updateProfile: [
    ...sensitiveDataStack,
  ],
  avatar: [
    ...uploadStack,
    uploadAvatar,
    validateUploadedFile,
  ],
};

// File routes
export const fileRoutes = {
  upload: [
    ...uploadStack,
    uploadAnyFile,
    validateUploadedFile,
  ],
  image: [
    ...uploadStack,
    uploadImage,
    validateUploadedFile,
  ],
  document: [
    ...uploadStack,
    uploadDocument,
    validateUploadedFile,
  ],
};

// Search routes
export const searchRoutes = {
  global: [
    ...searchStack,
  ],
  messages: [
    ...searchStack,
    requireConversationAccess(),
  ],
  users: [
    ...searchStack,
  ],
  groups: [
    ...searchStack,
  ],
};

// Admin routes
export const adminRoutes = {
  users: [
    ...adminStack,
  ],
  groups: [
    ...adminStack,
  ],
  analytics: [
    ...adminStack,
    cache({ ttl: 300 }),
  ],
  rateLimits: [
    ...adminStack,
  ],
};

/**
 * Error Handling Middleware
 */

// Standard error handling
export const errorHandlingStack = [
  errorHandler,
];

// Upload error handling
export const uploadErrorHandlingStack = [
  handleUploadError,
  cleanupUploadedFiles,
  errorHandler,
];

// Not found handler
const createNotFoundHandler = () => (req: any, res: any) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
      timestamp: new Date().toISOString(),
    },
  });
};

export const notFoundHandler = createNotFoundHandler();

/**
 * Utility Functions
 */

// Compose multiple middleware arrays
export const composeMiddleware = (...middlewareArrays: any[][]) => {
  return middlewareArrays.flat();
};

// Conditional middleware
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

// Async middleware wrapper
export const asyncMiddleware = (fn: any) => {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Timing middleware
export const timingMiddleware = (name: string) => {
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
 * Security Utilities
 */

// Rate limit status endpoint middleware
export const rateLimitStatusMiddleware = [
  ...adminStack,
  getRateLimitStatus,
];

// Clear rate limits endpoint middleware
export const clearRateLimitsMiddleware = [
  ...adminStack,
  clearRateLimits,
];

/**
 * Export all middleware for direct use
 */
export {
  // Enhanced Security
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

  // Enhanced Rate Limiting
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

  // Authentication
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

  // Error Handling
  errorHandler,
  ApiError,
};

// Legacy middleware aliases for backward compatibility
export const authMiddleware = authenticate;
export const optionalAuthMiddleware = optionalAuth;
export const adminMiddleware = authorize(['admin']);
export const rateLimiter = apiRateLimiter;
export const uploadMiddleware = uploadAnyFile;
export const basicMiddleware = basicApiStack;
export const apiMiddleware = authenticatedApiStack;
export const authRoutesMiddleware = authRoutes;

/**
 * Default export with all middleware stacks
 */
export default {
  // Security stacks
  coreSecurityStack,
  basicApiStack,
  authenticationStack,
  authenticatedApiStack,
  messageStack,
  uploadStack,
  adminStack,
  groupStack,
  profileStack,
  searchStack,
  websocketStack,
  passwordResetStack,
  registrationStack,
  highSecurityStack,
  publicApiStack,
  optionalAuthStack,
  sensitiveDataStack,
  dataDecryptionStack,

  // Route-specific stacks
  authRoutes,
  messageRoutes,
  groupRoutes,
  userRoutes,
  fileRoutes,
  searchRoutes,
  adminRoutes,

  // Error handling
  errorHandlingStack,
  uploadErrorHandlingStack,
  notFoundHandler,

  // Utilities
  composeMiddleware,
  conditionalMiddleware,
  asyncMiddleware,
  timingMiddleware,
  rateLimitStatusMiddleware,
  clearRateLimitsMiddleware,
};
