/**
 * Audit and reconcile job-card ad-hoc OPEX records.
 *
 * Dry-run is always the default. Mutations require BOTH --apply and an explicit
 * decision entry containing exact Firestore document IDs.
 *
 * Usage (from project-management-next):
 *   node --env-file=../.env scripts/reconcile-jobcard-opex.mjs --job JC-2026-0344
 *   node --env-file=../.env scripts/reconcile-jobcard-opex.mjs --job JC-2026-0344 --apply
 *   node --env-file=../.env scripts/reconcile-jobcard-opex.mjs --audit-all > opex-audit.txt
 */
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

const scriptDir = resolve(fileURLToPath(new URL('.', import.meta.url)))
const decisionsPath = resolve(scriptDir, 'jobcard-opex-decisions.json')
const projectRoot = resolve(scriptDir, '..')
const args = new Set(process.argv.slice(2))
const valueAfter = (flag) => {
  const index = process.argv.indexOf(flag)
  return index === -1 ? null : process.argv[index + 1] || null
}
const apply = args.has('--apply')
const auditAll = args.has('--audit-all')
const jobNumber = valueAfter('--job')
const outputFile = valueAfter('--output')

if (apply && auditAll) throw new Error('--audit-all is read-only and cannot be combined with --apply')
if (!auditAll && !jobNumber) throw new Error('Pass --job <JOB_NUMBER> or --audit-all')

function loadCredential() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  if (raw) return cert(JSON.parse(raw))
  return applicationDefault()
}

if (!getApps().length) initializeApp({ credential: loadCredential() })
const db = getFirestore()

const decisions = JSON.parse(readFileSync(decisionsPath, 'utf8'))
const money = (value) => `$${Number(value || 0).toFixed(2)}`
const normalize = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')
const canonicalAccount = (value) => {
  const raw = String(value || '').trim().toUpperCase().replace(/[\s_-]+/g, '')
  if (raw === 'BANK' || raw === 'BANKACCOUNT') return 'BANK'
  if (raw === 'CASH') return 'CASH'
  if (raw === 'ECOCASH' || raw === 'ECO') return 'ECOCASH'
  if (raw === 'IRD') return 'IRD'
  if (raw === 'SALARIES' || raw === 'SALARY') return 'SALARIES'
  if (raw === 'RESERVE') return 'RESERVE'
  return 'UNKNOWN'
}
const validLiquidAccounts = new Set(['BANK', 'CASH', 'ECOCASH', 'IRD', 'SALARIES', 'RESERVE'])
const committedExpenseStatuses = new Set(['APPROVED', 'APPROVED_FOR_PAYMENT', 'PAYMENT_PROCESSED'])
const millis = (value) => {
  if (!value) return 0
  if (typeof value.toMillis === 'function') return value.toMillis()
  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? 0 : parsed
}
const iso = (value) => {
  const ms = millis(value)
  return ms ? new Date(ms).toISOString() : '-'
}
const expenseAmount = (row) => Number(row.totalAmount || Number(row.quantity || 0) * Number(row.unitPrice || 0))
const compactOpex = (doc) => ({
  id: doc.id,
  description: doc.description || null,
  amount: Number(doc.amount || 0),
  sourceItemId: doc.sourceItemId || null,
  verificationToken: doc.verificationToken || null,
  createdAt: iso(doc.createdAt),
})

async function findJob(number) {
  const snap = await db.collection('jobCards').where('generalInfo.jobNumber', '==', number).limit(2).get()
  if (snap.empty) throw new Error(`No job card found for ${number}`)
  if (snap.size !== 1) throw new Error(`Expected one job card for ${number}; found ${snap.size}`)
  return { id: snap.docs[0].id, ref: snap.docs[0].ref, ...snap.docs[0].data() }
}

async function loadOpexForJob(jobId) {
  const snap = await db.collection('operationalExpenses').where('sourceJobId', '==', jobId).get()
  return snap.docs.map((doc) => ({ id: doc.id, ref: doc.ref, ...doc.data() }))
}

function matchRowToOpex(row, opex) {
  if (row.id && opex.sourceItemId === row.id) return true
  const rowDescription = normalize(row.description)
  const opexDescription = normalize(opex.description)
  return Boolean(rowDescription) && opexDescription.includes(rowDescription) && expenseAmount(row) === Number(opex.amount || 0)
}

function printJobComparison(job, opex, decision) {
  const rows = job.adHocExpenses || []
  const selectedOpexIds = new Set([...(decision?.keepOpexIds || []), ...(decision?.deleteOpexIds || [])])
  const selectedRowIds = new Set([...(decision?.links || []).map((link) => link.rowId), ...(decision?.deleteRowIds || [])])
  const visibleRows = selectedRowIds.size ? rows.filter((row) => selectedRowIds.has(row.id)) : rows
  const visibleOpex = selectedOpexIds.size ? opex.filter((entry) => selectedOpexIds.has(entry.id)) : opex
  console.log(`\nJob ${job.generalInfo?.jobNumber} id=${job.id}`)
  console.log(`adHocExpenses=${rows.length}, operationalExpenses=${opex.length}`)
  console.log(`Selected comparison: adHocExpenses=${visibleRows.length}, operationalExpenses=${visibleOpex.length}`)
  console.log('\nSelected ad-hoc rows:')
  for (const row of visibleRows) {
    const linked = opex.filter((entry) => matchRowToOpex(row, entry)).map((entry) => entry.id)
    console.log(`  row=${row.id || '-'} opexId=${row.opexId || '-'} amount=${money(expenseAmount(row))} created=${iso(row.createdAt)} linked=[${linked.join(', ')}] ${row.description || ''}`)
  }
  console.log('\nSelected OPEX records:')
  for (const entry of [...visibleOpex].sort((a, b) => millis(a.createdAt) - millis(b.createdAt))) {
    console.log(`  doc=${entry.id} sourceItemId=${entry.sourceItemId || '-'} amount=${money(entry.amount)} created=${iso(entry.createdAt)} ${entry.description || ''}`)
  }
}

function validateDecision(job, opex, decision) {
  if (!decision) throw new Error(`No explicit decision configured for ${job.generalInfo?.jobNumber}`)
  const keepIds = new Set(decision.keepOpexIds || [])
  const deleteIds = new Set(decision.deleteOpexIds || [])
  if (!keepIds.size || !deleteIds.size) throw new Error('Decision must contain non-empty keepOpexIds and deleteOpexIds')
  for (const id of keepIds) if (deleteIds.has(id)) throw new Error(`OPEX ${id} appears in both keep and delete lists`)
  const byId = new Map(opex.map((entry) => [entry.id, entry]))
  for (const id of [...keepIds, ...deleteIds]) {
    if (!byId.has(id)) throw new Error(`Configured OPEX ${id} is not linked to this job card`)
  }
  const deleteTotal = [...deleteIds].reduce((sum, id) => sum + Number(byId.get(id).amount || 0), 0)
  if (Number(deleteTotal.toFixed(2)) !== Number(decision.expectedDeleteTotal)) {
    throw new Error(`Delete total ${money(deleteTotal)} does not match configured ${money(decision.expectedDeleteTotal)}`)
  }
  const selectedCount = keepIds.size + deleteIds.size
  if (decision.expectedSelectedCount && selectedCount !== decision.expectedSelectedCount) {
    throw new Error(`Expected ${decision.expectedSelectedCount} selected OPEX records but configured ${selectedCount}`)
  }
  return { keepIds, deleteIds, byId, deleteTotal }
}

function buildLinks(job, keepEntries, decision) {
  const deleteRowIds = new Set(decision.deleteRowIds || [])
  const originalRows = job.adHocExpenses || []
  for (const rowId of deleteRowIds) {
    if (!originalRows.some((row) => row.id === rowId)) throw new Error(`Configured deleted row ${rowId} does not exist`)
  }
  const deletedRows = originalRows.filter((row) => deleteRowIds.has(row.id))
  const rows = originalRows.filter((row) => !deleteRowIds.has(row.id)).map((row) => ({ ...row }))
  const links = decision.links || []
  if (links.length !== keepEntries.length) throw new Error('Decision links must map every retained OPEX record')
  for (const link of links) {
    const row = rows.find((candidate) => candidate.id === link.rowId)
    const entry = keepEntries.find((candidate) => candidate.id === link.opexId)
    if (!row) throw new Error(`Configured ad-hoc row ${link.rowId} does not exist`)
    if (!entry) throw new Error(`Configured retained OPEX ${link.opexId} does not exist`)
    if (expenseAmount(row) !== Number(entry.amount || 0)) {
      throw new Error(`Amount mismatch for row ${row.id} and OPEX ${entry.id}`)
    }
    row.opexId = entry.id
  }
  return { rows, links, deletedRows }
}

async function reconcileJob(number) {
  const job = await findJob(number)
  const opex = await loadOpexForJob(job.id)
  const decision = decisions[number]
  printJobComparison(job, opex, decision)

  if (!decision || !(decision.keepOpexIds || []).length) {
    console.log('\nNo exact-ID decision is configured. Copy the verified document and row IDs into scripts/jobcard-opex-decisions.json before applying.')
    if (apply) throw new Error('Refusing to apply without an exact-ID decision')
    return
  }

  const currentById = new Map(opex.map((entry) => [entry.id, entry]))
  const allKeptExist = decision.keepOpexIds.every((id) => currentById.has(id))
  const allDeletedAbsent = decision.deleteOpexIds.every((id) => !currentById.has(id))
  const allLinksApplied = decision.links.every((link) => {
    const row = (job.adHocExpenses || []).find((candidate) => candidate.id === link.rowId)
    const entry = currentById.get(link.opexId)
    return row?.opexId === link.opexId && entry?.sourceItemId === link.rowId
  })
  if (allKeptExist && allDeletedAbsent && allLinksApplied) {
    console.log('\nALREADY APPLIED AND VERIFIED — retained links are correct and configured duplicates are absent.')
    return
  }

  const validated = validateDecision(job, opex, decision)
  const keepEntries = [...validated.keepIds].map((id) => validated.byId.get(id))
  const deleteEntries = [...validated.deleteIds].map((id) => validated.byId.get(id))
  const { rows, links, deletedRows } = buildLinks(job, keepEntries, decision)

  console.log('\nDecision:')
  for (const entry of keepEntries) console.log(`  KEEP   ${entry.id} ${money(entry.amount)} ${entry.description || ''}`)
  for (const entry of deleteEntries) console.log(`  DELETE ${entry.id} ${money(entry.amount)} ${entry.description || ''}`)
  for (const row of deletedRows) console.log(`  REMOVE row=${row.id} ${money(expenseAmount(row))} ${row.description || ''}`)
  for (const link of links) console.log(`  LINK   row=${link.rowId} -> opex=${link.opexId}`)
  console.log(`  Expected finance reduction: ${money(validated.deleteTotal)}`)

  if (!apply) {
    console.log('\nDRY RUN — no writes made. Re-run with --apply after reviewing these exact IDs.')
    return
  }

  const batch = db.batch()
  for (const entry of deleteEntries) {
    batch.delete(entry.ref)
    if (entry.verificationToken) batch.delete(db.collection('docVerifications').doc(entry.verificationToken))
    const reserveSnap = await db.collection('reserveAccountTransactions').where('referenceId', '==', entry.id).get()
    for (const walletDoc of reserveSnap.docs) {
      if (walletDoc.data().type === 'PAYMENT') batch.delete(walletDoc.ref)
    }
  }
  for (const link of links) {
    batch.update(db.collection('operationalExpenses').doc(link.opexId), {
      sourceItemId: link.rowId,
      updatedAt: FieldValue.serverTimestamp(),
      reconciledAt: FieldValue.serverTimestamp(),
      reconciledBy: 'scripts/reconcile-jobcard-opex.mjs',
    })
  }
  batch.update(job.ref, { adHocExpenses: rows, updatedAt: FieldValue.serverTimestamp() })
  const auditRef = db.collection('adminAuditLogs').doc(`jobcard-opex-reconcile-${number.toLowerCase()}`)
  batch.create(auditRef, {
    action: 'JOBCARD_OPEX_RECONCILED',
    description: `Reconciled historical duplicate OPEX for ${number}`,
    jobCardId: job.id,
    jobNumber: number,
    deletedVia: 'ADMIN_SCRIPT',
    removedAmount: validated.deleteTotal,
    keptOpexIds: [...validated.keepIds],
    deletedOpexIds: [...validated.deleteIds],
    deletedRowIds: deletedRows.map((row) => row.id),
    links,
    deletedExpenseSnapshots: deleteEntries.map(compactOpex),
    deletedRowSnapshots: deletedRows.map((row) => ({
      id: row.id,
      description: row.description || null,
      amount: expenseAmount(row),
      paymentMethod: row.paymentMethod || null,
      approvalStatus: row.approvalStatus || null,
      opexId: row.opexId || null,
    })),
    performedBy: { uid: null, email: null, displayName: 'reconcile-jobcard-opex.mjs' },
    createdAt: FieldValue.serverTimestamp(),
  })
  await batch.commit()

  const afterJob = await findJob(number)
  const afterOpex = await loadOpexForJob(afterJob.id)
  const afterIds = new Set(afterOpex.map((entry) => entry.id))
  for (const id of validated.deleteIds) if (afterIds.has(id)) throw new Error(`Verification failed: ${id} still exists`)
  for (const link of links) {
    const entry = afterOpex.find((candidate) => candidate.id === link.opexId)
    const row = (afterJob.adHocExpenses || []).find((candidate) => candidate.id === link.rowId)
    if (entry?.sourceItemId !== link.rowId || row?.opexId !== link.opexId) throw new Error(`Verification failed for link ${link.rowId}`)
  }
  for (const row of deletedRows) {
    if ((afterJob.adHocExpenses || []).some((candidate) => candidate.id === row.id)) throw new Error(`Verification failed: row ${row.id} still exists`)
  }
  console.log(`\nAPPLIED AND VERIFIED — removed ${deleteEntries.length} OPEX records totaling ${money(validated.deleteTotal)}.`)
}

function nearbyDuplicateGroups(entries, windowMs = 24 * 60 * 60 * 1000) {
  const groups = new Map()
  for (const entry of entries) {
    const key = `${entry.sourceJobId || '-'}|${normalize(entry.description)}|${Number(entry.amount || 0).toFixed(2)}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(entry)
  }
  return [...groups.values()].filter((group) => {
    if (group.length < 2) return false
    const times = group.map((entry) => millis(entry.createdAt)).filter(Boolean).sort((a, b) => a - b)
    return times.some((time, index) => index > 0 && time - times[index - 1] <= windowMs)
  })
}

async function runAllAudit() {
  const [jobSnap, opexSnap, paymentSnap, transferSnap, topUpSnap, loanSnap, salariesSnap, reserveSnap] = await Promise.all([
    db.collection('jobCards').get(),
    db.collection('operationalExpenses').get(),
    db.collection('jobPayments').get(),
    db.collection('fundTransfers').where('status', '==', 'COMPLETED').get(),
    db.collection('ledgerTopUps').where('status', '==', 'COMPLETED').get(),
    db.collection('businessLoanTransactions').where('status', '==', 'COMPLETED').get(),
    db.collection('salariesAccountTransactions').get(),
    db.collection('reserveAccountTransactions').get(),
  ])
  const jobs = new Map(jobSnap.docs.map((doc) => [doc.id, { id: doc.id, ...doc.data() }]))
  const entries = opexSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((entry) => entry.sourceJobId || normalize(entry.category) === 'job card expense')
  const bySourceItem = new Map()
  for (const entry of entries) {
    if (!entry.sourceItemId) continue
    if (!bySourceItem.has(entry.sourceItemId)) bySourceItem.set(entry.sourceItemId, [])
    bySourceItem.get(entry.sourceItemId).push(entry)
  }
  const repeatedSourceIds = [...bySourceItem.entries()].filter(([, group]) => group.length > 1)
  const duplicateCommittedSourceIds = [...bySourceItem.entries()].filter(([, group]) =>
    group.filter((entry) => committedExpenseStatuses.has(String(entry.status || ''))).length > 1
  )
  const missingSourceIds = entries.filter((entry) => !entry.sourceItemId)
  const approvedRowsMissingOpex = []
  const invalidPaymentMethods = []
  const multiLinkedRows = []
  for (const job of jobs.values()) {
    for (const row of job.adHocExpenses || []) {
      const linked = entries.filter((entry) => entry.sourceJobId === job.id && matchRowToOpex(row, entry))
      if (linked.length > 1) multiLinkedRows.push({ job, row, linked })
      if (row.approvalStatus === 'APPROVED_MANAGER' && (!row.opexId || !entries.some((entry) => entry.id === row.opexId))) {
        approvedRowsMissingOpex.push({ job, row })
      }
      const account = canonicalAccount(row.paymentMethod)
      if (row.paymentMethod == null || account === 'UNKNOWN' || !validLiquidAccounts.has(account)) {
        invalidPaymentMethods.push({ job, row, raw: row.paymentMethod ?? null })
      }
    }
  }
  const nearby = nearbyDuplicateGroups(entries)
  const balances = { BANK: 0, CASH: 0, ECOCASH: 0, IRD: 0, SALARIES: 0, RESERVE: 0 }
  for (const entry of opexSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))) {
    if (!committedExpenseStatuses.has(String(entry.status || ''))) continue
    const account = canonicalAccount(entry.paymentMethod)
    if (account in balances) balances[account] -= Math.abs(Number(entry.amount || 0))
  }
  for (const payment of paymentSnap.docs.map((doc) => doc.data())) {
    const account = canonicalAccount(payment.paymentMethod)
    if (account in balances) balances[account] += Math.abs(Number(payment.amount || 0))
  }
  for (const transfer of transferSnap.docs.map((doc) => doc.data())) {
    const from = canonicalAccount(transfer.fromAccount)
    const to = canonicalAccount(transfer.toAccount)
    const amount = Math.abs(Number(transfer.amount || 0))
    if (from in balances) balances[from] -= amount
    if (to in balances) balances[to] += amount
  }
  for (const topUp of topUpSnap.docs.map((doc) => doc.data())) {
    const account = canonicalAccount(topUp.account)
    if (account in balances) balances[account] += Number(topUp.amount || 0)
  }
  for (const loan of loanSnap.docs.map((doc) => doc.data())) {
    const account = canonicalAccount(loan.account)
    const amount = Math.abs(Number(loan.amount || 0))
    if (account in balances) balances[account] += loan.transactionType === 'REPAYMENT' ? -amount : amount
  }
  const walletBalance = (snap) => snap.docs.reduce((sum, doc) => {
    const row = doc.data()
    const amount = Number(row.amount || 0)
    if (row.type === 'FUNDING' || row.type === 'TRANSFER') return sum + amount
    if (row.type === 'PAYMENT') return sum - amount
    return sum
  }, 0)
  balances.SALARIES = walletBalance(salariesSnap)
  balances.RESERVE = walletBalance(reserveSnap)
  const negativeLiquidAccounts = Object.entries(balances).filter(([, balance]) => Number(balance) < 0)

  const lines = []
  const log = (line = '') => lines.push(line)
  log('JOB-CARD OPEX LEGACY AUDIT (READ-ONLY)')
  log(`Generated: ${new Date().toISOString()}`)
  log(`Job cards: ${jobs.size}; job-card OPEX: ${entries.length}`)
  log(`Repeated sourceItemId groups: ${repeatedSourceIds.length}`)
  for (const [id, group] of repeatedSourceIds) log(`  sourceItemId=${id}: ${group.map((entry) => entry.id).join(', ')}`)
  log(`\nDuplicate committed sourceItemId groups: ${duplicateCommittedSourceIds.length}`)
  for (const [id, group] of duplicateCommittedSourceIds) {
    const committed = group.filter((entry) => committedExpenseStatuses.has(String(entry.status || '')))
    log(`  sourceItemId=${id}: ${committed.map((entry) => entry.id).join(', ')}`)
  }
  log(`\nApproved ad-hoc rows missing a valid OPEX link: ${approvedRowsMissingOpex.length}`)
  for (const item of approvedRowsMissingOpex) log(`  job=${item.job.generalInfo?.jobNumber || item.job.id} row=${item.row.id || '-'} amount=${money(expenseAmount(item.row))} opexId=${item.row.opexId || '-'} ${item.row.description || ''}`)
  log(`\nAd-hoc rows with invalid payment methods: ${invalidPaymentMethods.length}`)
  for (const item of invalidPaymentMethods) log(`  job=${item.job.generalInfo?.jobNumber || item.job.id} row=${item.row.id || '-'} raw=${item.raw === null ? '<missing>' : String(item.raw)} amount=${money(expenseAmount(item.row))} ${item.row.description || ''}`)
  log(`\nAd-hoc rows linked to multiple OPEX: ${multiLinkedRows.length}`)
  for (const item of multiLinkedRows) log(`  job=${item.job.generalInfo?.jobNumber || item.job.id} row=${item.row.id || '-'}: ${item.linked.map((entry) => entry.id).join(', ')}`)
  log(`\nLegacy OPEX without sourceItemId: ${missingSourceIds.length}`)
  for (const entry of missingSourceIds) log(`  job=${jobs.get(entry.sourceJobId)?.generalInfo?.jobNumber || entry.sourceJobId || '-'} doc=${entry.id} ${money(entry.amount)} ${entry.description || ''}`)
  log(`\nSame job/description/amount within 24 hours: ${nearby.length} groups`)
  for (const group of nearby) log(`  job=${jobs.get(group[0].sourceJobId)?.generalInfo?.jobNumber || group[0].sourceJobId || '-'} amount=${money(group[0].amount)} docs=${group.map((entry) => entry.id).join(', ')} ${group[0].description || ''}`)
  log(`\nLiquid accounts below zero: ${negativeLiquidAccounts.length}`)
  for (const [account, balance] of negativeLiquidAccounts) log(`  ${account}: ${money(balance)}`)
  log('\nAUDIT COMPLETE — no writes made.')
  const report = `${lines.join('\n')}\n`
  if (outputFile) {
    const destination = resolve(projectRoot, outputFile)
    if (!destination.startsWith(`${projectRoot}/`)) throw new Error('--output must stay inside project-management-next')
    writeFileSync(destination, report, 'utf8')
    console.log(`Audit saved to ${destination}`)
  } else {
    console.log(report)
  }
}

if (auditAll) await runAllAudit()
else await reconcileJob(jobNumber)
