import { Prisma } from '@prisma/client';
import { prisma } from '../client';

export class GroupInvitationRepository {
  /**
   * Create a new group invitation
   */
  async create(invitationData: {
    groupId: string;
    senderId: string;
    receiverId: string;
    message?: string;
    expiresAt?: Date;
  }) {
    try {
      return await prisma.$transaction(async (tx: any) => {
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

        // Check if receiver is already a member
        const existingMember = await tx.groupMember.findUnique({
          where: {
            groupId_userId: {
              groupId: invitationData.groupId,
              userId: invitationData.receiverId,
            },
          },
        });

        if (existingMember) {
          throw new Error('User is already a member of this group');
        }

        // Check if invitation already exists
        const existingInvitation = await tx.groupInvitation.findUnique({
          where: {
            groupId_receiverId: {
              groupId: invitationData.groupId,
              receiverId: invitationData.receiverId,
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
            sender: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
                avatar: true,
              },
            },
            receiver: {
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
  async findById(id: string) {
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
          sender: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              avatar: true,
            },
          },
          receiver: {
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
   * Get pending invitations for a user
   */
  async getPendingInvitationsForUser(userId: string) {
    try {
      return await prisma.groupInvitation.findMany({
        where: {
          receiverId: userId,
          status: 'PENDING',
          expiresAt: {
            gt: new Date(),
          },
        },
        include: {
          group: {
            select: {
              id: true,
              name: true,
              description: true,
              avatar: true,
              isActive: true,
            },
          },
          sender: {
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
      throw new Error(`Error getting pending invitations for user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get sent invitations by a user
   */
  async getSentInvitationsByUser(userId: string, options: {
    limit?: number;
    offset?: number;
    status?: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';
  } = {}) {
    try {
      const { limit = 20, offset = 0, status } = options;

      const whereClause: any = { senderId: userId };
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
          receiver: {
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
   * Get pending invitations for a group
   */
  async getPendingInvitationsForGroup(groupId: string) {
    try {
      return await prisma.groupInvitation.findMany({
        where: {
          groupId,
          status: 'PENDING',
          expiresAt: {
            gt: new Date(),
          },
        },
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              avatar: true,
            },
          },
          receiver: {
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
      throw new Error(`Error getting pending invitations for group: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Accept invitation
   */
  async acceptInvitation(id: string, userId: string) {
    try {
      return await prisma.$transaction(async (tx: any) => {
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

        // Check if user is the receiver
        if (invitation.receiverId !== userId) {
          throw new Error('You can only accept your own invitations');
        }

        // Check if invitation is still pending
        if (invitation.status !== 'PENDING') {
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
        await tx.groupInvitation.update({
          where: { id },
          data: { status: 'ACCEPTED' },
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

        return invitation;
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
  async declineInvitation(id: string, userId: string) {
    try {
      // Find and update invitation
      const invitation = await prisma.groupInvitation.findUnique({
        where: { id },
      });

      if (!invitation) {
        throw new Error('Invitation not found');
      }

      // Check if user is the receiver
      if (invitation.receiverId !== userId) {
        throw new Error('You can only decline your own invitations');
      }

      // Check if invitation is still pending
      if (invitation.status !== 'PENDING') {
        throw new Error(`Invitation has already been ${invitation.status.toLowerCase()}`);
      }

      // Update invitation status
      return await prisma.groupInvitation.update({
        where: { id },
        data: { status: 'DECLINED' },
        include: {
          group: {
            select: {
              id: true,
              name: true,
              description: true,
              avatar: true,
            },
          },
          sender: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              avatar: true,
            },
          },
          receiver: {
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
  async cancelInvitation(id: string, userId: string) {
    try {
      // Find invitation
      const invitation = await prisma.groupInvitation.findUnique({
        where: { id },
      });

      if (!invitation) {
        throw new Error('Invitation not found');
      }

      // Check if user is the sender
      if (invitation.senderId !== userId) {
        throw new Error('You can only cancel invitations you sent');
      }

      // Check if invitation is still pending
      if (invitation.status !== 'PENDING') {
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
          status: 'PENDING',
          expiresAt: {
            lt: new Date(),
          },
        },
        data: {
          status: 'EXPIRED',
        },
      });

      return { count: result.count };
    } catch (error) {
      throw new Error(`Error expiring old invitations: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get invitation statistics for a group
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
          where: { groupId, status: 'PENDING' },
        }),
        prisma.groupInvitation.count({
          where: { groupId, status: 'ACCEPTED' },
        }),
        prisma.groupInvitation.count({
          where: { groupId, status: 'DECLINED' },
        }),
        prisma.groupInvitation.count({
          where: { groupId, status: 'EXPIRED' },
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
            in: ['DECLINED', 'EXPIRED'],
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
