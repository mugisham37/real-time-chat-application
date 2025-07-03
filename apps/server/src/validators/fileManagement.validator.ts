import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { BaseValidator } from './base.validator'

/**
 * File Management Validator
 * Validates all file management requests with comprehensive security and business logic
 */
export class FileManagementValidator extends BaseValidator {
  /**
   * Validate file upload request
   */
  validateUploadFile = (req: Request, res: Response, next: NextFunction) => {
    try {
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
        ],
        allowedExtensions: [
          'jpg', 'jpeg', 'png', 'gif', 'webp',
          'mp4', 'webm', 'mov',
          'mp3', 'wav', 'ogg',
          'pdf', 'doc', 'docx',
          'txt', 'csv'
        ]
      })

      if (!file) {
        throw new Error('File upload is required')
      }

      const bodySchema = z.object({
        isPublic: z.coerce.boolean().default(false),
        expiresInDays: z.coerce.number()
          .positive('Expiry days must be positive')
          .max(365, 'Expiry cannot exceed 1 year')
          .optional(),
        generateThumbnail: z.coerce.boolean().default(true),
        compress: z.coerce.boolean().default(false)
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Additional file security validations
      this.validateFileContent(file)
      this.validateUserStorageQuota(req.user?.id, file.size)

      // Rate limiting for file uploads
      this.validateFileUploadRateLimit(req)

      this.logValidation('uploadFile', req.user?.id, {
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        isPublic: body.isPublic
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get file metadata request
   */
  validateGetFileMetadata = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        fileId: z.string()
          .min(1, 'File ID is required')
          .max(100, 'Invalid file ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      this.logValidation('getFileMetadata', req.user?.id, { 
        fileId: params.fileId 
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate download file request
   */
  validateDownloadFile = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        fileId: z.string()
          .min(1, 'File ID is required')
          .max(100, 'Invalid file ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      // Rate limiting for downloads
      this.validateFileDownloadRateLimit(req)

      this.logValidation('downloadFile', req.user?.id, { 
        fileId: params.fileId 
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate delete file request
   */
  validateDeleteFile = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        fileId: z.string()
          .min(1, 'File ID is required')
          .max(100, 'Invalid file ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      this.logValidation('deleteFile', req.user?.id, { 
        fileId: params.fileId 
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate share file request
   */
  validateShareFile = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        fileId: z.string()
          .min(1, 'File ID is required')
          .max(100, 'Invalid file ID format')
      })

      const bodySchema = z.object({
        shareType: z.enum(['public', 'private', 'password', 'expiring'], {
          errorMap: () => ({ message: 'Share type must be public, private, password, or expiring' })
        }),
        sharedWith: z.array(z.string().min(1, 'User ID cannot be empty'))
          .max(100, 'Cannot share with more than 100 users')
          .optional(),
        password: z.string()
          .min(6, 'Password must be at least 6 characters')
          .max(128, 'Password too long')
          .optional(),
        expiresInHours: z.number()
          .positive('Expiry hours must be positive')
          .max(8760, 'Expiry cannot exceed 1 year (8760 hours)')
          .optional(),
        downloadLimit: z.number()
          .positive('Download limit must be positive')
          .max(1000, 'Download limit cannot exceed 1000')
          .optional()
      }).refine(data => {
        // Validate required fields based on share type
        if (data.shareType === 'private' && (!data.sharedWith || data.sharedWith.length === 0)) {
          throw new Error('sharedWith is required for private sharing')
        }
        if (data.shareType === 'password' && !data.password) {
          throw new Error('password is required for password-protected sharing')
        }
        if (data.shareType === 'expiring' && !data.expiresInHours) {
          throw new Error('expiresInHours is required for expiring shares')
        }
        return true
      }, {
        message: 'Invalid share configuration'
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')
      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Validate password strength if provided
      if (body.password) {
        this.validatePasswordStrength(body.password)
      }

      // Rate limiting for file sharing
      this.validateFileSharingRateLimit(req)

      this.logValidation('shareFile', req.user?.id, { 
        fileId: params.fileId,
        shareType: body.shareType,
        recipientCount: body.sharedWith?.length || 0
      })

      req.params = params
      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get user files request
   */
  validateGetUserFiles = (req: Request, res: Response, next: NextFunction) => {
    try {
      const querySchema = z.object({
        limit: z.coerce.number()
          .min(1, 'Limit must be at least 1')
          .max(100, 'Limit cannot exceed 100')
          .default(20),
        skip: z.coerce.number()
          .min(0, 'Skip cannot be negative')
          .default(0),
        mimeType: z.string()
          .max(100, 'MIME type too long')
          .optional(),
        sortBy: z.enum(['name', 'size', 'date'], {
          errorMap: () => ({ message: 'Sort by must be name, size, or date' })
        }).default('date'),
        sortOrder: z.enum(['asc', 'desc'], {
          errorMap: () => ({ message: 'Sort order must be asc or desc' })
        }).default('desc')
      })

      const query = this.validateData(querySchema as any, req.query, 'query parameters') as any

      this.logValidation('getUserFiles', req.user?.id, { 
        limit: query.limit,
        skip: query.skip,
        mimeType: query.mimeType
      })

      req.query = query
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate create file version request
   */
  validateCreateFileVersion = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        fileId: z.string()
          .min(1, 'File ID is required')
          .max(100, 'Invalid file ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      // Validate file upload
      const file = this.validateFileUpload(req.file, {
        required: true,
        maxSize: 50 * 1024 * 1024 // 50MB
      })

      if (!file) {
        throw new Error('File upload is required for version creation')
      }

      const bodySchema = z.object({
        changes: z.string()
          .max(500, 'Changes description too long')
          .optional()
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Additional validations
      this.validateFileContent(file)

      this.logValidation('createFileVersion', req.user?.id, { 
        fileId: params.fileId,
        fileName: file.originalname,
        fileSize: file.size
      })

      req.params = params
      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get file statistics request (Admin only)
   */
  validateGetFileStatistics = (req: Request, res: Response, next: NextFunction) => {
    try {
      this.validateAdmin(req)

      this.logValidation('getFileStatistics', req.user?.id)

      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate cleanup expired files request (Admin only)
   */
  validateCleanupExpiredFiles = (req: Request, res: Response, next: NextFunction) => {
    try {
      this.validateAdmin(req)

      this.logValidation('cleanupExpiredFiles', req.user?.id)

      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate search files request
   */
  validateSearchFiles = (req: Request, res: Response, next: NextFunction) => {
    try {
      const querySchema = z.object({
        query: z.string()
          .min(1, 'Search query is required')
          .max(100, 'Search query too long')
          .regex(/^[a-zA-Z0-9\s\-_.,!?()]+$/, 'Search query contains invalid characters'),
        mimeType: z.string()
          .max(100, 'MIME type too long')
          .optional(),
        limit: z.coerce.number()
          .min(1, 'Limit must be at least 1')
          .max(50, 'Limit cannot exceed 50')
          .default(20),
        skip: z.coerce.number()
          .min(0, 'Skip cannot be negative')
          .default(0)
      })

      const query = this.validateData(querySchema as any, req.query, 'query parameters') as any

      // Rate limiting for search
      this.validateFileSearchRateLimit(req)

      this.logValidation('searchFiles', req.user?.id, { 
        searchQuery: query.query,
        mimeType: query.mimeType
      })

      req.query = query
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get file access logs request
   */
  validateGetFileAccessLogs = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        fileId: z.string()
          .min(1, 'File ID is required')
          .max(100, 'Invalid file ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      this.logValidation('getFileAccessLogs', req.user?.id, { 
        fileId: params.fileId 
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate bulk file operations request
   */
  validateBulkFileOperations = (req: Request, res: Response, next: NextFunction) => {
    try {
      const bodySchema = z.object({
        operation: z.enum(['delete', 'share', 'move', 'copy'], {
          errorMap: () => ({ message: 'Operation must be delete, share, move, or copy' })
        }),
        fileIds: z.array(z.string().min(1, 'File ID cannot be empty'))
          .min(1, 'At least one file ID is required')
          .max(100, 'Cannot process more than 100 files at once'),
        shareOptions: z.object({
          shareType: z.enum(['public', 'private', 'password', 'expiring']),
          sharedWith: z.array(z.string()).optional(),
          password: z.string().optional(),
          expiresInHours: z.number().positive().optional()
        }).optional()
      }).refine(data => {
        if (data.operation === 'share' && !data.shareOptions) {
          throw new Error('Share options are required for share operation')
        }
        return true
      }, {
        message: 'Invalid bulk operation configuration'
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Rate limiting for bulk operations
      this.validateBulkOperationRateLimit(req, body.fileIds.length)

      this.logValidation('bulkFileOperations', req.user?.id, { 
        operation: body.operation,
        fileCount: body.fileIds.length
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get file shares request
   */
  validateGetFileShares = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        fileId: z.string()
          .min(1, 'File ID is required')
          .max(100, 'Invalid file ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      this.logValidation('getFileShares', req.user?.id, { 
        fileId: params.fileId 
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate update file metadata request
   */
  validateUpdateFileMetadata = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        fileId: z.string()
          .min(1, 'File ID is required')
          .max(100, 'Invalid file ID format')
      })

      const bodySchema = z.object({
        originalName: z.string()
          .min(1, 'File name cannot be empty')
          .max(255, 'File name too long')
          .regex(/^[^<>:"/\\|?*\x00-\x1f]+$/, 'File name contains invalid characters')
          .optional(),
        isPublic: z.boolean().optional(),
        expiresAt: z.string()
          .datetime('Invalid expiry date format')
          .optional()
      }).refine(data => Object.keys(data).length > 0, {
        message: 'At least one field must be provided for update'
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')
      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Validate expiry date if provided
      if (body.expiresAt) {
        const expiryDate = new Date(body.expiresAt)
        const now = new Date()
        const maxExpiry = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000) // 1 year

        if (expiryDate <= now) {
          throw new Error('Expiry date must be in the future')
        }
        if (expiryDate > maxExpiry) {
          throw new Error('Expiry date cannot be more than 1 year in the future')
        }
      }

      this.logValidation('updateFileMetadata', req.user?.id, { 
        fileId: params.fileId,
        updates: Object.keys(body)
      })

      req.params = params
      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate file content for security
   */
  private validateFileContent(file: Express.Multer.File): void {
    // Check for suspicious file signatures
    const suspiciousSignatures = [
      Buffer.from([0x4D, 0x5A]), // PE executable
      Buffer.from([0x7F, 0x45, 0x4C, 0x46]), // ELF executable
      Buffer.from([0xCA, 0xFE, 0xBA, 0xBE]), // Mach-O executable
      Buffer.from([0x50, 0x4B, 0x03, 0x04]), // ZIP (could contain malicious files)
    ]

    const fileHeader = file.buffer.slice(0, 10)
    for (const signature of suspiciousSignatures) {
      if (fileHeader.indexOf(signature) === 0) {
        throw new Error('File type not allowed for security reasons')
      }
    }

    // Check for embedded scripts in images
    if (file.mimetype.startsWith('image/')) {
      const fileContent = file.buffer.toString('utf8')
      const scriptPatterns = [
        /<script/i,
        /javascript:/i,
        /vbscript:/i,
        /onload=/i,
        /onerror=/i
      ]

      if (scriptPatterns.some(pattern => pattern.test(fileContent))) {
        throw new Error('Image contains potentially malicious content')
      }
    }

    // Check file size consistency
    if (file.size !== file.buffer.length) {
      throw new Error('File size mismatch detected')
    }
  }

  /**
   * Validate user storage quota
   */
  private validateUserStorageQuota(userId: string | undefined, fileSize: number): void {
    if (!userId) {
      throw new Error('User authentication required for file upload')
    }

    // This would integrate with user service to check storage quota
    // For now, implement basic validation
    const maxFileSize = 50 * 1024 * 1024 // 50MB per file
    const maxTotalStorage = 5 * 1024 * 1024 * 1024 // 5GB total storage

    if (fileSize > maxFileSize) {
      throw new Error(`File size exceeds maximum allowed size of ${Math.round(maxFileSize / (1024 * 1024))}MB`)
    }

    // Additional quota checks would be implemented here
  }

  /**
   * Validate password strength for file sharing
   */
  private validatePasswordStrength(password: string): void {
    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters long')
    }

    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      throw new Error('Password must contain at least one uppercase letter, one lowercase letter, and one number')
    }

    // Check for common weak passwords
    const weakPasswords = ['password', '123456', 'qwerty', 'abc123']
    if (weakPasswords.includes(password.toLowerCase())) {
      throw new Error('Password is too weak')
    }
  }

  /**
   * Validate file upload rate limiting
   */
  private validateFileUploadRateLimit(req: Request): void {
    const maxUploadsPerHour = 50
    const windowMs = 60 * 60 * 1000 // 1 hour
    
    this.validateRateLimit(req, maxUploadsPerHour, windowMs)
  }

  /**
   * Validate file download rate limiting
   */
  private validateFileDownloadRateLimit(req: Request): void {
    const maxDownloadsPerMinute = 100
    const windowMs = 60 * 1000 // 1 minute
    
    this.validateRateLimit(req, maxDownloadsPerMinute, windowMs)
  }

  /**
   * Validate file sharing rate limiting
   */
  private validateFileSharingRateLimit(req: Request): void {
    const maxSharesPerHour = 20
    const windowMs = 60 * 60 * 1000 // 1 hour
    
    this.validateRateLimit(req, maxSharesPerHour, windowMs)
  }

  /**
   * Validate file search rate limiting
   */
  private validateFileSearchRateLimit(req: Request): void {
    const maxSearchesPerMinute = 30
    const windowMs = 60 * 1000 // 1 minute
    
    this.validateRateLimit(req, maxSearchesPerMinute, windowMs)
  }

  /**
   * Validate bulk operation rate limiting
   */
  private validateBulkOperationRateLimit(req: Request, operationCount: number): void {
    const maxBulkOperationsPerHour = 10
    const windowMs = 60 * 60 * 1000 // 1 hour
    
    this.validateRateLimit(req, maxBulkOperationsPerHour, windowMs)

    // Additional validation based on operation size
    if (operationCount > 50) {
      const maxLargeBulkOperationsPerDay = 3
      const dayWindowMs = 24 * 60 * 60 * 1000 // 24 hours
      this.validateRateLimit(req, maxLargeBulkOperationsPerDay, dayWindowMs)
    }
  }

  /**
   * Create comprehensive validation middleware for file management endpoints
   */
  createFileManagementValidation = (validationType: 'upload' | 'download' | 'share' | 'manage' | 'admin') => {
    const validators = [this.validateFilePermissions]

    switch (validationType) {
      case 'upload':
        validators.push(this.validateUploadFile)
        break
      case 'download':
        validators.push(this.validateDownloadFile)
        break
      case 'share':
        validators.push(this.validateShareFile)
        break
      case 'manage':
        validators.push(this.validateUpdateFileMetadata)
        break
      case 'admin':
        validators.push(this.validateGetFileStatistics)
        break
    }

    return this.chainValidators(...validators)
  }

  /**
   * Validate file permissions
   */
  private validateFilePermissions = (req: Request, res: Response, next: NextFunction) => {
    try {
      // This would validate:
      // 1. User has permission to access/modify files
      // 2. File ownership validation
      // 3. Sharing permissions
      
      const userId = req.user?.id
      if (!userId) {
        throw new Error('User authentication required for file operations')
      }

      // Placeholder - would integrate with file service
      this.logValidation('filePermissions', userId)

      next()
    } catch (error) {
      next(error)
    }
  }
}

// Export singleton instance
export const fileManagementValidator = new FileManagementValidator()
