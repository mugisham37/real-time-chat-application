import { Prisma } from '@prisma/client';
import { prisma } from '../client';

export class ConversationParticipantRepository {
  /**
   * Add participant to conversation
   */
  async addParticipant(participantData: {
    conversationId: string;
    userId: string;
    role?: 'MEMBER' | 'ADMIN';
  }) {
    try {
      return await prisma.conversationParticipant.create({
        data: {
          conversationId: participantData.conversationId,
          userId: participantData.userId,
          role: participantData.role || 'MEMBER',
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
          conversation: {
            select: {
              id: true,
              type: true,
              name: true,
              avatar: true,
            },
          },
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new Error('User is already a participant in this conversation');
      }
      throw new Error(`Error adding participant: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Remove participant from conversation
   */
  async removeParticipant(conversationId: string, userId: string): Promise<boolean> {
    try {
      await prisma.conversationParticipant.update({
        where: {
          conversationId_userId: {
            conversationId,
            userId,
          },
        },
        data: {
          leftAt: new Date(),
        },
      });
      return true;
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new Error('Participant not found in conversation');
      }
      throw new Error(`Error removing participant: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get conversation participants
   */
  async getConversationParticipants(conversationId: string, includeLeft = false) {
    try {
      const whereClause: any = { conversationId };
      
      if (!includeLeft) {
        whereClause.leftAt = null;
      }

      return await prisma.conversationParticipant.findMany({
        where: whereClause,
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
        orderBy: { joinedAt: 'asc' },
      });
    } catch (error) {
      throw new Error(`Error getting conversation participants: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get user's conversations
   */
  async getUserConversations(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      includeLeft?: boolean;
      type?: 'DIRECT' | 'GROUP';
    } = {}
  ) {
    try {
      const { limit = 50, offset = 0, includeLeft = false, type } = options;

      const whereClause: any = { userId };
      
      if (!includeLeft) {
        whereClause.leftAt = null;
      }

      if (type) {
        whereClause.conversation = {
          type,
        };
      }

      return await prisma.conversationParticipant.findMany({
        where: whereClause,
        include: {
          conversation: {
            include: {
              participants: {
                where: { leftAt: null },
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
              },
              messages: {
                orderBy: { createdAt: 'desc' },
                take: 1,
                include: {
                  sender: {
                    select: {
                      id: true,
                      username: true,
                      firstName: true,
                      lastName: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { conversation: { updatedAt: 'desc' } },
        take: limit,
        skip: offset,
      });
    } catch (error) {
      throw new Error(`Error getting user conversations: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update participant role
   */
  async updateParticipantRole(
    conversationId: string,
    userId: string,
    role: 'MEMBER' | 'ADMIN'
  ) {
    try {
      return await prisma.conversationParticipant.update({
        where: {
          conversationId_userId: {
            conversationId,
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
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new Error('Participant not found in conversation');
      }
      throw new Error(`Error updating participant role: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update last read timestamp
   */
  async updateLastRead(conversationId: string, userId: string) {
    try {
      return await prisma.conversationParticipant.update({
        where: {
          conversationId_userId: {
            conversationId,
            userId,
          },
        },
        data: {
          lastReadAt: new Date(),
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new Error('Participant not found in conversation');
      }
      throw new Error(`Error updating last read: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if user is participant
   */
  async isParticipant(conversationId: string, userId: string): Promise<boolean> {
    try {
      const participant = await prisma.conversationParticipant.findUnique({
        where: {
          conversationId_userId: {
            conversationId,
            userId,
          },
        },
      });
      return !!participant && !participant.leftAt;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get participant info
   */
  async getParticipant(conversationId: string, userId: string) {
    try {
      return await prisma.conversationParticipant.findUnique({
        where: {
          conversationId_userId: {
            conversationId,
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
          conversation: {
            select: {
              id: true,
              type: true,
              name: true,
              avatar: true,
            },
          },
        },
      });
    } catch (error) {
      throw new Error(`Error getting participant: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get unread message count for user
   */
  async getUnreadCount(conversationId: string, userId: string): Promise<number> {
    try {
      const participant = await prisma.conversationParticipant.findUnique({
        where: {
          conversationId_userId: {
            conversationId,
            userId,
          },
        },
        select: { lastReadAt: true },
      });

      if (!participant) {
        return 0;
      }

      return await prisma.message.count({
        where: {
          conversationId,
          createdAt: {
            gt: participant.lastReadAt,
          },
          senderId: {
            not: userId, // Don't count own messages
          },
        },
      });
    } catch (error) {
      return 0;
    }
  }

  /**
   * Bulk add participants
   */
  async bulkAddParticipants(participants: Array<{
    conversationId: string;
    userId: string;
    role?: 'MEMBER' | 'ADMIN';
  }>): Promise<{ count: number }> {
    try {
      const result = await prisma.conversationParticipant.createMany({
        data: participants.map(p => ({
          conversationId: p.conversationId,
          userId: p.userId,
          role: p.role || 'MEMBER',
        })),
        skipDuplicates: true,
      });
      return { count: result.count };
    } catch (error) {
      throw new Error(`Error bulk adding participants: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get conversation admins
   */
  async getConversationAdmins(conversationId: string) {
    try {
      return await prisma.conversationParticipant.findMany({
        where: {
          conversationId,
          role: 'ADMIN',
          leftAt: null,
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
      });
    } catch (error) {
      throw new Error(`Error getting conversation admins: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get participant statistics
   */
  async getParticipantStats(conversationId: string): Promise<{
    totalParticipants: number;
    activeParticipants: number;
    admins: number;
    members: number;
    leftParticipants: number;
  }> {
    try {
      const [total, active, admins, members, left] = await Promise.all([
        prisma.conversationParticipant.count({
          where: { conversationId },
        }),
        prisma.conversationParticipant.count({
          where: { conversationId, leftAt: null },
        }),
        prisma.conversationParticipant.count({
          where: { conversationId, role: 'ADMIN', leftAt: null },
        }),
        prisma.conversationParticipant.count({
          where: { conversationId, role: 'MEMBER', leftAt: null },
        }),
        prisma.conversationParticipant.count({
          where: { conversationId, leftAt: { not: null } },
        }),
      ]);

      return {
        totalParticipants: total,
        activeParticipants: active,
        admins,
        members,
        leftParticipants: left,
      };
    } catch (error) {
      throw new Error(`Error getting participant stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Export singleton instance
export const conversationParticipantRepository = new ConversationParticipantRepository();
