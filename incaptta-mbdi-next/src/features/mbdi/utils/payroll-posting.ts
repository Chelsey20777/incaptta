import { db } from '@/lib/firebase'
import {
  collection,
  query,
  where,
  getDocs,
  runTransaction,
  serverTimestamp,
  doc,
  type DocumentReference,
} from 'firebase/firestore'
import { payrollDocId } from '@/features/jobCards/utils/payrollIntegration'
import type { MbdiPayment } from '../types'

export type MbdiPaymentStage = 'STAGE2' | 'STAGE3'

export interface PostMbdiPaymentOptions {
  initiativeId: string
  mbdiNo: string
  stage: MbdiPaymentStage
  amount: number
  ownerEmail: string
  ownerName: string
  postedByUid: string
  postedByName: string
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

/** Find the HR employee record for an initiative owner by email (or linked user email). */
async function resolveEmployee(ownerEmail: string): Promise<{ id: string; name: string; nationalId: string }> {
  const email = ownerEmail.trim().toLowerCase()
  if (!email) {
    throw new Error('Initiative owner has no email on record — cannot match an HR employee.')
  }
  const snap = await getDocs(collection(db, 'employees'))

  // Prefer employee whose linked user has this email
  const usersSnap = await getDocs(collection(db, 'users'))
  const linkedUser = usersSnap.docs.find(
    (d) => ((d.data().email as string) || '').trim().toLowerCase() === email
  )
  if (linkedUser?.data()?.employeeId) {
    const byLink = snap.docs.find((d) => d.id === linkedUser.data().employeeId)
    if (byLink) {
      const data = byLink.data() as any
      return {
        id: byLink.id,
        name: data.fullName || data.name || data.displayName || ownerEmail,
        nationalId: data.nationalId || '',
      }
    }
  }

  // Prefer employee.userId pointing at the matched user
  if (linkedUser) {
    const byUserId = snap.docs.find((d) => d.data().userId === linkedUser.id)
    if (byUserId) {
      const data = byUserId.data() as any
      return {
        id: byUserId.id,
        name: data.fullName || data.name || data.displayName || ownerEmail,
        nationalId: data.nationalId || '',
      }
    }
  }

  const match = snap.docs.find(d => (d.data().email || '').trim().toLowerCase() === email)
  if (!match) {
    throw new Error(`No HR employee record found with email ${ownerEmail}. Add the employee in HR before approving payment.`)
  }
  const data = match.data() as any
  return {
    id: match.id,
    name: data.fullName || data.name || data.displayName || ownerEmail,
    nationalId: data.nationalId || '',
  }
}

/**
 * Post an MBDI stage reward (50% of the approved amount) to payroll as an
 * allowance on the current open month. Idempotent — keyed on a posting log
 * document `{initiativeId}_{stage}` so re-runs never double-pay.
 *
 * The whole operation runs in a single Firestore transaction:
 *   1. Skip if the posting log already exists.
 *   2. Create/update the payroll record (allowances + netPay), tracking
 *      `mbdiPaymentIds` / `mbdiReferences` on the doc.
 *   3. Write the posting log.
 *   4. Record a Salaries Account accumulation.
 *
 * If the current month's payroll is already Paid, the amount rolls into the
 * following month.
 */
export async function postMbdiPaymentToPayroll(opts: PostMbdiPaymentOptions): Promise<MbdiPayment> {
  const { initiativeId, mbdiNo, stage, amount, ownerEmail, ownerName, postedByUid, postedByName } = opts

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Invalid MBDI payment amount.')
  }

  const employee = await resolveEmployee(ownerEmail)

  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const currentYear = now.getFullYear()
  const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1
  const nextMonthYear = currentMonth === 12 ? currentYear + 1 : currentYear

  const logRef = doc(db, 'mbdiPayrollPostings', `${initiativeId}_${stage}`)
  const currentRef = await resolvePayrollRef(employee.id, currentMonth, currentYear)
  const rolloverRef = await resolvePayrollRef(employee.id, nextMonth, nextMonthYear)
  const paymentKey = `${initiativeId}_${stage}`

  return runTransaction(db, async (transaction) => {
    const logSnap = await transaction.get(logRef)
    if (logSnap.exists()) {
      const log = logSnap.data() as any
      return {
        amount: log.amount,
        month: log.month,
        year: log.year,
        payrollId: log.payrollId,
        postedAt: log.postedAtIso || new Date().toISOString(),
        postedByUid: log.postedByUid || postedByUid,
        postedByName: log.postedByName || postedByName,
      }
    }

    let destRef = currentRef
    let destMonth = currentMonth
    let destYear = currentYear
    let destSnap = await transaction.get(destRef)

    // Current month already paid out — roll into the next open month.
    if (destSnap.exists() && destSnap.data().status === 'Paid') {
      destRef = rolloverRef
      destMonth = nextMonth
      destYear = nextMonthYear
      destSnap = await transaction.get(destRef)
    }

    if (destSnap.exists()) {
      const data = destSnap.data()
      const currentAllowances = typeof data.allowances === 'number' ? data.allowances : 0
      const newAllowances = currentAllowances + amount
      const updatedNetPay = (data.basicSalary || 0) + newAllowances - (data.deductions || 0)
      const existingRefs: string[] = data.mbdiReferences || []
      transaction.update(destRef, {
        allowances: newAllowances,
        netPay: updatedNetPay,
        mbdiEarnings: (data.mbdiEarnings || 0) + amount,
        mbdiReferences: existingRefs.includes(mbdiNo) ? existingRefs : [...existingRefs, mbdiNo],
        mbdiPaymentIds: [...(data.mbdiPaymentIds || []), paymentKey],
        updatedAt: serverTimestamp(),
      })
    } else {
      transaction.set(destRef, {
        employeeId: employee.id,
        employeeName: employee.name,
        nationalId: employee.nationalId,
        month: destMonth,
        year: destYear,
        basicSalary: 0,
        allowances: amount,
        deductions: 0,
        netPay: amount,
        status: 'Unpaid',
        generated: false,
        approvalStatus: 'APPROVED_MANAGER',
        approvalSource: 'MANAGER',
        accumulatedFixed: 0,
        mbdiEarnings: amount,
        mbdiReferences: [mbdiNo],
        mbdiPaymentIds: [paymentKey],
        generatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    }

    const postedAtIso = new Date().toISOString()
    transaction.set(logRef, {
      initiativeId,
      mbdiNo,
      stage,
      employeeId: employee.id,
      employeeName: employee.name,
      ownerEmail,
      amount,
      month: destMonth,
      year: destYear,
      payrollId: destRef.id,
      postedByUid,
      postedByName,
      postedAtIso,
      postedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    })

    transaction.set(doc(collection(db, 'salariesAccountTransactions')), {
      type: 'ACCUMULATION',
      source: 'MBDI',
      amount,
      month: destMonth,
      year: destYear,
      description: `MBDI ${stage === 'STAGE2' ? 'Completion (first 50%)' : 'Performance (final 50%)'}: ${ownerName} - ${mbdiNo}`,
      referenceId: initiativeId,
      createdAt: serverTimestamp(),
    })

    return {
      amount,
      month: destMonth,
      year: destYear,
      payrollId: destRef.id,
      postedAt: postedAtIso,
      postedByUid,
      postedByName,
    }
  })
}
