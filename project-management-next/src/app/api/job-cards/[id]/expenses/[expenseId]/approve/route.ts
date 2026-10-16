import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminAuth, adminDb } from '@/lib/firebase-admin'
import { LIQUID_ACCOUNTS, normalizeAccountKey } from '@/lib/account-keys'
import { getAccountBalanceInTransaction } from '@/lib/server/account-balance'
import { isJobCardAdHocAutoEligible } from '@/lib/job-card-expense-approval'

const MANAGER_ROLES = new Set(['MANAGER', 'DIRECTOR', 'ADMIN', 'SUPER_ADMIN'])
const rolesFromClaims = (claims: any): string[] =>
  (Array.isArray(claims.roles) ? claims.roles : claims.roles ? [claims.roles] : []).map(String)

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; expenseId: string }> }
) {
  try {
    const authHeader = request.headers.get('authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    const claims = await adminAuth.verifyIdToken(authHeader.slice(7), true)
    if (claims.isActive !== true || !rolesFromClaims(claims).some((role) => MANAGER_ROLES.has(role))) {
      return NextResponse.json({ error: 'Manager approval is required' }, { status: 403 })
    }

    const { id: jobCardId, expenseId } = await context.params
    const result = await adminDb.runTransaction(async (transaction) => {
      const jobRef = adminDb.collection('jobCards').doc(jobCardId)
      const jobSnap = await transaction.get(jobRef)
      if (!jobSnap.exists) throw new Error('Job card not found')

      const job: any = jobSnap.data()
      const expenses = (job.adHocExpenses || []).map((row: any) => ({ ...row }))
      const index = expenses.findIndex((row: any) => row.id === expenseId)
      if (index < 0) throw new Error('Expense not found')
      const expense = expenses[index]
      const defaultOpexId = `jc-adhoc-${expenseId}`
      const selectedOpexId = expense.correctionAuditId && expense.opexId
        ? String(expense.opexId)
        : defaultOpexId
      const opexRef = adminDb.collection('operationalExpenses').doc(selectedOpexId)
      const opexSnap = await transaction.get(opexRef)
      const existingOpex: any = opexSnap.data()
      const correctionAuditRef = expense.correctionAuditId
        ? adminDb.collection('adminAuditLogs').doc(String(expense.correctionAuditId))
        : null
      if (correctionAuditRef) await transaction.get(correctionAuditRef)
      const isPendingCorrection = Boolean(
        opexSnap.exists &&
        selectedOpexId !== defaultOpexId &&
        existingOpex?.sourceJobId === jobCardId &&
        existingOpex?.sourceItemId === expenseId &&
        existingOpex?.correctionOfOpexId === defaultOpexId &&
        existingOpex?.status === 'APPROVED_ACCOUNTANT'
      )
      if (opexSnap.exists && !isPendingCorrection) {
        if (existingOpex?.sourceJobId !== jobCardId || existingOpex?.sourceItemId !== expenseId) {
          throw new Error('Existing OPEX is not linked to this job expense')
        }
        if (expense.approvalStatus !== 'APPROVED_MANAGER' || expense.opexId !== opexRef.id) {
          expenses[index] = { ...expense, approvalStatus: 'APPROVED_MANAGER', opexId: opexRef.id }
          transaction.update(jobRef, { adHocExpenses: expenses, updatedAt: FieldValue.serverTimestamp() })
        }
        return { opexId: opexRef.id, idempotent: true }
      }
      if (expense.approvalStatus !== 'APPROVED_ACCOUNTANT') {
        throw new Error('Accountant approval is required before manager approval')
      }

      const account = normalizeAccountKey(expense.paymentMethod)
      if (account === 'UNKNOWN' || !LIQUID_ACCOUNTS.includes(account)) {
        throw new Error('Select a valid payment account before approval')
      }
      const amount = Number(expense.totalAmount || Number(expense.quantity || 0) * Number(expense.unitPrice || 0))
      if (!(amount > 0)) throw new Error('Expense amount must be greater than zero')
      if (isJobCardAdHocAutoEligible(amount)) {
        throw new Error('Expenses below $200 are finalized by accountant approval')
      }

      // Reading and incrementing this document serializes competing approvals for one account.
      const guardRef = adminDb.collection('accountPostingGuards').doc(account)
      const guardSnap = await transaction.get(guardRef)
      const balanceBefore = await getAccountBalanceInTransaction(transaction, account)
      if (balanceBefore < amount) {
        throw new Error(
          `Insufficient funds in ${account}. Available: $${balanceBefore.toFixed(2)}, Required: $${amount.toFixed(2)}`
        )
      }
      const balanceAfter = Math.round((balanceBefore - amount + Number.EPSILON) * 100) / 100
      const actor = {
        uid: claims.uid,
        displayName: claims.name || claims.email || claims.uid,
        email: claims.email || null,
        actorType: 'USER',
        actionType: 'MANUAL_APPROVAL',
      }
      const approvedAt = new Date().toISOString()
      const jobNumber = job.generalInfo?.jobNumber || jobCardId.substring(0, 8)

      expenses[index] = {
        ...expense,
        paymentMethod: account,
        totalAmount: amount,
        approvalStatus: 'APPROVED_MANAGER',
        approvedAt,
        approvedBy: actor.displayName,
        opexId: opexRef.id,
      }
      transaction.set(guardRef, {
        version: Number(guardSnap.data()?.version || 0) + 1,
        lastPostingId: opexRef.id,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
      const opexData = {
        category: 'Job Card Expense',
        amount,
        paymentMethod: account,
        originalPaymentMethod: expense.paymentMethod,
        description: `Job Card ${jobNumber} - ${expense.description || 'Ad-hoc expense'}`,
        attachmentUrl: expense.attachmentUrl || null,
        attachmentUrls: expense.attachmentUrls || (expense.attachmentUrl ? [expense.attachmentUrl] : []),
        status: 'APPROVED',
        sourceJobId: jobCardId,
        sourceItemId: expenseId,
        accountantApprovedBy: expense.accountantApprovedBy || null,
        accountantApprovedAt: expense.accountantApprovedAt || null,
        managerApprovedBy: actor,
        managerApprovedAt: approvedAt,
        postingAudit: { account, amount, balanceBefore, balanceAfter, actor, approvedAt },
        pdfGenerated: false,
        updatedAt: FieldValue.serverTimestamp(),
      }
      if (isPendingCorrection) {
        transaction.update(opexRef, opexData)
        if (correctionAuditRef) {
          transaction.update(correctionAuditRef, {
            repairStatus: 'COMPLETED',
            completedOpexId: opexRef.id,
            completedBy: actor,
            completedAt: FieldValue.serverTimestamp(),
            balanceBefore,
            balanceAfter,
          })
        }
      } else {
        transaction.create(opexRef, { ...opexData, createdAt: FieldValue.serverTimestamp() })
      }
      transaction.update(jobRef, { adHocExpenses: expenses, updatedAt: FieldValue.serverTimestamp() })
      return { opexId: opexRef.id, account, amount, balanceBefore, balanceAfter, idempotent: false }
    })
    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Expense approval failed' }, { status: 400 })
  }
}
