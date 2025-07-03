import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import {
  authRoutesMiddleware,
  authMiddleware,
  optionalAuthMiddleware,
  validateLogin,
  validateRegister,
  rateLimiter,
  authRateLimiter,
  bruteForceProtection
} from '../middleware';

/**
 * Authentication Routes
 * Handles user authentication, registration, and session management
 */

const router = Router();

// Public authentication routes (no auth required)
router.post('/register', 
  authRoutesMiddleware,
  validateRegister,
  authController.register
);

router.post('/login',
  authRoutesMiddleware,
  validateLogin,
  bruteForceProtection({
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
    blockDurationMs: 30 * 60 * 1000 // 30 minutes
  }),
  authController.login
);

router.post('/refresh',
  authRoutesMiddleware,
  authController.refreshToken
);

router.post('/forgot-password',
  authRoutesMiddleware,
  authController.requestPasswordReset
);

router.post('/reset-password',
  authRoutesMiddleware,
  authController.resetPassword
);

router.get('/status',
  optionalAuthMiddleware,
  authController.getAuthStatus
);

// Protected authentication routes (auth required)
router.post('/logout',
  authMiddleware,
  authController.logout
);

router.post('/logout-all',
  authMiddleware,
  authController.logoutFromAllDevices
);

router.post('/change-password',
  authMiddleware,
  authController.changePassword
);

router.get('/me',
  authMiddleware,
  authController.getCurrentUser
);

router.get('/verify',
  authMiddleware,
  authController.verifyToken
);

router.put('/profile',
  authMiddleware,
  authController.updateProfile
);

router.delete('/account',
  authMiddleware,
  authController.deleteAccount
);

// Session management routes
router.get('/sessions',
  authMiddleware,
  authController.getUserSessions
);

router.delete('/sessions/:sessionId',
  authMiddleware,
  authController.revokeSession
);

// Two-factor authentication routes
router.post('/2fa/enable',
  authMiddleware,
  authController.enableTwoFactor
);

router.post('/2fa/disable',
  authMiddleware,
  authController.disableTwoFactor
);

router.post('/2fa/verify',
  authRoutesMiddleware,
  authController.verifyTwoFactor
);

export { router as authRoutes };
