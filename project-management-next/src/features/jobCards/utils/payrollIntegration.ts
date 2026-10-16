import { accrualPayrollEnabled, payrollRequest } from '@/lib/payroll/client'
import { db } from '@/lib/firebase'
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  runTransaction,
  serverTimestamp,
  doc,
  type DocumentReference
} from 'firebase/firestore'
import type { StaffRate } from '../types'

export interface JobCardPayrollPosting {
  id?: string
  jobCardId: string
  jobNumber: string
  rateId: string
  employeeId: string
  employeeName: string
  nationalId: string
  month: number
  year: number
  /** Month/year of the job itself, when the posting was rolled into a later month. */
  originalMonth?: number
  originalYear?: number
  amount: number
  postedAt: any
  payrollId?: string
}

export type PayrollPostStatus = 'posted' | 'already_posted' | 'failed'

export interface PayrollPostResult {
  rateId: string
  status: PayrollPostStatus
  employeeName: string
  amount: number
  month: number
  year: number
  reason?: string
}

/**
 * Parse a date-only or ISO string as a LOCAL calendar date.
 * `new Date('YYYY-MM-DD')` is UTC and can shift the month near boundaries.
 */
export function parseLocalDate(value?: string | null): Date | null {
  if (!value) return null
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (dateOnly) {
    const parsed = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    if (!isNaN(parsed.getTime())) return parsed
  }
  const parsed = new Date(value)
  return isNaN(parsed.getTime()) ? null : parsed
}

/** @deprecated Use parseApprovalDate / parseLocalDate. Kept for call-site compatibility. */
export function parseJobStartDate(value?: string): Date {
  return parseLocalDate(value) || new Date()
}

/**
 * Payroll month for a staff rate = the calendar month of final manager approval.
 * Falls back to today when `approvedAt` is missing (e.g. mid-approval sync).
 */
export function parseApprovalDate(approvedAt?: string | null): Date {
  return parseLocalDate(approvedAt) || new Date()
}

/** Deterministic payroll document ID — prevents duplicate records per employee/month. */
export function payrollDocId(employeeId: string, year: number, month: number): string {
  return `${employeeId}_${year}_${month}`
}

/**
 * Resolve the payroll document ref for an employee/month. Prefers an existing
 * record (legacy records have random IDs); falls back to the deterministic ID
 * so concurrent creators converge on the same document.
 */
async function resolvePayrollRef(
  employeeId: string,
  month: number,
  year: number
): Promise<DocumentReference> {
  const snap = await getDocs(query(
    collection(db, 'payroll'),
    where('employeeId', '==', employeeId),
    where('month', '==', month),
    where('year', '==', year)
  ))
  if (!snap.empty) {
    const deterministic = snap.docs.find(d => d.id === payrollDocId(employeeId, year, month))
    return (deterministic || snap.docs[0]!).ref
  }
  return doc(db, 'payroll', payrollDocId(employeeId, year, month))
}

/** True when a payroll snapshot already reflects this specific staff-rate earning. */
function payrollSnapshotHasJobEarning(
  data: any | undefined,
  amount: number,
  jobNumber: string,
  opts?: { jobCardId?: string; rateId?: string }
): boolean {
  if (!data) return false
  const rateId = opts?.rateId
  const jobCardId = opts?.jobCardId
  const postedRateIds: string[] = data.jobCardRateIds || []
  // Prefer per-rate tracking — avoids false skips when multiple rates share a job.
  if (rateId && postedRateIds.includes(rateId)) return true
  if (postedRateIds.length > 0) return false

  // Legacy payroll docs (no jobCardRateIds yet): require job reference + earnings.
  const earnings = Number(data.jobCardEarnings || 0)
  if (earnings + 0.005 < amount) return false
  const refs: string[] = data.jobCardReferences || []
  return refs.includes(jobNumber) || (!!jobCardId && refs.includes(jobCardId))
}

/**
 * Verify that a previously logged posting is still reflected on the payroll
 * document. Used to decide whether a log can be trusted or must be repaired.
 */
async function payrollStillHasJobEarning(
  employeeId: string,
  month: number,
  year: number,
  amount: number,
  jobNumber: string,
  payrollId?: string,
  jobCardId?: string,
  rateId?: string
): Promise<boolean> {
  try {
    const ref = payrollId
      ? doc(db, 'payroll', payrollId)
      : await resolvePayrollRef(employeeId, month, year)
    const snap = await getDoc(ref)
    if (!snap.exists()) return false
    return payrollSnapshotHasJobEarning(snap.data(), amount, jobNumber, { jobCardId, rateId })
  } catch {
    return false
  }
}

/** Apply a staff-rate amount onto a payroll doc inside an open transaction. */
function applyEarningInTransaction(
  transaction: any,
  targetRef: DocumentReference,
  payrollSnap: any,
  opts: {
    amount: number
    jobNumber: string
    rateId: string
    employeeId: string
    employeeName: string
    nationalId: string
    targetMonth: number
    targetYear: number
  }
): boolean {
  const { amount, jobNumber, rateId, employeeId, employeeName, nationalId, targetMonth, targetYear } = opts
  if (payrollSnap.exists()) {
    const data = payrollSnap.data()
    const already = (data.jobCardRateIds || []).includes(rateId)
    if (already) return false
    const newJobEarnings = (data.jobCardEarnings || 0) + amount
    const currentAllowances = typeof data.allowances === 'number' ? data.allowances : 0
    const newAllowances = currentAllowances + amount
    const updatedNetPay = (data.basicSalary || 0) + newAllowances - (data.deductions || 0)
    const existingRefs = data.jobCardReferences || []
    const updatedRefs = existingRefs.includes(jobNumber) ? existingRefs : [...existingRefs, jobNumber]
    const updatedRateIds = [...(data.jobCardRateIds || []), rateId]
    transaction.update(targetRef, {
      allowances: newAllowances,
      jobCardEarnings: newJobEarnings,
      netPay: updatedNetPay,
      jobCardReferences: updatedRefs,
      jobCardRateIds: updatedRateIds,
      updatedAt: serverTimestamp()
    })
    return true
  }
  transaction.set(targetRef, {
    employeeId,
    employeeName,
    nationalId,
    month: targetMonth,
    year: targetYear,
    basicSalary: 0,
    allowances: amount,
    deductions: 0,
    netPay: amount,
    status: 'Unpaid',
    generated: false,
    approvalStatus: 'APPROVED_MANAGER',
    approvalSource: 'JOB_CARD',
    accumulatedFixed: 0,
    jobCardEarnings: amount,
    jobCardReferences: [jobNumber],
    jobCardRateIds: [rateId],
    generatedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  })
  return true
}

/** Remove a previously applied staff-rate amount from a payroll doc (month relocation). */
function removeEarningInTransaction(
  transaction: any,
  targetRef: DocumentReference,
  payrollSnap: any,
  opts: { amount: number; rateId: string }
): boolean {
  if (!payrollSnap.exists()) return false
  const data = payrollSnap.data()
  if (data.status === 'Paid') return false
  const rateIds: string[] = data.jobCardRateIds || []
  const tracked = rateIds.includes(opts.rateId)
  const earnings = Number(data.jobCardEarnings || 0)
  if (!tracked && earnings + 0.005 < opts.amount) return false

  const newJobEarnings = Math.max(0, earnings - opts.amount)
  const currentAllowances = typeof data.allowances === 'number' ? data.allowances : 0
  const newAllowances = Math.max(0, currentAllowances - opts.amount)
  const updatedNetPay = (data.basicSalary || 0) + newAllowances - (data.deductions || 0)
  transaction.update(targetRef, {
    allowances: newAllowances,
    jobCardEarnings: newJobEarnings,
    netPay: updatedNetPay,
    jobCardRateIds: rateIds.filter((id) => id !== opts.rateId),
    updatedAt: serverTimestamp()
  })
  return true
}

/**
 * Post job earnings from approved staff rates to payroll.
 *
 * Target month/year is the calendar month of **final manager approval**
 * (`approvedAt`), not the job start date — a June job approved in July lands
 * on July payroll.
 *
 * Each rate is posted in its own Firestore transaction that atomically:
 *   1. Creates/updates a posting-log document `{jobCardId}_{rateId}`.
 *   2. Creates/updates the approval-month payroll record (rolling into the
 *      current month only when that month is already Paid).
 *   3. Relocates earnings previously posted to the wrong month.
 *   4. Records Salaries Account accumulation for net-new posts / moves.
 */
export async function postJobEarningsToPayroll(
  jobCardId: string,
  jobNumber: string,
  staffRates: StaffRate[],
  _ignoredJobDate?: Date
): Promise<PayrollPostResult[]> {
  if (accrualPayrollEnabled) {
    const results: PayrollPostResult[] = []
    for (const rate of staffRates.filter(r => r.approvalStatus === 'APPROVED_MANAGER' && Number(r.jobRateAmount) > 0)) {
      try {
        const result = await payrollRequest({ action: 'earning', source: 'JOB', sourceId: jobCardId, lineId: rate.id })
        results.push({ rateId: rate.id, status: 'posted', employeeName: result.employeeName, amount: result.amount, month: result.month, year: result.year })
      } catch (e) { results.push({ rateId: rate.id, status: 'failed', employeeName: rate.employeeName || rate.employeeId, amount: rate.jobRateAmount, month: 0, year: 0, reason: e instanceof Error ? e.message : 'Posting failed' }) }
    }
    return results
  }
  const candidates = staffRates.filter(rate =>
    rate.approvalStatus === 'APPROVED_MANAGER' &&
    !!rate.employeeId &&
    Number(rate.jobRateAmount) > 0
  )

  if (candidates.length === 0) return []

  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const currentYear = now.getFullYear()

  const employeesSnap = await getDocs(collection(db, 'employees'))
  const employees = employeesSnap.docs.map(d => ({ id: d.id, ...d.data() }))

  const existingPostings = await getJobCardPayrollPostings(jobCardId)
  const unmatchedLegacy = existingPostings
    .filter(p => !p.rateId)
    .map(p => ({
      employeeId: p.employeeId,
      amount: Number(p.amount || 0),
      month: p.month,
      year: p.year,
      payrollId: p.payrollId
    }))
  const postingsByRateId = new Map(
    existingPostings.filter(p => p.rateId).map(p => [p.rateId!, p])
  )

  const results: PayrollPostResult[] = []

  for (const rate of candidates) {
    const amount = Number(rate.jobRateAmount)
    const approvalDate = parseApprovalDate(rate.approvedAt)
    let targetMonth = approvalDate.getMonth() + 1
    let targetYear = approvalDate.getFullYear()

    const employee = employees.find((e: any) => e.id === rate.employeeId) as any
    const resolvedName =
      (employee as any)?.fullName ||
      `${(employee as any)?.firstName || ''} ${(employee as any)?.lastName || ''}`.trim() ||
      rate.employeeName ||
      rate.employeeId

    const existingByRate = postingsByRateId.get(rate.id)

    // Only skip when the earning is already on the APPROVAL month payroll.
    // Logs that point at a different month (old job-start targeting) must fall
    // through so the amount can be relocated.
    const onApprovalMonth = await payrollStillHasJobEarning(
      rate.employeeId,
      targetMonth,
      targetYear,
      amount,
      jobNumber,
      undefined,
      jobCardId,
      rate.id
    )
    const logOnApprovalMonth =
      !!existingByRate &&
      existingByRate.month === targetMonth &&
      existingByRate.year === targetYear
    if (onApprovalMonth && (logOnApprovalMonth || !existingByRate)) {
      results.push({
        rateId: rate.id,
        status: 'already_posted',
        employeeName: resolvedName,
        amount,
        month: targetMonth,
        year: targetYear
      })
      continue
    }

    // Legacy log on the correct approval month only.
    if (!existingByRate) {
      const legacyIdx = unmatchedLegacy.findIndex(
        p =>
          p.employeeId === rate.employeeId &&
          Math.abs(p.amount - amount) < 0.005 &&
          p.month === targetMonth &&
          p.year === targetYear
      )
      if (legacyIdx !== -1) {
        const legacy = unmatchedLegacy[legacyIdx]!
        const stillOnPayroll = await payrollStillHasJobEarning(
          rate.employeeId,
          targetMonth,
          targetYear,
          amount,
          jobNumber,
          legacy.payrollId,
          jobCardId,
          rate.id
        )
        unmatchedLegacy.splice(legacyIdx, 1)
        if (stillOnPayroll) {
          results.push({
            rateId: rate.id,
            status: 'already_posted',
            employeeName: resolvedName,
            amount,
            month: targetMonth,
            year: targetYear
          })
          continue
        }
      }
    }

    if (!employee) {
      results.push({
        rateId: rate.id,
        status: 'failed',
        employeeName: rate.employeeName || rate.employeeId,
        amount,
        month: targetMonth,
        year: targetYear,
        reason: 'Employee record not found in HR'
      })
      continue
    }

    const employeeName = resolvedName || 'Unnamed'
    const nationalId = employee.nationalId || ''

    try {
      const logRef = doc(db, 'jobCardPayrollPostings', `${jobCardId}_${rate.id}`)
      const approvalMonthRef = await resolvePayrollRef(rate.employeeId, targetMonth, targetYear)
      const isApprovalCurrent = targetMonth === currentMonth && targetYear === currentYear
      const currentMonthRef = isApprovalCurrent
        ? approvalMonthRef
        : await resolvePayrollRef(rate.employeeId, currentMonth, currentYear)

      const priorMonth = existingByRate?.month
      const priorYear = existingByRate?.year
      const needsRelocate =
        !!existingByRate &&
        (priorMonth !== targetMonth || priorYear !== targetYear)
      const priorPayrollRef =
        needsRelocate && existingByRate?.payrollId
          ? doc(db, 'payroll', existingByRate.payrollId)
          : needsRelocate && priorMonth && priorYear
            ? await resolvePayrollRef(rate.employeeId, priorMonth, priorYear)
            : null

      const outcome = await runTransaction(db, async (transaction) => {
        const logSnap = await transaction.get(logRef)
        const logData = logSnap.exists() ? logSnap.data() : null

        let destRef = approvalMonthRef
        let destMonth = targetMonth
        let destYear = targetYear
        let destSnap = await transaction.get(destRef)

        // Paid approval-month payroll → roll into the current open month.
        if (destSnap.exists() && destSnap.data().status === 'Paid' && !isApprovalCurrent) {
          destRef = currentMonthRef
          destMonth = currentMonth
          destYear = currentYear
          destSnap = await transaction.get(destRef)
        }

        if (
          payrollSnapshotHasJobEarning(destSnap.data(), amount, jobNumber, {
            jobCardId,
            rateId: rate.id
          })
        ) {
          return { status: 'already_posted' as const, month: destMonth, year: destYear }
        }

        // Relocate out of a previously wrong month (e.g. job-start June → approval July).
        let removedFromPrior = false
        if (priorPayrollRef && priorPayrollRef.path !== destRef.path) {
          const priorSnap = await transaction.get(priorPayrollRef)
          removedFromPrior = removeEarningInTransaction(transaction, priorPayrollRef, priorSnap, {
            amount,
            rateId: rate.id
          })
        }

        const applied = applyEarningInTransaction(transaction, destRef, destSnap, {
          amount,
          jobNumber,
          rateId: rate.id,
          employeeId: rate.employeeId,
          employeeName,
          nationalId,
          targetMonth: destMonth,
          targetYear: destYear
        })

        const logEntry: any = {
          jobCardId,
          jobNumber,
          rateId: rate.id,
          employeeId: rate.employeeId,
          employeeName,
          nationalId,
          month: destMonth,
          year: destYear,
          amount,
          postedAt: serverTimestamp(),
          createdAt: logData?.createdAt || serverTimestamp(),
          payrollId: destRef.id,
          approvalMonth: targetMonth,
          approvalYear: targetYear
        }
        if (logSnap.exists()) {
          logEntry.repairedAt = serverTimestamp()
        }
        if (needsRelocate && priorMonth && priorYear) {
          logEntry.originalMonth = priorMonth
          logEntry.originalYear = priorYear
        }
        transaction.set(logRef, logEntry, { merge: true })

        if (applied) {
          if (removedFromPrior && priorMonth && priorYear) {
            // Move Salaries Account accrual from the wrong month to the approval month.
            transaction.set(doc(collection(db, 'salariesAccountTransactions')), {
              type: 'ACCUMULATION',
              source: 'STAFF_RATE',
              amount: -amount,
              month: priorMonth,
              year: priorYear,
              description: `Staff Rate Relocated (from): ${employeeName} - Job ${jobNumber}`,
              referenceId: jobCardId,
              createdAt: serverTimestamp()
            })
            transaction.set(doc(collection(db, 'salariesAccountTransactions')), {
              type: 'ACCUMULATION',
              source: 'STAFF_RATE',
              amount,
              month: destMonth,
              year: destYear,
              description: `Staff Rate Relocated (to): ${employeeName} - Job ${jobNumber}`,
              referenceId: jobCardId,
              createdAt: serverTimestamp()
            })
          } else if (!logSnap.exists() || !removedFromPrior) {
            // Fresh post, or repair where the prior month never held the earning.
            // Skip a second accrual only when we repaired the same month in place
            // after a log that already accrued (same month, log existed, nothing relocated).
            const sameMonthRepair =
              logSnap.exists() &&
              !needsRelocate &&
              (logData?.month === destMonth && logData?.year === destYear)
            if (!sameMonthRepair) {
              transaction.set(doc(collection(db, 'salariesAccountTransactions')), {
                type: 'ACCUMULATION',
                source: 'STAFF_RATE',
                amount,
                month: destMonth,
                year: destYear,
                description: `Staff Rate Approved: ${employeeName} - Job ${jobNumber}`,
                referenceId: jobCardId,
                createdAt: serverTimestamp()
              })
            }
          }
        }

        return { status: 'posted' as const, month: destMonth, year: destYear }
      })

      results.push({
        rateId: rate.id,
        status: outcome.status,
        employeeName,
        amount,
        month: outcome.month,
        year: outcome.year
      })
    } catch (err: any) {
      console.error(`Failed to post staff rate ${rate.id} to payroll:`, err)
      results.push({
        rateId: rate.id,
        status: 'failed',
        employeeName,
        amount,
        month: targetMonth,
        year: targetYear,
        reason: err?.message || 'Posting transaction failed'
      })
    }
  }

  return results
}

/**
 * Mark staff rates as posted on the job card so they are locked from editing
 * and excluded from future posting attempts. Posting itself is idempotent
 * (keyed on the posting log), so a failure here is recoverable: the next
 * approval action re-runs the posting, which skips duplicates and retries
 * this marking step.
 */
export async function markStaffRatesPosted(jobCardId: string, rateIds: string[]): Promise<void> {
  if (rateIds.length === 0) return
  const ref = doc(db, 'jobCards', jobCardId)
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref)
    if (!snap.exists()) return
    const idSet = new Set(rateIds)
    const nowIso = new Date().toISOString()
    const updated = (snap.data().staffRates || []).map((r: any) =>
      idSet.has(r.id) && !r.payrollPosted
        ? { ...r, payrollPosted: true, payrollPostedAt: nowIso }
        : r
    )
    transaction.update(ref, { staffRates: updated, updatedAt: serverTimestamp() })
  })
}

/**
 * Get all payroll postings for a specific job card
 */
export async function getJobCardPayrollPostings(jobCardId: string): Promise<JobCardPayrollPosting[]> {
  const q = query(
    collection(db, 'jobCardPayrollPostings'),
    where('jobCardId', '==', jobCardId)
  )
  const snap = await getDocs(q)
  return snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as JobCardPayrollPosting[]
}
