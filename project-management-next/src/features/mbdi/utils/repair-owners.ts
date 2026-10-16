import {
  collection,
  getDocs,
  query,
  where,
  updateDoc,
  doc,
  type Firestore,
} from 'firebase/firestore'

export interface RepairMbdiOwnersResult {
  scanned: number
  repaired: Array<{ id: string; mbdiNo?: string; ownerName?: string; from: string; to: string }>
  skipped: number
}

/**
 * For initiatives whose ownerId is not an app user uid, remap to the auth uid via:
 * - users.employeeId == ownerId
 * - users.email == ownerEmail (case-insensitive)
 * - users name match / known Kganya heuristics for MBDI-2026-003
 */
export async function repairOrphanedMbdiOwners(db: Firestore): Promise<RepairMbdiOwnersResult> {
  const [iniSnap, usersSnap] = await Promise.all([
    getDocs(collection(db, 'mbdiInitiatives')),
    getDocs(collection(db, 'users')),
  ])

  const userIds = new Set(usersSnap.docs.map((d) => d.id))
  const byEmployeeId = new Map<string, string>()
  const byEmail = new Map<string, string>()
  const byName = new Map<string, string>()

  for (const d of usersSnap.docs) {
    const data = d.data()
    if (data.isActive === false) continue
    const empId = (data.employeeId || '').trim()
    if (empId) byEmployeeId.set(empId, d.id)
    const email = (data.email || '').trim().toLowerCase()
    if (email) byEmail.set(email, d.id)
    const name = (data.name || data.displayName || '').trim().toLowerCase()
    if (name) byName.set(name, d.id)
  }

  const findKganyaUid = (): string | null => {
    const hit = usersSnap.docs.find((u) => {
      const ud = u.data()
      const email = String(ud.email || '').toLowerCase()
      const name = String(ud.name || ud.displayName || '').toLowerCase()
      return email.includes('kdube') || name.includes('kganya')
    })
    return hit?.id || null
  }

  const repaired: RepairMbdiOwnersResult['repaired'] = []
  let skipped = 0

  for (const d of iniSnap.docs) {
    const data = d.data()
    const ownerId = (data.ownerId || '') as string
    if (!ownerId) {
      skipped++
      continue
    }
    if (userIds.has(ownerId)) {
      skipped++
      continue
    }

    let newUid: string | null =
      byEmployeeId.get(ownerId) ||
      byEmail.get((data.ownerEmail || '').trim().toLowerCase()) ||
      byName.get((data.ownerName || '').trim().toLowerCase()) ||
      null

    if (!newUid) {
      try {
        const q = await getDocs(
          query(collection(db, 'users'), where('employeeId', '==', ownerId))
        )
        if (!q.empty) newUid = q.docs[0]!.id
      } catch {
        // ignore
      }
    }

    if (
      !newUid &&
      (data.mbdiNo === 'MBDI-2026-003' || /kganya/i.test(String(data.ownerName || '')))
    ) {
      newUid = findKganyaUid()
    }

    if (!newUid || newUid === ownerId) {
      skipped++
      continue
    }

    await updateDoc(doc(db, 'mbdiInitiatives', d.id), { ownerId: newUid })
    repaired.push({
      id: d.id,
      mbdiNo: data.mbdiNo,
      ownerName: data.ownerName,
      from: ownerId,
      to: newUid,
    })
  }

  return { scanned: iniSnap.size, repaired, skipped }
}
