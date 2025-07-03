import { getRedisManager } from "../config/redis"
import { logger } from "../utils/logger"
import { ApiError } from "../utils/apiError"
import { userRepository } from "@chatapp/database"
import { analyticsService } from "./analytics.service"

interface PresenceStatus {
  userId: string
  status: "online" | "away" | "busy" | "invisible" | "offline"
  customMessage?: string
  lastSeen: Date
  deviceInfo?: {
    type: "web" | "mobile" | "desktop"
    userAgent?: string
    platform?: string
  }
  location?: {
    country?: string
    city?: string
    timezone?: string
  }
}

interface TypingIndicator {
  userId: string
  conversationId: string
  isTyping: boolean
  startedAt: Date
  expiresAt: Date
}

interface ActivityStatus {
  userId: string
  activity: "idle" | "active" | "in_call" | "in_meeting" | "gaming" | "custom"
  details?: string
  startedAt: Date
  expiresAt?: Date
}

interface UserLocation {
  userId: string
  latitude?: number
  longitude?: number
  country?: string
  city?: string
  timezone?: string
  lastUpdated: Date
  isShared: boolean
}

export class PresenceService {
  private redis = getRedisManager()
  private typingTimeouts: Map<string, NodeJS.Timeout> = new Map()

  /**
   * Update user presence status
   */
  async updatePresence(
    userId: string,
    status: "online" | "away" | "busy" | "invisible" | "offline",
    customMessage?: string,
    deviceInfo?: {
      type: "web" | "mobile" | "desktop"
      userAgent?: string
      platform?: string
    }
  ): Promise<PresenceStatus> {
    try {
      const presence: PresenceStatus = {
        userId,
        status,
        customMessage,
        lastSeen: new Date(),
        deviceInfo
      }

      // Store presence in Redis with 1 hour expiration
      await this.redis.setJSON(`presence:${userId}`, presence, 3600)

      // Update user's last seen in database
      await userRepository.update(userId, {
        lastSeen: new Date(),
        isOnline: status === "online"
      })

      // Add to online users set if online
      if (status === "online") {
        await this.redis.sAdd("presence:online_users", userId)
        await this.redis.expire("presence:online_users", 3600)
      } else {
        await this.redis.sRem("presence:online_users", userId)
      }

      // Track presence activity
      await analyticsService.trackUserActivity(userId, {
        type: "login",
        metadata: { 
          action: "presence_update", 
          status, 
          deviceType: deviceInfo?.type,
          platform: deviceInfo?.platform
        }
      })

      // Notify contacts about presence change
      await this.notifyContactsOfPresenceChange(userId, presence)

      logger.debug(`Presence updated for user ${userId}`, { status, deviceType: deviceInfo?.type })

      return presence
    } catch (error) {
      logger.error(`Error updating presence for user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Get user presence
   */
  async getUserPresence(userId: string): Promise<PresenceStatus | null> {
    try {
      const presence = await this.redis.getJSON(`presence:${userId}`)
      
      if (!presence) {
        // Fallback to database
        const user = await userRepository.findById(userId)
        if (user) {
          return {
            userId,
            status: user.isOnline ? "online" : "offline",
            lastSeen: user.lastSeen || new Date()
          }
        }
        return null
      }

      return presence as PresenceStatus
    } catch (error) {
      logger.error(`Error getting presence for user ${userId}:`, error)
      return null
    }
  }

  /**
   * Get multiple users' presence
   */
  async getMultipleUsersPresence(userIds: string[]): Promise<Record<string, PresenceStatus | null>> {
    try {
      const presences: Record<string, PresenceStatus | null> = {}

      // Get all presences in parallel
      const promises = userIds.map(async (userId) => {
        const presence = await this.getUserPresence(userId)
        return { userId, presence }
      })

      const results = await Promise.all(promises)

      for (const { userId, presence } of results) {
        presences[userId] = presence
      }

      return presences
    } catch (error) {
      logger.error("Error getting multiple users presence:", error)
      return {}
    }
  }

  /**
   * Get online users
   */
  async getOnlineUsers(limit = 100): Promise<string[]> {
    try {
      const onlineUsers = await this.redis.sMembers("presence:online_users")
      return onlineUsers.slice(0, limit)
    } catch (error) {
      logger.error("Error getting online users:", error)
      return []
    }
  }

  /**
   * Get online users count
   */
  async getOnlineUsersCount(): Promise<number> {
    try {
      return await this.redis.sCard("presence:online_users")
    } catch (error) {
      logger.error("Error getting online users count:", error)
      return 0
    }
  }

  /**
   * Set typing indicator
   */
  async setTypingIndicator(
    userId: string,
    conversationId: string,
    isTyping: boolean
  ): Promise<void> {
    try {
      const key = `typing:${conversationId}:${userId}`

      if (isTyping) {
        const typingIndicator: TypingIndicator = {
          userId,
          conversationId,
          isTyping: true,
          startedAt: new Date(),
          expiresAt: new Date(Date.now() + 10000) // 10 seconds
        }

        await this.redis.setJSON(key, typingIndicator, 10)

        // Clear existing timeout
        const existingTimeout = this.typingTimeouts.get(key)
        if (existingTimeout) {
          clearTimeout(existingTimeout)
        }

        // Set auto-clear timeout
        const timeout = setTimeout(async () => {
          await this.clearTypingIndicator(userId, conversationId)
          this.typingTimeouts.delete(key)
        }, 10000)

        this.typingTimeouts.set(key, timeout)
      } else {
        await this.clearTypingIndicator(userId, conversationId)
      }

      logger.debug(`Typing indicator ${isTyping ? 'set' : 'cleared'}`, { userId, conversationId })
    } catch (error) {
      logger.error(`Error setting typing indicator:`, error)
    }
  }

  /**
   * Clear typing indicator
   */
  async clearTypingIndicator(userId: string, conversationId: string): Promise<void> {
    try {
      const key = `typing:${conversationId}:${userId}`
      await this.redis.del(key)

      // Clear timeout
      const timeout = this.typingTimeouts.get(key)
      if (timeout) {
        clearTimeout(timeout)
        this.typingTimeouts.delete(key)
      }
    } catch (error) {
      logger.error(`Error clearing typing indicator:`, error)
    }
  }

  /**
   * Get typing users in conversation
   */
  async getTypingUsers(conversationId: string): Promise<TypingIndicator[]> {
    try {
      const pattern = `typing:${conversationId}:*`
      const keys = await this.redis.keys(pattern)

      const typingUsers: TypingIndicator[] = []

      for (const key of keys) {
        const indicator = await this.redis.getJSON(key)
        if (indicator) {
          typingUsers.push(indicator as TypingIndicator)
        }
      }

      return typingUsers
    } catch (error) {
      logger.error(`Error getting typing users for conversation ${conversationId}:`, error)
      return []
    }
  }

  /**
   * Set user activity status
   */
  async setActivityStatus(
    userId: string,
    activity: "idle" | "active" | "in_call" | "in_meeting" | "gaming" | "custom",
    details?: string,
    expiresInMinutes?: number
  ): Promise<ActivityStatus> {
    try {
      const activityStatus: ActivityStatus = {
        userId,
        activity,
        details,
        startedAt: new Date(),
        expiresAt: expiresInMinutes ? new Date(Date.now() + expiresInMinutes * 60 * 1000) : undefined
      }

      const ttl = expiresInMinutes ? expiresInMinutes * 60 : 3600 // Default 1 hour
      await this.redis.setJSON(`activity:${userId}`, activityStatus, ttl)

      // Track activity change
      await analyticsService.trackUserActivity(userId, {
        type: "profile_updated",
        metadata: { action: "activity_status_change", activity, details }
      })

      logger.debug(`Activity status set for user ${userId}`, { activity, details })

      return activityStatus
    } catch (error) {
      logger.error(`Error setting activity status for user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Get user activity status
   */
  async getUserActivityStatus(userId: string): Promise<ActivityStatus | null> {
    try {
      const activity = await this.redis.getJSON(`activity:${userId}`)
      return activity as ActivityStatus | null
    } catch (error) {
      logger.error(`Error getting activity status for user ${userId}:`, error)
      return null
    }
  }

  /**
   * Clear user activity status
   */
  async clearActivityStatus(userId: string): Promise<void> {
    try {
      await this.redis.del(`activity:${userId}`)
      logger.debug(`Activity status cleared for user ${userId}`)
    } catch (error) {
      logger.error(`Error clearing activity status for user ${userId}:`, error)
    }
  }

  /**
   * Update user location
   */
  async updateUserLocation(
    userId: string,
    location: {
      latitude?: number
      longitude?: number
      country?: string
      city?: string
      timezone?: string
    },
    isShared = false
  ): Promise<UserLocation> {
    try {
      const userLocation: UserLocation = {
        userId,
        ...location,
        lastUpdated: new Date(),
        isShared
      }

      // Store location with 24 hour expiration
      await this.redis.setJSON(`location:${userId}`, userLocation, 86400)

      // If location is shared, add to shared locations
      if (isShared) {
        await this.redis.sAdd("presence:shared_locations", userId)
        await this.redis.expire("presence:shared_locations", 86400)
      } else {
        await this.redis.sRem("presence:shared_locations", userId)
      }

      logger.debug(`Location updated for user ${userId}`, { isShared, country: location.country })

      return userLocation
    } catch (error) {
      logger.error(`Error updating location for user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Get user location
   */
  async getUserLocation(userId: string): Promise<UserLocation | null> {
    try {
      const location = await this.redis.getJSON(`location:${userId}`)
      return location as UserLocation | null
    } catch (error) {
      logger.error(`Error getting location for user ${userId}:`, error)
      return null
    }
  }

  /**
   * Get nearby users
   */
  async getNearbyUsers(
    userId: string,
    radiusKm = 10,
    limit = 20
  ): Promise<Array<{ userId: string; distance: number; location: UserLocation }>> {
    try {
      const userLocation = await this.getUserLocation(userId)
      if (!userLocation || !userLocation.latitude || !userLocation.longitude) {
        return []
      }

      const sharedLocationUsers = await this.redis.sMembers("presence:shared_locations")
      const nearbyUsers: Array<{ userId: string; distance: number; location: UserLocation }> = []

      for (const otherUserId of sharedLocationUsers) {
        if (otherUserId === userId) continue

        const otherLocation = await this.getUserLocation(otherUserId)
        if (!otherLocation || !otherLocation.latitude || !otherLocation.longitude) continue

        const distance = this.calculateDistance(
          userLocation.latitude,
          userLocation.longitude,
          otherLocation.latitude,
          otherLocation.longitude
        )

        if (distance <= radiusKm) {
          nearbyUsers.push({
            userId: otherUserId,
            distance,
            location: otherLocation
          })
        }
      }

      // Sort by distance and limit
      return nearbyUsers
        .sort((a, b) => a.distance - b.distance)
        .slice(0, limit)
    } catch (error) {
      logger.error(`Error getting nearby users for ${userId}:`, error)
      return []
    }
  }

  /**
   * Get presence statistics
   */
  async getPresenceStatistics(): Promise<{
    totalOnline: number
    totalAway: number
    totalBusy: number
    totalInvisible: number
    totalOffline: number
    deviceBreakdown: Record<string, number>
    locationBreakdown: Record<string, number>
  }> {
    try {
      const onlineUsers = await this.getOnlineUsers(1000) // Get up to 1000 online users
      
      const stats = {
        totalOnline: 0,
        totalAway: 0,
        totalBusy: 0,
        totalInvisible: 0,
        totalOffline: 0,
        deviceBreakdown: {} as Record<string, number>,
        locationBreakdown: {} as Record<string, number>
      }

      for (const userId of onlineUsers) {
        const presence = await this.getUserPresence(userId)
        if (!presence) continue

        // Count by status
        switch (presence.status) {
          case "online":
            stats.totalOnline++
            break
          case "away":
            stats.totalAway++
            break
          case "busy":
            stats.totalBusy++
            break
          case "invisible":
            stats.totalInvisible++
            break
          case "offline":
            stats.totalOffline++
            break
        }

        // Count by device type
        if (presence.deviceInfo?.type) {
          stats.deviceBreakdown[presence.deviceInfo.type] = 
            (stats.deviceBreakdown[presence.deviceInfo.type] || 0) + 1
        }

        // Count by location
        if (presence.location?.country) {
          stats.locationBreakdown[presence.location.country] = 
            (stats.locationBreakdown[presence.location.country] || 0) + 1
        }
      }

      return stats
    } catch (error) {
      logger.error("Error getting presence statistics:", error)
      throw error
    }
  }

  /**
   * Clean up expired presence data
   */
  async cleanupExpiredPresence(): Promise<number> {
    try {
      let cleanedCount = 0

      // Clean up expired typing indicators
      const typingKeys = await this.redis.keys("typing:*")
      for (const key of typingKeys) {
        const indicator = await this.redis.getJSON(key)
        if (indicator) {
          const typingData = indicator as TypingIndicator
          if (new Date() > new Date(typingData.expiresAt)) {
            await this.redis.del(key)
            cleanedCount++
          }
        }
      }

      // Clean up expired activity statuses
      const activityKeys = await this.redis.keys("activity:*")
      for (const key of activityKeys) {
        const activity = await this.redis.getJSON(key)
        if (activity) {
          const activityData = activity as ActivityStatus
          if (activityData.expiresAt && new Date() > new Date(activityData.expiresAt)) {
            await this.redis.del(key)
            cleanedCount++
          }
        }
      }

      logger.info(`Cleaned up ${cleanedCount} expired presence records`)
      return cleanedCount
    } catch (error) {
      logger.error("Error cleaning up expired presence data:", error)
      return 0
    }
  }

  /**
   * Helper methods
   */
  private async notifyContactsOfPresenceChange(userId: string, presence: PresenceStatus): Promise<void> {
    try {
      // Get user's contacts
      const contacts = await userRepository.getContacts(userId)
      
      // Notify each contact about the presence change
      // This would typically be done via WebSocket
      for (const contact of contacts) {
        // Emit presence change event to contact
        // socketService.emitToUser(contact.id, 'presence:change', { userId, presence })
      }
    } catch (error) {
      logger.error(`Error notifying contacts of presence change for user ${userId}:`, error)
    }
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371 // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1)
    const dLon = this.toRadians(lon2 - lon1)
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2)
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180)
  }
}

// Export singleton instance
export const presenceService = new PresenceService()
