import { Request, Response } from 'express'
import { z } from 'zod'
import { BaseController } from './base.controller'
import { callService } from '../services/call.service'

/**
 * Call Controller
 * Handles voice and video call operations
 */
export class CallController extends BaseController {
  /**
   * Initiate a call
   * POST /api/calls/initiate
   */
  initiateCall = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const bodySchema = z.object({
      recipientId: z.string().min(1, 'Recipient ID is required'),
      callType: z.enum(['audio', 'video'], {
        errorMap: () => ({ message: 'Call type must be either "audio" or "video"' })
      }),
      metadata: z.record(z.any()).optional()
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('initiateCall', userId, { 
      recipientId: body.recipientId, 
      callType: body.callType 
    })

    const callData = await callService.initiateCall(
      userId,
      body.recipientId,
      body.callType,
      body.metadata
    )

    this.sendSuccess(res, callData, 'Call initiated successfully', 201)
  })

  /**
   * Answer a call
   * POST /api/calls/:callId/answer
   */
  answerCall = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const callId = req.params.callId

    const paramsSchema = z.object({
      callId: z.string().min(1, 'Call ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('answerCall', userId, { callId })

    const callData = await callService.answerCall(callId, userId)

    this.sendSuccess(res, callData, 'Call answered successfully')
  })

  /**
   * Reject a call
   * POST /api/calls/:callId/reject
   */
  rejectCall = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const callId = req.params.callId

    const paramsSchema = z.object({
      callId: z.string().min(1, 'Call ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('rejectCall', userId, { callId })

    const callData = await callService.rejectCall(callId, userId)

    this.sendSuccess(res, callData, 'Call rejected successfully')
  })

  /**
   * End a call
   * POST /api/calls/:callId/end
   */
  endCall = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const callId = req.params.callId

    const paramsSchema = z.object({
      callId: z.string().min(1, 'Call ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('endCall', userId, { callId })

    const callData = await callService.endCall(callId, userId)

    this.sendSuccess(res, callData, 'Call ended successfully')
  })

  /**
   * Get call details
   * GET /api/calls/:callId
   */
  getCall = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const callId = req.params.callId

    const paramsSchema = z.object({
      callId: z.string().min(1, 'Call ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('getCall', userId, { callId })

    const callData = await callService.getCallData(callId)

    if (!callData) {
      this.sendSuccess(res, null, 'Call not found')
      return
    }

    // Check if user is a participant
    if (callData.caller !== userId && callData.recipient !== userId) {
      this.requireAdmin(req)
    }

    this.sendSuccess(res, callData, 'Call details retrieved successfully')
  })

  /**
   * Get user's recent calls
   * GET /api/calls/recent
   */
  getRecentCalls = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const querySchema = z.object({
      limit: z.coerce.number().min(1).max(100).default(20)
    })

    const query = this.getQueryParams(req, querySchema)

    this.logAction('getRecentCalls', userId, { limit: query.limit })

    const calls = await callService.getUserRecentCalls(userId, query.limit)

    this.sendSuccess(res, calls, 'Recent calls retrieved successfully')
  })

  /**
   * Get user's active calls
   * GET /api/calls/active
   */
  getActiveCalls = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    this.logAction('getActiveCalls', userId)

    const activeCalls = await callService.getUserActiveCalls(userId)

    this.sendSuccess(res, activeCalls, 'Active calls retrieved successfully')
  })

  /**
   * Mark call as missed
   * POST /api/calls/:callId/missed
   */
  markCallAsMissed = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const callId = req.params.callId

    const paramsSchema = z.object({
      callId: z.string().min(1, 'Call ID is required')
    })

    this.getPathParams(req, paramsSchema)

    // Only allow system or admin to mark calls as missed
    this.requireAdmin(req)

    this.logAction('markCallAsMissed', userId, { callId })

    await callService.markCallAsMissed(callId)

    this.sendSuccess(res, { marked: true }, 'Call marked as missed successfully')
  })

  /**
   * Get call statistics for user
   * GET /api/calls/stats
   */
  getCallStats = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    this.logAction('getCallStats', userId)

    const stats = await callService.getUserCallStats(userId)

    // Transform duration values to be more readable
    const transformedStats = {
      ...stats,
      totalDuration: this.formatDuration(stats.totalDuration),
      averageCallDuration: this.formatDuration(stats.averageCallDuration)
    }

    this.sendSuccess(res, transformedStats, 'Call statistics retrieved successfully')
  })

  /**
   * Update call quality metrics
   * POST /api/calls/:callId/quality
   */
  updateCallQuality = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const callId = req.params.callId

    const paramsSchema = z.object({
      callId: z.string().min(1, 'Call ID is required')
    })

    const bodySchema = z.object({
      connectionQuality: z.enum(['excellent', 'good', 'fair', 'poor']),
      bandwidth: z.number().positive().optional(),
      latency: z.number().min(0).optional(),
      packetLoss: z.number().min(0).max(100).optional()
    })

    this.getPathParams(req, paramsSchema)
    const body = this.getBodyParams(req, bodySchema)

    this.logAction('updateCallQuality', userId, { 
      callId, 
      quality: body.connectionQuality 
    })

    await callService.updateCallQuality(callId, userId, body)

    this.sendSuccess(res, { updated: true }, 'Call quality updated successfully')
  })

  /**
   * Get call quality metrics
   * GET /api/calls/:callId/quality
   */
  getCallQuality = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const callId = req.params.callId

    const paramsSchema = z.object({
      callId: z.string().min(1, 'Call ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('getCallQuality', userId, { callId })

    const quality = await callService.getCallQuality(callId)

    this.sendSuccess(res, quality, 'Call quality metrics retrieved successfully')
  })

  /**
   * Get call history with filters
   * GET /api/calls/history
   */
  getCallHistory = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const querySchema = z.object({
      callType: z.enum(['audio', 'video']).optional(),
      status: z.enum(['ringing', 'connected', 'rejected', 'ended', 'missed']).optional(),
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
      limit: z.coerce.number().min(1).max(100).default(20),
      offset: z.coerce.number().min(0).default(0)
    })

    const query = this.getQueryParams(req, querySchema)

    this.logAction('getCallHistory', userId, { filters: query })

    // Get all recent calls and filter them
    let calls = await callService.getUserRecentCalls(userId, 1000) // Get more calls for filtering

    // Apply filters
    if (query.callType) {
      calls = calls.filter(call => call.callType === query.callType)
    }

    if (query.status) {
      calls = calls.filter(call => call.status === query.status)
    }

    if (query.startDate) {
      const startTime = new Date(query.startDate).getTime()
      calls = calls.filter(call => call.startTime >= startTime)
    }

    if (query.endDate) {
      const endTime = new Date(query.endDate).getTime()
      calls = calls.filter(call => call.startTime <= endTime)
    }

    // Apply pagination
    const total = calls.length
    const offset = query.offset ?? 0
    const limit = query.limit ?? 20
    const paginatedCalls = calls.slice(offset, offset + limit)

    const pagination = this.calculatePagination(
      Math.floor(offset / limit) + 1,
      limit,
      total
    )

    this.sendSuccess(res, paginatedCalls, 'Call history retrieved successfully', 200, pagination)
  })

  /**
   * Bulk operations on calls (Admin only)
   * POST /api/calls/bulk
   */
  bulkCallOperations = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    this.requireAdmin(req)

    const bodySchema = z.object({
      operation: z.enum(['cleanup', 'export', 'analyze']),
      filters: z.object({
        olderThanHours: z.number().positive().optional(),
        status: z.array(z.string()).optional(),
        callType: z.array(z.enum(['audio', 'video'])).optional()
      }).optional()
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('bulkCallOperations', userId, { 
      operation: body.operation,
      filters: body.filters 
    })

    let result: any = {}

    switch (body.operation) {
      case 'cleanup':
        const olderThanHours = body.filters?.olderThanHours || 24
        const deletedCount = await callService.cleanupOldCallData(olderThanHours)
        result = { deletedCount, operation: 'cleanup' }
        break

      case 'export':
        // This would typically generate a file for download
        result = { 
          message: 'Call export functionality would be implemented here',
          operation: 'export'
        }
        break

      case 'analyze':
        // This would typically run analytics on call data
        result = { 
          message: 'Call analysis functionality would be implemented here',
          operation: 'analyze'
        }
        break
    }

    this.sendSuccess(res, result, `Bulk ${body.operation} operation completed successfully`)
  })

  /**
   * Helper method to format duration in milliseconds to human readable format
   */
  private formatDuration(durationMs: number): string {
    if (durationMs === 0) return '0 seconds'

    const seconds = Math.floor(durationMs / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    } else {
      return `${seconds}s`
    }
  }
}

// Export singleton instance
export const callController = new CallController()
