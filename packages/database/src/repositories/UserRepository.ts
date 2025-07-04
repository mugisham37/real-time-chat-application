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
          updatedAt: true,
          status: true,
          isDeleted: true,
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
        notificationSettings: true,
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
        notificationSettings: true,
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
        notificationSettings: true,
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
        notificationSettings: true,
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
    status: string;
    isDeleted: boolean;
    isOnline: boolean;
    lastSeen: Date;
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
          updatedAt: true,
          status: true,
          isDeleted: true,
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
          updatedAt: true,
          status: true,
          isDeleted: true,
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
          updatedAt: true,
          status: true,
          isDeleted: true,
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
   * Get total users count
   */
  async count(): Promise<number> {
    try {
      return await prisma.user.count();
    } catch (error) {
      throw new Error(`Error getting users count: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
   * Get repository statistics
   */
  async getStats(): Promise<{
    total: number;
    online: number;
    verified: number;
    recentlyActive: number;
    withTwoFactor: number;
  }> {
    try {
      const [total, online, verified, recentlyActive, withTwoFactor] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { isOnline: true } }),
        prisma.user.count({ where: { emailVerified: { not: null } } }),
        prisma.user.count({
          where: {
            lastSeen: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
            },
          },
        }),
        prisma.user.count({ where: { twoFactorEnabled: true } }),
      ]);

      return {
        total,
        online,
        verified,
        recentlyActive,
        withTwoFactor,
      };
    } catch (error) {
      throw new Error(`Error getting user stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get recent contacts for a user
   */
  async getRecentContacts(userId: string, options: {
    limit?: number;
    offset?: number;
  } = {}): Promise<UserWithProfile[]> {
    try {
      const { limit = 10, offset = 0 } = options;
      
      // Get users the current user has recently messaged
      const recentContacts = await prisma.user.findMany({
        where: {
          id: {
            not: userId,
          },
          OR: [
            // Users who sent messages to the current user
            {
              sentMessages: {
                some: {
                  conversation: {
                    participants: {
                      some: {
                        userId: userId,
                      },
                    },
                  },
                },
              },
            },
            // Users who are in conversations with the current user
            {
              conversations: {
                some: {
                  conversation: {
                    participants: {
                      some: {
                        userId: userId,
                      },
                    },
                  },
                },
              },
            },
          ],
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
          updatedAt: true,
          status: true,
          isDeleted: true,
        },
        orderBy: [
          { isOnline: 'desc' },
          { lastSeen: 'desc' },
        ],
        take: limit,
        skip: offset,
      });
      
      return recentContacts;
    } catch (error) {
      throw new Error(`Error getting recent contacts: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
          updatedAt: true,
          status: true,
          isDeleted: true,
        },
        orderBy: { lastSeen: 'desc' },
        take: limit,
      });
    } catch (error) {
      throw new Error(`Error getting recently active users: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update notification settings for a user
   */
  async updateNotificationSettings(userId: string, settings: {
    emailNotifications?: boolean;
    pushNotifications?: boolean;
    mentionNotifications?: boolean;
    messageNotifications?: boolean;
    groupInvitationNotifications?: boolean;
    messages?: boolean;
    mentions?: boolean;
    reactions?: boolean;
    calls?: boolean;
    groups?: boolean;
    email?: boolean;
    push?: boolean;
  }): Promise<any | null> {
    try {
      // First get the current user to merge settings
      const currentUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { notificationSettings: true },
      });

      if (!currentUser) {
        throw new Error('User not found');
      }

      // Merge current settings with new settings
      const currentSettings = (currentUser.notificationSettings as any) || {};
      const updatedSettings = { ...currentSettings, ...settings };

      return await prisma.user.update({
        where: { id: userId },
        data: {
          notificationSettings: updatedSettings,
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
          notificationSettings: true,
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new Error('User not found');
      }
      throw new Error(`Error updating notification settings: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get user contacts
   */
  async getContacts(userId: string, limit = 50, skip = 0): Promise<any[]> {
    try {
      const contacts = await prisma.contact.findMany({
        where: { userId },
        include: {
          contact: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              avatar: true,
              bio: true,
              status: true,
              isOnline: true,
              lastSeen: true,
            },
          },
        },
        orderBy: [
          { isFavorite: 'desc' },
          { addedAt: 'desc' },
        ],
        take: limit,
        skip,
      });

      return contacts.map(contact => ({
        ...contact.contact,
        isFavorite: contact.isFavorite,
        addedAt: contact.addedAt,
      }));
    } catch (error) {
      throw new Error(`Error getting contacts: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Add contact
   */
  async addContact(userId: string, contactId: string, favorite = false): Promise<void> {
    try {
      await prisma.contact.create({
        data: {
          userId,
          contactId,
          isFavorite: favorite,
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new Error('Contact already exists');
      }
      throw new Error(`Error adding contact: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Remove contact
   */
  async removeContact(userId: string, contactId: string): Promise<boolean> {
    try {
      const result = await prisma.contact.deleteMany({
        where: {
          userId,
          contactId,
        },
      });

      return result.count > 0;
    } catch (error) {
      throw new Error(`Error removing contact: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Block user
   */
  async blockUser(blockerId: string, blockedId: string): Promise<void> {
    try {
      await prisma.block.create({
        data: {
          blockerId,
          blockedId,
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new Error('User is already blocked');
      }
      throw new Error(`Error blocking user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Unblock user
   */
  async unblockUser(blockerId: string, blockedId: string): Promise<boolean> {
    try {
      const result = await prisma.block.deleteMany({
        where: {
          blockerId,
          blockedId,
        },
      });

      return result.count > 0;
    } catch (error) {
      throw new Error(`Error unblocking user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get blocked users
   */
  async getBlockedUsers(userId: string): Promise<any[]> {
    try {
      const blocks = await prisma.block.findMany({
        where: { blockerId: userId },
        include: {
          blocked: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              avatar: true,
            },
          },
        },
        orderBy: { blockedAt: 'desc' },
      });

      return blocks.map(block => ({
        ...block.blocked,
        blockedAt: block.blockedAt,
      }));
    } catch (error) {
      throw new Error(`Error getting blocked users: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Export singleton instance
export const userRepository = new UserRepository();
