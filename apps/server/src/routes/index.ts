import { Router, Request, Response } from 'express';
import { authRoutes } from './auth.routes';
import { analyticsRoutes } from './analytics.routes';
import { callRoutes } from './call.routes';
import { contentModerationRoutes } from './contentModeration.routes';
import { conversationRoutes } from './conversation.routes';
import { e2eeRoutes } from './e2ee.routes';
import { fileManagementRoutes } from './fileManagement.routes';
import { groupRoutes } from './group.routes';
import { groupInvitationRoutes } from './groupInvitation.routes';
import { groupJoinRequestRoutes } from './groupJoinRequest.routes';
import { messageRoutes } from './message.routes';
import { notificationRoutes } from './notification.routes';
import { presenceRoutes } from './presence.routes';
import { scheduledMessageRoutes } from './scheduledMessage.routes';
import { userRoutes } from './user.routes';
import { basicMiddleware, apiMiddleware } from '../middleware';
import { logger } from '../utils/logger';

/**
 * Main Routes Configuration
 * Centralized routing system for the real-time chat application
 */

const router = Router();

// Health check endpoint
router.get('/health', basicMiddleware, (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Server is healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// API version info
router.get('/version', basicMiddleware, (req: Request, res: Response) => {
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
router.use('/files', fileManagementRoutes);
router.use('/groups', groupRoutes);
router.use('/group-invitations', groupInvitationRoutes);
router.use('/group-join-requests', groupJoinRequestRoutes);
router.use('/messages', messageRoutes);
router.use('/notifications', notificationRoutes);
router.use('/presence', presenceRoutes);
router.use('/scheduled-messages', scheduledMessageRoutes);
router.use('/users', userRoutes);

// API documentation endpoint
router.get('/docs', basicMiddleware, (req: Request, res: Response) => {
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
        },
        files: {
          base: '/api/files',
          description: 'File management and sharing',
          endpoints: [
            'POST /upload - Upload file',
            'GET /:fileId - Get file metadata',
            'GET /:fileId/download - Download file',
            'DELETE /:fileId - Delete file',
            'POST /:fileId/share - Share file',
            'GET /my-files - Get user files',
            'GET /search - Search files'
          ]
        },
        groups: {
          base: '/api/groups',
          description: 'Group management and operations',
          endpoints: [
            'POST / - Create group',
            'GET /:id - Get group details',
            'PUT /:id - Update group',
            'DELETE /:id - Delete group',
            'POST /:id/join - Join group',
            'POST /:id/leave - Leave group',
            'GET /my-groups - Get user groups',
            'GET /search - Search public groups'
          ]
        },
        groupInvitations: {
          base: '/api/group-invitations',
          description: 'Group invitation management',
          endpoints: [
            'POST / - Create invitation',
            'GET /pending - Get pending invitations',
            'POST /:id/accept - Accept invitation',
            'POST /:id/reject - Reject invitation',
            'DELETE /:id - Cancel invitation',
            'POST /bulk - Bulk invite users'
          ]
        },
        groupJoinRequests: {
          base: '/api/group-join-requests',
          description: 'Group join request management',
          endpoints: [
            'POST / - Create join request',
            'GET /my-requests - Get user requests',
            'POST /:id/approve - Approve request',
            'POST /:id/reject - Reject request',
            'DELETE /:id - Cancel request',
            'POST /bulk-approve - Bulk approve requests'
          ]
        },
        messages: {
          base: '/api/messages',
          description: 'Message management and operations',
          endpoints: [
            'POST / - Create message',
            'GET /:id - Get message',
            'PUT /:id - Update message',
            'DELETE /:id - Delete message',
            'POST /:id/reactions - Add reaction',
            'DELETE /:id/reactions/:reactionType - Remove reaction',
            'POST /:id/read - Mark as read',
            'GET /search - Search messages',
            'GET /conversations/:conversationId/stats - Get conversation stats',
            'GET /my-stats - Get user message stats'
          ]
        },
        notifications: {
          base: '/api/notifications',
          description: 'Notification management and preferences',
          endpoints: [
            'GET / - Get notifications',
            'GET /unread-count - Get unread count',
            'PUT /:id/read - Mark as read',
            'PUT /mark-all-read - Mark all as read',
            'DELETE /:id - Delete notification',
            'DELETE /all - Delete all notifications',
            'GET /preferences - Get preferences',
            'PUT /preferences - Update preferences',
            'POST /push/subscribe - Subscribe to push notifications'
          ]
        },
        presence: {
          base: '/api/presence',
          description: 'User presence and activity status',
          endpoints: [
            'PUT /status - Update presence status',
            'GET /user/:userId - Get user presence',
            'POST /users - Get multiple users presence',
            'GET /online - Get online users',
            'GET /online/count - Get online users count',
            'POST /typing - Set typing indicator',
            'GET /typing/:conversationId - Get typing users',
            'PUT /activity - Set activity status',
            'PUT /location - Update location'
          ]
        },
        scheduledMessages: {
          base: '/api/scheduled-messages',
          description: 'Scheduled message management and automation',
          endpoints: [
            'POST / - Schedule a message',
            'GET /my-messages - Get user scheduled messages',
            'PUT /:id - Update scheduled message',
            'DELETE /:id - Cancel scheduled message',
            'GET /stats - Get scheduled message statistics',
            'GET /conversation/:conversationId - Get conversation scheduled messages',
            'POST /bulk-cancel - Bulk cancel scheduled messages',
            'GET /upcoming - Get upcoming scheduled messages',
            'POST /:id/reschedule - Reschedule message'
          ]
        },
        users: {
          base: '/api/users',
          description: 'User profile management and operations',
          endpoints: [
            'GET /me - Get current user profile',
            'PUT /me - Update current user profile',
            'GET /:id - Get user by ID',
            'PUT /me/status - Update user status',
            'GET /:id/status - Get user status',
            'GET /search - Search users',
            'GET /contacts - Get user contacts',
            'POST /contacts - Add contact',
            'DELETE /contacts/:id - Remove contact',
            'GET /blocked - Get blocked users',
            'POST /block - Block user',
            'DELETE /blocked/:id - Unblock user',
            'GET /me/export - Export user data'
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
        '/api/e2ee',
        '/api/files',
        '/api/groups',
        '/api/group-invitations',
        '/api/group-join-requests',
        '/api/messages',
        '/api/notifications',
        '/api/presence',
        '/api/scheduled-messages',
        '/api/users'
      ]
    }
  });
});

export { router as routes };
export default router;
