/** Read-only staging audit. Never imports, deletes, or converts financial records. */
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app'
import { Firestore, getFirestore } from 'firebase-admin/firestore'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { writeFile } from 'node:fs/promises'
const args = process.argv.slice(2)
const projectIndex = args.indexOf('--project')
if (projectIndex < 0 || args[projectIndex + 1] !== 'incaptta-pro-staging') throw new Error('Pass --project incaptta-pro-staging explicitly')
if (args.includes('--apply')) throw new Error('This tool is read-only; migration is not enabled')
for (const name of ['FIREBASE_PROJECT_ID', 'GOOGLE_CLOUD_PROJECT', 'GCLOUD_PROJECT']) {
  if (process.env[name] && process.env[name] !== 'incaptta-pro-staging') throw new Error(`${name} points outside staging`)
}
let key = null
try { key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY) : null } catch { throw new Error('Invalid service account JSON (credential content suppressed)') }
if (key && key.project_id !== 'incaptta-pro-staging') throw new Error('Credentials must belong to staging')
let db
if (args.includes('--firebase-cli')) {
  const require = createRequire(import.meta.url)
  const globalRoot = process.env.FIREBASE_CLI_MODULE_ROOT || join(dirname(dirname(process.execPath)), 'lib', 'node_modules')
  const auth = require(join(globalRoot, 'firebase-tools/lib/auth.js'))
  const api = require(join(globalRoot, 'firebase-tools/lib/api.js'))
  const account = auth.getGlobalDefaultAccount()
  if (!account) throw new Error('Sign into Firebase CLI before using --firebase-cli')
  db = new Firestore({ projectId: 'incaptta-pro-staging', credentials: {
    type: 'authorized_user', client_id: api.clientId(), client_secret: api.clientSecret(), refresh_token: account.tokens.refresh_token,
  } })
} else {
  const app = initializeApp({ projectId: 'incaptta-pro-staging', credential: key ? cert(key) : applicationDefault() })
  db = getFirestore(app)
}
const names = ['payroll', 'operationalExpenses', 'salariesAccountTransactions', 'salaryAdvances', 'salaryAdvanceRecoveries', 'jobCardPayrollPostings', 'mbdiPayrollPostings', 'payrollJournal', 'payrollPayments']
const data = {}
for (const name of names) data[name] = (await db.collection(name).get()).docs.map(d => ({ ...d.data(), id: d.id }))
const ids = new Set(data.payroll.map(p => p.id))
const groups = new Map()
for (const p of data.payroll) {
  if (p.schemaVersion === 2 && p.supplement) continue
  const key = `${p.employeeId}/${p.year}/${p.month}`
  groups.set(key, [...(groups.get(key) || []), p.id])
}
const report = {
  project: 'incaptta-pro-staging', readOnly: true, generatedAt: new Date().toISOString(),
  counts: Object.fromEntries(names.map(n => [n, data[n].length])),
  legacyPayrollIds: data.payroll.filter(p => p.schemaVersion !== 2).map(p => p.id),
  duplicatePeriods: [...groups.entries()].filter(([, ids]) => ids.length > 1),
  ambiguousDates: data.operationalExpenses.filter(e => e.type === 'PAYROLL_NET' && !e.paymentDate && !e.paymentProcessedAt).map(e => e.id),
  orphanReferences: Object.fromEntries(names.filter(n => n !== 'payroll').map(n => [n, data[n].filter(r => r.payrollId && !ids.has(r.payrollId)).map(r => r.id)])),
  records: data,
}
const outputIndex = args.indexOf('--output')
const output = outputIndex >= 0 ? args[outputIndex + 1] : '/tmp/payroll-accrual-staging-reconciliation.json'
if (!output) throw new Error('Missing output path')
await writeFile(output, JSON.stringify(report, null, 2), { mode: 0o600 })
console.log(JSON.stringify({ project: report.project, readOnly: true, counts: report.counts, report: output, legacyRecords: report.legacyPayrollIds.length, duplicatePeriods: report.duplicatePeriods.length }, null, 2))
