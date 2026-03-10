const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { authenticate } = require('../middleware/auth');
const { validatePagination, validateObjectId } = require('../middleware/validation');

// All routes require authentication
router.get('/unread-count', authenticate, notificationController.getUnreadCount);
router.patch('/read-all', authenticate, notificationController.markAllAsRead);
router.get('/', authenticate, validatePagination, notificationController.getNotifications);
router.patch('/:id/read', authenticate, validateObjectId('id'), notificationController.markAsRead);
router.post('/test', authenticate, notificationController.sendTestNotification);

module.exports = router;
