/**
 * @format
 */

import { AppRegistry } from 'react-native';
globalThis.RNFB_SILENCE_MODULAR_DEPRECATION_WARNINGS = true;
import App from './App';
import { name as appName } from './app.json';
import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance } from '@notifee/react-native';

// Background handler for FCM data-only messages (Android)
// Keeps silent processing without altering UI styling
messaging().setBackgroundMessageHandler(async remoteMessage => {
  // Minimal log to confirm receipt
  console.log('[FCM] Background message', remoteMessage?.messageId || '');
  try {
    // Ensure default channel exists
    await notifee.createChannel({
      id: 'default',
      name: 'General Notifications',
      importance: AndroidImportance.DEFAULT,
    });
    // Prefer notification payload; otherwise build from data
    const title = remoteMessage?.notification?.title || remoteMessage?.data?.title || 'Notification';
    const body = remoteMessage?.notification?.body || remoteMessage?.data?.body || '';
    await notifee.displayNotification({
      title,
      body,
      android: {
        channelId: 'default',
        pressAction: { id: 'default' },
      },
    });
  } catch (e) {
    console.warn('[FCM] Background display error:', e?.message);
  }
});

AppRegistry.registerComponent(appName, () => App);
