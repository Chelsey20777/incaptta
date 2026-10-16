import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminAuth, adminDb } from '@/lib/firebase-admin'
import { canSelfApproveAdjustment } from '@/lib/inventory/open-policies'

const ADMIN_ROLES = new Set(['ADMIN', 'SUPER_ADMIN'])
const MANAGER_ROLES = new Set(['MANAGER', 'DIRECTOR', 'ADMIN', 'SUPER_ADMIN'])

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const authHeader = request.headers.get('authorization') || ''
    if (!authHeader.startsWith('Bearer ')) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    const claims = await adminAuth.verifyIdToken(authHeader.slice(7), true)
    const roles = Array.isArray(claims.roles) ? claims.roles : claims.roles ? [claims.roles] : []
    const settings = (await adminDb.collection('appSettings').doc('general').get()).data() || {}
    const approverRole = settings.storePolicies?.adjustmentApproverRole || settings.adjustmentApproverRole || 'ADMIN'
    const allowed = approverRole === 'MANAGER' ? MANAGER_ROLES : ADMIN_ROLES
    if (claims.isActive !== true || !roles.some((role: string) => allowed.has(role))) {
      return NextResponse.json({ error: 'Adjustment approver permission is required' }, { status: 403 })
    }
    const { id } = await context.params
    const body = await request.json()
    const type = body.type as 'ADD' | 'REMOVE' | 'SET'
    const quantity = Number(body.qty)
    const reason = String(body.reason || '').trim()
    const requestId = String(body.requestId || '').replace(/[^A-Za-z0-9_-]/g, '_')
    if (!['ADD', 'REMOVE', 'SET'].includes(type) || !Number.isFinite(quantity) || quantity < 0 || !reason || !requestId) {
      return NextResponse.json({ error: 'Valid type, non-negative qty, reason and requestId are required' }, { status: 400 })
    }
    const requesterUid = String(body.requesterUid || body.requestedByUid || '').trim()
    if ((body.kind === 'DISCREPANCY' || body.requiresReviewer === true) && (!requesterUid || !canSelfApproveAdjustment(requesterUid, claims.uid))) {
      return NextResponse.json({ error: 'A separate authorised reviewer must approve discrepancy adjustments' }, { status: 403 })
    }
    const ledgerId = `MANUAL_ADJUSTMENT_${id}_${requestId}`
    const result = await adminDb.runTransaction(async transaction => {
      const itemRef = adminDb.collection('inventoryItems').doc(id)
      const ledgerRef = adminDb.collection('stockLedger').doc(ledgerId)
      const [itemSnap, ledgerSnap] = await Promise.all([transaction.get(itemRef), transaction.get(ledgerRef)])
      if (!itemSnap.exists) throw new Error('Inventory item not found')
      if (ledgerSnap.exists) return { ledgerId, idempotent: true }
      const qtyBefore = Number(itemSnap.data()?.onHand ?? itemSnap.data()?.inStock ?? 0)
      const qtyDelta = type === 'SET' ? quantity - qtyBefore : type === 'ADD' ? quantity : -quantity
      const qtyAfter = qtyBefore + qtyDelta
      const allowNegative = settings.storePolicies?.allowNegativeStock === true || settings.allowNegativeStock === true
      if (qtyAfter < 0 && !allowNegative) throw new Error(`Insufficient stock. Available: ${qtyBefore}, requested: ${quantity}`)
      const now = FieldValue.serverTimestamp()
      const actor = { uid: claims.uid, name: claims.name || claims.email || claims.uid }
      transaction.update(itemRef, { onHand: qtyAfter, updatedAt: now, updatedBy: actor })
      transaction.create(ledgerRef, {
        inventoryItemId: id, movementType: 'ADJUST', qtyDelta, qtyBefore, qtyAfter,
        sourceType: 'MANUAL_ADJUSTMENT', sourceId: requestId, sourceLineId: requestId,
        referenceNo: String(body.reference || 'Manual Adjustment'), reason,
        unitCost: Number(body.unitCost || 0), postedBy: actor, requestedByUid: requesterUid || claims.uid, createdAt: now,
      })
      const unitCost = Number(body.unitCost || 0)
      if (qtyDelta < 0 && body.skipFinancials !== true && unitCost > 0) {
        transaction.create(adminDb.collection('operationalExpenses').doc(`COGS_${ledgerId}`), {
          type: 'COST_OF_SALES', category: 'Cost of Sales', paymentMethod: 'INVENTORY',
          description: `COGS: ${reason} (Ref: ${body.reference || 'Manual'})`,
          amount: Math.abs(qtyDelta * unitCost), status: 'APPROVED', inventoryItemId: id,
          reference: String(body.reference || 'Manual'), sourceStockLedgerId: ledgerId,
          createdAt: now, approvedAt: now, createdByUid: claims.uid,
        })
      }
      return { ledgerId, idempotent: false, qtyBefore, qtyAfter, qtyDelta }
    })
    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Inventory adjustment failed' }, { status: 400 })
  }
}
