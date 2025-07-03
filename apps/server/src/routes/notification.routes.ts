import { Router } from 'express';
import { notificationController } from '../controllers/notification.controller';
import {
  authMiddleware,
  adminMiddleware,
  rateLimiter,
  validateMarkNotificationRead,
  validateNotificationIdParam
} from '../middleware';

/**
 * Notification Routes
 * Handles real-time notifications, preferences, and notification management
 */

const router = Router();

// All notification routes require authentication
router.use(authMiddleware);

// Get user notifications with filtering
router.get('/',
  rateLimiter,
  notificationController.getNotifications
);

// Get unread notifications count
router.get('/unread-count',
  rateLimiter,
  notificationController.getUnreadCount
);

// Mark notification as read
router.put('/:id/read',
  validateNotificationIdParam,
  validateMarkNotificationRead,
  notificationController.markAsRead
);

// Mark all notifications as read
router.put('/mark-all-read',
  rateLimiter,
  notificationController.markAllAsRead
);

// Delete notification
router.delete('/:id',
  validateNotificationIdParam,
  notificationController.deleteNotification
);

// Delete all notifications
router.delete('/all',
  rateLimiter,
  notificationController.deleteAllNotifications
);

// Notification preferences
router.get('/preferences',
  rateLimiter,
  notificationController.getNotificationPreferences
);

router.put('/preferences',
  rateLimiter,
  notificationController.updateNotificationPreferences
);

// Bulk operations
router.put('/bulk/mark-read',
  rateLimiter,
  notificationController.bulkMarkAsRead
);

router.delete('/bulk',
  rateLimiter,
  notificationController.bulkDeleteNotifications
);

// Test notification
router.post('/test',
  rateLimiter,
  notificationController.testNotification
);

// Get delivery status
router.get('/:id/delivery-status',
  validateNotificationIdParam,
  notificationController.getDeliveryStatus
);

// Push notification subscription
router.post('/push/subscribe',
  rateLimiter,
  notificationController.subscribeToPush
);

router.delete('/push/unsubscribe',
  rateLimiter,
  notificationController.unsubscribeFromPush
);

// Admin operations
router.post('/create',
  adminMiddleware,
  notificationController.createNotification
);

router.get('/stats',
  adminMiddleware,
  notificationController.getNotificationStats
);

router.post('/cleanup',
  adminMiddleware,
  notificationController.cleanupOldNotifications
);

export { router as notificationRoutes };
