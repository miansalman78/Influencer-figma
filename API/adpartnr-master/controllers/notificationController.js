const Notification = require('../models/Notification');
const { successResponse, errorResponse, notFoundResponse } = require('../utils/response');
const { applyPagination } = require('../utils/pagination');
const { createNotification } = require('../utils/notificationHelpers');

/**
 * GET /api/notifications
 * List notifications for the authenticated user (creator or brand).
 * Query: page, limit, read (true|false|all)
 */
const getNotifications = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page, limit, read } = req.query;

    let query = Notification.find({ userId }).sort({ createdAt: -1 });

    if (read === 'true' || read === true) {
      query = query.where({ read: true });
    } else if (read === 'false' || read === false) {
      query = query.where({ read: false });
    }

    const { data, pagination } = await applyPagination(query, page, limit);
    return successResponse(res, { notifications: data, pagination }, 'Notifications retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

/**
 * GET /api/notifications/unread-count
 * Return count of unread notifications for the current user.
 */
const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user._id;
    const count = await Notification.countDocuments({ userId, read: false });
    return successResponse(res, { count }, 'Unread count retrieved');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

/**
 * PATCH /api/notifications/:id/read
 * Mark a single notification as read.
 */
const markAsRead = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const notification = await Notification.findOne({ _id: id, userId });
    if (!notification) {
      return notFoundResponse(res, 'Notification not found');
    }

    notification.read = true;
    await notification.save();
    return successResponse(res, notification, 'Notification marked as read');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

/**
 * PATCH /api/notifications/read-all
 * Mark all notifications for the current user as read.
 */
const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user._id;
    const result = await Notification.updateMany({ userId, read: false }, { read: true });
    return successResponse(res, { modifiedCount: result.modifiedCount }, 'All notifications marked as read');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

/**
 * POST /api/notifications/test
 * Send a test notification to the authenticated user (also triggers FCM if configured)
 */
const sendTestNotification = async (req, res) => {
  try {
    const userId = req.user._id;
    const notif = await createNotification({
      userId,
      type: 'general',
      title: 'Test Notification',
      body: 'This is a test push notification.',
      data: { source: 'test_push' },
      actorId: userId
    });
    return successResponse(res, { notification: notif }, 'Test notification sent');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  sendTestNotification,
};
