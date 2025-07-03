import { Router } from 'express';
import { scheduledMessageController } from '../controllers/scheduledMessage.controller';
import {
  authMiddleware,
  adminMiddleware,
  validateIdParam,
  validateConversationIdParam,
  cache,
  rateLimiter
} from '../middleware';
import { scheduledMessageValidator } from '../validators/scheduledMessage.validator';

/**
 * Scheduled Message Routes
 * Handles message scheduling, management, and automated delivery
 */

const router = Router();

// All scheduled message routes require authentication
router.use(authMiddleware);

// Message scheduling routes
router.post('/',
  rateLimiter,
  scheduledMessageValidator.validateScheduleMessage,
  scheduledMessageController.scheduleMessage
);

router.get('/my-messages',
  cache({ ttl: 120 }), // 2 minutes cache
  scheduledMessageValidator.validateGetUserScheduledMessages,
  scheduledMessageController.getUserScheduledMessages
);

router.get('/upcoming',
  cache({ ttl: 60 }), // 1 minute cache
  scheduledMessageValidator.validateGetUpcomingScheduledMessages,
  scheduledMessageController.getUpcomingScheduledMessages
);

router.get('/stats',
  cache({ ttl: 300 }), // 5 minutes cache
  scheduledMessageController.getScheduledMessageStats
);

// Individual scheduled message routes
router.get('/:id',
  validateIdParam,
  cache({ ttl: 180 }), // 3 minutes cache
  scheduledMessageController.getScheduledMessage
);

router.put('/:id',
  validateIdParam,
  scheduledMessageValidator.validateUpdateScheduledMessage,
  scheduledMessageController.updateScheduledMessage
);

router.delete('/:id',
  validateIdParam,
  scheduledMessageValidator.validateCancelScheduledMessage,
  scheduledMessageController.cancelScheduledMessage
);

router.post('/:id/reschedule',
  validateIdParam,
  rateLimiter,
  scheduledMessageValidator.validateRescheduleMessage,
  scheduledMessageController.rescheduleMessage
);

// Conversation-specific scheduled messages
router.get('/conversation/:conversationId',
  validateConversationIdParam,
  cache({ ttl: 180 }), // 3 minutes cache
  scheduledMessageValidator.validateGetConversationScheduledMessages,
  scheduledMessageController.getConversationScheduledMessages
);

// Bulk operations
router.post('/bulk-cancel',
  rateLimiter,
  scheduledMessageValidator.validateBulkCancelScheduledMessages,
  scheduledMessageController.bulkCancelScheduledMessages
);

// Admin operations
router.post('/process-due',
  adminMiddleware,
  scheduledMessageValidator.validateProcessDueScheduledMessages,
  scheduledMessageController.processDueScheduledMessages
);

router.get('/all',
  adminMiddleware,
  cache({ ttl: 120 }), // 2 minutes cache
  scheduledMessageValidator.validateGetAllScheduledMessages,
  scheduledMessageController.getAllScheduledMessages
);

router.post('/cleanup',
  adminMiddleware,
  scheduledMessageValidator.validateCleanupOldScheduledMessages,
  scheduledMessageController.cleanupOldScheduledMessages
);

export { router as scheduledMessageRoutes };
