import { spawnSync } from 'node:child_process'

const STAGING_PROJECT_ID = 'incaptta-pro-staging'
const requestedProject = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT

if (requestedProject && requestedProject !== STAGING_PROJECT_ID) {
  console.error(
    `Refusing staging backend deploy: FIREBASE_PROJECT_ID/GCLOUD_PROJECT is ${requestedProject}, expected ${STAGING_PROJECT_ID}`,
  )
  process.exit(1)
}

if (process.argv.slice(2).some((arg) => arg.includes('incaptta-pro') && !arg.includes('staging'))) {
  console.error('Refusing staging backend deploy: arguments reference the production project')
  process.exit(1)
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

run('npm', ['run', 'stage:functions'])
run('npx', [
  'firebase',
  'deploy',
  '--only',
  'functions,firestore,storage',
  '--project',
  STAGING_PROJECT_ID,
  '--non-interactive',
])

console.log(`Deployed functions, rules, and indexes to ${STAGING_PROJECT_ID}`)
