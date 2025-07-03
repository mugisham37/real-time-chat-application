import { getRedisManager } from "../config/redis"
import { logger } from "../utils/logger"
import { ApiError } from "../utils/apiError"
import { userRepository } from "@chatapp/database"
import { analyticsService } from "./analytics.service"
import crypto from "crypto"
import path from "path"
import fs from "fs/promises"

interface FileMetadata {
  id: string
  originalName: string
  fileName: string
  mimeType: string
  size: number
  uploadedBy: string
  uploadedAt: Date
  path: string
  url: string
  isPublic: boolean
  downloadCount: number
  expiresAt?: Date
  checksum: string
  thumbnailUrl?: string
  metadata?: {
    width?: number
    height?: number
    duration?: number
    bitrate?: number
    codec?: string
  }
}

interface FileUploadOptions {
  maxSize?: number
  allowedTypes?: string[]
  generateThumbnail?: boolean
  isPublic?: boolean
  expiresInDays?: number
  compress?: boolean
}

interface FileShare {
  id: string
  fileId: string
  sharedBy: string
  sharedWith?: string[]
  shareType: "public" | "private" | "password" | "expiring"
  password?: string
  expiresAt?: Date
  downloadLimit?: number
  downloadCount: number
  createdAt: Date
}

interface FileVersion {
  id: string
  fileId: string
  version: number
  fileName: string
  size: number
  uploadedBy: string
  uploadedAt: Date
  checksum: string
  changes?: string
}

export class FileManagementService {
  private redis = getRedisManager()
  private uploadPath = process.env.UPLOAD_PATH || "./uploads"
  private maxFileSize = parseInt(process.env.MAX_FILE_SIZE || "50") * 1024 * 1024 // 50MB default

  constructor() {
    this.ensureUploadDirectory()
  }

  /**
   * Upload a file
   */
  async uploadFile(
    file: {
      buffer: Buffer
      originalname: string
      mimetype: string
      size: number
    },
    uploadedBy: string,
    options: FileUploadOptions = {}
  ): Promise<FileMetadata> {
    try {
      const {
        maxSize = this.maxFileSize,
        allowedTypes = [],
        generateThumbnail = false,
        isPublic = false,
        expiresInDays,
        compress = false
      } = options

      // Validate file size
      if (file.size > maxSize) {
        throw ApiError.badRequest(`File size exceeds maximum allowed size of ${maxSize / (1024 * 1024)}MB`)
      }

      // Validate file type
      if (allowedTypes.length > 0 && !allowedTypes.includes(file.mimetype)) {
        throw ApiError.badRequest(`File type ${file.mimetype} is not allowed`)
      }

      // Generate unique filename
      const fileExtension = path.extname(file.originalname)
      const fileName = `${crypto.randomUUID()}${fileExtension}`
      const filePath = path.join(this.uploadPath, fileName)

      // Calculate checksum
      const checksum = crypto.createHash('sha256').update(file.buffer).digest('hex')

      // Check for duplicate files
      const existingFile = await this.findFileByChecksum(checksum, uploadedBy)
      if (existingFile) {
        logger.info(`Duplicate file detected, returning existing file: ${existingFile.id}`)
        return existingFile
      }

      // Process file (compress if needed)
      let processedBuffer = file.buffer
      if (compress && this.isCompressibleType(file.mimetype)) {
        processedBuffer = await this.compressFile(file.buffer, file.mimetype)
      }

      // Save file to disk
      await fs.writeFile(filePath, processedBuffer)

      // Generate file metadata
      const fileMetadata: FileMetadata = {
        id: crypto.randomUUID(),
        originalName: file.originalname,
        fileName,
        mimeType: file.mimetype,
        size: processedBuffer.length,
        uploadedBy,
        uploadedAt: new Date(),
        path: filePath,
        url: `/files/${fileName}`,
        isPublic,
        downloadCount: 0,
        checksum,
        expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000) : undefined
      }

      // Generate thumbnail if requested and file is an image
      if (generateThumbnail && this.isImageType(file.mimetype)) {
        fileMetadata.thumbnailUrl = await this.generateThumbnail(filePath, fileName)
      }

      // Extract metadata for media files
      if (this.isMediaType(file.mimetype)) {
        fileMetadata.metadata = await this.extractMediaMetadata(filePath, file.mimetype)
      }

      // Store file metadata in Redis and database
      await this.storeFileMetadata(fileMetadata)

      // Track file upload
      await analyticsService.trackUserActivity(uploadedBy, {
        type: "profile_updated",
        metadata: {
          action: "file_uploaded",
          fileName: file.originalname,
          fileSize: file.size,
          mimeType: file.mimetype
        }
      })

      // Update user storage usage
      await this.updateUserStorageUsage(uploadedBy, processedBuffer.length)

      logger.info(`File uploaded successfully: ${fileMetadata.id}`, {
        fileName: file.originalname,
        size: file.size,
        uploadedBy
      })

      return fileMetadata
    } catch (error) {
      logger.error("Error uploading file:", error)
      throw error
    }
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(fileId: string, userId?: string): Promise<FileMetadata> {
    try {
      // Try to get from cache first
      const cachedMetadata = await this.redis.getJSON(`file:${fileId}`)
      
      let fileMetadata: FileMetadata
      if (cachedMetadata) {
        fileMetadata = cachedMetadata as FileMetadata
      } else {
        // Fallback to database (would need to implement)
        throw ApiError.notFound("File not found")
      }

      // Check access permissions
      if (!fileMetadata.isPublic && userId !== fileMetadata.uploadedBy) {
        // Check if file is shared with user
        const hasAccess = await this.checkFileAccess(fileId, userId || "")
        if (!hasAccess) {
          throw ApiError.forbidden("Access denied to this file")
        }
      }

      return fileMetadata
    } catch (error) {
      logger.error(`Error getting file metadata for ${fileId}:`, error)
      throw error
    }
  }

  /**
   * Download file
   */
  async downloadFile(fileId: string, userId?: string): Promise<{
    buffer: Buffer
    metadata: FileMetadata
  }> {
    try {
      const fileMetadata = await this.getFileMetadata(fileId, userId)

      // Check if file has expired
      if (fileMetadata.expiresAt && new Date() > fileMetadata.expiresAt) {
        throw ApiError.badRequest("File has expired")
      }

      // Read file from disk
      const buffer = await fs.readFile(fileMetadata.path)

      // Increment download count
      await this.incrementDownloadCount(fileId)

      // Track download
      if (userId) {
        await analyticsService.trackUserActivity(userId, {
          type: "profile_updated",
          metadata: {
            action: "file_downloaded",
            fileId,
            fileName: fileMetadata.originalName
          }
        })
      }

      logger.info(`File downloaded: ${fileId}`, { userId, fileName: fileMetadata.originalName })

      return { buffer, metadata: fileMetadata }
    } catch (error) {
      logger.error(`Error downloading file ${fileId}:`, error)
      throw error
    }
  }

  /**
   * Delete file
   */
  async deleteFile(fileId: string, userId: string): Promise<boolean> {
    try {
      const fileMetadata = await this.getFileMetadata(fileId, userId)

      // Check if user owns the file
      if (fileMetadata.uploadedBy !== userId) {
        throw ApiError.forbidden("You can only delete your own files")
      }

      // Delete file from disk
      try {
        await fs.unlink(fileMetadata.path)
      } catch (error) {
        logger.warn(`File not found on disk: ${fileMetadata.path}`)
      }

      // Delete thumbnail if exists
      if (fileMetadata.thumbnailUrl) {
        const thumbnailPath = path.join(this.uploadPath, "thumbnails", path.basename(fileMetadata.thumbnailUrl))
        try {
          await fs.unlink(thumbnailPath)
        } catch (error) {
          logger.warn(`Thumbnail not found: ${thumbnailPath}`)
        }
      }

      // Remove metadata from cache and database
      await this.redis.del(`file:${fileId}`)

      // Update user storage usage
      await this.updateUserStorageUsage(userId, -fileMetadata.size)

      // Track file deletion
      await analyticsService.trackUserActivity(userId, {
        type: "profile_updated",
        metadata: {
          action: "file_deleted",
          fileId,
          fileName: fileMetadata.originalName
        }
      })

      logger.info(`File deleted: ${fileId}`, { userId, fileName: fileMetadata.originalName })

      return true
    } catch (error) {
      logger.error(`Error deleting file ${fileId}:`, error)
      throw error
    }
  }

  /**
   * Share file
   */
  async shareFile(
    fileId: string,
    userId: string,
    shareOptions: {
      shareType: "public" | "private" | "password" | "expiring"
      sharedWith?: string[]
      password?: string
      expiresInHours?: number
      downloadLimit?: number
    }
  ): Promise<FileShare> {
    try {
      const fileMetadata = await this.getFileMetadata(fileId, userId)

      // Check if user owns the file
      if (fileMetadata.uploadedBy !== userId) {
        throw ApiError.forbidden("You can only share your own files")
      }

      const fileShare: FileShare = {
        id: crypto.randomUUID(),
        fileId,
        sharedBy: userId,
        shareType: shareOptions.shareType,
        sharedWith: shareOptions.sharedWith,
        password: shareOptions.password,
        expiresAt: shareOptions.expiresInHours 
          ? new Date(Date.now() + shareOptions.expiresInHours * 60 * 60 * 1000) 
          : undefined,
        downloadLimit: shareOptions.downloadLimit,
        downloadCount: 0,
        createdAt: new Date()
      }

      // Store share information
      await this.redis.setJSON(`file_share:${fileShare.id}`, fileShare, 86400 * 7) // 7 days

      // Track file sharing
      await analyticsService.trackUserActivity(userId, {
        type: "profile_updated",
        metadata: {
          action: "file_shared",
          fileId,
          shareType: shareOptions.shareType
        }
      })

      logger.info(`File shared: ${fileId}`, { userId, shareType: shareOptions.shareType })

      return fileShare
    } catch (error) {
      logger.error(`Error sharing file ${fileId}:`, error)
      throw error
    }
  }

  /**
   * Get user files
   */
  async getUserFiles(
    userId: string,
    options: {
      limit?: number
      skip?: number
      mimeType?: string
      sortBy?: "name" | "size" | "date"
      sortOrder?: "asc" | "desc"
    } = {}
  ): Promise<{
    files: FileMetadata[]
    total: number
    storageUsed: number
    storageLimit: number
  }> {
    try {
      const { limit = 20, skip = 0, mimeType, sortBy = "date", sortOrder = "desc" } = options

      // Get user files from cache/database
      const pattern = `file:*`
      const keys = await this.redis.keys(pattern)
      
      const userFiles: FileMetadata[] = []
      
      for (const key of keys) {
        const fileData = await this.redis.getJSON(key)
        if (fileData) {
          const file = fileData as FileMetadata
          if (file.uploadedBy === userId) {
            if (!mimeType || file.mimeType.includes(mimeType)) {
              userFiles.push(file)
            }
          }
        }
      }

      // Sort files
      userFiles.sort((a, b) => {
        let comparison = 0
        switch (sortBy) {
          case "name":
            comparison = a.originalName.localeCompare(b.originalName)
            break
          case "size":
            comparison = a.size - b.size
            break
          case "date":
            comparison = new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime()
            break
        }
        return sortOrder === "desc" ? -comparison : comparison
      })

      // Paginate
      const paginatedFiles = userFiles.slice(skip, skip + limit)

      // Calculate storage usage
      const storageUsed = userFiles.reduce((total, file) => total + file.size, 0)
      const storageLimit = await this.getUserStorageLimit(userId)

      return {
        files: paginatedFiles,
        total: userFiles.length,
        storageUsed,
        storageLimit
      }
    } catch (error) {
      logger.error(`Error getting files for user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Create file version
   */
  async createFileVersion(
    fileId: string,
    newFile: {
      buffer: Buffer
      originalname: string
      mimetype: string
      size: number
    },
    userId: string,
    changes?: string
  ): Promise<FileVersion> {
    try {
      const originalFile = await this.getFileMetadata(fileId, userId)

      // Check if user owns the file
      if (originalFile.uploadedBy !== userId) {
        throw ApiError.forbidden("You can only create versions of your own files")
      }

      // Get current version count
      const versionCount = await this.getFileVersionCount(fileId)
      const newVersion = versionCount + 1

      // Generate unique filename for version
      const fileExtension = path.extname(newFile.originalname)
      const versionFileName = `${crypto.randomUUID()}_v${newVersion}${fileExtension}`
      const versionPath = path.join(this.uploadPath, "versions", versionFileName)

      // Ensure versions directory exists
      await fs.mkdir(path.dirname(versionPath), { recursive: true })

      // Save new version
      await fs.writeFile(versionPath, newFile.buffer)

      // Calculate checksum
      const checksum = crypto.createHash('sha256').update(newFile.buffer).digest('hex')

      const fileVersion: FileVersion = {
        id: crypto.randomUUID(),
        fileId,
        version: newVersion,
        fileName: versionFileName,
        size: newFile.size,
        uploadedBy: userId,
        uploadedAt: new Date(),
        checksum,
        changes
      }

      // Store version metadata
      await this.redis.setJSON(`file_version:${fileVersion.id}`, fileVersion, 86400 * 30) // 30 days

      logger.info(`File version created: ${fileVersion.id}`, { fileId, version: newVersion })

      return fileVersion
    } catch (error) {
      logger.error(`Error creating file version for ${fileId}:`, error)
      throw error
    }
  }

  /**
   * Get file statistics
   */
  async getFileStatistics(): Promise<{
    totalFiles: number
    totalSize: number
    filesByType: Record<string, number>
    sizeByType: Record<string, number>
    uploadsToday: number
    downloadsToday: number
    topUploaders: Array<{ userId: string; count: number }>
  }> {
    try {
      const pattern = `file:*`
      const keys = await this.redis.keys(pattern)
      
      const stats = {
        totalFiles: 0,
        totalSize: 0,
        filesByType: {} as Record<string, number>,
        sizeByType: {} as Record<string, number>,
        uploadsToday: 0,
        downloadsToday: 0,
        topUploaders: [] as Array<{ userId: string; count: number }>
      }

      const uploaderCounts: Record<string, number> = {}
      const today = new Date().toISOString().split('T')[0]

      for (const key of keys) {
        const fileData = await this.redis.getJSON(key)
        if (fileData) {
          const file = fileData as FileMetadata
          
          stats.totalFiles++
          stats.totalSize += file.size

          // Count by type
          const mainType = file.mimeType.split('/')[0]
          stats.filesByType[mainType] = (stats.filesByType[mainType] || 0) + 1
          stats.sizeByType[mainType] = (stats.sizeByType[mainType] || 0) + file.size

          // Count uploads today
          if (file.uploadedAt.toISOString().split('T')[0] === today) {
            stats.uploadsToday++
          }

          // Count by uploader
          uploaderCounts[file.uploadedBy] = (uploaderCounts[file.uploadedBy] || 0) + 1
        }
      }

      // Get top uploaders
      stats.topUploaders = Object.entries(uploaderCounts)
        .map(([userId, count]) => ({ userId, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)

      return stats
    } catch (error) {
      logger.error("Error getting file statistics:", error)
      throw error
    }
  }

  /**
   * Clean up expired files
   */
  async cleanupExpiredFiles(): Promise<number> {
    try {
      const pattern = `file:*`
      const keys = await this.redis.keys(pattern)
      let deletedCount = 0

      for (const key of keys) {
        const fileData = await this.redis.getJSON(key)
        if (fileData) {
          const file = fileData as FileMetadata
          
          if (file.expiresAt && new Date() > new Date(file.expiresAt)) {
            try {
              // Delete file from disk
              await fs.unlink(file.path)
              
              // Delete thumbnail if exists
              if (file.thumbnailUrl) {
                const thumbnailPath = path.join(this.uploadPath, "thumbnails", path.basename(file.thumbnailUrl))
                await fs.unlink(thumbnailPath).catch(() => {})
              }

              // Remove from cache
              await this.redis.del(key)
              
              deletedCount++
            } catch (error) {
              logger.error(`Error deleting expired file ${file.id}:`, error)
            }
          }
        }
      }

      logger.info(`Cleaned up ${deletedCount} expired files`)
      return deletedCount
    } catch (error) {
      logger.error("Error cleaning up expired files:", error)
      return 0
    }
  }

  /**
   * Helper methods
   */
  private async ensureUploadDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.uploadPath, { recursive: true })
      await fs.mkdir(path.join(this.uploadPath, "thumbnails"), { recursive: true })
      await fs.mkdir(path.join(this.uploadPath, "versions"), { recursive: true })
    } catch (error) {
      logger.error("Error creating upload directories:", error)
    }
  }

  private async storeFileMetadata(metadata: FileMetadata): Promise<void> {
    await this.redis.setJSON(`file:${metadata.id}`, metadata, 86400 * 30) // 30 days
  }

  private async findFileByChecksum(checksum: string, userId: string): Promise<FileMetadata | null> {
    const pattern = `file:*`
    const keys = await this.redis.keys(pattern)
    
    for (const key of keys) {
      const fileData = await this.redis.getJSON(key)
      if (fileData) {
        const file = fileData as FileMetadata
        if (file.checksum === checksum && file.uploadedBy === userId) {
          return file
        }
      }
    }
    
    return null
  }

  private async checkFileAccess(fileId: string, userId: string): Promise<boolean> {
    // Check if file is shared with user
    const sharePattern = `file_share:*`
    const shareKeys = await this.redis.keys(sharePattern)
    
    for (const key of shareKeys) {
      const shareData = await this.redis.getJSON(key)
      if (shareData) {
        const share = shareData as FileShare
        if (share.fileId === fileId) {
          if (share.shareType === "public") return true
          if (share.sharedWith?.includes(userId)) return true
        }
      }
    }
    
    return false
  }

  private async incrementDownloadCount(fileId: string): Promise<void> {
    const fileData = await this.redis.getJSON(`file:${fileId}`)
    if (fileData) {
      const file = fileData as FileMetadata
      file.downloadCount++
      await this.redis.setJSON(`file:${fileId}`, file, 86400 * 30)
    }
  }

  private async updateUserStorageUsage(userId: string, sizeChange: number): Promise<void> {
    const currentUsage = await this.redis.get(`storage:${userId}`) || "0"
    const newUsage = Math.max(0, parseInt(currentUsage, 10) + sizeChange)
    await this.redis.set(`storage:${userId}`, newUsage.toString(), 86400 * 7) // 7 days
  }

  private async getUserStorageLimit(userId: string): Promise<number> {
    // Default 1GB, could be customized per user
    return 1024 * 1024 * 1024
  }

  private async getFileVersionCount(fileId: string): Promise<number> {
    const pattern = `file_version:*`
    const keys = await this.redis.keys(pattern)
    let count = 0
    
    for (const key of keys) {
      const versionData = await this.redis.getJSON(key)
      if (versionData) {
        const version = versionData as FileVersion
        if (version.fileId === fileId) {
          count++
        }
      }
    }
    
    return count
  }

  private isCompressibleType(mimeType: string): boolean {
    return mimeType.startsWith('image/') && !mimeType.includes('gif')
  }

  private isImageType(mimeType: string): boolean {
    return mimeType.startsWith('image/')
  }

  private isMediaType(mimeType: string): boolean {
    return mimeType.startsWith('video/') || mimeType.startsWith('audio/')
  }

  private async compressFile(buffer: Buffer, mimeType: string): Promise<Buffer> {
    // Placeholder for file compression logic
    // In production, use libraries like sharp for images, ffmpeg for videos
    return buffer
  }

  private async generateThumbnail(filePath: string, fileName: string): Promise<string> {
    // Placeholder for thumbnail generation
    // In production, use sharp or similar library
    const thumbnailName = `thumb_${fileName}`
    return `/files/thumbnails/${thumbnailName}`
  }

  private async extractMediaMetadata(filePath: string, mimeType: string): Promise<any> {
    // Placeholder for media metadata extraction
    // In production, use ffprobe or similar tool
    return {}
  }
}

// Export singleton instance
export const fileManagementService = new FileManagementService()
