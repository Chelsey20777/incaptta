import { getApps, initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

if (!getApps().length) {
  try {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
    if (serviceAccountKey) {
      const config = JSON.parse(serviceAccountKey)
      initializeApp({
        credential: cert(config),
      })
    } else {
      initializeApp()
    }
  } catch (err) {
    console.error('Failed to initialize Firebase Admin SDK:', err)
  }
}

export const adminAuth = getAuth()
export const adminDb = getFirestore()
