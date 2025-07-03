import { Request, Response } from 'express'
import { z } from 'zod'
import { BaseController } from './base.controller'
import { contentModerationService } from '../services/contentModeration.service'

/**
 * Content Moderation Controller
 * Handles content moderation, user reports, and moderation actions
 */
export class ContentModerationController extends BaseController {
  /**
   * Moderate message content
   * POST /api/moderation/moderate-message
   */
  moderateMessage = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    this.requireModerator(req)

    const bodySchema = z.object({
      messageId: z.string().min(1, 'Message ID is required'),
      content: z.string().min(1, 'Content is required'),
      senderId: z.string().min(1, 'Sender ID is required'),
      conversationId: z.string().min(1, 'Conversation ID is required')
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('moderateMessage', userId, { 
      messageId: body.messageId,
      senderId: body.senderId 
    })

    const result = await contentModerationService.moderateMessage(
      body.messageId,
      body.content,
      body.senderId,
      body.conversationId
    )

    this.sendSuccess(res, result, 'Message moderation completed')
  })

  /**
   * Report user or content
   * POST /api/moderation/report
   */
  reportUser = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const bodySchema = z.object({
      reportedUserId: z.string().min(1, 'Reported user ID is required'),
      messageId: z.string().optional(),
      conversationId: z.string().optional(),
      reason: z.string().min(1, 'Reason is required'),
      category: z.enum(['spam', 'harassment', 'inappropriate_content', 'fake_account', 'other']),
      description: z.string().min(10, 'Description must be at least 10 characters').max(1000)
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('reportUser', userId, { 
      reportedUserId: body.reportedUserId,
      category: body.category 
    })

    const report = await contentModerationService.reportUser({
      reporterId: userId,
      reportedUserId: body.reportedUserId,
      messageId: body.messageId,
      conversationId: body.conversationId,
      reason: body.reason,
      category: body.category,
      description: body.description
    })

    this.sendSuccess(res, report, 'Report submitted successfully', 201)
  })

  /**
   * Get user moderation status
   * GET /api/moderation/user/:userId/status
   */
  getUserModerationStatus = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const targetUserId = req.params.userId

    // Users can only view their own status unless they're moderator/admin
    if (userId !== targetUserId) {
      this.requireModerator(req)
    }

    const paramsSchema = z.object({
      userId: z.string().min(1, 'User ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('getUserModerationStatus', userId, { targetUserId })

    const status = await contentModerationService.getUserModerationStatus(targetUserId)

    this.sendSuccess(res, status, 'User moderation status retrieved successfully')
  })

  /**
   * Check if user is muted
   * GET /api/moderation/user/:userId/muted
   */
  checkUserMuted = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const targetUserId = req.params.userId

    // Users can only check their own status unless they're moderator/admin
    if (userId !== targetUserId) {
      this.requireModerator(req)
    }

    const paramsSchema = z.object({
      userId: z.string().min(1, 'User ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('checkUserMuted', userId, { targetUserId })

    const isMuted = await contentModerationService.isUserMuted(targetUserId)

    this.sendSuccess(res, { isMuted }, 'User mute status retrieved successfully')
  })

  /**
   * Check if user is banned
   * GET /api/moderation/user/:userId/banned
   */
  checkUserBanned = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const targetUserId = req.params.userId

    // Users can only check their own status unless they're moderator/admin
    if (userId !== targetUserId) {
      this.requireModerator(req)
    }

    const paramsSchema = z.object({
      userId: z.string().min(1, 'User ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('checkUserBanned', userId, { targetUserId })

    const isBanned = await contentModerationService.isUserBanned(targetUserId)

    this.sendSuccess(res, { isBanned }, 'User ban status retrieved successfully')
  })

  /**
   * Get moderation reports (Admin/Moderator only)
   * GET /api/moderation/reports
   */
  getModerationReports = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    this.requireModerator(req)

    const querySchema = z.object({
      status: z.enum(['pending', 'reviewed', 'resolved', 'dismissed']).optional(),
      category: z.enum(['spam', 'harassment', 'inappropriate_content', 'fake_account', 'other']).optional(),
      reporterId: z.string().optional(),
      reportedUserId: z.string().optional(),
      limit: z.coerce.number().min(1).max(100).default(20),
      offset: z.coerce.number().min(0).default(0)
    })

    const query = this.getQueryParams(req, querySchema)

    this.logAction('getModerationReports', userId, { filters: query })

    // This would typically query the database for reports
    // For now, return a placeholder response
    const reports = {
      reports: [],
      total: 0,
      message: 'Report retrieval functionality will be implemented with database integration'
    }

    const pagination = this.calculatePagination(
      Math.floor((query.offset ?? 0) / (query.limit ?? 20)) + 1,
      query.limit ?? 20,
      0
    )

    this.sendSuccess(res, reports, 'Moderation reports retrieved successfully', 200, pagination)
  })

  /**
   * Review a report (Admin/Moderator only)
   * PUT /api/moderation/reports/:reportId/review
   */
  reviewReport = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    this.requireModerator(req)

    const reportId = req.params.reportId

    const paramsSchema = z.object({
      reportId: z.string().min(1, 'Report ID is required')
    })

    const bodySchema = z.object({
      status: z.enum(['reviewed', 'resolved', 'dismissed']),
      action: z.enum(['none', 'warn', 'mute', 'ban']).optional(),
      notes: z.string().max(1000).optional(),
      actionDuration: z.number().positive().optional() // Duration in minutes for mute
    })

    this.getPathParams(req, paramsSchema)
    const body = this.getBodyParams(req, bodySchema)

    this.logAction('reviewReport', userId, { 
      reportId,
      status: body.status,
      action: body.action 
    })

    // This would typically update the report in the database
    const result = {
      reportId,
      status: body.status,
      reviewedBy: userId,
      reviewedAt: new Date(),
      action: body.action,
      notes: body.notes,
      message: 'Report review functionality will be implemented with database integration'
    }

    this.sendSuccess(res, result, 'Report reviewed successfully')
  })

  /**
   * Get moderation statistics (Admin only)
   * GET /api/moderation/stats
   */
  getModerationStats = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    this.requireAdmin(req)

    const querySchema = z.object({
      period: z.enum(['day', 'week', 'month']).default('week')
    })

    const query = this.getQueryParams(req, querySchema)

    this.logAction('getModerationStats', userId, { period: query.period })

    // This would typically aggregate moderation data from the database
    const stats = {
      totalReports: 0,
      pendingReports: 0,
      resolvedReports: 0,
      dismissedReports: 0,
      totalModerationActions: 0,
      usersBanned: 0,
      usersMuted: 0,
      messagesDeleted: 0,
      reportsByCategory: {
        spam: 0,
        harassment: 0,
        inappropriate_content: 0,
        fake_account: 0,
        other: 0
      },
      actionsByType: {
        warn: 0,
        mute: 0,
        ban: 0,
        delete: 0
      },
      period: query.period,
      message: 'Moderation statistics will be implemented with database integration'
    }

    this.sendSuccess(res, stats, 'Moderation statistics retrieved successfully')
  })

  /**
   * Manually moderate content (Admin/Moderator only)
   * POST /api/moderation/manual-action
   */
  manualModerationAction = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    this.requireModerator(req)

    const bodySchema = z.object({
      targetUserId: z.string().min(1, 'Target user ID is required'),
      action: z.enum(['warn', 'mute', 'ban', 'unban', 'unmute']),
      reason: z.string().min(1, 'Reason is required'),
      duration: z.number().positive().optional(), // Duration in minutes for mute
      messageId: z.string().optional()
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('manualModerationAction', userId, { 
      targetUserId: body.targetUserId,
      action: body.action,
      reason: body.reason 
    })

    // This would typically execute the moderation action
    const result = {
      targetUserId: body.targetUserId,
      action: body.action,
      reason: body.reason,
      moderatorId: userId,
      executedAt: new Date(),
      duration: body.duration,
      message: 'Manual moderation action functionality will be implemented with service integration'
    }

    this.sendSuccess(res, result, `Moderation action "${body.action}" executed successfully`)
  })

  /**
   * Get moderation rules (Admin only)
   * GET /api/moderation/rules
   */
  getModerationRules = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    this.requireAdmin(req)

    this.logAction('getModerationRules', userId)

    // This would typically retrieve moderation rules from the database
    const rules = {
      rules: [],
      total: 0,
      message: 'Moderation rules retrieval will be implemented with database integration'
    }

    this.sendSuccess(res, rules, 'Moderation rules retrieved successfully')
  })

  /**
   * Create or update moderation rule (Admin only)
   * POST /api/moderation/rules
   */
  createModerationRule = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    this.requireAdmin(req)

    const bodySchema = z.object({
      type: z.enum(['profanity', 'spam', 'harassment', 'inappropriate_content', 'custom']),
      pattern: z.string().min(1, 'Pattern is required'),
      severity: z.enum(['low', 'medium', 'high', 'critical']),
      action: z.enum(['warn', 'delete', 'mute', 'ban', 'review']),
      enabled: z.boolean().default(true),
      description: z.string().optional()
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('createModerationRule', userId, { 
      type: body.type,
      severity: body.severity,
      action: body.action 
    })

    // This would typically create the rule in the database
    const rule = {
      id: `rule_${Date.now()}`,
      ...body,
      createdBy: userId,
      createdAt: new Date(),
      updatedAt: new Date(),
      message: 'Moderation rule creation will be implemented with database integration'
    }

    this.sendSuccess(res, rule, 'Moderation rule created successfully', 201)
  })

  /**
   * Update moderation rule (Admin only)
   * PUT /api/moderation/rules/:ruleId
   */
  updateModerationRule = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    this.requireAdmin(req)

    const ruleId = req.params.ruleId

    const paramsSchema = z.object({
      ruleId: z.string().min(1, 'Rule ID is required')
    })

    const bodySchema = z.object({
      pattern: z.string().min(1).optional(),
      severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
      action: z.enum(['warn', 'delete', 'mute', 'ban', 'review']).optional(),
      enabled: z.boolean().optional(),
      description: z.string().optional()
    })

    this.getPathParams(req, paramsSchema)
    const body = this.getBodyParams(req, bodySchema)

    this.logAction('updateModerationRule', userId, { ruleId, updates: Object.keys(body) })

    // This would typically update the rule in the database
    const updatedRule = {
      id: ruleId,
      ...body,
      updatedBy: userId,
      updatedAt: new Date(),
      message: 'Moderation rule update will be implemented with database integration'
    }

    this.sendSuccess(res, updatedRule, 'Moderation rule updated successfully')
  })

  /**
   * Delete moderation rule (Admin only)
   * DELETE /api/moderation/rules/:ruleId
   */
  deleteModerationRule = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    this.requireAdmin(req)

    const ruleId = req.params.ruleId

    const paramsSchema = z.object({
      ruleId: z.string().min(1, 'Rule ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('deleteModerationRule', userId, { ruleId })

    // This would typically delete the rule from the database
    const result = {
      ruleId,
      deletedBy: userId,
      deletedAt: new Date(),
      message: 'Moderation rule deletion will be implemented with database integration'
    }

    this.sendSuccess(res, result, 'Moderation rule deleted successfully')
  })

  /**
   * Bulk moderation actions (Admin only)
   * POST /api/moderation/bulk-actions
   */
  bulkModerationActions = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    this.requireAdmin(req)

    const bodySchema = z.object({
      action: z.enum(['cleanup_old_reports', 'bulk_unmute', 'bulk_unban', 'export_reports']),
      filters: z.object({
        olderThanDays: z.number().positive().optional(),
        status: z.array(z.string()).optional(),
        category: z.array(z.string()).optional()
      }).optional()
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('bulkModerationActions', userId, { 
      action: body.action,
      filters: body.filters 
    })

    let result: any = {}

    switch (body.action) {
      case 'cleanup_old_reports':
        result = {
          action: 'cleanup_old_reports',
          processed: 0,
          message: 'Bulk cleanup functionality will be implemented'
        }
        break

      case 'bulk_unmute':
        result = {
          action: 'bulk_unmute',
          processed: 0,
          message: 'Bulk unmute functionality will be implemented'
        }
        break

      case 'bulk_unban':
        result = {
          action: 'bulk_unban',
          processed: 0,
          message: 'Bulk unban functionality will be implemented'
        }
        break

      case 'export_reports':
        result = {
          action: 'export_reports',
          exportUrl: null,
          message: 'Report export functionality will be implemented'
        }
        break
    }

    this.sendSuccess(res, result, `Bulk ${body.action} completed successfully`)
  })
}

// Export singleton instance
export const contentModerationController = new ContentModerationController()
