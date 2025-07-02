import { prisma } from './client';

/**
 * Check database connection status
 */
export async function checkDatabaseConnection() {
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const latency = Date.now() - start;
    
    return {
      connected: true,
      latency,
    };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Create pagination metadata
 */
export function createPaginationMeta(
  total: number,
  page: number,
  limit: number
) {
  const totalPages = Math.ceil(total / limit);
  const hasNext = page < totalPages;
  const hasPrev = page > 1;

  return {
    page,
    limit,
    total,
    totalPages,
    hasNext,
    hasPrev,
  };
}

/**
 * Generate cursor-based pagination
 */
export function createCursorPagination<T extends { id: string }>(
  data: T[],
  limit: number
) {
  const hasNext = data.length > limit;
  const items = hasNext ? data.slice(0, -1) : data;
  
  return {
    data: items,
    nextCursor: hasNext ? items[items.length - 1]?.id : undefined,
    hasNext,
  };
}

/**
 * Sanitize search query
 */
export function sanitizeSearchQuery(query: string): string {
  return query
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters except hyphens
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .toLowerCase();
}

/**
 * Build search filters for Prisma
 */
export function buildSearchFilters(options: {
  query?: string;
  userId?: string;
  conversationId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  type?: string[];
}) {
  const filters: any = {};

  if (options.query) {
    filters.content = {
      contains: sanitizeSearchQuery(options.query),
      mode: 'insensitive',
    };
  }

  if (options.userId) {
    filters.senderId = options.userId;
  }

  if (options.conversationId) {
    filters.conversationId = options.conversationId;
  }

  if (options.dateFrom || options.dateTo) {
    filters.createdAt = {};
    if (options.dateFrom) {
      filters.createdAt.gte = options.dateFrom;
    }
    if (options.dateTo) {
      filters.createdAt.lte = options.dateTo;
    }
  }

  if (options.type && options.type.length > 0) {
    filters.type = {
      in: options.type,
    };
  }

  return filters;
}

/**
 * Hash password utility
 */
export async function hashPassword(password: string): Promise<string> {
  const bcrypt = await import('bcryptjs');
  const saltRounds = parseInt(process.env.BCRYPT_ROUNDS || '12');
  return bcrypt.hash(password, saltRounds);
}

/**
 * Verify password utility
 */
export async function verifyPassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  const bcrypt = await import('bcryptjs');
  return bcrypt.compare(password, hashedPassword);
}

/**
 * Generate unique username
 */
export async function generateUniqueUsername(baseUsername: string): Promise<string> {
  let username = baseUsername.toLowerCase().replace(/[^a-z0-9]/g, '');
  let counter = 0;
  
  while (true) {
    const testUsername = counter === 0 ? username : `${username}${counter}`;
    
    const existingUser = await prisma.user.findUnique({
      where: { username: testUsername },
      select: { id: true },
    });
    
    if (!existingUser) {
      return testUsername;
    }
    
    counter++;
  }
}

/**
 * Clean up expired sessions
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const result = await prisma.userSession.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { isActive: false },
      ],
    },
  });
  
  return result.count;
}

/**
 * Update user online status
 */
export async function updateUserOnlineStatus(
  userId: string,
  isOnline: boolean
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      isOnline,
      lastSeen: new Date(),
    },
  });
}

/**
 * Get conversation participants
 */
export async function getConversationParticipants(conversationId: string) {
  return prisma.conversationParticipant.findMany({
    where: { conversationId },
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
  });
}

/**
 * Check if user is conversation participant
 */
export async function isConversationParticipant(
  conversationId: string,
  userId: string
): Promise<boolean> {
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
}

/**
 * Mark messages as read
 */
export async function markMessagesAsRead(
  conversationId: string,
  userId: string
): Promise<void> {
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
}
