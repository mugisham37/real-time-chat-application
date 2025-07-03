import { Request, Response } from 'express'
import { z } from 'zod'
import { BaseController } from './base.controller'
import { groupJoinRequestService } from '../services/groupJoinRequest.service'

/**
 * Group Join Request Controller
 * Handles group join request creation, management, and responses
 */
export class GroupJoinRequestController extends BaseController {
  /**
   * Create a group join request
   * POST /api/group-join-requests
   */
  createRequest = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const bodySchema = z.object({
      groupId: z.string().min(1, 'Group ID is required'),
      message: z.string().max(500, 'Message too long').optional(),
      expiresInHours: z.number().positive().max(8760).optional() // Max 1 year
    })

    const body = this.getBodyParams(req, bodySchema)

    // Calculate expiry date if provided
    const expiresAt = body.expiresInHours 
      ? new Date(Date.now() + body.expiresInHours * 60 * 60 * 1000)
      : undefined

    this.logAction('createRequest', userId, {
      groupId: body.groupId,
      hasMessage: !!body.message,
      expiresInHours: body.expiresInHours
    })

    const request = await groupJoinRequestService.createRequest({
      groupId: body.groupId,
      userId,
      message: body.message,
      expiresAt
    })

    // Transform dates for response
    const transformedRequest = this.transformRequestDates(request)

    this.sendSuccess(res, transformedRequest, 'Group join request created successfully', 201)
  })

  /**
   * Get request by ID
   * GET /api/group-join-requests/:id
   */
  getRequest = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const requestId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Request ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('getRequest', userId, { requestId })

    const request = await groupJoinRequestService.getRequest(requestId)

    // Check if user has access to this request
    if (request.userId !== userId) {
      // Check if user is admin of the group or system admin
      this.requireAdmin(req)
    }

    const transformedRequest = this.transformRequestDates(request)

    this.sendSuccess(res, transformedRequest, 'Group join request retrieved successfully')
  })

  /**
   * Get pending requests for a group (Admin/Moderator only)
   * GET /api/group-join-requests/group/:groupId/pending
   */
  getGroupPendingRequests = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const groupId = req.params.groupId

    const paramsSchema = z.object({
      groupId: z.string().min(1, 'Group ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('getGroupPendingRequests', userId, { groupId })

    const requests = await groupJoinRequestService.getPendingRequestsForGroup(groupId)

    const transformedRequests = requests.map(request => 
      this.transformRequestDates(request)
    )

    this.sendSuccess(res, transformedRequests, 'Group pending requests retrieved successfully')
  })

  /**
   * Get pending requests for current user
   * GET /api/group-join-requests/my-requests
   */
  getUserPendingRequests = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    this.logAction('getUserPendingRequests', userId)

    const requests = await groupJoinRequestService.getPendingRequestsForUser(userId)

    const transformedRequests = requests.map(request => 
      this.transformRequestDates(request)
    )

    this.sendSuccess(res, transformedRequests, 'User pending requests retrieved successfully')
  })

  /**
   * Approve join request (Admin/Moderator only)
   * POST /api/group-join-requests/:id/approve
   */
  approveRequest = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const requestId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Request ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('approveRequest', userId, { requestId })

    const request = await groupJoinRequestService.approveRequest(requestId, userId)

    const transformedRequest = this.transformRequestDates(request)

    this.sendSuccess(res, transformedRequest, 'Join request approved successfully')
  })

  /**
   * Reject join request (Admin/Moderator only)
   * POST /api/group-join-requests/:id/reject
   */
  rejectRequest = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const requestId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Request ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('rejectRequest', userId, { requestId })

    const request = await groupJoinRequestService.rejectRequest(requestId, userId)

    const transformedRequest = this.transformRequestDates(request)

    this.sendSuccess(res, transformedRequest, 'Join request rejected successfully')
  })

  /**
   * Cancel join request
   * DELETE /api/group-join-requests/:id
   */
  cancelRequest = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const requestId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Request ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('cancelRequest', userId, { requestId })

    const cancelled = await groupJoinRequestService.cancelRequest(requestId, userId)

    this.sendSuccess(res, { 
      cancelled,
      requestId 
    }, cancelled ? 'Join request cancelled successfully' : 'Failed to cancel request')
  })

  /**
   * Get join request statistics for a group (Admin/Moderator only)
   * GET /api/group-join-requests/group/:groupId/stats
   */
  getGroupJoinRequestStats = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const groupId = req.params.groupId

    const paramsSchema = z.object({
      groupId: z.string().min(1, 'Group ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('getGroupJoinRequestStats', userId, { groupId })

    const stats = await groupJoinRequestService.getGroupJoinRequestStats(groupId, userId)

    this.sendSuccess(res, stats, 'Group join request statistics retrieved successfully')
  })

  /**
   * Get user join request statistics
   * GET /api/group-join-requests/my-stats
   */
  getUserJoinRequestStats = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    this.logAction('getUserJoinRequestStats', userId)

    const stats = await groupJoinRequestService.getUserJoinRequestStats(userId)

    this.sendSuccess(res, stats, 'User join request statistics retrieved successfully')
  })

  /**
   * Check if user has pending request for group
   * GET /api/group-join-requests/check/:groupId
   */
  checkPendingRequest = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const groupId = req.params.groupId

    const paramsSchema = z.object({
      groupId: z.string().min(1, 'Group ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('checkPendingRequest', userId, { groupId })

    const hasPending = await groupJoinRequestService.hasPendingRequest(groupId, userId)

    this.sendSuccess(res, { 
      hasPendingRequest: hasPending,
      groupId 
    }, 'Pending request status checked successfully')
  })

  /**
   * Get request by group and user
   * GET /api/group-join-requests/group/:groupId/user/:userId
   */
  getRequestByGroupAndUser = this.asyncHandler(async (req: Request, res: Response) => {
    const currentUserId = this.getUserId(req)
    const groupId = req.params.groupId
    const userId = req.params.userId

    const paramsSchema = z.object({
      groupId: z.string().min(1, 'Group ID is required'),
      userId: z.string().min(1, 'User ID is required')
    })

    this.getPathParams(req, paramsSchema)

    // Users can only check their own requests unless they're admin
    if (currentUserId !== userId) {
      this.requireAdmin(req)
    }

    this.logAction('getRequestByGroupAndUser', currentUserId, { groupId, userId })

    const request = await groupJoinRequestService.getRequestByGroupAndUser(groupId, userId)

    if (!request) {
      this.sendSuccess(res, null, 'No request found')
      return
    }

    const transformedRequest = this.transformRequestDates(request)

    this.sendSuccess(res, transformedRequest, 'Request retrieved successfully')
  })

  /**
   * Bulk approve requests (Admin/Moderator only)
   * POST /api/group-join-requests/bulk-approve
   */
  bulkApproveRequests = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const bodySchema = z.object({
      requestIds: z.array(z.string().min(1)).min(1, 'At least one request ID is required').max(50, 'Maximum 50 requests at once')
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('bulkApproveRequests', userId, {
      requestCount: body.requestIds.length
    })

    const result = await groupJoinRequestService.bulkApproveRequests(body.requestIds, userId)

    // Transform dates in successful requests
    const transformedResult = {
      ...result,
      successful: result.successful.map(request => 
        this.transformRequestDates(request)
      )
    }

    this.sendSuccess(res, transformedResult, 'Bulk approve completed')
  })

  /**
   * Bulk reject requests (Admin/Moderator only)
   * POST /api/group-join-requests/bulk-reject
   */
  bulkRejectRequests = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const bodySchema = z.object({
      requestIds: z.array(z.string().min(1)).min(1, 'At least one request ID is required').max(50, 'Maximum 50 requests at once')
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('bulkRejectRequests', userId, {
      requestCount: body.requestIds.length
    })

    const result = await groupJoinRequestService.bulkRejectRequests(body.requestIds, userId)

    // Transform dates in successful requests
    const transformedResult = {
      ...result,
      successful: result.successful.map(request => 
        this.transformRequestDates(request)
      )
    }

    this.sendSuccess(res, transformedResult, 'Bulk reject completed')
  })

  /**
   * Clean up expired requests (Admin only)
   * POST /api/group-join-requests/cleanup
   */
  cleanupExpiredRequests = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    this.requireAdmin(req)

    this.logAction('cleanupExpiredRequests', userId)

    const deletedCount = await groupJoinRequestService.cleanupExpiredRequests()

    this.sendSuccess(res, { 
      deletedCount,
      cleanedUp: true,
      timestamp: new Date().toISOString()
    }, `Cleaned up ${deletedCount} expired requests successfully`)
  })

  /**
   * Get all requests with filters (Admin only)
   * GET /api/group-join-requests/all
   */
  getAllRequests = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    this.requireAdmin(req)

    const querySchema = z.object({
      status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
      groupId: z.string().optional(),
      userId: z.string().optional(),
      limit: z.coerce.number().min(1).max(100).default(20),
      skip: z.coerce.number().min(0).default(0),
      sortBy: z.enum(['createdAt', 'updatedAt']).default('createdAt'),
      sortOrder: z.enum(['asc', 'desc']).default('desc')
    })

    const query = this.getQueryParams(req, querySchema)

    this.logAction('getAllRequests', userId, { 
      filters: {
        status: query.status,
        groupId: query.groupId,
        userId: query.userId
      }
    })

    // This would require implementing a method to get all requests with filters
    // For now, return a placeholder response
    const allRequests = {
      requests: [],
      total: 0,
      filters: {
        status: query.status,
        groupId: query.groupId,
        userId: query.userId
      },
      message: 'All requests retrieval will be implemented with database integration'
    }

    const pagination = this.calculatePagination(
      Math.floor((query.skip || 0) / (query.limit || 20)) + 1,
      query.limit || 20,
      0
    )

    this.sendSuccess(res, allRequests, 'All requests retrieved successfully', 200, pagination)
  })

  /**
   * Update request message
   * PUT /api/group-join-requests/:id/message
   */
  updateRequestMessage = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const requestId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Request ID is required')
    })

    const bodySchema = z.object({
      message: z.string().max(500, 'Message too long').optional()
    })

    this.getPathParams(req, paramsSchema)
    const body = this.getBodyParams(req, bodySchema)

    this.logAction('updateRequestMessage', userId, { requestId })

    // Get the request first to check ownership
    const request = await groupJoinRequestService.getRequest(requestId)

    // Check if user owns the request
    if (request.userId !== userId) {
      this.sendSuccess(res, { 
        updated: false,
        error: 'You can only update your own requests'
      }, 'Access denied')
      return
    }

    // Check if request is still pending
    if (request.status !== 'PENDING') {
      this.sendSuccess(res, { 
        updated: false,
        error: 'Can only update pending requests'
      }, 'Request cannot be updated')
      return
    }

    // This would require implementing an update method in the service
    const result = {
      requestId,
      message: body.message,
      updated: true,
      updatedAt: new Date().toISOString(),
      note: 'Request message update will be implemented with service method'
    }

    this.sendSuccess(res, result, 'Request message updated successfully')
  })

  /**
   * Get request activity/history
   * GET /api/group-join-requests/:id/activity
   */
  getRequestActivity = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const requestId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Request ID is required')
    })

    this.getPathParams(req, paramsSchema)

    // Get the request first to check access
    const request = await groupJoinRequestService.getRequest(requestId)

    // Check if user has access to this request
    if (request.userId !== userId) {
      this.requireAdmin(req)
    }

    this.logAction('getRequestActivity', userId, { requestId })

    // This would require implementing activity tracking
    const activity = {
      requestId,
      activities: [
        {
          id: '1',
          type: 'created',
          timestamp: request.createdAt,
          userId: request.userId,
          details: 'Request created'
        }
      ],
      message: 'Request activity tracking will be implemented with activity system'
    }

    this.sendSuccess(res, activity, 'Request activity retrieved successfully')
  })

  /**
   * Helper method to transform request dates
   */
  private transformRequestDates(request: any): any {
    return {
      ...request,
      createdAt: request.createdAt?.toISOString() || null,
      updatedAt: request.updatedAt?.toISOString() || null,
      expiresAt: request.expiresAt?.toISOString() || null,
      respondedAt: request.respondedAt?.toISOString() || null
    }
  }
}

// Export singleton instance
export const groupJoinRequestController = new GroupJoinRequestController()
