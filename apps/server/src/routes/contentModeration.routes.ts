import { Router } from 'express';
import { contentModerationController } from '../controllers/contentModeration.controller';
import {
  authMiddleware,
  adminMiddleware,
  requireModerator,
  validateIdParam,
  cache,
  rateLimiter
} from '../middleware';

/**
 * Content Moderation Routes
 * Handles content moderation, user reports, and moderation actions
 */

const router = Router();

// Content moderation routes
router.post('/moderate-message',
  authMiddleware,
  requireModerator,
  rateLimiter,
  contentModerationController.moderateMessage
);

router.post('/report',
  authMiddleware,
  rateLimiter,
  contentModerationController.reportUser
);

// User moderation status routes
router.get('/user/:userId/status',
  authMiddleware,
  validateIdParam,
  cache({ ttl: 300 }), // 5 minutes cache
  contentModerationController.getUserModerationStatus
);

router.get('/user/:userId/muted',
  authMiddleware,
  validateIdParam,
  cache({ ttl: 60 }), // 1 minute cache
  contentModerationController.checkUserMuted
);

router.get('/user/:userId/banned',
  authMiddleware,
  validateIdParam,
  cache({ ttl: 60 }), // 1 minute cache
  contentModerationController.checkUserBanned
);

// Moderation management routes (Admin/Moderator only)
router.get('/reports',
  authMiddleware,
  requireModerator,
  cache({ ttl: 120 }), // 2 minutes cache
  contentModerationController.getModerationReports
);

router.put('/reports/:reportId/review',
  authMiddleware,
  requireModerator,
  validateIdParam,
  contentModerationController.reviewReport
);

router.get('/stats',
  adminMiddleware,
  cache({ ttl: 600 }), // 10 minutes cache
  contentModerationController.getModerationStats
);

// Manual moderation actions
router.post('/manual-action',
  authMiddleware,
  requireModerator,
  rateLimiter,
  contentModerationController.manualModerationAction
);

// Moderation rules management (Admin only)
router.get('/rules',
  adminMiddleware,
  cache({ ttl: 900 }), // 15 minutes cache
  contentModerationController.getModerationRules
);

router.post('/rules',
  adminMiddleware,
  contentModerationController.createModerationRule
);

router.put('/rules/:ruleId',
  adminMiddleware,
  validateIdParam,
  contentModerationController.updateModerationRule
);

router.delete('/rules/:ruleId',
  adminMiddleware,
  validateIdParam,
  contentModerationController.deleteModerationRule
);

// Bulk operations (Admin only)
router.post('/bulk-actions',
  adminMiddleware,
  contentModerationController.bulkModerationActions
);

export { router as contentModerationRoutes };
