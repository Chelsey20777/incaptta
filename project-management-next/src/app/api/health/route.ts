import { NextResponse } from 'next/server'
import {
  assertEnvironmentIsolation,
  parseDeploymentEnvironment,
  requireConfigValue,
} from '@/lib/deployment-config'

export const dynamic = 'force-dynamic'

export function GET() {
  const environment = parseDeploymentEnvironment(process.env.DEPLOYMENT_ENV)
  const firebaseProjectId = requireConfigValue('FIREBASE_PROJECT_ID', process.env.FIREBASE_PROJECT_ID)
  const legacyApiBaseUrl = requireConfigValue('LEGACY_API_BASE_URL', process.env.LEGACY_API_BASE_URL)

  assertEnvironmentIsolation(environment, {
    FIREBASE_PROJECT_ID: firebaseProjectId,
    LEGACY_API_BASE_URL: legacyApiBaseUrl,
  })

  let legacyApiHost = legacyApiBaseUrl
  try {
    legacyApiHost = new URL(legacyApiBaseUrl).host
  } catch {
    // Keep the raw value so CI can still reject a malformed Functions URL.
  }

  return NextResponse.json(
    {
      status: 'ok',
      environment,
      firebaseProjectId,
      legacyApiHost,
      allowRealEmail: process.env.ALLOW_REAL_EMAIL === 'true',
      enableScheduledJobs: process.env.ENABLE_SCHEDULED_JOBS === 'true',
      release: process.env.NEXT_PUBLIC_APP_BUILD_VERSION || process.env.K_REVISION || 'unknown',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
