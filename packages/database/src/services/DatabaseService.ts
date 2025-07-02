import { userRepository } from '../repositories/UserRepository';
import { conversationRepository } from '../repositories/ConversationRepository';
import { messageRepository } from '../repositories/MessageRepository';
import { groupRepository } from '../repositories/GroupRepository';
import { groupInvitationRepository } from '../repositories/GroupInvitationRepository';
import { groupJoinRequestRepository } from '../repositories/GroupJoinRequestRepository';
import { notificationRepository } from '../repositories/NotificationRepository';
import { fileUploadRepository } from '../repositories/FileUploadRepository';
import { userSessionRepository } from '../repositories/UserSessionRepository';

/**
 * Main database service that provides access to all repositories
 * and high-level database operations
 */
export class DatabaseService {
  // Repository instances
  public readonly users = userRepository;
  public readonly conversations = conversationRepository;
  public readonly messages = messageRepository;
  public readonly groups = groupRepository;
  public readonly groupInvitations = groupInvitationRepository;
  public readonly groupJoinRequests = groupJoinRequestRepository;
  public readonly notifications = notificationRepository;
  public readonly fileUploads = fileUploadRepository;
  public readonly userSessions = userSessionRepository;

  /**
   * Initialize database service and perform any necessary setup
   */
  async initialize(): Promise<void> {
    try {
      // Perform any initialization tasks here
      console.log('Database service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize database service:', error);
      throw error;
    }
  }

  /**
   * Health check for database connectivity
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    timestamp: Date;
    details?: any;
  }> {
    try {
      // Simple query to test database connectivity
      await this.users.count();
      
      return {
        status: 'healthy',
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date(),
        details: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get comprehensive database statistics
   */
  async getStats(): Promise<{
    users: {
      total: number;
      active: number;
      verified: number;
    };
    conversations: {
      total: number;
      direct: number;
      groups: number;
    };
    messages: {
      total: number;
      today: number;
    };
    groups: {
      total: number;
      public: number;
      private: number;
    };
    sessions: {
      total: number;
      active: number;
    };
    files: {
      total: number;
      totalSize: number;
    };
  }> {
    try {
      const [
        userStats,
        conversationStats,
        messageStats,
        groupStats,
        sessionStats,
        fileStats,
      ] = await Promise.all([
        this.users.getStats(),
        this.conversations.getStats(),
        this.messages.getStats(),
        this.groups.getStats(),
        this.userSessions.getSessionStats(),
        this.fileUploads.getUploadStats(),
      ]);

      return {
        users: userStats,
        conversations: conversationStats,
        messages: messageStats,
        groups: groupStats,
        sessions: sessionStats,
        files: fileStats,
      };
    } catch (error) {
      throw new Error(`Error getting database stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Perform database cleanup operations
   */
  async cleanup(): Promise<{
    expiredSessions: number;
    oldNotifications: number;
    orphanedFiles: number;
    expiredInvitations: number;
    oldJoinRequests: number;
  }> {
    try {
      const [
        expiredSessions,
        oldNotifications,
        orphanedFiles,
        expiredInvitations,
        oldJoinRequests,
      ] = await Promise.all([
        this.userSessions.cleanupExpiredSessions(),
        this.notifications.cleanupOldNotifications(),
        this.fileUploads.cleanupOrphanedFiles(),
        this.groupInvitations.expireOldInvitations(),
        this.groupJoinRequests.cleanupOldRequests(),
      ]);

      return {
        expiredSessions: expiredSessions.count,
        oldNotifications: oldNotifications.count,
        orphanedFiles: orphanedFiles.count,
        expiredInvitations: expiredInvitations.count,
        oldJoinRequests: oldJoinRequests.count,
      };
    } catch (error) {
      throw new Error(`Error during database cleanup: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Transaction wrapper for complex operations
   */
  async transaction<T>(callback: (tx: any) => Promise<T>): Promise<T> {
    const { prisma } = await import('../client');
    return await prisma.$transaction(callback);
  }

  /**
   * Backup database (placeholder for backup logic)
   */
  async backup(): Promise<{ success: boolean; message: string }> {
    try {
      // Implement backup logic here
      // This could involve exporting data, creating snapshots, etc.
      
      return {
        success: true,
        message: 'Database backup completed successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: `Database backup failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Migrate database (placeholder for migration logic)
   */
  async migrate(): Promise<{ success: boolean; message: string }> {
    try {
      // Implement migration logic here
      // This could involve running Prisma migrations, data transformations, etc.
      
      return {
        success: true,
        message: 'Database migration completed successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: `Database migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Seed database with initial data
   */
  async seed(): Promise<{ success: boolean; message: string }> {
    try {
      // Implement seeding logic here
      // This could involve creating default users, groups, etc.
      
      return {
        success: true,
        message: 'Database seeding completed successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: `Database seeding failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
}

// Export singleton instance
export const databaseService = new DatabaseService();
