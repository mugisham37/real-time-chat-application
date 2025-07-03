import { getRedisManager } from "../config/redis"
import { logger } from "../utils/logger"
import { ApiError } from "../utils/apiError"
import { userRepository } from "@chatapp/database"
import { messageRepository } from "@chatapp/database"
import { groupRepository } from "@chatapp/database"

export class AnalyticsService {
  private redis = getRedisManager()

  /**
   * Track user activity
   */
  async trackUserActivity(
    userId: string,
    activity: {
      type:
        | "login"
        | "message_sent"
        | "message_read"
        | "group_created"
        | "group_joined"
        | "call_initiated"
        | "call_received"
        | "profile_updated"
        | "search"
      metadata?: Record<string, any>
    },
  ): Promise<void> {
    try {
      const timestamp = Date.now()
      const activityData = {
        userId,
        timestamp,
        type: activity.type,
        metadata: activity.metadata || {},
      }

      // Store activity in Redis using sorted sets for time-based queries
      await this.redis.hSet(
        `analytics:activity:${userId}:${timestamp}`,
        {
          data: JSON.stringify(activityData),
          type: activity.type,
          timestamp: timestamp.toString(),
        }
      )

      // Set expiration for individual activity records (30 days)
      await this.redis.expire(`analytics:activity:${userId}:${timestamp}`, 30 * 24 * 60 * 60)

      // Increment activity counter
      await this.redis.incr(`analytics:activity_count:${userId}:${activity.type}`)

      // Increment daily activity counter
      const date = new Date().toISOString().split("T")[0] // YYYY-MM-DD
      await this.redis.incr(`analytics:activity_count:${userId}:${activity.type}:${date}`)

      // Increment global activity counter
      await this.redis.incr(`analytics:global:${activity.type}`)
      await this.redis.incr(`analytics:global:${activity.type}:${date}`)

      // Add to user activity timeline (sorted set)
      await this.redis.client.zAdd(`analytics:timeline:${userId}`, {
        score: timestamp,
        value: JSON.stringify(activityData),
      })

      // Keep only last 1000 activities per user
      await this.redis.client.zRemRangeByRank(`analytics:timeline:${userId}`, 0, -1001)
    } catch (error) {
      logger.error(`Error tracking user activity for user ${userId}:`, error)
      // Don't throw, analytics are non-critical
    }
  }

  /**
   * Get user activity
   */
  async getUserActivity(
    userId: string,
    options: {
      startTime?: number
      endTime?: number
      limit?: number
      activityTypes?: string[]
    } = {},
  ): Promise<any[]> {
    try {
      const { startTime = 0, endTime = Date.now(), limit = 100, activityTypes } = options

      // Get activity from Redis sorted set
      const result = await this.redis.client.zRangeByScore(
        `analytics:timeline:${userId}`,
        startTime,
        endTime,
        { LIMIT: { offset: 0, count: limit } }
      )

      if (!result || result.length === 0) {
        return []
      }

      // Parse activities
      const activities = result.map((item) => {
        try {
          return JSON.parse(item)
        } catch (error) {
          logger.error(`Error parsing activity data: ${item}`, error)
          return null
        }
      }).filter(Boolean)

      // Filter by activity type if specified
      const filteredActivities = activityTypes
        ? activities.filter((activity) => activityTypes.includes(activity.type))
        : activities

      // Sort by timestamp (newest first)
      return filteredActivities.sort((a, b) => b.timestamp - a.timestamp)
    } catch (error) {
      logger.error(`Error getting user activity for user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Get user activity counts
   */
  async getUserActivityCounts(
    userId: string,
    options: {
      days?: number
      activityTypes?: string[]
    } = {},
  ): Promise<Record<string, any>> {
    try {
      const {
        days = 30,
        activityTypes = [
          "login",
          "message_sent",
          "message_read",
          "group_created",
          "group_joined",
          "call_initiated",
          "call_received",
          "profile_updated",
          "search",
        ],
      } = options

      const counts: Record<string, any> = {}

      // Get counts for each activity type
      for (const type of activityTypes) {
        const count = await this.redis.get(`analytics:activity_count:${userId}:${type}`)
        counts[type] = count ? Number.parseInt(count, 10) : 0
      }

      // Get daily counts for the specified number of days
      if (days > 0) {
        counts.dailyCounts = {}

        for (let i = 0; i < days; i++) {
          const date = new Date()
          date.setDate(date.getDate() - i)
          const dateStr = date.toISOString().split("T")[0] // YYYY-MM-DD

          counts.dailyCounts[dateStr] = {}

          for (const type of activityTypes) {
            const count = await this.redis.get(`analytics:activity_count:${userId}:${type}:${dateStr}`)
            counts.dailyCounts[dateStr][type] = count ? Number.parseInt(count, 10) : 0
          }
        }
      }

      return counts
    } catch (error) {
      logger.error(`Error getting user activity counts for user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Get global activity counts
   */
  async getGlobalActivityCounts(
    options: {
      days?: number
      activityTypes?: string[]
    } = {},
  ): Promise<Record<string, any>> {
    try {
      const {
        days = 30,
        activityTypes = [
          "login",
          "message_sent",
          "message_read",
          "group_created",
          "group_joined",
          "call_initiated",
          "call_received",
          "profile_updated",
          "search",
        ],
      } = options

      const counts: Record<string, any> = {}

      // Get counts for each activity type
      for (const type of activityTypes) {
        const count = await this.redis.get(`analytics:global:${type}`)
        counts[type] = count ? Number.parseInt(count, 10) : 0
      }

      // Get daily counts for the specified number of days
      if (days > 0) {
        counts.dailyCounts = {}

        for (let i = 0; i < days; i++) {
          const date = new Date()
          date.setDate(date.getDate() - i)
          const dateStr = date.toISOString().split("T")[0] // YYYY-MM-DD

          counts.dailyCounts[dateStr] = {}

          for (const type of activityTypes) {
            const count = await this.redis.get(`analytics:global:${type}:${dateStr}`)
            counts.dailyCounts[dateStr][type] = count ? Number.parseInt(count, 10) : 0
          }
        }
      }

      return counts
    } catch (error) {
      logger.error("Error getting global activity counts:", error)
      throw error
    }
  }

  /**
   * Get user engagement metrics
   */
  async getUserEngagementMetrics(userId: string): Promise<{
    messagesSent: number
    messagesReceived: number
    groupsJoined: number
    callsInitiated: number
    callsReceived: number
    totalActiveTime: number
    averageDailyActiveTime: number
    lastActive: Date
  }> {
    try {
      // Get user
      const user = await userRepository.findById(userId)

      if (!user) {
        throw ApiError.notFound("User not found")
      }

      // Get activity counts
      const activityCounts = await this.getUserActivityCounts(userId)

      // Get messages sent
      const messagesSent = activityCounts.message_sent || 0

      // Get messages received (approximate from database)
      const messagesReceived = await this.getMessagesReceivedCount(userId)

      // Get groups joined
      const groupsJoined = await this.getUserGroupsCount(userId)

      // Get calls initiated and received
      const callsInitiated = activityCounts.call_initiated || 0
      const callsReceived = activityCounts.call_received || 0

      // Calculate total active time (from activity timeline)
      const totalActiveTime = await this.calculateUserActiveTime(userId)

      // Calculate average daily active time
      const createdAt = user.createdAt || new Date()
      const daysSinceCreation = Math.max(1, Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)))
      const averageDailyActiveTime = totalActiveTime / daysSinceCreation

      // Get last active time
      const lastActive = user.lastSeen || createdAt

      return {
        messagesSent,
        messagesReceived,
        groupsJoined,
        callsInitiated,
        callsReceived,
        totalActiveTime,
        averageDailyActiveTime,
        lastActive,
      }
    } catch (error) {
      logger.error(`Error getting user engagement metrics for user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Get system statistics
   */
  async getSystemStats(): Promise<{
    totalUsers: number
    activeUsers: {
      daily: number
      weekly: number
      monthly: number
    }
    totalMessages: number
    totalGroups: number
    messagesByDay: Record<string, number>
    usersByDay: Record<string, number>
  }> {
    try {
      // Get total users
      const totalUsers = await this.getTotalUsersCount()

      // Get active users
      const now = new Date()
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

      const [dailyActiveUsers, weeklyActiveUsers, monthlyActiveUsers] = await Promise.all([
        this.getActiveUsersSince(oneDayAgo),
        this.getActiveUsersSince(oneWeekAgo),
        this.getActiveUsersSince(oneMonthAgo),
      ])

      // Get total messages and groups
      const [totalMessages, totalGroups] = await Promise.all([
        this.getTotalMessagesCount(),
        this.getTotalGroupsCount(),
      ])

      // Get messages by day (last 30 days)
      const messagesByDay: Record<string, number> = {}
      const usersByDay: Record<string, number> = {}

      for (let i = 0; i < 30; i++) {
        const date = new Date()
        date.setDate(date.getDate() - i)
        const dateStr = date.toISOString().split("T")[0] // YYYY-MM-DD

        const [messagesCount, newUsersCount] = await Promise.all([
          this.getMessagesByDate(date),
          this.getNewUsersByDate(date),
        ])

        messagesByDay[dateStr] = messagesCount
        usersByDay[dateStr] = newUsersCount
      }

      return {
        totalUsers,
        activeUsers: {
          daily: dailyActiveUsers,
          weekly: weeklyActiveUsers,
          monthly: monthlyActiveUsers,
        },
        totalMessages,
        totalGroups,
        messagesByDay,
        usersByDay,
      }
    } catch (error) {
      logger.error("Error getting system statistics:", error)
      throw error
    }
  }

  /**
   * Helper methods for database queries
   */
  private async getMessagesReceivedCount(userId: string): Promise<number> {
    try {
      // This is an approximation - in a real implementation, you'd track this more precisely
      const userConversations = await this.getUserConversationsCount(userId)
      const avgMessagesPerConversation = 10 // Rough estimate
      return Math.max(0, userConversations * avgMessagesPerConversation)
    } catch (error) {
      logger.error(`Error getting messages received count for user ${userId}:`, error)
      return 0
    }
  }

  private async getUserGroupsCount(userId: string): Promise<number> {
    try {
      // Use Redis cache first
      const cached = await this.redis.get(`analytics:user_groups_count:${userId}`)
      if (cached) {
        return Number.parseInt(cached, 10)
      }

      // Fallback to database query simulation
      const count = await this.redis.sCard(`user:${userId}:groups`)
      
      // Cache for 1 hour
      await this.redis.set(`analytics:user_groups_count:${userId}`, count.toString(), 3600)
      
      return count
    } catch (error) {
      logger.error(`Error getting user groups count for user ${userId}:`, error)
      return 0
    }
  }

  private async getUserConversationsCount(userId: string): Promise<number> {
    try {
      const count = await this.redis.sCard(`user:${userId}:conversations`)
      return count
    } catch (error) {
      logger.error(`Error getting user conversations count for user ${userId}:`, error)
      return 0
    }
  }

  private async calculateUserActiveTime(userId: string): Promise<number> {
    try {
      // Get user activity timeline
      const activities = await this.getUserActivity(userId, { limit: 1000 })
      
      if (activities.length === 0) return 0

      // Simple calculation: assume 5 minutes of activity per tracked event
      const avgActivityDuration = 5 * 60 * 1000 // 5 minutes in milliseconds
      return activities.length * avgActivityDuration
    } catch (error) {
      logger.error(`Error calculating user active time for user ${userId}:`, error)
      return 0
    }
  }

  private async getTotalUsersCount(): Promise<number> {
    try {
      const cached = await this.redis.get("analytics:total_users_count")
      if (cached) {
        return Number.parseInt(cached, 10)
      }

      // In a real implementation, this would query the database
      // For now, we'll use a Redis counter
      const count = await this.redis.get("system:total_users") || "0"
      const totalUsers = Number.parseInt(count, 10)

      // Cache for 10 minutes
      await this.redis.set("analytics:total_users_count", totalUsers.toString(), 600)
      
      return totalUsers
    } catch (error) {
      logger.error("Error getting total users count:", error)
      return 0
    }
  }

  private async getActiveUsersSince(since: Date): Promise<number> {
    try {
      const timestamp = since.getTime()
      const cacheKey = `analytics:active_users_since:${timestamp}`
      
      const cached = await this.redis.get(cacheKey)
      if (cached) {
        return Number.parseInt(cached, 10)
      }

      // Count unique users with activity since the given time
      const count = await this.redis.client.zCount("analytics:global_user_activity", timestamp, Date.now())
      
      // Cache for 5 minutes
      await this.redis.set(cacheKey, count.toString(), 300)
      
      return count
    } catch (error) {
      logger.error(`Error getting active users since ${since}:`, error)
      return 0
    }
  }

  private async getTotalMessagesCount(): Promise<number> {
    try {
      const count = await this.redis.get("system:total_messages") || "0"
      return Number.parseInt(count, 10)
    } catch (error) {
      logger.error("Error getting total messages count:", error)
      return 0
    }
  }

  private async getTotalGroupsCount(): Promise<number> {
    try {
      const count = await this.redis.get("system:total_groups") || "0"
      return Number.parseInt(count, 10)
    } catch (error) {
      logger.error("Error getting total groups count:", error)
      return 0
    }
  }

  private async getMessagesByDate(date: Date): Promise<number> {
    try {
      const dateStr = date.toISOString().split("T")[0]
      const count = await this.redis.get(`analytics:messages_by_date:${dateStr}`) || "0"
      return Number.parseInt(count, 10)
    } catch (error) {
      logger.error(`Error getting messages by date ${date}:`, error)
      return 0
    }
  }

  private async getNewUsersByDate(date: Date): Promise<number> {
    try {
      const dateStr = date.toISOString().split("T")[0]
      const count = await this.redis.get(`analytics:new_users_by_date:${dateStr}`) || "0"
      return Number.parseInt(count, 10)
    } catch (error) {
      logger.error(`Error getting new users by date ${date}:`, error)
      return 0
    }
  }
}

// Export singleton instance
export const analyticsService = new AnalyticsService()
