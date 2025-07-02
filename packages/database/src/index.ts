export * from './client';
export * from './types';
export * from './utils';

// Export all repositories
export * from './repositories/UserRepository';
export * from './repositories/ConversationRepository';
export * from './repositories/MessageRepository';
export * from './repositories/GroupRepository';
export * from './repositories/GroupInvitationRepository';
export * from './repositories/GroupJoinRequestRepository';
export * from './repositories/NotificationRepository';
export * from './repositories/FileUploadRepository';
export * from './repositories/UserSessionRepository';

// Export services
export * from './services/DatabaseService';
export * from './services/AuthService';

// Export repository instances for direct use
export { userRepository } from './repositories/UserRepository';
export { conversationRepository } from './repositories/ConversationRepository';
export { messageRepository } from './repositories/MessageRepository';
export { groupRepository } from './repositories/GroupRepository';
export { groupInvitationRepository } from './repositories/GroupInvitationRepository';
export { groupJoinRequestRepository } from './repositories/GroupJoinRequestRepository';
export { notificationRepository } from './repositories/NotificationRepository';
export { fileUploadRepository } from './repositories/FileUploadRepository';
export { userSessionRepository } from './repositories/UserSessionRepository';

// Export service instance
export { databaseService } from './services/DatabaseService';

// Re-export Prisma client and types (will be available after schema generation)
export { Prisma } from '@prisma/client';
