import { groupInvitationRepository } from "@chatapp/database"
import { notificationService } from "./notification.service"
import { ApiError } from "../utils/apiError"
import { logger } from "../utils/logger"
import type { GroupInvitationWithDetails } from "@chatapp/database"

export class GroupInvitationService {
  /**
   * Create a new group invitation
   */
  async createInvitation(invitationData: {
    groupId: string
    inviterId: string
    inviteeId: string
    expiresAt?: Date
  }): Promise<GroupInvitationWithDetails> {
    try {
      // Create invitation
      const invitation = await groupInvitationRepository.create(invitationData)

      // Create notification for invitee
      try {
        await notificationService.createGroupInviteNotification(
          invitationData.inviterId,
          invitationData.inviteeId,
          invitationData.groupId,
          invitation.group.name || "a group",
        )
      } catch (error) {
        logger.error("Error creating notification for group invitation:", error)
        // Don't throw, notifications are non-critical
      }

      return invitation
    } catch (error) {
      logger.error("Error creating group invitation:", error)
      throw error
    }
  }

  /**
   * Get invitation by ID
   */
  async getInvitation(id: string): Promise<GroupInvitationWithDetails> {
    try {
      const invitation = await groupInvitationRepository.findById(id)

      if (!invitation) {
        throw ApiError.notFound("Invitation not found")
      }

      return invitation
    } catch (error) {
      logger.error(`Error getting invitation ${id}:`, error)
      throw error
    }
  }

  /**
   * Get pending invitations for a user
   */
  async getPendingInvitationsForUser(userId: string): Promise<GroupInvitationWithDetails[]> {
    try {
      return await groupInvitationRepository.findPendingByInviteeId(userId)
    } catch (error) {
      logger.error(`Error getting pending invitations for user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Get pending invitations for a group
   */
  async getPendingInvitationsForGroup(groupId: string, userId: string): Promise<GroupInvitationWithDetails[]> {
    try {
      return await groupInvitationRepository.findPendingByGroupId(groupId)
    } catch (error) {
      logger.error(`Error getting pending invitations for group ${groupId}:`, error)
      throw error
    }
  }

  /**
   * Accept invitation
   */
  async acceptInvitation(id: string, userId: string): Promise<GroupInvitationWithDetails> {
    try {
      const invitation = await groupInvitationRepository.acceptInvitation(id, userId)
      return invitation
    } catch (error) {
      logger.error(`Error accepting invitation ${id}:`, error)
      throw error
    }
  }

  /**
   * Reject invitation
   */
  async rejectInvitation(id: string, userId: string): Promise<GroupInvitationWithDetails> {
    try {
      const invitation = await groupInvitationRepository.declineInvitation(id, userId)
      return invitation
    } catch (error) {
      logger.error(`Error rejecting invitation ${id}:`, error)
      throw error
    }
  }

  /**
   * Cancel invitation
   */
  async cancelInvitation(id: string, userId: string): Promise<boolean> {
    try {
      return await groupInvitationRepository.cancelInvitation(id, userId)
    } catch (error) {
      logger.error(`Error canceling invitation ${id}:`, error)
      throw error
    }
  }

  /**
   * Clean up expired invitations
   * This should be called periodically by a cron job
   */
  async cleanupExpiredInvitations(): Promise<number> {
    try {
      return await groupInvitationRepository.deleteExpired()
    } catch (error) {
      logger.error("Error cleaning up expired invitations:", error)
      throw error
    }
  }

  /**
   * Get invitation statistics for a group
   */
  async getGroupInvitationStats(groupId: string, userId: string): Promise<{
    totalSent: number
    totalAccepted: number
    totalRejected: number
    totalPending: number
    acceptanceRate: number
  }> {
    try {
      const stats = await groupInvitationRepository.getGroupStats(groupId)
      
      const acceptanceRate = stats.totalSent > 0 
        ? (stats.totalAccepted / stats.totalSent) * 100 
        : 0

      return {
        ...stats,
        acceptanceRate: Math.round(acceptanceRate * 100) / 100
      }
    } catch (error) {
      logger.error(`Error getting invitation stats for group ${groupId}:`, error)
      throw error
    }
  }

  /**
   * Get user invitation statistics
   */
  async getUserInvitationStats(userId: string): Promise<{
    totalReceived: number
    totalAccepted: number
    totalRejected: number
    totalPending: number
    totalSent: number
  }> {
    try {
      return await groupInvitationRepository.getUserStats(userId)
    } catch (error) {
      logger.error(`Error getting invitation stats for user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Bulk invite users to a group
   */
  async bulkInviteUsers(
    groupId: string,
    inviterId: string,
    inviteeIds: string[],
    expiresAt?: Date
  ): Promise<{
    successful: GroupInvitationWithDetails[]
    failed: Array<{ userId: string; error: string }>
  }> {
    try {
      const successful: GroupInvitationWithDetails[] = []
      const failed: Array<{ userId: string; error: string }> = []

      for (const inviteeId of inviteeIds) {
        try {
          const invitation = await this.createInvitation({
            groupId,
            inviterId,
            inviteeId,
            expiresAt
          })
          successful.push(invitation)
        } catch (error) {
          failed.push({
            userId: inviteeId,
            error: error instanceof Error ? error.message : "Unknown error"
          })
        }
      }

      logger.info(`Bulk invite completed for group ${groupId}`, {
        successful: successful.length,
        failed: failed.length,
        inviterId
      })

      return { successful, failed }
    } catch (error) {
      logger.error(`Error bulk inviting users to group ${groupId}:`, error)
      throw error
    }
  }

  /**
   * Check if user has pending invitation to group
   */
  async hasPendingInvitation(groupId: string, userId: string): Promise<boolean> {
    try {
      const invitation = await groupInvitationRepository.findPendingByGroupAndUser(groupId, userId)
      return !!invitation
    } catch (error) {
      logger.error(`Error checking pending invitation for group ${groupId}, user ${userId}:`, error)
      return false
    }
  }

  /**
   * Get invitation by group and user
   */
  async getInvitationByGroupAndUser(groupId: string, userId: string): Promise<GroupInvitationWithDetails | null> {
    try {
      return await groupInvitationRepository.findByGroupAndUser(groupId, userId)
    } catch (error) {
      logger.error(`Error getting invitation for group ${groupId}, user ${userId}:`, error)
      return null
    }
  }
}

// Export singleton instance
export const groupInvitationService = new GroupInvitationService()
