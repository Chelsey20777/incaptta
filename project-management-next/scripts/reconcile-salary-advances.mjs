/**
 * Salary-advance audit and reviewed migration. Dry-run is the default.
 * Applying changes requires --apply --decisions <file>; ambiguous records are
 * never changed automatically.
 */
import { readFileSync } from 'fs'
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

const args = process.argv.slice(2)
const valueAfter = (flag) => { const i = args.indexOf(flag); return i < 0 ? null : args[i + 1] || null }
const apply = args.includes('--apply')
const decisionsPath = valueAfter('--decisions')
if (apply && !decisionsPath) throw new Error('--apply requires --decisions <reviewed-json-file>')

const credential = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY))
  : applicationDefault()
if (!getApps().length) initializeApp({ credential })
const db = getFirestore()

const [advanceSnap, payrollSnap, expenseSnap, employeeSnap] = await Promise.all([
  db.collection('salaryAdvances').get(), db.collection('payroll').get(),
  db.collection('operationalExpenses').where('type', '==', 'SALARY_ADVANCE').get(),
  db.collection('employees').get(),
])
const payrolls = payrollSnap.docs.map(d => ({ id: d.id, ...d.data() }))
const expenses = expenseSnap.docs.map(d => ({ id: d.id, ...d.data() }))
const employees = new Map(employeeSnap.docs.map(d => [d.id, { id: d.id, ...d.data() }]))
const issues = []
const candidates = []

for (const doc of advanceSnap.docs) {
  const row = { id: doc.id, ...doc.data() }
  const linkedPayrolls = payrolls.filter(p => (p.linkedAdvanceIds || []).includes(row.id))
  const linkedExpenses = expenses.filter(e => e.advanceId === row.id || e.id === row.ledgerEntryId)
  const amount = Number(row.originalAmount ?? row.amount)
  const employee = employees.get(row.employeeId)
  const rowIssues = []
  if (!row.employeeName) rowIssues.push('MISSING_EMPLOYEE_NAME')
  if (!Number.isFinite(amount) || amount <= 0) rowIssues.push('INVALID_AMOUNT')
  if (linkedExpenses.length > 1) rowIssues.push('DUPLICATE_EXPENSES')
  if (linkedPayrolls.length > 1) rowIssues.push('LINKED_TO_MULTIPLE_PAYROLLS')
  if (row.status === 'Processed' && linkedPayrolls.filter(p => p.status === 'Paid').length === 0) rowIssues.push('PROCESSED_WITHOUT_PAID_PAYROLL')
  if (row.ledgerEntryId && !linkedExpenses.some(e => e.id === row.ledgerEntryId)) rowIssues.push('MISSING_LEDGER_ENTRY')
  if (rowIssues.length) issues.push({ advanceId: row.id, issues: rowIssues, payrollIds: linkedPayrolls.map(p => p.id), expenseIds: linkedExpenses.map(e => e.id) })
  const paidRecovery = linkedPayrolls.filter(p => p.status === 'Paid').reduce((sum, p) => sum + Number(p.advanceInstallments?.[row.id] ?? (p.linkedAdvanceIds?.length === 1 ? p.advanceDeduction : 0) ?? 0), 0)
  candidates.push({ advanceId: row.id, employeeName: row.employeeName || employee?.fullName || employee?.name || null, originalAmount: amount, suggestedRecoveredAmount: Math.min(Math.max(0, paidRecovery), Math.max(0, amount)), legacyStatus: row.status, ambiguous: rowIssues.length > 0 })
}

const report = { generatedAt: new Date().toISOString(), totals: { advances: advanceSnap.size, issues: issues.length }, issues, migrationCandidates: candidates }
console.log(JSON.stringify(report, null, 2))

if (apply) {
  const decisions = JSON.parse(readFileSync(decisionsPath, 'utf8'))
  const validIds = new Set(candidates.map(c => c.advanceId))
  const validExpenseIds = new Set(expenses.map(e => e.id))
  const batch = db.batch()
  for (const item of decisions.migrations || []) {
    if (!validIds.has(item.advanceId)) throw new Error(`Unknown advance decision: ${item.advanceId}`)
    if (!['PENDING_ACCOUNTANT','ACTIVE','SETTLED','REJECTED','REVERSED'].includes(item.status)) throw new Error(`Invalid target status for ${item.advanceId}`)
    const originalAmount = Number(item.originalAmount)
    const recoveredAmount = Number(item.recoveredAmount || 0)
    const outstandingBalance = Number(item.outstandingBalance)
    if (!(originalAmount > 0) || recoveredAmount < 0 || outstandingBalance < 0 || Math.abs(originalAmount - recoveredAmount - outstandingBalance) > 0.01) throw new Error(`Balances do not reconcile for ${item.advanceId}`)
    batch.update(db.collection('salaryAdvances').doc(item.advanceId), { status: item.status, employeeName: item.employeeName, originalAmount, amount: originalAmount, recoveredAmount, outstandingBalance, reservedBalance: 0, legacy: false, migratedAt: FieldValue.serverTimestamp(), migrationNote: item.note || '' })
  }
  for (const expenseId of decisions.reverseDuplicateExpenseIds || []) {
    if (!validExpenseIds.has(expenseId)) throw new Error(`Unknown salary-advance expense: ${expenseId}`)
    batch.update(db.collection('operationalExpenses').doc(expenseId), { status: 'REVERSED', reversalReason: 'Reviewed duplicate salary-advance expense', reversedAt: FieldValue.serverTimestamp() })
  }
  await batch.commit()
  console.error(`Applied ${decisions.migrations?.length || 0} migrations and ${decisions.reverseDuplicateExpenseIds?.length || 0} expense reversals.`)
}
