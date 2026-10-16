export type DeploymentEnvironment = 'development' | 'staging' | 'production'

const PRODUCTION_PROJECT_ID = 'incaptta-pro'
const PRODUCTION_RESOURCE_MARKERS = [
  'incaptta-pro.firebaseapp.com',
  'incaptta-pro.firebasestorage.app',
  'us-central1-incaptta-pro.cloudfunctions.net',
]

export function parseDeploymentEnvironment(value: string | undefined): DeploymentEnvironment {
  if (!value) return 'development'
  if (value === 'development' || value === 'staging' || value === 'production') return value
  throw new Error(`Invalid DEPLOYMENT_ENV: ${value}`)
}

export function requireConfigValue(name: string, value: string | undefined): string {
  const normalized = value?.trim()
  if (!normalized) throw new Error(`Missing required deployment configuration: ${name}`)
  return normalized
}

export function assertEnvironmentIsolation(
  environment: DeploymentEnvironment,
  values: Record<string, string>,
): void {
  if (environment !== 'staging') return

  const violations = Object.entries(values).filter(([name, value]) => {
    const normalized = value.toLowerCase()
    if (name.includes('PROJECT_ID') && normalized === PRODUCTION_PROJECT_ID) return true
    return PRODUCTION_RESOURCE_MARKERS.some((marker) =>
      normalized.includes(marker.toLowerCase()),
    )
  })

  if (violations.length > 0) {
    throw new Error(
      `Staging configuration references production resources: ${violations
        .map(([name]) => name)
        .join(', ')}`,
    )
  }
}

export function resolveCredentialProjectId(env: NodeJS.ProcessEnv = process.env): string | undefined {
  for (const name of ['GOOGLE_CLOUD_PROJECT', 'GCLOUD_PROJECT', 'GCP_PROJECT'] as const) {
    const value = env[name]?.trim()
    if (value) return value
  }
  return undefined
}

export function validateProjectMatch(
  configuredProjectId: string,
  credentialProjectId: string | undefined,
): void {
  if (credentialProjectId && credentialProjectId !== configuredProjectId) {
    throw new Error(
      `Firebase credential project ${credentialProjectId} does not match configured project ${configuredProjectId}`,
    )
  }
}
