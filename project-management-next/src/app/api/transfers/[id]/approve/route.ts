import { NextRequest, NextResponse } from 'next/server'
import { FieldValue, type DocumentReference } from 'firebase-admin/firestore'
import { adminAuth, adminDb } from '@/lib/firebase-admin'
import { LIQUID_ACCOUNTS, normalizeAccountKey } from '@/lib/account-keys'
import { transferLegAmount } from '@/lib/ird-fx'
import { getAccountBalanceInTransaction } from '@/lib/server/account-balance'

const MANAGER_ROLES = new Set(['MANAGER', 'DIRECTOR', 'ADMIN', 'SUPER_ADMIN'])
const rolesFromClaims = (claims: Record<string, unknown>): string[] => {
  const roles = claims.roles
  return (Array.isArray(roles) ? roles : roles ? [roles] : []).map(String)
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const authHeader = request.headers.get('authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    const claims = await adminAuth.verifyIdToken(authHeader.slice(7), true)
    if (claims.isActive !== true || !rolesFromClaims(claims).some((role) => MANAGER_ROLES.has(role))) {
      return NextResponse.json({ error: 'Manager approval is required' }, { status: 403 })
    }

    const { id } = await context.params
    const result = await adminDb.runTransaction(async (transaction) => {
      const transferRef = adminDb.collection('fundTransfers').doc(id)
      const transferSnap = await transaction.get(transferRef)
      if (!transferSnap.exists) throw new Error('Transfer not found')
      const transfer = transferSnap.data() || {}
      if (transfer.status === 'COMPLETED') return { id, idempotent: true }
      if (transfer.status !== 'PENDING_MANAGER') throw new Error('Transfer is not awaiting manager approval')

      const from = normalizeAccountKey(transfer.fromAccount)
      const to = normalizeAccountKey(transfer.toAccount)
      if (from === 'UNKNOWN' || to === 'UNKNOWN' || !LIQUID_ACCOUNTS.includes(from) || !LIQUID_ACCOUNTS.includes(to)) {
        throw new Error('Transfer accounts must be Bank, Cash, EcoCash, IRD, Salaries or Reserve')
      }
      if (from === to) throw new Error('Source and destination accounts must be different')
      const amount = Number(transfer.amount || 0)
      if (!(amount > 0)) throw new Error('Transfer amount must be greater than zero')

      const guardRef = adminDb.collection('accountPostingGuards').doc(from)
      const guardSnap = await transaction.get(guardRef)
      const balanceBefore = await getAccountBalanceInTransaction(transaction, from)
      const debitAmount = transferLegAmount(from, transfer)
      if (balanceBefore < debitAmount) {
        throw new Error(
          `Insufficient funds in ${from} to approve this transfer. Available: $${balanceBefore.toFixed(2)}, Required: $${debitAmount.toFixed(2)}`
        )
      }

      const walletWrites: Array<{ ref: DocumentReference; data: Record<string, unknown> }> = []
      const now = new Date()
      const walletBase = {
        source: 'FUND_TRANSFER',
        amount,
        month: now.getMonth() + 1,
        year: now.getFullYear(),
        referenceId: id,
        createdAt: FieldValue.serverTimestamp(),
      }
      if (to === 'SALARIES' || to === 'RESERVE') {
        const name = to === 'SALARIES' ? 'salariesAccountTransactions' : 'reserveAccountTransactions'
        const ref = adminDb.collection(name).doc(`${id}-to`)
        await transaction.get(ref)
        walletWrites.push({ ref, data: { ...walletBase, type: 'TRANSFER', description: `Transfer from ${from}` } })
      }
      if (from === 'SALARIES' || from === 'RESERVE') {
        const name = from === 'SALARIES' ? 'salariesAccountTransactions' : 'reserveAccountTransactions'
        const ref = adminDb.collection(name).doc(`${id}-from`)
        await transaction.get(ref)
        walletWrites.push({ ref, data: { ...walletBase, type: 'PAYMENT', description: `Transfer to ${to}` } })
      }

      const actor = {
        uid: claims.uid,
        email: claims.email || null,
        displayName: claims.name || claims.email || claims.uid,
      }
      const balanceAfter = Math.round((balanceBefore - debitAmount + Number.EPSILON) * 100) / 100
      transaction.update(transferRef, {
        fromAccount: from,
        toAccount: to,
        status: 'COMPLETED',
        managerApprovedBy: actor.displayName,
        managerApprovedActor: actor,
        managerApprovedAt: FieldValue.serverTimestamp(),
        postingAudit: { account: from, amount: debitAmount, balanceBefore, balanceAfter, actor },
        updatedAt: FieldValue.serverTimestamp(),
      })
      transaction.set(guardRef, {
        version: Number(guardSnap.data()?.version || 0) + 1,
        lastPostingId: id,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
      for (const write of walletWrites) transaction.set(write.ref, write.data)
      return { id, from, to, amount, debitAmount, balanceBefore, balanceAfter, idempotent: false }
    })
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Transfer approval failed'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
