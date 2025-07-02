import type { Request, Response, NextFunction } from 'express';
import type { Socket } from 'socket.io';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { ApiError } from './errorHandler';
import { logger } from '../utils/logger';
import { ERROR_CODES } from '@chatapp/shared';

// Extend Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        username: string;
        firstName?: string;
        lastName?: string;
        avatar?: string;
        isOnline: boolean;
        lastSeen: string;
        createdAt: string;
      };
    }
  }
}

// Extend Socket interface to include user data
interface AuthenticatedSocket extends Socket {
  data: {
    user?: {
      id: string;
      email: string;
      username: string;
      firstName?: string;
      lastName?: string;
      avatar?: string;
      isOnline: boolean;
      lastSeen: string;
      createdAt: string;
    };
  };
}

interface JwtPayload {
  userId: string;
  email: string;
  username: string;
  iat: number;
  exp: number;
}

/**
 * Express middleware for JWT authentication
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.split(' ')[1] 
      : null;

    if (!token) {
      throw ApiError.unauthorized('Authentication token is required');
    }

    // Verify JWT token
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      logger.error('JWT_SECRET environment variable is not set');
      throw ApiError.internal('Authentication configuration error');
    }

    const decoded = jwt.verify(token, jwtSecret) as JwtPayload;

    // TODO: Fetch user from database using repository
    // For now, we'll use the decoded token data
    // In a real implementation, you would:
    // const user = await userRepository.findById(decoded.userId);
    // if (!user) throw ApiError.unauthorized('User not found');

    // Mock user data from token (replace with actual database fetch)
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      username: decoded.username,
      isOnline: true,
      lastSeen: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return next(ApiError.unauthorized('Invalid authentication token'));
    }
    if (error instanceof jwt.TokenExpiredError) {
      return next(ApiError.unauthorized('Authentication token has expired'));
    }
    if (error instanceof jwt.NotBeforeError) {
      return next(ApiError.unauthorized('Authentication token not yet valid'));
    }
    
    next(error);
  }
};

/**
 * Optional authentication middleware - doesn't throw error if no token
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.split(' ')[1] 
      : null;

    if (!token) {
      return next();
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return next();
    }

    const decoded = jwt.verify(token, jwtSecret) as JwtPayload;

    // Mock user data (replace with actual database fetch)
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      username: decoded.username,
      isOnline: true,
      lastSeen: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    next();
  } catch (error) {
    // Silently continue without authentication for optional auth
    next();
  }
};

/**
 * Socket.IO authentication middleware
 */
export const authenticateSocket = async (
  socket: AuthenticatedSocket,
  next: (err?: Error) => void
): Promise<void> => {
  try {
    // Get token from handshake auth or query
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token || typeof token !== 'string') {
      return next(new Error('Authentication token is required'));
    }

    // Verify JWT token
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      logger.error('JWT_SECRET environment variable is not set');
      return next(new Error('Authentication configuration error'));
    }

    const decoded = jwt.verify(token, jwtSecret) as JwtPayload;

    // TODO: Fetch user from database
    // const user = await userRepository.findById(decoded.userId);
    // if (!user) return next(new Error('User not found'));

    // Mock user data (replace with actual database fetch)
    socket.data.user = {
      id: decoded.userId,
      email: decoded.email,
      username: decoded.username,
      isOnline: true,
      lastSeen: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    logger.info('Socket authenticated successfully', {
      socketId: socket.id,
      userId: decoded.userId,
      username: decoded.username,
    });

    next();
  } catch (error) {
    logger.error('Socket authentication failed:', {
      socketId: socket.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    if (error instanceof jwt.JsonWebTokenError) {
      return next(new Error('Invalid authentication token'));
    }
    if (error instanceof jwt.TokenExpiredError) {
      return next(new Error('Authentication token has expired'));
    }
    if (error instanceof jwt.NotBeforeError) {
      return next(new Error('Authentication token not yet valid'));
    }

    next(new Error('Authentication failed'));
  }
};

/**
 * Role-based authorization middleware
 */
export const authorize = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'));
    }

    // TODO: Implement role checking when user roles are available
    // For now, we'll assume all authenticated users are authorized
    // In a real implementation:
    // if (!allowedRoles.includes(req.user.role)) {
    //   return next(ApiError.forbidden('Insufficient permissions'));
    // }

    next();
  };
};

/**
 * Check if user is conversation participant
 */
export const requireConversationAccess = (conversationIdParam: string = 'conversationId') => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        return next(ApiError.unauthorized('Authentication required'));
      }

      const conversationId = req.params[conversationIdParam];
      if (!conversationId) {
        return next(ApiError.badRequest('Conversation ID is required'));
      }

      // TODO: Check if user is participant in conversation
      // const isParticipant = await conversationRepository.isUserParticipant(
      //   conversationId,
      //   req.user.id
      // );
      // if (!isParticipant) {
      //   return next(ApiError.forbidden('Access denied to this conversation'));
      // }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Check if user is group member
 */
export const requireGroupAccess = (groupIdParam: string = 'groupId') => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        return next(ApiError.unauthorized('Authentication required'));
      }

      const groupId = req.params[groupIdParam];
      if (!groupId) {
        return next(ApiError.badRequest('Group ID is required'));
      }

      // TODO: Check if user is member of group
      // const isMember = await groupRepository.isUserMember(groupId, req.user.id);
      // if (!isMember) {
      //   return next(ApiError.forbidden('Access denied to this group'));
      // }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Check if user owns the resource
 */
export const requireOwnership = (userIdParam: string = 'userId') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'));
    }

    const resourceUserId = req.params[userIdParam];
    if (!resourceUserId) {
      return next(ApiError.badRequest('User ID is required'));
    }

    if (req.user.id !== resourceUserId) {
      return next(ApiError.forbidden('Access denied - resource ownership required'));
    }

    next();
  };
};

/**
 * Generate JWT token
 */
export const generateToken = (payload: {
  userId: string;
  email: string;
  username: string;
}): string => {
  const jwtSecret = process.env.JWT_SECRET;
  const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '7d';

  if (!jwtSecret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }

  const options: SignOptions = {
    expiresIn: jwtExpiresIn as string,
  };

  return jwt.sign(
    {
      userId: payload.userId,
      email: payload.email,
      username: payload.username,
    },
    jwtSecret,
    options
  );
};

/**
 * Generate refresh token
 */
export const generateRefreshToken = (userId: string): string => {
  const jwtSecret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
  const refreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

  if (!jwtSecret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }

  const options: SignOptions = {
    expiresIn: refreshExpiresIn as string,
  };

  return jwt.sign(
    { userId, type: 'refresh' },
    jwtSecret,
    options
  );
};

/**
 * Verify refresh token
 */
export const verifyRefreshToken = (token: string): { userId: string } => {
  const jwtSecret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;

  if (!jwtSecret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }

  const decoded = jwt.verify(token, jwtSecret) as any;
  
  if (decoded.type !== 'refresh') {
    throw new Error('Invalid token type');
  }

  return { userId: decoded.userId };
};
