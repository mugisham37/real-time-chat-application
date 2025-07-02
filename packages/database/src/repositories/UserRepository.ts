import { Prisma } from '@prisma/client';
import { prisma } from '../client';
import { UserWithProfile } from '../types';
import { hashPassword, verifyPassword, generateUniqueUsername } from '../utils';

export class UserRepository {
  /**
   * Create a new user
   */
  async create(userData: {
    email: string;
    username: string;
    password: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
    bio?: string;
  }): Promise<UserWithProfile> {
    try {
      // Hash password
      const hashedPassword = await hashPassword(userData.password);
      
      // Generate unique username if needed
      const uniqueUsername = await generateUniqueUsername(userData.username);

      const user = await prisma.user.create({
        data: {
          ...userData,
          username: uniqueUsername,
          password: hashedPassword,
        },
        select: {
          id: true,
          email: true,
          username: true,
          firstName: true,
          lastName: true,
          avatar: true,
          bio: true,
          isOnline: true,
          lastSeen: true,
          createdAt: true,
        },
      });

      return user;
    } catch (error: any) {
      if (error?.code === 'P2002') {
        const field = (error.meta?.target as string[])?.join(', ') || 'field';
        throw new Error(`User with this ${field} already exists`);
      }
      throw error;
    }
  }

  /**
   * Find user by ID
   */
  async findById(id: string, includePassword = false): Promise<any | null> {
    try {
      const selectFields: any = {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        avatar: true,
        bio: true,
        isOnline: true,
        lastSeen: true,
        emailVerified: true,
        twoFactorEnabled: true,
        createdAt: true,
        updatedAt: true,
      };

      if (includePassword) {
        selectFields.password = true;
        selectFields.twoFactorSecret = true;
      }

      return await prisma.user.findUnique({
        where: { id },
        select: selectFields,
      });
    } catch (error) {
      throw new Error(`Error finding user by ID: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string, includePassword = false): Promise<any | null> {
    try {
      const selectFields: any = {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        avatar: true,
        bio: true,
        isOnline: true,
        lastSeen: true,
        emailVerified: true,
        twoFactorEnabled: true,
        createdAt: true,
        updatedAt: true,
      };

      if (includePassword) {
        selectFields.password = true;
        selectFields.twoFactorSecret = true;
      }

      return await prisma.user.findUnique({
        where: { email },
        select: selectFields,
      });
    } catch (error) {
      throw new Error(`Error finding user by email: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Find user by username
   */
  async findByUsername(username: string, includePassword = false): Promise<any | null> {
    try {
      const selectFields: any = {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        avatar: true,
        bio: true,
        isOnline: true,
        lastSeen: true,
        emailVerified: true,
        twoFactorEnabled: true,
        createdAt: true,
        updatedAt: true,
      };

      if (includePassword) {
        selectFields.password = true;
        selectFields.twoFactorSecret = true;
      }

      return await prisma.user.findUnique({
        where: { username },
        select: selectFields,
      });
    } catch (error) {
      throw new Error(`Error finding user by username: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Find user by email or username
   */
  async findByEmailOrUsername(emailOrUsername: string, includePassword = false): Promise<any | null> {
    try {
      const selectFields: any = {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        avatar: true,
        bio: true,
        isOnline: true,
        lastSeen: true,
        emailVerified: true,
        twoFactorEnabled: true,
        createdAt: true,
        updatedAt: true,
      };

      if (includePassword) {
        selectFields.password = true;
        selectFields.twoFactorSecret = true;
      }

      return await prisma.user.findFirst({
        where: {
          OR: [
            { email: emailOrUsername },
            { username: emailOrUsername },
          ],
        },
        select: selectFields,
      });
    } catch (error) {
      throw new Error(`Error finding user by email or username: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update user
   */
  async update(id: string, updateData: Partial<{
    email: string;
    username: string;
    firstName: string;
    lastName: string;
    avatar: string;
    bio: string;
    emailVerified: Date;
    twoFactorEnabled: boolean;
    twoFactorSecret: string;
  }>): Promise<UserWithProfile | null> {
    try {
      return await prisma.user.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          email: true,
          username: true,
          firstName: true,
          lastName: true,
          avatar: true,
          bio: true,
          isOnline: true,
          lastSeen: true,
          createdAt: true,
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        const field = (error.meta?.target as string[])?.join(', ') || 'field';
        throw new Error(`User with this ${field} already exists`);
      }
      if (error?.code === 'P2025') {
        throw new Error('User not found');
      }
      throw error;
    }
  }

  /**
   * Update user password
   */
  async updatePassword(id: string, newPassword: string): Promise<boolean> {
    try {
      const hashedPassword = await hashPassword(newPassword);
      
      await prisma.user.update({
        where: { id },
        data: { password: hashedPassword },
      });

      return true;
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new Error('User not found');
      }
      throw error;
    }
  }

  /**
   * Verify user password
   */
  async verifyPassword(id: string, password: string): Promise<boolean> {
    try {
      const user = await prisma.user.findUnique({
        where: { id },
        select: { password: true },
      });

      if (!user) {
        throw new Error('User not found');
      }

      return await verifyPassword(password, user.password);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Update user online status
   */
  async updateOnlineStatus(id: string, isOnline: boolean): Promise<UserWithProfile | null> {
    try {
      return await prisma.user.update({
        where: { id },
        data: {
          isOnline,
          lastSeen: new Date(),
        },
        select: {
          id: true,
          email: true,
          username: true,
          firstName: true,
          lastName: true,
          avatar: true,
          bio: true,
          isOnline: true,
          lastSeen: true,
          createdAt: true,
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new Error('User not found');
      }
      throw error;
    }
  }

  /**
   * Search users
   */
  async search(query: string, options: {
    limit?: number;
    offset?: number;
    excludeUserIds?: string[];
  } = {}): Promise<UserWithProfile[]> {
    try {
      const { limit = 20, offset = 0, excludeUserIds = [] } = options;

      const whereClause = {
        AND: [
          {
            OR: [
              { username: { contains: query, mode: Prisma.QueryMode.insensitive } },
              { firstName: { contains: query, mode: Prisma.QueryMode.insensitive } },
              { lastName: { contains: query, mode: Prisma.QueryMode.insensitive } },
            ],
          },
          excludeUserIds.length > 0 ? { id: { notIn: excludeUserIds } } : {},
        ],
      };

      return await prisma.user.findMany({
        where: whereClause,
        select: {
          id: true,
          email: true,
          username: true,
          firstName: true,
          lastName: true,
          avatar: true,
          bio: true,
          isOnline: true,
          lastSeen: true,
          createdAt: true,
        },
        take: limit,
        skip: offset,
        orderBy: [
          { isOnline: 'desc' },
          { username: 'asc' },
        ],
      });
    } catch (error) {
      throw new Error(`Error searching users: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get user statistics
   */
  async getUserStats(id: string): Promise<{
    totalMessages: number;
    totalConversations: number;
    totalGroups: number;
    joinedAt: Date;
  }> {
    try {
      const [user, totalMessages, totalConversations, totalGroups] = await Promise.all([
        prisma.user.findUnique({
          where: { id },
          select: { createdAt: true },
        }),
        prisma.message.count({
          where: { senderId: id },
        }),
        prisma.conversationParticipant.count({
          where: { userId: id },
        }),
        prisma.groupMember.count({
          where: { userId: id },
        }),
      ]);

      if (!user) {
        throw new Error('User not found');
      }

      return {
        totalMessages,
        totalConversations,
        totalGroups,
        joinedAt: user.createdAt,
      };
    } catch (error) {
      throw new Error(`Error getting user stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete user (soft delete by deactivating)
   */
  async delete(id: string): Promise<boolean> {
    try {
      await prisma.$transaction(async (tx: any) => {
        // Update user to mark as deleted
        await tx.user.update({
          where: { id },
          data: {
            email: `deleted_${Date.now()}_${id}@deleted.com`,
            username: `deleted_${Date.now()}_${id}`,
            firstName: null,
            lastName: null,
            avatar: null,
            bio: null,
            isOnline: false,
          },
        });

        // Deactivate all user sessions
        await tx.userSession.updateMany({
          where: { userId: id },
          data: { isActive: false },
        });

        // Remove user from all conversations
        await tx.conversationParticipant.deleteMany({
          where: { userId: id },
        });

        // Remove user from all groups
        await tx.groupMember.deleteMany({
          where: { userId: id },
        });
      });

      return true;
    } catch (error) {
      throw new Error(`Error deleting user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get online users count
   */
  async getOnlineUsersCount(): Promise<number> {
    try {
      return await prisma.user.count({
        where: { isOnline: true },
      });
    } catch (error) {
      throw new Error(`Error getting online users count: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get recently active users
   */
  async getRecentlyActiveUsers(limit = 10): Promise<UserWithProfile[]> {
    try {
      return await prisma.user.findMany({
        where: {
          lastSeen: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          },
        },
        select: {
          id: true,
          email: true,
          username: true,
          firstName: true,
          lastName: true,
          avatar: true,
          bio: true,
          isOnline: true,
          lastSeen: true,
          createdAt: true,
        },
        orderBy: { lastSeen: 'desc' },
        take: limit,
      });
    } catch (error) {
      throw new Error(`Error getting recently active users: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Export singleton instance
export const userRepository = new UserRepository();
