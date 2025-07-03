import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { BaseValidator } from './base.validator'

/**
 * Analytics Validator
 * Validates all analytics-related requests with comprehensive business logic
 */
export class AnalyticsValidator extends BaseValidator {
  /**
   * Validate getUserActivity request
   */
  validateGetUserActivity = (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate path parameters
      const paramsSchema = z.object({
        userId: z.string().min(1, 'User ID is required')
      })

      // Validate query parameters
      const querySchema = z.object({
        startTime: z.coerce.number().positive().optional(),
        endTime: z.coerce.number().positive().optional(),
        limit: z.coerce.number().min(1).max(100).default(100),
        activityTypes: z.string().optional().transform(val => 
          val ? val.split(',').map(s => s.trim()).filter(s => s.length > 0) : undefined
        )
      }).refine(data => {
        if (data.startTime && data.endTime && data.startTime >= data.endTime) {
          throw new Error('Start time must be before end time')
        }
        return true
      }, {
        message: 'Invalid time range'
      })

      const params = this.validateData(paramsSchema as any, req.params, 'path parameters') as any
      const query = this.validateData(querySchema as any, req.query, 'query parameters') as any

      // Validate user permissions - users can only view their own analytics unless admin
      const currentUserId = req.user?.id
      if (currentUserId !== params.userId) {
        this.validateAdmin(req)
      }

      // Validate activity types if provided
      if (query.activityTypes) {
        const validActivityTypes = [
          'login', 'message_sent', 'message_read', 'group_created', 
          'group_joined', 'call_initiated', 'call_received', 
          'profile_updated', 'search'
        ]
        
        const invalidTypes = query.activityTypes.filter((type: any) => !validActivityTypes.includes(type))
        if (invalidTypes.length > 0) {
          throw new Error(`Invalid activity types: ${invalidTypes.join(', ')}`)
        }
      }

      // Validate time range constraints (max 1 year)
      if (query.startTime && query.endTime) {
        const maxRange = 365 * 24 * 60 * 60 * 1000 // 1 year in milliseconds
        if (query.endTime - query.startTime > maxRange) {
          throw new Error('Time range cannot exceed 1 year')
        }
      }

      this.logValidation('getUserActivity', currentUserId, { 
        targetUserId: params.userId,
        timeRange: query.startTime && query.endTime ? 
          `${new Date(query.startTime).toISOString()} - ${new Date(query.endTime).toISOString()}` : 'all',
        limit: query.limit
      })

      req.params = params as any
      req.query = query as any
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate getUserActivityCounts request
   */
  validateGetUserActivityCounts = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        userId: z.string().min(1, 'User ID is required')
      })

      const querySchema = z.object({
        days: z.coerce.number().min(1).max(365).default(30),
        activityTypes: z.string().optional().transform(val => 
          val ? val.split(',').map(s => s.trim()).filter(s => s.length > 0) : undefined
        )
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters') as any
      const query = this.validateData(querySchema as any, req.query, 'query parameters') as any

      // Validate user permissions
      const currentUserId = req.user?.id
      if (currentUserId !== params.userId) {
        this.validateAdmin(req)
      }

      this.logValidation('getUserActivityCounts', currentUserId, { 
        targetUserId: params.userId,
        days: query.days
      })

      req.params = params as any
      req.query = query as any
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate getUserEngagementMetrics request
   */
  validateGetUserEngagementMetrics = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        userId: z.string().min(1, 'User ID is required')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      // Validate user permissions
      const currentUserId = req.user?.id
      if (currentUserId !== params.userId) {
        this.validateAdmin(req)
      }

      this.logValidation('getUserEngagementMetrics', currentUserId, { 
        targetUserId: params.userId
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate getGlobalActivityCounts request (Admin only)
   */
  validateGetGlobalActivityCounts = (req: Request, res: Response, next: NextFunction) => {
    try {
      this.validateAdmin(req)

      const querySchema = z.object({
        days: z.coerce.number().min(1).max(365).default(30),
        activityTypes: z.string().optional().transform(val => 
          val ? val.split(',').map(s => s.trim()).filter(s => s.length > 0) : undefined
        )
      })

      const query = this.validateData(querySchema as any, req.query, 'query parameters') as any

      this.logValidation('getGlobalActivityCounts', req.user?.id, { 
        days: query.days
      })

      req.query = query as any
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate getSystemStats request (Admin only)
   */
  validateGetSystemStats = (req: Request, res: Response, next: NextFunction) => {
    try {
      this.validateAdmin(req)

      this.logValidation('getSystemStats', req.user?.id)

      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate trackActivity request
   */
  validateTrackActivity = (req: Request, res: Response, next: NextFunction) => {
    try {
      const bodySchema = z.object({
        type: z.enum([
          'login',
          'message_sent',
          'message_read',
          'group_created',
          'group_joined',
          'call_initiated',
          'call_received',
          'profile_updated',
          'search'
        ], {
          errorMap: () => ({ message: 'Invalid activity type' })
        }),
        metadata: z.record(z.any()).optional().refine(data => {
          if (data && Object.keys(data).length > 50) {
            throw new Error('Metadata cannot have more than 50 properties')
          }
          return true
        }, {
          message: 'Metadata too large'
        })
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Validate metadata size
      if (body.metadata) {
        const metadataString = JSON.stringify(body.metadata)
        if (metadataString.length > 10000) { // 10KB limit
          throw new Error('Metadata size cannot exceed 10KB')
        }
      }

      this.logValidation('trackActivity', req.user?.id, { 
        activityType: body.type,
        hasMetadata: !!body.metadata
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate getDashboardData request (Admin only)
   */
  validateGetDashboardData = (req: Request, res: Response, next: NextFunction) => {
    try {
      this.validateAdmin(req)

      const querySchema = z.object({
        period: z.enum(['day', 'week', 'month']).default('week')
      })

      const query = this.validateData(querySchema, req.query, 'query parameters') as any

      this.logValidation('getDashboardData', req.user?.id, { 
        period: query.period
      })

      req.query = query
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate exportAnalytics request (Admin only)
   */
  validateExportAnalytics = (req: Request, res: Response, next: NextFunction) => {
    try {
      this.validateAdmin(req)

      const querySchema = z.object({
        format: z.enum(['json', 'csv']).default('json'),
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional(),
        includeUserData: z.coerce.boolean().default(false)
      }).refine(data => {
        if (data.startDate && data.endDate) {
          const start = new Date(data.startDate)
          const end = new Date(data.endDate)
          if (start >= end) {
            throw new Error('Start date must be before end date')
          }
          
          // Limit export range to 1 year
          const maxRange = 365 * 24 * 60 * 60 * 1000
          if (end.getTime() - start.getTime() > maxRange) {
            throw new Error('Export range cannot exceed 1 year')
          }
        }
        return true
      }, {
        message: 'Invalid date range'
      })

      const query = this.validateData(querySchema, req.query, 'query parameters') as any

      this.logValidation('exportAnalytics', req.user?.id, { 
        format: query.format,
        dateRange: query.startDate && query.endDate ? 
          `${query.startDate} - ${query.endDate}` : 'all',
        includeUserData: query.includeUserData
      })

      req.query = query
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate rate limiting for analytics endpoints
   */
  validateAnalyticsRateLimit = (req: Request, res: Response, next: NextFunction) => {
    try {
      // Different rate limits based on endpoint complexity
      const endpoint = req.route?.path || req.path
      let maxRequests = 100
      let windowMs = 60 * 1000 // 1 minute

      if (endpoint.includes('export')) {
        maxRequests = 5 // Very restrictive for exports
        windowMs = 60 * 1000
      } else if (endpoint.includes('dashboard') || endpoint.includes('global')) {
        maxRequests = 30 // Moderate for admin endpoints
        windowMs = 60 * 1000
      } else if (endpoint.includes('track')) {
        maxRequests = 1000 // High for tracking
        windowMs = 60 * 1000
      }

      this.validateRateLimit(req, maxRequests, windowMs)
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate analytics data integrity
   */
  validateAnalyticsDataIntegrity = (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate that user exists and is active
      if (!req.user) {
        throw new Error('User authentication required for analytics')
      }

      // Note: User status validation would be implemented when user status field is available

      // Validate request timestamp to prevent replay attacks
      const requestTime = Date.now()
      const maxAge = 5 * 60 * 1000 // 5 minutes
      
      if (req.headers['x-timestamp']) {
        const clientTime = parseInt(req.headers['x-timestamp'] as string)
        if (Math.abs(requestTime - clientTime) > maxAge) {
          throw new Error('Request timestamp too old or too far in future')
        }
      }

      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Create comprehensive validation middleware for analytics endpoints
   */
  createAnalyticsValidation = (validationType: 'user' | 'admin' | 'tracking' | 'export') => {
    const validators = [this.validateAnalyticsDataIntegrity, this.validateAnalyticsRateLimit]

    switch (validationType) {
      case 'admin':
        validators.push((req: Request, res: Response, next: NextFunction) => {
          this.validateAdmin(req)
          next()
        })
        break
      case 'tracking':
        validators.push(this.validateTrackActivity)
        break
      case 'export':
        validators.push(this.validateExportAnalytics)
        break
    }

    return this.chainValidators(...validators)
  }
}

// Export singleton instance
export const analyticsValidator = new AnalyticsValidator()
