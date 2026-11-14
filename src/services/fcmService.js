import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { app, db } from '../firebase';

let messagingInstance = null;

export const initMessaging = async () => {
  try {
    const supported = await isSupported();
    if (!supported) {
      console.info('[FCM] Firebase Messaging not supported in this environment.');
      return null;
    }
    if (!messagingInstance) {
      messagingInstance = getMessaging(app);
    }
    return messagingInstance;
  } catch (error) {
    console.warn('[FCM] Failed to initialize messaging:', error);
    return null;
  }
};

/**
 * Requests push notification permission and registers FCM device token with user's Firestore profile
 */
export const requestNotificationPermissionAndRegister = async (userId) => {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return null;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.info('[FCM] Notification permission denied or dismissed.');
      return null;
    }

    const messaging = await initMessaging();
    if (!messaging) return null;

    // Register service worker if available
    let swRegistration;
    if ('serviceWorker' in navigator) {
      try {
        swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      } catch (swErr) {
        console.warn('[FCM] Service worker registration warning:', swErr);
      }
    }

    const token = await getToken(messaging, {
      serviceWorkerRegistration: swRegistration
    });

    if (token && userId) {
      try {
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, {
          fcmToken: token,
          fcmTokenUpdatedAt: serverTimestamp()
        });
        console.log('[FCM] Device token registered successfully.');
      } catch (dbErr) {
        console.warn('[FCM] Could not write FCM token to user record:', dbErr.message);
      }
    }

    return token;
  } catch (error) {
    console.warn('[FCM] Error requesting notification token:', error);
    return null;
  }
};

/**
 * Listens for incoming FCM messages while app is in foreground
 */
export const setupForegroundFCMListener = async (onMessageReceived) => {
  try {
    const messaging = await initMessaging();
    if (!messaging) return () => {};

    const unsubscribe = onMessage(messaging, (payload) => {
      console.log('[FCM] Foreground message received:', payload);
      if (typeof onMessageReceived === 'function') {
        onMessageReceived(payload);
      }
    });

    return unsubscribe;
  } catch (err) {
    console.warn('[FCM] Could not setup foreground message listener:', err);
    return () => {};
  }
};

