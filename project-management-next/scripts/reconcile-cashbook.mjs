/**
 * READ-ONLY cashbook reconciliation.
 * Recomputes BANK/CASH/ECOCASH/IRD balances the same way finance-store updateLedger() does,
 * then quantifies every mechanism that can make the system balance diverge from actual cash:
 *   (a) expenses not yet deducted (PENDING_ACCOUNTANT / APPROVED_ACCOUNTANT)
 *   (b) expenses deducted into a non-canonical account bucket (bad/missing paymentMethod)
 *   (c) status-less fundTransfers treated as COMPLETED
 *   (d) all jobPayments per account (income has no verification gate)
 *   (e) non-USD entries summed without FX conversion
 *
 * Makes NO writes.
 *
 * Usage (from project-management-next):
 *   node --env-file=.env scripts/reconcile-cashbook.mjs
 */
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

function loadServiceAccount() {
  let raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  if (!raw) {
    const envPath = resolve(root, '.env')
    const text = readFileSync(envPath, 'utf8')
    const match = text.match(/^FIREBASE_SERVICE_ACCOUNT_KEY=(.*)$/m)
    if (!match) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY not found in .env')
    raw = match[1].trim()
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
      raw = raw.slice(1, -1)
    }
  }
  return JSON.parse(raw)
}

if (!getApps().length) {
  initializeApp({ credential: cert(loadServiceAccount()) })
}
const db = getFirestore()

const CANONICAL = new Set(['BANK', 'CASH', 'ECOCASH', 'IRD', 'SALARIES', 'RESERVE', 'CREDIT', 'INVENTORY'])
const COMMITTED_OPEX = new Set(['APPROVED', 'APPROVED_FOR_PAYMENT', 'PAYMENT_PROCESSED'])
const PENDING_OPEX = new Set(['PENDING_ACCOUNTANT', 'APPROVED_ACCOUNTANT'])

const money = (n) => `$${Number(n || 0).toFixed(2)}`
const dateOf = (v) => {
  if (!v) return '-'
  if (typeof v.toDate === 'function') return v.toDate().toISOString().slice(0, 10)
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? '-' : d.toISOString().slice(0, 10)
}
const acctOf = (raw) => (raw ? String(raw).toUpperCase() : 'UNKNOWN')

async function fetchAll(name) {
  const snap = await db.collection(name).get()
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

async function main() {
  const [expenses, transfers, jobPayments, topUps, salariesTx, reserveTx] = await Promise.all([
    fetchAll('operationalExpenses'),
    fetchAll('fundTransfers'),
    fetchAll('jobPayments'),
    fetchAll('ledgerTopUps'),
    fetchAll('salariesAccountTransactions'),
    fetchAll('reserveAccountTransactions'),
  ])

  console.log(`Docs: opex=${expenses.length} transfers=${transfers.length} jobPayments=${jobPayments.length} topUps=${topUps.length}`)

  // ---- 1. Replicate updateLedger() exactly ----
  const balances = { BANK: 0, CASH: 0, ECOCASH: 0, IRD: 0, SALARIES: 0, RESERVE: 0, CREDIT: 0 }
  const add = (acc, amt) => {
    balances[acc] = (balances[acc] || 0) + amt
  }

  for (const e of expenses) {
    if (!COMMITTED_OPEX.has(e.status)) continue
    add(acctOf(e.paymentMethod), -Math.abs(Number(e.amount || 0)))
  }
  for (const t of transfers) {
    const status = t.status || 'COMPLETED' // replicates fetchTransfers default
    if (status !== 'COMPLETED') continue
    add(acctOf(t.fromAccount), -Math.abs(Number(t.amount || 0)))
    add(acctOf(t.toAccount), Math.abs(Number(t.amount || 0)))
  }
  for (const p of jobPayments) {
    add(acctOf(p.paymentMethod), Math.abs(Number(p.amount || 0)))
  }
  for (const t of topUps) {
    if (t.status !== 'COMPLETED') continue
    add(acctOf(t.account), Math.abs(Number(t.amount || 0)))
  }
  const walletCash = (txs) =>
    txs.reduce((s, t) => {
      const amt = Number(t.amount || 0)
      if (t.type === 'FUNDING' || t.type === 'TRANSFER') return s + amt
      if (t.type === 'PAYMENT') return s - amt
      return s
    }, 0)
  balances.SALARIES = walletCash(salariesTx)
  balances.RESERVE = walletCash(reserveTx)

  console.log('\n=== 1. Recomputed balances (should match the UI) ===')
  for (const [acc, bal] of Object.entries(balances).sort()) {
    console.log(`  ${acc.padEnd(10)} ${money(bal)}`)
  }

  // ---- 2. (a) Committed in reality but not deducted: pending approval ----
  console.log('\n=== 2. Expenses NOT deducted yet (awaiting approval) ===')
  const pendingByAcc = {}
  for (const e of expenses) {
    if (!PENDING_OPEX.has(e.status)) continue
    const acc = acctOf(e.paymentMethod)
    pendingByAcc[acc] = pendingByAcc[acc] || { total: 0, rows: [] }
    pendingByAcc[acc].total += Math.abs(Number(e.amount || 0))
    pendingByAcc[acc].rows.push(e)
  }
  if (!Object.keys(pendingByAcc).length) console.log('  none')
  for (const [acc, g] of Object.entries(pendingByAcc)) {
    console.log(`  ${acc}: ${g.rows.length} docs, total ${money(g.total)}`)
    for (const e of g.rows) {
      console.log(`    - ${dateOf(e.createdAt)} ${money(e.amount)} [${e.status}] ${e.description || e.title || e.category || ''} (id=${e.id})`)
    }
  }

  // ---- 3. (b) Deducted into a non-canonical bucket ----
  console.log('\n=== 3. Committed expenses with non-canonical paymentMethod (mis-bucketed) ===')
  let misTotal = 0
  let misCount = 0
  for (const e of expenses) {
    if (!COMMITTED_OPEX.has(e.status)) continue
    const acc = acctOf(e.paymentMethod)
    if (CANONICAL.has(acc)) continue
    misTotal += Math.abs(Number(e.amount || 0))
    misCount++
    console.log(`  - ${dateOf(e.createdAt)} ${money(e.amount)} method="${e.paymentMethod ?? ''}" -> bucket ${acc} | ${e.description || e.title || ''} (id=${e.id})`)
  }
  console.log(misCount ? `  TOTAL mis-bucketed: ${misCount} docs, ${money(misTotal)}` : '  none')

  // ---- 4. (c) Status-less transfers defaulted to COMPLETED ----
  console.log('\n=== 4. fundTransfers with NO status (silently treated as COMPLETED) ===')
  let noStatus = 0
  for (const t of transfers) {
    if (t.status) continue
    noStatus++
    console.log(`  - ${dateOf(t.createdAt)} ${money(t.amount)} ${acctOf(t.fromAccount)} -> ${acctOf(t.toAccount)} ref=${t.reference || '-'} (id=${t.id})`)
  }
  if (!noStatus) console.log('  none')

  // Non-canonical transfer/topup/payment accounts
  console.log('\n=== 5. Non-canonical account keys in transfers/topups/jobPayments ===')
  let orphan = 0
  for (const t of transfers) {
    for (const [side, raw] of [['from', t.fromAccount], ['to', t.toAccount]]) {
      const acc = acctOf(raw)
      if (!CANONICAL.has(acc)) {
        orphan++
        console.log(`  - transfer ${t.id} ${side}="${raw ?? ''}" ${money(t.amount)} status=${t.status || '(none)'}`)
      }
    }
  }
  for (const t of topUps) {
    const acc = acctOf(t.account)
    if (!CANONICAL.has(acc)) {
      orphan++
      console.log(`  - topUp ${t.id} account="${t.account ?? ''}" ${money(t.amount)} status=${t.status || '(none)'}`)
    }
  }
  for (const p of jobPayments) {
    const acc = acctOf(p.paymentMethod)
    if (!CANONICAL.has(acc)) {
      orphan++
      console.log(`  - jobPayment ${p.id} method="${p.paymentMethod ?? ''}" ${money(p.amount)} ${dateOf(p.createdAt)}`)
    }
  }
  if (!orphan) console.log('  none')

  // ---- 6. (d) Income per account (no verification gate) ----
  console.log('\n=== 6. jobPayments credited per account (verify against statements) ===')
  const payByAcc = {}
  for (const p of jobPayments) {
    const acc = acctOf(p.paymentMethod)
    payByAcc[acc] = payByAcc[acc] || { total: 0, count: 0 }
    payByAcc[acc].total += Math.abs(Number(p.amount || 0))
    payByAcc[acc].count++
  }
  for (const [acc, g] of Object.entries(payByAcc).sort()) {
    console.log(`  ${acc.padEnd(10)} ${String(g.count).padStart(4)} payments  ${money(g.total)}`)
  }
  for (const acc of ['BANK', 'ECOCASH']) {
    const rows = jobPayments
      .filter((p) => acctOf(p.paymentMethod) === acc)
      .sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0))
    if (!rows.length) continue
    console.log(`  -- ${acc} payment detail --`)
    for (const p of rows) {
      console.log(`    - ${dateOf(p.createdAt)} ${money(p.amount)} ${p.description || p.reference || p.jobNumber || ''} (id=${p.id})`)
    }
  }

  // ---- 7. (e) Currency mix ----
  console.log('\n=== 7. Non-USD committed expenses summed without FX ===')
  let fx = 0
  for (const e of expenses) {
    if (!COMMITTED_OPEX.has(e.status)) continue
    const cur = (e.currency || 'USD').toUpperCase()
    if (cur === 'USD') continue
    fx++
    console.log(`  - ${dateOf(e.createdAt)} ${cur} ${Number(e.amount || 0).toFixed(2)} -> ${acctOf(e.paymentMethod)} | ${e.description || ''} (id=${e.id})`)
  }
  if (!fx) console.log('  none')

  // ---- 8. Summary of explainable overstatement for BANK/ECOCASH ----
  console.log('\n=== 8. Overstatement explained (system-higher gap candidates) ===')
  for (const acc of ['BANK', 'ECOCASH', 'CASH', 'IRD']) {
    const pending = pendingByAcc[acc]?.total || 0
    console.log(`  ${acc.padEnd(8)} shown ${money(balances[acc])} | pending-approval not yet deducted: ${money(pending)} -> after approval would be ${money(balances[acc] - pending)}`)
  }
  console.log(`  Mis-bucketed committed expenses (deducted from no real account): ${money(misTotal)}`)
  console.log('\nRemaining gap after these = payments made outside the system, or income recorded that never arrived.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
