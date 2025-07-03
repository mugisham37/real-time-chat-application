import { Router } from 'express';
import { messageController } from '../controllers/message.controller';
import {
  authMiddleware,
  adminMiddleware,
  rateLimiter,
  requireConversationAccess,
  cacheMessages,
  validateConversationIdParam,
  validateMessageIdParam,
  validateSendMessage,
  validateEditMessage,
  validateReactToMessage
} from '../middleware';
import { messageRateLimiter } from '../middleware/rateLimiter';

/**
 * Message Routes
 * Handles message creation, retrieval, updates, reactions, and search
 */

const router = Router();

// All message routes require authentication
router.use(authMiddleware);

// Message CRUD operations
router.post('/',
  messageRateLimiter,
  validateSendMessage,
  messageController.createMessage
);

router.get('/search',
  rateLimiter,
  messageController.searchMessages
);

router.get('/my-stats',
  rateLimiter,
  messageController.getUserMessageStats
);

router.get('/conversations/:conversationId/stats',
  validateConversationIdParam,
  requireConversationAccess(),
  messageController.getConversationMessageStats
);

router.get('/conversations/:conversationId',
  validateConversationIdParam,
  requireConversationAccess(),
  cacheMessages,
  messageController.getConversationMessages
);

router.get('/:id',
  validateMessageIdParam,
  messageController.getMessage
);

router.put('/:id',
  validateMessageIdParam,
  validateEditMessage,
  messageController.updateMessage
);

router.delete('/:id',
  validateMessageIdParam,
  messageController.deleteMessage
);

// Message reactions
router.post('/:id/reactions',
  validateMessageIdParam,
  messageRateLimiter,
  validateReactToMessage,
  messageController.addReaction
);

router.delete('/:id/reactions/:reactionType',
  validateMessageIdParam,
  messageController.removeReaction
);

router.get('/:id/reactions',
  validateMessageIdParam,
  messageController.getMessageReactions
);

// Message interactions
router.post('/:id/read',
  validateMessageIdParam,
  messageController.markAsRead
);

router.get('/:id/thread',
  validateMessageIdParam,
  messageController.getMessageThread
);

router.post('/:id/pin',
  validateMessageIdParam,
  messageController.toggleMessagePin
);

router.post('/:id/report',
  validateMessageIdParam,
  rateLimiter,
  messageController.reportMessage
);

router.get('/:id/history',
  validateMessageIdParam,
  messageController.getMessageHistory
);

// Admin operations
router.post('/bulk',
  adminMiddleware,
  messageController.bulkMessageOperations
);

export { router as messageRoutes };
