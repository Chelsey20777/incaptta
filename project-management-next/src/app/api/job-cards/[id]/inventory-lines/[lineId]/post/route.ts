import { NextRequest, NextResponse } from 'next/server'
import { adminAuth } from '@/lib/firebase-admin'
import { postJobInventoryLineTransaction } from '@/lib/server/job-inventory-posting'
import { reserveJobInventoryLine } from '@/lib/server/job-inventory-fulfilment'

const MANAGER_ROLES = new Set(['MANAGER', 'DIRECTOR', 'ADMIN', 'SUPER_ADMIN'])

function rolesFromClaims(claims: unknown): string[] {
  const roles = (claims as Record<string, unknown>).roles
  return (Array.isArray(roles) ? roles : roles ? [roles] : []).map(String)
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; lineId: string }> }) {
  try {
    const authHeader = request.headers.get('authorization') || ''
    if (!authHeader.startsWith('Bearer ')) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    const claims = await adminAuth.verifyIdToken(authHeader.slice(7), true)
    if (claims.isActive !== true || !rolesFromClaims(claims).some(role => MANAGER_ROLES.has(role))) {
      return NextResponse.json({ error: 'Manager approval is required to post stock' }, { status: 403 })
    }
    const { id: jobCardId, lineId } = await context.params
    const { movementType } = await request.json()
    if (movementType !== 'ISSUE' && movementType !== 'RETURN') {
      return NextResponse.json({ error: 'movementType must be ISSUE or RETURN' }, { status: 400 })
    }

    const actor = { uid: claims.uid, name: claims.name || claims.email || claims.uid }
    const result = movementType === 'ISSUE'
      ? await reserveJobInventoryLine({ jobCardId, lineId, actor })
      : await postJobInventoryLineTransaction({ jobCardId, lineId, movementType, actor })
    return NextResponse.json(result)
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Stock posting failed' }, { status: 400 })
  }
}
