import { Router } from 'express';
import { callController } from '../controllers/call.controller';
import {
  authMiddleware,
  adminMiddleware,
  validateIdParam,
  cache,
  rateLimiter
} from '../middleware';

/**
 * Call Routes
 * Handles voice and video call operations
 */

const router = Router();

// Call management routes
router.post('/initiate',
  authMiddleware,
  rateLimiter, // Use rate limiter for call initiation
  callController.initiateCall
);

router.post('/:callId/answer',
  authMiddleware,
  validateIdParam,
  callController.answerCall
);

router.post('/:callId/reject',
  authMiddleware,
  validateIdParam,
  callController.rejectCall
);

router.post('/:callId/end',
  authMiddleware,
  validateIdParam,
  callController.endCall
);

// Call information routes
router.get('/:callId',
  authMiddleware,
  validateIdParam,
  cache({ ttl: 60 }), // 1 minute cache
  callController.getCall
);

router.get('/recent',
  authMiddleware,
  cache({ ttl: 300 }), // 5 minutes cache
  callController.getRecentCalls
);

router.get('/active',
  authMiddleware,
  callController.getActiveCalls
);

router.get('/history',
  authMiddleware,
  cache({ ttl: 600 }), // 10 minutes cache
  callController.getCallHistory
);

// Call statistics
router.get('/stats',
  authMiddleware,
  cache({ ttl: 900 }), // 15 minutes cache
  callController.getCallStats
);

// Call quality management
router.post('/:callId/quality',
  authMiddleware,
  validateIdParam,
  rateLimiter,
  callController.updateCallQuality
);

router.get('/:callId/quality',
  authMiddleware,
  validateIdParam,
  cache({ ttl: 300 }), // 5 minutes cache
  callController.getCallQuality
);

// Admin routes
router.post('/:callId/missed',
  adminMiddleware,
  validateIdParam,
  callController.markCallAsMissed
);

router.post('/bulk',
  adminMiddleware,
  callController.bulkCallOperations
);

export { router as callRoutes };
