/**
 * Post the approved JC-2026-0344 riversand expense to ECOCASH without
 * changing the original OPEX document or the CASH account.
 *
 * Dry-run by default:
 *   node --env-file=../.env scripts/debit-jc-0344-riversand-ecocash.mjs
 *
 * Apply after reviewing the resolved source IDs:
 *   node --env-file=../.env scripts/debit-jc-0344-riversand-ecocash.mjs --apply
 */
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

const apply = process.argv.includes('--apply')
const JOB_NUMBER = 'JC-2026-0344'
const AMOUNT = 500
const ACCOUNT = 'ECOCASH'
const DESCRIPTION_MATCH = 'payment for 1 load of riversand'
const EFFECTIVE_DATE = '2026-08-31'
const POSTING_ID = 'jobcard-jc-2026-0344-riversand-ecocash-debit-2026-08-31'
const AUDIT_ID = `${POSTING_ID}-audit`

function loadCredential() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  if (raw) {
    try {
      return cert(JSON.parse(raw))
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is not a valid service-account JSON object')
    }
  }
  return applicationDefault()
}

if (!getApps().length) initializeApp({ credential: loadCredential() })
const db = getFirestore()

const normalize = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')
const rowAmount = (row) => Number(row.totalAmount || Number(row.quantity || 0) * Number(row.unitPrice || 0))
const isCommitted = (status) => ['APPROVED', 'APPROVED_FOR_PAYMENT', 'PAYMENT_PROCESSED'].includes(String(status || ''))

async function resolveSource() {
  const jobSnap = await db.collection('jobCards')
    .where('generalInfo.jobNumber', '==', JOB_NUMBER)
    .limit(2)
    .get()
  if (jobSnap.size !== 1) throw new Error(`Expected one ${JOB_NUMBER} job card; found ${jobSnap.size}`)

  const jobDoc = jobSnap.docs[0]
  const job = jobDoc.data()
  const rows = (job.adHocExpenses || []).filter((row) =>
    normalize(row.description) === DESCRIPTION_MATCH && rowAmount(row) === AMOUNT
  )
  if (rows.length !== 1) {
    throw new Error(`Expected one matching $${AMOUNT} riversand row; found ${rows.length}`)
  }

  const row = rows[0]
  if (!row.id) throw new Error('Matching job-card row has no ID')
  if (row.approvalStatus !== 'APPROVED_MANAGER') {
    throw new Error(`Matching row is ${row.approvalStatus || 'UNAPPROVED'}, not APPROVED_MANAGER`)
  }

  let linkedOpexDoc = null
  if (row.opexId) {
    const snap = await db.collection('operationalExpenses').doc(String(row.opexId)).get()
    if (snap.exists) linkedOpexDoc = snap
  }

  const jobOpexSnap = await db.collection('operationalExpenses')
    .where('sourceJobId', '==', jobDoc.id)
    .get()
  const candidates = jobOpexSnap.docs.filter((doc) => {
    const data = doc.data()
    return Number(data.amount || 0) === AMOUNT && normalize(data.description).includes(DESCRIPTION_MATCH)
  })
  const committedCandidates = candidates.filter((doc) => isCommitted(doc.data().status))
  const sameRowCommitted = committedCandidates.filter((doc) => doc.data().sourceItemId === row.id)
  const linkedIsCommitted = linkedOpexDoc &&
    candidates.some((doc) => doc.id === linkedOpexDoc.id) &&
    isCommitted(linkedOpexDoc.data().status)

  let opexDoc
  if (linkedIsCommitted) {
    opexDoc = linkedOpexDoc
  } else if (sameRowCommitted.length === 1) {
    opexDoc = sameRowCommitted[0]
  } else if (committedCandidates.length === 1) {
    opexDoc = committedCandidates[0]
  } else {
    throw new Error(
      `Could not uniquely resolve committed OPEX: candidates=${candidates.length}, ` +
      `committed=${committedCandidates.length}, sameRowCommitted=${sameRowCommitted.length}`
    )
  }

  return { jobDoc, row, opexDoc, linkedOpexDoc }
}

const { jobDoc, row, opexDoc, linkedOpexDoc } = await resolveSource()
const postingRef = db.collection('ledgerTopUps').doc(POSTING_ID)
const auditRef = db.collection('adminAuditLogs').doc(AUDIT_ID)
const [postingSnap, auditSnap] = await Promise.all([postingRef.get(), auditRef.get()])

console.log(`Job: ${JOB_NUMBER} (${jobDoc.id})`)
console.log(`Row: ${row.id}`)
console.log(`Original OPEX: ${opexDoc.id}`)
if (linkedOpexDoc && linkedOpexDoc.id !== opexDoc.id) {
  console.log(`Stale row link: ${linkedOpexDoc.id} (${linkedOpexDoc.data().status || 'UNKNOWN'})`)
}
console.log(`Correction: debit ${ACCOUNT} by $${AMOUNT.toFixed(2)}; CASH unchanged`)

if (postingSnap.exists || auditSnap.exists) {
  if (!postingSnap.exists || !auditSnap.exists) {
    throw new Error('Partial prior correction detected; inspect before retrying')
  }
  const posting = postingSnap.data()
  if (posting.account !== ACCOUNT || Number(posting.amount) !== -AMOUNT || posting.status !== 'COMPLETED') {
    throw new Error('Existing deterministic posting does not match the intended correction')
  }
  console.log('ALREADY APPLIED AND VERIFIED - no additional debit was written.')
  process.exit(0)
}

if (!apply) {
  console.log('DRY RUN - no writes made. Re-run with --apply after reviewing the source IDs above.')
  process.exit(0)
}

await db.runTransaction(async (transaction) => {
  const [currentPosting, currentAudit, currentJob, currentOpex] = await Promise.all([
    transaction.get(postingRef),
    transaction.get(auditRef),
    transaction.get(jobDoc.ref),
    transaction.get(opexDoc.ref),
  ])
  if (currentPosting.exists && currentAudit.exists) return
  if (currentPosting.exists || currentAudit.exists) throw new Error('Partial prior correction detected')
  if (!currentJob.exists || !currentOpex.exists) throw new Error('Source record disappeared before posting')

  transaction.create(postingRef, {
    type: 'RECONCILIATION',
    account: ACCOUNT,
    amount: -AMOUNT,
    status: 'COMPLETED',
    effectiveDate: EFFECTIVE_DATE,
    description: `Job Card ${JOB_NUMBER} - Payment for 1 Load of riversand (EcoCash correction)`,
    sourceJobId: jobDoc.id,
    sourceItemId: row.id,
    originalOpexId: opexDoc.id,
    requestedBy: 'debit-jc-0344-riversand-ecocash.mjs',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })
  transaction.create(auditRef, {
    action: 'JOBCARD_EXPENSE_ECOCASH_DEBIT_POSTED',
    jobCardId: jobDoc.id,
    jobNumber: JOB_NUMBER,
    rowId: row.id,
    originalOpexId: opexDoc.id,
    postingId: POSTING_ID,
    account: ACCOUNT,
    amount: AMOUNT,
    ledgerAmount: -AMOUNT,
    cashAccountChanged: false,
    reason: 'Approved riversand expense was posted but did not debit the intended EcoCash account',
    effectiveDate: EFFECTIVE_DATE,
    performedBy: {
      uid: null,
      email: null,
      displayName: 'debit-jc-0344-riversand-ecocash.mjs',
    },
    createdAt: FieldValue.serverTimestamp(),
  })
})

const [verifiedPosting, verifiedAudit] = await Promise.all([postingRef.get(), auditRef.get()])
if (!verifiedPosting.exists || !verifiedAudit.exists) throw new Error('Post-write verification failed')
const posted = verifiedPosting.data()
if (posted.account !== ACCOUNT || Number(posted.amount) !== -AMOUNT || posted.status !== 'COMPLETED') {
  throw new Error('Post-write values do not match the requested EcoCash debit')
}
console.log(`APPLIED AND VERIFIED - ${ACCOUNT} debited by $${AMOUNT.toFixed(2)}; CASH was not changed.`)
