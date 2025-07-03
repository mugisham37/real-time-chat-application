import { Request, Response } from 'express'
import { z } from 'zod'
import { BaseController } from './base.controller'
import { analyticsService } from '../services/analytics.service'

/**
 * Analytics Controller
 * Handles analytics and metrics endpoints
 */
export class AnalyticsController extends BaseController {
  /**
   * Get user activity
   * GET /api/analytics/user/:userId/activity
   */
  getUserActivity = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const targetUserId = req.params.userId

    // Users can only view their own analytics unless they're admin
    if (userId !== targetUserId) {
      this.requireAdmin(req)
    }

    const querySchema = z.object({
      startTime: z.coerce.number().optional(),
      endTime: z.coerce.number().optional(),
      limit: z.coerce.number().default(100),
      activityTypes: z.string().optional().transform(val => val ? val.split(',') : undefined)
    })

    const query = this.getQueryParams(req, querySchema)

    this.logAction('getUserActivity', userId, { targetUserId, query })

    const activities = await analyticsService.getUserActivity(targetUserId, {
      startTime: query.startTime,
      endTime: query.endTime,
      limit: query.limit,
      activityTypes: query.activityTypes
    })

    this.sendSuccess(res, activities, 'User activity retrieved successfully')
  })

  /**
   * Get user activity counts
   * GET /api/analytics/user/:userId/counts
   */
  getUserActivityCounts = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const targetUserId = req.params.userId

    // Users can only view their own analytics unless they're admin
    if (userId !== targetUserId) {
      this.requireAdmin(req)
    }

    const querySchema = z.object({
      days: z.coerce.number().default(30),
      activityTypes: z.string().optional().transform(val => val ? val.split(',') : undefined)
    })

    const query = this.getQueryParams(req, querySchema)

    this.logAction('getUserActivityCounts', userId, { targetUserId, query })

    const counts = await analyticsService.getUserActivityCounts(targetUserId, {
      days: query.days,
      activityTypes: query.activityTypes
    })

    this.sendSuccess(res, counts, 'User activity counts retrieved successfully')
  })

  /**
   * Get user engagement metrics
   * GET /api/analytics/user/:userId/engagement
   */
  getUserEngagementMetrics = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const targetUserId = req.params.userId

    // Users can only view their own analytics unless they're admin
    if (userId !== targetUserId) {
      this.requireAdmin(req)
    }

    this.logAction('getUserEngagementMetrics', userId, { targetUserId })

    const metrics = await analyticsService.getUserEngagementMetrics(targetUserId)

    // Transform sensitive data for non-admin users
    const transformedMetrics = this.transformData(metrics, (data) => ({
      ...data,
      lastActive: data.lastActive.toISOString()
    }))

    this.sendSuccess(res, transformedMetrics, 'User engagement metrics retrieved successfully')
  })

  /**
   * Get global activity counts
   * GET /api/analytics/global/activity
   */
  getGlobalActivityCounts = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    this.requireAdmin(req)

    const querySchema = z.object({
      days: z.coerce.number().default(30),
      activityTypes: z.string().optional().transform(val => val ? val.split(',') : undefined)
    })

    const query = this.getQueryParams(req, querySchema)

    this.logAction('getGlobalActivityCounts', userId, { query })

    const counts = await analyticsService.getGlobalActivityCounts({
      days: query.days,
      activityTypes: query.activityTypes
    })

    this.sendSuccess(res, counts, 'Global activity counts retrieved successfully')
  })

  /**
   * Get system statistics
   * GET /api/analytics/system/stats
   */
  getSystemStats = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    this.requireAdmin(req)

    this.logAction('getSystemStats', userId)

    const stats = await analyticsService.getSystemStats()

    this.sendSuccess(res, stats, 'System statistics retrieved successfully')
  })

  /**
   * Get current user's analytics summary
   * GET /api/analytics/me/summary
   */
  getMyAnalyticsSummary = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    this.logAction('getMyAnalyticsSummary', userId)

    const [activityCounts, engagementMetrics] = await Promise.all([
      analyticsService.getUserActivityCounts(userId, { days: 7 }),
      analyticsService.getUserEngagementMetrics(userId)
    ])

    const summary = {
      weeklyActivity: activityCounts,
      engagement: {
        ...engagementMetrics,
        lastActive: engagementMetrics.lastActive.toISOString()
      }
    }

    this.sendSuccess(res, summary, 'Analytics summary retrieved successfully')
  })

  /**
   * Track custom user activity
   * POST /api/analytics/track
   */
  trackActivity = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

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
      ]),
      metadata: z.record(z.any()).optional()
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('trackActivity', userId, { activityType: body.type })

    await analyticsService.trackUserActivity(userId, {
      type: body.type,
      metadata: body.metadata
    })

    this.sendSuccess(res, { tracked: true }, 'Activity tracked successfully')
  })

  /**
   * Get analytics dashboard data
   * GET /api/analytics/dashboard
   */
  getDashboardData = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    this.requireAdmin(req)

    const querySchema = z.object({
      period: z.enum(['day', 'week', 'month']).default('week')
    })

    const query = this.getQueryParams(req, querySchema)

    this.logAction('getDashboardData', userId, { period: query.period })

    const days = query.period === 'day' ? 1 : query.period === 'week' ? 7 : 30

    const [systemStats, globalActivity] = await Promise.all([
      analyticsService.getSystemStats(),
      analyticsService.getGlobalActivityCounts({ days })
    ])

    const dashboardData = {
      overview: {
        totalUsers: systemStats.totalUsers,
        activeUsers: systemStats.activeUsers,
        totalMessages: systemStats.totalMessages,
        totalGroups: systemStats.totalGroups
      },
      activity: globalActivity,
      trends: {
        messagesByDay: systemStats.messagesByDay,
        usersByDay: systemStats.usersByDay
      },
      period: query.period
    }

    this.sendSuccess(res, dashboardData, 'Dashboard data retrieved successfully')
  })

  /**
   * Export analytics data
   * GET /api/analytics/export
   */
  exportAnalytics = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    this.requireAdmin(req)

    const querySchema = z.object({
      format: z.enum(['json', 'csv']).default('json'),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      includeUserData: z.coerce.boolean().default(false)
    })

    const query = this.getQueryParams(req, querySchema)

    this.logAction('exportAnalytics', userId, { query })

    // Get system stats for export
    const systemStats = await analyticsService.getSystemStats()

    const exportData = {
      exportedAt: new Date().toISOString(),
      exportedBy: userId,
      period: {
        startDate: query.startDate,
        endDate: query.endDate
      },
      systemStats,
      format: query.format
    }

    if (query.format === 'csv') {
      // Convert to CSV format
      const csvData = this.convertToCSV(exportData)
      res.setHeader('Content-Type', 'text/csv')
      res.setHeader('Content-Disposition', 'attachment; filename=analytics-export.csv')
      res.send(csvData)
    } else {
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Content-Disposition', 'attachment; filename=analytics-export.json')
      this.sendSuccess(res, exportData, 'Analytics data exported successfully')
    }
  })

  /**
   * Helper method to convert data to CSV
   */
  private convertToCSV(data: any): string {
    // Simple CSV conversion - in production, use a proper CSV library
    const headers = Object.keys(data.systemStats)
    const rows = [headers.join(',')]
    
    // Add data rows
    const values = headers.map(header => {
      const value = data.systemStats[header]
      return typeof value === 'object' ? JSON.stringify(value) : value
    })
    rows.push(values.join(','))

    return rows.join('\n')
  }
}

// Export singleton instance
export const analyticsController = new AnalyticsController()
