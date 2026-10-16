// Import and configure the Firebase SDK inside the service worker
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyACvXyeSdEkpWXIPoV1sBXH8h84XNjBtSo",
  authDomain: "incaptta-pro.firebaseapp.com",
  projectId: "incaptta-pro",
  storageBucket: "incaptta-pro.firebasestorage.app",
  messagingSenderId: "408940478113",
  appId: "1:408940478113:web:8ea03252b84d1e29e7bae0"
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/icons/icon-192-maskable.png',
    badge: '/icons/icon-192-maskable.png',
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// PWA Assets Caching
const CACHE_NAME = 'incapttachat-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/icons/icon-192-maskable.png',
  '/icons/icon-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request);
    })
  );
});
