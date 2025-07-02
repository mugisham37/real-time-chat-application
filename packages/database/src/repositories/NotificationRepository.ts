import { Prisma } from '@prisma/client';
import { prisma } from '../client';

export class NotificationRepository {
  /**
   * Create a new notification
   */
  async create(notificationData: {
    userId: string;
    type: 'MESSAGE' | 'GROUP_INVITATION' | 'GROUP_JOIN_REQUEST' | 'MENTION' | 'REACTION' | 'SYSTEM';
    title: string;
    message: string;
    data?: any;
  }) {
    try {
      return await prisma.notification.create({
        data: notificationData,
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
    } catch (error) {
      throw new Error(`Error creating notification: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Find notification by ID
   */
  async findById(id: string) {
    try {
      return await prisma.notification.findUnique({
        where: { id },
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
    } catch (error) {
      throw new Error(`Error finding notification by ID: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get user notifications with pagination
   */
  async getUserNotifications(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      isRead?: boolean;
      type?: 'MESSAGE' | 'GROUP_INVITATION' | 'GROUP_JOIN_REQUEST' | 'MENTION' | 'REACTION' | 'SYSTEM';
    } = {}
  ) {
    try {
      const { limit = 20, offset = 0, isRead, type } = options;

      const whereClause: any = { userId };

      if (isRead !== undefined) {
        whereClause.isRead = isRead;
      }

      if (type) {
        whereClause.type = type;
      }

      return await prisma.notification.findMany({
        where: whereClause,
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
        take: limit,
        skip: offset,
      });
    } catch (error) {
      throw new Error(`Error getting user notifications: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Count unread notifications
   */
  async countUnreadNotifications(userId: string): Promise<number> {
    try {
      return await prisma.notification.count({
        where: {
          userId,
          isRead: false,
        },
      });
    } catch (error) {
      throw new Error(`Error counting unread notifications: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(id: string, userId: string) {
    try {
      return await prisma.notification.update({
        where: {
          id,
          userId, // Ensure user can only mark their own notifications
        },
        data: {
          isRead: true,
          readAt: new Date(),
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
      });
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new Error('Notification not found or access denied');
      }
      throw new Error(`Error marking notification as read: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(userId: string): Promise<{ count: number }> {
    try {
      const result = await prisma.notification.updateMany({
        where: {
          userId,
          isRead: false,
        },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });

      return { count: result.count };
    } catch (error) {
      throw new Error(`Error marking all notifications as read: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete notification
   */
  async delete(id: string, userId: string): Promise<boolean> {
    try {
      await prisma.notification.delete({
        where: {
          id,
          userId, // Ensure user can only delete their own notifications
        },
      });

      return true;
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new Error('Notification not found or access denied');
      }
      throw new Error(`Error deleting notification: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete all notifications for a user
   */
  async deleteAll(userId: string): Promise<{ count: number }> {
    try {
      const result = await prisma.notification.deleteMany({
        where: { userId },
      });

      return { count: result.count };
    } catch (error) {
      throw new Error(`Error deleting all notifications: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get notification statistics for a user
   */
  async getNotificationStats(userId: string): Promise<{
    total: number;
    unread: number;
    byType: Record<string, number>;
  }> {
    try {
      const [total, unread, byType] = await Promise.all([
        prisma.notification.count({
          where: { userId },
        }),
        prisma.notification.count({
          where: { userId, isRead: false },
        }),
        prisma.notification.groupBy({
          by: ['type'],
          where: { userId },
          _count: true,
        }),
      ]);

      const typeStats = byType.reduce((acc: Record<string, number>, item: any) => {
        acc[item.type] = item._count;
        return acc;
      }, {});

      return {
        total,
        unread,
        byType: typeStats,
      };
    } catch (error) {
      throw new Error(`Error getting notification stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Bulk create notifications
   */
  async bulkCreate(notifications: Array<{
    userId: string;
    type: 'MESSAGE' | 'GROUP_INVITATION' | 'GROUP_JOIN_REQUEST' | 'MENTION' | 'REACTION' | 'SYSTEM';
    title: string;
    message: string;
    data?: any;
  }>) {
    try {
      return await prisma.notification.createMany({
        data: notifications,
        skipDuplicates: true,
      });
    } catch (error) {
      throw new Error(`Error bulk creating notifications: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Clean up old notifications (older than specified days)
   */
  async cleanupOldNotifications(daysOld = 30): Promise<{ count: number }> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const result = await prisma.notification.deleteMany({
        where: {
          createdAt: {
            lt: cutoffDate,
          },
          isRead: true, // Only delete read notifications
        },
      });

      return { count: result.count };
    } catch (error) {
      throw new Error(`Error cleaning up old notifications: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Export singleton instance
export const notificationRepository = new NotificationRepository();
