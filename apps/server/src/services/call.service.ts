import { getRedisManager } from "../config/redis"
import { logger } from "../utils/logger"
import { ApiError } from "../utils/apiError"
import { userRepository } from "@chatapp/database"
import { notificationService } from "./notification.service"
import { analyticsService } from "./analytics.service"

interface CallData {
  callId: string
  caller: string
  recipient: string
  callType: "audio" | "video"
  startTime: number
  answerTime?: number
  endTime?: number
  status: "ringing" | "connected" | "rejected" | "ended" | "missed"
  duration?: number
  metadata?: Record<string, any>
}

interface CallParticipant {
  userId: string
  joinedAt: number
  leftAt?: number
  role: "caller" | "recipient"
  connectionQuality?: "excellent" | "good" | "fair" | "poor"
}

interface CallSession {
  callId: string
  participants: CallParticipant[]
  callType: "audio" | "video"
  status: "waiting" | "ringing" | "connected" | "ended"
  startTime: number
  endTime?: number
  metadata: {
    iceServers?: any[]
    bandwidth?: string
    codec?: string
    resolution?: string
  }
}

export class CallService {
  private redis = getRedisManager()

  /**
   * Initiate a call
   */
  async initiateCall(
    callerId: string,
    recipientId: string,
    callType: "audio" | "video",
    metadata?: Record<string, any>
  ): Promise<CallData> {
    try {
      // Validate users exist
      const [caller, recipient] = await Promise.all([
        userRepository.findById(callerId),
        userRepository.findById(recipientId)
      ])

      if (!caller || !recipient) {
        throw ApiError.notFound("User not found")
      }

      // Check if recipient is online
      const isRecipientOnline = await this.isUserOnline(recipientId)
      if (!isRecipientOnline) {
        throw ApiError.badRequest("Recipient is not online")
      }

      // Check if either user is already in a call
      const [callerInCall, recipientInCall] = await Promise.all([
        this.isUserInCall(callerId),
        this.isUserInCall(recipientId)
      ])

      if (callerInCall) {
        throw ApiError.conflict("You are already in a call")
      }

      if (recipientInCall) {
        throw ApiError.conflict("Recipient is already in a call")
      }

      // Generate call ID
      const callId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      // Create call data
      const callData: CallData = {
        callId,
        caller: callerId,
        recipient: recipientId,
        callType,
        startTime: Date.now(),
        status: "ringing",
        metadata: metadata || {}
      }

      // Store call data in Redis with 1 hour expiration
      await this.redis.setJSON(`call:${callId}`, callData, 3600)

      // Add users to active calls set
      await Promise.all([
        this.redis.sAdd(`user:${callerId}:active_calls`, callId),
        this.redis.sAdd(`user:${recipientId}:active_calls`, callId),
        this.redis.set(`call:${callId}:caller`, callerId, 3600),
        this.redis.set(`call:${callId}:recipient`, recipientId, 3600)
      ])

      // Track call initiation
      await analyticsService.trackUserActivity(callerId, {
        type: "call_initiated",
        metadata: { callType, recipientId, callId }
      })

      await analyticsService.trackUserActivity(recipientId, {
        type: "call_received",
        metadata: { callType, callerId, callId }
      })

      // Create notification for recipient
      await notificationService.createNotification({
        recipient: recipientId,
        sender: callerId,
        type: "incoming_call",
        content: `Incoming ${callType} call from ${caller.username}`,
        relatedId: callId,
        relatedType: "Call"
      })

      logger.info(`Call initiated: ${callId}`, {
        caller: callerId,
        recipient: recipientId,
        callType
      })

      return callData
    } catch (error) {
      logger.error("Error initiating call:", error)
      throw error
    }
  }

  /**
   * Answer a call
   */
  async answerCall(callId: string, userId: string): Promise<CallData> {
    try {
      const callData = await this.getCallData(callId)

      if (!callData) {
        throw ApiError.notFound("Call not found")
      }

      if (callData.recipient !== userId) {
        throw ApiError.forbidden("You are not the recipient of this call")
      }

      if (callData.status !== "ringing") {
        throw ApiError.badRequest("Call is not in ringing state")
      }

      // Update call status
      const updatedCallData: CallData = {
        ...callData,
        status: "connected",
        answerTime: Date.now()
      }

      await this.redis.setJSON(`call:${callId}`, updatedCallData, 3600)

      // Track call answer
      await analyticsService.trackUserActivity(userId, {
        type: "call_received",
        metadata: { action: "answered", callId, callType: callData.callType }
      })

      logger.info(`Call answered: ${callId}`, { userId })

      return updatedCallData
    } catch (error) {
      logger.error(`Error answering call ${callId}:`, error)
      throw error
    }
  }

  /**
   * Reject a call
   */
  async rejectCall(callId: string, userId: string): Promise<CallData> {
    try {
      const callData = await this.getCallData(callId)

      if (!callData) {
        throw ApiError.notFound("Call not found")
      }

      if (callData.recipient !== userId) {
        throw ApiError.forbidden("You are not the recipient of this call")
      }

      if (callData.status !== "ringing") {
        throw ApiError.badRequest("Call is not in ringing state")
      }

      // Update call status
      const updatedCallData: CallData = {
        ...callData,
        status: "rejected",
        endTime: Date.now()
      }

      await this.redis.setJSON(`call:${callId}`, updatedCallData, 3600)

      // Remove from active calls
      await this.removeFromActiveCalls(callId)

      // Track call rejection
      await analyticsService.trackUserActivity(userId, {
        type: "call_received",
        metadata: { action: "rejected", callId, callType: callData.callType }
      })

      logger.info(`Call rejected: ${callId}`, { userId })

      return updatedCallData
    } catch (error) {
      logger.error(`Error rejecting call ${callId}:`, error)
      throw error
    }
  }

  /**
   * End a call
   */
  async endCall(callId: string, userId: string): Promise<CallData> {
    try {
      const callData = await this.getCallData(callId)

      if (!callData) {
        throw ApiError.notFound("Call not found")
      }

      if (callData.caller !== userId && callData.recipient !== userId) {
        throw ApiError.forbidden("You are not a participant in this call")
      }

      const endTime = Date.now()
      let duration = 0

      if (callData.answerTime) {
        duration = endTime - callData.answerTime
      }

      // Update call status
      const updatedCallData: CallData = {
        ...callData,
        status: "ended",
        endTime,
        duration
      }

      await this.redis.setJSON(`call:${callId}`, updatedCallData, 3600)

      // Remove from active calls
      await this.removeFromActiveCalls(callId)

      // Track call end
      await analyticsService.trackUserActivity(userId, {
        type: callData.caller === userId ? "call_initiated" : "call_received",
        metadata: { action: "ended", callId, duration, callType: callData.callType }
      })

      logger.info(`Call ended: ${callId}`, { userId, duration })

      return updatedCallData
    } catch (error) {
      logger.error(`Error ending call ${callId}:`, error)
      throw error
    }
  }

  /**
   * Get call data
   */
  async getCallData(callId: string): Promise<CallData | null> {
    try {
      const callData = await this.redis.getJSON(`call:${callId}`)
      return callData as CallData | null
    } catch (error) {
      logger.error(`Error getting call data for call ${callId}:`, error)
      return null
    }
  }

  /**
   * Get recent calls for a user
   */
  async getUserRecentCalls(userId: string, limit = 20): Promise<CallData[]> {
    try {
      // Get all call keys from Redis
      const keys = await this.redis.keys(`call:*`)

      // Get call data for each key
      const calls: CallData[] = []

      for (const key of keys) {
        const callData = await this.redis.getJSON(key)
        if (callData) {
          const call = callData as CallData

          // Include only calls where the user is a participant
          if (call.caller === userId || call.recipient === userId) {
            calls.push(call)
          }
        }
      }

      // Sort by start time (most recent first) and limit
      return calls.sort((a, b) => b.startTime - a.startTime).slice(0, limit)
    } catch (error) {
      logger.error(`Error getting recent calls for user ${userId}:`, error)
      return []
    }
  }

  /**
   * Mark a call as missed
   */
  async markCallAsMissed(callId: string): Promise<void> {
    try {
      const callData = await this.getCallData(callId)

      if (!callData) {
        throw ApiError.notFound("Call not found")
      }

      if (callData.status !== "ringing") {
        throw ApiError.badRequest("Call is not in ringing state")
      }

      // Update call status
      const updatedCallData: CallData = {
        ...callData,
        status: "missed",
        endTime: Date.now()
      }

      await this.redis.setJSON(`call:${callId}`, updatedCallData, 3600)

      // Remove from active calls
      await this.removeFromActiveCalls(callId)

      // Create missed call notification
      try {
        const caller = await userRepository.findById(callData.caller)

        if (caller) {
          await notificationService.createNotification({
            recipient: callData.recipient,
            sender: callData.caller,
            type: "missed_call",
            content: `You missed a ${callData.callType} call from ${caller.username}`,
            relatedId: callId,
            relatedType: "Call"
          })
        }
      } catch (error) {
        logger.error(`Error creating notification for missed call ${callId}:`, error)
        // Don't throw, notifications are non-critical
      }

      logger.info(`Call marked as missed: ${callId}`)
    } catch (error) {
      logger.error(`Error marking call ${callId} as missed:`, error)
      throw error
    }
  }

  /**
   * Get call statistics for a user
   */
  async getUserCallStats(userId: string): Promise<{
    totalCalls: number
    incomingCalls: number
    outgoingCalls: number
    missedCalls: number
    totalDuration: number
    audioCalls: number
    videoCalls: number
    averageCallDuration: number
    callsToday: number
    callsThisWeek: number
    callsThisMonth: number
  }> {
    try {
      const calls = await this.getUserRecentCalls(userId, 1000) // Get up to 1000 recent calls

      const now = Date.now()
      const oneDayAgo = now - 24 * 60 * 60 * 1000
      const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000
      const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000

      const stats = {
        totalCalls: calls.length,
        incomingCalls: calls.filter((call) => call.recipient === userId).length,
        outgoingCalls: calls.filter((call) => call.caller === userId).length,
        missedCalls: calls.filter((call) => call.status === "missed" && call.recipient === userId).length,
        totalDuration: calls.reduce((total, call) => total + (call.duration || 0), 0),
        audioCalls: calls.filter((call) => call.callType === "audio").length,
        videoCalls: calls.filter((call) => call.callType === "video").length,
        averageCallDuration: 0,
        callsToday: calls.filter((call) => call.startTime > oneDayAgo).length,
        callsThisWeek: calls.filter((call) => call.startTime > oneWeekAgo).length,
        callsThisMonth: calls.filter((call) => call.startTime > oneMonthAgo).length,
      }

      // Calculate average call duration
      const connectedCalls = calls.filter((call) => call.duration && call.duration > 0)
      if (connectedCalls.length > 0) {
        stats.averageCallDuration = stats.totalDuration / connectedCalls.length
      }

      return stats
    } catch (error) {
      logger.error(`Error getting call stats for user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Clean up old call data
   * This should be called periodically by a cron job
   */
  async cleanupOldCallData(olderThanHours = 24): Promise<number> {
    try {
      const keys = await this.redis.keys(`call:*`)
      let deletedCount = 0

      const cutoffTime = Date.now() - olderThanHours * 60 * 60 * 1000

      for (const key of keys) {
        const callData = await this.redis.getJSON(key)

        if (callData) {
          const call = callData as CallData

          // Delete calls older than the cutoff time
          if (call.startTime < cutoffTime) {
            await this.redis.del(key)
            deletedCount++
          }
        }
      }

      return deletedCount
    } catch (error) {
      logger.error(`Error cleaning up old call data:`, error)
      throw error
    }
  }

  /**
   * Get active calls for a user
   */
  async getUserActiveCalls(userId: string): Promise<CallData[]> {
    try {
      const activeCallIds = await this.redis.sMembers(`user:${userId}:active_calls`)
      const activeCalls: CallData[] = []

      for (const callId of activeCallIds) {
        const callData = await this.getCallData(callId)
        if (callData && (callData.status === "ringing" || callData.status === "connected")) {
          activeCalls.push(callData)
        } else {
          // Remove stale call ID
          await this.redis.sRem(`user:${userId}:active_calls`, callId)
        }
      }

      return activeCalls
    } catch (error) {
      logger.error(`Error getting active calls for user ${userId}:`, error)
      return []
    }
  }

  /**
   * Update call quality metrics
   */
  async updateCallQuality(
    callId: string,
    userId: string,
    qualityMetrics: {
      connectionQuality: "excellent" | "good" | "fair" | "poor"
      bandwidth?: number
      latency?: number
      packetLoss?: number
    }
  ): Promise<void> {
    try {
      const callData = await this.getCallData(callId)

      if (!callData) {
        throw ApiError.notFound("Call not found")
      }

      if (callData.caller !== userId && callData.recipient !== userId) {
        throw ApiError.forbidden("You are not a participant in this call")
      }

      // Store quality metrics
      await this.redis.setJSON(
        `call:${callId}:quality:${userId}`,
        qualityMetrics,
        3600
      )

      logger.debug(`Call quality updated for ${callId}`, { userId, qualityMetrics })
    } catch (error) {
      logger.error(`Error updating call quality for ${callId}:`, error)
      throw error
    }
  }

  /**
   * Get call quality metrics
   */
  async getCallQuality(callId: string): Promise<Record<string, any>> {
    try {
      const callData = await this.getCallData(callId)

      if (!callData) {
        throw ApiError.notFound("Call not found")
      }

      const [callerQuality, recipientQuality] = await Promise.all([
        this.redis.getJSON(`call:${callId}:quality:${callData.caller}`),
        this.redis.getJSON(`call:${callId}:quality:${callData.recipient}`)
      ])

      return {
        caller: callerQuality || null,
        recipient: recipientQuality || null
      }
    } catch (error) {
      logger.error(`Error getting call quality for ${callId}:`, error)
      return {}
    }
  }

  /**
   * Helper methods
   */
  private async isUserOnline(userId: string): Promise<boolean> {
    try {
      const userStatus = await this.redis.get(`user:${userId}:status`)
      return userStatus === "online"
    } catch (error) {
      logger.error(`Error checking if user ${userId} is online:`, error)
      return false
    }
  }

  private async isUserInCall(userId: string): Promise<boolean> {
    try {
      const activeCallIds = await this.redis.sMembers(`user:${userId}:active_calls`)
      
      // Check if any of the active calls are actually active
      for (const callId of activeCallIds) {
        const callData = await this.getCallData(callId)
        if (callData && (callData.status === "ringing" || callData.status === "connected")) {
          return true
        } else {
          // Remove stale call ID
          await this.redis.sRem(`user:${userId}:active_calls`, callId)
        }
      }

      return false
    } catch (error) {
      logger.error(`Error checking if user ${userId} is in call:`, error)
      return false
    }
  }

  private async removeFromActiveCalls(callId: string): Promise<void> {
    try {
      const callData = await this.getCallData(callId)
      
      if (callData) {
        await Promise.all([
          this.redis.sRem(`user:${callData.caller}:active_calls`, callId),
          this.redis.sRem(`user:${callData.recipient}:active_calls`, callId),
          this.redis.del(`call:${callId}:caller`),
          this.redis.del(`call:${callId}:recipient`)
        ])
      }
    } catch (error) {
      logger.error(`Error removing call ${callId} from active calls:`, error)
    }
  }
}

// Export singleton instance
export const callService = new CallService()
