import { logger } from './logger';

/**
 * Custom API Error class with enhanced functionality
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly errors: any[];
  public readonly isOperational: boolean;
  public readonly timestamp: string;
  public readonly path?: string;
  public readonly method?: string;
  public readonly ip?: string;
  public readonly userAgent?: string;
  public readonly userId?: string;
  public readonly requestId?: string;
  public readonly code: string;

  constructor(
    statusCode: number,
    message: string,
    errors: any[] = [],
    isOperational = true,
    code?: string,
    context?: {
      path?: string;
      method?: string;
      ip?: string;
      userAgent?: string;
      userId?: string;
      requestId?: string;
    }
  ) {
    super(message);

    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();
    this.code = code || this.getErrorCode(statusCode);
    
    // Request context
    this.path = context?.path;
    this.method = context?.method;
    this.ip = context?.ip;
    this.userAgent = context?.userAgent;
    this.userId = context?.userId;
    this.requestId = context?.requestId;

    // Ensure the name of this error is the same as the class name
    this.name = this.constructor.name;

    // This captures the proper stack trace in Node.js
    Error.captureStackTrace(this, this.constructor);

    // Log the error
    this.logError();
  }

  private getErrorCode(statusCode: number): string {
    const codeMap: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      405: 'METHOD_NOT_ALLOWED',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_SERVER_ERROR',
      502: 'BAD_GATEWAY',
      503: 'SERVICE_UNAVAILABLE',
      504: 'GATEWAY_TIMEOUT',
    };
    return codeMap[statusCode] || 'UNKNOWN_ERROR';
  }

  private logError(): void {
    const errorData = {
      code: this.code,
      statusCode: this.statusCode,
      message: this.message,
      errors: this.errors,
      timestamp: this.timestamp,
      path: this.path,
      method: this.method,
      ip: this.ip,
      userAgent: this.userAgent,
      userId: this.userId,
      requestId: this.requestId,
      stack: this.stack,
    };

    if (this.statusCode >= 500) {
      logger.error('Server Error', errorData);
    } else if (this.statusCode >= 400) {
      logger.warn('Client Error', errorData);
    }
  }

  /**
   * Convert error to JSON response format
   */
  toJSON() {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        statusCode: this.statusCode,
        timestamp: this.timestamp,
        ...(this.errors.length > 0 && { errors: this.errors }),
        ...(this.path && { path: this.path }),
        ...(this.requestId && { requestId: this.requestId }),
      },
    };
  }

  /**
   * Static factory methods for common HTTP errors
   */

  // 400 Bad Request
  static badRequest(message = 'Bad Request', errors: any[] = [], context?: any) {
    return new ApiError(400, message, errors, true, 'BAD_REQUEST', context);
  }

  // 401 Unauthorized
  static unauthorized(message = 'Unauthorized', errors: any[] = [], context?: any) {
    return new ApiError(401, message, errors, true, 'UNAUTHORIZED', context);
  }

  // 403 Forbidden
  static forbidden(message = 'Forbidden', errors: any[] = [], context?: any) {
    return new ApiError(403, message, errors, true, 'FORBIDDEN', context);
  }

  // 404 Not Found
  static notFound(message = 'Resource not found', errors: any[] = [], context?: any) {
    return new ApiError(404, message, errors, true, 'NOT_FOUND', context);
  }

  // 405 Method Not Allowed
  static methodNotAllowed(message = 'Method not allowed', errors: any[] = [], context?: any) {
    return new ApiError(405, message, errors, true, 'METHOD_NOT_ALLOWED', context);
  }

  // 409 Conflict
  static conflict(message = 'Conflict', errors: any[] = [], context?: any) {
    return new ApiError(409, message, errors, true, 'CONFLICT', context);
  }

  // 422 Unprocessable Entity
  static unprocessableEntity(message = 'Unprocessable Entity', errors: any[] = [], context?: any) {
    return new ApiError(422, message, errors, true, 'UNPROCESSABLE_ENTITY', context);
  }

  // 429 Too Many Requests
  static tooManyRequests(message = 'Too many requests', errors: any[] = [], context?: any) {
    return new ApiError(429, message, errors, true, 'TOO_MANY_REQUESTS', context);
  }

  // 500 Internal Server Error
  static internal(message = 'Internal server error', errors: any[] = [], context?: any) {
    return new ApiError(500, message, errors, true, 'INTERNAL_SERVER_ERROR', context);
  }

  // 502 Bad Gateway
  static badGateway(message = 'Bad Gateway', errors: any[] = [], context?: any) {
    return new ApiError(502, message, errors, true, 'BAD_GATEWAY', context);
  }

  // 503 Service Unavailable
  static serviceUnavailable(message = 'Service Unavailable', errors: any[] = [], context?: any) {
    return new ApiError(503, message, errors, true, 'SERVICE_UNAVAILABLE', context);
  }

  // 504 Gateway Timeout
  static gatewayTimeout(message = 'Gateway Timeout', errors: any[] = [], context?: any) {
    return new ApiError(504, message, errors, true, 'GATEWAY_TIMEOUT', context);
  }

  /**
   * Domain-specific error factory methods
   */

  // Authentication errors
  static invalidCredentials(context?: any) {
    return new ApiError(401, 'Invalid email or password', [], true, 'INVALID_CREDENTIALS', context);
  }

  static tokenExpired(context?: any) {
    return new ApiError(401, 'Token has expired', [], true, 'TOKEN_EXPIRED', context);
  }

  static invalidToken(context?: any) {
    return new ApiError(401, 'Invalid or malformed token', [], true, 'INVALID_TOKEN', context);
  }

  static accountLocked(context?: any) {
    return new ApiError(423, 'Account is locked due to too many failed attempts', [], true, 'ACCOUNT_LOCKED', context);
  }

  // Validation errors
  static validationError(errors: any[], context?: any) {
    return new ApiError(422, 'Validation failed', errors, true, 'VALIDATION_ERROR', context);
  }

  static missingRequiredField(field: string, context?: any) {
    return new ApiError(400, `Missing required field: ${field}`, [{ field, message: 'This field is required' }], true, 'MISSING_REQUIRED_FIELD', context);
  }

  static invalidFormat(field: string, expectedFormat: string, context?: any) {
    return new ApiError(400, `Invalid format for field: ${field}`, [{ field, message: `Expected format: ${expectedFormat}` }], true, 'INVALID_FORMAT', context);
  }

  // Resource errors
  static userNotFound(context?: any) {
    return new ApiError(404, 'User not found', [], true, 'USER_NOT_FOUND', context);
  }

  static conversationNotFound(context?: any) {
    return new ApiError(404, 'Conversation not found', [], true, 'CONVERSATION_NOT_FOUND', context);
  }

  static messageNotFound(context?: any) {
    return new ApiError(404, 'Message not found', [], true, 'MESSAGE_NOT_FOUND', context);
  }

  static groupNotFound(context?: any) {
    return new ApiError(404, 'Group not found', [], true, 'GROUP_NOT_FOUND', context);
  }

  // Permission errors
  static insufficientPermissions(context?: any) {
    return new ApiError(403, 'Insufficient permissions to perform this action', [], true, 'INSUFFICIENT_PERMISSIONS', context);
  }

  static notGroupMember(context?: any) {
    return new ApiError(403, 'You are not a member of this group', [], true, 'NOT_GROUP_MEMBER', context);
  }

  static notConversationParticipant(context?: any) {
    return new ApiError(403, 'You are not a participant in this conversation', [], true, 'NOT_CONVERSATION_PARTICIPANT', context);
  }

  // File upload errors
  static fileTooLarge(maxSize: string, context?: any) {
    return new ApiError(413, `File size exceeds maximum allowed size of ${maxSize}`, [], true, 'FILE_TOO_LARGE', context);
  }

  static unsupportedFileType(supportedTypes: string[], context?: any) {
    return new ApiError(415, `Unsupported file type. Supported types: ${supportedTypes.join(', ')}`, [], true, 'UNSUPPORTED_FILE_TYPE', context);
  }

  static uploadFailed(reason?: string, context?: any) {
    return new ApiError(500, `File upload failed${reason ? `: ${reason}` : ''}`, [], true, 'UPLOAD_FAILED', context);
  }

  // Database errors
  static databaseError(operation: string, context?: any) {
    return new ApiError(500, `Database operation failed: ${operation}`, [], false, 'DATABASE_ERROR', context);
  }

  static duplicateEntry(field: string, context?: any) {
    return new ApiError(409, `${field} already exists`, [], true, 'DUPLICATE_ENTRY', context);
  }

  // External service errors
  static externalServiceError(service: string, context?: any) {
    return new ApiError(502, `External service error: ${service}`, [], true, 'EXTERNAL_SERVICE_ERROR', context);
  }

  static emailServiceError(context?: any) {
    return new ApiError(500, 'Failed to send email', [], true, 'EMAIL_SERVICE_ERROR', context);
  }

  // Rate limiting errors
  static rateLimitExceeded(retryAfter?: number, context?: any) {
    const message = retryAfter 
      ? `Rate limit exceeded. Try again in ${retryAfter} seconds.`
      : 'Rate limit exceeded. Please try again later.';
    return new ApiError(429, message, [], true, 'RATE_LIMIT_EXCEEDED', context);
  }

  // WebRTC/Call errors
  static callNotFound(context?: any) {
    return new ApiError(404, 'Call not found', [], true, 'CALL_NOT_FOUND', context);
  }

  static callAlreadyActive(context?: any) {
    return new ApiError(409, 'A call is already active in this conversation', [], true, 'CALL_ALREADY_ACTIVE', context);
  }

  static callConnectionFailed(context?: any) {
    return new ApiError(500, 'Failed to establish call connection', [], true, 'CALL_CONNECTION_FAILED', context);
  }
}

/**
 * Error handler utility functions
 */
export const errorUtils = {
  /**
   * Check if error is operational (expected) or programming error
   */
  isOperationalError: (error: Error): boolean => {
    if (error instanceof ApiError) {
      return error.isOperational;
    }
    return false;
  },

  /**
   * Extract error context from Express request
   */
  getRequestContext: (req: any) => {
    return {
      path: req.path,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user?.id,
      requestId: req.id || req.headers['x-request-id'],
    };
  },

  /**
   * Create error from validation result
   */
  fromValidationErrors: (validationErrors: any[], context?: any) => {
    const errors = validationErrors.map(err => ({
      field: err.path || err.param,
      message: err.msg || err.message,
      value: err.value,
    }));
    return ApiError.validationError(errors, context);
  },

  /**
   * Handle async errors in Express routes
   */
  asyncHandler: (fn: Function) => {
    return (req: any, res: any, next: any) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  },

  /**
   * Convert unknown error to ApiError
   */
  normalizeError: (error: unknown, context?: any): ApiError => {
    if (error instanceof ApiError) {
      return error;
    }

    if (error instanceof Error) {
      return new ApiError(500, error.message, [], false, 'UNKNOWN_ERROR', context);
    }

    return new ApiError(500, 'An unknown error occurred', [], false, 'UNKNOWN_ERROR', context);
  },
};

export default ApiError;
