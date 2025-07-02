import { Prisma } from '@prisma/client';
import { prisma } from '../client';

export class GroupMemberRepository {
  /**
   * Add member to group
   */
  async addMember(memberData: {
    groupId: string;
    userId: string;
    role?: 'MEMBER' | 'MODERATOR' | 'ADMIN' | 'OWNER';
  }) {
    try {
      return await prisma.$transaction(async (tx: any) => {
        // Check if group exists and is active
        const group = await tx.group.findUnique({
          where: { id: memberData.groupId },
          include: {
            members: { select: { userId: true } },
            conversation: { select: { id: true } },
          },
        });

        if (!group) {
          throw new Error('Group not found');
        }

        // Check if user is already a member
        const isAlreadyMember = group.members.some((member: any) => member.userId === memberData.userId);
        if (isAlreadyMember) {
          throw new Error('User is already a member of this group');
        }

        // Check member limit
        if (group.members.length >= group.maxMembers) {
          throw new Error('Group has reached maximum member limit');
        }

        // Add group member
        const groupMember = await tx.groupMember.create({
          data: {
            groupId: memberData.groupId,
            userId: memberData.userId,
            role: memberData.role || 'MEMBER',
          },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
                avatar: true,
                isOnline: true,
              },
            },
            group: {
              select: {
                id: true,
                name: true,
                description: true,
                avatar: true,
              },
            },
          },
        });

        // Add user to conversation participants
        await tx.conversationParticipant.create({
          data: {
            conversationId: group.conversation.id,
            userId: memberData.userId,
            role: memberData.role === 'ADMIN' || memberData.role === 'OWNER' ? 'ADMIN' : 'MEMBER',
          },
        });

        return groupMember;
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new Error('User is already a member of this group');
      }
      throw new Error(`Error adding group member: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Remove member from group
   */
  async removeMember(groupId: string, userId: string): Promise<boolean> {
    try {
      return await prisma.$transaction(async (tx: any) => {
        // Get group with conversation info
        const group = await tx.group.findUnique({
          where: { id: groupId },
          include: {
            conversation: { select: { id: true } },
          },
        });

        if (!group) {
          throw new Error('Group not found');
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
        await tx.conversationParticipant.update({
          where: {
            conversationId_userId: {
              conversationId: group.conversation.id,
              userId,
            },
          },
          data: {
            leftAt: new Date(),
          },
        });

        return true;
      });
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new Error('Member not found in group');
      }
      throw new Error(`Error removing group member: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get group members
   */
  async getGroupMembers(groupId: string) {
    try {
      return await prisma.groupMember.findMany({
        where: { groupId },
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
          { role: 'asc' }, // OWNER, ADMIN, MODERATOR, MEMBER
          { joinedAt: 'asc' },
        ],
      });
    } catch (error) {
      throw new Error(`Error getting group members: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get user's group memberships
   */
  async getUserGroupMemberships(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      role?: 'MEMBER' | 'MODERATOR' | 'ADMIN' | 'OWNER';
    } = {}
  ) {
    try {
      const { limit = 50, offset = 0, role } = options;

      const whereClause: any = { userId };
      if (role) {
        whereClause.role = role;
      }

      return await prisma.groupMember.findMany({
        where: whereClause,
        include: {
          group: {
            include: {
              conversation: {
                select: {
                  id: true,
                  updatedAt: true,
                },
              },
              members: {
                select: {
                  id: true,
                  userId: true,
                },
              },
            },
          },
        },
        orderBy: { group: { conversation: { updatedAt: 'desc' } } },
        take: limit,
        skip: offset,
      });
    } catch (error) {
      throw new Error(`Error getting user group memberships: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update member role
   */
  async updateMemberRole(
    groupId: string,
    userId: string,
    role: 'MEMBER' | 'MODERATOR' | 'ADMIN' | 'OWNER',
    updatedById: string
  ) {
    try {
      return await prisma.$transaction(async (tx: any) => {
        // Check if updater has permission
        const updater = await tx.groupMember.findUnique({
          where: {
            groupId_userId: {
              groupId,
              userId: updatedById,
            },
          },
        });

        if (!updater || !['ADMIN', 'OWNER'].includes(updater.role)) {
          throw new Error('You do not have permission to update member roles');
        }

        // Cannot demote owner unless updater is also owner
        const targetMember = await tx.groupMember.findUnique({
          where: {
            groupId_userId: {
              groupId,
              userId,
            },
          },
        });

        if (!targetMember) {
          throw new Error('Member not found in group');
        }

        if (targetMember.role === 'OWNER' && updater.role !== 'OWNER') {
          throw new Error('Only group owner can change owner role');
        }

        // Update group member role
        const updatedMember = await tx.groupMember.update({
          where: {
            groupId_userId: {
              groupId,
              userId,
            },
          },
          data: { role },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
                avatar: true,
              },
            },
          },
        });

        // Update conversation participant role if needed
        const group = await tx.group.findUnique({
          where: { id: groupId },
          include: { conversation: { select: { id: true } } },
        });

        if (group) {
          await tx.conversationParticipant.update({
            where: {
              conversationId_userId: {
                conversationId: group.conversation.id,
                userId,
              },
            },
            data: {
              role: role === 'ADMIN' || role === 'OWNER' ? 'ADMIN' : 'MEMBER',
            },
          });
        }

        return updatedMember;
      });
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new Error('Member not found in group');
      }
      throw new Error(`Error updating member role: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get member by user ID
   */
  async getMember(groupId: string, userId: string) {
    try {
      return await prisma.groupMember.findUnique({
        where: {
          groupId_userId: {
            groupId,
            userId,
          },
        },
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
          group: {
            select: {
              id: true,
              name: true,
              description: true,
              avatar: true,
            },
          },
        },
      });
    } catch (error) {
      throw new Error(`Error getting group member: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      });
      return !!member;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if user has admin privileges
   */
  async hasAdminPrivileges(groupId: string, userId: string): Promise<boolean> {
    try {
      const member = await prisma.groupMember.findUnique({
        where: {
          groupId_userId: {
            groupId,
            userId,
          },
        },
      });
      return !!member && ['ADMIN', 'OWNER'].includes(member.role);
    } catch (error) {
      return false;
    }
  }

  /**
   * Get group admins
   */
  async getGroupAdmins(groupId: string) {
    try {
      return await prisma.groupMember.findMany({
        where: {
          groupId,
          role: {
            in: ['ADMIN', 'OWNER'],
          },
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              avatar: true,
              isOnline: true,
            },
          },
        },
        orderBy: [
          { role: 'asc' },
          { joinedAt: 'asc' },
        ],
      });
    } catch (error) {
      throw new Error(`Error getting group admins: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get group moderators
   */
  async getGroupModerators(groupId: string) {
    try {
      return await prisma.groupMember.findMany({
        where: {
          groupId,
          role: 'MODERATOR',
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              avatar: true,
              isOnline: true,
            },
          },
        },
        orderBy: { joinedAt: 'asc' },
      });
    } catch (error) {
      throw new Error(`Error getting group moderators: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get member statistics for a group
   */
  async getGroupMemberStats(groupId: string): Promise<{
    totalMembers: number;
    owners: number;
    admins: number;
    moderators: number;
    members: number;
    onlineMembers: number;
  }> {
    try {
      const [total, owners, admins, moderators, members, onlineMembers] = await Promise.all([
        prisma.groupMember.count({
          where: { groupId },
        }),
        prisma.groupMember.count({
          where: { groupId, role: 'OWNER' },
        }),
        prisma.groupMember.count({
          where: { groupId, role: 'ADMIN' },
        }),
        prisma.groupMember.count({
          where: { groupId, role: 'MODERATOR' },
        }),
        prisma.groupMember.count({
          where: { groupId, role: 'MEMBER' },
        }),
        prisma.groupMember.count({
          where: {
            groupId,
            user: { isOnline: true },
          },
        }),
      ]);

      return {
        totalMembers: total,
        owners,
        admins,
        moderators,
        members,
        onlineMembers,
      };
    } catch (error) {
      throw new Error(`Error getting group member stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Bulk add members
   */
  async bulkAddMembers(members: Array<{
    groupId: string;
    userId: string;
    role?: 'MEMBER' | 'MODERATOR' | 'ADMIN' | 'OWNER';
  }>): Promise<{ count: number }> {
    try {
      const result = await prisma.groupMember.createMany({
        data: members.map(m => ({
          groupId: m.groupId,
          userId: m.userId,
          role: m.role || 'MEMBER',
        })),
        skipDuplicates: true,
      });
      return { count: result.count };
    } catch (error) {
      throw new Error(`Error bulk adding members: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Transfer group ownership
   */
  async transferOwnership(groupId: string, currentOwnerId: string, newOwnerId: string) {
    try {
      return await prisma.$transaction(async (tx: any) => {
        // Verify current owner
        const currentOwner = await tx.groupMember.findUnique({
          where: {
            groupId_userId: {
              groupId,
              userId: currentOwnerId,
            },
          },
        });

        if (!currentOwner || currentOwner.role !== 'OWNER') {
          throw new Error('Only current owner can transfer ownership');
        }

        // Verify new owner is a member
        const newOwner = await tx.groupMember.findUnique({
          where: {
            groupId_userId: {
              groupId,
              userId: newOwnerId,
            },
          },
        });

        if (!newOwner) {
          throw new Error('New owner must be a member of the group');
        }

        // Update roles
        await tx.groupMember.update({
          where: {
            groupId_userId: {
              groupId,
              userId: currentOwnerId,
            },
          },
          data: { role: 'ADMIN' },
        });

        const updatedNewOwner = await tx.groupMember.update({
          where: {
            groupId_userId: {
              groupId,
              userId: newOwnerId,
            },
          },
          data: { role: 'OWNER' },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
                avatar: true,
              },
            },
          },
        });

        return updatedNewOwner;
      });
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new Error('Member not found in group');
      }
      throw new Error(`Error transferring ownership: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Export singleton instance
export const groupMemberRepository = new GroupMemberRepository();
