import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyACvXyeSdEkpWXIPoV1sBXH8h84XNjBtSo",
  authDomain: "incaptta-pro.firebaseapp.com",
  projectId: "incaptta-pro",
  storageBucket: "incaptta-pro.firebasestorage.app",
  messagingSenderId: "408940478113",
  appId: "1:408940478113:web:3258e315c3ec0e7de7bae0"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Enable auth persistence for mobile sessions
setPersistence(auth, browserLocalPersistence).catch((error) => {
    console.error('Auth persistence error:', error);
});

export const db = initializeFirestore(app, {
    experimentalForceLongPolling: true,
});
export const storage = getStorage(app);

export default app;
