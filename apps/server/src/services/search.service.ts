import { userRepository } from "@chatapp/database"
import { groupRepository } from "@chatapp/database"
import { messageRepository } from "@chatapp/database"
import { logger } from "../utils/logger"
import { getRedisManager } from "../config/redis"
import { config } from "../config"

export class SearchService {
  private redis = getRedisManager()

  /**
   * Search users
   */
  async searchUsers(
    query: string,
    userId: string,
    options: {
      limit?: number
      skip?: number
      cacheResults?: boolean
    } = {},
  ): Promise<any[]> {
    try {
      const { limit = 20, skip = 0, cacheResults = true } = options

      // Check cache first if enabled
      if (cacheResults && config.cache?.enabled) {
        const cacheKey = `search:users:${query}:${limit}:${skip}`
        const cachedResults = await this.redis.get(cacheKey)

        if (cachedResults) {
          return JSON.parse(cachedResults)
        }
      }

      // Perform search
      const users = await userRepository.search(query, { limit, offset: skip })

      // Filter out the current user
      const filteredUsers = users.filter((user) => user.id !== userId)

      // Cache results if enabled
      if (cacheResults && config.cache?.enabled) {
        const cacheKey = `search:users:${query}:${limit}:${skip}`
        await this.redis.set(
          cacheKey, 
          JSON.stringify(filteredUsers), 
          config.cache?.defaultTtl || 300
        )
      }

      return filteredUsers
    } catch (error) {
      logger.error(`Error searching users with query ${query}:`, error)
      throw error
    }
  }

  /**
   * Search groups
   */
  async searchGroups(
    query: string,
    userId: string,
    options: {
      limit?: number
      skip?: number
      includePrivate?: boolean
      cacheResults?: boolean
    } = {},
  ): Promise<any[]> {
    try {
      const { limit = 20, skip = 0, includePrivate = false, cacheResults = true } = options

      // Check cache first if enabled and not including private groups
      if (cacheResults && config.cache?.enabled && !includePrivate) {
        const cacheKey = `search:groups:${query}:${limit}:${skip}`
        const cachedResults = await this.redis.get(cacheKey)

        if (cachedResults) {
          return JSON.parse(cachedResults)
        }
      }

      let groups = []

      if (includePrivate) {
        // Get user's groups first
        const userGroups = await groupRepository.findByUserId(userId)

        // Filter user's groups by query
        const filteredUserGroups = userGroups.filter(
          (group) =>
            group.name.toLowerCase().includes(query.toLowerCase()) ||
            (group.description && group.description.toLowerCase().includes(query.toLowerCase())),
        )

        // Get public groups matching query
        const publicGroups = await groupRepository.searchPublic(query, { limit, offset: skip })

        // Combine and deduplicate
        const allGroups = [...filteredUserGroups, ...publicGroups]
        const groupIds = new Set()

        groups = allGroups
          .filter((group) => {
            if (groupIds.has(group.id)) {
              return false
            }
            groupIds.add(group.id)
            return true
          })
          .slice(0, limit)
      } else {
        // Just search public groups
        groups = await groupRepository.searchPublic(query, { limit, offset: skip })
      }

      // Cache results if enabled and not including private groups
      if (cacheResults && config.cache?.enabled && !includePrivate) {
        const cacheKey = `search:groups:${query}:${limit}:${skip}`
        await this.redis.set(
          cacheKey, 
          JSON.stringify(groups), 
          config.cache?.defaultTtl || 300
        )
      }

      return groups
    } catch (error) {
      logger.error(`Error searching groups with query ${query}:`, error)
      throw error
    }
  }

  /**
   * Search messages
   */
  async searchMessages(
    query: string,
    userId: string,
    options: {
      conversationId?: string
      conversationType?: "DIRECT" | "GROUP"
      limit?: number
      skip?: number
      startDate?: Date
      endDate?: Date
    } = {},
  ): Promise<any[]> {
    try {
      const { conversationId, conversationType, limit = 20, skip = 0, startDate, endDate } = options

      // Search messages using advancedSearch which supports conversationType
      const messages = await messageRepository.advancedSearch({
        query,
        userId,
        conversationId,
        conversationType,
        limit,
        skip,
        startDate,
        endDate,
      })

      return messages
    } catch (error) {
      logger.error(`Error searching messages with query ${query}:`, error)
      throw error
    }
  }

  /**
   * Global search across users, groups, and messages
   */
  async globalSearch(
    query: string,
    userId: string,
    options: {
      limit?: number
      includeMessages?: boolean
      includePrivateGroups?: boolean
    } = {},
  ): Promise<{
    users: any[]
    groups: any[]
    messages: any[]
  }> {
    try {
      const { limit = 5, includeMessages = true, includePrivateGroups = true } = options

      // Run searches in parallel
      const [users, groups, messages] = await Promise.all([
        this.searchUsers(query, userId, { limit }),
        this.searchGroups(query, userId, { limit, includePrivate: includePrivateGroups }),
        includeMessages ? this.searchMessages(query, userId, { limit }) : [],
      ])

      return {
        users,
        groups,
        messages,
      }
    } catch (error) {
      logger.error(`Error performing global search with query ${query}:`, error)
      throw error
    }
  }

  /**
   * Search suggestions based on user's activity
   */
  async getSearchSuggestions(
    userId: string,
    type: "users" | "groups" | "all" = "all",
    limit: number = 10
  ): Promise<{
    users?: any[]
    groups?: any[]
    recentSearches?: string[]
  }> {
    try {
      const suggestions: any = {}

      if (type === "users" || type === "all") {
        // Get recently contacted users
        const recentContacts = await userRepository.getRecentContacts(userId, { limit })
        suggestions.users = recentContacts
      }

      if (type === "groups" || type === "all") {
        // Get user's active groups
        const activeGroups = await groupRepository.findByUserId(userId)
        suggestions.groups = activeGroups
      }

      // Get recent search queries
      const recentSearches = await this.getRecentSearches(userId, limit)
      suggestions.recentSearches = recentSearches

      return suggestions
    } catch (error) {
      logger.error(`Error getting search suggestions for user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Save search query for suggestions
   */
  async saveSearchQuery(userId: string, query: string): Promise<void> {
    try {
      const key = `search:recent:${userId}`
      
      // Get current recent searches
      const recentSearches = await this.redis.get(key)
      let searches: string[] = recentSearches ? JSON.parse(recentSearches) : []

      // Remove query if it already exists
      searches = searches.filter(search => search !== query)

      // Add query to the beginning
      searches.unshift(query)

      // Keep only last 20 searches
      searches = searches.slice(0, 20)

      // Save back to Redis with 30 days expiration
      await this.redis.set(key, JSON.stringify(searches), 30 * 24 * 60 * 60)
    } catch (error) {
      logger.error(`Error saving search query for user ${userId}:`, error)
      // Don't throw, this is non-critical
    }
  }

  /**
   * Get recent search queries
   */
  async getRecentSearches(userId: string, limit: number = 10): Promise<string[]> {
    try {
      const key = `search:recent:${userId}`
      const recentSearches = await this.redis.get(key)
      
      if (!recentSearches) {
        return []
      }

      const searches: string[] = JSON.parse(recentSearches)
      return searches.slice(0, limit)
    } catch (error) {
      logger.error(`Error getting recent searches for user ${userId}:`, error)
      return []
    }
  }

  /**
   * Clear recent searches
   */
  async clearRecentSearches(userId: string): Promise<void> {
    try {
      const key = `search:recent:${userId}`
      await this.redis.del(key)
    } catch (error) {
      logger.error(`Error clearing recent searches for user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Get search analytics
   */
  async getSearchAnalytics(
    userId: string,
    timeframe: "day" | "week" | "month" = "week"
  ): Promise<{
    totalSearches: number
    topQueries: Array<{ query: string; count: number }>
    searchesByType: Record<string, number>
    averageResultsPerSearch: number
  }> {
    try {
      const key = `search:analytics:${userId}:${timeframe}`
      const analytics = await this.redis.get(key)

      if (analytics) {
        return JSON.parse(analytics)
      }

      // Return default analytics if none found
      return {
        totalSearches: 0,
        topQueries: [],
        searchesByType: {},
        averageResultsPerSearch: 0
      }
    } catch (error) {
      logger.error(`Error getting search analytics for user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Track search analytics
   */
  async trackSearch(
    userId: string,
    query: string,
    type: "users" | "groups" | "messages" | "global",
    resultCount: number
  ): Promise<void> {
    try {
      // Save the search query
      await this.saveSearchQuery(userId, query)

      // Track analytics for different timeframes
      const timeframes = ["day", "week", "month"]
      
      for (const timeframe of timeframes) {
        const key = `search:analytics:${userId}:${timeframe}`
        const analytics = await this.redis.get(key)
        
        let data = analytics ? JSON.parse(analytics) : {
          totalSearches: 0,
          topQueries: [],
          searchesByType: {},
          averageResultsPerSearch: 0,
          totalResults: 0
        }

        // Update analytics
        data.totalSearches++
        data.totalResults += resultCount
        data.averageResultsPerSearch = data.totalResults / data.totalSearches

        // Update searches by type
        data.searchesByType[type] = (data.searchesByType[type] || 0) + 1

        // Update top queries
        const existingQuery = data.topQueries.find((q: any) => q.query === query)
        if (existingQuery) {
          existingQuery.count++
        } else {
          data.topQueries.push({ query, count: 1 })
        }

        // Sort and limit top queries
        data.topQueries.sort((a: any, b: any) => b.count - a.count)
        data.topQueries = data.topQueries.slice(0, 10)

        // Set expiration based on timeframe
        let ttl = 24 * 60 * 60 // 1 day
        if (timeframe === "week") ttl = 7 * 24 * 60 * 60
        if (timeframe === "month") ttl = 30 * 24 * 60 * 60

        await this.redis.set(key, JSON.stringify(data), ttl)
      }
    } catch (error) {
      logger.error(`Error tracking search analytics:`, error)
      // Don't throw, analytics are non-critical
    }
  }

  /**
   * Clear search cache
   */
  async clearSearchCache(): Promise<number> {
    try {
      const keys = await this.redis.keys("search:*")

      if (keys.length === 0) {
        return 0
      }

      await this.redis.delete(...keys)
      return keys.length
    } catch (error) {
      logger.error("Error clearing search cache:", error)
      throw error
    }
  }

  /**
   * Get popular searches (global)
   */
  async getPopularSearches(limit: number = 10): Promise<Array<{ query: string; count: number }>> {
    try {
      const key = "search:popular:global"
      const popularSearches = await this.redis.get(key)

      if (!popularSearches) {
        return []
      }

      const searches = JSON.parse(popularSearches)
      return searches.slice(0, limit)
    } catch (error) {
      logger.error("Error getting popular searches:", error)
      return []
    }
  }

  /**
   * Update popular searches
   */
  async updatePopularSearches(query: string): Promise<void> {
    try {
      const key = "search:popular:global"
      const popularSearches = await this.redis.get(key)
      
      let searches: Array<{ query: string; count: number }> = popularSearches 
        ? JSON.parse(popularSearches) 
        : []

      // Find existing query
      const existingQuery = searches.find(search => search.query === query)
      
      if (existingQuery) {
        existingQuery.count++
      } else {
        searches.push({ query, count: 1 })
      }

      // Sort by count and keep top 100
      searches.sort((a, b) => b.count - a.count)
      searches = searches.slice(0, 100)

      // Save with 7 days expiration
      await this.redis.set(key, JSON.stringify(searches), 7 * 24 * 60 * 60)
    } catch (error) {
      logger.error("Error updating popular searches:", error)
      // Don't throw, this is non-critical
    }
  }

  /**
   * Advanced search with filters
   */
  async advancedSearch(
    query: string,
    userId: string,
    filters: {
      type?: "users" | "groups" | "messages"
      dateRange?: { start: Date; end: Date }
      userIds?: string[]
      groupIds?: string[]
      messageTypes?: string[]
      hasAttachments?: boolean
      limit?: number
      skip?: number
    } = {}
  ): Promise<{
    results: any[]
    total: number
    facets?: Record<string, any>
  }> {
    try {
      const { type, limit = 20, skip = 0 } = filters

      let results: any[] = []
      let total = 0

      switch (type) {
        case "users":
          results = await this.searchUsers(query, userId, { limit, skip })
          total = results.length
          break

        case "groups":
          results = await this.searchGroups(query, userId, { limit, skip })
          total = results.length
          break

        case "messages":
          results = await messageRepository.advancedSearch({
            query,
            userId,
            ...filters
          })
          total = results.length
          break

        default:
          // Global search with filters
          const globalResults = await this.globalSearch(query, userId, { limit })
          results = [
            ...globalResults.users,
            ...globalResults.groups,
            ...globalResults.messages
          ]
          total = results.length
      }

      // Track the search
      await this.trackSearch(userId, query, type || "global", results.length)
      await this.updatePopularSearches(query)

      return {
        results,
        total,
        facets: {
          users: type === "users" ? results.length : 0,
          groups: type === "groups" ? results.length : 0,
          messages: type === "messages" ? results.length : 0
        }
      }
    } catch (error) {
      logger.error(`Error performing advanced search:`, error)
      throw error
    }
  }
}

// Export singleton instance
export const searchService = new SearchService()
