/**
 * Staging-only wipe of transactional Firestore business data.
 *
 * Keeps users/login, roles, appSettings, and reference catalogs so staging
 * stays usable after a UAT restart.
 *
 * Dry-run by default. Deletes only with --apply.
 *
 *   node scripts/wipe-staging-business-data.mjs \
 *     --project incaptta-pro-staging \
 *     --i-understand-staging-wipe \
 *     [--firebase-cli] \
 *     [--apply]
 *
 * Always targets incaptta-pro-staging. Aborts if any env or credential
 * still names production (incaptta-pro).
 */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app'
import { Firestore, getFirestore } from 'firebase-admin/firestore'

const STAGING_PROJECT = 'incaptta-pro-staging'
const PRODUCTION_PROJECT = 'incaptta-pro'
const BATCH_SIZE = 400

const KEPT_COLLECTIONS = [
  'users',
  'userPreferences',
  'userSessions',
  'userStatus',
  'roles',
  'rolePermissions',
  'appSettings',
  'departments',
  'jobCategories',
  'expenseCategories',
  'cashAccounts',
  'inventoryCategories',
  'employees',
  'payrollPolicies',
]

/** Parent collection -> known subcollections to clear before parent docs. */
const SUBCOLLECTIONS = {
  jobCards: ['items', 'expenses'],
  mbdiInitiatives: ['comments'],
  docVerifications: ['auditLog'],
}

const WIPE_COLLECTIONS = [
  // CRM
  'leads',
  'customers',
  'customerAuditLogs',
  'crmQuotes',
  'crmInvoices',
  'clientCreditAccounts',
  'clientCreditTransactions',
  'commissions',
  'commissionPayouts',
  'invoicePayments',
  // Jobs / BOM
  'jobCards',
  'jobPayments',
  'jobCardAuditLogs',
  'jobCardPayrollPostings',
  'bomTemplates',
  'activeStructures',
  'agricJobCards',
  'Agric-Material-Inventory',
  'agricStockLedger',
  // Inventory / procurement
  'inventoryItems',
  'inventoryAuditLogs',
  'stockLedger',
  'suppliers',
  'procurementRequisitions',
  'procurementPurchaseOrders',
  'procurementGrns',
  'procurementSupplierInvoices',
  // Opex / ledger
  'operationalExpenses',
  'opexAuditLogs',
  'fundTransfers',
  'ledgerTopUps',
  'ledger',
  'vatFilings',
  'paymentSubmissions',
  'docVerifications',
  'businessLoanLenders',
  'businessLoanTransactions',
  'reserveAccountTransactions',
  'salariesAccountTransactions',
  // HR transactional
  'payroll',
  'payrollJournal',
  'payrollPayments',
  'payrollPaymentRequests',
  'salaryAdvances',
  'salaryAdvanceRecoveries',
  'leaveRequests',
  'hrTasks',
  'kpis',
  'performanceReviews',
  'recruitment',
  // Other transactional
  'subcontractors',
  'subcontractorJobs',
  'subcontractorJobPayments',
  'subcontractorTransactions',
  'projects',
  'projectTasks',
  'projectMilestones',
  'tasks',
  'mbdiInitiatives',
  'mbdiNotifications',
  'poultryFlocks',
  'poultryDailyLogs',
  'poultryInventory',
  'poultrySales',
  'equipmentAssets',
  'hireContracts',
  'inspectionLogs',
  'containerAccessRequests',
  'containerAccessLogs',
  'chats',
  'supportTickets',
  'supportReplies',
  'adminAuditLogs',
  'accountPostingGuards',
  'autoApprovalParams',
  'categories',
  'toolsRegistry',
  'companyTools',
  'toolCheckouts',
  'toolRepairs',
  'assets',
]

const COUNTER_COLLECTION = 'systemCounters'

const args = process.argv.slice(2)
const projectIndex = args.indexOf('--project')
const apply = args.includes('--apply')
const confirmed = args.includes('--i-understand-staging-wipe')
const useFirebaseCli = args.includes('--firebase-cli')

function abortIfProduction(label, value) {
  const normalized = String(value || '').trim()
  if (!normalized) return
  if (normalized === PRODUCTION_PROJECT || normalized.includes(PRODUCTION_PROJECT + '.') || normalized.includes(`/${PRODUCTION_PROJECT}`)) {
    throw new Error(`${label} points at production (${PRODUCTION_PROJECT}). Refusing to wipe.`)
  }
  if (normalized !== STAGING_PROJECT && (label.includes('PROJECT') || label.includes('project_id'))) {
    // Allow empty / unset above; non-staging project IDs are also rejected.
    if (
      label === 'FIREBASE_PROJECT_ID' ||
      label === 'NEXT_PUBLIC_FIREBASE_PROJECT_ID' ||
      label === 'GOOGLE_CLOUD_PROJECT' ||
      label === 'GCLOUD_PROJECT' ||
      label === 'GCP_PROJECT' ||
      label.endsWith('project_id')
    ) {
      throw new Error(`${label} must be ${STAGING_PROJECT} (got ${normalized}). Refusing to wipe.`)
    }
  }
}

function assertSafetyGates() {
  if (projectIndex < 0 || args[projectIndex + 1] !== STAGING_PROJECT) {
    throw new Error(`Pass --project ${STAGING_PROJECT} explicitly`)
  }
  if (!confirmed) {
    throw new Error('Pass --i-understand-staging-wipe to acknowledge a staging wipe')
  }

  for (const name of [
    'FIREBASE_PROJECT_ID',
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    'GOOGLE_CLOUD_PROJECT',
    'GCLOUD_PROJECT',
    'GCP_PROJECT',
  ]) {
    if (process.env[name]) abortIfProduction(name, process.env[name])
  }
}

function loadServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  if (!raw) return null
  let config
  try {
    config = JSON.parse(raw)
  } catch {
    throw new Error('Invalid FIREBASE_SERVICE_ACCOUNT_KEY JSON (credential content suppressed)')
  }
  abortIfProduction('FIREBASE_SERVICE_ACCOUNT_KEY.project_id', config.project_id)
  if (config.project_id !== STAGING_PROJECT) {
    throw new Error(`Service account project_id must be ${STAGING_PROJECT}`)
  }
  return cert(config)
}

function createDb() {
  if (useFirebaseCli) {
    const require = createRequire(import.meta.url)
    const globalRoot =
      process.env.FIREBASE_CLI_MODULE_ROOT ||
      join(dirname(dirname(process.execPath)), 'lib', 'node_modules')
    const auth = require(join(globalRoot, 'firebase-tools/lib/auth.js'))
    const api = require(join(globalRoot, 'firebase-tools/lib/api.js'))
    const account = auth.getGlobalDefaultAccount()
    if (!account) throw new Error('Sign into Firebase CLI before using --firebase-cli')
    return new Firestore({
      projectId: STAGING_PROJECT,
      credentials: {
        type: 'authorized_user',
        client_id: api.clientId(),
        client_secret: api.clientSecret(),
        refresh_token: account.tokens.refresh_token,
      },
    })
  }

  const credential = loadServiceAccount() || applicationDefault()
  if (!getApps().length) {
    initializeApp({
      credential,
      projectId: STAGING_PROJECT,
    })
  }
  return getFirestore()
}

async function countCollection(db, name) {
  try {
    const snap = await db.collection(name).count().get()
    return snap.data().count || 0
  } catch {
    // Fallback for environments without aggregation support.
    const snap = await db.collection(name).select().get()
    return snap.size
  }
}

async function deleteQueryBatch(db, queryRef, deletedRef) {
  const snap = await queryRef.get()
  if (snap.empty) return 0

  const writer = db.bulkWriter()
  let deleted = 0
  for (const docSnap of snap.docs) {
    writer.delete(docSnap.ref)
    deleted += 1
  }
  await writer.close()
  deletedRef.value += deleted
  return deleted
}

async function deleteCollection(db, collectionPath, deletedRef) {
  const col = db.collection(collectionPath)
  let batchDeleted = 0
  do {
    batchDeleted = await deleteQueryBatch(db, col.limit(BATCH_SIZE), deletedRef)
  } while (batchDeleted > 0)
}

async function deleteSubcollectionsForParents(db, parentCollection, subNames, deletedCounts) {
  const parents = await db.collection(parentCollection).select().get()
  for (const parent of parents.docs) {
    for (const sub of subNames) {
      const key = `${parentCollection}/{id}/${sub}`
      if (!deletedCounts[key]) deletedCounts[key] = 0
      const counter = { value: 0 }
      await deleteCollection(db, `${parentCollection}/${parent.id}/${sub}`, counter)
      deletedCounts[key] += counter.value
    }
  }
}

async function wipeCollection(db, name, applyMode, deletedCounts) {
  const before = await countCollection(db, name)
  deletedCounts[name] = before

  if (!applyMode || before === 0) return

  const subs = SUBCOLLECTIONS[name]
  if (subs?.length) {
    await deleteSubcollectionsForParents(db, name, subs, deletedCounts)
  }

  const counter = { value: 0 }
  await deleteCollection(db, name, counter)
  // Prefer reported deleted docs; keep planned count if writer path partially differs.
  deletedCounts[name] = Math.max(before, counter.value)
}

async function resetSystemCounters(db, applyMode, deletedCounts) {
  const before = await countCollection(db, COUNTER_COLLECTION)
  deletedCounts[COUNTER_COLLECTION] = before
  if (!applyMode || before === 0) return

  const counter = { value: 0 }
  await deleteCollection(db, COUNTER_COLLECTION, counter)
  deletedCounts[COUNTER_COLLECTION] = Math.max(before, counter.value)
}

async function main() {
  assertSafetyGates()
  const db = createDb()

  const mode = apply ? 'apply' : 'dry-run'
  const deletedCounts = {}
  const keptCounts = {}

  for (const name of KEPT_COLLECTIONS) {
    keptCounts[name] = await countCollection(db, name)
  }

  for (const name of WIPE_COLLECTIONS) {
    await wipeCollection(db, name, apply, deletedCounts)
  }
  await resetSystemCounters(db, apply, deletedCounts)

  const totalDocs = Object.values(deletedCounts).reduce((sum, n) => sum + (Number(n) || 0), 0)

  console.log(
    JSON.stringify(
      {
        project: STAGING_PROJECT,
        mode,
        apply,
        totalDocsAffected: totalDocs,
        deletedCounts,
        keptCollections: keptCounts,
        keptCollectionNames: KEPT_COLLECTIONS,
        finishedAt: new Date().toISOString(),
        note:
          mode === 'dry-run'
            ? 'No deletes performed. Re-run with --apply to wipe staging business data.'
            : 'Staging business collections wiped. Users/catalogs preserved. Auth/Storage untouched.',
      },
      null,
      2,
    ),
  )
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
