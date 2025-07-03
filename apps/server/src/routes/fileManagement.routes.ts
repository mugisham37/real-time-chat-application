import { Router } from 'express';
import { fileManagementController } from '../controllers/fileManagement.controller';
import {
  authMiddleware,
  adminMiddleware,
  validateIdParam,
  cache,
  rateLimiter,
  uploadMiddleware,
  uploadImage,
  uploadDocument,
  uploadAnyFile,
  handleUploadError,
  validateUploadedFile,
  cleanupUploadedFiles
} from '../middleware';

/**
 * File Management Routes
 * Handles file upload, download, sharing, versioning, and management operations
 */

const router = Router();

// File upload routes
router.post('/upload',
  authMiddleware,
  uploadMiddleware,
  uploadAnyFile,
  validateUploadedFile,
  handleUploadError,
  fileManagementController.uploadFile
);

// File metadata and download routes
router.get('/:fileId',
  authMiddleware,
  validateIdParam,
  cache({ ttl: 300 }), // 5 minutes cache
  fileManagementController.getFileMetadata
);

router.get('/:fileId/download',
  authMiddleware,
  validateIdParam,
  rateLimiter,
  fileManagementController.downloadFile
);

// File management routes
router.delete('/:fileId',
  authMiddleware,
  validateIdParam,
  fileManagementController.deleteFile
);

router.put('/:fileId/metadata',
  authMiddleware,
  validateIdParam,
  fileManagementController.updateFileMetadata
);

// File sharing routes
router.post('/:fileId/share',
  authMiddleware,
  validateIdParam,
  rateLimiter,
  fileManagementController.shareFile
);

router.get('/:fileId/shares',
  authMiddleware,
  validateIdParam,
  cache({ ttl: 180 }), // 3 minutes cache
  fileManagementController.getFileShares
);

// File versioning routes
router.post('/:fileId/version',
  authMiddleware,
  validateIdParam,
  uploadMiddleware,
  uploadAnyFile,
  validateUploadedFile,
  handleUploadError,
  fileManagementController.createFileVersion
);

// User files routes
router.get('/my-files',
  authMiddleware,
  cache({ ttl: 120 }), // 2 minutes cache
  fileManagementController.getUserFiles
);

// Search routes
router.get('/search',
  authMiddleware,
  cache({ ttl: 300 }), // 5 minutes cache
  fileManagementController.searchFiles
);

// File access logs
router.get('/:fileId/access-logs',
  authMiddleware,
  validateIdParam,
  cache({ ttl: 600 }), // 10 minutes cache
  fileManagementController.getFileAccessLogs
);

// Bulk operations
router.post('/bulk',
  authMiddleware,
  rateLimiter,
  fileManagementController.bulkFileOperations
);

// Admin routes
router.get('/stats',
  adminMiddleware,
  cache({ ttl: 900 }), // 15 minutes cache
  fileManagementController.getFileStatistics
);

router.post('/cleanup',
  adminMiddleware,
  fileManagementController.cleanupExpiredFiles
);

// Error handling middleware for file operations
router.use(handleUploadError);
router.use(cleanupUploadedFiles);

export { router as fileManagementRoutes };
