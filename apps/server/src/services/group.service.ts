import { groupRepository } from "@chatapp/database"
import { ApiError } from "../utils/apiError"
import { logger } from "../utils/logger"
import type { GroupWithDetails } from "@chatapp/database"

export class GroupService {
  /**
   * Create a new group
   */
  async createGroup(groupData: {
    name: string
    description?: string
    avatar?: string
    creatorId: string
    memberIds?: string[]
    isPublic?: boolean
  }): Promise<GroupWithDetails> {
    try {
      const { name, description, avatar, creatorId, memberIds = [], isPublic = true } = groupData

      // Create group
      const group = await groupRepository.create({
        name,
        description,
        avatar,
        creatorId,
        isPublic,
      })

      // Add additional members if provided
      if (memberIds.length > 0) {
        for (const memberId of memberIds) {
          if (memberId !== creatorId) {
            try {
              await groupRepository.addMember(group.id, memberId, "MEMBER")
            } catch (error) {
              logger.warn(`Failed to add member ${memberId} to group ${group.id}:`, error)
            }
          }
        }
      }

      // Return updated group with all members
      const updatedGroup = await groupRepository.findById(group.id)
      return updatedGroup!
    } catch (error) {
      logger.error("Error creating group:", error)
      throw error
    }
  }

  /**
   * Get group by ID
   */
  async getGroup(id: string, userId: string): Promise<GroupWithDetails> {
    try {
      const group = await groupRepository.findById(id)

      if (!group) {
        throw ApiError.notFound("Group not found")
      }

      // If group is private, check if user is a member
      if (group.isPrivate) {
        const isMember = await groupRepository.isMember(id, userId)

        if (!isMember) {
          throw ApiError.forbidden("You do not have access to this group")
        }
      }

      return group
    } catch (error) {
      logger.error(`Error getting group ${id}:`, error)
      throw error
    }
  }

  /**
   * Get user groups
   */
  async getUserGroups(userId: string, limit = 20, skip = 0): Promise<GroupWithDetails[]> {
    try {
      return await groupRepository.getUserGroups(userId, {
        limit,
        offset: skip,
      })
    } catch (error) {
      logger.error(`Error getting groups for user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Update group
   */
  async updateGroup(
    id: string,
    userId: string,
    updateData: {
      name?: string
      description?: string
      avatar?: string
      isPublic?: boolean
      maxMembers?: number
    },
  ): Promise<GroupWithDetails> {
    try {
      // Check if user is an admin
      const memberRole = await groupRepository.getMemberRole(id, userId)

      if (!memberRole || (memberRole !== "ADMIN" && memberRole !== "OWNER")) {
        throw ApiError.forbidden("Only admins can update group details")
      }

      // Update group
      const updatedGroup = await groupRepository.update(id, updateData)

      if (!updatedGroup) {
        throw ApiError.notFound("Group not found")
      }

      return updatedGroup
    } catch (error) {
      logger.error(`Error updating group ${id}:`, error)
      throw error
    }
  }

  /**
   * Join group
   */
  async joinGroup(id: string, userId: string): Promise<GroupWithDetails> {
    try {
      // Check if group exists and is public
      const group = await groupRepository.findById(id)

      if (!group) {
        throw ApiError.notFound("Group not found")
      }

      if (group.isPrivate) {
        throw ApiError.forbidden("This group is private")
      }

      // Check if user is already a member
      const isMember = await groupRepository.isMember(id, userId)

      if (isMember) {
        throw ApiError.conflict("You are already a member of this group")
      }

      // Add user to group
      await groupRepository.addMember(id, userId, "MEMBER")

      // Return updated group
      const updatedGroup = await groupRepository.findById(id)
      return updatedGroup!
    } catch (error) {
      logger.error(`Error joining group ${id}:`, error)
      throw error
    }
  }

  /**
   * Leave group
   */
  async leaveGroup(id: string, userId: string): Promise<{ message: string }> {
    try {
      // Check if group exists
      const group = await groupRepository.findById(id)

      if (!group) {
        throw ApiError.notFound("Group not found")
      }

      // Check if user is a member
      const isMember = await groupRepository.isMember(id, userId)

      if (!isMember) {
        throw ApiError.conflict("You are not a member of this group")
      }

      // Check if user is the creator
      if (group.createdById === userId) {
        // Find another admin to make creator
        const adminMembers = group.members.filter(
          member => member.role === "ADMIN" && member.userId !== userId
        )

        if (adminMembers.length > 0) {
          // Transfer ownership to another admin
          // This would require additional repository method
          logger.info(`Creator ${userId} leaving group ${id}, transferring ownership`)
        } else if (group.members.length > 1) {
          // Make any member an admin
          const anyMember = group.members.find(member => member.userId !== userId)
          if (anyMember) {
            await groupRepository.updateMemberRole(id, anyMember.userId, "ADMIN")
          }
        }
      }

      // Remove user from group
      await groupRepository.removeMember(id, userId)

      return { message: "Left group successfully" }
    } catch (error) {
      logger.error(`Error leaving group ${id}:`, error)
      throw error
    }
  }

  /**
   * Add member to group
   */
  async addMember(groupId: string, userId: string, memberId: string): Promise<GroupWithDetails> {
    try {
      // Check if group exists
      const group = await groupRepository.findById(groupId)

      if (!group) {
        throw ApiError.notFound("Group not found")
      }

      // Check if user is an admin
      const userRole = await groupRepository.getMemberRole(groupId, userId)
      const isAdmin = userRole === "ADMIN" || userRole === "OWNER"

      if (!isAdmin) {
        throw ApiError.forbidden("You do not have permission to add members")
      }

      // Add member
      await groupRepository.addMember(groupId, memberId, "MEMBER")

      // Return updated group
      const updatedGroup = await groupRepository.findById(groupId)
      return updatedGroup!
    } catch (error) {
      logger.error(`Error adding member to group ${groupId}:`, error)
      throw error
    }
  }

  /**
   * Remove member from group
   */
  async removeMember(groupId: string, userId: string, memberId: string): Promise<GroupWithDetails> {
    try {
      // Check if group exists
      const group = await groupRepository.findById(groupId)

      if (!group) {
        throw ApiError.notFound("Group not found")
      }

      // Check if user is an admin
      const userRole = await groupRepository.getMemberRole(groupId, userId)
      const isAdmin = userRole === "ADMIN" || userRole === "OWNER"

      if (!isAdmin) {
        throw ApiError.forbidden("Only admins can remove members")
      }

      // Check if member to remove is the creator
      if (group.createdById === memberId) {
        throw ApiError.forbidden("Cannot remove the group creator")
      }

      // Remove member
      await groupRepository.removeMember(groupId, memberId)

      // Return updated group
      const updatedGroup = await groupRepository.findById(groupId)
      return updatedGroup!
    } catch (error) {
      logger.error(`Error removing member from group ${groupId}:`, error)
      throw error
    }
  }

  /**
   * Update member role
   */
  async updateMemberRole(
    groupId: string,
    userId: string,
    memberId: string,
    role: "ADMIN" | "MODERATOR" | "MEMBER",
  ): Promise<GroupWithDetails> {
    try {
      // Check if group exists
      const group = await groupRepository.findById(groupId)

      if (!group) {
        throw ApiError.notFound("Group not found")
      }

      // Check if user is an admin
      const userRole = await groupRepository.getMemberRole(groupId, userId)
      const isAdmin = userRole === "ADMIN" || userRole === "OWNER"

      if (!isAdmin) {
        throw ApiError.forbidden("Only admins can update member roles")
      }

      // Update member role
      await groupRepository.updateMemberRole(groupId, memberId, role)

      // Return updated group
      const updatedGroup = await groupRepository.findById(groupId)
      return updatedGroup!
    } catch (error) {
      logger.error(`Error updating member role in group ${groupId}:`, error)
      throw error
    }
  }

  /**
   * Delete group
   */
  async deleteGroup(id: string, userId: string): Promise<{ message: string }> {
    try {
      // Check if group exists
      const group = await groupRepository.findById(id)

      if (!group) {
        throw ApiError.notFound("Group not found")
      }

      // Check if user is the creator
      if (group.createdById !== userId) {
        throw ApiError.forbidden("Only the group creator can delete the group")
      }

      // Delete group
      await groupRepository.delete(id)

      return { message: "Group deleted successfully" }
    } catch (error) {
      logger.error(`Error deleting group ${id}:`, error)
      throw error
    }
  }

  /**
   * Search public groups
   */
  async searchPublicGroups(query: string, limit = 20, skip = 0): Promise<GroupWithDetails[]> {
    try {
      return await groupRepository.searchPublicGroups(query, {
        limit,
        offset: skip,
      })
    } catch (error) {
      logger.error(`Error searching public groups with query ${query}:`, error)
      throw error
    }
  }

  /**
   * Get group statistics
   */
  async getGroupStats(groupId: string, userId: string): Promise<{
    totalMembers: number
    totalMessages: number
    membersByRole: Record<string, number>
    createdAt: Date
    lastActivity: Date | null
  }> {
    try {
      // Check if user has access to group
      const isMember = await groupRepository.isMember(groupId, userId)
      if (!isMember) {
        throw ApiError.forbidden("You do not have access to this group")
      }

      return await groupRepository.getGroupStats(groupId)
    } catch (error) {
      logger.error(`Error getting group stats for ${groupId}:`, error)
      throw error
    }
  }

  /**
   * Get popular groups
   */
  async getPopularGroups(limit = 10): Promise<GroupWithDetails[]> {
    try {
      return await groupRepository.getPopularGroups(limit)
    } catch (error) {
      logger.error("Error getting popular groups:", error)
      throw error
    }
  }
}

// Export singleton instance
export const groupService = new GroupService()
