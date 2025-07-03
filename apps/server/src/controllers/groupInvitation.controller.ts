import { Request, Response } from 'express'
import { z } from 'zod'
import { BaseController } from './base.controller'
import { groupInvitationService } from '../services/groupInvitation.service'

/**
 * Group Invitation Controller
 * Handles group invitation creation, management, and responses
 */
export class GroupInvitationController extends BaseController {
  /**
   * Create a group invitation
   * POST /api/group-invitations
   */
  createInvitation = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const bodySchema = z.object({
      groupId: z.string().min(1, 'Group ID is required'),
      inviteeId: z.string().min(1, 'Invitee ID is required'),
      expiresInHours: z.number().positive().max(8760).optional() // Max 1 year
    })

    const body = this.getBodyParams(req, bodySchema)

    // Calculate expiry date if provided
    const expiresAt = body.expiresInHours 
      ? new Date(Date.now() + body.expiresInHours * 60 * 60 * 1000)
      : undefined

    this.logAction('createInvitation', userId, {
      groupId: body.groupId,
      inviteeId: body.inviteeId,
      expiresInHours: body.expiresInHours
    })

    const invitation = await groupInvitationService.createInvitation({
      groupId: body.groupId,
      inviterId: userId,
      inviteeId: body.inviteeId,
      expiresAt
    })

    // Transform dates for response
    const transformedInvitation = this.transformInvitationDates(invitation)

    this.sendSuccess(res, transformedInvitation, 'Group invitation created successfully', 201)
  })

  /**
   * Get invitation by ID
   * GET /api/group-invitations/:id
   */
  getInvitation = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const invitationId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Invitation ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('getInvitation', userId, { invitationId })

    const invitation = await groupInvitationService.getInvitation(invitationId)

    // Check if user has access to this invitation
    if (invitation.inviterId !== userId && invitation.inviteeId !== userId) {
      this.requireAdmin(req)
    }

    const transformedInvitation = this.transformInvitationDates(invitation)

    this.sendSuccess(res, transformedInvitation, 'Group invitation retrieved successfully')
  })

  /**
   * Get pending invitations for current user
   * GET /api/group-invitations/pending
   */
  getPendingInvitations = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    this.logAction('getPendingInvitations', userId)

    const invitations = await groupInvitationService.getPendingInvitationsForUser(userId)

    const transformedInvitations = invitations.map(invitation => 
      this.transformInvitationDates(invitation)
    )

    this.sendSuccess(res, transformedInvitations, 'Pending invitations retrieved successfully')
  })

  /**
   * Get pending invitations for a group (Admin/Moderator only)
   * GET /api/group-invitations/group/:groupId/pending
   */
  getGroupPendingInvitations = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const groupId = req.params.groupId

    const paramsSchema = z.object({
      groupId: z.string().min(1, 'Group ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('getGroupPendingInvitations', userId, { groupId })

    const invitations = await groupInvitationService.getPendingInvitationsForGroup(groupId, userId)

    const transformedInvitations = invitations.map(invitation => 
      this.transformInvitationDates(invitation)
    )

    this.sendSuccess(res, transformedInvitations, 'Group pending invitations retrieved successfully')
  })

  /**
   * Accept invitation
   * POST /api/group-invitations/:id/accept
   */
  acceptInvitation = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const invitationId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Invitation ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('acceptInvitation', userId, { invitationId })

    const invitation = await groupInvitationService.acceptInvitation(invitationId, userId)

    const transformedInvitation = this.transformInvitationDates(invitation)

    this.sendSuccess(res, transformedInvitation, 'Invitation accepted successfully')
  })

  /**
   * Reject invitation
   * POST /api/group-invitations/:id/reject
   */
  rejectInvitation = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const invitationId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Invitation ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('rejectInvitation', userId, { invitationId })

    const invitation = await groupInvitationService.rejectInvitation(invitationId, userId)

    const transformedInvitation = this.transformInvitationDates(invitation)

    this.sendSuccess(res, transformedInvitation, 'Invitation rejected successfully')
  })

  /**
   * Cancel invitation
   * DELETE /api/group-invitations/:id
   */
  cancelInvitation = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const invitationId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Invitation ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('cancelInvitation', userId, { invitationId })

    const cancelled = await groupInvitationService.cancelInvitation(invitationId, userId)

    this.sendSuccess(res, { 
      cancelled,
      invitationId 
    }, cancelled ? 'Invitation cancelled successfully' : 'Failed to cancel invitation')
  })

  /**
   * Get invitation statistics for a group (Admin/Moderator only)
   * GET /api/group-invitations/group/:groupId/stats
   */
  getGroupInvitationStats = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const groupId = req.params.groupId

    const paramsSchema = z.object({
      groupId: z.string().min(1, 'Group ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('getGroupInvitationStats', userId, { groupId })

    const stats = await groupInvitationService.getGroupInvitationStats(groupId, userId)

    this.sendSuccess(res, stats, 'Group invitation statistics retrieved successfully')
  })

  /**
   * Get user invitation statistics
   * GET /api/group-invitations/my-stats
   */
  getUserInvitationStats = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    this.logAction('getUserInvitationStats', userId)

    const stats = await groupInvitationService.getUserInvitationStats(userId)

    this.sendSuccess(res, stats, 'User invitation statistics retrieved successfully')
  })

  /**
   * Bulk invite users to a group
   * POST /api/group-invitations/bulk
   */
  bulkInviteUsers = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const bodySchema = z.object({
      groupId: z.string().min(1, 'Group ID is required'),
      inviteeIds: z.array(z.string().min(1)).min(1, 'At least one invitee ID is required').max(50, 'Maximum 50 invitations at once'),
      expiresInHours: z.number().positive().max(8760).optional()
    })

    const body = this.getBodyParams(req, bodySchema)

    // Calculate expiry date if provided
    const expiresAt = body.expiresInHours 
      ? new Date(Date.now() + body.expiresInHours * 60 * 60 * 1000)
      : undefined

    this.logAction('bulkInviteUsers', userId, {
      groupId: body.groupId,
      inviteeCount: body.inviteeIds.length,
      expiresInHours: body.expiresInHours
    })

    const result = await groupInvitationService.bulkInviteUsers(
      body.groupId,
      userId,
      body.inviteeIds,
      expiresAt
    )

    // Transform dates in successful invitations
    const transformedResult = {
      ...result,
      successful: result.successful.map(invitation => 
        this.transformInvitationDates(invitation)
      )
    }

    this.sendSuccess(res, transformedResult, 'Bulk invitation completed')
  })

  /**
   * Check if user has pending invitation to group
   * GET /api/group-invitations/check/:groupId
   */
  checkPendingInvitation = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const groupId = req.params.groupId

    const paramsSchema = z.object({
      groupId: z.string().min(1, 'Group ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('checkPendingInvitation', userId, { groupId })

    const hasPending = await groupInvitationService.hasPendingInvitation(groupId, userId)

    this.sendSuccess(res, { 
      hasPendingInvitation: hasPending,
      groupId 
    }, 'Pending invitation status checked successfully')
  })

  /**
   * Get invitation by group and user
   * GET /api/group-invitations/group/:groupId/user/:userId
   */
  getInvitationByGroupAndUser = this.asyncHandler(async (req: Request, res: Response) => {
    const currentUserId = this.getUserId(req)
    const groupId = req.params.groupId
    const userId = req.params.userId

    const paramsSchema = z.object({
      groupId: z.string().min(1, 'Group ID is required'),
      userId: z.string().min(1, 'User ID is required')
    })

    this.getPathParams(req, paramsSchema)

    // Users can only check their own invitations unless they're admin
    if (currentUserId !== userId) {
      this.requireAdmin(req)
    }

    this.logAction('getInvitationByGroupAndUser', currentUserId, { groupId, userId })

    const invitation = await groupInvitationService.getInvitationByGroupAndUser(groupId, userId)

    if (!invitation) {
      this.sendSuccess(res, null, 'No invitation found')
      return
    }

    const transformedInvitation = this.transformInvitationDates(invitation)

    this.sendSuccess(res, transformedInvitation, 'Invitation retrieved successfully')
  })

  /**
   * Clean up expired invitations (Admin only)
   * POST /api/group-invitations/cleanup
   */
  cleanupExpiredInvitations = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    this.requireAdmin(req)

    this.logAction('cleanupExpiredInvitations', userId)

    const deletedCount = await groupInvitationService.cleanupExpiredInvitations()

    this.sendSuccess(res, { 
      deletedCount,
      cleanedUp: true,
      timestamp: new Date().toISOString()
    }, `Cleaned up ${deletedCount} expired invitations successfully`)
  })

  /**
   * Get sent invitations for current user
   * GET /api/group-invitations/sent
   */
  getSentInvitations = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const querySchema = z.object({
      status: z.enum(['PENDING', 'ACCEPTED', 'DECLINED']).optional(),
      limit: z.coerce.number().min(1).max(100).default(20),
      skip: z.coerce.number().min(0).default(0)
    })

    const query = this.getQueryParams(req, querySchema)

    this.logAction('getSentInvitations', userId, { 
      status: query.status,
      limit: query.limit 
    })

    // This would require implementing a method to get sent invitations
    // For now, return a placeholder response
    const sentInvitations = {
      invitations: [],
      total: 0,
      message: 'Sent invitations retrieval will be implemented with database integration'
    }

    const pagination = this.calculatePagination(
      Math.floor((query.skip || 0) / (query.limit || 20)) + 1,
      query.limit || 20,
      0
    )

    this.sendSuccess(res, sentInvitations, 'Sent invitations retrieved successfully', 200, pagination)
  })

  /**
   * Resend invitation
   * POST /api/group-invitations/:id/resend
   */
  resendInvitation = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const invitationId = req.params.id

    const paramsSchema = z.object({
      id: z.string().min(1, 'Invitation ID is required')
    })

    const bodySchema = z.object({
      expiresInHours: z.number().positive().max(8760).optional()
    })

    this.getPathParams(req, paramsSchema)
    const body = this.getBodyParams(req, bodySchema)

    this.logAction('resendInvitation', userId, { 
      invitationId,
      expiresInHours: body.expiresInHours 
    })

    // Get the original invitation
    const originalInvitation = await groupInvitationService.getInvitation(invitationId)

    // Check if user is the inviter
    if (originalInvitation.inviterId !== userId) {
      this.sendSuccess(res, { 
        resent: false,
        error: 'You can only resend your own invitations'
      }, 'Access denied')
      return
    }

    // Cancel the original invitation and create a new one
    await groupInvitationService.cancelInvitation(invitationId, userId)

    const expiresAt = body.expiresInHours 
      ? new Date(Date.now() + body.expiresInHours * 60 * 60 * 1000)
      : undefined

    const newInvitation = await groupInvitationService.createInvitation({
      groupId: originalInvitation.groupId,
      inviterId: userId,
      inviteeId: originalInvitation.inviteeId,
      expiresAt
    })

    const transformedInvitation = this.transformInvitationDates(newInvitation)

    this.sendSuccess(res, {
      resent: true,
      originalInvitationId: invitationId,
      newInvitation: transformedInvitation
    }, 'Invitation resent successfully')
  })

  /**
   * Helper method to transform invitation dates
   */
  private transformInvitationDates(invitation: any): any {
    return {
      ...invitation,
      createdAt: invitation.createdAt?.toISOString() || null,
      updatedAt: invitation.updatedAt?.toISOString() || null,
      expiresAt: invitation.expiresAt?.toISOString() || null,
      respondedAt: invitation.respondedAt?.toISOString() || null
    }
  }
}

// Export singleton instance
export const groupInvitationController = new GroupInvitationController()
