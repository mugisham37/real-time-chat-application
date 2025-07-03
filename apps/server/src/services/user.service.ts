import { userRepository } from "@chatapp/database"
import { ApiError } from "../utils/apiError"
import { logger } from "../utils/logger"
import { getRedisManager } from "../config/redis"
import { analyticsService } from "./analytics.service"

export class UserService {
  private redis = getRedisManager()

  /**
   * Get user profile
   */
  async getUserProfile(userId: string): Promise<any> {
    try {
      // Try to get from cache first
      const cachedUser = await this.redis.getJSON(`user:${userId}:profile`)
      
      if (cachedUser) {
        return cachedUser
      }

      const user = await userRepository.findById(userId)

      if (!user) {
        throw ApiError.notFound("User not found")
      }

      const userProfile = {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        bio: user.bio,
        status: user.status,
        isOnline: user.isOnline,
        lastSeen: user.lastSeen,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }

      // Cache user profile for 30 minutes
      await this.redis.setJSON(`user:${userId}:profile`, userProfile, 1800)

      return userProfile
    } catch (error) {
      logger.error(`Error getting user profile for ${userId}:`, error)
      throw error
    }
  }

  /**
   * Update user profile
   */
  async updateUserProfile(
    userId: string,
    updateData: {
      firstName?: string
      lastName?: string
      avatar?: string
      bio?: string
      status?: string
    },
  ): Promise<any> {
    try {
      const updatedUser = await userRepository.update(userId, updateData)

      if (!updatedUser) {
        throw ApiError.notFound("User not found")
      }

      const userProfile = {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        avatar: updatedUser.avatar,
        bio: updatedUser.bio,
        status: updatedUser.status,
        isOnline: updatedUser.isOnline,
        lastSeen: updatedUser.lastSeen,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt
      }

      // Update cache
      await this.redis.setJSON(`user:${userId}:profile`, userProfile, 1800)

      // Track profile update
      await analyticsService.trackUserActivity(userId, {
        type: "profile_updated",
        metadata: { fields: Object.keys(updateData) }
      })

      logger.info(`User profile updated: ${userId}`, updateData)

      return userProfile
    } catch (error) {
      logger.error(`Error updating user profile for ${userId}:`, error)
      throw error
    }
  }

  /**
   * Update user status
   */
  async updateUserStatus(userId: string, isOnline: boolean, customStatus?: string): Promise<any> {
    try {
      const updateData: any = {
        isOnline,
        lastSeen: new Date()
      }

      if (customStatus !== undefined) {
        updateData.status = customStatus
      }

      const updatedUser = await userRepository.update(userId, updateData)

      if (!updatedUser) {
        throw ApiError.notFound("User not found")
      }

      // Update online status in Redis
      await this.redis.set(`user:${userId}:status`, isOnline ? "online" : "offline", 3600)

      // Update cached profile
      const cachedProfile = await this.redis.getJSON(`user:${userId}:profile`)
      if (cachedProfile) {
        const updatedProfile = {
          ...cachedProfile,
          isOnline,
          status: customStatus || (cachedProfile as any).status,
          lastSeen: updateData.lastSeen
        }
        await this.redis.setJSON(`user:${userId}:profile`, updatedProfile, 1800)
      }

      // Track login/logout activity
      await analyticsService.trackUserActivity(userId, {
        type: "login",
        metadata: { action: isOnline ? "online" : "offline", customStatus }
      })

      logger.debug(`User status updated: ${userId}`, { isOnline, customStatus })

      return {
        id: updatedUser.id,
        isOnline: updatedUser.isOnline,
        status: updatedUser.status,
        lastSeen: updatedUser.lastSeen
      }
    } catch (error) {
      logger.error(`Error updating user status for ${userId}:`, error)
      throw error
    }
  }

  /**
   * Search users
   */
  async searchUsers(
    query: string, 
    currentUserId: string,
    options: {
      limit?: number
      skip?: number
      excludeBlocked?: boolean
    } = {}
  ): Promise<any[]> {
    try {
      const { limit = 20, skip = 0, excludeBlocked = true } = options

      // Try to get from cache first
      const cacheKey = `search:users:${query}:${limit}:${skip}:${excludeBlocked}`
      const cachedResults = await this.redis.getJSON(cacheKey)

      if (cachedResults) {
        // Filter out current user from cached results
        return (cachedResults as any[]).filter(user => user.id !== currentUserId)
      }

      const users = await userRepository.search(query, limit, skip)

      // Filter out current user and blocked users if requested
      let filteredUsers = users.filter(user => user.id !== currentUserId)

      if (excludeBlocked) {
        // Get blocked users list for current user
        const blockedUsers = await this.getBlockedUsers(currentUserId)
        const blockedUserIds = new Set(blockedUsers.map(user => user.id))
        
        filteredUsers = filteredUsers.filter(user => !blockedUserIds.has(user.id))
      }

      // Transform users to safe format
      const safeUsers = filteredUsers.map(user => ({
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        bio: user.bio,
        status: user.status,
        isOnline: user.isOnline,
        lastSeen: user.lastSeen
      }))

      // Cache results for 5 minutes
      await this.redis.setJSON(cacheKey, safeUsers, 300)

      // Track search activity
      await analyticsService.trackUserActivity(currentUserId, {
        type: "search",
        metadata: { query, resultsCount: safeUsers.length }
      })

      return safeUsers
    } catch (error) {
      logger.error(`Error searching users with query ${query}:`, error)
      throw error
    }
  }

  /**
   * Get user contacts
   */
  async getUserContacts(userId: string, limit = 50, skip = 0): Promise<any[]> {
    try {
      // Try to get from cache first
      const cacheKey = `user:${userId}:contacts:${limit}:${skip}`
      const cachedContacts = await this.redis.getJSON(cacheKey)

      if (cachedContacts) {
        return cachedContacts as any[]
      }

      const contacts = await userRepository.getContacts(userId, limit, skip)

      // Transform contacts to safe format
      const safeContacts = contacts.map(contact => ({
        id: contact.id,
        username: contact.username,
        firstName: contact.firstName,
        lastName: contact.lastName,
        avatar: contact.avatar,
        bio: contact.bio,
        status: contact.status,
        isOnline: contact.isOnline,
        lastSeen: contact.lastSeen,
        isFavorite: contact.isFavorite || false,
        addedAt: contact.addedAt
      }))

      // Cache contacts for 10 minutes
      await this.redis.setJSON(cacheKey, safeContacts, 600)

      return safeContacts
    } catch (error) {
      logger.error(`Error getting contacts for user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Add contact
   */
  async addContact(userId: string, contactId: string, favorite = false): Promise<any> {
    try {
      // Check if contact exists
      const contact = await userRepository.findById(contactId)

      if (!contact) {
        throw ApiError.notFound("Contact user not found")
      }

      // Check if already a contact
      const existingContacts = await userRepository.getContacts(userId)
      const isAlreadyContact = existingContacts.some(c => c.id === contactId)

      if (isAlreadyContact) {
        throw ApiError.conflict("User is already in your contacts")
      }

      // Add contact
      await userRepository.addContact(userId, contactId, favorite)

      // Invalidate contacts cache
      await this.invalidateContactsCache(userId)

      logger.info(`Contact added: ${contactId} to user ${userId}`, { favorite })

      return {
        message: "Contact added successfully",
        contact: {
          id: contact.id,
          username: contact.username,
          firstName: contact.firstName,
          lastName: contact.lastName,
          avatar: contact.avatar,
          isFavorite: favorite
        }
      }
    } catch (error) {
      logger.error(`Error adding contact for user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Remove contact
   */
  async removeContact(userId: string, contactId: string): Promise<any> {
    try {
      const result = await userRepository.removeContact(userId, contactId)

      if (!result) {
        throw ApiError.notFound("Contact not found")
      }

      // Invalidate contacts cache
      await this.invalidateContactsCache(userId)

      logger.info(`Contact removed: ${contactId} from user ${userId}`)

      return {
        message: "Contact removed successfully"
      }
    } catch (error) {
      logger.error(`Error removing contact for user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Block user
   */
  async blockUser(userId: string, userToBlockId: string): Promise<any> {
    try {
      // Check if user exists
      const userToBlock = await userRepository.findById(userToBlockId)

      if (!userToBlock) {
        throw ApiError.notFound("User not found")
      }

      // Block user
      await userRepository.blockUser(userId, userToBlockId)

      // Invalidate caches
      await Promise.all([
        this.invalidateContactsCache(userId),
        this.invalidateBlockedUsersCache(userId)
      ])

      logger.info(`User blocked: ${userToBlockId} by user ${userId}`)

      return {
        message: "User blocked successfully"
      }
    } catch (error) {
      logger.error(`Error blocking user ${userToBlockId} for user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Unblock user
   */
  async unblockUser(userId: string, userToUnblockId: string): Promise<any> {
    try {
      const result = await userRepository.unblockUser(userId, userToUnblockId)

      if (!result) {
        throw ApiError.notFound("Blocked user not found")
      }

      // Invalidate caches
      await Promise.all([
        this.invalidateContactsCache(userId),
        this.invalidateBlockedUsersCache(userId)
      ])

      logger.info(`User unblocked: ${userToUnblockId} by user ${userId}`)

      return {
        message: "User unblocked successfully"
      }
    } catch (error) {
      logger.error(`Error unblocking user ${userToUnblockId} for user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Get blocked users
   */
  async getBlockedUsers(userId: string): Promise<any[]> {
    try {
      // Try to get from cache first
      const cacheKey = `user:${userId}:blocked_users`
      const cachedBlockedUsers = await this.redis.getJSON(cacheKey)

      if (cachedBlockedUsers) {
        return cachedBlockedUsers as any[]
      }

      const blockedUsers = await userRepository.getBlockedUsers(userId)

      // Transform blocked users to safe format
      const safeBlockedUsers = blockedUsers.map(user => ({
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        blockedAt: user.blockedAt
      }))

      // Cache blocked users for 10 minutes
      await this.redis.setJSON(cacheKey, safeBlockedUsers, 600)

      return safeBlockedUsers
    } catch (error) {
      logger.error(`Error getting blocked users for user ${userId}:`, error)
      return []
    }
  }

  /**
   * Get user statistics
   */
  async getUserStats(userId: string): Promise<{
    totalContacts: number
    totalConversations: number
    totalMessagesSent: number
    totalMessagesReceived: number
    joinedAt: Date
    lastActive: Date
    isOnline: boolean
  }> {
    try {
      const user = await userRepository.findById(userId)

      if (!user) {
        throw ApiError.notFound("User not found")
      }

      // Get basic stats (these would need to be implemented in repositories)
      const stats = {
        totalContacts: 0, // await userRepository.getContactsCount(userId)
        totalConversations: 0, // await conversationRepository.getConversationsCount(userId)
        totalMessagesSent: 0, // await messageRepository.getMessagesSentCount(userId)
        totalMessagesReceived: 0, // await messageRepository.getMessagesReceivedCount(userId)
        joinedAt: user.createdAt,
        lastActive: user.lastSeen,
        isOnline: user.isOnline
      }

      return stats
    } catch (error) {
      logger.error(`Error getting user stats for ${userId}:`, error)
      throw error
    }
  }

  /**
   * Delete user account
   */
  async deleteUserAccount(userId: string): Promise<{ message: string }> {
    try {
      // This would need to be implemented to handle cascading deletes
      // For now, just mark as deleted
      await userRepository.update(userId, {
        isDeleted: true,
        deletedAt: new Date()
      })

      // Clear all caches for this user
      await this.clearUserCaches(userId)

      logger.info(`User account deleted: ${userId}`)

      return {
        message: "Account deleted successfully"
      }
    } catch (error) {
      logger.error(`Error deleting user account ${userId}:`, error)
      throw error
    }
  }

  /**
   * Helper methods
   */
  private async invalidateContactsCache(userId: string): Promise<void> {
    try {
      const keys = await this.redis.keys(`user:${userId}:contacts:*`)
      if (keys.length > 0) {
        await this.redis.delete(...keys)
      }
    } catch (error) {
      logger.error(`Error invalidating contacts cache for user ${userId}:`, error)
    }
  }

  private async invalidateBlockedUsersCache(userId: string): Promise<void> {
    try {
      await this.redis.del(`user:${userId}:blocked_users`)
    } catch (error) {
      logger.error(`Error invalidating blocked users cache for user ${userId}:`, error)
    }
  }

  private async clearUserCaches(userId: string): Promise<void> {
    try {
      const keys = await this.redis.keys(`user:${userId}:*`)
      if (keys.length > 0) {
        await this.redis.delete(...keys)
      }
    } catch (error) {
      logger.error(`Error clearing user caches for ${userId}:`, error)
    }
  }
}

// Export singleton instance
export const userService = new UserService()
