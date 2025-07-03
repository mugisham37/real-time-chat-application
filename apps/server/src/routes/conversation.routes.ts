import { Router } from 'express';
import { conversationController } from '../controllers/conversation.controller';
import {
  authMiddleware,
  validateIdParam,
  cache,
  rateLimiter,
  requireConversationAccess
} from '../middleware';

/**
 * Conversation Routes
 * Handles conversation management, messaging, and participant operations
 */

const router = Router();

// Conversation management routes
router.post('/',
  authMiddleware,
  rateLimiter,
  conversationController.createConversation
);

router.get('/',
  authMiddleware,
  cache({ ttl: 300 }), // 5 minutes cache
  conversationController.getUserConversations
);

router.get('/search',
  authMiddleware,
  cache({ ttl: 120 }), // 2 minutes cache
  conversationController.searchConversations
);

router.get('/unread-count',
  authMiddleware,
  conversationController.getUnreadMessageCount
);

// Individual conversation routes
router.get('/:id',
  authMiddleware,
  validateIdParam,
  requireConversationAccess(),
  cache({ ttl: 180 }), // 3 minutes cache
  conversationController.getConversation
);

router.put('/:id',
  authMiddleware,
  validateIdParam,
  requireConversationAccess(),
  conversationController.updateConversation
);

router.delete('/:id',
  authMiddleware,
  validateIdParam,
  requireConversationAccess(),
  conversationController.deleteConversation
);

// Conversation messages
router.get('/:id/messages',
  authMiddleware,
  validateIdParam,
  requireConversationAccess(),
  cache({ ttl: 60 }), // 1 minute cache
  conversationController.getConversationMessages
);

router.post('/:id/read',
  authMiddleware,
  validateIdParam,
  requireConversationAccess(),
  conversationController.markMessagesAsRead
);

// Participant management
router.get('/:id/participants',
  authMiddleware,
  validateIdParam,
  requireConversationAccess(),
  cache({ ttl: 300 }), // 5 minutes cache
  conversationController.getConversationParticipants
);

router.post('/:id/participants',
  authMiddleware,
  validateIdParam,
  requireConversationAccess(),
  conversationController.addParticipant
);

router.delete('/:id/participants/:participantId',
  authMiddleware,
  validateIdParam,
  requireConversationAccess(),
  conversationController.removeParticipant
);

router.post('/:id/leave',
  authMiddleware,
  validateIdParam,
  requireConversationAccess(),
  conversationController.leaveConversation
);

// Conversation statistics and info
router.get('/:id/stats',
  authMiddleware,
  validateIdParam,
  requireConversationAccess(),
  cache({ ttl: 600 }), // 10 minutes cache
  conversationController.getConversationStats
);

// Conversation preferences
router.post('/:id/archive',
  authMiddleware,
  validateIdParam,
  requireConversationAccess(),
  conversationController.archiveConversation
);

router.post('/:id/unarchive',
  authMiddleware,
  validateIdParam,
  requireConversationAccess(),
  conversationController.unarchiveConversation
);

router.post('/:id/pin',
  authMiddleware,
  validateIdParam,
  requireConversationAccess(),
  conversationController.pinConversation
);

router.post('/:id/unpin',
  authMiddleware,
  validateIdParam,
  requireConversationAccess(),
  conversationController.unpinConversation
);

router.post('/:id/mute',
  authMiddleware,
  validateIdParam,
  requireConversationAccess(),
  conversationController.muteConversation
);

router.post('/:id/unmute',
  authMiddleware,
  validateIdParam,
  requireConversationAccess(),
  conversationController.unmuteConversation
);

export { router as conversationRoutes };
