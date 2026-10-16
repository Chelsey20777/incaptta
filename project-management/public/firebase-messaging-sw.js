importScripts('https://www.gstatic.com/firebasejs/11.3.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.3.1/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyACvXyeSdEkpWXIPoV1sBXH8h84XNjBtSo",
    authDomain: "incaptta-pro.firebaseapp.com",
    projectId: "incaptta-pro",
    storageBucket: "incaptta-pro.firebasestorage.app",
    messagingSenderId: "408940478113",
    appId: "1:408940478113:web:8ea03252b84d1e29e7bae0"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);
    
    // Customize notification here if needed
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: '/pwa-192x192.png',
        badge: '/pwa-96x96.png',
        data: payload.data,
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});
