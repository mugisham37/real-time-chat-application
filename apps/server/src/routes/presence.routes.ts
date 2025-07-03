import { Router } from 'express';
import { presenceController } from '../controllers/presence.controller';
import {
  authMiddleware,
  adminMiddleware,
  rateLimiter,
  validateUserIdParam,
  validatePresenceUpdate,
  validateTypingEvent
} from '../middleware';

/**
 * Presence Routes
 * Handles user presence, activity status, typing indicators, and location sharing
 */

const router = Router();

// All presence routes require authentication
router.use(authMiddleware);

// Update user presence status
router.put('/status',
  rateLimiter,
  validatePresenceUpdate,
  presenceController.updatePresence
);

// Get user presence
router.get('/user/:userId',
  validateUserIdParam,
  presenceController.getUserPresence
);

// Get multiple users presence
router.post('/users',
  rateLimiter,
  presenceController.getMultipleUsersPresence
);

// Get online users
router.get('/online',
  rateLimiter,
  presenceController.getOnlineUsers
);

// Get online users count
router.get('/online/count',
  rateLimiter,
  presenceController.getOnlineUsersCount
);

// Typing indicators
router.post('/typing',
  rateLimiter,
  validateTypingEvent,
  presenceController.setTypingIndicator
);

router.get('/typing/:conversationId',
  rateLimiter,
  presenceController.getTypingUsers
);

// Activity status
router.put('/activity',
  rateLimiter,
  presenceController.setActivityStatus
);

router.get('/activity/:userId',
  validateUserIdParam,
  presenceController.getUserActivityStatus
);

router.delete('/activity',
  rateLimiter,
  presenceController.clearActivityStatus
);

// Location sharing
router.put('/location',
  rateLimiter,
  presenceController.updateLocation
);

router.get('/location/:userId',
  validateUserIdParam,
  presenceController.getUserLocation
);

router.get('/nearby',
  rateLimiter,
  presenceController.getNearbyUsers
);

// Get my presence summary
router.get('/me',
  rateLimiter,
  presenceController.getMyPresence
);

// Admin operations
router.get('/stats',
  adminMiddleware,
  presenceController.getPresenceStatistics
);

router.post('/cleanup',
  adminMiddleware,
  presenceController.cleanupExpiredPresence
);

router.post('/bulk-update',
  adminMiddleware,
  presenceController.bulkUpdatePresence
);

export { router as presenceRoutes };
