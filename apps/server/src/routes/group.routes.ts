import { Router } from 'express';
import { groupController } from '../controllers/group.controller';
import {
  authMiddleware,
  adminMiddleware,
  validateIdParam,
  cache,
  rateLimiter,
  requireGroupAccess
} from '../middleware';

/**
 * Group Routes
 * Handles group creation, management, membership, and operations
 */

const router = Router();

// Group management routes
router.post('/',
  authMiddleware,
  rateLimiter,
  groupController.createGroup
);

router.get('/my-groups',
  authMiddleware,
  cache({ ttl: 300 }), // 5 minutes cache
  groupController.getUserGroups
);

router.get('/search',
  authMiddleware,
  cache({ ttl: 180 }), // 3 minutes cache
  groupController.searchPublicGroups
);

router.get('/popular',
  authMiddleware,
  cache({ ttl: 600 }), // 10 minutes cache
  groupController.getPopularGroups
);

// Individual group routes
router.get('/:id',
  authMiddleware,
  validateIdParam,
  requireGroupAccess(),
  cache({ ttl: 240 }), // 4 minutes cache
  groupController.getGroup
);

router.put('/:id',
  authMiddleware,
  validateIdParam,
  requireGroupAccess(),
  groupController.updateGroup
);

router.delete('/:id',
  authMiddleware,
  validateIdParam,
  requireGroupAccess(),
  groupController.deleteGroup
);

// Group membership routes
router.post('/:id/join',
  authMiddleware,
  validateIdParam,
  rateLimiter,
  groupController.joinGroup
);

router.post('/:id/leave',
  authMiddleware,
  validateIdParam,
  requireGroupAccess(),
  groupController.leaveGroup
);

// Group member management routes
router.get('/:id/members',
  authMiddleware,
  validateIdParam,
  requireGroupAccess(),
  cache({ ttl: 300 }), // 5 minutes cache
  groupController.getGroupMembers
);

router.post('/:id/members',
  authMiddleware,
  validateIdParam,
  requireGroupAccess(),
  rateLimiter,
  groupController.addMember
);

router.delete('/:id/members/:memberId',
  authMiddleware,
  validateIdParam,
  requireGroupAccess(),
  groupController.removeMember
);

router.put('/:id/members/:memberId/role',
  authMiddleware,
  validateIdParam,
  requireGroupAccess(),
  groupController.updateMemberRole
);

// Bulk member operations
router.post('/:id/members/bulk',
  authMiddleware,
  validateIdParam,
  requireGroupAccess(),
  rateLimiter,
  groupController.bulkMemberOperations
);

// Group statistics and activity
router.get('/:id/stats',
  authMiddleware,
  validateIdParam,
  requireGroupAccess(),
  cache({ ttl: 600 }), // 10 minutes cache
  groupController.getGroupStats
);

router.get('/:id/activity',
  authMiddleware,
  validateIdParam,
  requireGroupAccess(),
  cache({ ttl: 180 }), // 3 minutes cache
  groupController.getGroupActivity
);

// Group data export (Admin/Owner only)
router.get('/:id/export',
  authMiddleware,
  validateIdParam,
  requireGroupAccess(),
  groupController.exportGroupData
);

export { router as groupRoutes };
