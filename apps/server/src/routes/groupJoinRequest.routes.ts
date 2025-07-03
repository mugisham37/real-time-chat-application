import { Router } from 'express';
import { groupJoinRequestController } from '../controllers/groupJoinRequest.controller';
import {
  authMiddleware,
  adminMiddleware,
  validateIdParam,
  cache,
  rateLimiter,
  requireGroupAccess
} from '../middleware';

/**
 * Group Join Request Routes
 * Handles group join request creation, management, and responses
 */

const router = Router();

// Join request management routes
router.post('/',
  authMiddleware,
  rateLimiter,
  groupJoinRequestController.createRequest
);

router.get('/my-requests',
  authMiddleware,
  cache({ ttl: 120 }), // 2 minutes cache
  groupJoinRequestController.getUserPendingRequests
);

router.get('/my-stats',
  authMiddleware,
  cache({ ttl: 300 }), // 5 minutes cache
  groupJoinRequestController.getUserJoinRequestStats
);

// Individual request routes
router.get('/:id',
  authMiddleware,
  validateIdParam,
  cache({ ttl: 300 }), // 5 minutes cache
  groupJoinRequestController.getRequest
);

router.delete('/:id',
  authMiddleware,
  validateIdParam,
  groupJoinRequestController.cancelRequest
);

router.put('/:id/message',
  authMiddleware,
  validateIdParam,
  groupJoinRequestController.updateRequestMessage
);

router.get('/:id/activity',
  authMiddleware,
  validateIdParam,
  cache({ ttl: 180 }), // 3 minutes cache
  groupJoinRequestController.getRequestActivity
);

// Request response routes (Admin/Moderator only)
router.post('/:id/approve',
  authMiddleware,
  validateIdParam,
  rateLimiter,
  groupJoinRequestController.approveRequest
);

router.post('/:id/reject',
  authMiddleware,
  validateIdParam,
  rateLimiter,
  groupJoinRequestController.rejectRequest
);

// Group-specific request routes
router.get('/group/:groupId/pending',
  authMiddleware,
  validateIdParam,
  requireGroupAccess('groupId'),
  cache({ ttl: 120 }), // 2 minutes cache
  groupJoinRequestController.getGroupPendingRequests
);

router.get('/group/:groupId/stats',
  authMiddleware,
  validateIdParam,
  requireGroupAccess('groupId'),
  cache({ ttl: 300 }), // 5 minutes cache
  groupJoinRequestController.getGroupJoinRequestStats
);

// Check request status
router.get('/check/:groupId',
  authMiddleware,
  validateIdParam,
  cache({ ttl: 60 }), // 1 minute cache
  groupJoinRequestController.checkPendingRequest
);

router.get('/group/:groupId/user/:userId',
  authMiddleware,
  validateIdParam,
  cache({ ttl: 180 }), // 3 minutes cache
  groupJoinRequestController.getRequestByGroupAndUser
);

// Bulk operations (Admin/Moderator only)
router.post('/bulk-approve',
  authMiddleware,
  rateLimiter,
  groupJoinRequestController.bulkApproveRequests
);

router.post('/bulk-reject',
  authMiddleware,
  rateLimiter,
  groupJoinRequestController.bulkRejectRequests
);

// Admin routes
router.get('/all',
  adminMiddleware,
  cache({ ttl: 180 }), // 3 minutes cache
  groupJoinRequestController.getAllRequests
);

router.post('/cleanup',
  adminMiddleware,
  groupJoinRequestController.cleanupExpiredRequests
);

export { router as groupJoinRequestRoutes };
