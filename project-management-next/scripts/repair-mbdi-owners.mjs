/**
 * One-shot: remap MBDI ownerId from HR employee ids to app user uids.
 * Usage: node --env-file=.env project-management-next/scripts/repair-mbdi-owners.mjs
 */
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const keyRaw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
if (!keyRaw) {
  console.error('Missing FIREBASE_SERVICE_ACCOUNT_KEY')
  process.exit(1)
}

const serviceAccount = JSON.parse(keyRaw)
if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) })
}

const db = getFirestore()

const iniSnap = await db.collection('mbdiInitiatives').get()
const usersSnap = await db.collection('users').get()

const userIds = new Set(usersSnap.docs.map((d) => d.id))
const byEmployeeId = new Map()
const byEmail = new Map()
const byName = new Map()

for (const d of usersSnap.docs) {
  const data = d.data()
  if (data.isActive === false) continue
  const empId = String(data.employeeId || '').trim()
  if (empId) byEmployeeId.set(empId, d.id)
  const email = String(data.email || '').trim().toLowerCase()
  if (email) byEmail.set(email, d.id)
  const name = String(data.name || data.displayName || '').trim().toLowerCase()
  if (name) byName.set(name, d.id)
}

const findKganyaUid = () => {
  const hit = usersSnap.docs.find((u) => {
    const ud = u.data()
    const email = String(ud.email || '').toLowerCase()
    const name = String(ud.name || ud.displayName || '').toLowerCase()
    return email.includes('kdube') || name.includes('kganya')
  })
  return hit?.id || null
}

const repaired = []
let skipped = 0

for (const d of iniSnap.docs) {
  const data = d.data()
  const ownerId = String(data.ownerId || '')
  if (!ownerId || userIds.has(ownerId)) {
    skipped++
    continue
  }

  let newUid =
    byEmployeeId.get(ownerId) ||
    byEmail.get(String(data.ownerEmail || '').trim().toLowerCase()) ||
    byName.get(String(data.ownerName || '').trim().toLowerCase()) ||
    null

  if (
    !newUid &&
    (data.mbdiNo === 'MBDI-2026-003' || /kganya/i.test(String(data.ownerName || '')))
  ) {
    newUid = findKganyaUid()
  }

  if (!newUid || newUid === ownerId) {
    console.log('SKIP', data.mbdiNo || d.id, 'ownerId=', ownerId, 'ownerEmail=', data.ownerEmail)
    skipped++
    continue
  }

  await d.ref.update({ ownerId: newUid })
  repaired.push({ mbdiNo: data.mbdiNo, ownerName: data.ownerName, from: ownerId, to: newUid })
  console.log('REPAIRED', data.mbdiNo, data.ownerName, ownerId, '->', newUid)
}

console.log(JSON.stringify({ scanned: iniSnap.size, repairedCount: repaired.length, skipped, repaired }, null, 2))
