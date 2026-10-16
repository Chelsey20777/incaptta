import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import ts from 'typescript'

const load = (relative) => {
  const source = fs.readFileSync(new URL(relative, import.meta.url), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
}

const base = {
  DEPLOYMENT_ENV: 'staging',
  FIREBASE_PROJECT_ID: 'incaptta-pro-staging',
  NEXT_PUBLIC_FIREBASE_API_KEY: 'test-key',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'incaptta-pro-staging.firebaseapp.com',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'incaptta-pro-staging',
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'incaptta-pro-staging.firebasestorage.app',
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
  NEXT_PUBLIC_FIREBASE_APP_ID: '1:000000000000:web:test',
  LEGACY_API_BASE_URL: 'https://us-central1-incaptta-pro-staging.cloudfunctions.net/api',
  ALLOW_REAL_EMAIL: 'false',
  ENABLE_SCHEDULED_JOBS: 'false',
}

function check(overrides = {}) {
  return spawnSync(process.execPath, ['scripts/check-deployment-config.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, ...base, ...overrides },
    encoding: 'utf8',
  })
}

assert.equal(check().status, 0, 'safe staging configuration should pass')
assert.notEqual(
  check({ FIREBASE_PROJECT_ID: 'incaptta-pro', NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'incaptta-pro' }).status,
  0,
  'production project IDs must be rejected in staging',
)
assert.notEqual(
  check({ LEGACY_API_BASE_URL: 'https://us-central1-incaptta-pro.cloudfunctions.net/api' }).status,
  0,
  'production API URLs must be rejected in staging',
)
assert.notEqual(
  check({ ALLOW_REAL_EMAIL: 'true' }).status,
  0,
  'real outbound email must be rejected in staging',
)
assert.notEqual(
  check({ ENABLE_SCHEDULED_JOBS: 'true' }).status,
  0,
  'scheduled jobs must be rejected in staging',
)

const isolation = await load('../src/lib/deployment-config.ts')
assert.equal(
  isolation.resolveCredentialProjectId({ GCLOUD_PROJECT: 'incaptta-pro-staging' }),
  'incaptta-pro-staging',
)
assert.equal(isolation.resolveCredentialProjectId({}), undefined)
isolation.validateProjectMatch('incaptta-pro-staging', undefined)
isolation.validateProjectMatch('incaptta-pro-staging', 'incaptta-pro-staging')
assert.throws(
  () => isolation.validateProjectMatch('incaptta-pro-staging', 'incaptta-pro'),
  /does not match/,
)

console.log('Deployment isolation tests passed')
