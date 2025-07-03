import { getRedisManager } from "../config/redis"
import { logger } from "../utils/logger"
import { ApiError } from "../utils/apiError"
import { userRepository, messageRepository } from "@chatapp/database"
import { notificationService } from "./notification.service"
import { analyticsService } from "./analytics.service"
import { NotificationBuilder } from "../utils/notificationBuilder"

interface ModerationRule {
  id: string
  type: "profanity" | "spam" | "harassment" | "inappropriate_content" | "custom"
  pattern: string | RegExp
  severity: "low" | "medium" | "high" | "critical"
  action: "warn" | "delete" | "mute" | "ban" | "review"
  enabled: boolean
  createdAt: Date
  updatedAt: Date
}

interface ModerationAction {
  id: string
  userId: string
  messageId?: string
  ruleId: string
  action: string
  reason: string
  severity: string
  moderatorId?: string
  isAutomated: boolean
  expiresAt?: Date
  createdAt: Date
}

interface UserReport {
  id: string
  reporterId: string
  reportedUserId: string
  messageId?: string
  conversationId?: string
  reason: string
  category: "spam" | "harassment" | "inappropriate_content" | "fake_account" | "other"
  description: string
  status: "pending" | "reviewed" | "resolved" | "dismissed"
  reviewedBy?: string
  reviewedAt?: Date
  createdAt: Date
}

export class ContentModerationService {
  private redis = getRedisManager()
  private profanityWords: Set<string> = new Set()
  private spamPatterns: RegExp[] = []
  private moderationRules: Map<string, ModerationRule> = new Map()

  constructor() {
    this.initializeModerationRules()
    this.loadProfanityList()
    this.loadSpamPatterns()
  }

  /**
   * Initialize default moderation rules
   */
  private async initializeModerationRules(): Promise<void> {
    const defaultRules: ModerationRule[] = [
      {
        id: "profanity-filter",
        type: "profanity",
        pattern: "profanity_check",
        severity: "medium",
        action: "warn",
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: "spam-detection",
        type: "spam",
        pattern: "spam_check",
        severity: "high",
        action: "delete",
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: "harassment-detection",
        type: "harassment",
        pattern: "harassment_check",
        severity: "high",
        action: "review",
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]

    for (const rule of defaultRules) {
      this.moderationRules.set(rule.id, rule)
      await this.redis.setJSON(`moderation:rule:${rule.id}`, rule, 86400)
    }
  }

  /**
   * Load profanity word list
   */
  private loadProfanityList(): void {
    // Basic profanity list - in production, use a comprehensive database
    const basicProfanity = [
      "spam", "scam", "fake", "bot", "advertisement",
      // Add more comprehensive list
    ]
    
    basicProfanity.forEach(word => this.profanityWords.add(word.toLowerCase()))
  }

  /**
   * Load spam detection patterns
   */
  private loadSpamPatterns(): void {
    this.spamPatterns = [
      /(.)\1{4,}/g, // Repeated characters
      /https?:\/\/[^\s]+/gi, // URLs
      /\b\d{10,}\b/g, // Phone numbers
      /(.{1,10})\1{3,}/g, // Repeated phrases
      /[A-Z]{5,}/g, // Excessive caps
    ]
  }

  /**
   * Moderate message content
   */
  async moderateMessage(
    messageId: string,
    content: string,
    senderId: string,
    conversationId: string
  ): Promise<{
    allowed: boolean
    action?: string
    reason?: string
    severity?: string
    moderationId?: string
  }> {
    try {
      // Check if user is exempt from moderation
      const isExempt = await this.isUserExemptFromModeration(senderId)
      if (isExempt) {
        return { allowed: true }
      }

      // Run all moderation checks
      const checks = await Promise.all([
        this.checkProfanity(content),
        this.checkSpam(content, senderId),
        this.checkHarassment(content, senderId, conversationId),
        this.checkInappropriateContent(content),
        this.checkCustomRules(content)
      ])

      // Find the most severe violation
      const violations = checks.filter(check => !check.passed)
      if (violations.length === 0) {
        return { allowed: true }
      }

      // Get the most severe violation
      const severityOrder: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 }
      const mostSevere = violations.reduce((prev, current) => 
        severityOrder[current.severity] > severityOrder[prev.severity] ? current : prev
      )

      // Execute moderation action
      const moderationAction = await this.executeModerationAction({
        userId: senderId,
        messageId,
        ruleId: mostSevere.ruleId,
        action: mostSevere.action,
        reason: mostSevere.reason,
        severity: mostSevere.severity,
        isAutomated: true
      })

      // Track moderation event
      await analyticsService.trackUserActivity(senderId, {
        type: "profile_updated",
        metadata: {
          action: "content_moderated",
          reason: mostSevere.reason,
          severity: mostSevere.severity,
          messageId
        }
      })

      return {
        allowed: mostSevere.action !== "delete" && mostSevere.action !== "ban",
        action: mostSevere.action,
        reason: mostSevere.reason,
        severity: mostSevere.severity,
        moderationId: moderationAction.id
      }
    } catch (error) {
      logger.error(`Error moderating message ${messageId}:`, error)
      // In case of error, allow the message but log for review
      return { allowed: true }
    }
  }

  /**
   * Check for profanity
   */
  private async checkProfanity(content: string): Promise<{
    passed: boolean
    ruleId: string
    action: string
    reason: string
    severity: string
  }> {
    const words = content.toLowerCase().split(/\s+/)
    const foundProfanity = words.some(word => this.profanityWords.has(word))

    if (foundProfanity) {
      return {
        passed: false,
        ruleId: "profanity-filter",
        action: "warn",
        reason: "Message contains inappropriate language",
        severity: "medium"
      }
    }

    return { passed: true, ruleId: "", action: "", reason: "", severity: "" }
  }

  /**
   * Check for spam
   */
  private async checkSpam(content: string, senderId: string): Promise<{
    passed: boolean
    ruleId: string
    action: string
    reason: string
    severity: string
  }> {
    // Check message frequency
    const recentMessages = await this.getUserRecentMessageCount(senderId, 60) // Last minute
    if (recentMessages > 10) {
      return {
        passed: false,
        ruleId: "spam-detection",
        action: "mute",
        reason: "Sending messages too frequently",
        severity: "high"
      }
    }

    // Check spam patterns
    for (const pattern of this.spamPatterns) {
      if (pattern.test(content)) {
        return {
          passed: false,
          ruleId: "spam-detection",
          action: "delete",
          reason: "Message matches spam pattern",
          severity: "high"
        }
      }
    }

    // Check for duplicate messages
    const isDuplicate = await this.checkDuplicateMessage(senderId, content)
    if (isDuplicate) {
      return {
        passed: false,
        ruleId: "spam-detection",
        action: "delete",
        reason: "Duplicate message detected",
        severity: "medium"
      }
    }

    return { passed: true, ruleId: "", action: "", reason: "", severity: "" }
  }

  /**
   * Check for harassment
   */
  private async checkHarassment(
    content: string,
    senderId: string,
    conversationId: string
  ): Promise<{
    passed: boolean
    ruleId: string
    action: string
    reason: string
    severity: string
  }> {
    // Check for harassment keywords
    const harassmentKeywords = [
      "hate", "kill", "die", "stupid", "idiot", "loser",
      "threat", "violence", "hurt", "harm"
    ]

    const containsHarassment = harassmentKeywords.some(keyword =>
      content.toLowerCase().includes(keyword)
    )

    if (containsHarassment) {
      // Check if this is repeated behavior
      const recentViolations = await this.getUserRecentViolations(senderId, "harassment", 24 * 60) // Last 24 hours
      
      return {
        passed: false,
        ruleId: "harassment-detection",
        action: recentViolations > 2 ? "ban" : "review",
        reason: "Message contains potentially harassing content",
        severity: recentViolations > 2 ? "critical" : "high"
      }
    }

    return { passed: true, ruleId: "", action: "", reason: "", severity: "" }
  }

  /**
   * Check for inappropriate content
   */
  private async checkInappropriateContent(content: string): Promise<{
    passed: boolean
    ruleId: string
    action: string
    reason: string
    severity: string
  }> {
    // Basic inappropriate content detection
    const inappropriatePatterns = [
      /\b(adult|porn|sex|nude|naked)\b/gi,
      /\b(drug|cocaine|marijuana|weed)\b/gi,
      /\b(violence|weapon|gun|knife)\b/gi
    ]

    for (const pattern of inappropriatePatterns) {
      if (pattern.test(content)) {
        return {
          passed: false,
          ruleId: "inappropriate-content",
          action: "review",
          reason: "Message contains potentially inappropriate content",
          severity: "high"
        }
      }
    }

    return { passed: true, ruleId: "", action: "", reason: "", severity: "" }
  }

  /**
   * Check custom moderation rules
   */
  private async checkCustomRules(content: string): Promise<{
    passed: boolean
    ruleId: string
    action: string
    reason: string
    severity: string
  }> {
    for (const [ruleId, rule] of this.moderationRules) {
      if (!rule.enabled || rule.type !== "custom") continue

      let matches = false
      if (typeof rule.pattern === "string") {
        matches = content.toLowerCase().includes(rule.pattern.toLowerCase())
      } else {
        matches = rule.pattern.test(content)
      }

      if (matches) {
        return {
          passed: false,
          ruleId,
          action: rule.action,
          reason: `Message violates custom rule: ${ruleId}`,
          severity: rule.severity
        }
      }
    }

    return { passed: true, ruleId: "", action: "", reason: "", severity: "" }
  }

  /**
   * Execute moderation action
   */
  private async executeModerationAction(actionData: {
    userId: string
    messageId?: string
    ruleId: string
    action: string
    reason: string
    severity: string
    moderatorId?: string
    isAutomated: boolean
  }): Promise<ModerationAction> {
    const moderationAction: ModerationAction = {
      id: `mod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...actionData,
      createdAt: new Date()
    }

    // Store moderation action
    await this.redis.setJSON(`moderation:action:${moderationAction.id}`, moderationAction, 86400 * 30)

    // Execute the action
    switch (actionData.action) {
      case "warn":
        await this.warnUser(actionData.userId, actionData.reason)
        break
      case "delete":
        if (actionData.messageId) {
          await this.deleteMessage(actionData.messageId)
        }
        break
      case "mute":
        await this.muteUser(actionData.userId, 15) // 15 minutes
        break
      case "ban":
        await this.banUser(actionData.userId, actionData.reason)
        break
      case "review":
        await this.flagForReview(moderationAction)
        break
    }

    // Update user violation count
    await this.updateUserViolationCount(actionData.userId, actionData.severity)

    logger.info(`Moderation action executed: ${actionData.action}`, {
      userId: actionData.userId,
      reason: actionData.reason,
      severity: actionData.severity
    })

    return moderationAction
  }

  /**
   * Warn user
   */
  private async warnUser(userId: string, reason: string): Promise<void> {
    const warningNotification = NotificationBuilder.createSystemNotification(
      userId,
      `Warning: ${reason}. Please follow community guidelines.`,
      undefined,
      undefined,
      { type: "moderation_warning", reason }
    )
    await notificationService.createNotification(warningNotification)

    // Increment warning count
    await this.redis.incr(`moderation:warnings:${userId}`)
    await this.redis.expire(`moderation:warnings:${userId}`, 86400 * 30) // 30 days
  }

  /**
   * Delete message
   */
  private async deleteMessage(messageId: string): Promise<void> {
    await messageRepository.update(messageId, {
      content: "[Message deleted by moderation system]",
      isDeleted: true,
      deletedAt: new Date()
    })
  }

  /**
   * Mute user
   */
  private async muteUser(userId: string, durationMinutes: number): Promise<void> {
    const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000)
    
    await this.redis.set(`moderation:muted:${userId}`, "true", durationMinutes * 60)
    
    const muteNotification = NotificationBuilder.createSystemNotification(
      userId,
      `You have been muted for ${durationMinutes} minutes due to policy violation.`,
      undefined,
      undefined,
      { type: "moderation_mute", duration: durationMinutes, expiresAt }
    )
    await notificationService.createNotification(muteNotification)
  }

  /**
   * Ban user
   */
  private async banUser(userId: string, reason: string): Promise<void> {
    // Update user status
    await userRepository.update(userId, {
      bio: `[BANNED] ${reason}` // Store ban info in bio since isActive doesn't exist in the type
    })

    // Store ban information
    await this.redis.set(`moderation:banned:${userId}`, JSON.stringify({
      reason,
      bannedAt: new Date(),
      bannedBy: "system"
    }), 86400 * 365) // 1 year

    const banNotification = NotificationBuilder.createSystemNotification(
      userId,
      `Your account has been suspended due to: ${reason}`,
      undefined,
      undefined,
      { type: "moderation_ban", reason }
    )
    await notificationService.createNotification(banNotification)
  }

  /**
   * Flag content for manual review
   */
  private async flagForReview(moderationAction: ModerationAction): Promise<void> {
    await this.redis.sAdd("moderation:review_queue", moderationAction.id)
    
    // Notify moderators
    const moderators = await this.getModerators()
    for (const moderator of moderators) {
      const reviewNotification = NotificationBuilder.createSystemNotification(
        moderator.id,
        "New content flagged for review",
        moderationAction.id,
        "ModerationAction",
        { type: "moderation_review", actionId: moderationAction.id }
      )
      await notificationService.createNotification(reviewNotification)
    }
  }

  /**
   * Report user or content
   */
  async reportUser(reportData: {
    reporterId: string
    reportedUserId: string
    messageId?: string
    conversationId?: string
    reason: string
    category: "spam" | "harassment" | "inappropriate_content" | "fake_account" | "other"
    description: string
  }): Promise<UserReport> {
    const report: UserReport = {
      id: `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...reportData,
      status: "pending",
      createdAt: new Date()
    }

    // Store report
    await this.redis.setJSON(`moderation:report:${report.id}`, report, 86400 * 30)
    await this.redis.sAdd("moderation:reports:pending", report.id)

    // Notify moderators
    const moderators = await this.getModerators()
    for (const moderator of moderators) {
      await notificationService.createNotification({
        recipient: moderator.id,
        type: "system",
        content: `New user report: ${reportData.category}`,
        metadata: { type: "user_report", reportId: report.id }
      })
    }

    logger.info(`User report created: ${report.id}`, {
      reporterId: reportData.reporterId,
      reportedUserId: reportData.reportedUserId,
      category: reportData.category
    })

    return report
  }

  /**
   * Check if user is muted
   */
  async isUserMuted(userId: string): Promise<boolean> {
    const muted = await this.redis.get(`moderation:muted:${userId}`)
    return muted === "true"
  }

  /**
   * Check if user is banned
   */
  async isUserBanned(userId: string): Promise<boolean> {
    const banned = await this.redis.get(`moderation:banned:${userId}`)
    return !!banned
  }

  /**
   * Get user moderation status
   */
  async getUserModerationStatus(userId: string): Promise<{
    isMuted: boolean
    isBanned: boolean
    warningCount: number
    recentViolations: number
    trustScore: number
  }> {
    const [isMuted, isBanned, warningCount, recentViolations] = await Promise.all([
      this.isUserMuted(userId),
      this.isUserBanned(userId),
      this.getUserWarningCount(userId),
      this.getUserRecentViolations(userId, "all", 24 * 60) // Last 24 hours
    ])

    const trustScore = await this.calculateUserTrustScore(userId)

    return {
      isMuted,
      isBanned,
      warningCount,
      recentViolations,
      trustScore
    }
  }

  /**
   * Helper methods
   */
  private async isUserExemptFromModeration(userId: string): Promise<boolean> {
    // Check if user is a moderator or admin
    const user = await userRepository.findById(userId)
    return user?.role === "admin" || user?.role === "moderator"
  }

  private async getUserRecentMessageCount(userId: string, minutes: number): Promise<number> {
    const key = `moderation:message_count:${userId}`
    const count = await this.redis.get(key)
    return count ? parseInt(count, 10) : 0
  }

  private async checkDuplicateMessage(userId: string, content: string): Promise<boolean> {
    const key = `moderation:last_message:${userId}`
    const lastMessage = await this.redis.get(key)
    
    if (lastMessage === content) {
      return true
    }
    
    await this.redis.set(key, content, 300) // 5 minutes
    return false
  }

  private async getUserRecentViolations(
    userId: string,
    type: string,
    minutes: number
  ): Promise<number> {
    const key = `moderation:violations:${userId}:${type}`
    const count = await this.redis.get(key)
    return count ? parseInt(count, 10) : 0
  }

  private async updateUserViolationCount(userId: string, severity: string): Promise<void> {
    const key = `moderation:violations:${userId}:all`
    await this.redis.incr(key)
    await this.redis.expire(key, 86400 * 7) // 7 days

    const severityKey = `moderation:violations:${userId}:${severity}`
    await this.redis.incr(severityKey)
    await this.redis.expire(severityKey, 86400 * 7) // 7 days
  }

  private async getUserWarningCount(userId: string): Promise<number> {
    const count = await this.redis.get(`moderation:warnings:${userId}`)
    return count ? parseInt(count, 10) : 0
  }

  private async calculateUserTrustScore(userId: string): Promise<number> {
    const [warningCount, violationCount, accountAge] = await Promise.all([
      this.getUserWarningCount(userId),
      this.getUserRecentViolations(userId, "all", 24 * 60 * 7), // Last week
      this.getUserAccountAge(userId)
    ])

    // Calculate trust score (0-100)
    let score = 100
    score -= warningCount * 10
    score -= violationCount * 15
    score += Math.min(accountAge / 30, 20) // Bonus for account age (max 20 points)

    return Math.max(0, Math.min(100, score))
  }

  private async getUserAccountAge(userId: string): Promise<number> {
    const user = await userRepository.findById(userId)
    if (!user) return 0
    
    const ageMs = Date.now() - new Date(user.createdAt).getTime()
    return Math.floor(ageMs / (1000 * 60 * 60 * 24)) // Days
  }

  private async getModerators(): Promise<any[]> {
    // This would be implemented based on your user role system
    // For now, return empty array
    return []
  }
}

// Export singleton instance
export const contentModerationService = new ContentModerationService()
