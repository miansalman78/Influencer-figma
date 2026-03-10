/**
 * @format
 */

import { AppRegistry } from 'react-native';
globalThis.RNFB_SILENCE_MODULAR_DEPRECATION_WARNINGS = true;
import App from './App';
import { name as appName } from './app.json';
import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance } from '@notifee/react-native';

// Background handler: show once per message (data-only FCM = no system auto-show, only we display)
const lastShownKey = { key: null, at: 0 };
const DEDUPE_MS = 10000;
messaging().setBackgroundMessageHandler(async remoteMessage => {
  try {
    const convId = remoteMessage?.data?.conversationId || '';
    const msgId = remoteMessage?.data?.messageId || '';
    const key = convId && msgId ? `${convId}:${msgId}` : null;
    if (key && lastShownKey.key === key && (Date.now() - lastShownKey.at) < DEDUPE_MS) return;
    if (key) {
      lastShownKey.key = key;
      lastShownKey.at = Date.now();
    }
    await notifee.createChannel({
      id: 'default',
      name: 'General Notifications',
      importance: AndroidImportance.DEFAULT,
    });
    const title = remoteMessage?.notification?.title || remoteMessage?.data?.title || 'Notification';
    const body = remoteMessage?.notification?.body || remoteMessage?.data?.body || '';
    const notifId = (convId && msgId) ? `msg_${convId}_${msgId}` : `msg_${Date.now()}`;
    await notifee.displayNotification({
      id: notifId,
      title,
      body,
      android: { channelId: 'default', pressAction: { id: 'default' } },
    });
  } catch (e) {
    console.warn('[FCM] Background display error:', e?.message);
  }
});

AppRegistry.registerComponent(appName, () => App);
