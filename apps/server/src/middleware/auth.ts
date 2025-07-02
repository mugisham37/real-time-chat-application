import jwt, { type SignOptions } from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import type { Socket } from 'socket.io';
import { config } from '../config';
import { getRedisManager } from '../config/redis';
import { logger } from '../utils/logger';
import { ApiError } from './errorHandler';
import { parseJWTExpiry, createJWTSignOptions } from '../config/jwt';

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
        role?: string;
        permissions?: string[];
        sessionId?: string;
        lastActivity: Date;
        isOnline: boolean;
        lastSeen: string;
        createdAt: string;
        deviceInfo?: {
          userAgent: string;
          ip: string;
          fingerprint: string;
        };
      };
      session?: {
        id: string;
        userId: string;
        createdAt: Date;
        lastActivity: Date;
        isValid: boolean;
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

// JWT Token types
interface JWTPayload {
  userId: string;
  email: string;
  username: string;
  role?: string;
  permissions?: string[];
  sessionId?: string;
  iat: number;
  exp: number;
  iss?: string;
  aud?: string;
}

interface RefreshTokenPayload {
  userId: string;
  sessionId: string;
  tokenVersion: number;
  iat: number;
  exp: number;
}

// Token extraction utilities
const extractTokenFromHeader = (authHeader: string): string | null => {
  if (!authHeader) return null;
  
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }
  
  return parts[1];
};

const extractTokenFromCookie = (req: Request): string | null => {
  return req.cookies?.accessToken || null;
};

const extractTokenFromQuery = (req: Request): string | null => {
  return req.query?.token as string || null;
};

// Token validation
const validateToken = async (token: string): Promise<JWTPayload> => {
  try {
    const jwtSecret = process.env.JWT_SECRET || config.jwt?.secret;
    if (!jwtSecret) {
      logger.error('JWT_SECRET environment variable is not set');
      throw ApiError.unauthorized('Authentication configuration error');
    }

    const decoded = jwt.verify(token, jwtSecret) as JWTPayload;
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw ApiError.unauthorized('Token expired');
    } else if (error instanceof jwt.JsonWebTokenError) {
      throw ApiError.unauthorized('Invalid token');
    } else {
      throw ApiError.unauthorized('Token validation failed');
    }
  }
};

// Session validation
const validateSession = async (sessionId: string, userId: string): Promise<boolean> => {
  if (!sessionId) return true; // Skip session validation if no sessionId
  
  try {
    const redis = getRedisManager();
    const sessionKey = `session:${sessionId}`;
    const sessionData = await redis.getJSON(sessionKey);
    
    if (!sessionData) {
      return false;
    }
    
    // Check if session belongs to the user
    if (sessionData.userId !== userId) {
      return false;
    }
    
    // Check if session is still valid
    if (sessionData.isRevoked || sessionData.expiresAt < new Date()) {
      return false;
    }
    
    // Update last activity
    sessionData.lastActivity = new Date();
    const ttl = config.jwt?.expiresIn || '7d';
    await redis.setJSON(sessionKey, sessionData, typeof ttl === 'string' ? 3600 : ttl);
    
    return true;
  } catch (error) {
    logger.error('Session validation error:', error);
    return false;
  }
};

// Blacklist check
const isTokenBlacklisted = async (token: string): Promise<boolean> => {
  try {
    const redis = getRedisManager();
    const blacklistKey = `blacklist:${token}`;
    const isBlacklisted = await redis.exists(blacklistKey);
    return isBlacklisted;
  } catch (error) {
    logger.error('Token blacklist check error:', error);
    return false;
  }
};

// Device fingerprinting
const generateDeviceFingerprint = (req: Request): string => {
  const components = [
    req.get('User-Agent') || '',
    req.get('Accept-Language') || '',
    req.get('Accept-Encoding') || '',
    req.ip || '',
  ];
  
  return Buffer.from(components.join('|')).toString('base64');
};

// Main authentication middleware
export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Extract token from various sources
    let token = extractTokenFromHeader(req.get('Authorization') || '');
    
    if (!token) {
      token = extractTokenFromCookie(req);
    }
    
    if (!token) {
      token = extractTokenFromQuery(req);
    }
    
    if (!token) {
      throw ApiError.unauthorized('No authentication token provided');
    }
    
    // Check if token is blacklisted
    if (await isTokenBlacklisted(token)) {
      throw ApiError.unauthorized('Token has been revoked');
    }
    
    // Validate token
    const payload = await validateToken(token);
    
    // Validate session if sessionId exists
    if (payload.sessionId) {
      const isSessionValid = await validateSession(payload.sessionId, payload.userId);
      if (!isSessionValid) {
        throw ApiError.unauthorized('Session is invalid or expired');
      }
    }
    
    // Generate device fingerprint
    const deviceFingerprint = generateDeviceFingerprint(req);
    
    // Attach user information to request
    req.user = {
      id: payload.userId,
      email: payload.email,
      username: payload.username,
      role: payload.role,
      permissions: payload.permissions,
      sessionId: payload.sessionId,
      lastActivity: new Date(),
      isOnline: true,
      lastSeen: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      deviceInfo: {
        userAgent: req.get('User-Agent') || '',
        ip: req.ip || '',
        fingerprint: deviceFingerprint,
      },
    };
    
    // Log successful authentication
    logger.debug('User authenticated successfully', {
      userId: payload.userId,
      sessionId: payload.sessionId,
      ip: req.ip,
    });
    
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
    } else {
      logger.error('Authentication error:', error);
      next(ApiError.unauthorized('Authentication failed'));
    }
  }
};

// Optional authentication (doesn't throw if no token)
export const optionalAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.split(' ')[1] 
      : null;

    if (!token) {
      return next();
    }

    const payload = await validateToken(token);

    req.user = {
      id: payload.userId,
      email: payload.email,
      username: payload.username,
      role: payload.role,
      permissions: payload.permissions,
      sessionId: payload.sessionId,
      lastActivity: new Date(),
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

// Socket.IO authentication middleware
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

    const payload = await validateToken(token);

    // Attach user data to socket
    socket.data.user = {
      id: payload.userId,
      email: payload.email,
      username: payload.username,
      isOnline: true,
      lastSeen: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    logger.info('Socket authenticated successfully', {
      socketId: socket.id,
      userId: payload.userId,
      username: payload.username,
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

// Role-based authorization
export const authorize = (allowedRoles: string | string[]) => {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }
    
    if (req.user.role && !roles.includes(req.user.role)) {
      logger.warn('Unauthorized access attempt', {
        userId: req.user.id,
        userRole: req.user.role,
        requiredRoles: roles,
        path: req.path,
      });
      throw ApiError.forbidden('Insufficient permissions');
    }
    
    next();
  };
};

// Permission-based authorization
export const requirePermission = (permission: string | string[]) => {
  const permissions = Array.isArray(permission) ? permission : [permission];
  
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }
    
    if (!req.user.permissions) {
      throw ApiError.forbidden('No permissions assigned');
    }
    
    const hasPermission = permissions.some(perm => 
      req.user!.permissions!.includes(perm)
    );
    
    if (!hasPermission) {
      logger.warn('Permission denied', {
        userId: req.user.id,
        requiredPermissions: permissions,
        userPermissions: req.user.permissions,
        path: req.path,
      });
      throw ApiError.forbidden('Required permission not granted');
    }
    
    next();
  };
};

// Resource ownership validation
export const requireOwnership = (resourceIdParam: string = 'id') => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }
    
    const resourceId = req.params[resourceIdParam];
    const userId = req.user.id;
    
    // This would typically check database for resource ownership
    // For now, we'll implement a basic check
    try {
      // TODO: Implement actual ownership check with database
      // const resource = await getResourceById(resourceId);
      // if (resource.userId !== userId) {
      //   throw ApiError.forbidden('Access denied: Not resource owner');
      // }
      
      next();
    } catch (error) {
      logger.error('Ownership validation error:', error);
      next(ApiError.forbidden('Access denied'));
    }
  };
};

// Conversation access validation
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

// Group access validation
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

// Admin-only middleware
export const requireAdmin = authorize(['admin', 'super_admin']);

// Moderator or admin middleware
export const requireModerator = authorize(['moderator', 'admin', 'super_admin']);

// User must be verified
export const requireVerified = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    throw ApiError.unauthorized('Authentication required');
  }
  
  // TODO: Check if user is verified in database
  // For now, assume all authenticated users are verified
  next();
};

// Rate limiting per user
export const userRateLimit = (maxRequests: number, windowMs: number) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next();
    }
    
    try {
      const redis = getRedisManager();
      const key = `user_rate_limit:${req.user.id}`;
      const current = await redis.incr(key);
      
      if (current === 1) {
        await redis.client.expire(key, Math.ceil(windowMs / 1000));
      }
      
      if (current > maxRequests) {
        logger.warn('User rate limit exceeded', {
          userId: req.user.id,
          attempts: current,
          path: req.path,
        });
        throw ApiError.tooManyRequests('User rate limit exceeded');
      }
      
      next();
    } catch (error) {
      if (error instanceof ApiError) {
        next(error);
      } else {
        logger.error('User rate limit error:', error);
        next();
      }
    }
  };
};

// Session management
export const createSession = async (userId: string, deviceInfo: any): Promise<string> => {
  try {
    const sessionId = generateSessionId();
    const redis = getRedisManager();
    
    const sessionData = {
      id: sessionId,
      userId,
      createdAt: new Date(),
      lastActivity: new Date(),
      deviceInfo,
      isValid: true,
      isRevoked: false,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    };
    
    const sessionKey = `session:${sessionId}`;
    await redis.setJSON(sessionKey, sessionData, 7 * 24 * 60 * 60); // 7 days in seconds
    
    return sessionId;
  } catch (error) {
    logger.error('Session creation error:', error);
    throw new Error('Failed to create session');
  }
};

export const revokeSession = async (sessionId: string): Promise<void> => {
  try {
    const redis = getRedisManager();
    const sessionKey = `session:${sessionId}`;
    await redis.del(sessionKey);
  } catch (error) {
    logger.error('Session revocation error:', error);
  }
};

export const revokeAllUserSessions = async (userId: string): Promise<void> => {
  try {
    const redis = getRedisManager();
    const pattern = `session:*`;
    const keys = await redis.client.keys(pattern);
    
    for (const key of keys) {
      const sessionData = await redis.getJSON(key);
      if (sessionData && sessionData.userId === userId) {
        await redis.del(key);
      }
    }
  } catch (error) {
    logger.error('Bulk session revocation error:', error);
  }
};


// Token generation utilities
export const generateToken = (payload: {
  userId: string;
  email: string;
  username: string;
  role?: string;
  permissions?: string[];
  sessionId?: string;
}): string => {
  const jwtSecret = process.env.JWT_SECRET || config.jwt?.secret;

  if (!jwtSecret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }

  const options = createJWTSignOptions({
    expiresIn: process.env.JWT_EXPIRES_IN || config.jwt?.expiresIn || '7d',
    issuer: config.jwt?.issuer,
    audience: config.jwt?.audience,
    algorithm: 'HS256',
  });

  return jwt.sign(payload, jwtSecret, options);
};

export const generateRefreshToken = (payload: Omit<RefreshTokenPayload, 'iat' | 'exp'>): string => {
  const jwtSecret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || config.jwt?.refreshSecret;

  if (!jwtSecret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }

  const options = createJWTSignOptions({
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || config.jwt?.refreshExpiresIn || '30d',
    issuer: config.jwt?.issuer,
    audience: config.jwt?.audience,
    algorithm: 'HS256',
  });

  return jwt.sign(payload, jwtSecret, options);
};

// Utility functions
const generateSessionId = (): string => {
  return require('crypto').randomBytes(32).toString('hex');
};

// Token blacklisting
export const blacklistToken = async (token: string): Promise<void> => {
  try {
    const decoded = jwt.decode(token) as JWTPayload;
    if (!decoded || !decoded.exp) return;
    
    const redis = getRedisManager();
    const blacklistKey = `blacklist:${token}`;
    const ttl = decoded.exp - Math.floor(Date.now() / 1000);
    
    if (ttl > 0) {
      await redis.set(blacklistKey, 'true', ttl);
    }
  } catch (error) {
    logger.error('Token blacklisting error:', error);
  }
};

// Refresh token validation
export const validateRefreshToken = async (token: string): Promise<RefreshTokenPayload> => {
  try {
    const jwtSecret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || config.jwt?.refreshSecret;

    if (!jwtSecret) {
      throw new Error('JWT_SECRET environment variable is not set');
    }

    const decoded = jwt.verify(token, jwtSecret) as RefreshTokenPayload;
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw ApiError.unauthorized('Refresh token expired');
    } else if (error instanceof jwt.JsonWebTokenError) {
      throw ApiError.unauthorized('Invalid refresh token');
    } else {
      throw ApiError.unauthorized('Refresh token validation failed');
    }
  }
};

// Export all authentication utilities
export default {
  authenticate,
  optionalAuth,
  authenticateSocket,
  authorize,
  requirePermission,
  requireOwnership,
  requireConversationAccess,
  requireGroupAccess,
  requireAdmin,
  requireModerator,
  requireVerified,
  userRateLimit,
  createSession,
  revokeSession,
  revokeAllUserSessions,
  generateToken,
  generateRefreshToken,
  blacklistToken,
  validateRefreshToken,
};
