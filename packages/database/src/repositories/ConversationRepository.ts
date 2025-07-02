import { Prisma } from '@prisma/client';
import { prisma } from '../client';
import { ConversationWithDetails } from '../types';

export class ConversationRepository {
  /**
   * Create a new direct conversation
   */
  async createDirectConversation(participantIds: string[]): Promise<ConversationWithDetails> {
    try {
      if (participantIds.length !== 2) {
        throw new Error('Direct conversation must have exactly 2 participants');
      }

      // Check if conversation already exists between these participants
      const existingConversation = await prisma.conversation.findFirst({
        where: {
          type: 'DIRECT',
          participants: {
            every: {
              userId: { in: participantIds },
            },
          },
        },
        include: {
          participants: {
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
          },
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
          group: {
            include: {
              members: {
                include: {
                  user: {
                    select: {
                      id: true,
                      username: true,
                      avatar: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (existingConversation) {
        return existingConversation;
      }

      // Create new conversation with participants
      return await prisma.$transaction(async (tx: any) => {
        const conversation = await tx.conversation.create({
          data: {
            type: 'DIRECT',
            participants: {
              create: participantIds.map((userId) => ({
                userId,
                role: 'MEMBER',
              })),
            },
          },
          include: {
            participants: {
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
            },
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
            group: {
              include: {
                members: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        username: true,
                        avatar: true,
                      },
                    },
                  },
                },
              },
            },
          },
        });

        return conversation;
      });
    } catch (error: any) {
      throw new Error(`Error creating direct conversation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Find conversation by ID
   */
  async findById(id: string): Promise<ConversationWithDetails | null> {
    try {
      return await prisma.conversation.findUnique({
        where: { id },
        include: {
          participants: {
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
          },
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
          group: {
            include: {
              members: {
                include: {
                  user: {
                    select: {
                      id: true,
                      username: true,
                      avatar: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
    } catch (error) {
      throw new Error(`Error finding conversation by ID: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Find conversation by participants (for direct messages)
   */
  async findByParticipants(participantIds: string[]): Promise<ConversationWithDetails | null> {
    try {
      if (participantIds.length !== 2) {
        throw new Error('Direct conversation must have exactly 2 participants');
      }

      return await prisma.conversation.findFirst({
        where: {
          type: 'DIRECT',
          participants: {
            every: {
              userId: { in: participantIds },
            },
          },
        },
        include: {
          participants: {
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
          },
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
          group: {
            include: {
              members: {
                include: {
                  user: {
                    select: {
                      id: true,
                      username: true,
                      avatar: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
    } catch (error) {
      throw new Error(`Error finding conversation by participants: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get user conversations with pagination
   */
  async getUserConversations(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      type?: 'DIRECT' | 'GROUP';
    } = {}
  ): Promise<ConversationWithDetails[]> {
    try {
      const { limit = 20, offset = 0, type } = options;

      const whereClause: any = {
        participants: {
          some: {
            userId,
          },
        },
        isActive: true,
      };

      if (type) {
        whereClause.type = type;
      }

      return await prisma.conversation.findMany({
        where: whereClause,
        include: {
          participants: {
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
          },
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
          group: {
            include: {
              members: {
                include: {
                  user: {
                    select: {
                      id: true,
                      username: true,
                      avatar: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
        take: limit,
        skip: offset,
      });
    } catch (error) {
      throw new Error(`Error getting user conversations: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Add participant to conversation
   */
  async addParticipant(conversationId: string, userId: string, role: 'MEMBER' | 'ADMIN' = 'MEMBER'): Promise<boolean> {
    try {
      // Check if conversation exists
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { type: true },
      });

      if (!conversation) {
        throw new Error('Conversation not found');
      }

      // Don't allow adding participants to direct conversations
      if (conversation.type === 'DIRECT') {
        throw new Error('Cannot add participants to direct conversations');
      }

      // Check if user is already a participant
      const existingParticipant = await prisma.conversationParticipant.findUnique({
        where: {
          conversationId_userId: {
            conversationId,
            userId,
          },
        },
      });

      if (existingParticipant) {
        throw new Error('User is already a participant in this conversation');
      }

      // Add participant
      await prisma.conversationParticipant.create({
        data: {
          conversationId,
          userId,
          role,
        },
      });

      return true;
    } catch (error: any) {
      throw new Error(`Error adding participant: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Remove participant from conversation
   */
  async removeParticipant(conversationId: string, userId: string): Promise<boolean> {
    try {
      // Check if conversation exists
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { type: true },
      });

      if (!conversation) {
        throw new Error('Conversation not found');
      }

      // Don't allow removing participants from direct conversations
      if (conversation.type === 'DIRECT') {
        throw new Error('Cannot remove participants from direct conversations');
      }

      // Remove participant
      const result = await prisma.conversationParticipant.delete({
        where: {
          conversationId_userId: {
            conversationId,
            userId,
          },
        },
      });

      return !!result;
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new Error('User is not a participant in this conversation');
      }
      throw new Error(`Error removing participant: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update participant role
   */
  async updateParticipantRole(conversationId: string, userId: string, role: 'MEMBER' | 'ADMIN'): Promise<boolean> {
    try {
      await prisma.conversationParticipant.update({
        where: {
          conversationId_userId: {
            conversationId,
            userId,
          },
        },
        data: { role },
      });

      return true;
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new Error('User is not a participant in this conversation');
      }
      throw new Error(`Error updating participant role: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Mark conversation as read for user
   */
  async markAsRead(conversationId: string, userId: string): Promise<boolean> {
    try {
      await prisma.conversationParticipant.update({
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

      return true;
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new Error('User is not a participant in this conversation');
      }
      throw new Error(`Error marking conversation as read: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get unread conversations count for user
   */
  async getUnreadCount(userId: string): Promise<number> {
    try {
      const conversations = await prisma.conversationParticipant.findMany({
        where: {
          userId,
          conversation: {
            isActive: true,
          },
        },
        include: {
          conversation: {
            include: {
              messages: {
                take: 1,
                orderBy: { createdAt: 'desc' },
                select: { createdAt: true },
              },
            },
          },
        },
      });

      let unreadCount = 0;
      for (const participant of conversations) {
        const lastMessage = participant.conversation.messages[0];
        if (lastMessage && lastMessage.createdAt > participant.lastReadAt) {
          unreadCount++;
        }
      }

      return unreadCount;
    } catch (error) {
      throw new Error(`Error getting unread count: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if user is participant in conversation
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
        select: { id: true },
      });

      return !!participant;
    } catch (error) {
      return false;
    }
  }

  /**
   * Archive/Unarchive conversation
   */
  async updateActiveStatus(conversationId: string, isActive: boolean): Promise<boolean> {
    try {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { isActive },
      });

      return true;
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new Error('Conversation not found');
      }
      throw new Error(`Error updating conversation status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete conversation (soft delete)
   */
  async delete(conversationId: string): Promise<boolean> {
    try {
      await prisma.$transaction(async (tx: any) => {
        // Mark conversation as inactive
        await tx.conversation.update({
          where: { id: conversationId },
          data: { isActive: false },
        });

        // Mark all messages as deleted
        await tx.message.updateMany({
          where: { conversationId },
          data: { isDeleted: true, deletedAt: new Date() },
        });
      });

      return true;
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new Error('Conversation not found');
      }
      throw new Error(`Error deleting conversation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get conversation statistics
   */
  async getConversationStats(conversationId: string): Promise<{
    totalMessages: number;
    totalParticipants: number;
    createdAt: Date;
    lastActivity: Date | null;
  }> {
    try {
      const [conversation, totalMessages, totalParticipants, lastMessage] = await Promise.all([
        prisma.conversation.findUnique({
          where: { id: conversationId },
          select: { createdAt: true },
        }),
        prisma.message.count({
          where: { conversationId, isDeleted: false },
        }),
        prisma.conversationParticipant.count({
          where: { conversationId },
        }),
        prisma.message.findFirst({
          where: { conversationId, isDeleted: false },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
      ]);

      if (!conversation) {
        throw new Error('Conversation not found');
      }

      return {
        totalMessages,
        totalParticipants,
        createdAt: conversation.createdAt,
        lastActivity: lastMessage?.createdAt || null,
      };
    } catch (error) {
      throw new Error(`Error getting conversation stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Export singleton instance
export const conversationRepository = new ConversationRepository();
