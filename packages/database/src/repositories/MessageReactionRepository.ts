import { Prisma } from '@prisma/client';
import { prisma } from '../client';

export class MessageReactionRepository {
  /**
   * Add or toggle a reaction to a message
   */
  async addReaction(reactionData: {
    messageId: string;
    userId: string;
    emoji: string;
  }): Promise<{ added: boolean; reaction?: any }> {
    try {
      // Check if reaction already exists
      const existingReaction = await prisma.messageReaction.findUnique({
        where: {
          messageId_userId_emoji: {
            messageId: reactionData.messageId,
            userId: reactionData.userId,
            emoji: reactionData.emoji,
          },
        },
      });

      if (existingReaction) {
        // Remove existing reaction (toggle behavior)
        await prisma.messageReaction.delete({
          where: {
            messageId_userId_emoji: {
              messageId: reactionData.messageId,
              userId: reactionData.userId,
              emoji: reactionData.emoji,
            },
          },
        });
        return { added: false };
      }

      // Add new reaction
      const reaction = await prisma.messageReaction.create({
        data: reactionData,
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
          message: {
            select: {
              id: true,
              content: true,
              senderId: true,
            },
          },
        },
      });

      return { added: true, reaction };
    } catch (error) {
      throw new Error(`Error adding reaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Remove a specific reaction
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
   * Get all reactions for a message
   */
  async getMessageReactions(messageId: string) {
    try {
      return await prisma.messageReaction.findMany({
        where: { messageId },
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
        orderBy: { createdAt: 'asc' },
      });
    } catch (error) {
      throw new Error(`Error getting message reactions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get reactions grouped by emoji for a message
   */
  async getMessageReactionsGrouped(messageId: string): Promise<Record<string, any[]>> {
    try {
      const reactions = await this.getMessageReactions(messageId);
      
      return reactions.reduce((grouped: Record<string, any[]>, reaction: any) => {
        if (!grouped[reaction.emoji]) {
          grouped[reaction.emoji] = [];
        }
        grouped[reaction.emoji].push(reaction);
        return grouped;
      }, {});
    } catch (error) {
      throw new Error(`Error getting grouped reactions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get reaction counts for a message
   */
  async getMessageReactionCounts(messageId: string): Promise<Record<string, number>> {
    try {
      const reactionCounts = await prisma.messageReaction.groupBy({
        by: ['emoji'],
        where: { messageId },
        _count: { emoji: true },
      });

      return reactionCounts.reduce((counts: Record<string, number>, item: any) => {
        counts[item.emoji] = item._count.emoji;
        return counts;
      }, {});
    } catch (error) {
      throw new Error(`Error getting reaction counts: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get user's reactions for a message
   */
  async getUserReactionsForMessage(messageId: string, userId: string) {
    try {
      return await prisma.messageReaction.findMany({
        where: {
          messageId,
          userId,
        },
        orderBy: { createdAt: 'asc' },
      });
    } catch (error) {
      throw new Error(`Error getting user reactions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get all reactions by a user
   */
  async getUserReactions(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      emoji?: string;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ) {
    try {
      const { limit = 50, offset = 0, emoji, startDate, endDate } = options;

      const whereClause: any = { userId };

      if (emoji) {
        whereClause.emoji = emoji;
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

      return await prisma.messageReaction.findMany({
        where: whereClause,
        include: {
          message: {
            select: {
              id: true,
              content: true,
              senderId: true,
              conversationId: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      });
    } catch (error) {
      throw new Error(`Error getting user reactions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if user has reacted to a message with specific emoji
   */
  async hasUserReacted(messageId: string, userId: string, emoji: string): Promise<boolean> {
    try {
      const reaction = await prisma.messageReaction.findUnique({
        where: {
          messageId_userId_emoji: {
            messageId,
            userId,
            emoji,
          },
        },
      });
      return !!reaction;
    } catch (error) {
      return false;
    }
  }

  /**
   * Remove all reactions from a message
   */
  async removeAllMessageReactions(messageId: string): Promise<{ count: number }> {
    try {
      const result = await prisma.messageReaction.deleteMany({
        where: { messageId },
      });
      return { count: result.count };
    } catch (error) {
      throw new Error(`Error removing all reactions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Remove all reactions by a user
   */
  async removeAllUserReactions(userId: string): Promise<{ count: number }> {
    try {
      const result = await prisma.messageReaction.deleteMany({
        where: { userId },
      });
      return { count: result.count };
    } catch (error) {
      throw new Error(`Error removing user reactions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get reaction statistics
   */
  async getReactionStats(options: {
    messageId?: string;
    userId?: string;
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<{
    totalReactions: number;
    uniqueEmojis: number;
    topEmojis: Array<{ emoji: string; count: number }>;
    uniqueUsers: number;
  }> {
    try {
      const { messageId, userId, startDate, endDate } = options;

      const whereClause: any = {};

      if (messageId) {
        whereClause.messageId = messageId;
      }

      if (userId) {
        whereClause.userId = userId;
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

      const [totalReactions, emojiGroups, userGroups] = await Promise.all([
        prisma.messageReaction.count({ where: whereClause }),
        prisma.messageReaction.groupBy({
          by: ['emoji'],
          where: whereClause,
          _count: { emoji: true },
          orderBy: { _count: { emoji: 'desc' } },
          take: 10,
        }),
        prisma.messageReaction.groupBy({
          by: ['userId'],
          where: whereClause,
        }),
      ]);

      const topEmojis = emojiGroups.map((group: any) => ({
        emoji: group.emoji,
        count: group._count.emoji,
      }));

      return {
        totalReactions,
        uniqueEmojis: emojiGroups.length,
        topEmojis,
        uniqueUsers: userGroups.length,
      };
    } catch (error) {
      throw new Error(`Error getting reaction stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Bulk add reactions
   */
  async bulkAddReactions(reactions: Array<{
    messageId: string;
    userId: string;
    emoji: string;
  }>): Promise<{ count: number }> {
    try {
      const result = await prisma.messageReaction.createMany({
        data: reactions,
        skipDuplicates: true,
      });
      return { count: result.count };
    } catch (error) {
      throw new Error(`Error bulk adding reactions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get most popular emojis across all messages
   */
  async getPopularEmojis(limit = 10): Promise<Array<{ emoji: string; count: number }>> {
    try {
      const emojiGroups = await prisma.messageReaction.groupBy({
        by: ['emoji'],
        _count: { emoji: true },
        orderBy: { _count: { emoji: 'desc' } },
        take: limit,
      });

      return emojiGroups.map((group: any) => ({
        emoji: group.emoji,
        count: group._count.emoji,
      }));
    } catch (error) {
      throw new Error(`Error getting popular emojis: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Export singleton instance
export const messageReactionRepository = new MessageReactionRepository();
