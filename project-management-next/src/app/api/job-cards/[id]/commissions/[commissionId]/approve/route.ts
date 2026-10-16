import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminAuth, adminDb } from '@/lib/firebase-admin'
import { normalizeAccountKey } from '@/lib/account-keys'
import { getAccountBalanceInTransaction } from '@/lib/server/account-balance'

const MANAGER_ROLES = new Set(['MANAGER', 'DIRECTOR', 'ADMIN', 'SUPER_ADMIN'])
const rolesFromClaims = (claims: Record<string, unknown>): string[] => {
  const roles = claims.roles
  return (Array.isArray(roles) ? roles : roles ? [roles] : []).map(String)
}

interface CommissionRow extends Record<string, unknown> {
  id?: string
  name?: string
  amount?: number
  paymentMethod?: string
  approvalStatus?: string
}

interface JobCardData extends Record<string, unknown> {
  generalInfo?: Record<string, unknown> & {
    jobNumber?: string
    referrers?: CommissionRow[]
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; commissionId: string }> }
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

    const { id: jobCardId, commissionId } = await context.params
    const result = await adminDb.runTransaction(async (transaction) => {
      const jobRef = adminDb.collection('jobCards').doc(jobCardId)
      const walletRef = adminDb.collection('reserveAccountTransactions').doc(`${jobCardId}-${commissionId}`)
      const guardRef = adminDb.collection('accountPostingGuards').doc('RESERVE')

      const jobSnap = await transaction.get(jobRef)
      if (!jobSnap.exists) throw new Error('Job card not found')
      const job = jobSnap.data() as JobCardData
      const generalInfo = { ...(job.generalInfo || {}) }
      const referrers = (generalInfo.referrers || []).map((row) => ({ ...row }))
      const index = referrers.findIndex((row) => row.id === commissionId)
      if (index < 0) throw new Error('Commission recipient not found')
      const commission = referrers[index]

      const walletSnap = await transaction.get(walletRef)
      if (walletSnap.exists) {
        const wallet = walletSnap.data() || {}
        if (wallet.source !== 'JOB_CARD_COMMISSION' || wallet.referenceId !== commissionId || wallet.jobCardId !== jobCardId) {
          throw new Error('Reserve posting ID is already linked to another transaction')
        }
        if (commission.approvalStatus !== 'APPROVED_MANAGER') {
          throw new Error('Commission posting exists but its approval state is inconsistent')
        }
        return { postingId: walletRef.id, idempotent: true }
      }

      if (commission.approvalStatus !== 'APPROVED_ACCOUNTANT') {
        throw new Error('Accountant approval is required before manager approval')
      }
      if (normalizeAccountKey(commission.paymentMethod) !== 'RESERVE') {
        throw new Error('Commission payment method must be Reserve Account')
      }
      const amount = Number(commission.amount || 0)
      if (!(amount > 0)) throw new Error('Commission amount must be greater than zero')

      const guardSnap = await transaction.get(guardRef)
      const balanceBefore = await getAccountBalanceInTransaction(transaction, 'RESERVE')
      if (balanceBefore < amount) {
        throw new Error(
          `Insufficient funds in RESERVE. Available: $${balanceBefore.toFixed(2)}, Required: $${amount.toFixed(2)}`
        )
      }

      const balanceAfter = Math.round((balanceBefore - amount + Number.EPSILON) * 100) / 100
      const approvedAt = new Date().toISOString()
      const actor = {
        uid: claims.uid,
        displayName: claims.name || claims.email || claims.uid,
        email: claims.email || null,
      }
      const jobNumber = generalInfo.jobNumber || jobCardId.substring(0, 8)
      const postingAudit = { account: 'RESERVE', amount, balanceBefore, balanceAfter, actor, approvedAt }

      referrers[index] = {
        ...commission,
        paymentMethod: 'RESERVE',
        approvalStatus: 'APPROVED_MANAGER',
        approvedAt,
        approvedBy: actor.displayName,
        reservePostingId: walletRef.id,
        postingAudit,
      }
      transaction.set(walletRef, {
        type: 'PAYMENT',
        source: 'JOB_CARD_COMMISSION',
        amount,
        description: `Job Card ${jobNumber} commission - ${commission.name || 'Recipient'}`,
        referenceId: commissionId,
        jobCardId,
        jobNumber,
        recipientName: commission.name || '',
        approvedBy: actor,
        approvedAt,
        createdAt: FieldValue.serverTimestamp(),
      })
      transaction.set(guardRef, {
        version: Number(guardSnap.data()?.version || 0) + 1,
        lastPostingId: walletRef.id,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
      transaction.update(jobRef, {
        generalInfo: { ...generalInfo, referrers },
        updatedAt: FieldValue.serverTimestamp(),
      })

      return { postingId: walletRef.id, amount, balanceBefore, balanceAfter, idempotent: false }
    })
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Reserve commission approval failed'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
