import { Prisma } from '@prisma/client';
import { prisma } from '../client';

export class GroupJoinRequestRepository {
  /**
   * Create a new group join request
   */
  async create(requestData: {
    groupId: string;
    userId: string;
    message?: string;
  }) {
    try {
      return await prisma.$transaction(async (tx: any) => {
        // Check if group exists and is public
        const group = await tx.group.findUnique({
          where: { id: requestData.groupId },
          select: { 
            id: true, 
            name: true, 
            isPrivate: true, 
            isActive: true,
            members: { select: { userId: true } }
          },
        });

        if (!group) {
          throw new Error('Group not found');
        }

        if (!group.isActive) {
          throw new Error('Cannot join inactive group');
        }

        if (!group.isPrivate) {
          throw new Error('This group does not require approval to join');
        }

        // Check if user is already a member
        const isAlreadyMember = group.members.some((member: any) => member.userId === requestData.userId);
        if (isAlreadyMember) {
          throw new Error('You are already a member of this group');
        }

        // Check if request already exists
        const existingRequest = await tx.groupJoinRequest.findUnique({
          where: {
            groupId_userId: {
              groupId: requestData.groupId,
              userId: requestData.userId,
            },
          },
        });

        if (existingRequest && existingRequest.status === 'PENDING') {
          throw new Error('You already have a pending join request for this group');
        }

        // Create join request
        const joinRequest = await tx.groupJoinRequest.create({
          data: requestData,
          include: {
            group: {
              select: {
                id: true,
                name: true,
                description: true,
                avatar: true,
              },
            },
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

        return joinRequest;
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new Error('You already have a pending join request for this group');
      }
      throw new Error(`Error creating group join request: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Find join request by ID
   */
  async findById(id: string) {
    try {
      return await prisma.groupJoinRequest.findUnique({
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
    } catch (error) {
      throw new Error(`Error finding join request by ID: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get pending join requests for a group
   */
  async getPendingRequestsForGroup(groupId: string) {
    try {
      return await prisma.groupJoinRequest.findMany({
        where: {
          groupId,
          status: 'PENDING',
        },
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
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      throw new Error(`Error getting pending requests for group: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get join requests by a user
   */
  async getRequestsByUser(userId: string, options: {
    limit?: number;
    offset?: number;
    status?: 'PENDING' | 'APPROVED' | 'REJECTED';
  } = {}) {
    try {
      const { limit = 20, offset = 0, status } = options;

      const whereClause: any = { userId };
      if (status) {
        whereClause.status = status;
      }

      return await prisma.groupJoinRequest.findMany({
        where: whereClause,
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
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      });
    } catch (error) {
      throw new Error(`Error getting join requests by user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Approve join request
   */
  async approveRequest(id: string, approverId: string) {
    try {
      return await prisma.$transaction(async (tx: any) => {
        // Find join request
        const joinRequest = await tx.groupJoinRequest.findUnique({
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

        if (!joinRequest) {
          throw new Error('Join request not found');
        }

        // Check if request is still pending
        if (joinRequest.status !== 'PENDING') {
          throw new Error(`Request has already been ${joinRequest.status.toLowerCase()}`);
        }

        // Check if group is still active
        if (!joinRequest.group.isActive) {
          throw new Error('Group is no longer active');
        }

        // Check if user is already a member (double-check)
        const isAlreadyMember = joinRequest.group.members.some((member: any) => member.userId === joinRequest.userId);
        if (isAlreadyMember) {
          throw new Error('User is already a member of this group');
        }

        // Check if approver has permission (is admin or moderator)
        const approverMember = await tx.groupMember.findUnique({
          where: {
            groupId_userId: {
              groupId: joinRequest.groupId,
              userId: approverId,
            },
          },
        });

        if (!approverMember || !['ADMIN', 'MODERATOR'].includes(approverMember.role)) {
          throw new Error('You do not have permission to approve join requests');
        }

        // Check member limit
        if (joinRequest.group.members.length >= joinRequest.group.maxMembers) {
          throw new Error('Group has reached maximum member limit');
        }

        // Update request status
        await tx.groupJoinRequest.update({
          where: { id },
          data: { status: 'APPROVED' },
        });

        // Add user to group members
        await tx.groupMember.create({
          data: {
            groupId: joinRequest.groupId,
            userId: joinRequest.userId,
            role: 'MEMBER',
          },
        });

        // Add user to conversation participants
        await tx.conversationParticipant.create({
          data: {
            conversationId: joinRequest.group.conversation.id,
            userId: joinRequest.userId,
            role: 'MEMBER',
          },
        });

        return joinRequest;
      });
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new Error('Join request not found');
      }
      throw new Error(`Error approving join request: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Reject join request
   */
  async rejectRequest(id: string, rejecterId: string) {
    try {
      return await prisma.$transaction(async (tx: any) => {
        // Find join request
        const joinRequest = await tx.groupJoinRequest.findUnique({
          where: { id },
          include: {
            group: { select: { id: true } },
          },
        });

        if (!joinRequest) {
          throw new Error('Join request not found');
        }

        // Check if request is still pending
        if (joinRequest.status !== 'PENDING') {
          throw new Error(`Request has already been ${joinRequest.status.toLowerCase()}`);
        }

        // Check if rejecter has permission (is admin or moderator)
        const rejecterMember = await tx.groupMember.findUnique({
          where: {
            groupId_userId: {
              groupId: joinRequest.groupId,
              userId: rejecterId,
            },
          },
        });

        if (!rejecterMember || !['ADMIN', 'MODERATOR'].includes(rejecterMember.role)) {
          throw new Error('You do not have permission to reject join requests');
        }

        // Update request status
        const updatedRequest = await tx.groupJoinRequest.update({
          where: { id },
          data: { status: 'REJECTED' },
          include: {
            group: {
              select: {
                id: true,
                name: true,
                description: true,
                avatar: true,
              },
            },
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

        return updatedRequest;
      });
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new Error('Join request not found');
      }
      throw new Error(`Error rejecting join request: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Cancel join request (by user)
   */
  async cancelRequest(id: string, userId: string) {
    try {
      // Find join request
      const joinRequest = await prisma.groupJoinRequest.findUnique({
        where: { id },
      });

      if (!joinRequest) {
        throw new Error('Join request not found');
      }

      // Check if user is the requester
      if (joinRequest.userId !== userId) {
        throw new Error('You can only cancel your own join requests');
      }

      // Check if request is still pending
      if (joinRequest.status !== 'PENDING') {
        throw new Error(`Request has already been ${joinRequest.status.toLowerCase()}`);
      }

      // Delete join request
      await prisma.groupJoinRequest.delete({
        where: { id },
      });

      return true;
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new Error('Join request not found');
      }
      throw new Error(`Error canceling join request: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get join request statistics for a group
   */
  async getGroupJoinRequestStats(groupId: string): Promise<{
    total: number;
    pending: number;
    approved: number;
    rejected: number;
  }> {
    try {
      const [total, pending, approved, rejected] = await Promise.all([
        prisma.groupJoinRequest.count({
          where: { groupId },
        }),
        prisma.groupJoinRequest.count({
          where: { groupId, status: 'PENDING' },
        }),
        prisma.groupJoinRequest.count({
          where: { groupId, status: 'APPROVED' },
        }),
        prisma.groupJoinRequest.count({
          where: { groupId, status: 'REJECTED' },
        }),
      ]);

      return {
        total,
        pending,
        approved,
        rejected,
      };
    } catch (error) {
      throw new Error(`Error getting group join request stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Clean up old join requests (older than specified days)
   */
  async cleanupOldRequests(daysOld = 30): Promise<{ count: number }> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const result = await prisma.groupJoinRequest.deleteMany({
        where: {
          createdAt: {
            lt: cutoffDate,
          },
          status: {
            in: ['APPROVED', 'REJECTED'],
          },
        },
      });

      return { count: result.count };
    } catch (error) {
      throw new Error(`Error cleaning up old join requests: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Additional methods expected by the service

  /**
   * Find pending requests by group ID (wrapper for getPendingRequestsForGroup)
   */
  async findPendingByGroupId(groupId: string) {
    try {
      return await prisma.groupJoinRequest.findMany({
        where: {
          groupId,
          status: 'PENDING',
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
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      throw new Error(`Error getting pending requests for group: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Find pending requests by user ID
   */
  async findPendingByUserId(userId: string) {
    try {
      return await prisma.groupJoinRequest.findMany({
        where: {
          userId,
          status: 'PENDING',
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
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      throw new Error(`Error getting pending requests for user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update request status
   */
  async updateStatus(id: string, status: 'APPROVED' | 'REJECTED') {
    try {
      // Simple status update without permission checks for service layer use
      const updatedRequest = await prisma.groupJoinRequest.update({
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

      // If approved, add user to group (simplified version without permission checks)
      if (status === 'APPROVED') {
        await prisma.$transaction(async (tx: any) => {
          // Get group conversation
          const group = await tx.group.findUnique({
            where: { id: updatedRequest.groupId },
            include: { conversation: { select: { id: true } } }
          });

          if (group) {
            // Add user to group members
            await tx.groupMember.create({
              data: {
                groupId: updatedRequest.groupId,
                userId: updatedRequest.userId,
                role: 'MEMBER',
              },
            });

            // Add user to conversation participants
            await tx.conversationParticipant.create({
              data: {
                conversationId: group.conversation.id,
                userId: updatedRequest.userId,
                role: 'MEMBER',
              },
            });
          }
        });
      }

      return updatedRequest;
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new Error('Join request not found');
      }
      throw new Error(`Error updating join request status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete a join request by ID
   */
  async delete(id: string): Promise<boolean> {
    try {
      await prisma.groupJoinRequest.delete({
        where: { id }
      });
      return true;
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new Error('Join request not found');
      }
      throw new Error(`Error deleting join request: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete expired requests
   */
  async deleteExpired(): Promise<number> {
    try {
      const now = new Date();
      const result = await prisma.groupJoinRequest.deleteMany({
        where: {
          AND: [
            { status: 'PENDING' },
            {
              OR: [
                { createdAt: { lt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } }, // 30 days old
                { 
                  // Add expiresAt field support if it exists in schema
                  // expiresAt: { lt: now }
                }
              ]
            }
          ]
        }
      });
      return result.count;
    } catch (error) {
      throw new Error(`Error deleting expired join requests: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get group statistics (wrapper for getGroupJoinRequestStats)
   */
  async getGroupStats(groupId: string): Promise<{
    totalRequests: number;
    totalApproved: number;
    totalRejected: number;
    totalPending: number;
  }> {
    const stats = await this.getGroupJoinRequestStats(groupId);
    return {
      totalRequests: stats.total,
      totalApproved: stats.approved,
      totalRejected: stats.rejected,
      totalPending: stats.pending,
    };
  }

  /**
   * Get user statistics
   */
  async getUserStats(userId: string): Promise<{
    totalSent: number;
    totalApproved: number;
    totalRejected: number;
    totalPending: number;
  }> {
    try {
      const [totalSent, totalApproved, totalRejected, totalPending] = await Promise.all([
        prisma.groupJoinRequest.count({
          where: { userId },
        }),
        prisma.groupJoinRequest.count({
          where: { userId, status: 'APPROVED' },
        }),
        prisma.groupJoinRequest.count({
          where: { userId, status: 'REJECTED' },
        }),
        prisma.groupJoinRequest.count({
          where: { userId, status: 'PENDING' },
        }),
      ]);

      return {
        totalSent,
        totalApproved,
        totalRejected,
        totalPending,
      };
    } catch (error) {
      throw new Error(`Error getting user join request stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Find pending request by group and user
   */
  async findPendingByGroupAndUser(groupId: string, userId: string) {
    try {
      return await prisma.groupJoinRequest.findFirst({
        where: {
          groupId,
          userId,
          status: 'PENDING'
        }
      });
    } catch (error) {
      throw new Error(`Error finding pending request by group and user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Find request by group and user (any status)
   */
  async findByGroupAndUser(groupId: string, userId: string) {
    try {
      return await prisma.groupJoinRequest.findFirst({
        where: {
          groupId,
          userId
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
    } catch (error) {
      throw new Error(`Error finding request by group and user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Export singleton instance
export const groupJoinRequestRepository = new GroupJoinRequestRepository();
