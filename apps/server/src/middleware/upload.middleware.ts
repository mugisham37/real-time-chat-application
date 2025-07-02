import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import type { Request, Response, NextFunction } from 'express';
import { ApiError } from './errorHandler';
import { logger } from '../utils/logger';
import { FILE_UPLOAD_LIMITS, ALLOWED_FILE_TYPES } from '@chatapp/shared';

// Ensure upload directories exist
const createUploadDirs = () => {
  const dirs = [
    'uploads',
    'uploads/temp',
    'uploads/images',
    'uploads/documents',
    'uploads/audio',
    'uploads/video',
    'uploads/avatars',
    'uploads/group-avatars',
  ];

  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
};

// Initialize upload directories
createUploadDirs();

/**
 * Storage configuration for different file types
 */
const createStorage = (destination: string) => {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, destination);
    },
    filename: (req, file, cb) => {
      const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
      cb(null, uniqueName);
    },
  });
};

/**
 * File filter factory
 */
const createFileFilter = (allowedTypes: string[]) => {
  return (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new ApiError(400, `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`));
    }
  };
};

/**
 * Generic upload middleware factory
 */
const createUploadMiddleware = (options: {
  destination: string;
  allowedTypes: string[];
  maxSize: number;
  maxFiles?: number;
}) => {
  const { destination, allowedTypes, maxSize, maxFiles = 1 } = options;

  const upload = multer({
    storage: createStorage(destination),
    fileFilter: createFileFilter(allowedTypes),
    limits: {
      fileSize: maxSize,
      files: maxFiles,
    },
  });

  return maxFiles === 1 ? upload.single('file') : upload.array('files', maxFiles);
};

/**
 * Error handler for multer errors
 */
export const handleUploadError = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return next(
          ApiError.badRequest(`File too large. Maximum size allowed is ${error.field}`)
        );
      case 'LIMIT_FILE_COUNT':
        return next(
          ApiError.badRequest(`Too many files. Maximum ${error.field} files allowed`)
        );
      case 'LIMIT_UNEXPECTED_FILE':
        return next(
          ApiError.badRequest(`Unexpected file field: ${error.field}`)
        );
      case 'LIMIT_PART_COUNT':
        return next(ApiError.badRequest('Too many parts in multipart form'));
      case 'LIMIT_FIELD_KEY':
        return next(ApiError.badRequest('Field name too long'));
      case 'LIMIT_FIELD_VALUE':
        return next(ApiError.badRequest('Field value too long'));
      case 'LIMIT_FIELD_COUNT':
        return next(ApiError.badRequest('Too many fields'));
      default:
        return next(ApiError.badRequest(`Upload error: ${error.message}`));
    }
  }

  if (error instanceof ApiError) {
    return next(error);
  }

  next(error);
};

/**
 * Image upload middleware
 */
export const uploadImage = createUploadMiddleware({
  destination: 'uploads/images',
  allowedTypes: ALLOWED_FILE_TYPES.IMAGES,
  maxSize: FILE_UPLOAD_LIMITS.IMAGE.maxSize,
});

/**
 * Multiple images upload middleware
 */
export const uploadImages = createUploadMiddleware({
  destination: 'uploads/images',
  allowedTypes: ALLOWED_FILE_TYPES.IMAGES,
  maxSize: FILE_UPLOAD_LIMITS.IMAGE.maxSize,
  maxFiles: 10,
});

/**
 * Document upload middleware
 */
export const uploadDocument = createUploadMiddleware({
  destination: 'uploads/documents',
  allowedTypes: ALLOWED_FILE_TYPES.DOCUMENTS,
  maxSize: FILE_UPLOAD_LIMITS.DOCUMENT.maxSize,
});

/**
 * Audio upload middleware
 */
export const uploadAudio = createUploadMiddleware({
  destination: 'uploads/audio',
  allowedTypes: ALLOWED_FILE_TYPES.AUDIO,
  maxSize: FILE_UPLOAD_LIMITS.AUDIO.maxSize,
});

/**
 * Video upload middleware
 */
export const uploadVideo = createUploadMiddleware({
  destination: 'uploads/video',
  allowedTypes: ALLOWED_FILE_TYPES.VIDEO,
  maxSize: FILE_UPLOAD_LIMITS.VIDEO.maxSize,
});

/**
 * Avatar upload middleware
 */
export const uploadAvatar = createUploadMiddleware({
  destination: 'uploads/avatars',
  allowedTypes: ALLOWED_FILE_TYPES.IMAGES,
  maxSize: FILE_UPLOAD_LIMITS.AVATAR.maxSize,
});

/**
 * Group avatar upload middleware
 */
export const uploadGroupAvatar = createUploadMiddleware({
  destination: 'uploads/group-avatars',
  allowedTypes: ALLOWED_FILE_TYPES.IMAGES,
  maxSize: FILE_UPLOAD_LIMITS.AVATAR.maxSize,
});

/**
 * Generic file upload middleware (any type)
 */
export const uploadAnyFile = createUploadMiddleware({
  destination: 'uploads/temp',
  allowedTypes: [
    ...ALLOWED_FILE_TYPES.IMAGES,
    ...ALLOWED_FILE_TYPES.DOCUMENTS,
    ...ALLOWED_FILE_TYPES.AUDIO,
    ...ALLOWED_FILE_TYPES.VIDEO,
  ],
  maxSize: FILE_UPLOAD_LIMITS.GENERAL.maxSize,
});

/**
 * Multiple files upload middleware
 */
export const uploadMultipleFiles = createUploadMiddleware({
  destination: 'uploads/temp',
  allowedTypes: [
    ...ALLOWED_FILE_TYPES.IMAGES,
    ...ALLOWED_FILE_TYPES.DOCUMENTS,
    ...ALLOWED_FILE_TYPES.AUDIO,
    ...ALLOWED_FILE_TYPES.VIDEO,
  ],
  maxSize: FILE_UPLOAD_LIMITS.GENERAL.maxSize,
  maxFiles: 5,
});

/**
 * File validation middleware
 */
export const validateUploadedFile = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.file && !req.files) {
    return next(ApiError.badRequest('No file uploaded'));
  }

  const files = req.files ? (Array.isArray(req.files) ? req.files : [req.file]) : [req.file];

  for (const file of files) {
    if (!file) continue;

    // Validate file exists
    if (!fs.existsSync(file.path)) {
      return next(ApiError.internal('File upload failed - file not found'));
    }

    // Validate file size matches what was uploaded
    const stats = fs.statSync(file.path);
    if (stats.size !== file.size) {
      return next(ApiError.internal('File upload failed - size mismatch'));
    }

    // Add additional file metadata
    (file as any).uploadedAt = new Date().toISOString();
    (file as any).uploadedBy = (req as any).user?.id;
  }

  next();
};

/**
 * File cleanup middleware for failed requests
 */
export const cleanupUploadedFiles = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Clean up uploaded files if there was an error
  if (error && (req.file || req.files)) {
    const files = req.files ? (Array.isArray(req.files) ? req.files : [req.file]) : [req.file];

    files.forEach(file => {
      if (file && fs.existsSync(file.path)) {
        fs.unlink(file.path, (unlinkError) => {
          if (unlinkError) {
            logger.error('Failed to cleanup uploaded file:', {
              file: file.path,
              error: unlinkError.message,
            });
          } else {
            logger.debug('Cleaned up uploaded file:', file.path);
          }
        });
      }
    });
  }

  next(error);
};

/**
 * File processing utilities
 */
export const fileUtils = {
  /**
   * Move file from temp to permanent location
   */
  moveFile: async (sourcePath: string, destinationPath: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      // Ensure destination directory exists
      const destDir = path.dirname(destinationPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      // Move file
      fs.rename(sourcePath, destinationPath, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  },

  /**
   * Delete file
   */
  deleteFile: async (filePath: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(filePath)) {
        resolve(); // File doesn't exist, consider it deleted
        return;
      }

      fs.unlink(filePath, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  },

  /**
   * Get file info
   */
  getFileInfo: (filePath: string): {
    exists: boolean;
    size?: number;
    createdAt?: Date;
    modifiedAt?: Date;
  } => {
    try {
      if (!fs.existsSync(filePath)) {
        return { exists: false };
      }

      const stats = fs.statSync(filePath);
      return {
        exists: true,
        size: stats.size,
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime,
      };
    } catch (error) {
      return { exists: false };
    }
  },

  /**
   * Generate unique filename
   */
  generateUniqueFilename: (originalName: string): string => {
    const ext = path.extname(originalName);
    const name = path.basename(originalName, ext);
    const timestamp = Date.now();
    const uuid = uuidv4().split('-')[0];
    return `${name}_${timestamp}_${uuid}${ext}`;
  },

  /**
   * Validate file type by content (magic numbers)
   */
  validateFileType: async (filePath: string, expectedMimeType: string): Promise<boolean> => {
    try {
      // This is a simplified version - in production, you'd use a library like 'file-type'
      // to properly detect file types by reading magic numbers
      const buffer = fs.readFileSync(filePath);
      const magicBytes = buffer.subarray(0, 10);
      
      // Basic magic number checks
      const magicNumbers: { [key: string]: number[] } = {
        'image/jpeg': [0xFF, 0xD8, 0xFF],
        'image/png': [0x89, 0x50, 0x4E, 0x47],
        'image/gif': [0x47, 0x49, 0x46],
        'application/pdf': [0x25, 0x50, 0x44, 0x46],
      };

      const magic = magicNumbers[expectedMimeType];
      if (!magic) return true; // Skip validation for unknown types

      for (let i = 0; i < magic.length; i++) {
        if (magicBytes[i] !== magic[i]) {
          return false;
        }
      }

      return true;
    } catch (error) {
      logger.error('File type validation error:', error);
      return false;
    }
  },
};

/**
 * File size formatter
 */
export const formatFileSize = (bytes: number): string => {
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 Bytes';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
};

/**
 * Upload progress tracking (for future WebSocket implementation)
 */
export const trackUploadProgress = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // This would be implemented with WebSocket for real-time progress
  // For now, we'll just add metadata
  if (req.file || req.files) {
    const files = req.files ? (Array.isArray(req.files) ? req.files : [req.file]) : [req.file];
    
    files.forEach(file => {
      if (file) {
        (file as any).uploadProgress = 100; // Complete
        (file as any).uploadSpeed = 'N/A'; // Would calculate actual speed
      }
    });
  }

  next();
};
