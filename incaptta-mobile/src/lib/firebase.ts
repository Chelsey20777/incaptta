import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { initializeFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
    apiKey: "AIzaSyACvXyeSdEkpWXIPoV1sBXH8h84XNjBtSo",
    authDomain: "incaptta-pro.firebaseapp.com",
    projectId: "incaptta-pro",
    storageBucket: "incaptta-pro.firebasestorage.app",
    messagingSenderId: "408940478113",
    appId: "1:408940478113:web:72e39b9ca3aff4b8e7bae0"
};

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = initializeFirestore(app, {
    experimentalForceLongPolling: true,
})
export const storage = getStorage(app)

export default app
