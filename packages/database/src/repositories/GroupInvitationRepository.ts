import { Prisma, InvitationStatus } from '@prisma/client';
import { prisma } from '../client';
import type { GroupInvitationWithDetails } from '../types';

export class GroupInvitationRepository {
  /**
   * Create a new group invitation
   */
  async create(invitationData: {
    groupId: string;
    inviterId: string;
    inviteeId: string;
    message?: string;
    expiresAt?: Date;
  }): Promise<GroupInvitationWithDetails> {
    try {
      return await prisma.$transaction(async (tx) => {
        // Check if group exists
        const group = await tx.group.findUnique({
          where: { id: invitationData.groupId },
          select: { id: true, name: true, isActive: true },
        });

        if (!group) {
          throw new Error('Group not found');
        }

        if (!group.isActive) {
          throw new Error('Cannot invite to inactive group');
        }

        // Check if invitee is already a member
        const existingMember = await tx.groupMember.findUnique({
          where: {
            groupId_userId: {
              groupId: invitationData.groupId,
              userId: invitationData.inviteeId,
            },
          },
        });

        if (existingMember) {
          throw new Error('User is already a member of this group');
        }

        // Check if invitation already exists
        const existingInvitation = await tx.groupInvitation.findUnique({
          where: {
            groupId_inviteeId: {
              groupId: invitationData.groupId,
              inviteeId: invitationData.inviteeId,
            },
          },
        });

        if (existingInvitation && existingInvitation.status === 'PENDING') {
          throw new Error('Invitation already exists for this user');
        }

        // Create invitation
        const invitation = await tx.groupInvitation.create({
          data: {
            ...invitationData,
            expiresAt: invitationData.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
          },
          include: {
            group: {
              select: {
                id: true,
                name: true,
                description: true,
                avatar: true,
              },
            },
            inviter: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
                avatar: true,
              },
            },
            invitee: {
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

        return invitation;
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new Error('Invitation already exists for this user');
      }
      throw new Error(`Error creating group invitation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Find invitation by ID
   */
  async findById(id: string): Promise<GroupInvitationWithDetails | null> {
    try {
      return await prisma.groupInvitation.findUnique({
        where: { id },
        include: {
          group: {
            select: {
              id: true,
              name: true,
              description: true,
              avatar: true,
            },
          },
          inviter: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              avatar: true,
            },
          },
          invitee: {
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
    } catch (error) {
      throw new Error(`Error finding invitation by ID: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Find pending invitations by invitee ID
   */
  async findPendingByInviteeId(inviteeId: string): Promise<GroupInvitationWithDetails[]> {
    try {
      return await prisma.groupInvitation.findMany({
        where: {
          inviteeId,
          status: InvitationStatus.PENDING,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } }
          ],
        },
        include: {
          group: {
            select: {
              id: true,
              name: true,
              description: true,
              avatar: true,
            },
          },
          inviter: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              avatar: true,
            },
          },
          invitee: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              avatar: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      throw new Error(`Error finding pending invitations by invitee ID: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Find pending invitations by group ID
   */
  async findPendingByGroupId(groupId: string): Promise<GroupInvitationWithDetails[]> {
    try {
      return await prisma.groupInvitation.findMany({
        where: {
          groupId,
          status: InvitationStatus.PENDING,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } }
          ],
        },
        include: {
          group: {
            select: {
              id: true,
              name: true,
              description: true,
              avatar: true,
            },
          },
          inviter: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              avatar: true,
            },
          },
          invitee: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              avatar: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      throw new Error(`Error finding pending invitations by group ID: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Find pending invitation by group and user
   */
  async findPendingByGroupAndUser(groupId: string, userId: string): Promise<GroupInvitationWithDetails | null> {
    try {
      return await prisma.groupInvitation.findFirst({
        where: {
          groupId,
          inviteeId: userId,
          status: InvitationStatus.PENDING,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } }
          ],
        },
        include: {
          group: {
            select: {
              id: true,
              name: true,
              description: true,
              avatar: true,
            },
          },
          inviter: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              avatar: true,
            },
          },
          invitee: {
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
    } catch (error) {
      throw new Error(`Error finding pending invitation by group and user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Find any invitation by group and user
   */
  async findByGroupAndUser(groupId: string, userId: string): Promise<GroupInvitationWithDetails | null> {
    try {
      return await prisma.groupInvitation.findFirst({
        where: {
          groupId,
          inviteeId: userId,
        },
        include: {
          group: {
            select: {
              id: true,
              name: true,
              description: true,
              avatar: true,
            },
          },
          inviter: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              avatar: true,
            },
          },
          invitee: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              avatar: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      throw new Error(`Error finding invitation by group and user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update invitation status
   */
  async updateStatus(id: string, status: InvitationStatus): Promise<GroupInvitationWithDetails> {
    try {
      return await prisma.groupInvitation.update({
        where: { id },
        data: { status },
        include: {
          group: {
            select: {
              id: true,
              name: true,
              description: true,
              avatar: true,
            },
          },
          inviter: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              avatar: true,
            },
          },
          invitee: {
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
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new Error('Invitation not found');
      }
      throw new Error(`Error updating invitation status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete invitation
   */
  async delete(id: string): Promise<boolean> {
    try {
      await prisma.groupInvitation.delete({
        where: { id },
      });
      return true;
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new Error('Invitation not found');
      }
      throw new Error(`Error deleting invitation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete expired invitations
   */
  async deleteExpired(): Promise<number> {
    try {
      const result = await prisma.groupInvitation.deleteMany({
        where: {
          status: InvitationStatus.PENDING,
          expiresAt: {
            lt: new Date(),
          },
        },
      });
      return result.count;
    } catch (error) {
      throw new Error(`Error deleting expired invitations: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get group invitation statistics
   */
  async getGroupStats(groupId: string): Promise<{
    totalSent: number;
    totalAccepted: number;
    totalRejected: number;
    totalPending: number;
  }> {
    try {
      const [totalSent, totalAccepted, totalRejected, totalPending] = await Promise.all([
        prisma.groupInvitation.count({
          where: { groupId },
        }),
        prisma.groupInvitation.count({
          where: { groupId, status: InvitationStatus.ACCEPTED },
        }),
        prisma.groupInvitation.count({
          where: { groupId, status: InvitationStatus.DECLINED },
        }),
        prisma.groupInvitation.count({
          where: { 
            groupId, 
            status: InvitationStatus.PENDING,
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: new Date() } }
            ],
          },
        }),
      ]);

      return {
        totalSent,
        totalAccepted,
        totalRejected,
        totalPending,
      };
    } catch (error) {
      throw new Error(`Error getting group invitation stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get user invitation statistics
   */
  async getUserStats(userId: string): Promise<{
    totalReceived: number;
    totalAccepted: number;
    totalRejected: number;
    totalPending: number;
    totalSent: number;
  }> {
    try {
      const [totalReceived, totalAccepted, totalRejected, totalPending, totalSent] = await Promise.all([
        prisma.groupInvitation.count({
          where: { inviteeId: userId },
        }),
        prisma.groupInvitation.count({
          where: { inviteeId: userId, status: InvitationStatus.ACCEPTED },
        }),
        prisma.groupInvitation.count({
          where: { inviteeId: userId, status: InvitationStatus.DECLINED },
        }),
        prisma.groupInvitation.count({
          where: { 
            inviteeId: userId, 
            status: InvitationStatus.PENDING,
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: new Date() } }
            ],
          },
        }),
        prisma.groupInvitation.count({
          where: { inviterId: userId },
        }),
      ]);

      return {
        totalReceived,
        totalAccepted,
        totalRejected,
        totalPending,
        totalSent,
      };
    } catch (error) {
      throw new Error(`Error getting user invitation stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get pending invitations for a user (legacy method name for compatibility)
   */
  async getPendingInvitationsForUser(userId: string): Promise<GroupInvitationWithDetails[]> {
    return this.findPendingByInviteeId(userId);
  }

  /**
   * Get sent invitations by a user
   */
  async getSentInvitationsByUser(userId: string, options: {
    limit?: number;
    offset?: number;
    status?: InvitationStatus;
  } = {}): Promise<GroupInvitationWithDetails[]> {
    try {
      const { limit = 20, offset = 0, status } = options;

      const whereClause: any = { inviterId: userId };
      if (status) {
        whereClause.status = status;
      }

      return await prisma.groupInvitation.findMany({
        where: whereClause,
        include: {
          group: {
            select: {
              id: true,
              name: true,
              description: true,
              avatar: true,
            },
          },
          inviter: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              avatar: true,
            },
          },
          invitee: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              avatar: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      });
    } catch (error) {
      throw new Error(`Error getting sent invitations: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get pending invitations for a group (legacy method name for compatibility)
   */
  async getPendingInvitationsForGroup(groupId: string): Promise<GroupInvitationWithDetails[]> {
    return this.findPendingByGroupId(groupId);
  }

  /**
   * Accept invitation
   */
  async acceptInvitation(id: string, userId: string): Promise<GroupInvitationWithDetails> {
    try {
      return await prisma.$transaction(async (tx) => {
        // Find invitation
        const invitation = await tx.groupInvitation.findUnique({
          where: { id },
          include: {
            group: {
              include: {
                conversation: { select: { id: true } },
                members: { select: { userId: true } },
              },
            },
          },
        });

        if (!invitation) {
          throw new Error('Invitation not found');
        }

        // Check if user is the invitee
        if (invitation.inviteeId !== userId) {
          throw new Error('You can only accept your own invitations');
        }

        // Check if invitation is still pending
        if (invitation.status !== InvitationStatus.PENDING) {
          throw new Error(`Invitation has already been ${invitation.status.toLowerCase()}`);
        }

        // Check if invitation has expired
        if (invitation.expiresAt && invitation.expiresAt < new Date()) {
          throw new Error('Invitation has expired');
        }

        // Check if group is still active
        if (!invitation.group.isActive) {
          throw new Error('Group is no longer active');
        }

        // Check if user is already a member (double-check)
        const isAlreadyMember = invitation.group.members.some((member: any) => member.userId === userId);
        if (isAlreadyMember) {
          throw new Error('You are already a member of this group');
        }

        // Check member limit
        if (invitation.group.members.length >= invitation.group.maxMembers) {
          throw new Error('Group has reached maximum member limit');
        }

        // Update invitation status
        const updatedInvitation = await tx.groupInvitation.update({
          where: { id },
          data: { status: InvitationStatus.ACCEPTED },
          include: {
            group: {
              select: {
                id: true,
                name: true,
                description: true,
                avatar: true,
              },
            },
            inviter: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
                avatar: true,
              },
            },
            invitee: {
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

        // Add user to group members
        await tx.groupMember.create({
          data: {
            groupId: invitation.groupId,
            userId,
            role: 'MEMBER',
          },
        });

        // Add user to conversation participants
        await tx.conversationParticipant.create({
          data: {
            conversationId: invitation.group.conversation.id,
            userId,
            role: 'MEMBER',
          },
        });

        return updatedInvitation;
      });
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new Error('Invitation not found');
      }
      throw new Error(`Error accepting invitation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Decline invitation
   */
  async declineInvitation(id: string, userId: string): Promise<GroupInvitationWithDetails> {
    try {
      // Find and update invitation
      const invitation = await prisma.groupInvitation.findUnique({
        where: { id },
      });

      if (!invitation) {
        throw new Error('Invitation not found');
      }

      // Check if user is the invitee
      if (invitation.inviteeId !== userId) {
        throw new Error('You can only decline your own invitations');
      }

      // Check if invitation is still pending
      if (invitation.status !== InvitationStatus.PENDING) {
        throw new Error(`Invitation has already been ${invitation.status.toLowerCase()}`);
      }

      // Update invitation status
      return await prisma.groupInvitation.update({
        where: { id },
        data: { status: InvitationStatus.DECLINED },
        include: {
          group: {
            select: {
              id: true,
              name: true,
              description: true,
              avatar: true,
            },
          },
          inviter: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              avatar: true,
            },
          },
          invitee: {
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
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new Error('Invitation not found');
      }
      throw new Error(`Error declining invitation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Cancel invitation (by sender)
   */
  async cancelInvitation(id: string, userId: string): Promise<boolean> {
    try {
      // Find invitation
      const invitation = await prisma.groupInvitation.findUnique({
        where: { id },
      });

      if (!invitation) {
        throw new Error('Invitation not found');
      }

      // Check if user is the inviter
      if (invitation.inviterId !== userId) {
        throw new Error('You can only cancel invitations you sent');
      }

      // Check if invitation is still pending
      if (invitation.status !== InvitationStatus.PENDING) {
        throw new Error(`Invitation has already been ${invitation.status.toLowerCase()}`);
      }

      // Delete invitation
      await prisma.groupInvitation.delete({
        where: { id },
      });

      return true;
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new Error('Invitation not found');
      }
      throw new Error(`Error canceling invitation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Expire old invitations
   */
  async expireOldInvitations(): Promise<{ count: number }> {
    try {
      const result = await prisma.groupInvitation.updateMany({
        where: {
          status: InvitationStatus.PENDING,
          expiresAt: {
            lt: new Date(),
          },
        },
        data: {
          status: InvitationStatus.EXPIRED,
        },
      });

      return { count: result.count };
    } catch (error) {
      throw new Error(`Error expiring old invitations: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get invitation statistics for a group (legacy method name)
   */
  async getGroupInvitationStats(groupId: string): Promise<{
    total: number;
    pending: number;
    accepted: number;
    declined: number;
    expired: number;
  }> {
    try {
      const [total, pending, accepted, declined, expired] = await Promise.all([
        prisma.groupInvitation.count({
          where: { groupId },
        }),
        prisma.groupInvitation.count({
          where: { groupId, status: InvitationStatus.PENDING },
        }),
        prisma.groupInvitation.count({
          where: { groupId, status: InvitationStatus.ACCEPTED },
        }),
        prisma.groupInvitation.count({
          where: { groupId, status: InvitationStatus.DECLINED },
        }),
        prisma.groupInvitation.count({
          where: { groupId, status: InvitationStatus.EXPIRED },
        }),
      ]);

      return {
        total,
        pending,
        accepted,
        declined,
        expired,
      };
    } catch (error) {
      throw new Error(`Error getting group invitation stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Clean up old invitations (older than specified days)
   */
  async cleanupOldInvitations(daysOld = 30): Promise<{ count: number }> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const result = await prisma.groupInvitation.deleteMany({
        where: {
          createdAt: {
            lt: cutoffDate,
          },
          status: {
            in: [InvitationStatus.DECLINED, InvitationStatus.EXPIRED],
          },
        },
      });

      return { count: result.count };
    } catch (error) {
      throw new Error(`Error cleaning up old invitations: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Export singleton instance
export const groupInvitationRepository = new GroupInvitationRepository();
