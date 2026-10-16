const environment = process.env.DEPLOYMENT_ENV
const required = [
  'DEPLOYMENT_ENV',
  'FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
  'LEGACY_API_BASE_URL',
]

const missing = required.filter((name) => !process.env[name]?.trim())
if (missing.length) {
  throw new Error(`Missing required deployment configuration: ${missing.join(', ')}`)
}

if (!['development', 'staging', 'production'].includes(environment)) {
  throw new Error(`Invalid DEPLOYMENT_ENV: ${environment}`)
}

if (process.env.FIREBASE_PROJECT_ID !== process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
  throw new Error('Server and browser Firebase project IDs do not match')
}

if (environment === 'staging') {
  const forbiddenResources = [
    'incaptta-pro.firebaseapp.com',
    'incaptta-pro.firebasestorage.app',
    'us-central1-incaptta-pro.cloudfunctions.net',
  ]
  const violations = required.filter((name) => {
    const value = process.env[name]?.toLowerCase() || ''
    if (name.includes('PROJECT_ID') && value === 'incaptta-pro') return true
    return forbiddenResources.some((marker) => value.includes(marker.toLowerCase()))
  })
  if (violations.length) {
    throw new Error(`Staging references production resources: ${violations.join(', ')}`)
  }
  if (process.env.ALLOW_REAL_EMAIL === 'true' || process.env.ENABLE_SCHEDULED_JOBS === 'true') {
    throw new Error('Staging cannot enable real email or scheduled jobs')
  }
}

console.log(`Deployment configuration is safe for ${environment}`)
