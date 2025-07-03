import { Prisma } from '@prisma/client';
import { prisma } from '../client';
import { GroupWithDetails } from '../types';

export class GroupRepository {
  /**
   * Create a new group
   */
  async create(groupData: {
    name: string;
    description?: string;
    avatar?: string;
    creatorId: string;
    isPublic?: boolean;
    maxMembers?: number;
  }): Promise<GroupWithDetails> {
    try {
      return await prisma.$transaction(async (tx: any) => {
        // Create the group
        const group = await tx.group.create({
          data: {
            name: groupData.name,
            description: groupData.description,
            avatar: groupData.avatar,
            createdById: groupData.creatorId,
            isPrivate: !(groupData.isPublic ?? true),
            maxMembers: groupData.maxMembers ?? 100,
          },
        });

        // Create conversation for the group
        const conversation = await tx.conversation.create({
          data: {
            type: 'GROUP',
            groupId: group.id,
          },
        });

        // Add creator as owner member
        await tx.groupMember.create({
          data: {
            groupId: group.id,
            userId: groupData.creatorId,
            role: 'OWNER',
          },
        });

        // Add creator as conversation participant
        await tx.conversationParticipant.create({
          data: {
            conversationId: conversation.id,
            userId: groupData.creatorId,
            role: 'ADMIN',
          },
        });

        // Return group with details
        return await tx.group.findUnique({
          where: { id: group.id },
          include: {
            createdBy: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
                avatar: true,
              },
            },
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    firstName: true,
                    lastName: true,
                    avatar: true,
                    isOnline: true,
                    lastSeen: true,
                  },
                },
              },
              orderBy: [
                { role: 'asc' },
                { joinedAt: 'asc' },
              ],
            },
            conversation: {
              include: {
                messages: {
                  take: 1,
                  orderBy: { createdAt: 'desc' },
                  include: {
                    sender: {
                      select: {
                        id: true,
                        username: true,
                      },
                    },
                  },
                },
              },
            },
          },
        });
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new Error('A group with this name already exists');
      }
      throw new Error(`Error creating group: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Find group by ID
   */
  async findById(id: string): Promise<GroupWithDetails | null> {
    try {
      return await prisma.group.findUnique({
        where: { id },
        include: {
          createdBy: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              avatar: true,
            },
          },
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  firstName: true,
                  lastName: true,
                  avatar: true,
                  isOnline: true,
                  lastSeen: true,
                },
              },
            },
            orderBy: [
              { role: 'asc' },
              { joinedAt: 'asc' },
            ],
          },
          conversation: {
            include: {
              messages: {
                take: 1,
                orderBy: { createdAt: 'desc' },
                include: {
                  sender: {
                    select: {
                      id: true,
                      username: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
    } catch (error) {
      throw new Error(`Error finding group by ID: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get user groups
   */
  async getUserGroups(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      role?: 'ADMIN' | 'MODERATOR' | 'MEMBER';
    } = {}
  ): Promise<GroupWithDetails[]> {
    try {
      const { limit = 20, offset = 0, role } = options;

      const whereClause: any = {
        members: {
          some: {
            userId,
            ...(role && { role }),
          },
        },
        isActive: true,
      };

      return await prisma.group.findMany({
        where: whereClause,
        include: {
          createdBy: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              avatar: true,
            },
          },
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  firstName: true,
                  lastName: true,
                  avatar: true,
                  isOnline: true,
                  lastSeen: true,
                },
              },
            },
            orderBy: [
              { role: 'asc' },
              { joinedAt: 'asc' },
            ],
          },
          conversation: {
            include: {
              messages: {
                take: 1,
                orderBy: { createdAt: 'desc' },
                include: {
                  sender: {
                    select: {
                      id: true,
                      username: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        skip: offset,
      });
    } catch (error) {
      throw new Error(`Error getting user groups: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update group
   */
  async update(
    id: string,
    updateData: {
      name?: string;
      description?: string;
      avatar?: string;
      isPublic?: boolean;
      maxMembers?: number;
    }
  ): Promise<GroupWithDetails | null> {
    try {
      // Transform isPublic to isPrivate for the database
      const dbUpdateData: any = { ...updateData };
      if (updateData.isPublic !== undefined) {
        dbUpdateData.isPrivate = !updateData.isPublic;
        delete dbUpdateData.isPublic;
      }

      const updatedGroup = await prisma.group.update({
        where: { id },
        data: dbUpdateData,
        include: {
          createdBy: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              avatar: true,
            },
          },
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  firstName: true,
                  lastName: true,
                  avatar: true,
                  isOnline: true,
                  lastSeen: true,
                },
              },
            },
            orderBy: [
              { role: 'asc' },
              { joinedAt: 'asc' },
            ],
          },
          conversation: {
            include: {
              messages: {
                take: 1,
                orderBy: { createdAt: 'desc' },
                include: {
                  sender: {
                    select: {
                      id: true,
                      username: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      return updatedGroup;
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new Error('Group not found');
      }
      if (error?.code === 'P2002') {
        throw new Error('A group with this name already exists');
      }
      throw new Error(`Error updating group: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Add member to group
   */
  async addMember(
    groupId: string,
    userId: string,
    role: 'ADMIN' | 'MODERATOR' | 'MEMBER' = 'MEMBER'
  ): Promise<boolean> {
    try {
      return await prisma.$transaction(async (tx: any) => {
        // Check if group exists and get conversation ID
        const group = await tx.group.findUnique({
          where: { id: groupId },
          include: {
            conversation: { select: { id: true } },
            members: { select: { userId: true } },
          },
        });

        if (!group) {
          throw new Error('Group not found');
        }

        // Check if user is already a member
        const isAlreadyMember = group.members.some((member: any) => member.userId === userId);
        if (isAlreadyMember) {
          throw new Error('User is already a member of this group');
        }

        // Check member limit
        if (group.members.length >= group.maxMembers) {
          throw new Error('Group has reached maximum member limit');
        }

        // Add to group members
        await tx.groupMember.create({
          data: {
            groupId,
            userId,
            role,
          },
        });

        // Add to conversation participants
        await tx.conversationParticipant.create({
          data: {
            conversationId: group.conversation.id,
            userId,
            role: role === 'ADMIN' ? 'ADMIN' : 'MEMBER',
          },
        });

        return true;
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new Error('User is already a member of this group');
      }
      throw new Error(`Error adding member: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Remove member from group
   */
  async removeMember(groupId: string, userId: string): Promise<boolean> {
    try {
      return await prisma.$transaction(async (tx: any) => {
        // Check if group exists and get conversation ID
        const group = await tx.group.findUnique({
          where: { id: groupId },
          include: {
            conversation: { select: { id: true } },
          },
        });

        if (!group) {
          throw new Error('Group not found');
        }

        // Don't allow removing the creator
        if (group.createdById === userId) {
          throw new Error('Cannot remove the group creator');
        }

        // Remove from group members
        await tx.groupMember.delete({
          where: {
            groupId_userId: {
              groupId,
              userId,
            },
          },
        });

        // Remove from conversation participants
        await tx.conversationParticipant.delete({
          where: {
            conversationId_userId: {
              conversationId: group.conversation.id,
              userId,
            },
          },
        });

        return true;
      });
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new Error('User is not a member of this group');
      }
      throw new Error(`Error removing member: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update member role
   */
  async updateMemberRole(
    groupId: string,
    userId: string,
    role: 'ADMIN' | 'MODERATOR' | 'MEMBER'
  ): Promise<boolean> {
    try {
      return await prisma.$transaction(async (tx: any) => {
        // Get group with conversation
        const group = await tx.group.findUnique({
          where: { id: groupId },
          include: {
            conversation: { select: { id: true } },
          },
        });

        if (!group) {
          throw new Error('Group not found');
        }

        // Don't allow changing creator's role
        if (group.createdById === userId) {
          throw new Error('Cannot change the creator\'s role');
        }

        // Update group member role
        await tx.groupMember.update({
          where: {
            groupId_userId: {
              groupId,
              userId,
            },
          },
          data: { role },
        });

        // Update conversation participant role
        await tx.conversationParticipant.update({
          where: {
            conversationId_userId: {
              conversationId: group.conversation.id,
              userId,
            },
          },
          data: {
            role: role === 'ADMIN' ? 'ADMIN' : 'MEMBER',
          },
        });

        return true;
      });
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new Error('User is not a member of this group');
      }
      throw new Error(`Error updating member role: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if user is member of group
   */
  async isMember(groupId: string, userId: string): Promise<boolean> {
    try {
      const member = await prisma.groupMember.findUnique({
        where: {
          groupId_userId: {
            groupId,
            userId,
          },
        },
        select: { id: true },
      });

      return !!member;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get member role in group
   */
  async getMemberRole(groupId: string, userId: string): Promise<'ADMIN' | 'MODERATOR' | 'MEMBER' | 'OWNER' | null> {
    try {
      const member = await prisma.groupMember.findUnique({
        where: {
          groupId_userId: {
            groupId,
            userId,
          },
        },
        select: { role: true },
      });

      return member?.role || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Search public groups
   */
  async searchPublicGroups(
    query: string,
    options: {
      limit?: number;
      offset?: number;
      excludeUserGroups?: string; // userId to exclude groups user is already in
    } = {}
  ): Promise<GroupWithDetails[]> {
    try {
      const { limit = 20, offset = 0, excludeUserGroups } = options;

      const whereClause: any = {
        isPrivate: false,
        isActive: true,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ],
      };

      if (excludeUserGroups) {
        whereClause.members = {
          none: {
            userId: excludeUserGroups,
          },
        };
      }

      return await prisma.group.findMany({
        where: whereClause,
        include: {
          createdBy: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              avatar: true,
            },
          },
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  firstName: true,
                  lastName: true,
                  avatar: true,
                  isOnline: true,
                  lastSeen: true,
                },
              },
            },
            orderBy: [
              { role: 'asc' },
              { joinedAt: 'asc' },
            ],
          },
          conversation: {
            include: {
              messages: {
                take: 1,
                orderBy: { createdAt: 'desc' },
                include: {
                  sender: {
                    select: {
                      id: true,
                      username: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: [
          { members: { _count: 'desc' } }, // Popular groups first
          { createdAt: 'desc' },
        ],
        take: limit,
        skip: offset,
      });
    } catch (error) {
      throw new Error(`Error searching public groups: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get group statistics
   */
  async getGroupStats(groupId: string): Promise<{
    totalMembers: number;
    totalMessages: number;
    membersByRole: Record<string, number>;
    createdAt: Date;
    lastActivity: Date | null;
  }> {
    try {
      const [group, totalMembers, membersByRole, totalMessages, lastMessage] = await Promise.all([
        prisma.group.findUnique({
          where: { id: groupId },
          select: { createdAt: true },
        }),
        prisma.groupMember.count({
          where: { groupId },
        }),
        prisma.groupMember.groupBy({
          by: ['role'],
          where: { groupId },
          _count: true,
        }),
        prisma.message.count({
          where: {
            conversation: {
              group: {
                id: groupId,
              },
            },
            isDeleted: false,
          },
        }),
        prisma.message.findFirst({
          where: {
            conversation: {
              group: {
                id: groupId,
              },
            },
            isDeleted: false,
          },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
      ]);

      if (!group) {
        throw new Error('Group not found');
      }

      const roleStats = membersByRole.reduce((acc: Record<string, number>, item: any) => {
        acc[item.role] = item._count;
        return acc;
      }, {});

      return {
        totalMembers,
        totalMessages,
        membersByRole: roleStats,
        createdAt: group.createdAt,
        lastActivity: lastMessage?.createdAt || null,
      };
    } catch (error) {
      throw new Error(`Error getting group stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Archive/Unarchive group
   */
  async updateActiveStatus(groupId: string, isActive: boolean): Promise<boolean> {
    try {
      await prisma.group.update({
        where: { id: groupId },
        data: { isActive },
      });

      return true;
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new Error('Group not found');
      }
      throw new Error(`Error updating group status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete group (soft delete)
   */
  async delete(groupId: string): Promise<boolean> {
    try {
      await prisma.$transaction(async (tx: any) => {
        // Get group with conversation
        const group = await tx.group.findUnique({
          where: { id: groupId },
          include: {
            conversation: { select: { id: true } },
          },
        });

        if (!group) {
          throw new Error('Group not found');
        }

        // Mark group as inactive
        await tx.group.update({
          where: { id: groupId },
          data: { isActive: false },
        });

        // Mark conversation as inactive
        await tx.conversation.update({
          where: { id: group.conversation.id },
          data: { isActive: false },
        });

        // Mark all messages as deleted
        await tx.message.updateMany({
          where: { conversationId: group.conversation.id },
          data: { isDeleted: true, deletedAt: new Date() },
        });
      });

      return true;
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new Error('Group not found');
      }
      throw new Error(`Error deleting group: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get popular groups
   */
  async getPopularGroups(limit = 10): Promise<GroupWithDetails[]> {
    try {
      return await prisma.group.findMany({
        where: {
          isPrivate: false,
          isActive: true,
        },
        include: {
          createdBy: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              avatar: true,
            },
          },
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  firstName: true,
                  lastName: true,
                  avatar: true,
                  isOnline: true,
                  lastSeen: true,
                },
              },
            },
            orderBy: [
              { role: 'asc' },
              { joinedAt: 'asc' },
            ],
          },
          conversation: {
            include: {
              messages: {
                take: 1,
                orderBy: { createdAt: 'desc' },
                include: {
                  sender: {
                    select: {
                      id: true,
                      username: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: [
          { members: { _count: 'desc' } },
          { updatedAt: 'desc' },
        ],
        take: limit,
      });
    } catch (error) {
      throw new Error(`Error getting popular groups: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Export singleton instance
export const groupRepository = new GroupRepository();
