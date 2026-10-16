import {
  assertEnvironmentIsolation,
  parseDeploymentEnvironment,
  requireConfigValue,
} from '@/lib/deployment-config'

export const dynamic = 'force-dynamic'

export function GET() {
  const environment = parseDeploymentEnvironment(process.env.DEPLOYMENT_ENV)
  const config = {
    apiKey: requireConfigValue('NEXT_PUBLIC_FIREBASE_API_KEY', process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
    authDomain: requireConfigValue('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
    projectId: requireConfigValue('NEXT_PUBLIC_FIREBASE_PROJECT_ID', process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
    storageBucket: requireConfigValue('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET', process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET),
    messagingSenderId: requireConfigValue('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID', process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
    appId: requireConfigValue('NEXT_PUBLIC_FIREBASE_APP_ID', process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
  }

  assertEnvironmentIsolation(environment, config)

  return new Response(`self.__FIREBASE_CONFIG__ = ${JSON.stringify(config)};`, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
