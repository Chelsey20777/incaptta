import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebase-admin'
import {
  isEligibleForManagerStockPost,
  listInventoryLines,
  markJobInventoryLinePostingFailed,
  postJobInventoryLineTransaction,
  type InventoryJobCardRecord,
  type InventoryMovementType,
} from '@/lib/server/job-inventory-posting'
import { reserveJobInventoryLine } from '@/lib/server/job-inventory-fulfilment'
import type { BulkInventoryApprovalResult } from '@/features/jobCards/types'

const MANAGER_ROLES = new Set(['MANAGER', 'DIRECTOR', 'ADMIN', 'SUPER_ADMIN'])

function rolesFromClaims(claims: unknown): string[] {
  const roles = (claims as Record<string, unknown>).roles
  return (Array.isArray(roles) ? roles : roles ? [roles] : []).map(String)
}

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get('authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const claims = await adminAuth.verifyIdToken(authHeader.slice(7), true)
    if (claims.isActive !== true || !rolesFromClaims(claims).some(role => MANAGER_ROLES.has(role))) {
      return NextResponse.json({ error: 'Manager approval is required to post stock' }, { status: 403 })
    }

    const { id: jobCardId } = await context.params
    const body = await request.json().catch(() => ({})) as { movementType?: unknown }
    const movementType = body.movementType as InventoryMovementType
    if (movementType !== 'ISSUE' && movementType !== 'RETURN') {
      return NextResponse.json({ error: 'movementType must be ISSUE or RETURN' }, { status: 400 })
    }

    const jobSnap = await adminDb.collection('jobCards').doc(jobCardId).get()
    if (!jobSnap.exists) {
      return NextResponse.json({ error: 'Job Card not found' }, { status: 404 })
    }

    const job = jobSnap.data() as InventoryJobCardRecord
    const eligibleRows = listInventoryLines(job, movementType).filter(isEligibleForManagerStockPost)
    const result: BulkInventoryApprovalResult = {
      eligible: eligibleRows.length,
      approved: 0,
      alreadyPosted: 0,
      failed: [],
    }
    const actor = { uid: claims.uid, name: claims.name || claims.email || claims.uid }

    // Keep the chosen best-effort semantics while avoiding concurrent writes to the
    // same job-card document. Every line remains its own idempotent transaction.
    for (const row of eligibleRows) {
      const lineId = typeof row.id === 'string' ? row.id : ''
      const itemName = String(row.itemName || row.description || 'Inventory item')
      if (!lineId) {
        result.failed.push({ lineId: '', itemName, reason: 'Inventory line is missing a stable ID' })
        continue
      }

      try {
        const posted = movementType === 'ISSUE'
          ? await reserveJobInventoryLine({ jobCardId, lineId, actor })
          : await postJobInventoryLineTransaction({ jobCardId, lineId, movementType, actor })
        if (posted.idempotent) result.alreadyPosted += 1
        else result.approved += 1
      } catch (error: unknown) {
        const reason = errorMessage(error, 'Stock posting failed')
        result.failed.push({ lineId, itemName, reason })
        try {
          await markJobInventoryLinePostingFailed(jobCardId, lineId, reason)
        } catch (markError) {
          console.error('[bulk inventory approval] Failed to persist row error:', markError)
        }
      }
    }

    return NextResponse.json(result)
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error, 'Bulk stock posting failed') }, { status: 400 })
  }
}
