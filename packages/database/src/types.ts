import type { Prisma } from '@prisma/client';

// User Types
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

export type UserWithSessions = Prisma.UserGetPayload<{
  include: {
    userSessions: true;
  };
}>;

export type UserWithRelations = Prisma.UserGetPayload<{
  include: {
    userSessions: true;
    sentMessages: true;
    conversations: {
      include: {
        conversation: true;
      };
    };
    groupMemberships: {
      include: {
        group: true;
      };
    };
  };
}>;

// Message Types
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

export type MessageWithSender = Prisma.MessageGetPayload<{
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
  };
}>;

export type CreateMessageData = Prisma.MessageCreateInput;
export type UpdateMessageData = Prisma.MessageUpdateInput;

// Conversation Types
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

export type ConversationWithParticipants = Prisma.ConversationGetPayload<{
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
          };
        };
      };
    };
  };
}>;

export type ConversationWithMessages = Prisma.ConversationGetPayload<{
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
          };
        };
      };
    };
    messages: {
      include: {
        sender: {
          select: {
            id: true;
            username: true;
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
      };
      orderBy: {
        createdAt: 'asc';
      };
    };
  };
}>;

export type CreateConversationData = Prisma.ConversationCreateInput;

// Group Types
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

export type CreateGroupData = Prisma.GroupCreateInput;
export type UpdateGroupData = Prisma.GroupUpdateInput;

// User Session Types
export type UserSessionWithUser = Prisma.UserSessionGetPayload<{
  include: {
    user: {
      select: {
        id: true;
        username: true;
        firstName: true;
        lastName: true;
        avatar: true;
        email: true;
        isActive: true;
        isVerified: true;
      };
    };
  };
}>;

export type CreateUserSessionData = Prisma.UserSessionCreateInput;
export type UpdateUserSessionData = Prisma.UserSessionUpdateInput;

// Notification Types
export type NotificationWithUser = Prisma.NotificationGetPayload<{
  include: {
    user: {
      select: {
        id: true;
        username: true;
        firstName: true;
        lastName: true;
        avatar: true;
      };
    };
  };
}>;

export type CreateNotificationData = Prisma.NotificationCreateInput;

// File Upload Types
export type FileUploadWithUser = Prisma.FileUploadGetPayload<{
  include: {
    uploadedBy: {
      select: {
        id: true;
        username: true;
        firstName: true;
        lastName: true;
        avatar: true;
      };
    };
  };
}>;

export type CreateFileUploadData = Prisma.FileUploadCreateInput;

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

// Common utility types
export type DatabaseError = {
  code: string;
  message: string;
  meta?: any;
};

export type QueryResult<T> = {
  success: boolean;
  data?: T;
  error?: DatabaseError;
};

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

// Repository method result types
export type RepositoryResult<T> = Promise<QueryResult<T>>;
export type RepositoryListResult<T> = Promise<QueryResult<PaginatedResult<T>>>;

// Batch operation types
export type BatchResult = {
  count: number;
  success: boolean;
  errors?: DatabaseError[];
};
