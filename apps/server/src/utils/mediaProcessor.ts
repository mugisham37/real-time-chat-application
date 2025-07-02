import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { config } from '../config/config';
import { logger, uploadLogger } from './logger';
import { ApiError } from './apiError';
import { generateUUID } from './encryption';

// Supported file types
export const SUPPORTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
];

export const SUPPORTED_VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'video/mpeg',
];

export const SUPPORTED_AUDIO_TYPES = [
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/mp4',
  'audio/webm',
];

export const SUPPORTED_DOCUMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
];

export const ALL_SUPPORTED_TYPES = [
  ...SUPPORTED_IMAGE_TYPES,
  ...SUPPORTED_VIDEO_TYPES,
  ...SUPPORTED_AUDIO_TYPES,
  ...SUPPORTED_DOCUMENT_TYPES,
];

// File size limits (in bytes)
export const FILE_SIZE_LIMITS = {
  image: 10 * 1024 * 1024, // 10MB
  video: 100 * 1024 * 1024, // 100MB
  audio: 50 * 1024 * 1024, // 50MB
  document: 25 * 1024 * 1024, // 25MB
};

// Directory structure
const UPLOAD_DIRS = {
  temp: path.join(config.upload.uploadDir, 'temp'),
  images: path.join(config.upload.uploadDir, 'images'),
  videos: path.join(config.upload.uploadDir, 'videos'),
  audio: path.join(config.upload.uploadDir, 'audio'),
  documents: path.join(config.upload.uploadDir, 'documents'),
  thumbnails: path.join(config.upload.uploadDir, 'thumbnails'),
  avatars: path.join(config.upload.uploadDir, 'avatars'),
};

// Ensure upload directories exist
export const ensureUploadDirectories = async (): Promise<void> => {
  try {
    for (const dir of Object.values(UPLOAD_DIRS)) {
      await fs.mkdir(dir, { recursive: true });
    }
    logger.info('Upload directories ensured');
  } catch (error) {
    logger.error('Error creating upload directories:', error);
    throw new Error('Failed to create upload directories');
  }
};

// Initialize directories on module load
ensureUploadDirectories().catch(error => {
  logger.error('Failed to initialize upload directories:', error);
});

/**
 * Get file type category from MIME type
 */
export const getFileTypeCategory = (mimeType: string): 'image' | 'video' | 'audio' | 'document' | 'unknown' => {
  if (SUPPORTED_IMAGE_TYPES.includes(mimeType)) return 'image';
  if (SUPPORTED_VIDEO_TYPES.includes(mimeType)) return 'video';
  if (SUPPORTED_AUDIO_TYPES.includes(mimeType)) return 'audio';
  if (SUPPORTED_DOCUMENT_TYPES.includes(mimeType)) return 'document';
  return 'unknown';
};

/**
 * Validate file type and size
 */
export const validateFile = (file: Express.Multer.File): void => {
  const category = getFileTypeCategory(file.mimetype);
  
  if (category === 'unknown') {
    throw ApiError.unsupportedFileType(ALL_SUPPORTED_TYPES);
  }
  
  const sizeLimit = FILE_SIZE_LIMITS[category];
  if (file.size > sizeLimit) {
    throw ApiError.fileTooLarge(`${sizeLimit / (1024 * 1024)}MB`);
  }
};

/**
 * Generate unique filename
 */
export const generateFileName = (originalName: string, prefix?: string): string => {
  const ext = path.extname(originalName);
  const uuid = generateUUID();
  return prefix ? `${prefix}_${uuid}${ext}` : `${uuid}${ext}`;
};

/**
 * Process image file
 */
export const processImage = async (
  file: Express.Multer.File,
  options: {
    width?: number;
    height?: number;
    quality?: number;
    format?: 'jpeg' | 'png' | 'webp';
    generateThumbnail?: boolean;
    thumbnailSize?: number;
  } = {}
): Promise<{
  url: string;
  thumbnailUrl?: string;
  width: number;
  height: number;
  size: number;
  format: string;
}> => {
  try {
    const {
      width = config.media.image.maxWidth,
      height = config.media.image.maxHeight,
      quality = config.media.image.quality,
      format = 'webp',
      generateThumbnail = true,
      thumbnailSize = config.media.thumbnail.width,
    } = options;

    // Generate unique filename
    const filename = generateFileName(file.originalname);
    const outputPath = path.join(UPLOAD_DIRS.images, filename);

    // Process main image
    const image = sharp(file.path);
    const metadata = await image.metadata();

    // Resize if needed
    let processedImage = image;
    if (metadata.width && metadata.width > width) {
      processedImage = processedImage.resize({ width, height, fit: 'inside', withoutEnlargement: false });
    }

    // Convert format and set quality
    switch (format) {
      case 'jpeg':
        processedImage = processedImage.jpeg({ quality });
        break;
      case 'png':
        processedImage = processedImage.png({ quality: Math.round(quality / 10) });
        break;
      case 'webp':
        processedImage = processedImage.webp({ quality });
        break;
    }

    await processedImage.toFile(outputPath);

    // Get final metadata
    const finalMetadata = await sharp(outputPath).metadata();

    // Generate thumbnail if requested
    let thumbnailUrl: string | undefined;
    if (generateThumbnail) {
      const thumbnailFilename = `thumb_${filename}`;
      const thumbnailPath = path.join(UPLOAD_DIRS.thumbnails, thumbnailFilename);
      
      await sharp(file.path)
        .resize({ width: thumbnailSize, height: thumbnailSize, fit: 'cover' })
        .webp({ quality: 70 })
        .toFile(thumbnailPath);
      
      thumbnailUrl = `/uploads/thumbnails/${thumbnailFilename}`;
    }

    // Clean up temp file
    await fs.unlink(file.path);

    // Get file size
    const stats = await fs.stat(outputPath);

    uploadLogger.info('Image processed successfully', {
      originalName: file.originalname,
      filename,
      size: stats.size,
      dimensions: { width: finalMetadata.width, height: finalMetadata.height },
    });

    return {
      url: `/uploads/images/${filename}`,
      thumbnailUrl,
      width: finalMetadata.width || 0,
      height: finalMetadata.height || 0,
      size: stats.size,
      format,
    };
  } catch (error) {
    uploadLogger.error('Error processing image:', error);
    // Clean up temp file on error
    try {
      await fs.unlink(file.path);
    } catch {}
    throw ApiError.uploadFailed('Image processing failed');
  }
};

/**
 * Process avatar image (special case of image processing)
 */
export const processAvatar = async (
  file: Express.Multer.File,
  size: number = 200
): Promise<{
  url: string;
  size: number;
}> => {
  try {
    const filename = generateFileName(file.originalname, 'avatar');
    const outputPath = path.join(UPLOAD_DIRS.avatars, filename);

    // Process avatar - square crop, specific size
    await sharp(file.path)
      .resize({ width: size, height: size, fit: 'cover' })
      .webp({ quality: 85 })
      .toFile(outputPath);

    // Clean up temp file
    await fs.unlink(file.path);

    // Get file size
    const stats = await fs.stat(outputPath);

    uploadLogger.info('Avatar processed successfully', {
      originalName: file.originalname,
      filename,
      size: stats.size,
    });

    return {
      url: `/uploads/avatars/${filename}`,
      size: stats.size,
    };
  } catch (error) {
    uploadLogger.error('Error processing avatar:', error);
    // Clean up temp file on error
    try {
      await fs.unlink(file.path);
    } catch {}
    throw ApiError.uploadFailed('Avatar processing failed');
  }
};

/**
 * Process video file
 */
export const processVideo = async (
  file: Express.Multer.File,
  options: {
    generateThumbnail?: boolean;
    thumbnailTime?: string;
  } = {}
): Promise<{
  url: string;
  thumbnailUrl?: string;
  duration?: number;
  width?: number;
  height?: number;
  size: number;
}> => {
  try {
    const { generateThumbnail = true, thumbnailTime = '00:00:01' } = options;

    // Generate unique filename
    const filename = generateFileName(file.originalname);
    const outputPath = path.join(UPLOAD_DIRS.videos, filename);

    // Move file to videos directory
    await pipeline(
      createReadStream(file.path),
      createWriteStream(outputPath)
    );

    // Clean up temp file
    await fs.unlink(file.path);

    // Get file size
    const stats = await fs.stat(outputPath);

    let thumbnailUrl: string | undefined;
    let duration: number | undefined;
    let width: number | undefined;
    let height: number | undefined;

    // Generate thumbnail and get metadata using ffmpeg (if available)
    if (generateThumbnail) {
      try {
        // This would require ffmpeg to be installed
        // For now, we'll skip video thumbnail generation
        // In a production environment, you'd use ffmpeg or similar
        uploadLogger.info('Video thumbnail generation skipped (ffmpeg not configured)');
      } catch (error) {
        uploadLogger.warn('Failed to generate video thumbnail:', error);
      }
    }

    uploadLogger.info('Video processed successfully', {
      originalName: file.originalname,
      filename,
      size: stats.size,
    });

    return {
      url: `/uploads/videos/${filename}`,
      thumbnailUrl,
      duration,
      width,
      height,
      size: stats.size,
    };
  } catch (error) {
    uploadLogger.error('Error processing video:', error);
    // Clean up temp file on error
    try {
      await fs.unlink(file.path);
    } catch {}
    throw ApiError.uploadFailed('Video processing failed');
  }
};

/**
 * Process audio file
 */
export const processAudio = async (
  file: Express.Multer.File
): Promise<{
  url: string;
  duration?: number;
  size: number;
}> => {
  try {
    // Generate unique filename
    const filename = generateFileName(file.originalname);
    const outputPath = path.join(UPLOAD_DIRS.audio, filename);

    // Move file to audio directory
    await pipeline(
      createReadStream(file.path),
      createWriteStream(outputPath)
    );

    // Clean up temp file
    await fs.unlink(file.path);

    // Get file size
    const stats = await fs.stat(outputPath);

    let duration: number | undefined;

    // Get audio metadata using ffmpeg (if available)
    try {
      // This would require ffmpeg to be installed
      // For now, we'll skip audio metadata extraction
      uploadLogger.info('Audio metadata extraction skipped (ffmpeg not configured)');
    } catch (error) {
      uploadLogger.warn('Failed to extract audio metadata:', error);
    }

    uploadLogger.info('Audio processed successfully', {
      originalName: file.originalname,
      filename,
      size: stats.size,
    });

    return {
      url: `/uploads/audio/${filename}`,
      duration,
      size: stats.size,
    };
  } catch (error) {
    uploadLogger.error('Error processing audio:', error);
    // Clean up temp file on error
    try {
      await fs.unlink(file.path);
    } catch {}
    throw ApiError.uploadFailed('Audio processing failed');
  }
};

/**
 * Process document file
 */
export const processDocument = async (
  file: Express.Multer.File
): Promise<{
  url: string;
  filename: string;
  size: number;
  mimeType: string;
}> => {
  try {
    // Generate unique filename but preserve original name for display
    const filename = generateFileName(file.originalname);
    const outputPath = path.join(UPLOAD_DIRS.documents, filename);

    // Move file to documents directory
    await pipeline(
      createReadStream(file.path),
      createWriteStream(outputPath)
    );

    // Clean up temp file
    await fs.unlink(file.path);

    // Get file size
    const stats = await fs.stat(outputPath);

    uploadLogger.info('Document processed successfully', {
      originalName: file.originalname,
      filename,
      size: stats.size,
      mimeType: file.mimetype,
    });

    return {
      url: `/uploads/documents/${filename}`,
      filename: file.originalname,
      size: stats.size,
      mimeType: file.mimetype,
    };
  } catch (error) {
    uploadLogger.error('Error processing document:', error);
    // Clean up temp file on error
    try {
      await fs.unlink(file.path);
    } catch {}
    throw ApiError.uploadFailed('Document processing failed');
  }
};

/**
 * Process any file based on its type
 */
export const processFile = async (
  file: Express.Multer.File,
  options: any = {}
): Promise<{
  type: string;
  url: string;
  thumbnailUrl?: string;
  filename?: string;
  width?: number;
  height?: number;
  duration?: number;
  size: number;
  mimeType: string;
}> => {
  validateFile(file);
  
  const category = getFileTypeCategory(file.mimetype);
  
  switch (category) {
    case 'image':
      const imageResult = await processImage(file, options);
      return {
        type: 'image',
        ...imageResult,
        mimeType: file.mimetype,
      };
      
    case 'video':
      const videoResult = await processVideo(file, options);
      return {
        type: 'video',
        ...videoResult,
        mimeType: file.mimetype,
      };
      
    case 'audio':
      const audioResult = await processAudio(file);
      return {
        type: 'audio',
        ...audioResult,
        mimeType: file.mimetype,
      };
      
    case 'document':
      const documentResult = await processDocument(file);
      return {
        type: 'document',
        ...documentResult,
      };
      
    default:
      throw ApiError.unsupportedFileType(ALL_SUPPORTED_TYPES);
  }
};

/**
 * Delete file from storage
 */
export const deleteFile = async (filePath: string): Promise<void> => {
  try {
    const fullPath = path.join(config.upload.uploadDir, filePath.replace('/uploads/', ''));
    await fs.unlink(fullPath);
    uploadLogger.info('File deleted successfully', { filePath });
  } catch (error) {
    uploadLogger.error('Error deleting file:', error);
    throw new Error('Failed to delete file');
  }
};

/**
 * Clean up old temporary files
 */
export const cleanupTempFiles = async (maxAge: number = 24 * 60 * 60 * 1000): Promise<void> => {
  try {
    const files = await fs.readdir(UPLOAD_DIRS.temp);
    const now = Date.now();
    
    for (const file of files) {
      const filePath = path.join(UPLOAD_DIRS.temp, file);
      const stats = await fs.stat(filePath);
      
      if (now - stats.mtime.getTime() > maxAge) {
        await fs.unlink(filePath);
        uploadLogger.info('Cleaned up old temp file', { file });
      }
    }
  } catch (error) {
    uploadLogger.error('Error cleaning up temp files:', error);
  }
};

/**
 * Get file info without processing
 */
export const getFileInfo = async (filePath: string): Promise<{
  exists: boolean;
  size?: number;
  mimeType?: string;
  createdAt?: Date;
  modifiedAt?: Date;
}> => {
  try {
    const fullPath = path.join(config.upload.uploadDir, filePath.replace('/uploads/', ''));
    const stats = await fs.stat(fullPath);
    
    return {
      exists: true,
      size: stats.size,
      createdAt: stats.birthtime,
      modifiedAt: stats.mtime,
    };
  } catch (error) {
    return { exists: false };
  }
};

// Schedule cleanup of temp files every hour
setInterval(() => {
  cleanupTempFiles().catch(error => {
    logger.error('Scheduled temp file cleanup failed:', error);
  });
}, 60 * 60 * 1000); // 1 hour

export default {
  processFile,
  processImage,
  processAvatar,
  processVideo,
  processAudio,
  processDocument,
  validateFile,
  deleteFile,
  cleanupTempFiles,
  getFileInfo,
  getFileTypeCategory,
  generateFileName,
  ensureUploadDirectories,
  SUPPORTED_IMAGE_TYPES,
  SUPPORTED_VIDEO_TYPES,
  SUPPORTED_AUDIO_TYPES,
  SUPPORTED_DOCUMENT_TYPES,
  ALL_SUPPORTED_TYPES,
  FILE_SIZE_LIMITS,
};
