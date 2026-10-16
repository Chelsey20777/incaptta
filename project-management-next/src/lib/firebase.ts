import { initializeApp, getApps } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { initializeFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { getMessaging, isSupported } from 'firebase/messaging'
import {
  assertEnvironmentIsolation,
  parseDeploymentEnvironment,
  requireConfigValue,
} from './deployment-config'

const deploymentEnvironment = parseDeploymentEnvironment(process.env.NEXT_PUBLIC_DEPLOYMENT_ENV)
const firebaseConfig = {
  apiKey: requireConfigValue('NEXT_PUBLIC_FIREBASE_API_KEY', process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
  authDomain: requireConfigValue('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
  projectId: requireConfigValue('NEXT_PUBLIC_FIREBASE_PROJECT_ID', process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
  storageBucket: requireConfigValue('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET', process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: requireConfigValue('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID', process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
  appId: requireConfigValue('NEXT_PUBLIC_FIREBASE_APP_ID', process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
}

assertEnvironmentIsolation(deploymentEnvironment, firebaseConfig)

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
