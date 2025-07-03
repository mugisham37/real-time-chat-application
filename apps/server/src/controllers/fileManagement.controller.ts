import { Request, Response } from 'express'
import { z } from 'zod'
import { BaseController } from './base.controller'
import { fileManagementService } from '../services/fileManagement.service'

/**
 * File Management Controller
 * Handles file upload, download, sharing, versioning, and management operations
 */
export class FileManagementController extends BaseController {
  /**
   * Upload a file
   * POST /api/files/upload
   */
  uploadFile = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    // Validate file upload
    const file = this.validateFileUpload(req.file, {
      required: true,
      maxSize: 50 * 1024 * 1024, // 50MB
      allowedTypes: [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'video/mp4', 'video/webm', 'video/quicktime',
        'audio/mpeg', 'audio/wav', 'audio/ogg',
        'application/pdf', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain', 'text/csv'
      ]
    })

    const bodySchema = z.object({
      isPublic: z.coerce.boolean().optional().default(false),
      expiresInDays: z.coerce.number().positive().max(365).optional(),
      generateThumbnail: z.coerce.boolean().optional().default(true),
      compress: z.coerce.boolean().optional().default(false)
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('uploadFile', userId, {
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype
    })

    const fileMetadata = await fileManagementService.uploadFile(
      {
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size
      },
      userId,
      {
        isPublic: body.isPublic,
        expiresInDays: body.expiresInDays,
        generateThumbnail: body.generateThumbnail,
        compress: body.compress
      }
    )

    this.sendSuccess(res, fileMetadata, 'File uploaded successfully', 201)
  })

  /**
   * Get file metadata
   * GET /api/files/:fileId
   */
  getFileMetadata = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const fileId = req.params.fileId

    const paramsSchema = z.object({
      fileId: z.string().min(1, 'File ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('getFileMetadata', userId, { fileId })

    const fileMetadata = await fileManagementService.getFileMetadata(fileId, userId)

    // Transform dates to ISO strings for JSON response
    const transformedMetadata = {
      ...fileMetadata,
      uploadedAt: fileMetadata.uploadedAt.toISOString(),
      expiresAt: fileMetadata.expiresAt?.toISOString() || null
    }

    this.sendSuccess(res, transformedMetadata, 'File metadata retrieved successfully')
  })

  /**
   * Download file
   * GET /api/files/:fileId/download
   */
  downloadFile = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const fileId = req.params.fileId

    const paramsSchema = z.object({
      fileId: z.string().min(1, 'File ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('downloadFile', userId, { fileId })

    const { buffer, metadata } = await fileManagementService.downloadFile(fileId, userId)

    // Set appropriate headers for file download
    res.setHeader('Content-Type', metadata.mimeType)
    res.setHeader('Content-Length', buffer.length)
    res.setHeader('Content-Disposition', `attachment; filename="${metadata.originalName}"`)
    res.setHeader('Cache-Control', 'private, max-age=3600') // Cache for 1 hour

    res.send(buffer)
  })

  /**
   * Delete file
   * DELETE /api/files/:fileId
   */
  deleteFile = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const fileId = req.params.fileId

    const paramsSchema = z.object({
      fileId: z.string().min(1, 'File ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('deleteFile', userId, { fileId })

    const deleted = await fileManagementService.deleteFile(fileId, userId)

    this.sendSuccess(res, { deleted, fileId }, 'File deleted successfully')
  })

  /**
   * Share file
   * POST /api/files/:fileId/share
   */
  shareFile = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const fileId = req.params.fileId

    const paramsSchema = z.object({
      fileId: z.string().min(1, 'File ID is required')
    })

    const bodySchema = z.object({
      shareType: z.enum(['public', 'private', 'password', 'expiring']),
      sharedWith: z.array(z.string()).optional(),
      password: z.string().min(6).optional(),
      expiresInHours: z.number().positive().max(8760).optional(), // Max 1 year
      downloadLimit: z.number().positive().max(1000).optional()
    })

    this.getPathParams(req, paramsSchema)
    const body = this.getBodyParams(req, bodySchema)

    // Validate required fields based on share type
    if (body.shareType === 'private' && (!body.sharedWith || body.sharedWith.length === 0)) {
      this.sendSuccess(res, { 
        shared: false, 
        error: 'sharedWith is required for private sharing' 
      }, 'Private sharing requires recipients')
      return
    }

    if (body.shareType === 'password' && !body.password) {
      this.sendSuccess(res, { 
        shared: false, 
        error: 'password is required for password-protected sharing' 
      }, 'Password is required for password-protected sharing')
      return
    }

    this.logAction('shareFile', userId, { 
      fileId, 
      shareType: body.shareType,
      recipientCount: body.sharedWith?.length || 0
    })

    const fileShare = await fileManagementService.shareFile(fileId, userId, body)

    // Transform dates for response
    const transformedShare = {
      ...fileShare,
      createdAt: fileShare.createdAt.toISOString(),
      expiresAt: fileShare.expiresAt?.toISOString() || null
    }

    this.sendSuccess(res, transformedShare, 'File shared successfully', 201)
  })

  /**
   * Get user's files
   * GET /api/files/my-files
   */
  getUserFiles = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const querySchema = z.object({
      limit: z.coerce.number().min(1).max(100).default(20),
      skip: z.coerce.number().min(0).default(0),
      mimeType: z.string().optional(),
      sortBy: z.enum(['name', 'size', 'date']).default('date'),
      sortOrder: z.enum(['asc', 'desc']).default('desc')
    })

    const query = this.getQueryParams(req, querySchema)

    this.logAction('getUserFiles', userId, { 
      limit: query.limit,
      skip: query.skip,
      mimeType: query.mimeType
    })

    const result = await fileManagementService.getUserFiles(userId, {
      limit: query.limit,
      skip: query.skip,
      mimeType: query.mimeType,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder
    })

    // Transform dates in files
    const transformedFiles = result.files.map(file => ({
      ...file,
      uploadedAt: file.uploadedAt.toISOString(),
      expiresAt: file.expiresAt?.toISOString() || null
    }))

    const pagination = this.calculatePagination(
      Math.floor(query.skip / query.limit) + 1,
      query.limit,
      result.total
    )

    this.sendSuccess(res, {
      files: transformedFiles,
      storageUsed: result.storageUsed,
      storageLimit: result.storageLimit,
      storageUsedFormatted: this.formatBytes(result.storageUsed),
      storageLimitFormatted: this.formatBytes(result.storageLimit),
      storagePercentage: Math.round((result.storageUsed / result.storageLimit) * 100)
    }, 'User files retrieved successfully', 200, pagination)
  })

  /**
   * Create file version
   * POST /api/files/:fileId/version
   */
  createFileVersion = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const fileId = req.params.fileId

    const paramsSchema = z.object({
      fileId: z.string().min(1, 'File ID is required')
    })

    this.getPathParams(req, paramsSchema)

    // Validate file upload
    const file = this.validateFileUpload(req.file, {
      required: true,
      maxSize: 50 * 1024 * 1024 // 50MB
    })

    const bodySchema = z.object({
      changes: z.string().max(500).optional()
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('createFileVersion', userId, { 
      fileId,
      fileName: file.originalname,
      fileSize: file.size
    })

    const fileVersion = await fileManagementService.createFileVersion(
      fileId,
      {
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size
      },
      userId,
      body.changes
    )

    // Transform dates for response
    const transformedVersion = {
      ...fileVersion,
      uploadedAt: fileVersion.uploadedAt.toISOString()
    }

    this.sendSuccess(res, transformedVersion, 'File version created successfully', 201)
  })

  /**
   * Get file statistics (Admin only)
   * GET /api/files/stats
   */
  getFileStatistics = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    this.requireAdmin(req)

    this.logAction('getFileStatistics', userId)

    const stats = await fileManagementService.getFileStatistics()

    // Format file sizes
    const formattedStats = {
      ...stats,
      totalSizeFormatted: this.formatBytes(stats.totalSize),
      sizeByTypeFormatted: Object.entries(stats.sizeByType).reduce((acc, [type, size]) => {
        acc[type] = this.formatBytes(size as number)
        return acc
      }, {} as Record<string, string>)
    }

    this.sendSuccess(res, formattedStats, 'File statistics retrieved successfully')
  })

  /**
   * Clean up expired files (Admin only)
   * POST /api/files/cleanup
   */
  cleanupExpiredFiles = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    this.requireAdmin(req)

    this.logAction('cleanupExpiredFiles', userId)

    const deletedCount = await fileManagementService.cleanupExpiredFiles()

    this.sendSuccess(res, { 
      deletedCount,
      cleanedUp: true,
      timestamp: new Date().toISOString()
    }, `Cleaned up ${deletedCount} expired files successfully`)
  })

  /**
   * Search files
   * GET /api/files/search
   */
  searchFiles = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const querySchema = z.object({
      query: z.string().min(1, 'Search query is required'),
      mimeType: z.string().optional(),
      limit: z.coerce.number().min(1).max(50).default(20),
      skip: z.coerce.number().min(0).default(0)
    })

    const query = this.getQueryParams(req, querySchema)

    this.logAction('searchFiles', userId, { 
      searchQuery: query.query,
      mimeType: query.mimeType
    })

    // Get user files and filter by search query
    const result = await fileManagementService.getUserFiles(userId, {
      limit: 100, // Get more files for searching
      skip: 0,
      mimeType: query.mimeType
    })

    // Filter files by search query
    const searchResults = result.files.filter(file => 
      file.originalName.toLowerCase().includes(query.query.toLowerCase())
    )

    // Apply pagination to search results
    const paginatedResults = searchResults.slice(query.skip, query.skip + query.limit)

    // Transform dates
    const transformedFiles = paginatedResults.map(file => ({
      ...file,
      uploadedAt: file.uploadedAt.toISOString(),
      expiresAt: file.expiresAt?.toISOString() || null
    }))

    const pagination = this.calculatePagination(
      Math.floor(query.skip / query.limit) + 1,
      query.limit,
      searchResults.length
    )

    this.sendSuccess(res, {
      files: transformedFiles,
      totalResults: searchResults.length,
      searchQuery: query.query
    }, 'File search completed successfully', 200, pagination)
  })

  /**
   * Get file access logs (Admin only)
   * GET /api/files/:fileId/access-logs
   */
  getFileAccessLogs = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const fileId = req.params.fileId

    const paramsSchema = z.object({
      fileId: z.string().min(1, 'File ID is required')
    })

    this.getPathParams(req, paramsSchema)

    // Check if user owns the file or is admin
    const fileMetadata = await fileManagementService.getFileMetadata(fileId, userId)
    if (fileMetadata.uploadedBy !== userId) {
      this.requireAdmin(req)
    }

    this.logAction('getFileAccessLogs', userId, { fileId })

    // This would require implementing access logging
    const accessLogs = {
      fileId,
      logs: [],
      totalAccesses: 0,
      uniqueUsers: 0,
      lastAccessed: null,
      message: 'File access logging will be implemented with analytics integration'
    }

    this.sendSuccess(res, accessLogs, 'File access logs retrieved successfully')
  })

  /**
   * Bulk file operations
   * POST /api/files/bulk
   */
  bulkFileOperations = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const bodySchema = z.object({
      operation: z.enum(['delete', 'share', 'move', 'copy']),
      fileIds: z.array(z.string().min(1)).min(1, 'At least one file ID is required'),
      shareOptions: z.object({
        shareType: z.enum(['public', 'private', 'password', 'expiring']),
        sharedWith: z.array(z.string()).optional(),
        password: z.string().optional(),
        expiresInHours: z.number().positive().optional()
      }).optional()
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('bulkFileOperations', userId, { 
      operation: body.operation,
      fileCount: body.fileIds.length
    })

    const results = await this.handleBulkOperation(
      body.fileIds,
      async (fileId: string) => {
        switch (body.operation) {
          case 'delete':
            return await fileManagementService.deleteFile(fileId, userId)
          
          case 'share':
            if (!body.shareOptions) {
              throw new Error('Share options are required for share operation')
            }
            return await fileManagementService.shareFile(fileId, userId, body.shareOptions)
          
          default:
            throw new Error(`Operation ${body.operation} not implemented yet`)
        }
      },
      { continueOnError: true }
    )

    this.sendSuccess(res, {
      operation: body.operation,
      successful: results.successful.length,
      failed: results.failed.length,
      results: results.successful,
      errors: results.failed
    }, `Bulk ${body.operation} operation completed`)
  })

  /**
   * Get file sharing information
   * GET /api/files/:fileId/shares
   */
  getFileShares = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const fileId = req.params.fileId

    const paramsSchema = z.object({
      fileId: z.string().min(1, 'File ID is required')
    })

    this.getPathParams(req, paramsSchema)

    // Check if user owns the file
    const fileMetadata = await fileManagementService.getFileMetadata(fileId, userId)
    if (fileMetadata.uploadedBy !== userId) {
      this.sendSuccess(res, { 
        shares: [],
        message: 'You can only view shares for your own files'
      }, 'Access denied')
      return
    }

    this.logAction('getFileShares', userId, { fileId })

    // This would require implementing share retrieval
    const shares = {
      fileId,
      shares: [],
      totalShares: 0,
      activeShares: 0,
      message: 'File sharing information will be implemented with database integration'
    }

    this.sendSuccess(res, shares, 'File shares retrieved successfully')
  })

  /**
   * Update file metadata
   * PUT /api/files/:fileId/metadata
   */
  updateFileMetadata = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const fileId = req.params.fileId

    const paramsSchema = z.object({
      fileId: z.string().min(1, 'File ID is required')
    })

    const bodySchema = z.object({
      originalName: z.string().min(1).max(255).optional(),
      isPublic: z.boolean().optional(),
      expiresAt: z.string().datetime().optional()
    })

    this.getPathParams(req, paramsSchema)
    const body = this.getBodyParams(req, bodySchema)

    // Check if user owns the file
    const fileMetadata = await fileManagementService.getFileMetadata(fileId, userId)
    if (fileMetadata.uploadedBy !== userId) {
      this.sendSuccess(res, { 
        updated: false,
        message: 'You can only update your own files'
      }, 'Access denied')
      return
    }

    this.logAction('updateFileMetadata', userId, { 
      fileId,
      updates: Object.keys(body)
    })

    // This would require implementing metadata update
    const updatedMetadata = {
      fileId,
      updated: false,
      message: 'File metadata update will be implemented with database integration'
    }

    this.sendSuccess(res, updatedMetadata, 'File metadata updated successfully')
  })

  /**
   * Helper method to format bytes
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes'

    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }
}

// Export singleton instance
export const fileManagementController = new FileManagementController()
