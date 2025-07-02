import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { ERROR_CODES } from '@chatapp/shared';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
}

export function errorHandler(
  error: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) {
  logger.error('Error occurred:', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });

  // Default error response
  let statusCode = error.statusCode || 500;
  let code = error.code || ERROR_CODES.INTERNAL_SERVER_ERROR;
  let message = error.message || 'Internal server error';

  // Handle specific error types
  if (error.name === 'ValidationError') {
    statusCode = 400;
    code = ERROR_CODES.VALIDATION_ERROR;
    message = 'Validation failed';
  }

  if (error.name === 'UnauthorizedError' || error.name === 'JsonWebTokenError') {
    statusCode = 401;
    code = ERROR_CODES.UNAUTHORIZED;
    message = 'Unauthorized';
  }

  if (error.name === 'TokenExpiredError') {
    statusCode = 401;
    code = ERROR_CODES.TOKEN_EXPIRED;
    message = 'Token expired';
  }

  // Prisma errors
  if (error.name === 'PrismaClientKnownRequestError') {
    statusCode = 400;
    code = ERROR_CODES.DATABASE_ERROR;
    message = 'Database operation failed';
  }

  // Don't leak error details in production
  const details = process.env.NODE_ENV === 'development' ? error.details : undefined;

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      details,
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
