import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';
import { ERROR_CODES } from '@chatapp/shared';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
  errors?: any[];
}

export class ApiError extends Error implements AppError {
  public statusCode: number;
  public code: string;
  public details?: any;
  public errors?: any[];

  constructor(
    statusCode: number,
    message: string,
    code?: string,
    details?: any,
    errors?: any[]
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code || ERROR_CODES.INTERNAL_SERVER_ERROR;
    this.details = details;
    this.errors = errors;

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, errors?: any[]): ApiError {
    return new ApiError(400, message, ERROR_CODES.VALIDATION_ERROR, undefined, errors);
  }

  static unauthorized(message: string = 'Unauthorized'): ApiError {
    return new ApiError(401, message, ERROR_CODES.UNAUTHORIZED);
  }

  static forbidden(message: string = 'Forbidden'): ApiError {
    return new ApiError(403, message, ERROR_CODES.INSUFFICIENT_PERMISSIONS);
  }

  static notFound(message: string = 'Resource not found'): ApiError {
    return new ApiError(404, message, ERROR_CODES.USER_NOT_FOUND);
  }

  static conflict(message: string, code?: string): ApiError {
    return new ApiError(409, message, code || ERROR_CODES.EMAIL_ALREADY_EXISTS);
  }

  static tooManyRequests(message: string = 'Too many requests'): ApiError {
    return new ApiError(429, message, ERROR_CODES.RATE_LIMIT_EXCEEDED);
  }

  static internal(message: string = 'Internal server error'): ApiError {
    return new ApiError(500, message, ERROR_CODES.INTERNAL_SERVER_ERROR);
  }
}

export function errorHandler(
  error: AppError | Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Log the error with context
  logger.error('Error occurred:', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: (req as any).user?.id,
    timestamp: new Date().toISOString(),
  });

  let statusCode = 500;
  let code: string = ERROR_CODES.INTERNAL_SERVER_ERROR;
  let message = 'Internal server error';
  let details: any = undefined;
  let errors: any[] = [];

  // Handle ApiError instances
  if (error instanceof ApiError) {
    statusCode = error.statusCode;
    code = error.code;
    message = error.message;
    details = error.details;
    errors = error.errors || [];
  }
  // Handle Zod validation errors
  else if (error instanceof ZodError) {
    statusCode = 400;
    code = ERROR_CODES.VALIDATION_ERROR;
    message = 'Validation failed';
    errors = error.errors.map((err) => ({
      field: err.path.join('.'),
      message: err.message,
      code: err.code,
    }));
  }
  // Handle JWT errors
  else if (error.name === 'JsonWebTokenError') {
    statusCode = 401;
    code = ERROR_CODES.TOKEN_INVALID;
    message = 'Invalid token';
  }
  else if (error.name === 'TokenExpiredError') {
    statusCode = 401;
    code = ERROR_CODES.TOKEN_EXPIRED;
    message = 'Token expired';
  }
  else if (error.name === 'NotBeforeError') {
    statusCode = 401;
    code = ERROR_CODES.TOKEN_INVALID;
    message = 'Token not active';
  }
  // Handle Prisma errors
  else if (error.name === 'PrismaClientKnownRequestError') {
    const prismaError = error as any;
    statusCode = 400;
    code = ERROR_CODES.DATABASE_ERROR;
    
    // Handle specific Prisma error codes
    switch (prismaError.code) {
      case 'P2002':
        statusCode = 409;
        code = ERROR_CODES.EMAIL_ALREADY_EXISTS;
        message = 'Resource already exists';
        break;
      case 'P2025':
        statusCode = 404;
        code = ERROR_CODES.USER_NOT_FOUND;
        message = 'Resource not found';
        break;
      default:
        message = 'Database operation failed';
    }
  }
  else if (error.name === 'PrismaClientUnknownRequestError') {
    statusCode = 500;
    code = ERROR_CODES.DATABASE_ERROR;
    message = 'Database error occurred';
  }
  else if (error.name === 'PrismaClientValidationError') {
    statusCode = 400;
    code = ERROR_CODES.VALIDATION_ERROR;
    message = 'Invalid database query';
  }
  // Handle Multer errors
  else if (error.name === 'MulterError') {
    const multerError = error as any;
    statusCode = 400;
    
    switch (multerError.code) {
      case 'LIMIT_FILE_SIZE':
        code = ERROR_CODES.FILE_TOO_LARGE;
        message = 'File too large';
        break;
      case 'LIMIT_FILE_COUNT':
        code = ERROR_CODES.VALIDATION_ERROR;
        message = 'Too many files';
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        code = ERROR_CODES.INVALID_FILE_TYPE;
        message = 'Unexpected file field';
        break;
      default:
        code = ERROR_CODES.UPLOAD_FAILED;
        message = 'File upload failed';
    }
  }
  // Handle other known error types
  else if (error.name === 'ValidationError') {
    statusCode = 400;
    code = ERROR_CODES.VALIDATION_ERROR;
    message = 'Validation failed';
  }
  else if (error.name === 'CastError') {
    statusCode = 400;
    code = ERROR_CODES.INVALID_INPUT;
    message = 'Invalid ID format';
  }
  // Handle generic errors
  else if ((error as AppError).statusCode) {
    const appError = error as AppError;
    statusCode = appError.statusCode || 500;
    code = appError.code || ERROR_CODES.INTERNAL_SERVER_ERROR;
    message = appError.message;
    details = appError.details;
  }

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  const responseDetails = isDevelopment ? details : undefined;
  const stack = isDevelopment ? error.stack : undefined;

  // Send error response
  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      ...(errors.length > 0 && { errors }),
      ...(responseDetails && { details: responseDetails }),
      ...(stack && { stack }),
    },
  });
}

export function createError(
  message: string,
  statusCode: number = 500,
  code?: string,
  details?: any
): AppError {
  const error = new Error(message) as AppError;
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  return error;
}

// Async error handler wrapper
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Socket.IO error handler
export function handleSocketError(error: Error, socket: any): void {
  logger.error('Socket error occurred:', {
    error: error.message,
    stack: error.stack,
    socketId: socket.id,
    userId: socket.data?.user?.id,
    timestamp: new Date().toISOString(),
  });

  let code: string = ERROR_CODES.INTERNAL_SERVER_ERROR;
  let message = 'Internal server error';

  if (error instanceof ApiError) {
    code = error.code;
    message = error.message;
  } else if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
    code = ERROR_CODES.UNAUTHORIZED;
    message = 'Authentication failed';
  }

  socket.emit('error', {
    code,
    message,
    timestamp: new Date().toISOString(),
  });
}
