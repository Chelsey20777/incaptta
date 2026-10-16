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
import { db } from '@/lib/firebase'
import { deleteStorageUrls } from './financeUtils'

export type AdHocDeleteVia = 'REJECT' | 'TRASH' | 'SAVE_DIFF'

export interface AdHocDeleteActor {
  uid?: string
  displayName?: string
  email?: string
}

export interface CascadeDeleteAdHocExpenseInput {
  jobCardId: string
  jobNumber?: string | null
  expense: any
  deletedBy?: AdHocDeleteActor | null
  deletedVia: AdHocDeleteVia
  /** When true, only clean OPEX/files/audit — caller already removed the array row. */
  skipArrayUpdate?: boolean
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
export async function cascadeDeleteAdHocExpense(input: CascadeDeleteAdHocExpenseInput): Promise<{
  opexIds: string[]
}> {
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

  // Deterministic id used by recordExpense for job-card adhoc lines
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

      // Reverse Reserve wallet debit if this OPEX had deducted RESERVE
      try {
        const walletSnap = await getDocs(
          query(collection(db, 'reserveAccountTransactions'), where('referenceId', '==', opex.id))
        )
        walletSnap.docs.forEach((d) => {
          if (d.data().type === 'PAYMENT') batch.delete(d.ref)
        })
      } catch (err) {
        console.warn('[cascadeDeleteAdHocExpense] Reserve wallet cleanup failed', opex.id, err)
      }
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

/**
 * Diff previous vs next adHocExpenses arrays and cascade-delete removed rows.
 */
export async function cascadeRemovedAdHocExpenses(params: {
  jobCardId: string
  jobNumber?: string | null
  previous: any[]
  next: any[]
  deletedBy?: AdHocDeleteActor | null
  deletedVia?: AdHocDeleteVia
}): Promise<void> {
  const prevIds = new Set((params.next || []).map((e) => e?.id).filter(Boolean))
  const removed = (params.previous || []).filter((e) => e?.id && !prevIds.has(e.id))
  for (const expense of removed) {
    await cascadeDeleteAdHocExpense({
      jobCardId: params.jobCardId,
      jobNumber: params.jobNumber,
      expense,
      deletedBy: params.deletedBy,
      deletedVia: params.deletedVia || 'SAVE_DIFF',
      skipArrayUpdate: true,
    })
  }
}
