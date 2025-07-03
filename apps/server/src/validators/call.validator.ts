import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { BaseValidator } from './base.validator'

/**
 * Call Validator
 * Validates all call-related requests with comprehensive business logic
 */
export class CallValidator extends BaseValidator {
  /**
   * Validate initiate call request
   */
  validateInitiateCall = (req: Request, res: Response, next: NextFunction) => {
    try {
      const bodySchema = z.object({
        recipientId: z.string()
          .min(1, 'Recipient ID is required')
          .max(100, 'Invalid recipient ID format')
          .refine(val => val !== req.user?.id, {
            message: 'Cannot initiate call to yourself'
          }),
        callType: z.enum(['audio', 'video'], {
          errorMap: () => ({ message: 'Call type must be either "audio" or "video"' })
        }),
        metadata: z.record(z.any())
          .optional()
          .refine(data => {
            if (data && Object.keys(data).length > 20) {
              throw new Error('Metadata cannot have more than 20 properties')
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
        if (metadataString.length > 5000) { // 5KB limit
          throw new Error('Metadata size cannot exceed 5KB')
        }
      }

      // Rate limiting for call initiation
      this.validateCallInitiationRateLimit(req)

      this.logValidation('initiateCall', req.user?.id, { 
        recipientId: body.recipientId,
        callType: body.callType,
        hasMetadata: !!body.metadata
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate call action requests (answer, reject, end)
   */
  validateCallAction = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        callId: z.string()
          .min(1, 'Call ID is required')
          .max(100, 'Invalid call ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      // Additional validation for call actions
      const action = this.extractCallAction(req.path)
      this.validateCallActionPermissions(req, params.callId, action)

      this.logValidation('callAction', req.user?.id, { 
        callId: params.callId,
        action
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get call request
   */
  validateGetCall = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        callId: z.string()
          .min(1, 'Call ID is required')
          .max(100, 'Invalid call ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      this.logValidation('getCall', req.user?.id, { 
        callId: params.callId
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get recent calls request
   */
  validateGetRecentCalls = (req: Request, res: Response, next: NextFunction) => {
    try {
      const querySchema = z.object({
        limit: z.coerce.number()
          .min(1, 'Limit must be at least 1')
          .max(100, 'Limit cannot exceed 100')
          .default(20)
      })

      const query = this.validateData(querySchema as any, req.query, 'query parameters') as any

      this.logValidation('getRecentCalls', req.user?.id, { 
        limit: query.limit
      })

      req.query = query
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate call quality update request
   */
  validateUpdateCallQuality = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        callId: z.string()
          .min(1, 'Call ID is required')
          .max(100, 'Invalid call ID format')
      })

      const bodySchema = z.object({
        connectionQuality: z.enum(['excellent', 'good', 'fair', 'poor'], {
          errorMap: () => ({ message: 'Connection quality must be excellent, good, fair, or poor' })
        }),
        bandwidth: z.number()
          .positive('Bandwidth must be positive')
          .max(1000000, 'Bandwidth value too high') // 1Mbps max
          .optional(),
        latency: z.number()
          .min(0, 'Latency cannot be negative')
          .max(10000, 'Latency value too high') // 10 seconds max
          .optional(),
        packetLoss: z.number()
          .min(0, 'Packet loss cannot be negative')
          .max(100, 'Packet loss cannot exceed 100%')
          .optional()
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')
      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Validate quality metrics consistency
      this.validateQualityMetricsConsistency(body)

      this.logValidation('updateCallQuality', req.user?.id, { 
        callId: params.callId,
        quality: body.connectionQuality
      })

      req.params = params
      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate call history request
   */
  validateGetCallHistory = (req: Request, res: Response, next: NextFunction) => {
    try {
      const querySchema = z.object({
        callType: z.enum(['audio', 'video']).optional(),
        status: z.enum(['ringing', 'connected', 'rejected', 'ended', 'missed']).optional(),
        startDate: z.string()
          .datetime('Invalid start date format')
          .optional(),
        endDate: z.string()
          .datetime('Invalid end date format')
          .optional(),
        limit: z.coerce.number()
          .min(1, 'Limit must be at least 1')
          .max(100, 'Limit cannot exceed 100')
          .default(20),
        offset: z.coerce.number()
          .min(0, 'Offset cannot be negative')
          .default(0)
      }).refine(data => {
        if (data.startDate && data.endDate) {
          const start = new Date(data.startDate)
          const end = new Date(data.endDate)
          if (start >= end) {
            throw new Error('Start date must be before end date')
          }
          
          // Limit history range to 1 year
          const maxRange = 365 * 24 * 60 * 60 * 1000
          if (end.getTime() - start.getTime() > maxRange) {
            throw new Error('Date range cannot exceed 1 year')
          }
        }
        return true
      }, {
        message: 'Invalid date range'
      })

      const query = this.validateData(querySchema as any, req.query, 'query parameters') as any

      this.logValidation('getCallHistory', req.user?.id, { 
        filters: {
          callType: query.callType,
          status: query.status,
          dateRange: query.startDate && query.endDate ? 
            `${query.startDate} - ${query.endDate}` : 'all'
        },
        pagination: {
          limit: query.limit,
          offset: query.offset
        }
      })

      req.query = query
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate mark call as missed request (Admin only)
   */
  validateMarkCallAsMissed = (req: Request, res: Response, next: NextFunction) => {
    try {
      this.validateAdmin(req)

      const paramsSchema = z.object({
        callId: z.string()
          .min(1, 'Call ID is required')
          .max(100, 'Invalid call ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      this.logValidation('markCallAsMissed', req.user?.id, { 
        callId: params.callId
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate bulk call operations request (Admin only)
   */
  validateBulkCallOperations = (req: Request, res: Response, next: NextFunction) => {
    try {
      this.validateAdmin(req)

      const bodySchema = z.object({
        operation: z.enum(['cleanup', 'export', 'analyze'], {
          errorMap: () => ({ message: 'Operation must be cleanup, export, or analyze' })
        }),
        filters: z.object({
          olderThanHours: z.number()
            .positive('Hours must be positive')
            .max(8760, 'Cannot exceed 1 year (8760 hours)')
            .optional(),
          status: z.array(z.string())
            .max(10, 'Too many status filters')
            .optional(),
          callType: z.array(z.enum(['audio', 'video']))
            .max(2, 'Invalid call type filters')
            .optional()
        }).optional()
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Validate operation-specific requirements
      this.validateBulkOperationRequirements(body.operation, body.filters)

      this.logValidation('bulkCallOperations', req.user?.id, { 
        operation: body.operation,
        filters: body.filters
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Extract call action from request path
   */
  private extractCallAction(path: string): string {
    if (path.includes('/answer')) return 'answer'
    if (path.includes('/reject')) return 'reject'
    if (path.includes('/end')) return 'end'
    if (path.includes('/missed')) return 'missed'
    return 'unknown'
  }

  /**
   * Validate call action permissions
   */
  private validateCallActionPermissions(req: Request, callId: string, action: string): void {
    // This would typically check:
    // 1. User is a participant in the call
    // 2. Call is in appropriate state for the action
    // 3. User has permission to perform the action
    
    const userId = req.user?.id
    if (!userId) {
      throw new Error('User authentication required for call actions')
    }

    // Placeholder validation - would integrate with call service
    if (action === 'missed' && req.user?.role !== 'admin') {
      throw new Error('Only administrators can mark calls as missed')
    }
  }

  /**
   * Validate call initiation rate limiting
   */
  private validateCallInitiationRateLimit(req: Request): void {
    // Rate limiting for call initiation to prevent spam
    const maxCallsPerMinute = 5
    const maxCallsPerHour = 50
    const windowMs = 60 * 1000 // 1 minute
    
    this.validateRateLimit(req, maxCallsPerMinute, windowMs)
  }

  /**
   * Validate quality metrics consistency
   */
  private validateQualityMetricsConsistency(qualityData: any): void {
    const { connectionQuality, bandwidth, latency, packetLoss } = qualityData

    // Validate consistency between quality rating and metrics
    if (connectionQuality === 'excellent') {
      if (latency && latency > 100) {
        throw new Error('Latency too high for excellent quality rating')
      }
      if (packetLoss && packetLoss > 1) {
        throw new Error('Packet loss too high for excellent quality rating')
      }
    }

    if (connectionQuality === 'poor') {
      if (latency && latency < 200) {
        throw new Error('Latency inconsistent with poor quality rating')
      }
      if (packetLoss && packetLoss < 5) {
        throw new Error('Packet loss inconsistent with poor quality rating')
      }
    }

    // Validate bandwidth requirements for video calls
    if (bandwidth && bandwidth < 100000) { // 100kbps minimum
      throw new Error('Bandwidth too low for video calls')
    }
  }

  /**
   * Validate bulk operation requirements
   */
  private validateBulkOperationRequirements(operation: string, filters: any): void {
    switch (operation) {
      case 'cleanup':
        if (!filters?.olderThanHours) {
          throw new Error('Cleanup operation requires olderThanHours filter')
        }
        if (filters.olderThanHours < 24) {
          throw new Error('Cleanup can only target calls older than 24 hours')
        }
        break

      case 'export':
        // Export operations might have specific requirements
        break

      case 'analyze':
        // Analysis operations might have specific requirements
        break
    }
  }

  /**
   * Validate call permissions based on user relationship
   */
  validateCallPermissions = (req: Request, res: Response, next: NextFunction) => {
    try {
      // This would validate:
      // 1. Users are connected/friends
      // 2. Privacy settings allow calls
      // 3. User is not blocked
      // 4. User has call permissions in groups
      
      const userId = req.user?.id
      if (!userId) {
        throw new Error('User authentication required')
      }

      // Placeholder - would integrate with user relationship service
      this.logValidation('callPermissions', userId)

      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate call device capabilities
   */
  validateDeviceCapabilities = (req: Request, res: Response, next: NextFunction) => {
    try {
      const userAgent = req.headers['user-agent'] || ''
      const callType = req.body?.callType || req.query?.callType

      // Basic device capability checks
      if (callType === 'video') {
        // Check if device supports video calls
        if (userAgent.includes('Mobile') && !userAgent.includes('Chrome')) {
          throw new Error('Video calls may not be supported on this device')
        }
      }

      this.logValidation('deviceCapabilities', req.user?.id, { 
        callType,
        userAgent: userAgent.substring(0, 100)
      })

      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Create comprehensive validation middleware for call endpoints
   */
  createCallValidation = (validationType: 'initiate' | 'action' | 'quality' | 'history' | 'admin') => {
    const validators = [this.validateCallPermissions]

    switch (validationType) {
      case 'initiate':
        validators.push(this.validateDeviceCapabilities, this.validateInitiateCall)
        break
      case 'action':
        validators.push(this.validateCallAction)
        break
      case 'quality':
        validators.push(this.validateUpdateCallQuality)
        break
      case 'history':
        validators.push(this.validateGetCallHistory)
        break
      case 'admin':
        validators.push(this.validateBulkCallOperations)
        break
    }

    return this.chainValidators(...validators)
  }
}

// Export singleton instance
export const callValidator = new CallValidator()
