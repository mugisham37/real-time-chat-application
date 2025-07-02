import type { Prisma } from '@prisma/client';

// Extended user type with computed fields
export type UserWithProfile = Prisma.UserGetPayload<{
  select: {
    id: true;
    email: true;
    username: true;
    firstName: true;
    lastName: true;
    avatar: true;
    bio: true;
    isOnline: true;
    lastSeen: true;
    createdAt: true;
  };
}>;

// Message with sender and reactions
export type MessageWithDetails = Prisma.MessageGetPayload<{
  include: {
    sender: {
      select: {
        id: true;
        username: true;
        firstName: true;
        lastName: true;
        avatar: true;
      };
    };
    reactions: {
      include: {
        user: {
          select: {
            id: true;
            username: true;
          };
        };
      };
    };
    attachments: {
      include: {
        fileUpload: true;
      };
    };
    replyTo: {
      include: {
        sender: {
          select: {
            id: true;
            username: true;
          };
        };
      };
    };
  };
}>;

// Conversation with participants and latest message
export type ConversationWithDetails = Prisma.ConversationGetPayload<{
  include: {
    participants: {
      include: {
        user: {
          select: {
            id: true;
            username: true;
            firstName: true;
            lastName: true;
            avatar: true;
            isOnline: true;
            lastSeen: true;
          };
        };
      };
    };
    messages: {
      take: 1;
      orderBy: {
        createdAt: 'desc';
      };
      include: {
        sender: {
          select: {
            id: true;
            username: true;
          };
        };
      };
    };
    group: {
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true;
                username: true;
                avatar: true;
              };
            };
          };
        };
      };
    };
  };
}>;

// Group with members and details
export type GroupWithMembers = Prisma.GroupGetPayload<{
  include: {
    members: {
      include: {
        user: {
          select: {
            id: true;
            username: true;
            firstName: true;
            lastName: true;
            avatar: true;
            isOnline: true;
          };
        };
      };
    };
    createdBy: {
      select: {
        id: true;
        username: true;
        firstName: true;
        lastName: true;
        avatar: true;
      };
    };
    conversation: {
      select: {
        id: true;
        createdAt: true;
        updatedAt: true;
      };
    };
  };
}>;

// Group with full details including creator, members, and conversation
export type GroupWithDetails = Prisma.GroupGetPayload<{
  include: {
    createdBy: {
      select: {
        id: true;
        username: true;
        firstName: true;
        lastName: true;
        avatar: true;
      };
    };
    members: {
      include: {
        user: {
          select: {
            id: true;
            username: true;
            firstName: true;
            lastName: true;
            avatar: true;
            isOnline: true;
            lastSeen: true;
          };
        };
      };
    };
    conversation: {
      include: {
        messages: {
          take: 1;
          orderBy: { createdAt: 'desc' };
          include: {
            sender: {
              select: {
                id: true;
                username: true;
              };
            };
          };
        };
      };
    };
  };
}>;

// Database connection status
export interface DatabaseStatus {
  connected: boolean;
  latency?: number;
  error?: string;
}

// Pagination types
export interface PaginationOptions {
  page?: number;
  limit?: number;
  cursor?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
    nextCursor?: string;
    prevCursor?: string;
  };
}

// Search types
export interface SearchOptions {
  query: string;
  filters?: {
    type?: string[];
    dateFrom?: Date;
    dateTo?: Date;
    userId?: string;
    conversationId?: string;
  };
  pagination?: PaginationOptions;
}

// Notification payload types
export interface NotificationPayload {
  MESSAGE: {
    messageId: string;
    conversationId: string;
    senderId: string;
    content: string;
  };
  GROUP_INVITATION: {
    groupId: string;
    invitationId: string;
    senderId: string;
    groupName: string;
  };
  GROUP_JOIN_REQUEST: {
    groupId: string;
    requestId: string;
    userId: string;
    groupName: string;
  };
  MENTION: {
    messageId: string;
    conversationId: string;
    senderId: string;
    content: string;
  };
  REACTION: {
    messageId: string;
    conversationId: string;
    userId: string;
    emoji: string;
  };
  SYSTEM: {
    message: string;
    action?: string;
  };
}
