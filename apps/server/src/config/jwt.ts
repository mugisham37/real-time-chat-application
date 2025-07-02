import { logger } from '../utils/logger';

/**
 * Type-safe JWT configuration utilities
 */

/**
 * Parse and validate JWT expiry values to ensure compatibility with jsonwebtoken library
 * @param value - The expiry value from environment or config
 * @returns A valid string format for JWT expiresIn option
 */
export const parseJWTExpiry = (value: string | number | undefined): string => {
  if (!value) {
    logger.warn('JWT expiry value is undefined, using default: 7d');
    return '7d';
  }
  
  // If it's a number, convert to string (seconds)
  if (typeof value === 'number') {
    if (value <= 0) {
      logger.warn(`Invalid JWT expiry number: ${value}, using default: 7d`);
      return '7d';
    }
    return value.toString();
  }
  
  if (typeof value === 'string') {
    // Validate format: numbers with optional time unit (s, m, h, d, w, y)
    // Examples: "15m", "7d", "24h", "3600" (seconds)
    if (/^\d+[smhdwy]?$/.test(value.trim())) {
      return value.trim();
    }
    
    // Handle special cases like "1 hour", "30 minutes" etc.
    const normalized = value.toLowerCase().trim();
    const timeUnitMap: Record<string, string> = {
      'second': 's',
      'seconds': 's',
      'minute': 'm',
      'minutes': 'm',
      'hour': 'h',
      'hours': 'h',
      'day': 'd',
      'days': 'd',
      'week': 'w',
      'weeks': 'w',
      'year': 'y',
      'years': 'y',
    };
    
    // Try to parse formats like "15 minutes", "1 hour", etc.
    const match = normalized.match(/^(\d+)\s*(second|seconds|minute|minutes|hour|hours|day|days|week|weeks|year|years)$/);
    if (match) {
      const [, number, unit] = match;
      const shortUnit = timeUnitMap[unit];
      if (shortUnit) {
        return `${number}${shortUnit}`;
      }
    }
    
    logger.warn(`Invalid JWT expiry format: ${value}, using default: 7d`);
    return '7d';
  }
  
  logger.warn(`Unexpected JWT expiry type: ${typeof value}, using default: 7d`);
  return '7d';
};

/**
 * Validate JWT expiry value format
 * @param value - The expiry value to validate
 * @returns True if valid, false otherwise
 */
export const isValidJWTExpiry = (value: string): boolean => {
  return /^\d+[smhdwy]?$/.test(value.trim());
};

/**
 * Convert JWT expiry to milliseconds for internal calculations
 * @param expiry - JWT expiry string (e.g., "15m", "7d")
 * @returns Expiry time in milliseconds
 */
export const jwtExpiryToMs = (expiry: string): number => {
  const match = expiry.match(/^(\d+)([smhdwy]?)$/);
  if (!match) {
    logger.warn(`Cannot convert JWT expiry to ms: ${expiry}`);
    return 7 * 24 * 60 * 60 * 1000; // Default 7 days
  }
  
  const [, numberStr, unit] = match;
  const number = parseInt(numberStr, 10);
  
  const multipliers: Record<string, number> = {
    's': 1000,
    'm': 60 * 1000,
    'h': 60 * 60 * 1000,
    'd': 24 * 60 * 60 * 1000,
    'w': 7 * 24 * 60 * 60 * 1000,
    'y': 365 * 24 * 60 * 60 * 1000,
    '': 1000, // Default to seconds if no unit
  };
  
  const multiplier = multipliers[unit] || 1000;
  return number * multiplier;
};

/**
 * Get JWT configuration with proper type safety
 */
export const getJWTConfig = () => {
  const accessExpiry = parseJWTExpiry(process.env.JWT_EXPIRES_IN || '7d');
  const refreshExpiry = parseJWTExpiry(process.env.JWT_REFRESH_EXPIRES_IN || '30d');
  
  return {
    secret: process.env.JWT_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    accessTokenExpiry: accessExpiry,
    refreshTokenExpiry: refreshExpiry,
    algorithm: 'HS256' as const,
    issuer: 'chat-app',
    audience: 'chat-app-users',
  };
};

/**
 * Branded type for JWT expiry to ensure type safety
 */
export type JWTExpiryString = string & { readonly __brand: 'JWTExpiry' };

/**
 * Create a branded JWT expiry string
 */
export const createJWTExpiry = (value: string | number | undefined): JWTExpiryString => {
  return parseJWTExpiry(value) as JWTExpiryString;
};

/**
 * Create JWT SignOptions with proper type safety
 */
export const createJWTSignOptions = (options: {
  expiresIn?: string | number;
  issuer?: string;
  audience?: string;
  algorithm?: 'HS256' | 'HS384' | 'HS512' | 'RS256' | 'RS384' | 'RS512';
}): import('jsonwebtoken').SignOptions => {
  const signOptions: import('jsonwebtoken').SignOptions = {};
  
  if (options.expiresIn !== undefined) {
    // Handle the expiresIn type conversion properly
    if (typeof options.expiresIn === 'number') {
      signOptions.expiresIn = options.expiresIn;
    } else {
      // For string values, we need to ensure they match the expected format
      const parsedExpiry = parseJWTExpiry(options.expiresIn);
      // Convert to number if it's pure digits (seconds), otherwise keep as string
      if (/^\d+$/.test(parsedExpiry)) {
        signOptions.expiresIn = parseInt(parsedExpiry, 10);
      } else {
        signOptions.expiresIn = parsedExpiry as any; // Type assertion for string formats like "7d"
      }
    }
  }
  
  if (options.issuer) {
    signOptions.issuer = options.issuer;
  }
  
  if (options.audience) {
    signOptions.audience = options.audience;
  }
  
  if (options.algorithm) {
    signOptions.algorithm = options.algorithm;
  }
  
  return signOptions;
};
