import { Router } from 'express';
import { analyticsController } from '../controllers/analytics.controller';
import {
  authMiddleware,
  adminMiddleware,
  requireAdmin,
  validateIdParam,
  validateUserIdParam,
  cache,
  rateLimiter
} from '../middleware';

/**
 * Analytics Routes
 * Handles analytics and metrics endpoints
 */

const router = Router();

// User activity routes
router.get('/user/:userId/activity',
  authMiddleware,
  validateUserIdParam,
  cache({ ttl: 300 }), // 5 minutes cache
  analyticsController.getUserActivity
);

router.get('/user/:userId/counts',
  authMiddleware,
  validateUserIdParam,
  cache({ ttl: 600 }), // 10 minutes cache
  analyticsController.getUserActivityCounts
);

router.get('/user/:userId/engagement',
  authMiddleware,
  validateUserIdParam,
  cache({ ttl: 900 }), // 15 minutes cache
  analyticsController.getUserEngagementMetrics
);

// Current user analytics
router.get('/me/summary',
  authMiddleware,
  cache({ ttl: 300 }), // 5 minutes cache
  analyticsController.getMyAnalyticsSummary
);

// Activity tracking
router.post('/track',
  authMiddleware,
  rateLimiter,
  analyticsController.trackActivity
);

// Global analytics (Admin only)
router.get('/global/activity',
  adminMiddleware,
  cache({ ttl: 600 }), // 10 minutes cache
  analyticsController.getGlobalActivityCounts
);

router.get('/system/stats',
  adminMiddleware,
  cache({ ttl: 900 }), // 15 minutes cache
  analyticsController.getSystemStats
);

router.get('/dashboard',
  adminMiddleware,
  cache({ ttl: 300 }), // 5 minutes cache
  analyticsController.getDashboardData
);

// Data export (Admin only)
router.get('/export',
  adminMiddleware,
  analyticsController.exportAnalytics
);

export { router as analyticsRoutes };
