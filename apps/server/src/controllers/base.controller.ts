import { Request, Response, NextFunction } from 'express'
import { ApiError } from '../utils/apiError'
import { logger } from '../utils/logger'
import { z } from 'zod'

/**
 * Base Controller Class
 * Provides common functionality for all controllers including:
 * - Response formatting
 * - Error handling
 * - Validation helpers
 * - Async wrapper
 * - Pagination utilities
 */
export abstract class BaseController {
  /**
   * Async wrapper for controller methods
   * Automatically catches errors and passes them to error handler
   */
  protected asyncHandler = (fn: Function) => {
    return (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch(next)
    }
  }

  /**
   * Send success response
   */
  protected sendSuccess<T>(
    res: Response,
    data: T,
    message?: string,
    statusCode: number = 200,
    pagination?: {
      page: number
      limit: number
      total: number
      totalPages: number
      hasNext: boolean
      hasPrev: boolean
    }
  ): void {
    const response: any = {
      success: true,
      message: message || 'Operation successful',
      data,
    }

    if (pagination) {
      response.pagination = pagination
    }

    res.status(statusCode).json(response)
  }

  /**
   * Send error response
   */
  protected sendError(
    res: Response,
    error: ApiError | Error,
    statusCode?: number
  ): void {
    if (error instanceof ApiError) {
      res.status(error.statusCode).json({
        success: false,
        error: {
          code: error.code,
          message: error.message,
          errors: error.errors,
        },
      })
    } else {
      logger.error('Unexpected error:', error)
      res.status(statusCode || 500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred',
        },
      })
    }
  }

  /**
   * Validate request data using Zod schema
   */
  protected validateData<T>(schema: z.ZodSchema<T>, data: unknown): T {
    try {
      return schema.parse(data)
    } catch (error) {
      if (error instanceof z.ZodError) {
        const details = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }))
        throw ApiError.badRequest('Validation failed', details)
      }
      throw error
    }
  }

  /**
   * Extract pagination parameters from query
   */
  protected getPaginationParams(query: any): {
    page: number
    limit: number
    skip: number
  } {
    const page = Math.max(1, parseInt(query.page) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20))
    const skip = (page - 1) * limit

    return { page, limit, skip }
  }

  /**
   * Calculate pagination metadata
   */
  protected calculatePagination(
    page: number,
    limit: number,
    total: number
  ): {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  } {
    const totalPages = Math.ceil(total / limit)
    const hasNext = page < totalPages
    const hasPrev = page > 1

    return {
      page,
      limit,
      total,
      totalPages,
      hasNext,
      hasPrev,
    }
  }

  /**
   * Extract user ID from authenticated request
   */
  protected getUserId(req: Request): string {
    const userId = req.user?.id
    if (!userId) {
      throw ApiError.unauthorized('User not authenticated')
    }
    return userId
  }

  /**
   * Extract user from authenticated request
   */
  protected getUser(req: Request): any {
    const user = req.user
    if (!user) {
      throw ApiError.unauthorized('User not authenticated')
    }
    return user
  }

  /**
   * Check if user has required role
   */
  protected requireRole(req: Request, roles: string[]): void {
    const user = this.getUser(req)
    if (!roles.includes(user.role)) {
      throw ApiError.forbidden('Insufficient permissions')
    }
  }

  /**
   * Check if user is admin
   */
  protected requireAdmin(req: Request): void {
    this.requireRole(req, ['admin'])
  }

  /**
   * Check if user is moderator or admin
   */
  protected requireModerator(req: Request): void {
    this.requireRole(req, ['admin', 'moderator'])
  }

  /**
   * Extract and validate query parameters
   */
  protected getQueryParams<T>(
    req: Request,
    schema: z.ZodSchema<T>
  ): T {
    return this.validateData(schema, req.query) as T
  }

  /**
   * Extract and validate body parameters
   */
  protected getBodyParams<T>(
    req: Request,
    schema: z.ZodSchema<T>
  ): T {
    return this.validateData(schema, req.body)
  }

  /**
   * Extract and validate path parameters
   */
  protected getPathParams<T>(
    req: Request,
    schema: z.ZodSchema<T>
  ): T {
    return this.validateData(schema, req.params)
  }

  /**
   * Log controller action
   */
  protected logAction(
    action: string,
    userId?: string,
    metadata?: Record<string, any>
  ): void {
    logger.info(`Controller action: ${action}`, {
      userId,
      ...metadata,
    })
  }

  /**
   * Transform data for API response
   */
  protected transformData<T, R>(
    data: T,
    transformer: (item: T) => R
  ): R
  protected transformData<T, R>(
    data: T[],
    transformer: (item: T) => R
  ): R[]
  protected transformData<T, R>(
    data: T | T[],
    transformer: (item: T) => R
  ): R | R[] {
    if (Array.isArray(data)) {
      return data.map(transformer)
    }
    return transformer(data)
  }

  /**
   * Filter sensitive data from response
   */
  protected filterSensitiveData<T extends Record<string, any>>(
    data: T,
    sensitiveFields: (keyof T)[]
  ): Omit<T, keyof T> {
    const filtered = { ...data }
    sensitiveFields.forEach(field => {
      delete filtered[field]
    })
    return filtered
  }

  /**
   * Handle file upload validation
   */
  protected validateFileUpload(
    file: Express.Multer.File | undefined,
    options: {
      required?: boolean
      maxSize?: number
      allowedTypes?: string[]
    } = {}
  ): Express.Multer.File {
    const { required = true, maxSize = 10 * 1024 * 1024, allowedTypes } = options

    if (!file) {
      if (required) {
        throw ApiError.badRequest('File is required')
      }
      return file as any
    }

    if (file.size > maxSize) {
      throw ApiError.badRequest(`File size exceeds limit of ${maxSize} bytes`)
    }

    if (allowedTypes && !allowedTypes.includes(file.mimetype)) {
      throw ApiError.badRequest(`File type ${file.mimetype} is not allowed`)
    }

    return file
  }

  /**
   * Create standardized API response
   */
  protected createResponse<T>(
    data: T,
    message?: string,
    pagination?: any
  ): {
    success: boolean
    message: string
    data: T
    pagination?: any
  } {
    const response: any = {
      success: true,
      message: message || 'Operation successful',
      data,
    }

    if (pagination) {
      response.pagination = pagination
    }

    return response
  }

  /**
   * Handle bulk operations
   */
  protected async handleBulkOperation<T, R>(
    items: T[],
    operation: (item: T) => Promise<R>,
    options: {
      batchSize?: number
      continueOnError?: boolean
    } = {}
  ): Promise<{
    successful: R[]
    failed: { item: T; error: Error }[]
  }> {
    const { batchSize = 10, continueOnError = false } = options
    const successful: R[] = []
    const failed: { item: T; error: Error }[] = []

    // Process items in batches
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize)
      
      const promises = batch.map(async (item) => {
        try {
          const result = await operation(item)
          return { success: true, result, item }
        } catch (error) {
          return { success: false, error: error as Error, item }
        }
      })

      const results = await Promise.all(promises)

      for (const result of results) {
        if (result.success && result.result !== undefined) {
          successful.push(result.result)
        } else if (!result.success && result.error) {
          failed.push({ item: result.item, error: result.error })
          if (!continueOnError) {
            throw result.error
          }
        }
      }
    }

    return { successful, failed }
  }
}
