import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminAuth, adminDb } from '@/lib/firebase-admin'
import { LIQUID_ACCOUNTS, normalizeAccountKey } from '@/lib/account-keys'
import { canPostJobCardAdHocAutoApproval, isJobCardAdHocAutoEligible } from '@/lib/job-card-expense-approval'
import { getAccountBalanceInTransaction } from '@/lib/server/account-balance'

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; expenseId: string }> }) {
  try {
    const header = request.headers.get('authorization') || ''
    if (!header.startsWith('Bearer ') || !header.slice(7).trim()) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    let claims
    try {
      claims = await adminAuth.verifyIdToken(header.slice(7), true)
    } catch {
      return NextResponse.json({ error: 'Invalid or expired authentication token' }, { status: 401 })
    }
    if (!canPostJobCardAdHocAutoApproval({ isActive: claims.isActive, roles: claims.roles })) {
      return NextResponse.json({ error: 'Accountant approval is required' }, { status: 403 })
    }

    const { id: jobCardId, expenseId } = await context.params
    const result = await adminDb.runTransaction(async (transaction) => {
      const jobRef = adminDb.collection('jobCards').doc(jobCardId)
      const opexRef = adminDb.collection('operationalExpenses').doc(`jc-adhoc-${expenseId}`)
      const walletRef = adminDb.collection('reserveAccountTransactions').doc(`jc-adhoc-${jobCardId}-${expenseId}`)
      const jobSnap = await transaction.get(jobRef)
      if (!jobSnap.exists) throw new Error('Job card not found')
      const job = jobSnap.data() || {}
      const expenses = (job.adHocExpenses || []).map((row: Record<string, unknown>) => ({ ...row }))
      const index = expenses.findIndex((row: { id?: string }) => row.id === expenseId)
      if (index < 0) throw new Error('Expense not found')
      const expense = expenses[index]
      const opexSnap = await transaction.get(opexRef)
      const walletSnap = await transaction.get(walletRef)
      if (opexSnap.exists) {
        const existing = opexSnap.data() || {}
        if (existing.sourceJobId !== jobCardId || existing.sourceItemId !== expenseId) {
          throw new Error('Existing OPEX is not linked to this job expense')
        }
        if (existing.managerApprovedBy?.actionType !== 'POLICY_BYPASS_JOBCARD_UNDER_200' ||
            expense.approvalStatus !== 'APPROVED_MANAGER' || expense.opexId !== opexRef.id) {
          throw new Error('Expense already posted through another approval path')
        }
        if (normalizeAccountKey(existing.paymentMethod) === 'RESERVE' && !walletSnap.exists) {
          throw new Error('Reserve expense posting is missing its wallet transaction')
        }
        return { opexId: opexRef.id, idempotent: true }
      }
      if (walletSnap.exists) throw new Error('Reserve wallet posting exists without its expense')
      if (expense.approvalStatus !== 'APPROVED_ACCOUNTANT' || !expense.accountantApprovedBy) {
        throw new Error('Accountant approval is required')
      }
      const amount = Number(expense.totalAmount || Number(expense.quantity || 0) * Number(expense.unitPrice || 0))
      if (!isJobCardAdHocAutoEligible(amount)) throw new Error('Only expenses below $200 qualify for accountant-only approval')
      const account = normalizeAccountKey(expense.paymentMethod)
      if (account === 'UNKNOWN' || !LIQUID_ACCOUNTS.includes(account)) {
        throw new Error('Select a valid payment account before approval')
      }
      const guardRef = adminDb.collection('accountPostingGuards').doc(account)
      const guardSnap = await transaction.get(guardRef)
      const balanceBefore = await getAccountBalanceInTransaction(transaction, account)
      if (balanceBefore < amount) {
        throw new Error(`Insufficient funds in ${account}. Available: $${balanceBefore.toFixed(2)}, Required: $${amount.toFixed(2)}`)
      }
      const balanceAfter = Math.round((balanceBefore - amount + Number.EPSILON) * 100) / 100
      const approvedAt = new Date().toISOString()
      const actor = {
        uid: claims.uid,
        displayName: claims.name || claims.email || claims.uid,
        email: claims.email || null,
        actorType: 'USER',
        actionType: 'POLICY_BYPASS_JOBCARD_UNDER_200',
      }
      const jobNumber = job.generalInfo?.jobNumber || jobCardId.substring(0, 8)
      const description = `Job Card ${jobNumber} - ${expense.description || 'Ad-hoc expense'}`
      expenses[index] = {
        ...expense, paymentMethod: account, totalAmount: amount,
        approvalStatus: 'APPROVED_MANAGER', approvedAt,
        approvedBy: 'Auto-approved after accountant approval', opexId: opexRef.id,
        autoApproved: true,
      }
      transaction.set(guardRef, {
        version: Number(guardSnap.data()?.version || 0) + 1,
        lastPostingId: opexRef.id,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
      transaction.create(opexRef, {
        category: 'Job Card Expense', amount, paymentMethod: account,
        originalPaymentMethod: expense.paymentMethod, description,
        attachmentUrl: expense.attachmentUrl || null,
        attachmentUrls: expense.attachmentUrls || (expense.attachmentUrl ? [expense.attachmentUrl] : []),
        status: 'APPROVED', sourceJobId: jobCardId, sourceItemId: expenseId,
        accountantApprovedBy: expense.accountantApprovedBy,
        accountantApprovedAt: expense.accountantApprovedAt || null,
        managerApprovedBy: actor, managerApprovedAt: approvedAt,
        postingAudit: { account, amount, balanceBefore, balanceAfter, actor, approvedAt },
        pdfGenerated: false,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      })
      if (account === 'RESERVE') {
        transaction.create(walletRef, {
          type: 'PAYMENT', source: 'OPEX', amount, description,
          referenceId: opexRef.id, jobCardId, jobNumber,
          approvedBy: actor, approvedAt, createdAt: FieldValue.serverTimestamp(),
        })
      }
      transaction.update(jobRef, { adHocExpenses: expenses, updatedAt: FieldValue.serverTimestamp() })
      return { opexId: opexRef.id, account, amount, balanceBefore, balanceAfter, idempotent: false }
    })
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Expense approval failed' }, { status: 400 })
  }
}
