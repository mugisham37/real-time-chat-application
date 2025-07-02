import type { Server as SocketIOServer, Socket } from "socket.io"
import { logger } from "../../utils/logger"
import { validateSocketEvent } from "../utils/validateSocketEvent"
import { createGroupSchema } from "../validators/createGroupSchema"
import { updateGroupSchema } from "../validators/updateGroupSchema"
import { addMemberSchema } from "../validators/addMemberSchema"
import { updateMemberRoleSchema } from "../validators/updateMemberRoleSchema"

// Import repositories - we'll need to create these imports based on the actual repository structure
// For now, I'll create placeholder interfaces that match the expected repository pattern

interface GroupRepository {
  getUserGroups(userId: string): Promise<any[]>
  create(data: any): Promise<any>
  findById(id: string): Promise<any>
  addMember(groupId: string, userId: string): Promise<any>
  removeMember(groupId: string, userId: string): Promise<any>
  update(groupId: string, data: any): Promise<any>
  updateMemberRole(groupId: string, memberId: string, role: string): Promise<any>
  delete(groupId: string): Promise<any>
}

interface UserRepository {
  findManyByIds(ids: string[]): Promise<any[]>
  findById(id: string, select?: string): Promise<any>
}

// These will be imported from the actual repositories
const groupRepository: GroupRepository = {} as GroupRepository
const userRepository: UserRepository = {} as UserRepository

export const setupGroupHandlers = (io: SocketIOServer, socket: Socket & { data: { user?: any } }) => {
  const userId = socket.data.user?._id

  // Join user to their group rooms
  const joinUserGroups = async () => {
    try {
      // Find all groups where user is a member
      const groups = await groupRepository.getUserGroups(userId)

      // Join each group's room
      groups.forEach((group) => {
        socket.join(`group:${group._id}`)
      })

      logger.info(`User ${userId} joined ${groups.length} group rooms`)
    } catch (error) {
      logger.error(`Error joining group rooms for user ${userId}:`, error)
    }
  }

  // Join user's group rooms when socket connects
  joinUserGroups()

  // Create a new group
  socket.on("group:create", async (data, callback) => {
    try {
      // Validate event data
      const validationResult = validateSocketEvent(createGroupSchema, data)
      if (!validationResult.success) {
        return callback({
          success: false,
          message: "Validation error",
          errors: validationResult.errors,
        })
      }

      const { name, description, members = [], isPublic = true } = data

      try {
        // Validate members
        let validMembers = []

        if (members.length > 0) {
          // Check if members exist
          const users = await userRepository.findManyByIds(members)
          validMembers = users.map((user) => user._id.toString())
        }

        // Always include the creator
        if (!validMembers.includes(userId.toString())) {
          validMembers.push(userId.toString())
        }

        // Create group
        const newGroup = await groupRepository.create({
          name,
          description,
          creator: userId,
          admins: [userId],
          members: validMembers.map((memberId) => ({
            user: memberId,
            role: memberId === userId.toString() ? "admin" : "member",
            joinedAt: new Date(),
          })),
          settings: {
            whoCanSend: "all",
            whoCanAddMembers: "all",
          },
          isPublic,
        })

        // Join creator to group room
        socket.join(`group:${newGroup._id}`)

        // Notify members about the new group
        validMembers.forEach((memberId) => {
          if (memberId !== userId.toString()) {
            io.to(`user:${memberId}`).emit("group:added", newGroup)
          }
        })

        callback({
          success: true,
          data: newGroup,
        })
      } catch (error) {
        logger.error("Error creating group:", error)
        callback({
          success: false,
          message: error.message || "Failed to create group",
        })
      }
    } catch (error) {
      logger.error("Error in group:create handler:", error)
      callback({
        success: false,
        message: "Failed to create group",
      })
    }
  })

  // Join a group
  socket.on("group:join", async (data, callback) => {
    try {
      const { groupId } = data

      if (!groupId) {
        return callback({
          success: false,
          message: "Group ID is required",
        })
      }

      try {
        // Join group
        const group = await groupRepository.findById(groupId)

        if (!group) {
          return callback({
            success: false,
            message: "Group not found",
          })
        }

        // Check if group is public
        if (!group.isPublic) {
          return callback({
            success: false,
            message: "This group is private",
          })
        }

        // Check if user is already a member
        const isMember = group.members.some((member) => member.user.toString() === userId.toString())

        if (isMember) {
          return callback({
            success: false,
            message: "You are already a member of this group",
          })
        }

        // Add user to group
        const updatedGroup = await groupRepository.addMember(groupId, userId)

        // Join user to group room
        socket.join(`group:${groupId}`)

        // Notify group members about the new member
        io.to(`group:${groupId}`).emit("group:member_joined", {
          groupId,
          user: {
            _id: userId,
            username: socket.data.user.username,
            firstName: socket.data.user.firstName,
            lastName: socket.data.user.lastName,
            avatar: socket.data.user.avatar,
          },
        })

        callback({
          success: true,
          data: updatedGroup,
        })
      } catch (error) {
        logger.error("Error joining group:", error)
        callback({
          success: false,
          message: error.message || "Failed to join group",
        })
      }
    } catch (error) {
      logger.error("Error in group:join handler:", error)
      callback({
        success: false,
        message: "Failed to join group",
      })
    }
  })

  // Leave a group
  socket.on("group:leave", async (data, callback) => {
    try {
      const { groupId } = data

      if (!groupId) {
        return callback({
          success: false,
          message: "Group ID is required",
        })
      }

      try {
        // Leave group
        const result = await groupRepository.removeMember(groupId, userId)

        // Leave group room
        socket.leave(`group:${groupId}`)

        // Notify group members about the member leaving
        io.to(`group:${groupId}`).emit("group:member_left", {
          groupId,
          userId,
        })

        callback({
          success: true,
          data: {
            groupId,
            message: "Left group successfully",
          },
        })
      } catch (error) {
        logger.error("Error leaving group:", error)
        callback({
          success: false,
          message: error.message || "Failed to leave group",
        })
      }
    } catch (error) {
      logger.error("Error in group:leave handler:", error)
      callback({
        success: false,
        message: "Failed to leave group",
      })
    }
  })

  // Update group details
  socket.on("group:update", async (data, callback) => {
    try {
      // Validate event data
      const validationResult = validateSocketEvent(updateGroupSchema, data)
      if (!validationResult.success) {
        return callback({
          success: false,
          message: "Validation error",
          errors: validationResult.errors,
        })
      }

      const { groupId, name, description, avatar, isPublic, settings } = data

      try {
        // Update group
        const updatedGroup = await groupRepository.update(groupId, {
          name,
          description,
          avatar,
          isPublic,
          settings,
        })

        if (!updatedGroup) {
          return callback({
            success: false,
            message: "Group not found or you don't have permission to update it",
          })
        }

        // Notify group members about the update
        io.to(`group:${groupId}`).emit("group:updated", updatedGroup)

        callback({
          success: true,
          data: updatedGroup,
        })
      } catch (error) {
        logger.error("Error updating group:", error)
        callback({
          success: false,
          message: error.message || "Failed to update group",
        })
      }
    } catch (error) {
      logger.error("Error in group:update handler:", error)
      callback({
        success: false,
        message: "Failed to update group",
      })
    }
  })

  // Add member to group
  socket.on("group:add_member", async (data, callback) => {
    try {
      // Validate event data
      const validationResult = validateSocketEvent(addMemberSchema, data)
      if (!validationResult.success) {
        return callback({
          success: false,
          message: "Validation error",
          errors: validationResult.errors,
        })
      }

      const { groupId, memberId } = data

      try {
        // Add member to group
        const updatedGroup = await groupRepository.addMember(groupId, memberId)

        if (!updatedGroup) {
          return callback({
            success: false,
            message: "Group not found or you don't have permission to add members",
          })
        }

        // Get member details
        const member = await userRepository.findById(memberId, "username firstName lastName avatar")

        if (!member) {
          return callback({
            success: false,
            message: "Member not found",
          })
        }

        // Notify group members about the new member
        io.to(`group:${groupId}`).emit("group:member_joined", {
          groupId,
          user: {
            _id: member._id,
            username: member.username,
            firstName: member.firstName,
            lastName: member.lastName,
            avatar: member.avatar,
          },
        })

        // Notify the added user
        io.to(`user:${memberId}`).emit("group:added", updatedGroup)

        callback({
          success: true,
          data: updatedGroup,
        })
      } catch (error) {
        logger.error("Error adding member to group:", error)
        callback({
          success: false,
          message: error.message || "Failed to add member to group",
        })
      }
    } catch (error) {
      logger.error("Error in group:add_member handler:", error)
      callback({
        success: false,
        message: "Failed to add member to group",
      })
    }
  })

  // Remove member from group
  socket.on("group:remove_member", async (data, callback) => {
    try {
      const { groupId, memberId } = data

      if (!groupId || !memberId) {
        return callback({
          success: false,
          message: "Group ID and member ID are required",
        })
      }

      try {
        // Remove member from group
        const updatedGroup = await groupRepository.removeMember(groupId, memberId)

        if (!updatedGroup) {
          return callback({
            success: false,
            message: "Group not found or you don't have permission to remove members",
          })
        }

        // Notify group members about the removed member
        io.to(`group:${groupId}`).emit("group:member_removed", {
          groupId,
          userId: memberId,
        })

        // Notify the removed user
        io.to(`user:${memberId}`).emit("group:removed", {
          groupId,
        })

        callback({
          success: true,
          data: updatedGroup,
        })
      } catch (error) {
        logger.error("Error removing member from group:", error)
        callback({
          success: false,
          message: error.message || "Failed to remove member from group",
        })
      }
    } catch (error) {
      logger.error("Error in group:remove_member handler:", error)
      callback({
        success: false,
        message: "Failed to remove member from group",
      })
    }
  })

  // Update member role
  socket.on("group:update_member_role", async (data, callback) => {
    try {
      // Validate event data
      const validationResult = validateSocketEvent(updateMemberRoleSchema, data)
      if (!validationResult.success) {
        return callback({
          success: false,
          message: "Validation error",
          errors: validationResult.errors,
        })
      }

      const { groupId, memberId, role } = data

      try {
        // Update member role
        const updatedGroup = await groupRepository.updateMemberRole(groupId, memberId, role)

        if (!updatedGroup) {
          return callback({
            success: false,
            message: "Group not found or you don't have permission to update member roles",
          })
        }

        // Notify group members about the role update
        io.to(`group:${groupId}`).emit("group:member_role_updated", {
          groupId,
          userId: memberId,
          role,
        })

        callback({
          success: true,
          data: updatedGroup,
        })
      } catch (error) {
        logger.error("Error updating member role:", error)
        callback({
          success: false,
          message: error.message || "Failed to update member role",
        })
      }
    } catch (error) {
      logger.error("Error in group:update_member_role handler:", error)
      callback({
        success: false,
        message: "Failed to update member role",
      })
    }
  })

  // Delete group
  socket.on("group:delete", async (data, callback) => {
    try {
      const { groupId } = data

      if (!groupId) {
        return callback({
          success: false,
          message: "Group ID is required",
        })
      }

      try {
        // Delete group
        const result = await groupRepository.delete(groupId)

        if (!result) {
          return callback({
            success: false,
            message: "Group not found or you don't have permission to delete it",
          })
        }

        // Notify group members about the deletion
        io.to(`group:${groupId}`).emit("group:deleted", {
          groupId,
        })

        // Remove all sockets from the group room
        io.in(`group:${groupId}`).socketsLeave(`group:${groupId}`)

        callback({
          success: true,
          data: {
            groupId,
            message: "Group deleted successfully",
          },
        })
      } catch (error) {
        logger.error("Error deleting group:", error)
        callback({
          success: false,
          message: error.message || "Failed to delete group",
        })
      }
    } catch (error) {
      logger.error("Error in group:delete handler:", error)
      callback({
        success: false,
        message: "Failed to delete group",
      })
    }
  })
}
