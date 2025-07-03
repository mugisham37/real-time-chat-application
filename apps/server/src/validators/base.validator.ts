import { Request, Response, NextFunction } from 'express'
import { z, ZodSchema, ZodError } from 'zod'
import { ApiError } from '../utils/apiError'
import { logger } from '../utils/logger'

/**
 * Base Validator Class
 * Provides common validation functionality for all controller validators
 */
export abstract class BaseValidator {
  /**
   * Validate request data using Zod schema
   */
  protected validateData<T>(schema: ZodSchema<T>, data: unknown, context?: string): T {
    try {
      return schema.parse(data)
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }))
        
        logger.warn(`Validation failed${context ? ` for ${context}` : ''}:`, {
          errors: details,
          data: typeof data === 'object' ? JSON.stringify(data) : data
        })
        
        throw ApiError.badRequest(`Validation failed${context ? ` for ${context}` : ''}`, details)
      }
      throw error
    }
  }

  /**
   * Async validation wrapper
   */
  protected async validateDataAsync<T>(schema: ZodSchema<T>, data: unknown, context?: string): Promise<T> {
    try {
      return await schema.parseAsync(data)
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }))
        
        logger.warn(`Async validation failed${context ? ` for ${context}` : ''}:`, {
          errors: details,
          data: typeof data === 'object' ? JSON.stringify(data) : data
        })
        
        throw ApiError.badRequest(`Validation failed${context ? ` for ${context}` : ''}`, details)
      }
      throw error
    }
  }

  /**
   * Sanitize input to prevent XSS attacks
   */
  protected sanitizeInput(input: string): string {
    if (typeof input !== 'string') return input

    return input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<[^>]*>/g, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .trim()
  }

  /**
   * Sanitize object recursively
   */
  protected sanitizeObject(obj: any): any {
    if (typeof obj === 'string') {
      return this.sanitizeInput(obj)
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item))
    }
    
    if (obj && typeof obj === 'object') {
      const sanitized: any = {}
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = this.sanitizeObject(value)
      }
      return sanitized
    }
    
    return obj
  }

  /**
   * Validate user permissions
   */
  protected validateUserPermissions(req: Request, requiredRoles: string[]): void {
    const user = req.user
    if (!user) {
      throw ApiError.unauthorized('User not authenticated')
    }

    if (requiredRoles.length > 0 && user.role && !requiredRoles.includes(user.role)) {
      throw ApiError.forbidden('Insufficient permissions')
    }
  }

  /**
   * Validate user is admin
   */
  protected validateAdmin(req: Request): void {
    this.validateUserPermissions(req, ['admin'])
  }

  /**
   * Validate user is moderator or admin
   */
  protected validateModerator(req: Request): void {
    this.validateUserPermissions(req, ['admin', 'moderator'])
  }

  /**
   * Validate file upload
   */
  protected validateFileUpload(
    file: Express.Multer.File | undefined,
    options: {
      required?: boolean
      maxSize?: number
      allowedTypes?: string[]
      allowedExtensions?: string[]
    } = {}
  ): Express.Multer.File | undefined {
    const { 
      required = false, 
      maxSize = 10 * 1024 * 1024, // 10MB default
      allowedTypes = [],
      allowedExtensions = []
    } = options

    if (!file) {
      if (required) {
        throw ApiError.badRequest('File is required')
      }
      return undefined
    }

    // Validate file size
    if (file.size > maxSize) {
      throw ApiError.badRequest(`File size exceeds limit of ${Math.round(maxSize / (1024 * 1024))}MB`)
    }

    // Validate MIME type
    if (allowedTypes.length > 0 && !allowedTypes.includes(file.mimetype)) {
      throw ApiError.badRequest(`Invalid file type. Allowed types: ${allowedTypes.join(', ')}`)
    }

    // Validate file extension
    if (allowedExtensions.length > 0) {
      const parts = file.originalname.split('.')
      const fileExtension = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : ''
      if (!fileExtension || !allowedExtensions.includes(fileExtension)) {
        throw ApiError.badRequest(`Invalid file extension. Allowed extensions: ${allowedExtensions.join(', ')}`)
      }
    }

    return file
  }

  /**
   * Validate pagination parameters
   */
  protected validatePagination(query: any): { page: number; limit: number; skip: number } {
    const paginationSchema = z.object({
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(20),
      skip: z.coerce.number().min(0).optional()
    })

    const validated = this.validateData(paginationSchema, query || {}, 'pagination')
    const page = validated.page ?? 1
    const limit = validated.limit ?? 20
    const skip = validated.skip ?? (page - 1) * limit

    return {
      page,
      limit,
      skip
    }
  }

  /**
   * Validate date range
   */
  protected validateDateRange(startDate?: string, endDate?: string): { startDate?: Date; endDate?: Date } {
    const result: { startDate?: Date; endDate?: Date } = {}

    if (startDate) {
      const start = new Date(startDate)
      if (isNaN(start.getTime())) {
        throw ApiError.badRequest('Invalid start date format')
      }
      result.startDate = start
    }

    if (endDate) {
      const end = new Date(endDate)
      if (isNaN(end.getTime())) {
        throw ApiError.badRequest('Invalid end date format')
      }
      result.endDate = end
    }

    if (result.startDate && result.endDate && result.startDate > result.endDate) {
      throw ApiError.badRequest('Start date must be before end date')
    }

    return result
  }

  /**
   * Validate array of IDs
   */
  protected validateIds(ids: string[], context: string = 'IDs'): string[] {
    if (!Array.isArray(ids)) {
      throw ApiError.badRequest(`${context} must be an array`)
    }

    const idSchema = z.string().min(1, `Invalid ${context.toLowerCase()}`)
    return ids.map((id, index) => {
      try {
        return this.validateData(idSchema, id, `${context}[${index}]`)
      } catch (error) {
        throw ApiError.badRequest(`Invalid ${context.toLowerCase()} at index ${index}`)
      }
    })
  }

  /**
   * Create validation middleware
   */
  protected createValidationMiddleware<T>(
    schema: ZodSchema<T>,
    target: 'body' | 'query' | 'params' = 'body',
    options: {
      sanitize?: boolean
      context?: string
    } = {}
  ) {
    const { sanitize = true, context } = options

    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        let data = req[target]

        // Sanitize if requested
        if (sanitize && (target === 'body' || target === 'query')) {
          data = this.sanitizeObject(data)
        }

        // Validate
        const validated = await this.validateDataAsync(schema, data, context)
        
        // Update request object
        req[target] = validated

        next()
      } catch (error) {
        next(error)
      }
    }
  }

  /**
   * Validate rate limiting parameters
   */
  protected validateRateLimit(req: Request, maxRequests: number, windowMs: number): void {
    const key = `rate_limit:${req.ip}:${req.path}`
    // This would integrate with your rate limiting system
    // For now, we'll just validate the parameters
    if (maxRequests <= 0) {
      throw ApiError.badRequest('Invalid rate limit configuration')
    }
    if (windowMs <= 0) {
      throw ApiError.badRequest('Invalid rate limit window')
    }
  }

  /**
   * Validate user ownership of resource
   */
  protected validateResourceOwnership(userId: string, resourceOwnerId: string, resourceType: string): void {
    if (userId !== resourceOwnerId) {
      throw ApiError.forbidden(`You don't have permission to access this ${resourceType}`)
    }
  }

  /**
   * Validate enum value
   */
  protected validateEnum<T extends string>(value: string, enumValues: T[], context: string): T {
    if (!enumValues.includes(value as T)) {
      throw ApiError.badRequest(`Invalid ${context}. Must be one of: ${enumValues.join(', ')}`)
    }
    return value as T
  }

  /**
   * Validate URL format
   */
  protected validateUrl(url: string, context: string = 'URL'): string {
    try {
      new URL(url)
      return url
    } catch (error) {
      throw ApiError.badRequest(`Invalid ${context} format`)
    }
  }

  /**
   * Validate email format
   */
  protected validateEmail(email: string): string {
    const emailSchema = z.string().email('Invalid email format')
    return this.validateData(emailSchema, email, 'email')
  }

  /**
   * Log validation action
   */
  protected logValidation(action: string, userId?: string, metadata?: Record<string, any>): void {
    logger.info(`Validation: ${action}`, {
      userId,
      timestamp: new Date().toISOString(),
      ...metadata
    })
  }

  /**
   * Create compound validation middleware that chains multiple validators
   */
  protected chainValidators(...validators: Array<(req: Request, res: Response, next: NextFunction) => void>) {
    return (req: Request, res: Response, next: NextFunction) => {
      let index = 0

      const runNext = (error?: any) => {
        if (error) return next(error)
        
        if (index >= validators.length) return next()
        
        const validator = validators[index++]
        try {
          validator(req, res, runNext)
        } catch (err) {
          next(err)
        }
      }

      runNext()
    }
  }
}
