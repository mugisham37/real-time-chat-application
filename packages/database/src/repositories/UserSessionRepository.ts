import type { Prisma } from '@prisma/client';
import { prisma } from '../client';

export class UserSessionRepository {
  /**
   * Create a new user session
   */
  async create(sessionData: {
    userId: string;
    token: string;
    refreshToken: string;
    deviceInfo?: string;
    ipAddress?: string;
    userAgent?: string;
    expiresAt: Date;
  }) {
    try {
      return await prisma.userSession.create({
        data: sessionData,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              avatar: true,
              email: true,
            },
          },
        },
      });
    } catch (error) {
      throw new Error(`Error creating user session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Find session by token
   */
  async findByToken(token: string) {
    try {
      return await prisma.userSession.findUnique({
        where: { token },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              avatar: true,
              email: true,
              isActive: true,
              isVerified: true,
            },
          },
        },
      });
    } catch (error) {
      throw new Error(`Error finding session by token: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Find session by refresh token
   */
  async findByRefreshToken(refreshToken: string) {
    try {
      return await prisma.userSession.findUnique({
        where: { refreshToken },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              avatar: true,
              email: true,
              isActive: true,
              isVerified: true,
            },
          },
        },
      });
    } catch (error) {
      throw new Error(`Error finding session by refresh token: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Find session by ID
   */
  async findById(id: string) {
    try {
      return await prisma.userSession.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              avatar: true,
              email: true,
            },
          },
        },
      });
    } catch (error) {
      throw new Error(`Error finding session by ID: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get active sessions for a user
   */
  async getActiveSessionsForUser(userId: string) {
    try {
      return await prisma.userSession.findMany({
        where: {
          userId,
          isActive: true,
          expiresAt: {
            gt: new Date(),
          },
        },
        orderBy: { lastUsedAt: 'desc' },
      });
    } catch (error) {
      throw new Error(`Error getting active sessions for user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get all sessions for a user (including inactive)
   */
  async getAllSessionsForUser(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      includeInactive?: boolean;
    } = {}
  ) {
    try {
      const { limit = 20, offset = 0, includeInactive = false } = options;

      const whereClause: Prisma.UserSessionWhereInput = { userId };

      if (!includeInactive) {
        whereClause.isActive = true;
        whereClause.expiresAt = { gt: new Date() };
      }

      return await prisma.userSession.findMany({
        where: whereClause,
        orderBy: { lastUsedAt: 'desc' },
        take: limit,
        skip: offset,
      });
    } catch (error) {
      throw new Error(`Error getting sessions for user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update session last used time
   */
  async updateLastUsed(token: string) {
    try {
      return await prisma.userSession.update({
        where: { token },
        data: { lastUsedAt: new Date() },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              avatar: true,
              email: true,
            },
          },
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new Error('Session not found');
      }
      throw new Error(`Error updating session last used: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update session refresh token
   */
  async updateRefreshToken(token: string, newRefreshToken: string, newExpiresAt: Date) {
    try {
      return await prisma.userSession.update({
        where: { token },
        data: {
          refreshToken: newRefreshToken,
          expiresAt: newExpiresAt,
          lastUsedAt: new Date(),
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              avatar: true,
              email: true,
            },
          },
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new Error('Session not found');
      }
      throw new Error(`Error updating refresh token: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Deactivate session (logout)
   */
  async deactivateSession(token: string) {
    try {
      return await prisma.userSession.update({
        where: { token },
        data: { isActive: false },
      });
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new Error('Session not found');
      }
      throw new Error(`Error deactivating session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Deactivate all sessions for a user (logout from all devices)
   */
  async deactivateAllUserSessions(userId: string) {
    try {
      const result = await prisma.userSession.updateMany({
        where: {
          userId,
          isActive: true,
        },
        data: { isActive: false },
      });

      return { count: result.count };
    } catch (error) {
      throw new Error(`Error deactivating all user sessions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Deactivate all sessions except current one
   */
  async deactivateOtherSessions(userId: string, currentToken: string) {
    try {
      const result = await prisma.userSession.updateMany({
        where: {
          userId,
          isActive: true,
          token: { not: currentToken },
        },
        data: { isActive: false },
      });

      return { count: result.count };
    } catch (error) {
      throw new Error(`Error deactivating other sessions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete session
   */
  async deleteSession(token: string): Promise<boolean> {
    try {
      await prisma.userSession.delete({
        where: { token },
      });

      return true;
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new Error('Session not found');
      }
      throw new Error(`Error deleting session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete all sessions for a user
   */
  async deleteAllUserSessions(userId: string): Promise<{ count: number }> {
    try {
      const result = await prisma.userSession.deleteMany({
        where: { userId },
      });

      return { count: result.count };
    } catch (error) {
      throw new Error(`Error deleting all user sessions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<{ count: number }> {
    try {
      const result = await prisma.userSession.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: new Date() } },
            { isActive: false },
          ],
        },
      });

      return { count: result.count };
    } catch (error) {
      throw new Error(`Error cleaning up expired sessions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get session statistics
   */
  async getSessionStats(): Promise<{
    totalSessions: number;
    activeSessions: number;
    expiredSessions: number;
    uniqueUsers: number;
  }> {
    try {
      const now = new Date();

      const [totalSessions, activeSessions, expiredSessions, uniqueUsers] = await Promise.all([
        prisma.userSession.count(),
        prisma.userSession.count({
          where: {
            isActive: true,
            expiresAt: { gt: now },
          },
        }),
        prisma.userSession.count({
          where: {
            OR: [
              { expiresAt: { lt: now } },
              { isActive: false },
            ],
          },
        }),
        prisma.userSession.groupBy({
          by: ['userId'],
          where: {
            isActive: true,
            expiresAt: { gt: now },
          },
        }).then(result => result.length),
      ]);

      return {
        totalSessions,
        activeSessions,
        expiredSessions,
        uniqueUsers,
      };
    } catch (error) {
      throw new Error(`Error getting session stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get sessions by IP address
   */
  async getSessionsByIP(ipAddress: string, options: {
    limit?: number;
    offset?: number;
    activeOnly?: boolean;
  } = {}) {
    try {
      const { limit = 20, offset = 0, activeOnly = true } = options;

      const whereClause: Prisma.UserSessionWhereInput = { ipAddress };

      if (activeOnly) {
        whereClause.isActive = true;
        whereClause.expiresAt = { gt: new Date() };
      }

      return await prisma.userSession.findMany({
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
        orderBy: { lastUsedAt: 'desc' },
        take: limit,
        skip: offset,
      });
    } catch (error) {
      throw new Error(`Error getting sessions by IP: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if user has active sessions
   */
  async hasActiveSessions(userId: string): Promise<boolean> {
    try {
      const count = await prisma.userSession.count({
        where: {
          userId,
          isActive: true,
          expiresAt: { gt: new Date() },
        },
      });

      return count > 0;
    } catch (error) {
      throw new Error(`Error checking active sessions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get concurrent sessions count for a user
   */
  async getConcurrentSessionsCount(userId: string): Promise<number> {
    try {
      return await prisma.userSession.count({
        where: {
          userId,
          isActive: true,
          expiresAt: { gt: new Date() },
        },
      });
    } catch (error) {
      throw new Error(`Error getting concurrent sessions count: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate session and check if it's still valid
   */
  async validateSession(token: string): Promise<{
    isValid: boolean;
    session?: Awaited<ReturnType<UserSessionRepository['findByToken']>>;
    reason?: string;
  }> {
    try {
      const session = await this.findByToken(token);

      if (!session) {
        return { isValid: false, reason: 'Session not found' };
      }

      if (!session.isActive) {
        return { isValid: false, reason: 'Session is inactive' };
      }

      if (session.expiresAt < new Date()) {
        return { isValid: false, reason: 'Session has expired' };
      }

      if (!session.user.isActive) {
        return { isValid: false, reason: 'User account is inactive' };
      }

      // Update last used time
      await this.updateLastUsed(token);

      return { isValid: true, session };
    } catch (error) {
      return { isValid: false, reason: 'Error validating session' };
    }
  }
}

// Export singleton instance
export const userSessionRepository = new UserSessionRepository();
