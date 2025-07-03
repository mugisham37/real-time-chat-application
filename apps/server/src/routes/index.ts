import { Router } from 'express';
import { authRoutes } from './auth.routes';
import { analyticsRoutes } from './analytics.routes';
import { callRoutes } from './call.routes';
import { contentModerationRoutes } from './contentModeration.routes';
import { conversationRoutes } from './conversation.routes';
import { e2eeRoutes } from './e2ee.routes';
import { basicMiddleware, apiMiddleware } from '../middleware';
import { logger } from '../utils/logger';

/**
 * Main Routes Configuration
 * Centralized routing system for the real-time chat application
 */

const router = Router();

// Health check endpoint
router.get('/health', basicMiddleware, (req, res) => {
  res.json({
    success: true,
    message: 'Server is healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// API version info
router.get('/version', basicMiddleware, (req, res) => {
  res.json({
    success: true,
    data: {
      version: process.env.npm_package_version || '1.0.0',
      apiVersion: 'v1',
      environment: process.env.NODE_ENV || 'development',
      features: {
        authentication: true,
        realTimeMessaging: true,
        voiceCalls: true,
        videoCalls: true,
        endToEndEncryption: true,
        contentModeration: true,
        analytics: true
      }
    },
    message: 'API version information'
  });
});

// Mount route modules
router.use('/auth', authRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/calls', callRoutes);
router.use('/moderation', contentModerationRoutes);
router.use('/conversations', conversationRoutes);
router.use('/e2ee', e2eeRoutes);

// API documentation endpoint
router.get('/docs', basicMiddleware, (req, res) => {
  res.json({
    success: true,
    data: {
      endpoints: {
        auth: {
          base: '/api/auth',
          description: 'Authentication and user management',
          endpoints: [
            'POST /register - Register new user',
            'POST /login - User login',
            'POST /logout - User logout',
            'POST /refresh - Refresh access token',
            'GET /me - Get current user profile',
            'PUT /profile - Update user profile',
            'POST /change-password - Change password',
            'POST /forgot-password - Request password reset',
            'POST /reset-password - Reset password with token'
          ]
        },
        analytics: {
          base: '/api/analytics',
          description: 'User activity and system analytics',
          endpoints: [
            'GET /user/:userId/activity - Get user activity',
            'GET /user/:userId/engagement - Get engagement metrics',
            'GET /global/activity - Get global activity (Admin)',
            'GET /system/stats - Get system statistics (Admin)',
            'POST /track - Track custom activity'
          ]
        },
        calls: {
          base: '/api/calls',
          description: 'Voice and video call management',
          endpoints: [
            'POST /initiate - Initiate a call',
            'POST /:callId/answer - Answer a call',
            'POST /:callId/reject - Reject a call',
            'POST /:callId/end - End a call',
            'GET /recent - Get recent calls',
            'GET /active - Get active calls'
          ]
        },
        moderation: {
          base: '/api/moderation',
          description: 'Content moderation and user reports',
          endpoints: [
            'POST /report - Report user or content',
            'GET /reports - Get moderation reports (Moderator)',
            'PUT /reports/:reportId/review - Review report (Moderator)',
            'POST /manual-action - Manual moderation action (Moderator)',
            'GET /stats - Get moderation statistics (Admin)'
          ]
        },
        conversations: {
          base: '/api/conversations',
          description: 'Conversation and messaging management',
          endpoints: [
            'POST / - Create conversation',
            'GET / - Get user conversations',
            'GET /:id - Get conversation details',
            'PUT /:id - Update conversation',
            'DELETE /:id - Delete conversation',
            'GET /:id/messages - Get conversation messages',
            'POST /:id/participants - Add participant',
            'DELETE /:id/participants/:participantId - Remove participant'
          ]
        },
        e2ee: {
          base: '/api/e2ee',
          description: 'End-to-end encryption management',
          endpoints: [
            'POST /generate-keys - Generate key pair',
            'GET /public-key/:userId - Get user public key',
            'POST /session-key - Store session key',
            'GET /session-key/:conversationId - Get session key',
            'POST /encrypt - Encrypt message',
            'POST /decrypt - Decrypt message'
          ]
        }
      }
    },
    message: 'API documentation'
  });
});

// Catch-all for undefined routes
router.use('*', (req, res) => {
  logger.warn('Route not found', {
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(404).json({
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} not found`,
      availableRoutes: [
        '/api/auth',
        '/api/analytics',
        '/api/calls',
        '/api/moderation',
        '/api/conversations',
        '/api/e2ee'
      ]
    }
  });
});

export { router as routes };
export default router;
