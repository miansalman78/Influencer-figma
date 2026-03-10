/**
 * Notifications: one in-app record + one FCM per logical event.
 * Message notifications use notifyNewMessage(); other events use createNotification().
 */

const Notification = require('../models/Notification');
const User = require('../models/User');
const { firebaseAdmin } = require('../config/firebase');

const toStr = (v) => (v == null ? null : (typeof v === 'string' ? v : (v && v.toString ? v.toString() : String(v))));

// Lock per (recipientId, messageId) so concurrent requests for same message only create one notification
const messageNotifyLocks = new Map();
function withMessageLock(recipientId, messageId, fn) {
  const key = `${toStr(recipientId)}:${toStr(messageId)}`;
  let p = messageNotifyLocks.get(key);
  if (!p) p = Promise.resolve();
  const next = p.then(() => fn()).finally(() => {
    if (messageNotifyLocks.get(key) === next) messageNotifyLocks.delete(key);
  });
  messageNotifyLocks.set(key, next);
  return next;
}

/**
 * Send exactly one notification for a new message. One document per (recipient, conversation, messageId); one FCM send only when we create.
 * Lock prevents race; dedupe by body in 10s catches double-send with different messageIds.
 */
async function notifyNewMessage({ recipientId, conversationId, messageId, messageText, actorId }) {
  if (!recipientId || !conversationId || !messageId) return null;
  const body = (messageText && messageText.length > 50) ? `${messageText.substring(0, 50)}...` : (messageText || 'New message');
  const data = { conversationId: toStr(conversationId), messageId: toStr(messageId) };

  return withMessageLock(recipientId, messageId, async () => {
    try {
      const existing = await Notification.findOne({
        userId: recipientId,
        type: 'message_new',
        'data.conversationId': toStr(conversationId),
        'data.messageId': toStr(messageId),
      });
      if (existing) return existing;

      // Same conversation + same body within 10s = treat as duplicate (e.g. double-send, two messageIds)
      const bodyTrim = String(body).trim();
      if (bodyTrim) {
        const recent = await Notification.findOne({
          userId: recipientId,
          type: 'message_new',
          'data.conversationId': toStr(conversationId),
          body: bodyTrim,
          createdAt: { $gte: new Date(Date.now() - 10000) },
        });
        if (recent) return recent;
      }

      let notification;
      try {
        notification = await Notification.create({
          userId: recipientId,
          type: 'message_new',
          title: 'New Message',
          body,
          data,
          actorId: actorId || null,
        });
      } catch (createErr) {
        if (createErr.code === 11000) {
          const existing = await Notification.findOne({
            userId: recipientId,
            type: 'message_new',
            'data.conversationId': toStr(conversationId),
            'data.messageId': toStr(messageId),
          });
          return existing || null;
        }
        throw createErr;
      }

      if (firebaseAdmin) {
        const user = await User.findById(recipientId).select('fcmToken');
        if (user && user.fcmToken) {
          // Data-only FCM: no "notification" payload so Android does not auto-show.
          // Only our code shows (onMessage foreground / setBackgroundMessageHandler background) = exactly one display.
          const stringData = {
            conversationId: data.conversationId,
            messageId: data.messageId,
            type: 'message_new',
            title: 'New Message',
            body: body || 'New message',
          };
          await firebaseAdmin.messaging().send({
            data: stringData,
            token: user.fcmToken,
          });
        }
      }
      return notification;
    } catch (err) {
      console.error('[notificationHelpers] notifyNewMessage error:', err.message);
      return null;
    }
  });
}

/**
 * Create a notification for non-message events (proposals, orders, etc.). Dedupe by dedupeData; send FCM only when creating.
 */
async function createNotification({ userId, type, title, body = '', data = {}, actorId = null, dedupeData = null }) {
  if (!userId || !type || !title) return null;
  try {
    if (dedupeData && typeof dedupeData === 'object' && Object.keys(dedupeData).length > 0) {
      const q = { userId, type };
      Object.keys(dedupeData).forEach((k) => {
        const v = dedupeData[k];
        if (v !== undefined && v !== null) q[`data.${k}`] = toStr(v);
      });
      const existing = await Notification.findOne(q);
      if (existing) return existing;
    }

    const notification = await Notification.create({
      userId,
      type,
      title,
      body,
      data,
      actorId,
    });

    if (firebaseAdmin) {
      try {
        const user = await User.findById(userId).select('fcmToken');
        if (user && user.fcmToken) {
          const stringData = {};
          Object.keys(data || {}).forEach((k) => {
            const v = data[k];
            stringData[k] = v == null ? '' : (typeof v === 'string' ? v : String(v));
          });
          stringData.type = type;
          await firebaseAdmin.messaging().send({
            notification: { title, body },
            data: stringData,
            token: user.fcmToken,
          });
        }
      } catch (fcmErr) {
        console.warn('[notificationHelpers] FCM send failed:', fcmErr.message);
      }
    }
    return notification;
  } catch (err) {
    console.error('[notificationHelpers] createNotification error:', err.message);
    return null;
  }
}

module.exports = {
  notifyNewMessage,
  createNotification,
};
