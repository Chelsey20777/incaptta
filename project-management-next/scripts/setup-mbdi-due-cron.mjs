/**
 * Create/update Cloud Scheduler job for MBDI due-date reminders.
 *
 * Requires:
 *   FIREBASE_SERVICE_ACCOUNT_KEY in env (full JSON)
 *   CRON_SECRET in env
 *   MBDI_CRON_URL in env (required unless the project is incaptta-pro)
 *
 * Usage:
 *   node --env-file=.env project-management-next/scripts/setup-mbdi-due-cron.mjs
 */
import { GoogleAuth } from 'google-auth-library'

const PROJECT = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || process.env.FIREBASE_PROJECT_ID
if (!PROJECT) {
  console.error('Missing GCLOUD_PROJECT / GCP_PROJECT / FIREBASE_PROJECT_ID')
  process.exit(1)
}

const LOCATION = process.env.SCHEDULER_LOCATION || 'europe-west4'
const JOB_ID = 'mbdi-due-reminders-daily'
const PRODUCTION_CRON_URL =
  'https://incaptta-projects--incaptta-pro.europe-west4.hosted.app/api/cron/mbdi-due-reminders'
const DEFAULT_URL = process.env.MBDI_CRON_URL || (PROJECT === 'incaptta-pro' ? PRODUCTION_CRON_URL : '')

if (!DEFAULT_URL) {
  console.error('Missing MBDI_CRON_URL for non-production project')
  process.exit(1)
}

if (PROJECT === 'incaptta-pro-staging' && DEFAULT_URL.includes('incaptta-pro.europe-west4')) {
  console.error('Staging cannot register the production MBDI cron URL')
  process.exit(1)
}

const cronSecret = process.env.CRON_SECRET
if (!cronSecret) {
  console.error('Missing CRON_SECRET')
  process.exit(1)
}

const keyRaw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
if (!keyRaw) {
  console.error('Missing FIREBASE_SERVICE_ACCOUNT_KEY')
  process.exit(1)
}

const credentials = JSON.parse(keyRaw)
const auth = new GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
})

const client = await auth.getClient()
const token = await client.getAccessToken()
const accessToken = token.token
if (!accessToken) {
  console.error('Failed to obtain access token')
  process.exit(1)
}

const parent = `projects/${PROJECT}/locations/${LOCATION}`
const jobName = `${parent}/jobs/${JOB_ID}`
const base = `https://cloudscheduler.googleapis.com/v1/${parent}/jobs`

const jobBody = {
  name: jobName,
  description: 'Daily MBDI due-date reminders (7/3/1 days) to owners and managers',
  schedule: '0 7 * * *',
  timeZone: 'Africa/Harare',
  httpTarget: {
    uri: DEFAULT_URL,
    httpMethod: 'POST',
    headers: {
      Authorization: `Bearer ${cronSecret}`,
      'Content-Type': 'application/json',
    },
    body: Buffer.from('{}').toString('base64'),
  },
  attemptDeadline: '320s',
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    json = { raw: text }
  }
  return { ok: res.ok, status: res.status, json }
}

// Try update first; if not found, create
const patch = await api(
  'PATCH',
  `https://cloudscheduler.googleapis.com/v1/${jobName}?updateMask=description,schedule,timeZone,httpTarget,attemptDeadline`,
  jobBody
)

if (patch.ok) {
  console.log('Updated Cloud Scheduler job:', jobName)
  console.log(JSON.stringify({ uri: DEFAULT_URL, schedule: jobBody.schedule, timeZone: jobBody.timeZone }, null, 2))
  process.exit(0)
}

if (patch.status === 404 || patch.json?.error?.status === 'NOT_FOUND') {
  const create = await api('POST', base, jobBody)
  if (!create.ok) {
    console.error('Create failed', create.status, create.json)
    process.exit(1)
  }
  console.log('Created Cloud Scheduler job:', jobName)
  console.log(JSON.stringify({ uri: DEFAULT_URL, schedule: jobBody.schedule, timeZone: jobBody.timeZone }, null, 2))
  process.exit(0)
}

console.error('Update failed', patch.status, patch.json)
process.exit(1)
