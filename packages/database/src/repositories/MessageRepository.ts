import { Prisma } from '@prisma/client';
import { prisma } from '../client';
import { MessageWithDetails } from '../types';

export class MessageRepository {
  /**
   * Create a new message
   */
  async create(messageData: {
    conversationId: string;
    senderId: string;
    content?: string;
    type?: 'TEXT' | 'IMAGE' | 'FILE' | 'AUDIO' | 'VIDEO' | 'SYSTEM';
    metadata?: any;
    replyToId?: string;
    attachments?: Array<{
      fileUploadId: string;
    }>;
  }): Promise<MessageWithDetails> {
    try {
      return await prisma.$transaction(async (tx: any) => {
        // Create the message
        const message = await tx.message.create({
          data: {
            conversationId: messageData.conversationId,
            senderId: messageData.senderId,
            content: messageData.content,
            type: messageData.type || 'TEXT',
            metadata: messageData.metadata,
            replyToId: messageData.replyToId,
            attachments: messageData.attachments ? {
              create: messageData.attachments,
            } : undefined,
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
            reactions: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                  },
                },
              },
            },
            attachments: {
              include: {
                fileUpload: true,
              },
            },
            replyTo: {
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
        });

        // Update conversation's updatedAt timestamp
        await tx.conversation.update({
          where: { id: messageData.conversationId },
          data: { updatedAt: new Date() },
        });

        return message;
      });
    } catch (error: any) {
      throw new Error(`Error creating message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Find message by ID
   */
  async findById(id: string): Promise<MessageWithDetails | null> {
    try {
      return await prisma.message.findUnique({
        where: { id },
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
          reactions: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                },
              },
            },
          },
          attachments: {
            include: {
              fileUpload: true,
            },
          },
          replyTo: {
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
      });
    } catch (error) {
      throw new Error(`Error finding message by ID: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get messages for a conversation with pagination
   */
  async getConversationMessages(
    conversationId: string,
    options: {
      limit?: number;
      cursor?: string;
      before?: Date;
      after?: Date;
      includeDeleted?: boolean;
    } = {}
  ): Promise<MessageWithDetails[]> {
    try {
      const { limit = 50, cursor, before, after, includeDeleted = false } = options;

      const whereClause: any = {
        conversationId,
      };

      if (!includeDeleted) {
        whereClause.isDeleted = false;
      }

      if (before) {
        whereClause.createdAt = { ...whereClause.createdAt, lt: before };
      }

      if (after) {
        whereClause.createdAt = { ...whereClause.createdAt, gt: after };
      }

      if (cursor) {
        whereClause.id = { lt: cursor };
      }

      return await prisma.message.findMany({
        where: whereClause,
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
          reactions: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                },
              },
            },
          },
          attachments: {
            include: {
              fileUpload: true,
            },
          },
          replyTo: {
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
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
    } catch (error) {
      throw new Error(`Error getting conversation messages: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update message content
   */
  async update(id: string, content: string, metadata?: any): Promise<MessageWithDetails | null> {
    try {
      return await prisma.message.update({
        where: { id },
        data: {
          content,
          metadata,
          isEdited: true,
          editedAt: new Date(),
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
          reactions: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                },
              },
            },
          },
          attachments: {
            include: {
              fileUpload: true,
            },
          },
          replyTo: {
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
      });
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new Error('Message not found');
      }
      throw new Error(`Error updating message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Soft delete message
   */
  async softDelete(id: string): Promise<MessageWithDetails | null> {
    try {
      return await prisma.message.update({
        where: { id },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
          content: 'This message has been deleted',
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
          reactions: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                },
              },
            },
          },
          attachments: {
            include: {
              fileUpload: true,
            },
          },
          replyTo: {
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
      });
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new Error('Message not found');
      }
      throw new Error(`Error deleting message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Hard delete message
   */
  async hardDelete(id: string): Promise<boolean> {
    try {
      await prisma.$transaction(async (tx: any) => {
        // Delete message reactions
        await tx.messageReaction.deleteMany({
          where: { messageId: id },
        });

        // Delete message attachments
        await tx.messageAttachment.deleteMany({
          where: { messageId: id },
        });

        // Delete the message
        await tx.message.delete({
          where: { id },
        });
      });

      return true;
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new Error('Message not found');
      }
      throw new Error(`Error hard deleting message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Add reaction to message
   */
  async addReaction(messageId: string, userId: string, emoji: string): Promise<boolean> {
    try {
      // Check if user already reacted with this emoji
      const existingReaction = await prisma.messageReaction.findUnique({
        where: {
          messageId_userId_emoji: {
            messageId,
            userId,
            emoji,
          },
        },
      });

      if (existingReaction) {
        // Remove reaction if it already exists (toggle behavior)
        await prisma.messageReaction.delete({
          where: {
            messageId_userId_emoji: {
              messageId,
              userId,
              emoji,
            },
          },
        });
        return false; // Reaction removed
      }

      // Add new reaction
      await prisma.messageReaction.create({
        data: {
          messageId,
          userId,
          emoji,
        },
      });

      return true; // Reaction added
    } catch (error: any) {
      throw new Error(`Error adding reaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Remove reaction from message
   */
  async removeReaction(messageId: string, userId: string, emoji: string): Promise<boolean> {
    try {
      await prisma.messageReaction.delete({
        where: {
          messageId_userId_emoji: {
            messageId,
            userId,
            emoji,
          },
        },
      });

      return true;
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new Error('Reaction not found');
      }
      throw new Error(`Error removing reaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Search messages
   */
  async searchMessages(
    query: string,
    options: {
      userId?: string;
      conversationId?: string;
      type?: 'TEXT' | 'IMAGE' | 'FILE' | 'AUDIO' | 'VIDEO' | 'SYSTEM';
      limit?: number;
      offset?: number;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<MessageWithDetails[]> {
    try {
      const { userId, conversationId, type, limit = 20, offset = 0, startDate, endDate } = options;

      const whereClause: any = {
        content: {
          contains: query,
          mode: 'insensitive',
        },
        isDeleted: false,
      };

      if (userId) {
        // Only search in conversations where user is a participant
        whereClause.conversation = {
          participants: {
            some: {
              userId,
            },
          },
        };
      }

      if (conversationId) {
        whereClause.conversationId = conversationId;
      }

      if (type) {
        whereClause.type = type;
      }

      if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate) {
          whereClause.createdAt.gte = startDate;
        }
        if (endDate) {
          whereClause.createdAt.lte = endDate;
        }
      }

      return await prisma.message.findMany({
        where: whereClause,
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
          reactions: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                },
              },
            },
          },
          attachments: {
            include: {
              fileUpload: true,
            },
          },
          replyTo: {
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
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      });
    } catch (error) {
      throw new Error(`Error searching messages: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get message statistics
   */
  async getMessageStats(options: {
    conversationId?: string;
    userId?: string;
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<{
    totalMessages: number;
    messagesByType: Record<string, number>;
    messagesWithAttachments: number;
    messagesWithReactions: number;
  }> {
    try {
      const { conversationId, userId, startDate, endDate } = options;

      const whereClause: any = {
        isDeleted: false,
      };

      if (conversationId) {
        whereClause.conversationId = conversationId;
      }

      if (userId) {
        whereClause.senderId = userId;
      }

      if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate) {
          whereClause.createdAt.gte = startDate;
        }
        if (endDate) {
          whereClause.createdAt.lte = endDate;
        }
      }

      const [totalMessages, messagesByType, messagesWithAttachments, messagesWithReactions] = await Promise.all([
        prisma.message.count({ where: whereClause }),
        prisma.message.groupBy({
          by: ['type'],
          where: whereClause,
          _count: true,
        }),
        prisma.message.count({
          where: {
            ...whereClause,
            attachments: {
              some: {},
            },
          },
        }),
        prisma.message.count({
          where: {
            ...whereClause,
            reactions: {
              some: {},
            },
          },
        }),
      ]);

      const messageTypeStats = messagesByType.reduce((acc: Record<string, number>, item: any) => {
        acc[item.type] = item._count;
        return acc;
      }, {} as Record<string, number>);

      return {
        totalMessages,
        messagesByType: messageTypeStats,
        messagesWithAttachments,
        messagesWithReactions,
      };
    } catch (error) {
      throw new Error(`Error getting message stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get recent messages for user
   */
  async getRecentMessages(userId: string, limit = 10): Promise<MessageWithDetails[]> {
    try {
      return await prisma.message.findMany({
        where: {
          conversation: {
            participants: {
              some: {
                userId,
              },
            },
          },
          isDeleted: false,
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
          reactions: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                },
              },
            },
          },
          attachments: {
            include: {
              fileUpload: true,
            },
          },
          replyTo: {
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
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
    } catch (error) {
      throw new Error(`Error getting recent messages: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get unread messages count for user in a conversation
   */
  async getUnreadMessagesCount(conversationId: string, userId: string): Promise<number> {
    try {
      // Get user's last read timestamp
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

      // Count messages after last read timestamp
      return await prisma.message.count({
        where: {
          conversationId,
          createdAt: {
            gt: participant.lastReadAt,
          },
          senderId: {
            not: userId, // Don't count user's own messages
          },
          isDeleted: false,
        },
      });
    } catch (error) {
      throw new Error(`Error getting unread messages count: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get messages with mentions for a user
   */
  async getMessagesWithMentions(userId: string, options: {
    limit?: number;
    offset?: number;
    conversationId?: string;
  } = {}): Promise<MessageWithDetails[]> {
    try {
      const { limit = 20, offset = 0, conversationId } = options;

      const whereClause: any = {
        content: {
          contains: `@${userId}`, // Simple mention detection
          mode: 'insensitive',
        },
        isDeleted: false,
        conversation: {
          participants: {
            some: {
              userId,
            },
          },
        },
      };

      if (conversationId) {
        whereClause.conversationId = conversationId;
      }

      return await prisma.message.findMany({
        where: whereClause,
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
          reactions: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                },
              },
            },
          },
          attachments: {
            include: {
              fileUpload: true,
            },
          },
          replyTo: {
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
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      });
    } catch (error) {
      throw new Error(`Error getting messages with mentions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Bulk delete messages
   */
  async bulkDelete(messageIds: string[], hardDelete = false): Promise<number> {
    try {
      if (hardDelete) {
        return await prisma.$transaction(async (tx: any) => {
          // Delete reactions
          await tx.messageReaction.deleteMany({
            where: { messageId: { in: messageIds } },
          });

          // Delete attachments
          await tx.messageAttachment.deleteMany({
            where: { messageId: { in: messageIds } },
          });

          // Delete messages
          const result = await tx.message.deleteMany({
            where: { id: { in: messageIds } },
          });

          return result.count;
        });
      } else {
        // Soft delete
        const result = await prisma.message.updateMany({
          where: { id: { in: messageIds } },
          data: {
            isDeleted: true,
            deletedAt: new Date(),
            content: 'This message has been deleted',
          },
        });

        return result.count;
      }
    } catch (error) {
      throw new Error(`Error bulk deleting messages: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Export singleton instance
export const messageRepository = new MessageRepository();
