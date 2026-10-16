import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  query,
  where,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore'
import { ref, deleteObject } from 'firebase/storage'
import { db, storage } from '@/lib/firebase'

export type AdHocDeleteVia = 'REJECT' | 'TRASH' | 'SAVE_DIFF'

export interface AdHocDeleteActor {
  uid?: string
  displayName?: string
  email?: string
}

function storageRefFromUrl(url: string) {
  if (url.startsWith('gs://')) {
    return ref(storage, url)
  }
  const match = url.match(/\/o\/([^?]+)/)
  if (!match?.[1]) {
    throw new Error('Invalid Firebase Storage URL')
  }
  return ref(storage, decodeURIComponent(match[1]))
}

async function deleteStorageUrls(urls: (string | null | undefined)[]): Promise<void> {
  const unique = [...new Set((urls || []).filter((u): u is string => typeof u === 'string' && u.trim().length > 0))]
  await Promise.all(
    unique.map(async (url) => {
      try {
        await deleteObject(storageRefFromUrl(url))
      } catch (err: any) {
        const code = err?.code || ''
        if (
          code === 'storage/object-not-found' ||
          code === 'storage/invalid-argument' ||
          err?.message === 'Invalid Firebase Storage URL'
        ) {
          return
        }
        console.warn('[deleteStorageUrls] Failed to delete', url, err)
      }
    })
  )
}

function collectAttachmentUrls(...sources: any[]): string[] {
  const urls: string[] = []
  for (const src of sources) {
    if (!src) continue
    if (Array.isArray(src.attachmentUrls)) {
      for (const u of src.attachmentUrls) {
        if (typeof u === 'string' && u.trim()) urls.push(u.trim())
      }
    }
    if (typeof src.attachmentUrl === 'string' && src.attachmentUrl.trim()) {
      urls.push(src.attachmentUrl.trim())
    }
  }
  return [...new Set(urls)]
}

/**
 * After an ad-hoc expense is removed from the job card array:
 * delete linked OPEX (+ verification docs), write an audit log, then
 * best-effort delete Storage attachments.
 */
export async function cascadeDeleteAdHocExpense(input: {
  jobCardId: string
  jobNumber?: string | null
  expense: any
  deletedBy?: AdHocDeleteActor | null
  deletedVia: AdHocDeleteVia
}): Promise<{ opexIds: string[] }> {
  const { jobCardId, expense, deletedBy, deletedVia } = input
  const expenseId = expense?.id
  if (!expenseId) return { opexIds: [] }

  const opexById = new Map<string, any>()

  if (expense.opexId) {
    try {
      const snap = await getDoc(doc(db, 'operationalExpenses', expense.opexId))
      if (snap.exists()) opexById.set(snap.id, { id: snap.id, ...snap.data() })
    } catch (err) {
      console.warn('[cascadeDeleteAdHocExpense] Failed to load opexId', expense.opexId, err)
    }
  }

  try {
    const q = query(collection(db, 'operationalExpenses'), where('sourceItemId', '==', expenseId))
    const snap = await getDocs(q)
    snap.docs.forEach((d) => {
      if (!opexById.has(d.id)) opexById.set(d.id, { id: d.id, ...d.data() })
    })
  } catch (err) {
    console.warn('[cascadeDeleteAdHocExpense] sourceItemId query failed', err)
  }

  const deterministicId = `jc-adhoc-${expenseId}`
  if (!opexById.has(deterministicId)) {
    try {
      const snap = await getDoc(doc(db, 'operationalExpenses', deterministicId))
      if (snap.exists()) opexById.set(snap.id, { id: snap.id, ...snap.data() })
    } catch (err) {
      console.warn('[cascadeDeleteAdHocExpense] Failed to load deterministic opex', err)
    }
  }

  const opexDocs = Array.from(opexById.values())
  const opexIds = opexDocs.map((d) => d.id)
  const attachmentUrls = collectAttachmentUrls(expense, ...opexDocs)

  if (opexDocs.length > 0) {
    const batch = writeBatch(db)
    for (const opex of opexDocs) {
      if (opex.verificationToken) {
        batch.delete(doc(db, 'docVerifications', opex.verificationToken))
      }
      batch.delete(doc(db, 'operationalExpenses', opex.id))
    }
    await batch.commit()
  }

  const amount =
    Number(expense.totalAmount) ||
    Number(expense.quantity || 0) * Number(expense.unitPrice || 0) ||
    0

  try {
    await addDoc(collection(db, 'jobCardAuditLogs'), {
      action: 'ADHOC_EXPENSE_DELETED',
      jobCardId,
      jobNumber: input.jobNumber || null,
      expenseId,
      opexIds,
      expenseSnapshot: {
        description: expense.description || null,
        amount,
        paymentMethod: expense.paymentMethod || null,
        approvalStatus: expense.approvalStatus || null,
        recipientName: expense.recipientName || null,
        recipientPhone: expense.recipientPhone || null,
        attachmentUrls,
        opexId: expense.opexId || null,
      },
      deletedBy: {
        uid: deletedBy?.uid || null,
        displayName: deletedBy?.displayName || null,
        email: deletedBy?.email || null,
      },
      deletedVia,
      createdAt: serverTimestamp(),
    })
  } catch (err) {
    console.error('[cascadeDeleteAdHocExpense] Audit log failed:', err)
  }

  try {
    await deleteStorageUrls(attachmentUrls)
  } catch (err) {
    console.warn('[cascadeDeleteAdHocExpense] Storage cleanup failed:', err)
  }

  return { opexIds }
}
