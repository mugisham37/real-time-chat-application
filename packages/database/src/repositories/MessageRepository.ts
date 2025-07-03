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
  async update(id: string, updateData: {
    content?: string | null;
    metadata?: any;
    isEdited?: boolean;
    editedAt?: Date;
    isDeleted?: boolean;
    deletedAt?: Date;
    updatedAt?: Date;
  }): Promise<MessageWithDetails | null> {
    try {
      return await prisma.message.update({
        where: { id },
        data: {
          content: updateData.content,
          metadata: updateData.metadata,
          isEdited: updateData.isEdited,
          editedAt: updateData.editedAt,
          isDeleted: updateData.isDeleted,
          deletedAt: updateData.deletedAt,
          updatedAt: updateData.updatedAt || new Date(),
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
   * Find messages by conversation ID with pagination
   */
  async findByConversationId(
    conversationId: string,
    limit = 50,
    before?: Date
  ): Promise<MessageWithDetails[]> {
    try {
      const whereClause: any = {
        conversationId,
        isDeleted: false,
      };

      if (before) {
        whereClause.createdAt = { lt: before };
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
      throw new Error(`Error finding messages by conversation ID: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Mark messages as read by conversation
   */
  async markAsReadByConversation(conversationId: string, userId: string): Promise<void> {
    try {
      // Update the conversation participant's lastReadAt timestamp
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
    } catch (error) {
      throw new Error(`Error marking messages as read: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get unread message count for user across all conversations
   */
  async getUnreadCountForUser(userId: string): Promise<number> {
    try {
      // Get all conversations where user is a participant
      const participantData = await prisma.conversationParticipant.findMany({
        where: {
          userId,
          conversation: {
            isActive: true,
          },
        },
        select: {
          conversationId: true,
          lastReadAt: true,
        },
      });

      let totalUnreadCount = 0;

      // For each conversation, count unread messages
      for (const participant of participantData) {
        const unreadCount = await prisma.message.count({
          where: {
            conversationId: participant.conversationId,
            createdAt: {
              gt: participant.lastReadAt,
            },
            senderId: {
              not: userId, // Don't count user's own messages
            },
            isDeleted: false,
          },
        });

        totalUnreadCount += unreadCount;
      }

      return totalUnreadCount;
    } catch (error) {
      throw new Error(`Error getting unread count for user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get message count by conversation
   */
  async getMessageCountByConversation(conversationId: string): Promise<number> {
    try {
      return await prisma.message.count({
        where: {
          conversationId,
          isDeleted: false,
        },
      });
    } catch (error) {
      throw new Error(`Error getting message count: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get last message by conversation
   */
  async getLastMessageByConversation(conversationId: string): Promise<MessageWithDetails | null> {
    try {
      return await prisma.message.findFirst({
        where: {
          conversationId,
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
      });
    } catch (error) {
      throw new Error(`Error getting last message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get message count by conversation and date range
   */
  async getMessageCountByConversationAndDate(
    conversationId: string,
    startDate: Date,
    endDate?: Date
  ): Promise<number> {
    try {
      const whereClause: any = {
        conversationId,
        isDeleted: false,
        createdAt: {
          gte: startDate,
        },
      };

      if (endDate) {
        whereClause.createdAt.lte = endDate;
      }

      return await prisma.message.count({
        where: whereClause,
      });
    } catch (error) {
      throw new Error(`Error getting message count by date: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Mark message as read by specific user
   */
  async markAsRead(messageId: string, userId: string): Promise<MessageWithDetails | null> {
    try {
      // For this implementation, we'll update the conversation participant's lastReadAt
      // since individual message read tracking would require a separate table
      const message = await this.findById(messageId);
      if (!message) {
        throw new Error('Message not found');
      }

      // Update the conversation participant's lastReadAt timestamp
      await prisma.conversationParticipant.update({
        where: {
          conversationId_userId: {
            conversationId: message.conversationId,
            userId,
          },
        },
        data: {
          lastReadAt: new Date(),
        },
      });

      return message;
    } catch (error) {
      throw new Error(`Error marking message as read: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Search messages with enhanced options
   */
  async search(options: {
    query: string;
    userId: string;
    conversationId?: string;
    limit?: number;
    skip?: number;
    startDate?: Date;
    endDate?: Date;
  }): Promise<MessageWithDetails[]> {
    try {
      const { query, userId, conversationId, limit = 20, skip = 0, startDate, endDate } = options;

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
        skip: skip,
      });
    } catch (error) {
      throw new Error(`Error searching messages: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get message count by type for a conversation
   */
  async getMessageCountByType(conversationId: string): Promise<Record<string, number>> {
    try {
      const counts = await prisma.message.groupBy({
        by: ['type'],
        where: { 
          conversationId,
          isDeleted: false 
        },
        _count: { type: true }
      });
      
      return counts.reduce((acc, item) => {
        acc[item.type] = item._count.type;
        return acc;
      }, {} as Record<string, number>);
    } catch (error) {
      throw new Error(`Error getting message count by type: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get message count by user for a conversation
   */
  async getMessageCountByUser(conversationId: string): Promise<Record<string, number>> {
    try {
      const counts = await prisma.message.groupBy({
        by: ['senderId'],
        where: { 
          conversationId,
          isDeleted: false 
        },
        _count: { senderId: true }
      });
      
      return counts.reduce((acc, item) => {
        acc[item.senderId] = item._count.senderId;
        return acc;
      }, {} as Record<string, number>);
    } catch (error) {
      throw new Error(`Error getting message count by user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get message count by sender
   */
  async getMessageCountBySender(senderId: string): Promise<number> {
    try {
      return await prisma.message.count({
        where: { 
          senderId,
          isDeleted: false 
        }
      });
    } catch (error) {
      throw new Error(`Error getting message count by sender: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get message count by recipient (messages received by user)
   */
  async getMessageCountByRecipient(userId: string): Promise<number> {
    try {
      return await prisma.message.count({
        where: {
          conversation: {
            participants: {
              some: { userId }
            }
          },
          senderId: { not: userId },
          isDeleted: false
        }
      });
    } catch (error) {
      throw new Error(`Error getting message count by recipient: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get message count by type for a specific user
   */
  async getMessageCountByTypeForUser(userId: string, type: 'TEXT' | 'IMAGE' | 'FILE' | 'AUDIO' | 'VIDEO' | 'SYSTEM'): Promise<number> {
    try {
      return await prisma.message.count({
        where: {
          senderId: userId,
          type,
          isDeleted: false
        }
      });
    } catch (error) {
      throw new Error(`Error getting message count by type for user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get most active conversation for a user
   */
  async getMostActiveConversationForUser(userId: string): Promise<string | null> {
    try {
      const result = await prisma.message.groupBy({
        by: ['conversationId'],
        where: { 
          senderId: userId,
          isDeleted: false 
        },
        _count: { conversationId: true },
        orderBy: { _count: { conversationId: 'desc' } },
        take: 1
      });
      
      return result[0]?.conversationId || null;
    } catch (error) {
      throw new Error(`Error getting most active conversation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get favorite reaction for a user
   */
  async getFavoriteReactionForUser(userId: string): Promise<string | null> {
    try {
      const result = await prisma.messageReaction.groupBy({
        by: ['emoji'],
        where: { userId },
        _count: { emoji: true },
        orderBy: { _count: { emoji: 'desc' } },
        take: 1
      });
      
      return result[0]?.emoji || null;
    } catch (error) {
      throw new Error(`Error getting favorite reaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get message count by user and date
   */
  async getMessageCountByUserAndDate(userId: string, date: Date): Promise<number> {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      return await prisma.message.count({
        where: {
          senderId: userId,
          createdAt: {
            gte: startOfDay,
            lte: endOfDay
          },
          isDeleted: false
        }
      });
    } catch (error) {
      throw new Error(`Error getting message count by user and date: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
