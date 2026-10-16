import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebase-admin'

/**
 * POST /api/super/repair-mbdi-owners
 * Remap initiative ownerId from HR employee ids to app user uids.
 * Super Admin only.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized: No token provided' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    const decoded = await adminAuth.verifyIdToken(token, true)
    const roles = decoded.roles || []
    if (decoded.isActive !== true) {
      return NextResponse.json({ error: 'Forbidden: User account is inactive' }, { status: 403 })
    }
    if (!roles.includes('SUPER_ADMIN') && !roles.includes('ADMIN') && !roles.includes('MANAGER')) {
      return NextResponse.json({ error: 'Forbidden: Manager or Admin required' }, { status: 403 })
    }

    const iniSnap = await adminDb.collection('mbdiInitiatives').get()
    const usersSnap = await adminDb.collection('users').get()

    const userIds = new Set(usersSnap.docs.map((d) => d.id))
    const byEmployeeId = new Map<string, string>()
    const byEmail = new Map<string, string>()

    for (const d of usersSnap.docs) {
      const data = d.data()
      if (data.isActive === false) continue
      const empId = String(data.employeeId || '').trim()
      if (empId) byEmployeeId.set(empId, d.id)
      const email = String(data.email || '')
        .trim()
        .toLowerCase()
      if (email) byEmail.set(email, d.id)
    }

    // Also match by display name for known cases like Kganya when email mismatch
    const byName = new Map<string, string>()
    for (const d of usersSnap.docs) {
      const data = d.data()
      if (data.isActive === false) continue
      const name = String(data.name || data.displayName || '')
        .trim()
        .toLowerCase()
      if (name) byName.set(name, d.id)
    }

    const repaired: Array<{
      id: string
      mbdiNo?: string
      ownerName?: string
      from: string
      to: string
    }> = []
    let skipped = 0

    // Prefer targeting MBDI-2026-003 if present; still repair all orphans
    for (const d of iniSnap.docs) {
      const data = d.data()
      const ownerId = String(data.ownerId || '')
      if (!ownerId) {
        skipped++
        continue
      }
      if (userIds.has(ownerId)) {
        skipped++
        continue
      }

      let newUid =
        byEmployeeId.get(ownerId) ||
        byEmail.get(String(data.ownerEmail || '').trim().toLowerCase()) ||
        byName.get(String(data.ownerName || '').trim().toLowerCase()) ||
        null

      // Explicit Kganya / kdube fallback for MBDI-2026-003
      if (!newUid && (data.mbdiNo === 'MBDI-2026-003' || /kganya/i.test(String(data.ownerName || '')))) {
        const kganya = usersSnap.docs.find((u) => {
          const ud = u.data()
          const email = String(ud.email || '').toLowerCase()
          const name = String(ud.name || ud.displayName || '').toLowerCase()
          return email.includes('kdube') || name.includes('kganya')
        })
        if (kganya) newUid = kganya.id
      }

      if (!newUid || newUid === ownerId) {
        skipped++
        continue
      }

      await d.ref.update({ ownerId: newUid })
      repaired.push({
        id: d.id,
        mbdiNo: data.mbdiNo,
        ownerName: data.ownerName,
        from: ownerId,
        to: newUid,
      })
    }

    return NextResponse.json({
      success: true,
      scanned: iniSnap.size,
      repaired,
      skipped,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    console.error('[API/Super/RepairMbdiOwners]', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
