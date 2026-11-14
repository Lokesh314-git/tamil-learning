/* eslint-disable no-undef */
// Firebase Messaging Service Worker for background push notifications
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyALJkLtYmUncwLzzxA1lCzBD_4uhtAG9AE",
  authDomain: "tamil-learning-9f609.firebaseapp.com",
  projectId: "tamil-learning-9f609",
  storageBucket: "tamil-learning-9f609.firebasestorage.app",
  messagingSenderId: "1001786235235",
  appId: "1:1001786235235:web:a5b9ac1c24a1b15111db56",
  measurementId: "G-NX4TFD061T"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notificationTitle = payload.notification?.title || payload.data?.title || 'Tamil Learning Notification';
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.body || 'New educational update received.',
    icon: '/icon.png',
    badge: '/icon.png',
    data: payload.data || {},
    tag: payload.data?.type || 'general-notification'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetRoute = event.notification.data?.route || event.notification.data?.link || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          if (client.url !== targetRoute && 'navigate' in client) {
            client.navigate(targetRoute);
          }
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetRoute);
      }
    })
  );
});

