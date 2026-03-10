const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { notifyNewMessage } = require('../utils/notificationHelpers');
const { admin, firebaseAdmin } = require('../config/firebase');

router.get('/token', authenticate, async (req, res) => {
  try {
    if (!firebaseAdmin) {
      return res.status(503).json({
        success: false,
        message: 'Firebase Admin SDK not initialized'
      });
    }
    const userId = req.user._id.toString();
    const customToken = await admin.auth().createCustomToken(userId);
    res.json({
      success: true,
      message: 'Firebase token generated successfully',
      data: { token: customToken, userId }
    });
  } catch (error) {
    console.error('[Messages] Failed to generate Firebase token:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate Firebase token',
      error: error.message
    });
  }
});

/**
 * POST /api/messages/notify
 * One notification per message. Body: { recipientId, messageText, conversationId, messageId }.
 * messageId is required so the backend can guarantee one notification per message.
 */
router.post('/notify', authenticate, async (req, res) => {
  try {
    const { recipientId, messageText, conversationId, messageId } = req.body;

    if (!recipientId || !conversationId || !messageId) {
      return res.status(400).json({
        success: false,
        message: 'recipientId, conversationId, and messageId are required'
      });
    }

    await notifyNewMessage({
      recipientId,
      conversationId,
      messageId,
      messageText: messageText || 'New message',
      actorId: req.user._id,
    });

    res.json({ success: true, message: 'Notification sent successfully' });
  } catch (error) {
    console.error('Error sending message notification:', error);
    res.status(500).json({ success: false, message: 'Failed to send notification' });
  }
});

module.exports = router;
