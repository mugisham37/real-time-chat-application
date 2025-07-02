import { z } from 'zod';
import { ApiError } from './apiError';
import { logger } from './logger';

/**
 * Common validation schemas
 */
export const commonSchemas = {
  // Basic types
  id: z.string().uuid('Invalid ID format'),
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128, 'Password too long'),
  username: z.string().min(3, 'Username must be at least 3 characters').max(30, 'Username too long')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens'),
  
  // Pagination
  page: z.coerce.number().int().min(1, 'Page must be at least 1').default(1),
  limit: z.coerce.number().int().min(1, 'Limit must be at least 1').max(100, 'Limit cannot exceed 100').default(20),
  
  // Dates
  dateString: z.string().datetime('Invalid date format'),
  timestamp: z.coerce.number().int().positive('Invalid timestamp'),
  
  // Text content
  messageContent: z.string().min(1, 'Message cannot be empty').max(10000, 'Message too long'),
  groupName: z.string().min(1, 'Group name cannot be empty').max(100, 'Group name too long'),
  groupDescription: z.string().max(500, 'Group description too long').optional(),
  
  // File validation
  fileName: z.string().min(1, 'File name cannot be empty').max(255, 'File name too long'),
  mimeType: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9!#$&\-\^_]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-\^_.]*$/, 'Invalid MIME type'),
  fileSize: z.number().int().positive('File size must be positive').max(100 * 1024 * 1024, 'File too large'),
  
  // URLs
  url: z.string().url('Invalid URL format'),
  
  // Search
  searchQuery: z.string().min(1, 'Search query cannot be empty').max(100, 'Search query too long'),
  
  // Sort and filter
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  sortBy: z.string().min(1, 'Sort field cannot be empty'),
};

/**
 * User validation schemas
 */
export const userSchemas = {
  register: z.object({
    email: commonSchemas.email,
    password: commonSchemas.password,
    username: commonSchemas.username,
    firstName: z.string().min(1, 'First name is required').max(50, 'First name too long'),
    lastName: z.string().min(1, 'Last name is required').max(50, 'Last name too long'),
  }),
  
  login: z.object({
    email: commonSchemas.email,
    password: z.string().min(1, 'Password is required'),
  }),
  
  updateProfile: z.object({
    firstName: z.string().min(1, 'First name is required').max(50, 'First name too long').optional(),
    lastName: z.string().min(1, 'Last name is required').max(50, 'Last name too long').optional(),
    username: commonSchemas.username.optional(),
    bio: z.string().max(500, 'Bio too long').optional(),
    avatar: z.string().url('Invalid avatar URL').optional(),
  }),
  
  changePassword: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: commonSchemas.password,
    confirmPassword: z.string().min(1, 'Password confirmation is required'),
  }).refine(data => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  }),
  
  forgotPassword: z.object({
    email: commonSchemas.email,
  }),
  
  resetPassword: z.object({
    token: z.string().min(1, 'Reset token is required'),
    password: commonSchemas.password,
    confirmPassword: z.string().min(1, 'Password confirmation is required'),
  }).refine(data => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  }),
};

/**
 * Message validation schemas
 */
export const messageSchemas = {
  send: z.object({
    conversationId: commonSchemas.id,
    content: commonSchemas.messageContent.optional(),
    type: z.enum(['text', 'image', 'video', 'audio', 'file']).default('text'),
    attachments: z.array(z.object({
      url: z.string().url('Invalid attachment URL'),
      type: z.string(),
      size: z.number().int().positive(),
      name: z.string(),
    })).optional(),
    replyToId: commonSchemas.id.optional(),
  }).refine(data => data.content || (data.attachments && data.attachments.length > 0), {
    message: 'Message must have content or attachments',
  }),
  
  update: z.object({
    messageId: commonSchemas.id,
    content: commonSchemas.messageContent,
  }),
  
  delete: z.object({
    messageId: commonSchemas.id,
  }),
  
  react: z.object({
    messageId: commonSchemas.id,
    emoji: z.string().min(1, 'Emoji is required').max(10, 'Emoji too long'),
  }),
  
  markAsRead: z.object({
    conversationId: commonSchemas.id,
    messageIds: z.array(commonSchemas.id).min(1, 'At least one message ID is required'),
  }),
  
  getMessages: z.object({
    conversationId: commonSchemas.id,
    page: commonSchemas.page,
    limit: commonSchemas.limit,
    before: commonSchemas.timestamp.optional(),
    after: commonSchemas.timestamp.optional(),
  }),
};

/**
 * Conversation validation schemas
 */
export const conversationSchemas = {
  create: z.object({
    type: z.enum(['direct', 'group']),
    participantIds: z.array(commonSchemas.id).min(1, 'At least one participant is required'),
    name: z.string().min(1, 'Conversation name is required').max(100, 'Name too long').optional(),
    description: z.string().max(500, 'Description too long').optional(),
  }),
  
  update: z.object({
    conversationId: commonSchemas.id,
    name: z.string().min(1, 'Name cannot be empty').max(100, 'Name too long').optional(),
    description: z.string().max(500, 'Description too long').optional(),
  }),
  
  addParticipants: z.object({
    conversationId: commonSchemas.id,
    participantIds: z.array(commonSchemas.id).min(1, 'At least one participant is required'),
  }),
  
  removeParticipant: z.object({
    conversationId: commonSchemas.id,
    participantId: commonSchemas.id,
  }),
  
  leave: z.object({
    conversationId: commonSchemas.id,
  }),
  
  getConversations: z.object({
    page: commonSchemas.page,
    limit: commonSchemas.limit,
    type: z.enum(['direct', 'group', 'all']).default('all'),
  }),
};

/**
 * Group validation schemas
 */
export const groupSchemas = {
  create: z.object({
    name: commonSchemas.groupName,
    description: commonSchemas.groupDescription,
    isPrivate: z.boolean().default(false),
    memberIds: z.array(commonSchemas.id).optional(),
  }),
  
  update: z.object({
    groupId: commonSchemas.id,
    name: commonSchemas.groupName.optional(),
    description: commonSchemas.groupDescription,
    isPrivate: z.boolean().optional(),
  }),
  
  join: z.object({
    groupId: commonSchemas.id,
    inviteCode: z.string().optional(),
  }),
  
  leave: z.object({
    groupId: commonSchemas.id,
  }),
  
  invite: z.object({
    groupId: commonSchemas.id,
    userIds: z.array(commonSchemas.id).min(1, 'At least one user is required'),
  }),
  
  removeMember: z.object({
    groupId: commonSchemas.id,
    userId: commonSchemas.id,
  }),
  
  updateMemberRole: z.object({
    groupId: commonSchemas.id,
    userId: commonSchemas.id,
    role: z.enum(['member', 'admin', 'owner']),
  }),
};

/**
 * File upload validation schemas
 */
export const fileSchemas = {
  upload: z.object({
    file: z.object({
      originalname: commonSchemas.fileName,
      mimetype: commonSchemas.mimeType,
      size: commonSchemas.fileSize,
    }),
    type: z.enum(['avatar', 'attachment', 'image', 'video', 'audio', 'document']).optional(),
  }),
  
  delete: z.object({
    fileId: commonSchemas.id,
  }),
};

/**
 * Search validation schemas
 */
export const searchSchemas = {
  global: z.object({
    query: commonSchemas.searchQuery,
    type: z.enum(['users', 'groups', 'messages', 'all']).default('all'),
    page: commonSchemas.page,
    limit: commonSchemas.limit,
  }),
  
  messages: z.object({
    query: commonSchemas.searchQuery,
    conversationId: commonSchemas.id.optional(),
    page: commonSchemas.page,
    limit: commonSchemas.limit,
    dateFrom: commonSchemas.dateString.optional(),
    dateTo: commonSchemas.dateString.optional(),
  }),
  
  users: z.object({
    query: commonSchemas.searchQuery,
    page: commonSchemas.page,
    limit: commonSchemas.limit,
  }),
  
  groups: z.object({
    query: commonSchemas.searchQuery,
    page: commonSchemas.page,
    limit: commonSchemas.limit,
    isPrivate: z.boolean().optional(),
  }),
};

/**
 * Call validation schemas
 */
export const callSchemas = {
  initiate: z.object({
    conversationId: commonSchemas.id,
    type: z.enum(['audio', 'video']),
  }),
  
  answer: z.object({
    callId: commonSchemas.id,
    sdp: z.string().min(1, 'SDP is required'),
  }),
  
  reject: z.object({
    callId: commonSchemas.id,
    reason: z.string().max(100, 'Reason too long').optional(),
  }),
  
  end: z.object({
    callId: commonSchemas.id,
  }),
  
  iceCandidate: z.object({
    callId: commonSchemas.id,
    candidate: z.string().min(1, 'ICE candidate is required'),
  }),
};

/**
 * Validation middleware factory
 */
export const validate = (schema: z.ZodSchema) => {
  return (req: any, res: any, next: any) => {
    try {
      // Combine body, query, and params for validation
      const data = {
        ...req.body,
        ...req.query,
        ...req.params,
      };
      
      const result = schema.safeParse(data);
      
      if (!result.success) {
        const errors = result.error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));
        
        throw ApiError.validationError(errors);
      }
      
      // Attach validated data to request
      req.validated = result.data;
      next();
    } catch (error) {
      if (error instanceof ApiError) {
        next(error);
      } else {
        logger.error('Validation middleware error:', error);
        next(ApiError.internal('Validation error'));
      }
    }
  };
};

/**
 * Validate data against schema (for use outside middleware)
 */
export const validateData = <T>(schema: z.ZodSchema<T>, data: unknown): T => {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
        code: err.code,
      }));
      throw ApiError.validationError(errors);
    }
    throw error;
  }
};

/**
 * Sanitization utilities
 */
export const sanitize = {
  /**
   * Sanitize HTML content
   */
  html: (content: string): string => {
    // Basic HTML sanitization - in production, use a library like DOMPurify
    return content
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  },
  
  /**
   * Sanitize SQL input (basic)
   */
  sql: (input: string): string => {
    return input.replace(/['"\\;]/g, '');
  },
  
  /**
   * Sanitize filename
   */
  filename: (filename: string): string => {
    return filename
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_{2,}/g, '_')
      .substring(0, 255);
  },
  
  /**
   * Sanitize search query
   */
  searchQuery: (query: string): string => {
    return query
      .trim()
      .replace(/[<>]/g, '')
      .substring(0, 100);
  },
  
  /**
   * Sanitize user input for display
   */
  userInput: (input: string): string => {
    return input
      .trim()
      .replace(/\s+/g, ' ')
      .substring(0, 1000);
  },
};

/**
 * Custom validation rules
 */
export const customValidators = {
  /**
   * Validate password strength
   */
  passwordStrength: (password: string): { isValid: boolean; score: number; feedback: string[] } => {
    const feedback: string[] = [];
    let score = 0;
    
    // Length check
    if (password.length >= 8) score += 1;
    else feedback.push('Password should be at least 8 characters long');
    
    if (password.length >= 12) score += 1;
    
    // Character variety
    if (/[a-z]/.test(password)) score += 1;
    else feedback.push('Password should contain lowercase letters');
    
    if (/[A-Z]/.test(password)) score += 1;
    else feedback.push('Password should contain uppercase letters');
    
    if (/[0-9]/.test(password)) score += 1;
    else feedback.push('Password should contain numbers');
    
    if (/[^a-zA-Z0-9]/.test(password)) score += 1;
    else feedback.push('Password should contain special characters');
    
    // Common patterns
    if (!/(.)\1{2,}/.test(password)) score += 1;
    else feedback.push('Password should not contain repeated characters');
    
    return {
      isValid: score >= 4,
      score,
      feedback,
    };
  },
  
  /**
   * Validate username availability (placeholder)
   */
  usernameAvailable: async (username: string): Promise<boolean> => {
    // This would check against the database
    // For now, just check basic rules
    return /^[a-zA-Z0-9_-]+$/.test(username) && username.length >= 3 && username.length <= 30;
  },
  
  /**
   * Validate email domain
   */
  emailDomain: (email: string, allowedDomains?: string[]): boolean => {
    if (!allowedDomains) return true;
    
    const domain = email.split('@')[1];
    return allowedDomains.includes(domain);
  },
  
  /**
   * Validate file type
   */
  fileType: (mimetype: string, allowedTypes: string[]): boolean => {
    return allowedTypes.includes(mimetype);
  },
  
  /**
   * Validate image dimensions
   */
  imageDimensions: (width: number, height: number, maxWidth: number, maxHeight: number): boolean => {
    return width <= maxWidth && height <= maxHeight;
  },
};

/**
 * Validation error formatter
 */
export const formatValidationErrors = (errors: z.ZodError): any[] => {
  return errors.errors.map(err => ({
    field: err.path.join('.'),
    message: err.message,
    code: err.code,
    received: 'received' in err ? err.received : undefined,
    expected: 'expected' in err ? err.expected : undefined,
  }));
};

/**
 * Request validation decorator
 */
export const validateRequest = (schema: z.ZodSchema) => {
  return (target: any, propertyName: string, descriptor: PropertyDescriptor) => {
    const method = descriptor.value;
    
    descriptor.value = async function (req: any, res: any, next: any) {
      try {
        const data = {
          ...req.body,
          ...req.query,
          ...req.params,
        };
        
        req.validated = validateData(schema, data);
        return await method.call(this, req, res, next);
      } catch (error) {
        next(error);
      }
    };
  };
};

export default {
  commonSchemas,
  userSchemas,
  messageSchemas,
  conversationSchemas,
  groupSchemas,
  fileSchemas,
  searchSchemas,
  callSchemas,
  validate,
  validateData,
  sanitize,
  customValidators,
  formatValidationErrors,
  validateRequest,
};
