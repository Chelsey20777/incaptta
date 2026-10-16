// FCM background handler only. PWA installability uses /sw.js.
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: 'AIzaSyACvXyeSdEkpWXIPoV1sBXH8h84XNjBtSo',
  authDomain: 'incaptta-pro.firebaseapp.com',
  projectId: 'incaptta-pro',
  storageBucket: 'incaptta-pro.firebasestorage.app',
  messagingSenderId: '408940478113',
  appId: '1:408940478113:web:8ea03252b84d1e29e7bae0',
})

const messaging = firebase.messaging()

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload)

  const notificationTitle = payload.notification?.title || 'MBDI'
  const notificationOptions = {
    body: payload.notification?.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
  }

  self.registration.showNotification(notificationTitle, notificationOptions)
})
