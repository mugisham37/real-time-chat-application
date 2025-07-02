/**
 * Comprehensive Utility Layer for Real-time Chat Application
 * 
 * This module exports all utility functions, classes, and helpers
 * that provide foundational functionality for the chat application.
 * 
 * The utilities are organized into the following categories:
 * - Configuration management
 * - Logging and monitoring
 * - Error handling
 * - Security and encryption
 * - File processing and media handling
 * - Caching
 * - Validation and sanitization
 * - Metrics and analytics
 */

// Core utilities
export * from '../config/index';
export * from './logger';
export * from './apiError';
export * from './encryption';

// Advanced utilities
export * from './mediaProcessor';
export * from './metrics';
export * from './cache';
export * from './validation';

// Default exports for convenience
export { default as config } from '../config/index';
export { default as logger } from './logger';
export { default as ApiError } from './apiError';
export { default as encryption } from './encryption';
export { default as mediaProcessor } from './mediaProcessor';
export { default as metrics } from './metrics';
export { default as cache } from './cache';
export { default as validation } from './validation';

/**
 * Utility helper functions
 */

/**
 * Sleep utility for async operations
 */
export const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Retry utility with exponential backoff
 */
export const retry = async <T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    baseDelay?: number;
    maxDelay?: number;
    backoffFactor?: number;
  } = {}
): Promise<T> => {
  const {
    maxAttempts = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    backoffFactor = 2,
  } = options;

  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxAttempts) {
        throw lastError;
      }
      
      const delay = Math.min(baseDelay * Math.pow(backoffFactor, attempt - 1), maxDelay);
      await sleep(delay);
    }
  }
  
  throw lastError!;
};

/**
 * Debounce utility
 */
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

/**
 * Throttle utility
 */
export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number
): ((...args: Parameters<T>) => void) => {
  let inThrottle: boolean;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

/**
 * Deep clone utility
 */
export const deepClone = <T>(obj: T): T => {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (obj instanceof Date) {
    return new Date(obj.getTime()) as unknown as T;
  }
  
  if (obj instanceof Array) {
    return obj.map(item => deepClone(item)) as unknown as T;
  }
  
  if (typeof obj === 'object') {
    const cloned = {} as T;
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = deepClone(obj[key]);
      }
    }
    return cloned;
  }
  
  return obj;
};

/**
 * Object utility functions
 */
export const objectUtils = {
  /**
   * Pick specific keys from an object
   */
  pick: <T extends Record<string, any>, K extends keyof T>(
    obj: T,
    keys: K[]
  ): Pick<T, K> => {
    const result = {} as Pick<T, K>;
    for (const key of keys) {
      if (key in obj) {
        result[key] = obj[key];
      }
    }
    return result;
  },

  /**
   * Omit specific keys from an object
   */
  omit: <T extends Record<string, any>, K extends keyof T>(
    obj: T,
    keys: K[]
  ): Omit<T, K> => {
    const result = { ...obj };
    for (const key of keys) {
      delete result[key];
    }
    return result;
  },

  /**
   * Check if object is empty
   */
  isEmpty: (obj: Record<string, any>): boolean => {
    return Object.keys(obj).length === 0;
  },

  /**
   * Flatten nested object
   */
  flatten: (obj: Record<string, any>, prefix = ''): Record<string, any> => {
    const flattened: Record<string, any> = {};
    
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const newKey = prefix ? `${prefix}.${key}` : key;
        
        if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
          Object.assign(flattened, objectUtils.flatten(obj[key], newKey));
        } else {
          flattened[newKey] = obj[key];
        }
      }
    }
    
    return flattened;
  },

  /**
   * Deep merge objects
   */
  deepMerge: <T extends Record<string, any>>(target: T, ...sources: Partial<T>[]): T => {
    if (!sources.length) return target;
    const source = sources.shift();
    
    if (source) {
      for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          if (!target[key]) target[key] = {} as any;
          objectUtils.deepMerge(target[key], source[key]);
        } else {
          target[key] = source[key] as any;
        }
      }
    }
    
    return objectUtils.deepMerge(target, ...sources);
  },
};

/**
 * Array utility functions
 */
export const arrayUtils = {
  /**
   * Remove duplicates from array
   */
  unique: <T>(arr: T[]): T[] => {
    return [...new Set(arr)];
  },

  /**
   * Remove duplicates by key
   */
  uniqueBy: <T>(arr: T[], key: keyof T): T[] => {
    const seen = new Set();
    return arr.filter(item => {
      const value = item[key];
      if (seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    });
  },

  /**
   * Group array by key
   */
  groupBy: <T>(arr: T[], key: keyof T): Record<string, T[]> => {
    return arr.reduce((groups, item) => {
      const value = String(item[key]);
      if (!groups[value]) {
        groups[value] = [];
      }
      groups[value].push(item);
      return groups;
    }, {} as Record<string, T[]>);
  },

  /**
   * Chunk array into smaller arrays
   */
  chunk: <T>(arr: T[], size: number): T[][] => {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  },

  /**
   * Shuffle array
   */
  shuffle: <T>(arr: T[]): T[] => {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  },

  /**
   * Get random item from array
   */
  random: <T>(arr: T[]): T | undefined => {
    return arr[Math.floor(Math.random() * arr.length)];
  },
};

/**
 * String utility functions
 */
export const stringUtils = {
  /**
   * Convert string to camelCase
   */
  toCamelCase: (str: string): string => {
    return str.replace(/[-_\s]+(.)?/g, (_, char) => char ? char.toUpperCase() : '');
  },

  /**
   * Convert string to snake_case
   */
  toSnakeCase: (str: string): string => {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`).replace(/^_/, '');
  },

  /**
   * Convert string to kebab-case
   */
  toKebabCase: (str: string): string => {
    return str.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`).replace(/^-/, '');
  },

  /**
   * Capitalize first letter
   */
  capitalize: (str: string): string => {
    return str.charAt(0).toUpperCase() + str.slice(1);
  },

  /**
   * Truncate string with ellipsis
   */
  truncate: (str: string, length: number, suffix = '...'): string => {
    if (str.length <= length) return str;
    return str.substring(0, length - suffix.length) + suffix;
  },

  /**
   * Generate slug from string
   */
  slugify: (str: string): string => {
    return str
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  },

  /**
   * Extract initials from name
   */
  getInitials: (name: string): string => {
    return name
      .split(' ')
      .map(word => word.charAt(0).toUpperCase())
      .join('')
      .substring(0, 2);
  },
};

/**
 * Date utility functions
 */
export const dateUtils = {
  /**
   * Format date to ISO string
   */
  toISOString: (date: Date): string => {
    return date.toISOString();
  },

  /**
   * Check if date is today
   */
  isToday: (date: Date): boolean => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  },

  /**
   * Check if date is yesterday
   */
  isYesterday: (date: Date): boolean => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return date.toDateString() === yesterday.toDateString();
  },

  /**
   * Get relative time string
   */
  getRelativeTime: (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  },

  /**
   * Add days to date
   */
  addDays: (date: Date, days: number): Date => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  },

  /**
   * Start of day
   */
  startOfDay: (date: Date): Date => {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
  },

  /**
   * End of day
   */
  endOfDay: (date: Date): Date => {
    const result = new Date(date);
    result.setHours(23, 59, 59, 999);
    return result;
  },
};

/**
 * Number utility functions
 */
export const numberUtils = {
  /**
   * Format file size
   */
  formatFileSize: (bytes: number): string => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  },

  /**
   * Format number with commas
   */
  formatNumber: (num: number): string => {
    return num.toLocaleString();
  },

  /**
   * Clamp number between min and max
   */
  clamp: (num: number, min: number, max: number): number => {
    return Math.min(Math.max(num, min), max);
  },

  /**
   * Generate random number between min and max
   */
  random: (min: number, max: number): number => {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },

  /**
   * Round to decimal places
   */
  round: (num: number, decimals: number): number => {
    return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
  },
};

/**
 * Environment utilities
 */
export const envUtils = {
  /**
   * Check if running in development
   */
  isDevelopment: (): boolean => {
    return process.env.NODE_ENV === 'development';
  },

  /**
   * Check if running in production
   */
  isProduction: (): boolean => {
    return process.env.NODE_ENV === 'production';
  },

  /**
   * Check if running in test
   */
  isTest: (): boolean => {
    return process.env.NODE_ENV === 'test';
  },

  /**
   * Get environment variable with default
   */
  getEnv: (key: string, defaultValue?: string): string => {
    return process.env[key] || defaultValue || '';
  },

  /**
   * Get required environment variable
   */
  getRequiredEnv: (key: string): string => {
    const value = process.env[key];
    if (!value) {
      throw new Error(`Required environment variable ${key} is not set`);
    }
    return value;
  },
};

/**
 * Export all utilities as a single object for convenience
 */
export const utils = {
  sleep,
  retry,
  debounce,
  throttle,
  deepClone,
  objectUtils,
  arrayUtils,
  stringUtils,
  dateUtils,
  numberUtils,
  envUtils,
};

export default utils;
