import { Router } from 'express';
import { groupInvitationController } from '../controllers/groupInvitation.controller';
import {
  authMiddleware,
  adminMiddleware,
  validateIdParam,
  cache,
  rateLimiter,
  requireGroupAccess
} from '../middleware';

/**
 * Group Invitation Routes
 * Handles group invitation creation, management, and responses
 */

const router = Router();

// Invitation management routes
router.post('/',
  authMiddleware,
  rateLimiter,
  groupInvitationController.createInvitation
);

router.get('/pending',
  authMiddleware,
  cache({ ttl: 120 }), // 2 minutes cache
  groupInvitationController.getPendingInvitations
);

router.get('/sent',
  authMiddleware,
  cache({ ttl: 180 }), // 3 minutes cache
  groupInvitationController.getSentInvitations
);

router.get('/my-stats',
  authMiddleware,
  cache({ ttl: 300 }), // 5 minutes cache
  groupInvitationController.getUserInvitationStats
);

// Individual invitation routes
router.get('/:id',
  authMiddleware,
  validateIdParam,
  cache({ ttl: 300 }), // 5 minutes cache
  groupInvitationController.getInvitation
);

router.delete('/:id',
  authMiddleware,
  validateIdParam,
  groupInvitationController.cancelInvitation
);

// Invitation response routes
router.post('/:id/accept',
  authMiddleware,
  validateIdParam,
  rateLimiter,
  groupInvitationController.acceptInvitation
);

router.post('/:id/reject',
  authMiddleware,
  validateIdParam,
  rateLimiter,
  groupInvitationController.rejectInvitation
);

router.post('/:id/resend',
  authMiddleware,
  validateIdParam,
  rateLimiter,
  groupInvitationController.resendInvitation
);

// Group-specific invitation routes
router.get('/group/:groupId/pending',
  authMiddleware,
  validateIdParam,
  requireGroupAccess('groupId'),
  cache({ ttl: 120 }), // 2 minutes cache
  groupInvitationController.getGroupPendingInvitations
);

router.get('/group/:groupId/stats',
  authMiddleware,
  validateIdParam,
  requireGroupAccess('groupId'),
  cache({ ttl: 300 }), // 5 minutes cache
  groupInvitationController.getGroupInvitationStats
);

// Check invitation status
router.get('/check/:groupId',
  authMiddleware,
  validateIdParam,
  cache({ ttl: 60 }), // 1 minute cache
  groupInvitationController.checkPendingInvitation
);

router.get('/group/:groupId/user/:userId',
  authMiddleware,
  validateIdParam,
  cache({ ttl: 180 }), // 3 minutes cache
  groupInvitationController.getInvitationByGroupAndUser
);

// Bulk operations
router.post('/bulk',
  authMiddleware,
  rateLimiter,
  groupInvitationController.bulkInviteUsers
);

// Admin routes
router.post('/cleanup',
  adminMiddleware,
  groupInvitationController.cleanupExpiredInvitations
);

export { router as groupInvitationRoutes };
