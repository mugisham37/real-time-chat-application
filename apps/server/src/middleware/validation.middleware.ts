import type { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ApiError } from './errorHandler';
import { logger } from '../utils/logger';
import {
  loginSchema,
  registerSchema,
  updateProfileSchema,
  sendMessageSchema,
  editMessageSchema,
  reactToMessageSchema,
  markMessageReadSchema,
  createGroupSchema,
  updateGroupSchema,
  addGroupMemberSchema,
  removeGroupMemberSchema,
  updateMemberRoleSchema,
  searchSchema,
  paginationSchema,
  fileUploadSchema,
  markNotificationReadSchema,
  typingEventSchema,
  presenceUpdateSchema,
  joinConversationSchema,
  callOfferSchema,
  callAnswerSchema,
  callIceCandidateSchema,
} from '@chatapp/shared';

interface ValidationOptions {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
  headers?: ZodSchema;
  stripUnknown?: boolean;
  abortEarly?: boolean;
}

/**
 * Generic validation middleware factory
 */
export const validate = (options: ValidationOptions) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const {
        body: bodySchema,
        query: querySchema,
        params: paramsSchema,
        headers: headersSchema,
        stripUnknown = true,
        abortEarly = false,
      } = options;

      // Validate request body
      if (bodySchema) {
        req.body = await bodySchema.parseAsync(req.body);
      }

      // Validate query parameters
      if (querySchema) {
        req.query = await querySchema.parseAsync(req.query);
      }

      // Validate route parameters
      if (paramsSchema) {
        req.params = await paramsSchema.parseAsync(req.params);
      }

      // Validate headers
      if (headersSchema) {
        req.headers = await headersSchema.parseAsync(req.headers);
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const validationErrors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));

        logger.warn('Validation failed:', {
          url: req.url,
          method: req.method,
          errors: validationErrors,
        });

        return next(
          ApiError.badRequest('Validation failed', validationErrors)
        );
      }

      next(error);
    }
  };
};

/**
 * Validate request body only
 */
export const validateBody = (schema: ZodSchema) => {
  return validate({ body: schema });
};

/**
 * Validate query parameters only
 */
export const validateQuery = (schema: ZodSchema) => {
  return validate({ query: schema });
};

/**
 * Validate route parameters only
 */
export const validateParams = (schema: ZodSchema) => {
  return validate({ params: schema });
};

// Authentication validation middlewares
export const validateLogin = validateBody(loginSchema);
export const validateRegister = validateBody(registerSchema);
export const validateUpdateProfile = validateBody(updateProfileSchema);

// Message validation middlewares
export const validateSendMessage = validateBody(sendMessageSchema);
export const validateEditMessage = validateBody(editMessageSchema);
export const validateReactToMessage = validateBody(reactToMessageSchema);
export const validateMarkMessageRead = validateBody(markMessageReadSchema);

// Group validation middlewares
export const validateCreateGroup = validateBody(createGroupSchema);
export const validateUpdateGroup = validateBody(updateGroupSchema);
export const validateAddGroupMember = validateBody(addGroupMemberSchema);
export const validateRemoveGroupMember = validateBody(removeGroupMemberSchema);
export const validateUpdateMemberRole = validateBody(updateMemberRoleSchema);

// Search and pagination validation middlewares
export const validateSearch = validateQuery(searchSchema);
export const validatePagination = validateQuery(paginationSchema);

// File upload validation middleware
export const validateFileUpload = validateBody(fileUploadSchema);

// Notification validation middleware
export const validateMarkNotificationRead = validateBody(markNotificationReadSchema);

// Socket event validation middlewares
export const validateTypingEvent = validateBody(typingEventSchema);
export const validatePresenceUpdate = validateBody(presenceUpdateSchema);
export const validateJoinConversation = validateBody(joinConversationSchema);

// Call validation middlewares
export const validateCallOffer = validateBody(callOfferSchema);
export const validateCallAnswer = validateBody(callAnswerSchema);
export const validateCallIceCandidate = validateBody(callIceCandidateSchema);

/**
 * Custom validation schemas for common patterns
 */
import { z } from 'zod';

// ID validation schemas
export const idParamSchema = z.object({
  id: z.string().cuid('Invalid ID format'),
});

export const userIdParamSchema = z.object({
  userId: z.string().cuid('Invalid user ID format'),
});

export const conversationIdParamSchema = z.object({
  conversationId: z.string().cuid('Invalid conversation ID format'),
});

export const messageIdParamSchema = z.object({
  messageId: z.string().cuid('Invalid message ID format'),
});

export const groupIdParamSchema = z.object({
  groupId: z.string().cuid('Invalid group ID format'),
});

export const notificationIdParamSchema = z.object({
  notificationId: z.string().cuid('Invalid notification ID format'),
});

// Common validation middlewares for route parameters
export const validateIdParam = validateParams(idParamSchema);
export const validateUserIdParam = validateParams(userIdParamSchema);
export const validateConversationIdParam = validateParams(conversationIdParamSchema);
export const validateMessageIdParam = validateParams(messageIdParamSchema);
export const validateGroupIdParam = validateParams(groupIdParamSchema);
export const validateNotificationIdParam = validateParams(notificationIdParamSchema);

/**
 * Socket event validation helper
 */
export const validateSocketEvent = <T>(schema: ZodSchema<T>) => {
  return (data: unknown): T => {
    try {
      return schema.parse(data);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationErrors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));

        logger.warn('Socket event validation failed:', {
          errors: validationErrors,
          data,
        });

        throw new Error(`Validation failed: ${validationErrors.map(e => e.message).join(', ')}`);
      }
      throw error;
    }
  };
};

/**
 * Async socket event validation helper
 */
export const validateSocketEventAsync = <T>(schema: ZodSchema<T>) => {
  return async (data: unknown): Promise<T> => {
    try {
      return await schema.parseAsync(data);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationErrors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));

        logger.warn('Socket event validation failed:', {
          errors: validationErrors,
          data,
        });

        throw new Error(`Validation failed: ${validationErrors.map(e => e.message).join(', ')}`);
      }
      throw error;
    }
  };
};

/**
 * Validation middleware for file uploads with additional checks
 */
export const validateFileUploadRequest = (options: {
  maxSize?: number;
  allowedTypes?: string[];
  required?: boolean;
} = {}) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const {
      maxSize = 10 * 1024 * 1024, // 10MB default
      allowedTypes = [],
      required = false,
    } = options;

    // Check if file is required
    if (required && (!req.file && !req.files)) {
      return next(ApiError.badRequest('File is required'));
    }

    // If no file provided and not required, continue
    if (!req.file && !req.files) {
      return next();
    }

    const files = req.files ? (Array.isArray(req.files) ? req.files : [req.file]) : [req.file];

    for (const file of files) {
      if (!file) continue;

      // Check file size
      if (file.size > maxSize) {
        return next(
          ApiError.badRequest(`File too large. Maximum size is ${maxSize / (1024 * 1024)}MB`)
        );
      }

      // Check file type
      if (allowedTypes.length > 0 && !allowedTypes.includes(file.mimetype)) {
        return next(
          ApiError.badRequest(`Invalid file type. Allowed types: ${allowedTypes.join(', ')}`)
        );
      }
    }

    next();
  };
};

/**
 * Validation middleware for image uploads
 */
export const validateImageUpload = validateFileUploadRequest({
  maxSize: 5 * 1024 * 1024, // 5MB
  allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
});

/**
 * Validation middleware for document uploads
 */
export const validateDocumentUpload = validateFileUploadRequest({
  maxSize: 10 * 1024 * 1024, // 10MB
  allowedTypes: [
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
});

/**
 * Validation middleware for audio uploads
 */
export const validateAudioUpload = validateFileUploadRequest({
  maxSize: 20 * 1024 * 1024, // 20MB
  allowedTypes: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/aac'],
});

/**
 * Validation middleware for video uploads
 */
export const validateVideoUpload = validateFileUploadRequest({
  maxSize: 50 * 1024 * 1024, // 50MB
  allowedTypes: ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'],
});

/**
 * Sanitization helpers
 */
export const sanitizeInput = {
  /**
   * Remove HTML tags and dangerous characters
   */
  html: (input: string): string => {
    return input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<[^>]*>/g, '')
      .trim();
  },

  /**
   * Sanitize SQL injection attempts
   */
  sql: (input: string): string => {
    return input
      .replace(/['";\\]/g, '')
      .replace(/\b(DROP|DELETE|INSERT|UPDATE|SELECT|UNION|ALTER|CREATE)\b/gi, '')
      .trim();
  },

  /**
   * Sanitize XSS attempts
   */
  xss: (input: string): string => {
    return input
      .replace(/[<>'"&]/g, (char) => {
        const entities: { [key: string]: string } = {
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#x27;',
          '&': '&amp;',
        };
        return entities[char] || char;
      });
  },
};

/**
 * Input sanitization middleware
 */
export const sanitizeRequest = (req: Request, res: Response, next: NextFunction): void => {
  const sanitizeObject = (obj: any): any => {
    if (typeof obj === 'string') {
      return sanitizeInput.xss(obj);
    }
    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    }
    if (obj && typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitizeObject(value);
      }
      return sanitized;
    }
    return obj;
  };

  // Sanitize request body
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }

  // Sanitize query parameters
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }

  next();
};

/**
 * Rate limiting validation for specific endpoints
 */
export const validateRateLimit = (options: {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: Request) => string;
}) => {
  const requests = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const {
      windowMs,
      maxRequests,
      keyGenerator = (req) => req.ip || 'unknown',
    } = options;

    const key = keyGenerator(req);
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
    if (requestData.count > maxRequests) {
      return next(
        ApiError.tooManyRequests(
          `Too many requests. Limit: ${maxRequests} per ${windowMs}ms`
        )
      );
    }

    next();
  };
};
