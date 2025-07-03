import { groupJoinRequestRepository } from "@chatapp/database"
import { notificationService } from "./notification.service"
import { groupRepository } from "@chatapp/database"
import { ApiError } from "../utils/apiError"
import { logger } from "../utils/logger"
import type { GroupJoinRequestWithDetails } from "@chatapp/database"

export class GroupJoinRequestService {
  /**
   * Create a new group join request
   */
  async createRequest(requestData: {
    groupId: string
    userId: string
    message?: string
    expiresAt?: Date
  }): Promise<GroupJoinRequestWithDetails> {
    try {
      // Create request
      const request = await groupJoinRequestRepository.create(requestData)

      // Create notification for group admins
      try {
        // Get group admins
        const group = await groupRepository.findById(requestData.groupId)
        if (group) {
          // Send notification to all admins
          const adminIds = group.members
            .filter(member => member.role === "ADMIN" || member.role === "OWNER")
            .map(member => member.userId)
          
          for (const adminId of adminIds) {
            await notificationService.createNotification({
              recipientId: adminId,
              senderId: requestData.userId,
              type: "group_join_request",
              content: `A user has requested to join your group "${group.name}"`,
              relatedId: request.id,
              relatedType: "GroupJoinRequest",
            })
          }
        }
      } catch (error) {
        logger.error("Error creating notification for group join request:", error)
        // Don't throw, notifications are non-critical
      }

      return request
    } catch (error) {
      logger.error("Error creating group join request:", error)
      throw error
    }
  }

  /**
   * Get request by ID
   */
  async getRequest(id: string): Promise<GroupJoinRequestWithDetails> {
    try {
      const request = await groupJoinRequestRepository.findById(id)

      if (!request) {
        throw ApiError.notFound("Join request not found")
      }

      return request
    } catch (error) {
      logger.error(`Error getting join request ${id}:`, error)
      throw error
    }
  }

  /**
   * Get pending requests for a group
   */
  async getPendingRequestsForGroup(groupId: string): Promise<GroupJoinRequestWithDetails[]> {
    try {
      return await groupJoinRequestRepository.findPendingByGroupId(groupId)
    } catch (error) {
      logger.error(`Error getting pending requests for group ${groupId}:`, error)
      throw error
    }
  }

  /**
   * Get pending requests for a user
   */
  async getPendingRequestsForUser(userId: string): Promise<GroupJoinRequestWithDetails[]> {
    try {
      return await groupJoinRequestRepository.findPendingByUserId(userId)
    } catch (error) {
      logger.error(`Error getting pending requests for user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Approve join request
   */
  async approveRequest(id: string, responderId: string): Promise<GroupJoinRequestWithDetails> {
    try {
      const request = await groupJoinRequestRepository.updateStatus(id, "APPROVED")

      if (!request) {
        throw ApiError.notFound("Join request not found")
      }

      // Create notification for user
      try {
        const group = await groupRepository.findById(request.groupId)
        await notificationService.createNotification({
          recipientId: request.userId,
          senderId: responderId,
          type: "group_join_approved",
          content: `Your request to join "${group?.name || "a group"}" has been approved`,
          relatedId: request.groupId,
          relatedType: "Group",
        })
      } catch (error) {
        logger.error("Error creating notification for approved join request:", error)
        // Don't throw, notifications are non-critical
      }

      return request
    } catch (error) {
      logger.error(`Error approving join request ${id}:`, error)
      throw error
    }
  }

  /**
   * Reject join request
   */
  async rejectRequest(id: string, responderId: string): Promise<GroupJoinRequestWithDetails> {
    try {
      const request = await groupJoinRequestRepository.updateStatus(id, "REJECTED")

      if (!request) {
        throw ApiError.notFound("Join request not found")
      }

      // Create notification for user
      try {
        const group = await groupRepository.findById(request.groupId)
        await notificationService.createNotification({
          recipientId: request.userId,
          senderId: responderId,
          type: "group_join_rejected",
          content: `Your request to join "${group?.name || "a group"}" has been rejected`,
          relatedId: request.groupId,
          relatedType: "Group",
        })
      } catch (error) {
        logger.error("Error creating notification for rejected join request:", error)
        // Don't throw, notifications are non-critical
      }

      return request
    } catch (error) {
      logger.error(`Error rejecting join request ${id}:`, error)
      throw error
    }
  }

  /**
   * Cancel join request
   */
  async cancelRequest(id: string, userId: string): Promise<boolean> {
    try {
      const request = await groupJoinRequestRepository.findById(id)

      if (!request) {
        throw ApiError.notFound("Join request not found")
      }

      if (request.userId !== userId) {
        throw ApiError.forbidden("You can only cancel your own join requests")
      }

      return await groupJoinRequestRepository.delete(id)
    } catch (error) {
      logger.error(`Error canceling join request ${id}:`, error)
      throw error
    }
  }

  /**
   * Clean up expired requests
   * This should be called periodically by a cron job
   */
  async cleanupExpiredRequests(): Promise<number> {
    try {
      return await groupJoinRequestRepository.deleteExpired()
    } catch (error) {
      logger.error("Error cleaning up expired join requests:", error)
      throw error
    }
  }

  /**
   * Get join request statistics for a group
   */
  async getGroupJoinRequestStats(groupId: string, userId: string): Promise<{
    totalRequests: number
    totalApproved: number
    totalRejected: number
    totalPending: number
    approvalRate: number
  }> {
    try {
      const stats = await groupJoinRequestRepository.getGroupStats(groupId)
      
      const approvalRate = stats.totalRequests > 0 
        ? (stats.totalApproved / stats.totalRequests) * 100 
        : 0

      return {
        ...stats,
        approvalRate: Math.round(approvalRate * 100) / 100
      }
    } catch (error) {
      logger.error(`Error getting join request stats for group ${groupId}:`, error)
      throw error
    }
  }

  /**
   * Get user join request statistics
   */
  async getUserJoinRequestStats(userId: string): Promise<{
    totalSent: number
    totalApproved: number
    totalRejected: number
    totalPending: number
    successRate: number
  }> {
    try {
      const stats = await groupJoinRequestRepository.getUserStats(userId)
      
      const successRate = stats.totalSent > 0 
        ? (stats.totalApproved / stats.totalSent) * 100 
        : 0

      return {
        ...stats,
        successRate: Math.round(successRate * 100) / 100
      }
    } catch (error) {
      logger.error(`Error getting join request stats for user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Check if user has pending request for group
   */
  async hasPendingRequest(groupId: string, userId: string): Promise<boolean> {
    try {
      const request = await groupJoinRequestRepository.findPendingByGroupAndUser(groupId, userId)
      return !!request
    } catch (error) {
      logger.error(`Error checking pending request for group ${groupId}, user ${userId}:`, error)
      return false
    }
  }

  /**
   * Get request by group and user
   */
  async getRequestByGroupAndUser(groupId: string, userId: string): Promise<GroupJoinRequestWithDetails | null> {
    try {
      return await groupJoinRequestRepository.findByGroupAndUser(groupId, userId)
    } catch (error) {
      logger.error(`Error getting request for group ${groupId}, user ${userId}:`, error)
      return null
    }
  }

  /**
   * Bulk approve requests
   */
  async bulkApproveRequests(
    requestIds: string[],
    responderId: string
  ): Promise<{
    successful: GroupJoinRequestWithDetails[]
    failed: Array<{ requestId: string; error: string }>
  }> {
    try {
      const successful: GroupJoinRequestWithDetails[] = []
      const failed: Array<{ requestId: string; error: string }> = []

      for (const requestId of requestIds) {
        try {
          const request = await this.approveRequest(requestId, responderId)
          successful.push(request)
        } catch (error) {
          failed.push({
            requestId,
            error: error instanceof Error ? error.message : "Unknown error"
          })
        }
      }

      logger.info(`Bulk approve completed`, {
        successful: successful.length,
        failed: failed.length,
        responderId
      })

      return { successful, failed }
    } catch (error) {
      logger.error(`Error bulk approving requests:`, error)
      throw error
    }
  }

  /**
   * Bulk reject requests
   */
  async bulkRejectRequests(
    requestIds: string[],
    responderId: string
  ): Promise<{
    successful: GroupJoinRequestWithDetails[]
    failed: Array<{ requestId: string; error: string }>
  }> {
    try {
      const successful: GroupJoinRequestWithDetails[] = []
      const failed: Array<{ requestId: string; error: string }> = []

      for (const requestId of requestIds) {
        try {
          const request = await this.rejectRequest(requestId, responderId)
          successful.push(request)
        } catch (error) {
          failed.push({
            requestId,
            error: error instanceof Error ? error.message : "Unknown error"
          })
        }
      }

      logger.info(`Bulk reject completed`, {
        successful: successful.length,
        failed: failed.length,
        responderId
      })

      return { successful, failed }
    } catch (error) {
      logger.error(`Error bulk rejecting requests:`, error)
      throw error
    }
  }
}

// Export singleton instance
export const groupJoinRequestService = new GroupJoinRequestService()
