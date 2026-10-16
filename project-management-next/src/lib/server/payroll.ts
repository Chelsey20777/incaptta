import { getApp } from 'firebase-admin/app'
import { createHash } from 'node:crypto'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase-admin'
import { getAccountBalanceInTransaction } from './account-balance'
import { normalizeAccountKey } from '@/lib/account-keys'
import { allocateOldest, assertStaging, businessDate, calculateMonthlyPayroll, type MonthlyPayrollPeer, cents, money, paymentStatus, periodEnd, periodKey, positive, recognitionOpens, salaryDraftWindow, staffRateWindow, today, validatePolicy, type PayrollPolicy } from '@/lib/payroll/core'

export interface PayrollActor { uid: string; name: string; roles: string[] }
const managers = ['MANAGER', 'DIRECTOR', 'ADMIN', 'SUPER_ADMIN']
const accountants = ['ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN']
const requireRole = (actor: PayrollActor, roles: string[]) => {
  if (!actor.roles.some(r => roles.includes(r))) throw new Error('Insufficient payroll permissions')
}
const id = (value: unknown) => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(value)) throw new Error('Invalid record identifier')
  return value
}
export function guardPayrollEnvironment() {
  assertStaging(process.env.DEPLOYMENT_ENV, process.env.FIREBASE_PROJECT_ID)
  if (getApp().options.projectId !== 'incaptta-pro-staging') throw new Error('Payroll database is not staging')
}

export async function savePayrollPolicy(policy: PayrollPolicy, actor: PayrollActor) {
  guardPayrollEnvironment(); requireRole(actor, accountants); validatePolicy(policy)
  const ref = adminDb.collection('payrollPolicies').doc()
  await ref.create({ ...policy, id: ref.id, reviewedBy: actor, reviewedAt: FieldValue.serverTimestamp() })
  return { id: ref.id }
}

export interface DraftInput {
  payrollId?: string; employeeId: string; month: number; year: number; basicSalary: number; allowances: number
  damagesDeduction: number; uniformDeduction: number; policyId: string; dueDate: string
  advanceInstallments: Record<string, number>
}
export async function savePayrollDraft(input: DraftInput, actor: PayrollActor) {
  guardPayrollEnvironment(); requireRole(actor, accountants)
  const schedule = salaryDraftWindow(input.year, input.month, actor.roles)
  if (!schedule.allowed) throw new Error(schedule.reason)
  const end = periodEnd(input.year, input.month); businessDate(input.dueDate)
  const employeeId = id(input.employeeId)
  for (const n of [input.basicSalary, input.allowances, input.damagesDeduction, input.uniformDeduction]) if (cents(n) < 0) throw new Error('Negative payroll amount')
  const ref = adminDb.collection('payroll').doc(input.payrollId ? id(input.payrollId) : `${employeeId}_${input.year}_${input.month}`)
  return adminDb.runTransaction(async tx => {
    const [employee, existing, duplicates, config] = await Promise.all([
      tx.get(adminDb.collection('employees').doc(employeeId)), tx.get(ref),
      tx.get(adminDb.collection('payroll').where('employeeId', '==', employeeId)),
      tx.get(adminDb.collection('payrollPolicies').doc(id(input.policyId))),
    ])
    if (!employee.exists) throw new Error('Employee not found')
    const old = existing.data() || {}
    if (input.payrollId && !existing.exists && ref.id !== `${employeeId}_${input.year}_${input.month}`) throw new Error('A supplement must originate from approved source earnings')
    if (existing.exists && (old.employeeId !== employeeId || old.month !== input.month || old.year !== input.year)) throw new Error('Payroll identity cannot change')
    if (duplicates.docs.some(d => d.id !== ref.id && d.data().schemaVersion !== 2 && d.data().month === input.month && d.data().year === input.year)) throw new Error('Legacy or duplicate payroll requires reconciliation')
    if (existing.exists && old.schemaVersion !== 2) throw new Error('Legacy payroll requires reconciliation before conversion')
    if (old.recognized || old.status === 'Paid' || Number(old.paidAmount || 0) > 0) throw new Error('Recognised payroll is locked; use an audited correction')
    if (!config.exists) throw new Error('Select an accountant-reviewed statutory policy')
    const policy = config.data() as PayrollPolicy
    if (Number(old.jobCardEarnings || 0) > 0 && old.currency !== policy.currency) throw new Error('Source earnings and payroll policy must use the same currency')
    if (end < policy.effectiveFrom || end > policy.effectiveTo) throw new Error('Statutory policy does not cover this earning month')
    const advanceIds = [...new Set([...Object.keys(old.advanceInstallments || {}), ...Object.keys(input.advanceInstallments)])]
    if (advanceIds.length > 100) throw new Error('Too many advance instalments')
    const advances = await Promise.all(advanceIds.map(key => tx.get(adminDb.collection('salaryAdvances').doc(id(key)))))
    const totalAdvance = money(Object.values(input.advanceInstallments).reduce((s, n) => s + positive(n), 0))
    const gross = money(input.basicSalary + input.allowances + Number(old.jobCardEarnings || 0))
    const peers = duplicates.docs.filter(d => d.id !== ref.id && d.data().recognized && d.data().month === input.month && d.data().year === input.year && d.data().currency === policy.currency)
    if (peers.some(d => d.data().policyId !== input.policyId)) throw new Error('Use the same statutory policy as the other payroll records for this month')
    const peerVersions = Object.fromEntries(peers.map(d => [d.id, d.data().revision]))
    const amounts = calculateMonthlyPayroll(gross, totalAdvance, money(input.damagesDeduction + input.uniformDeduction), policy, peers.map(d => d.data()) as MonthlyPayrollPeer[])
    // Complete all reads and validation before scheduling writes.
    for (const snap of advances) {
      const a = snap.data() || {}, requested = input.advanceInstallments[snap.id] || 0
      const previous = Number(old.advanceInstallments?.[snap.id] || 0)
      if (!snap.exists || a.employeeId !== employeeId || a.status !== 'ACTIVE' || (a.currency || 'USD') !== policy.currency) throw new Error('Advance is not active for this employee and currency')
      if (cents(requested) > cents(Number(a.outstandingBalance || 0) - Number(a.reservedBalance || 0) + previous)) throw new Error('Advance amount exceeds unreserved balance')
    }
    for (const snap of advances) {
      const a = snap.data()!, requested = input.advanceInstallments[snap.id] || 0
      const previous = Number(old.advanceInstallments?.[snap.id] || 0)
      tx.update(snap.ref, { reservedBalance: money(Number(a.reservedBalance || 0) - previous + requested) })
      tx.set(adminDb.collection('salaryAdvanceRecoveries').doc(`${ref.id}_${snap.id}`), {
        payrollId: ref.id, advanceId: snap.id, employeeId, amount: requested,
        status: requested ? 'RESERVED' : 'RELEASED', updatedAt: FieldValue.serverTimestamp(), actor,
      })
    }
    const e = employee.data()!
    tx.set(ref, {
      ...input, ...amounts, gross, peerVersions, schemaVersion: 2, currency: policy.currency, policySnapshot: policy,
      employeeName: e.fullName || e.name || [e.firstName, e.lastName].filter(Boolean).join(' '),
      allowances: money(input.allowances + Number(old.jobCardEarnings || 0)), manualAllowances: input.allowances,
      jobCardEarnings: Number(old.jobCardEarnings || 0), advanceDeduction: totalAdvance,
      advanceRecoveryDetails: advances.filter(a => input.advanceInstallments[a.id] > 0).map(a => ({ advanceId: a.id, amount: input.advanceInstallments[a.id], balanceBefore: Number(a.data()?.outstandingBalance), balanceAfter: money(Number(a.data()?.outstandingBalance) - input.advanceInstallments[a.id]) })),
      effectiveDate: end, generated: true, recognized: false, status: 'Unpaid', paidAmount: 0,
      scheduleCatchUp: schedule.catchUp ? { actor, at: new Date().toISOString() } : null,
      outstanding: amounts.netPay, approvalStatus: 'PENDING_MANAGER', approvalSource: 'MANAGER',
      revision: Number(old.revision || 0) + 1, updatedAt: FieldValue.serverTimestamp(), generatedAt: FieldValue.serverTimestamp(), preparedBy: actor,
    }, { merge: true })
    return { id: ref.id }
  })
}

export async function recognizePayroll(payrollId: string, revision: number, actor: PayrollActor) {
  guardPayrollEnvironment(); requireRole(actor, managers)
  const ref = adminDb.collection('payroll').doc(id(payrollId))
  return adminDb.runTransaction(async tx => {
    const snap = await tx.get(ref); const p = snap.data()
    if (!p || p.schemaVersion !== 2 || !p.generated) throw new Error('Generate a reviewed payroll draft first')
    if (p.revision !== revision) throw new Error('Payroll changed; review the latest draft')
    if (p.recognized) return { id: payrollId, idempotent: true }
    if (today() < recognitionOpens(p.year, p.month)) throw new Error('Recognise payroll from the 25th of its earning month')
    const journalDate = today() > p.effectiveDate ? p.effectiveDate : today()
    const monthRows = await tx.get(adminDb.collection('payroll').where('employeeId', '==', p.employeeId))
    const peers = monthRows.docs.filter(d => d.id !== ref.id && d.data().recognized && d.data().month === p.month && d.data().year === p.year && d.data().currency === p.currency)
    if (peers.length !== Object.keys(p.peerVersions || {}).length || peers.some(d => p.peerVersions?.[d.id] !== d.data().revision)) throw new Error('Another payroll for this month changed; regenerate the draft to reconcile deductions')
    const key = `${payrollId}_r${revision}`
    const journalRef = adminDb.collection('payrollJournal').doc(key)
    const prior = await tx.get(journalRef)
    if (prior.exists) throw new Error('This revision was reversed; generate a corrected draft')
    const advances = await Promise.all(Object.keys(p.advanceInstallments || {}).map(key => tx.get(adminDb.collection('salaryAdvances').doc(key))))
    for (const s of advances) {
      const a = s.data(), amount = Number(p.advanceInstallments[s.id])
      if (!a || a.status !== 'ACTIVE' || cents(Number(a.outstandingBalance)) < cents(amount) || cents(Number(a.reservedBalance)) < cents(amount)) throw new Error('Advance reservation requires reconciliation')
    }
    const recoveries = money(p.advanceDeduction + p.damagesDeduction + p.uniformDeduction)
    const statutoryTotal = money(Object.values(p.statutory as Record<string, number>).reduce((s, n) => s + n, 0))
    if (cents(p.gross + p.employerCost) !== cents(p.netPay + statutoryTotal + recoveries)) throw new Error('Payroll journal does not balance')
    tx.create(journalRef, {
      payrollId, employeeId: p.employeeId, employeeName: p.employeeName, currency: p.currency,
      effectiveDate: journalDate, gross: p.gross, employerCost: p.employerCost, net: p.netPay,
      statutory: p.statutory, recoveries, jobEarnings: p.jobCardEarnings, sign: 1,
      lines: [
        { account: 'SALARY_EXPENSE', debit: p.gross, credit: 0 },
        { account: 'EMPLOYER_CONTRIBUTION_EXPENSE', debit: p.employerCost, credit: 0 },
        { account: 'SALARIES_PAYABLE', debit: 0, credit: p.netPay },
        ...Object.entries(p.statutory).map(([account, credit]) => ({ account: `${account}_PAYABLE`, debit: 0, credit })),
        { account: 'EMPLOYEE_ADVANCES', debit: 0, credit: p.advanceDeduction },
        { account: 'EMPLOYEE_OTHER_RECOVERIES', debit: 0, credit: money(p.damagesDeduction + p.uniformDeduction) },
      ], actor, createdAt: FieldValue.serverTimestamp(),
    })
    for (const s of advances) {
      const a = s.data()!, amount = Number(p.advanceInstallments[s.id]), balance = money(a.outstandingBalance - amount)
      tx.update(s.ref, { outstandingBalance: balance, recoveredAmount: money(Number(a.recoveredAmount || 0) + amount), reservedBalance: money(a.reservedBalance - amount), status: balance === 0 ? 'SETTLED' : 'ACTIVE' })
      tx.set(adminDb.collection('salaryAdvanceRecoveries').doc(`${payrollId}_${s.id}`), { status: 'RECOVERED', recoveredAt: FieldValue.serverTimestamp(), balanceAfter: balance, journalId: key }, { merge: true })
    }
    tx.update(ref, { recognized: true, effectiveDate: journalDate, recognizedAt: FieldValue.serverTimestamp(), journalId: key, approvedBy: actor.name, approvedAt: FieldValue.serverTimestamp(), approvalStatus: 'APPROVED_MANAGER', status: paymentStatus(p.netPay, 0), paidAmount: 0, outstanding: p.netPay, statutoryPaid: {}, recognizedBy: actor })
    return { id: payrollId }
  })
}

export interface PaymentInput {
  requestId: string; employeeId: string; currency: string; amount: number; paymentDate: string
  account: string; reference: string; evidence: string; kind: 'EMPLOYEE' | 'STATUTORY'; payrollId?: string; authority?: string
}
export async function settlePayroll(input: PaymentInput, actor: PayrollActor) {
  guardPayrollEnvironment(); requireRole(actor, accountants)
  const amount = positive(input.amount), date = businessDate(input.paymentDate)
  if (date > today()) throw new Error('Payment cannot be dated in the future')
  if (!input.reference.trim() || !input.evidence.trim()) throw new Error('A payment reference and evidence are required')
  // Current cashbook accounts are USD (IRD is ZAR); do not silently mix currencies.
  const account = normalizeAccountKey(input.account)
  if (account === 'UNKNOWN' || input.currency !== 'USD' || !['BANK', 'CASH', 'ECOCASH', 'SALARIES', 'RESERVE'].includes(account)) throw new Error('This funding account supports USD settlements only')
  const receiptRef = adminDb.collection('payrollPaymentRequests').doc(id(input.requestId))
  const fingerprint = createHash('sha256').update(JSON.stringify({ ...input, actor: actor.uid })).digest('hex')
  return adminDb.runTransaction(async tx => {
    const receipt = await tx.get(receiptRef)
    if (receipt.exists) {
      if (receipt.data()?.fingerprint !== fingerprint) throw new Error('Payment request key already used for different details')
      return { allocations: receipt.data()?.allocations, idempotent: true }
    }
    const rows = await tx.get(adminDb.collection('payroll').where('employeeId', '==', id(input.employeeId)))
    const eligible = rows.docs.filter(d => d.data().recognized && d.data().schemaVersion === 2 && d.data().currency === input.currency && d.data().effectiveDate <= date)
    let allocations: Array<{ payrollId: string; amount: number }>
    if (input.kind === 'EMPLOYEE') {
      allocations = allocateOldest(eligible.map(d => ({ id: d.id, outstanding: d.data().outstanding, effectiveDate: d.data().effectiveDate, currency: d.data().currency })), amount, input.currency)
    } else {
      const target = eligible.find(d => d.id === input.payrollId)?.data()
      const authority = input.authority || ''
      if (!target || !Object.hasOwn(target.statutory, authority) || cents(amount) > cents(target.statutory[authority] - Number(target.statutoryPaid?.[authority] || 0))) throw new Error('Statutory payment exceeds the outstanding liability')
      allocations = [{ payrollId: input.payrollId!, amount }]
    }
    if (allocations.length > 100) throw new Error('Settle at most 100 payroll months in one payment')
    const guardRef = adminDb.collection('accountPostingGuards').doc(account)
    const guard = await tx.get(guardRef)
    const balance = await getAccountBalanceInTransaction(tx, account)
    if (cents(balance) < cents(amount)) throw new Error(`Insufficient funds in ${account}`)
    for (const [i, allocation] of allocations.entries()) {
      const row = eligible.find(d => d.id === allocation.payrollId)!, p = row.data()
      const paymentId = `${input.requestId}_${i}`
      tx.create(adminDb.collection('payrollPayments').doc(paymentId), {
        ...input, ...allocation, employeeName: p.employeeName, earningMonth: p.month, earningYear: p.year,
        actor, createdAt: FieldValue.serverTimestamp(), journalId: p.journalId,
        lines: [{ account: input.kind === 'EMPLOYEE' ? 'SALARIES_PAYABLE' : `${input.authority}_PAYABLE`, debit: allocation.amount, credit: 0 }, { account, debit: 0, credit: allocation.amount }],
      })
      if (input.kind === 'EMPLOYEE') {
        const paid = money(Number(p.paidAmount || 0) + allocation.amount)
        tx.update(row.ref, { paidAmount: paid, outstanding: money(p.netPay - paid), status: paymentStatus(p.netPay, paid), lastPaymentDate: date, paymentMethod: account })
      } else tx.update(row.ref, { [`statutoryPaid.${input.authority}`]: money(Number(p.statutoryPaid?.[input.authority!] || 0) + allocation.amount) })
    }
    const cashDate = Timestamp.fromDate(new Date(`${date}T12:00:00+02:00`))
    tx.create(adminDb.collection('operationalExpenses').doc(`payroll-${input.requestId}`), {
      type: 'PAYROLL_SETTLEMENT', category: 'Payroll Settlement', schemaVersion: 2,
      amount, currency: input.currency, paymentMethod: account, status: 'PAYMENT_PROCESSED',
      description: `Payroll ${input.kind.toLowerCase()} settlement — ${input.reference}`,
      paymentRequestId: input.requestId, allocations, reference: input.reference, evidence: input.evidence,
      createdAt: cashDate, paymentDate: date, recordedAt: FieldValue.serverTimestamp(), actor,
    })
    if (account === 'SALARIES' || account === 'RESERVE') tx.create(adminDb.collection(account === 'SALARIES' ? 'salariesAccountTransactions' : 'reserveAccountTransactions').doc(`payroll-${input.requestId}`), {
      type: 'PAYMENT', source: 'PAYROLL_SETTLEMENT', amount, currency: input.currency, referenceId: input.requestId,
      description: `Payroll settlement — ${input.reference}`, createdAt: cashDate, recordedAt: FieldValue.serverTimestamp(), paymentDate: date, actor,
    })
    tx.set(guardRef, { version: Number(guard.data()?.version || 0) + 1, updatedAt: FieldValue.serverTimestamp(), lastPostingId: input.requestId }, { merge: true })
    tx.create(receiptRef, { fingerprint, allocations, actor, createdAt: FieldValue.serverTimestamp() })
    return { allocations }
  })
}

export async function reversePayroll(payrollId: string, reason: string, actor: PayrollActor) {
  guardPayrollEnvironment(); requireRole(actor, managers)
  if (reason.trim().length < 10) throw new Error('Explain the correction (at least 10 characters)')
  return adminDb.runTransaction(async tx => {
    const ref = adminDb.collection('payroll').doc(id(payrollId)), snap = await tx.get(ref), p = snap.data()
    if (!p?.recognized || p.schemaVersion !== 2) throw new Error('Recognised payroll not found')
    if (p.hasAdjustments) throw new Error('Use another audited adjustment to correct this payroll')
    if (Number(p.paidAmount || 0) > 0 || Object.values(p.statutoryPaid || {}).some(n => Number(n) > 0)) throw new Error('Settled payroll requires a separate correcting payroll; it cannot be reversed')
    const monthRows = await tx.get(adminDb.collection('payroll').where('employeeId', '==', p.employeeId))
    if (monthRows.docs.some(d => d.id !== ref.id && d.data().recognized && d.data().month === p.month && d.data().year === p.year && d.data().currency === p.currency)) throw new Error('Use a monthly earnings adjustment while other supplements remain recognised')
    const journal = await tx.get(adminDb.collection('payrollJournal').doc(p.journalId))
    if (!journal.exists) throw new Error('Recognition journal missing')
    const advances = await Promise.all(Object.keys(p.advanceInstallments || {}).map(key => tx.get(adminDb.collection('salaryAdvances').doc(key))))
    if (advances.some(s => !s.exists)) throw new Error('Advance requires reconciliation')
    const j = journal.data()!
    tx.create(adminDb.collection('payrollJournal').doc(`${p.journalId}_reversal`), { ...j, sign: -1, reversalOf: p.journalId, reason, actor, createdAt: FieldValue.serverTimestamp(), lines: j.lines.map((l: { account: string; debit: number; credit: number }) => ({ account: l.account, debit: l.credit, credit: l.debit })) })
    for (const s of advances) {
      const a = s.data()!, amount = Number(p.advanceInstallments[s.id])
      tx.update(s.ref, { outstandingBalance: money(Number(a.outstandingBalance) + amount), recoveredAmount: money(Number(a.recoveredAmount) - amount), reservedBalance: money(Number(a.reservedBalance || 0) + amount), status: 'ACTIVE' })
      tx.set(adminDb.collection('salaryAdvanceRecoveries').doc(`${payrollId}_${s.id}`), { status: 'RESERVED', reversalReason: reason }, { merge: true })
    }
    tx.update(ref, { recognized: false, approvalStatus: 'PENDING_MANAGER', status: 'Unpaid', revision: p.revision + 1, reversalReason: reason, updatedAt: FieldValue.serverTimestamp() })
    return { id: payrollId }
  })
}

/** Approved job wages / MBDI claims retain an explicit service month, including late approvals. */
export async function postPayrollEarning(source: 'JOB' | 'MBDI', sourceId: string, lineId: string, actor: PayrollActor, options?: { scheduled?: boolean }) {
  guardPayrollEnvironment()
  if (source === 'JOB' && !options?.scheduled) throw new Error('Approved staff rates are posted from HR on the 15th')
  requireRole(actor, source === 'JOB' ? [...new Set([...managers, ...accountants])] : managers)
  return adminDb.runTransaction(async tx => {
    const sourceSnap = await tx.get(adminDb.collection(source === 'JOB' ? 'jobCards' : 'mbdiInitiatives').doc(id(sourceId)))
    const s = sourceSnap.data()
    if (!s) throw new Error('Earnings source not found')
    const line = source === 'JOB' ? (s.staffRates || []).find((r: { id: string }) => r.id === lineId) : (s.claims || []).find((r: { id: string }) => r.id === lineId)
    if (!line) throw new Error('Earnings line not found')
    if (source === 'JOB' && line.approvalStatus !== 'APPROVED_MANAGER') throw new Error('Approve the staff rate first')
    if (source === 'MBDI' && !['PENDING', 'APPROVED'].includes(line.status)) throw new Error('Claim is not awaiting approval')
    const period = String(line.earningPeriod || '')
    if (!/^\d{4}-\d{2}$/.test(period)) throw new Error('Record the earning month on the source before posting wages')
    const year = Number(period.slice(0, 4)), month = Number(period.slice(5, 7)), effectiveDate = periodEnd(year, month)
    const logName = source === 'JOB' ? 'jobCardPayrollPostings' : 'mbdiPayrollPostings'
    const stage = line.stage === 'COMPLETION' ? 'STAGE2' : 'STAGE3'
    const logId = `${sourceId}_${source === 'JOB' ? id(lineId) : stage}`
    const logRef = adminDb.collection(logName).doc(logId), log = await tx.get(logRef)
    if (log.exists) {
      if (log.data()?.schemaVersion !== 2) throw new Error('Legacy earnings posting requires reconciliation')
      const posted = log.data()!
      const expectedAmount = source === 'JOB' ? Number(line.jobRateAmount) : money(Number(s.rewardAmount) / 2)
      if (posted.earningPeriod !== period || cents(posted.amount) !== cents(expectedAmount) || (source === 'JOB' && posted.employeeId !== line.employeeId)) throw new Error('Posted source earnings changed; reconcile before posting again')
      return posted
    }
    let employeeId = line.employeeId
    if (source === 'MBDI') {
      const employees = await tx.get(adminDb.collection('employees'))
      const users = await tx.get(adminDb.collection('users'))
      const email = String(s.ownerEmail || '').trim().toLowerCase()
      const owner = users.docs.find(d => d.id === s.ownerId || String(d.data().email || '').toLowerCase() === email)
      const matches = employees.docs.filter(d => d.id === owner?.data().employeeId || (owner && d.data().userId === owner.id) || (email && String(d.data().email || '').toLowerCase() === email))
      if (matches.length !== 1) throw new Error('Resolve the MBDI owner to one HR employee')
      employeeId = matches[0].id
    }
    const employee = await tx.get(adminDb.collection('employees').doc(id(employeeId)))
    if (!employee.exists) throw new Error('HR employee not found')
    const amount = positive(source === 'JOB' ? line.jobRateAmount : money(Number(s.rewardAmount) / 2))
    const baseRef = adminDb.collection('payroll').doc(`${employeeId}_${year}_${month}`)
    let ref = baseRef, snap = await tx.get(ref)
    if (snap.exists && (snap.data()?.recognized || snap.data()?.schemaVersion !== 2 || snap.data()?.currency !== 'USD')) {
      // A separate supplement retains the earning period and preserves recognised / legacy records.
      ref = adminDb.collection('payroll').doc(`${employeeId}_${year}_${month}_${source}_${logId}`)
      snap = await tx.get(ref)
    }
    const p = snap.data() || {}, e = employee.data()!
    if (p.recognized) throw new Error('Earning supplement is already recognised')
    const jobEarnings = money(Number(p.jobCardEarnings || 0) + amount)
    tx.set(ref, {
      schemaVersion: 2, employeeId, employeeName: e.fullName || e.name || [e.firstName, e.lastName].filter(Boolean).join(' '),
      month, year, effectiveDate, currency: 'USD', basicSalary: Number(p.basicSalary || 0),
      allowances: money(Number(p.manualAllowances || 0) + jobEarnings), jobCardEarnings: jobEarnings,
      jobCardReferences: [...new Set([...(p.jobCardReferences || []), source === 'JOB' ? s.generalInfo?.jobNumber || sourceId : s.mbdiNo || sourceId])],
      jobCardRateIds: [...(p.jobCardRateIds || []), logId],
      netPay: money(Number(p.basicSalary || 0) + Number(p.manualAllowances || 0) + jobEarnings), deductions: 0,
      generated: false, recognized: false, approvalStatus: 'PENDING_MANAGER', status: 'Unpaid', revision: Number(p.revision || 0) + 1,
      updatedAt: FieldValue.serverTimestamp(), supplement: ref.id !== baseRef.id,
    }, { merge: true })
    const posting = { schemaVersion: 2, amount, month, year, employeeId, employeeName: e.fullName || e.name || employeeId,
      payrollId: ref.id, source, sourceId, rateId: lineId, jobCardId: source === 'JOB' ? sourceId : '',
      jobNumber: s.generalInfo?.jobNumber || s.mbdiNo || sourceId, earningPeriod: period,
      postedAt: new Date().toISOString(), postedByUid: actor.uid, postedByName: actor.name }
    tx.create(logRef, posting)
    if (source === 'JOB') {
      // Parity with legacy client path: labour accrues on the Salaries wallet.
      tx.create(adminDb.collection('salariesAccountTransactions').doc(), {
        type: 'ACCUMULATION',
        source: 'STAFF_RATE',
        amount,
        month,
        year,
        description: `Staff Rate Approved: ${e.fullName || e.name || employeeId} - Job ${s.generalInfo?.jobNumber || sourceId}`,
        referenceId: sourceId,
        createdAt: FieldValue.serverTimestamp(),
      })
      tx.update(sourceSnap.ref, {
        staffRates: (s.staffRates || []).map((r: { id: string; paymentMethod?: string }) =>
          r.id === lineId ? { ...r, paymentMethod: 'SALARIES', payrollPosted: true, payrollPostedAt: new Date().toISOString() } : r
        ),
        updatedAt: FieldValue.serverTimestamp(),
      })
    }
    return posting
  })
}

export async function adjustPayroll(input: { payrollId: string; requestId: string; revision: number; basicSalary: number; allowances: number; reason: string }, actor: PayrollActor) {
  guardPayrollEnvironment(); requireRole(actor, managers)
  if (input.reason.trim().length < 10 || cents(input.basicSalary) < 0 || cents(input.allowances) < 0) throw new Error('Explain the adjustment and enter nonnegative earnings')
  const key = `adjustment_${id(input.requestId)}`
  return adminDb.runTransaction(async tx => {
    const ref = adminDb.collection('payroll').doc(id(input.payrollId))
    const [snap, prior] = await Promise.all([tx.get(ref), tx.get(adminDb.collection('payrollJournal').doc(key))])
    const fingerprint = createHash('sha256').update(JSON.stringify({ ...input, actor: actor.uid })).digest('hex')
    if (prior.exists) {
      if (prior.data()?.fingerprint !== fingerprint) throw new Error('Adjustment key has already been used')
      return { id: key, idempotent: true }
    }
    const p = snap.data()
    if (!p?.recognized || p.schemaVersion !== 2 || p.revision !== input.revision) throw new Error('Review the current recognised payroll before adjusting')
    const gross = money(input.basicSalary + input.allowances + p.jobCardEarnings)
    const monthRows = await tx.get(adminDb.collection('payroll').where('employeeId', '==', p.employeeId))
    const peers = monthRows.docs.filter(d => d.id !== ref.id && d.data().recognized && d.data().month === p.month && d.data().year === p.year && d.data().currency === p.currency)
    const amounts = calculateMonthlyPayroll(gross, p.advanceDeduction, money(p.damagesDeduction + p.uniformDeduction), p.policySnapshot, peers.map(d => d.data()) as MonthlyPayrollPeer[])
    if (cents(amounts.netPay) < cents(p.paidAmount)) throw new Error('Adjustment would reduce entitlement below amounts already paid')
    const statutory: Record<string, number> = {}
    for (const [authority, n] of Object.entries(amounts.statutory)) {
      if (cents(n) < cents(Number(p.statutoryPaid?.[authority] || 0))) throw new Error('Adjustment would reduce statutory liability below remittances already made')
      statutory[authority] = money(n - p.statutory[authority])
    }
    const grossDelta = money(gross - p.gross), employerDelta = money(amounts.employerCost - p.employerCost), netDelta = money(amounts.netPay - p.netPay)
    if (!grossDelta && !employerDelta && !netDelta) throw new Error('No financial change to recognise')
    const debitLine = (account: string, n: number) => ({ account, debit: Math.max(0, n), credit: Math.max(0, -n) })
    const creditLine = (account: string, n: number) => debitLine(account, -n)
    tx.create(adminDb.collection('payrollJournal').doc(key), {
      payrollId: ref.id, employeeId: p.employeeId, employeeName: p.employeeName, currency: p.currency,
      effectiveDate: p.effectiveDate, gross: grossDelta, employerCost: employerDelta, net: netDelta,
      statutory, recoveries: 0, jobEarnings: 0, sign: 1, adjustmentOf: p.journalId, reason: input.reason,
      fingerprint, actor, createdAt: FieldValue.serverTimestamp(),
      lines: [debitLine('SALARY_EXPENSE', grossDelta), debitLine('EMPLOYER_CONTRIBUTION_EXPENSE', employerDelta), creditLine('SALARIES_PAYABLE', netDelta), ...Object.entries(statutory).map(([a, n]) => creditLine(`${a}_PAYABLE`, n))],
    })
    tx.update(ref, { ...amounts, gross, basicSalary: input.basicSalary, manualAllowances: input.allowances,
      allowances: money(input.allowances + p.jobCardEarnings), outstanding: money(amounts.netPay - p.paidAmount),
      status: paymentStatus(amounts.netPay, p.paidAmount), hasAdjustments: true, revision: p.revision + 1, updatedAt: FieldValue.serverTimestamp() })
    return { id: key }
  })
}

export async function postMonthlyStaffRates(year: number, month: number, actor: PayrollActor) {
  guardPayrollEnvironment()
  requireRole(actor, [...new Set([...managers, ...accountants])])
  const schedule = staffRateWindow(year, month, actor.roles)
  if (!schedule.allowed) throw new Error(schedule.reason)
  const period = periodKey(year, month)
  const jobs = await adminDb.collection('jobCards').get()
  const targets: Array<{ jobId: string; lineId: string }> = []
  for (const job of jobs.docs) {
    for (const rate of job.data()?.staffRates || []) {
      if (rate.approvalStatus === 'APPROVED_MANAGER' && !rate.payrollPosted && String(rate.earningPeriod || '') === period && Number(rate.jobRateAmount) > 0 && rate.id) {
        targets.push({ jobId: job.id, lineId: String(rate.id) })
      }
    }
  }
  for (const target of targets) {
    await postPayrollEarning('JOB', target.jobId, target.lineId, actor, { scheduled: true })
  }
  const runId = `STAFF_RATES_${year}_${month}_${Date.now()}`
  await adminDb.collection('payrollScheduleRuns').doc(runId).create({
    kind: 'STAFF_RATES', year, month, catchUp: schedule.catchUp, count: targets.length, actor, createdAt: FieldValue.serverTimestamp(),
  })
  return { posted: targets.length, catchUp: schedule.catchUp }
}

export async function accrueUnpaidPayroll(year: number, month: number, actor: PayrollActor) {
  guardPayrollEnvironment(); requireRole(actor, managers)
  const end = periodEnd(year, month)
  if (today() < end) throw new Error('Accrue unpaid salaries on or after the last day of the earning month')
  const snap = await adminDb.collection('payroll').get()
  const drafts = snap.docs.filter(docSnap => {
    const row = docSnap.data()
    return row?.schemaVersion === 2 && row.generated && !row.recognized && row.year === year && row.month === month
  })
  for (const draft of drafts) {
    await recognizePayroll(draft.id, Number(draft.data()?.revision), actor)
  }
  const runId = `MONTH_END_ACCRUAL_${year}_${month}_${Date.now()}`
  await adminDb.collection('payrollScheduleRuns').doc(runId).create({
    kind: 'MONTH_END_ACCRUAL', year, month, count: drafts.length, actor, createdAt: FieldValue.serverTimestamp(),
  })
  return { accrued: drafts.length }
}
