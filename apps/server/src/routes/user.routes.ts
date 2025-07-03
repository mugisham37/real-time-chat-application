import { Router } from 'express';
import { userController } from '../controllers/user.controller';
import {
  authMiddleware,
  adminMiddleware,
  validateIdParam,
  validateUserIdParam,
  cache,
  rateLimiter
} from '../middleware';
import { userValidator } from '../validators/user.validator';

/**
 * User Routes
 * Handles user profile management, contacts, blocking, search, and user operations
 */

const router = Router();

// All user routes require authentication
router.use(authMiddleware);

// Current user profile routes
router.get('/me',
  cache({ ttl: 300 }), // 5 minutes cache
  userController.getCurrentUserProfile
);

router.put('/me',
  userValidator.validateUpdateCurrentUserProfile,
  userController.updateCurrentUserProfile
);

router.delete('/me',
  userValidator.validateDeleteUserAccount,
  userController.deleteUserAccount
);

// User status management
router.put('/me/status',
  rateLimiter,
  userValidator.validateUpdateUserStatus,
  userController.updateUserStatus
);

router.get('/:id/status',
  validateUserIdParam,
  cache({ ttl: 60 }), // 1 minute cache
  userController.getUserStatus
);

// User profile routes
router.get('/:id',
  validateUserIdParam,
  cache({ ttl: 300 }), // 5 minutes cache
  userValidator.validateGetUserById,
  userController.getUserById
);

// User search
router.get('/search',
  rateLimiter,
  userValidator.validateSearchUsers,
  userController.searchUsers
);

// Contact management
router.get('/contacts',
  cache({ ttl: 180 }), // 3 minutes cache
  userValidator.validateGetUserContacts,
  userController.getUserContacts
);

router.post('/contacts',
  rateLimiter,
  userValidator.validateAddContact,
  userController.addContact
);

router.delete('/contacts/:id',
  validateIdParam,
  userValidator.validateRemoveContact,
  userController.removeContact
);

router.put('/contacts/:id/favorite',
  validateIdParam,
  userValidator.validateToggleContactFavorite,
  userController.toggleContactFavorite
);

// Contact suggestions
router.get('/suggestions',
  cache({ ttl: 600 }), // 10 minutes cache
  userValidator.validateGetContactSuggestions,
  userController.getContactSuggestions
);

// User blocking
router.get('/blocked',
  cache({ ttl: 300 }), // 5 minutes cache
  userController.getBlockedUsers
);

router.post('/block',
  rateLimiter,
  userValidator.validateBlockUser,
  userController.blockUser
);

router.delete('/blocked/:id',
  validateIdParam,
  userValidator.validateUnblockUser,
  userController.unblockUser
);

// User statistics and activity
router.get('/me/stats',
  cache({ ttl: 600 }), // 10 minutes cache
  userController.getUserStats
);

router.get('/me/activity',
  cache({ ttl: 300 }), // 5 minutes cache
  userValidator.validateGetUserActivity,
  userController.getUserActivity
);

// Privacy settings
router.get('/me/privacy',
  cache({ ttl: 300 }), // 5 minutes cache
  userController.getPrivacySettings
);

router.put('/me/privacy',
  userValidator.validateUpdatePrivacySettings,
  userController.updatePrivacySettings
);

// Data export
router.get('/me/export',
  rateLimiter,
  userValidator.validateExportUserData,
  userController.exportUserData
);

// Admin operations
router.post('/bulk-operations',
  adminMiddleware,
  userValidator.validateBulkUserOperations,
  userController.bulkUserOperations
);

export { router as userRoutes };
