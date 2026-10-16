/**
 * Repair a committed job-card ad-hoc expense that posted to the wrong liquid
 * account. Dry-run by default. Apply requires exact job number, row id, OPEX id,
 * from/to accounts, amount, and --apply.
 *
 * Example:
 *   node --env-file=../.env scripts/repair-jobcard-expense-account.mjs \
 *     --job JC-2026-0344 --row <ROW_ID> --opex jc-adhoc-<ROW_ID> \
 *     --from CASH --to ECOCASH --amount 500 --apply
 */
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

const args = process.argv.slice(2)
const valueAfter = (flag) => {
  const index = args.indexOf(flag)
  return index === -1 ? null : args[index + 1] || null
}
const apply = args.includes('--apply')
const jobNumber = valueAfter('--job')
const rowId = valueAfter('--row')
const opexId = valueAfter('--opex')
const fromAccount = canonicalAccount(valueAfter('--from'))
const toAccount = canonicalAccount(valueAfter('--to'))
const amount = Number(valueAfter('--amount') || 0)

if (!jobNumber || !rowId || !opexId || !fromAccount || !toAccount || !(amount > 0)) {
  throw new Error('Pass --job, --row, --opex, --from, --to and --amount')
}
if (fromAccount === 'UNKNOWN' || toAccount === 'UNKNOWN') throw new Error('Use a canonical liquid account')
if (fromAccount === toAccount) throw new Error('--from and --to must be different accounts')

function loadCredential() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  if (raw) return cert(JSON.parse(raw))
  return applicationDefault()
}

function canonicalAccount(value) {
  const raw = String(value || '').trim().toUpperCase().replace(/[\s_-]+/g, '')
  if (raw === 'BANK' || raw === 'BANKACCOUNT') return 'BANK'
  if (raw === 'CASH') return 'CASH'
  if (raw === 'ECOCASH' || raw === 'ECO') return 'ECOCASH'
  if (raw === 'IRD') return 'IRD'
  if (raw === 'SALARIES' || raw === 'SALARY') return 'SALARIES'
  if (raw === 'RESERVE') return 'RESERVE'
  return 'UNKNOWN'
}

const committedExpenseStatuses = new Set(['APPROVED', 'APPROVED_FOR_PAYMENT', 'PAYMENT_PROCESSED'])
const money = (value) => `$${Number(value || 0).toFixed(2)}`

if (!getApps().length) initializeApp({ credential: loadCredential() })
const db = getFirestore()

async function findJob() {
  const snap = await db.collection('jobCards').where('generalInfo.jobNumber', '==', jobNumber).limit(2).get()
  if (snap.empty) throw new Error(`No job card found for ${jobNumber}`)
  if (snap.size !== 1) throw new Error(`Expected one job card for ${jobNumber}; found ${snap.size}`)
  return { id: snap.docs[0].id, ref: snap.docs[0].ref, ...snap.docs[0].data() }
}

async function accountBalance(account) {
  const [expenseSnap, paymentSnap, transferSnap, topUpSnap, loanSnap, walletSnap] = await Promise.all([
    db.collection('operationalExpenses').get(),
    db.collection('jobPayments').get(),
    db.collection('fundTransfers').where('status', '==', 'COMPLETED').get(),
    db.collection('ledgerTopUps').where('status', '==', 'COMPLETED').get(),
    db.collection('businessLoanTransactions').where('status', '==', 'COMPLETED').get(),
    account === 'SALARIES'
      ? db.collection('salariesAccountTransactions').get()
      : account === 'RESERVE'
        ? db.collection('reserveAccountTransactions').get()
        : Promise.resolve(null),
  ])
  if (account === 'SALARIES' || account === 'RESERVE') {
    return walletSnap.docs.reduce((sum, doc) => {
      const row = doc.data()
      const rowAmount = Number(row.amount || 0)
      if (row.type === 'FUNDING' || row.type === 'TRANSFER') return sum + rowAmount
      if (row.type === 'PAYMENT') return sum - rowAmount
      return sum
    }, 0)
  }
  let balance = 0
  for (const doc of expenseSnap.docs) {
    const row = doc.data()
    if (committedExpenseStatuses.has(String(row.status || '')) && canonicalAccount(row.paymentMethod) === account) {
      balance -= Math.abs(Number(row.amount || 0))
    }
  }
  for (const doc of paymentSnap.docs) {
    const row = doc.data()
    if (canonicalAccount(row.paymentMethod) === account) balance += Math.abs(Number(row.amount || 0))
  }
  for (const doc of transferSnap.docs) {
    const row = doc.data()
    const transferAmount = Math.abs(Number(row.amount || 0))
    if (canonicalAccount(row.fromAccount) === account) balance -= transferAmount
    if (canonicalAccount(row.toAccount) === account) balance += transferAmount
  }
  for (const doc of topUpSnap.docs) {
    const row = doc.data()
    if (canonicalAccount(row.account) === account) balance += Number(row.amount || 0)
  }
  for (const doc of loanSnap.docs) {
    const row = doc.data()
    if (canonicalAccount(row.account) !== account) continue
    const loanAmount = Math.abs(Number(row.amount || 0))
    balance += row.transactionType === 'REPAYMENT' ? -loanAmount : loanAmount
  }
  return Math.round((balance + Number.EPSILON) * 100) / 100
}

const job = await findJob()
const row = (job.adHocExpenses || []).find((item) => item.id === rowId)
if (!row) throw new Error(`Row ${rowId} not found on ${jobNumber}`)
const opexSnap = await db.collection('operationalExpenses').doc(opexId).get()
if (!opexSnap.exists) throw new Error(`OPEX ${opexId} not found`)
const opex = { id: opexSnap.id, ref: opexSnap.ref, ...opexSnap.data() }
if (opex.sourceJobId !== job.id || opex.sourceItemId !== rowId) throw new Error('OPEX is not linked to the supplied job row')
if (Number(opex.amount || 0).toFixed(2) !== amount.toFixed(2)) throw new Error('OPEX amount does not match --amount')
if (canonicalAccount(opex.paymentMethod) !== fromAccount) throw new Error(`OPEX is posted to ${opex.paymentMethod}, not ${fromAccount}`)

const toBalanceBefore = await accountBalance(toAccount)
const existingRepairId = `repair-${opexId}-${fromAccount}-to-${toAccount}`.toLowerCase()
const existingRepairSnap = await db.collection('adminAuditLogs').doc(existingRepairId).get()
if (existingRepairSnap.exists) {
  console.log(`Repair already recorded: adminAuditLogs/${existingRepairId}`)
  process.exit(0)
}

const targetHasFunds = toBalanceBefore >= amount

console.log(`Job: ${jobNumber} (${job.id})`)
console.log(`Row: ${rowId}`)
console.log(`OPEX: ${opexId}`)
console.log(`Correction: reverse ${money(amount)} from ${fromAccount}, repost ${money(amount)} to ${toAccount}`)
console.log(`${toAccount} balance before replacement debit: ${money(toBalanceBefore)}`)

if (toBalanceBefore < amount) {
  console.log(`Replacement will remain pending: ${toAccount} has ${money(toBalanceBefore)}, needs ${money(amount)}.`)
}
if (!apply) {
  console.log('DRY RUN - no writes made. Re-run with --apply after verifying IDs.')
  process.exit(0)
}

await db.runTransaction(async (transaction) => {
  const jobSnap = await transaction.get(job.ref)
  const opexTxnSnap = await transaction.get(opex.ref)
  const auditRef = db.collection('adminAuditLogs').doc(existingRepairId)
  const reversalRef = db.collection('ledgerTopUps').doc(`${existingRepairId}-reversal`)
  const replacementRef = db.collection('operationalExpenses').doc(`${opexId}-repost-${toAccount.toLowerCase()}`)
  const auditSnap = await transaction.get(auditRef)
  const replacementSnap = await transaction.get(replacementRef)
  if (auditSnap.exists || replacementSnap.exists) return
  const latestJob = jobSnap.data()
  const latestRows = (latestJob.adHocExpenses || []).map((item) => ({ ...item }))
  const latestIndex = latestRows.findIndex((item) => item.id === rowId)
  if (latestIndex < 0) throw new Error('Row disappeared during transaction')
  const latestOpex = opexTxnSnap.data()
  if (canonicalAccount(latestOpex.paymentMethod) !== fromAccount) throw new Error('OPEX account changed during transaction')

  latestRows[latestIndex] = {
    ...latestRows[latestIndex],
    paymentMethod: toAccount,
    opexId: replacementRef.id,
    correctionAuditId: auditRef.id,
    approvalStatus: targetHasFunds ? 'APPROVED_MANAGER' : 'APPROVED_ACCOUNTANT',
    approvedAt: targetHasFunds ? latestRows[latestIndex].approvedAt : null,
    approvedBy: targetHasFunds ? latestRows[latestIndex].approvedBy : null,
  }
  transaction.create(reversalRef, {
    type: 'RECONCILIATION',
    account: fromAccount,
    amount,
    status: 'COMPLETED',
    description: `Reversal of wrong-account job-card expense ${opexId}`,
    sourceJobId: job.id,
    sourceItemId: rowId,
    originalOpexId: opexId,
    correctedOpexId: replacementRef.id,
    requestedBy: 'repair-jobcard-expense-account.mjs',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })
  transaction.create(replacementRef, {
    ...latestOpex,
    paymentMethod: toAccount,
    status: targetHasFunds ? 'APPROVED' : 'APPROVED_ACCOUNTANT',
    originalPaymentMethod: latestOpex.paymentMethod,
    correctionOfOpexId: opexId,
    correctionAuditId: auditRef.id,
    verificationToken: null,
    pdfGenerated: false,
    postingAudit: {
      ...(latestOpex.postingAudit || {}),
      account: toAccount,
      amount,
      balanceBefore: toBalanceBefore,
      balanceAfter: targetHasFunds
        ? Math.round((toBalanceBefore - amount + Number.EPSILON) * 100) / 100
        : toBalanceBefore,
      postingState: targetHasFunds ? 'COMMITTED' : 'PENDING_FUNDS',
      correctedFromAccount: fromAccount,
      correctedAt: new Date().toISOString(),
    },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })
  transaction.update(job.ref, { adHocExpenses: latestRows, updatedAt: FieldValue.serverTimestamp() })
  transaction.create(auditRef, {
    action: 'JOBCARD_EXPENSE_ACCOUNT_REPAIRED',
    repairStatus: targetHasFunds ? 'COMPLETED' : 'PENDING_FUNDS',
    jobCardId: job.id,
    jobNumber,
    rowId,
    originalOpexId: opexId,
    replacementOpexId: replacementRef.id,
    reversalTopUpId: reversalRef.id,
    fromAccount,
    toAccount,
    amount,
    originalOpexSnapshot: {
      paymentMethod: latestOpex.paymentMethod || null,
      amount: Number(latestOpex.amount || 0),
      description: latestOpex.description || null,
      status: latestOpex.status || null,
    },
    performedBy: { uid: null, email: null, displayName: 'repair-jobcard-expense-account.mjs' },
    createdAt: FieldValue.serverTimestamp(),
  })
})

console.log(
  targetHasFunds
    ? `APPLIED - reversal and ${toAccount} repost recorded with audit ${existingRepairId}.`
    : `APPLIED - ${fromAccount} reversal recorded; ${toAccount} replacement is pending manager approval with audit ${existingRepairId}.`
)
