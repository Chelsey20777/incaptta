import { initializeApp, getApps } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { initializeFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { getMessaging, isSupported } from 'firebase/messaging'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyACvXyeSdEkpWXIPoV1sBXH8h84XNjBtSo",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "incaptta-pro.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "incaptta-pro",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "incaptta-pro.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "408940478113",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:408940478113:web:8ea03252b84d1e29e7bae0"
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]

export const auth = getAuth(app)
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
})
export const storage = getStorage(app)

// Messaging is only available in browser environments
let messagingInstance: ReturnType<typeof getMessaging> | null = null
export const getMessagingInstance = async () => {
  if (typeof window !== 'undefined' && await isSupported()) {
    if (!messagingInstance) {
      messagingInstance = getMessaging(app)
    }
    return messagingInstance
  }
  return null
}

export default app
