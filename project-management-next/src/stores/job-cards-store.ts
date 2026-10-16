'use client'

import { create } from 'zustand'
import { auth, db } from '@/lib/firebase'
import {
  collection,
  query,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp,
  orderBy,
  runTransaction,
  writeBatch,
  getDocs,
  where,
  getDoc
} from 'firebase/firestore'
import { computeFinancials } from '@/lib/financial-engine'
import { useInventoryStore } from './inventory-store'
import { useFinanceStore, assertSufficientFunds } from './finance-store'
import { useSubcontractorsStore } from './subcontractors-store'
import { ExpenseCategory } from '@/lib/types-finance'
import { LIQUID_ACCOUNTS, normalizeAccountKey } from '@/lib/account-keys'
import { isJobCardAdHocAutoEligible } from '@/lib/job-card-expense-approval'
import {
  cascadeDeleteAdHocExpense,
  cascadeRemovedAdHocExpenses,
  type AdHocDeleteActor,
} from '@/features/jobCards/utils/cascadeDeleteAdHocExpense'
import type { BulkInventoryApprovalResult } from '@/features/jobCards/types'
import { toast } from 'sonner'
import { accrualPayrollEnabled } from '@/lib/payroll/client'

function requireStaffEarningPeriod(item: { earningPeriod?: string }) {
  if (accrualPayrollEnabled && !/^\d{4}-(0[1-9]|1[0-2])$/.test(item.earningPeriod || '')) {
    throw new Error('Set the staff rate earning month before approving it')
  }
}

export type ItemApprovalUserContext = {
  isAccountant: boolean
  isManager: boolean
  userName?: string
  uid?: string
  email?: string
}

interface JobCardsState {
  jobCards: any[]
  loading: boolean
  error: string | null
  
  unsubscribeListener: (() => void) | null

  fetchJobCards: () => () => void
  createJobCard: (data: any) => Promise<string>
  generateJobNumber: () => Promise<string>
  updateJobCardStatus: (id: string, status: string, approvalEvent?: any) => Promise<void>
  approveJobCard: (id: string, currentStatus: string, role: string, userName: string) => Promise<void>
  rejectJobCard: (id: string, role: string, userName: string, reason: string) => Promise<void>
  updateJobCardArray: (jobId: string, arrayField: string, updatedArray: any[], actor?: AdHocDeleteActor | null) => Promise<void>
  approveAdHocExpenseFromFinance: (jobId: string, itemId: string, financeStoreRecordFn: Function) => Promise<void>
  approveItem: (jobId: string, arrayField: string, itemId: string, newStatus: string, userContext: ItemApprovalUserContext, localItems?: any[]) => Promise<void>
  approveAllItems: (jobId: string, arrayField: string, targetStatus: string, userContext: ItemApprovalUserContext, localItems?: any[]) => Promise<BulkInventoryApprovalResult | void>
  /** Immediately remove an ad-hoc expense from the job card and cascade OPEX/files/audit. */
  deleteAdHocExpense: (jobId: string, expense: any, actor?: AdHocDeleteActor | null) => Promise<void>
  /** Re-post approved staff rates to payroll (repairs missed/wiped earnings). */
  syncStaffRatesToPayroll: (jobId: string) => Promise<void>
  updateFullJobCard: (id: string, payload: any, actor?: AdHocDeleteActor | null) => Promise<void>
  deleteJobCardCascade: (id: string, currentStatus: string, isAdmin?: boolean) => Promise<void>
  lockApprovedItems: (id: string, type: 'inventory' | 'expenses') => Promise<void>
  duplicateJobCard: (sourceId: string, submittedBy: { uid: string; email: string; name: string }) => Promise<string>
  cleanup: () => void
}

function toDeleteActor(userContext?: ItemApprovalUserContext | AdHocDeleteActor | null): AdHocDeleteActor | null {
  if (!userContext) return null
  const ctx = userContext as ItemApprovalUserContext & AdHocDeleteActor
  return {
    uid: ctx.uid,
    displayName: ctx.displayName || ctx.userName,
    email: ctx.email,
  }
}

/** Client-side role gate for item approvals (Firestore rules remain the hard boundary). */
function hasApprovalRole(targetStatus: string, isAccountant?: boolean, isManager?: boolean): boolean {
  if (targetStatus === 'APPROVED_MANAGER') return !!isManager
  if (targetStatus === 'APPROVED_ACCOUNTANT' || targetStatus === 'REJECTED') return !!isAccountant || !!isManager
  return true
}

async function postJobExpenseApproval(jobId: string, expenseId: string) {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('Authentication required')
  const response = await fetch(
    `/api/job-cards/${encodeURIComponent(jobId)}/expenses/${encodeURIComponent(expenseId)}/approve`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
  )
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Expense approval failed')
  return body
}

async function postAutoJobExpenseApproval(jobId: string, expenseId: string) {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('Authentication required')
  const response = await fetch(
    `/api/job-cards/${encodeURIComponent(jobId)}/expenses/${encodeURIComponent(expenseId)}/auto-approve`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
  )
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Automatic expense approval failed')
  return body
}

async function postReserveCommissionApproval(jobId: string, commissionId: string) {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('Authentication required')
  const response = await fetch(
    `/api/job-cards/${encodeURIComponent(jobId)}/commissions/${encodeURIComponent(commissionId)}/approve`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
  )
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Reserve commission approval failed')
  return body
}

async function postJobInventoryLine(jobId: string, lineId: string, movementType: 'ISSUE' | 'RETURN') {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('Authentication required')
  const response = await fetch(`/api/job-cards/${encodeURIComponent(jobId)}/inventory-lines/${encodeURIComponent(lineId)}/post`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ movementType }),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Stock posting failed')
  await useInventoryStore.getState().fetchItems({ isActive: true })
  return body
}

async function postAllJobInventoryLines(
  jobId: string,
  movementType: 'ISSUE' | 'RETURN'
): Promise<BulkInventoryApprovalResult> {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('Authentication required')
  const response = await fetch(`/api/job-cards/${encodeURIComponent(jobId)}/inventory-lines/post`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ movementType }),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Bulk stock posting failed')
  await useInventoryStore.getState().fetchItems({ isActive: true })
  return body as BulkInventoryApprovalResult
}

/** Stamp opexId on an ad-hoc expense after posting so re-approve cannot double-post. */
async function stampAdHocOpexId(jobId: string, itemId: string, opexId: string) {
  if (!jobId || !itemId || !opexId) return
  const ref = doc(db, 'jobCards', jobId)
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref)
    if (!snap.exists()) return
    const expenses = (snap.data().adHocExpenses || []).map((e: any) =>
      e?.id === itemId ? { ...e, opexId } : e
    )
    transaction.update(ref, stripUndefinedDeep({
      adHocExpenses: expenses,
      updatedAt: serverTimestamp(),
    }))
  })
}

/**
 * Merge UI ad-hoc expense rows into the Firestore array so newly added (unsaved)
 * rows can be approved without a separate Save — matches Vue JobCardDetail behavior.
 * Never overwrite already-approved Firestore rows with potentially stale local copies.
 */
function mergeAdHocArrays(firestoreRows: any[], localRows?: any[]): any[] {
  const byId = new Map<string, any>()
  for (const r of firestoreRows || []) {
    if (r?.id) byId.set(r.id, { ...r })
  }
  for (const local of localRows || []) {
    if (!local?.id) continue
    const existing = byId.get(local.id)
    if (!existing) {
      byId.set(local.id, { ...local })
    } else if (!existing.approvalStatus || existing.approvalStatus === 'PENDING') {
      byId.set(local.id, {
        ...existing,
        ...local,
        approvalStatus: existing.approvalStatus || local.approvalStatus || 'PENDING',
      })
    } else if (
      existing.approvalStatus === 'APPROVED_ACCOUNTANT' &&
      !existing.opexId &&
      local.paymentMethod !== undefined
    ) {
      // Unposted ACCT OK rows may still change funding account before Post.
      byId.set(local.id, {
        ...existing,
        paymentMethod: local.paymentMethod,
      })
    }
  }
  return Array.from(byId.values())
}

/** Firestore rejects undefined at any depth; preserve FieldValue sentinels (e.g. serverTimestamp). */
function stripUndefinedDeep<T>(value: T): T {
  if (value === undefined) return value
  if (value === null || typeof value !== 'object') return value
  if (typeof (value as { _methodName?: string })._methodName === 'string') return value
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)).filter((item) => item !== undefined) as T
  }
  const out: Record<string, unknown> = {}
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (nested === undefined) continue
    const cleaned = stripUndefinedDeep(nested)
    if (cleaned !== undefined) out[key] = cleaned
  }
  return out as T
}

function looksLikeRequisitionSections(arr?: any[]): boolean {
  return Array.isArray(arr) && arr.some((x) => Array.isArray(x?.items))
}

function newRequisitionId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function requisitionLineMatches(item: any, itemId: string) {
  if (!itemId) return false
  return item?.id === itemId || (!item?.id && item?.inventoryItemId === itemId)
}

function mergeRequisitionLines(firestoreItems: any[], localItems?: any[]): any[] {
  const locals = [...(localItems || [])]
  const used = new Set<number>()
  const merged: any[] = []

  const takeLocal = (predicate: (item: any) => boolean) => {
    const idx = locals.findIndex((item, i) => !used.has(i) && predicate(item))
    if (idx === -1) return null
    used.add(idx)
    return locals[idx]
  }

  for (const remote of firestoreItems || []) {
    const local = remote?.id
      ? takeLocal((item) => item?.id === remote.id)
        || takeLocal((item) => item?.inventoryItemId && item.inventoryItemId === remote.inventoryItemId && !item?.id)
      : takeLocal((item) => item?.inventoryItemId && item.inventoryItemId === remote.inventoryItemId)
        || takeLocal((item) => requisitionLineMatches(item, remote.inventoryItemId))
    if (!local) {
      merged.push({ ...remote, id: remote?.id || newRequisitionId() })
      continue
    }
    const existing = { ...remote }
    if (!existing.approvalStatus || existing.approvalStatus === 'PENDING') {
      merged.push({
        ...existing,
        ...local,
        id: existing.id || local.id || newRequisitionId(),
        approvalStatus: existing.approvalStatus || local.approvalStatus || 'PENDING',
      })
    } else {
      merged.push({ ...existing, id: existing.id || local.id || newRequisitionId() })
    }
  }

  locals.forEach((local, index) => {
    if (used.has(index) || !local) return
    merged.push({ ...local, id: local.id || newRequisitionId() })
  })

  return merged
}

function findRequisitionLine(sections: any[], itemId: string): { section: any; item: any } | null {
  for (const section of sections || []) {
    const item = (section.items || []).find((row: any) => requisitionLineMatches(row, itemId))
    if (item) return { section, item }
  }
  return null
}

/**
 * Merge local UI requisition sections into Firestore sections so unsaved
 * inventory lines can be approved without a separate Save.
 * Quote-created jobs often have section/item rows with no id — keep those.
 */
function mergeRequisitionSections(firestoreSections: any[], localSections?: any[]): any[] {
  const remoteSections = firestoreSections || []
  if (!localSections || localSections.length === 0) {
    return remoteSections.map((section: any) => ({
      ...section,
      id: section?.id || newRequisitionId(),
      items: mergeRequisitionLines(section.items || []),
    }))
  }

  const sectionByKey = new Map<string, any>()
  const usedLocal = new Set<number>()

  remoteSections.forEach((section: any, index: number) => {
    const key = section?.id || `__remote_${index}`
    sectionByKey.set(key, {
      ...section,
      id: section?.id || newRequisitionId(),
      items: (section.items || []).map((item: any) => ({ ...item })),
    })
  })

  localSections.forEach((localSec: any, index: number) => {
    const byId = localSec?.id
      ? [...sectionByKey.entries()].find(([, section]) => section.id === localSec.id)
      : undefined
    const byIndex = !localSec?.id
      ? sectionByKey.get(`__remote_${index}`) || [...sectionByKey.values()][index]
      : undefined
    const existing = byId?.[1] || byIndex
    if (!existing) {
      sectionByKey.set(localSec?.id || `__local_${index}`, {
        ...localSec,
        id: localSec?.id || newRequisitionId(),
        items: mergeRequisitionLines([], localSec.items),
      })
      usedLocal.add(index)
      return
    }
    usedLocal.add(index)
    existing.jobCategoryId = localSec.jobCategoryId || existing.jobCategoryId
    existing.description = localSec.description ?? existing.description
    existing.qty = localSec.qty ?? existing.qty
    existing.unit = localSec.unit ?? existing.unit
    existing.items = mergeRequisitionLines(existing.items, localSec.items)
  })

  return Array.from(sectionByKey.values())
}

function flattenRequisitionSections(sections: any[]): any[] {
  return (sections || []).flatMap((s: any) =>
    (s.items || []).map((i: any) => ({ ...i, jobCategoryId: s.jobCategoryId }))
  )
}

function normalizeExpenseTotalAmount(item: any): number {
  return Number(item.totalAmount || (item.quantity || 0) * (item.unitPrice || 0))
}

/** Under-$200 ad-hoc posts require a liquid account with enough cash. */
function assertAdHocExpenseCanAutoPost(expense: any) {
  const amount = normalizeExpenseTotalAmount(expense)
  const method = normalizeAccountKey(expense?.paymentMethod)
  if (method === 'UNKNOWN' || !LIQUID_ACCOUNTS.includes(method)) {
    throw new Error('Select a valid payment account before approval')
  }
  assertSufficientFunds(method, amount, useFinanceStore.getState())
}

/** Undo ACCT OK when auto-post fails so the row is not stuck unposted. */
async function revertAdHocExpenseToPending(jobId: string, itemId: string) {
  const ref = doc(db, 'jobCards', jobId)
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref)
    if (!snap.exists()) return
    const expenses = (snap.data().adHocExpenses || []).map((row: any) => ({ ...row }))
    const idx = expenses.findIndex((row: any) => row.id === itemId)
    if (idx === -1) return
    const row = expenses[idx]
    if (row.opexId || row.approvalStatus !== 'APPROVED_ACCOUNTANT') return
    const { accountantApprovedAt: _a, accountantApprovedBy: _b, ...rest } = row
    expenses[idx] = {
      ...rest,
      approvalStatus: 'PENDING',
    }
    transaction.update(ref, stripUndefinedDeep({
      adHocExpenses: expenses,
      updatedAt: serverTimestamp(),
    }))
  })
}

/** Undo manager OK on legacy subcontract when ledger post fails before OPEX is stamped. */
async function revertSubcontractWorkFromManagerApproval(jobId: string, itemId: string) {
  const ref = doc(db, 'jobCards', jobId)
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref)
    if (!snap.exists()) return
    const works = (snap.data().subcontractWorks || []).map((row: any) => ({ ...row }))
    const idx = works.findIndex((row: any) => row.id === itemId)
    if (idx === -1) return
    const row = works[idx]
    if (row.opexId || row.transactionPaymentId || row.approvalStatus !== 'APPROVED_MANAGER') return
    const { approvedAt: _a, approvedBy: _b, ...rest } = row
    works[idx] = {
      ...rest,
      approvalStatus: rest.accountantApprovedAt || rest.accountantApprovedBy
        ? 'APPROVED_ACCOUNTANT'
        : 'PENDING',
    }
    transaction.update(ref, stripUndefinedDeep({
      subcontractWorks: works,
      updatedAt: serverTimestamp(),
    }))
  })
}

/**
 * After manager approval of a subcontract work line:
 * always record a CHARGE; if paymentMethod !== PENDING also post OPEX + PAYMENT.
 * Updates the jobcard line with transactionChargeId / opexId / transactionPaymentId.
 */
async function postSubcontractWorkApproval(
  jobId: string,
  jobIdentifier: string,
  workItem: any,
  approvedBy: string,
  now: string
): Promise<void> {
  // SCN-linked projections: charge was posted at contract create; payments/OPEX via SCN approval
  if (workItem?.isScnLink || workItem?.subcontractorJobId) {
    return
  }
  try {
    const scStore = useSubcontractorsStore.getState()
    const financeStore = useFinanceStore.getState()
    const amount = Number(workItem.totalAmount || 0)
    const method = String(workItem.paymentMethod || 'PENDING').toUpperCase()
    const isPending = method === 'PENDING'

    // Fail before ledger writes when the funding account cannot cover the payment.
    if (!isPending && amount > 0) {
      assertSufficientFunds(method, amount, financeStore)
    }

    const chargeId = await scStore.recordCharge({
      subcontractorId: workItem.subcontractorId,
      subcontractorName: workItem.subcontractorName || '',
      amount,
      description: `Job Card ${jobIdentifier} - ${workItem.description || 'Subcontract work'}`,
      jobCardId: jobId,
      jobCardNumber: jobIdentifier,
      sourceItemId: workItem.id,
      paymentMethod: method,
      paymentRef: workItem.paymentRef || null,
      attachmentUrls: workItem.attachmentUrls || (workItem.attachmentUrl ? [workItem.attachmentUrl] : []),
      createdBy: 'system:jobcard-workflow',
      createdByName: approvedBy || 'Manager',
    })

    let opexId: string | undefined
    let paymentId: string | undefined

    if (!isPending && amount > 0) {
      opexId = await financeStore.recordExpense({
        category: ExpenseCategory.SUBCONTRACTOR_EXPENSE,
        amount,
        paymentMethod: method.toLowerCase(),
        description: `Job Card ${jobIdentifier} - ${workItem.description || 'Subcontract work'} (${workItem.subcontractorName || 'Subcontractor'})`,
        attachmentUrl: workItem.attachmentUrl || null,
        attachmentUrls: workItem.attachmentUrls || (workItem.attachmentUrl ? [workItem.attachmentUrl] : []),
        status: 'APPROVED',
        sourceJobId: jobId,
        sourceItemId: workItem.id,
        subcontractorId: workItem.subcontractorId,
        subcontractorName: workItem.subcontractorName || '',
        accountantApprovedBy: workItem.accountantApprovedBy || approvedBy || 'Accountant',
        managerApprovedBy: workItem.approvedBy || approvedBy || 'Manager',
      })

      paymentId = await scStore.recordPayment({
        subcontractorId: workItem.subcontractorId,
        subcontractorName: workItem.subcontractorName || '',
        amount,
        description: `Payment for Job Card ${jobIdentifier} - ${workItem.description || 'Subcontract work'}`,
        jobCardId: jobId,
        jobCardNumber: jobIdentifier,
        sourceItemId: workItem.id,
        opexId: opexId || null,
        paymentMethod: method,
        paymentRef: workItem.paymentRef || null,
        attachmentUrls: workItem.attachmentUrls || [],
        createdBy: 'system:jobcard-workflow',
        createdByName: approvedBy || 'Manager',
      })
    }

    // Stamp IDs back onto the jobcard line (idempotency for re-approve)
    const ref = doc(db, 'jobCards', jobId)
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref)
      if (!snap.exists()) return
      const job: any = snap.data()
      const cloned = (job.subcontractWorks || []).map((w: any) => ({ ...w }))
      const idx = cloned.findIndex((w: any) => w.id === workItem.id)
      if (idx === -1) return
      cloned[idx] = {
        ...cloned[idx],
        transactionChargeId: chargeId,
        ...(opexId ? { opexId } : {}),
        ...(paymentId ? { transactionPaymentId: paymentId } : {}),
        approvedAt: cloned[idx].approvedAt || now,
        approvedBy: cloned[idx].approvedBy || approvedBy,
      }
      transaction.update(ref, { subcontractWorks: cloned, updatedAt: serverTimestamp() })
    })
  } catch (err: any) {
    console.error('Subcontract work post-approval failed:', err)
    try {
      await revertSubcontractWorkFromManagerApproval(jobId, workItem.id)
    } catch (revertErr) {
      console.error('[postSubcontractWorkApproval] Failed to revert manager approval:', revertErr)
    }
    toast.error('Subcontractor ledger update failed', {
      description: err?.message || 'Approval was reverted where possible. Fix the funding account and re-approve.',
    })
  }
}

/**
 * Post approved staff rates to payroll, mark them as posted on the job card,
 * and surface the outcome to the user. Failures are non-fatal: posting is
 * idempotent and unposted rates are retried on the next approval action.
 */
async function postStaffRatesAndReport(
  jobId: string,
  jobIdentifier: string,
  rates: any[],
  _startDate?: string
): Promise<void> {
  const { accrualPayrollEnabled } = await import('@/lib/payroll/client')
  if (accrualPayrollEnabled) return
  try {
    const { postJobEarningsToPayroll, markStaffRatesPosted } =
      await import('../features/jobCards/utils/payrollIntegration')

    // Month targeting uses each rate's approvedAt (final manager approval),
    // not the job start date — see postJobEarningsToPayroll.
    const results = await postJobEarningsToPayroll(jobId, jobIdentifier, rates)
    if (results.length === 0) return

    const succeeded = results.filter(r => r.status === 'posted' || r.status === 'already_posted')
    const posted = results.filter(r => r.status === 'posted')
    const failed = results.filter(r => r.status === 'failed')

    await markStaffRatesPosted(jobId, succeeded.map(r => r.rateId))

    if (posted.length > 0) {
      toast.success(`Posted ${posted.length} staff rate${posted.length > 1 ? 's' : ''} to payroll`, {
        description: posted
          .map(r => `${r.employeeName}: $${r.amount.toLocaleString()} → ${r.month}/${r.year}`)
          .join(' · ')
      })
    } else if (succeeded.length > 0 && failed.length === 0) {
      toast.message('Payroll already up to date for these staff rates')
    }
    for (const f of failed) {
      toast.error(`Payroll posting failed for ${f.employeeName}`, {
        description: `${f.reason || 'Unknown error'}. Use Sync to Payroll to retry.`
      })
    }
  } catch (err: any) {
    console.error('Payroll posting failed:', err)
    toast.error('Payroll posting failed', {
      description: 'The approval was saved. Posting will be retried on the next approval action.'
    })
  }
}

export const useJobCardsStore = create<JobCardsState>((set, get) => ({
  jobCards: [],
  loading: false,
  error: null,
  unsubscribeListener: null,

  fetchJobCards: () => {
    set({ loading: true })
    const q = query(collection(db, 'jobCards'), orderBy('createdAt', 'desc'))

    const unsub = onSnapshot(q, (snapshot) => {
      set({
        jobCards: snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })),
        loading: false
      })
    }, (err) => {
      console.error('Error fetching job cards:', err)
      set({ error: err.message, loading: false })
    })

    set({ unsubscribeListener: unsub })
    return unsub
  },

  createJobCard: async (data) => {
    try {
      console.log('Attempting to create Job Card with data:', data)
      const docRef = await addDoc(collection(db, 'jobCards'), {
        ...data,
        status: 'DRAFT',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })



      return docRef.id
    } catch (err: any) {
      console.error('Store: Error creating job card:', err)
      throw err
    }
  },

  generateJobNumber: async () => {
    try {
      const currentYear = new Date().getFullYear()
      const counterRef = doc(db, 'systemCounters', 'jobCards')

      const nextNumber = await runTransaction(db, async (transaction) => {
        const counterSnap = await transaction.get(counterRef)

        let seq = 1
        if (counterSnap.exists()) {
          const data = counterSnap.data()
          if (data.currentYear === currentYear) {
            seq = (data.sequence || 0) + 1
          }
        }

        transaction.set(counterRef, {
          currentYear,
          sequence: seq,
          lastUpdatedAt: serverTimestamp()
        })
        return seq
      })

      const sequenceStr = String(nextNumber).padStart(4, '0')
      return `JC-${currentYear}-${sequenceStr}`
    } catch (err: any) {
      console.error('Error generating job number:', err)
      throw err
    }
  },

  updateJobCardStatus: async (id, status, approvalEvent) => {
    try {
      const docRef = doc(db, 'jobCards', id)
      const updateData: any = {
        status,
        updatedAt: serverTimestamp()
      }

      if (approvalEvent) {
        const { arrayUnion } = await import('firebase/firestore')
        updateData.approvalTimeline = arrayUnion({
          ...approvalEvent,
          date: new Date().toISOString()
        })
        
        const userName = approvalEvent.user || 'Unknown'
        if (status === 'APPROVED_ACCOUNTANT') {
          updateData.accountantApprovedAt = serverTimestamp()
          updateData.accountantApprovedBy = userName
        } else if (status === 'APPROVED_MANAGER') {
          updateData.managerApprovedAt = serverTimestamp()
          updateData.managerApprovedBy = userName
        } else if (status === 'CLOSED') {
          updateData.closedAt = serverTimestamp()
          updateData.closedBy = userName
        } else if (status === 'REJECTED') {
          updateData.rejectedAt = serverTimestamp()
          updateData.rejectedBy = userName
        }
      }

      await updateDoc(docRef, updateData)
    } catch (err: any) {
      console.error('Error updating status:', err)
      throw err
    }
  },

  approveJobCard: async (id, currentStatus, role, userName) => {
    const isSuper = role === 'SUPER_ADMIN' || role === 'ADMIN'
    const now = new Date().toISOString()

    // Accountant dual-write: APPROVAL_PENDING_ACCOUNTANT → APPROVED_ACCOUNTANT → APPROVAL_PENDING_MANAGER
    if (currentStatus === 'APPROVAL_PENDING_ACCOUNTANT' && (isSuper || role === 'ACCOUNTANT')) {
      await get().updateJobCardStatus(id, 'APPROVED_ACCOUNTANT', {
        user: userName,
        role,
        status: 'Approved by Accountant'
      })
      await get().updateJobCardStatus(id, 'APPROVAL_PENDING_MANAGER', {
        user: 'System',
        role: 'SYSTEM',
        status: 'Pending Manager Approval'
      })
      return
    }

    let nextStatus = currentStatus

    // Strict workflow (matches legacy Vue)
    if (currentStatus === 'DRAFT') {
      nextStatus = 'SUBMITTED'
    } else if (currentStatus === 'SUBMITTED' && (isSuper || role === 'ACCOUNTANT')) {
      nextStatus = 'APPROVAL_PENDING_ACCOUNTANT'
    } else if (currentStatus === 'APPROVAL_PENDING_MANAGER' && (isSuper || role === 'MANAGER')) {
      nextStatus = 'APPROVED_MANAGER'
    } else if (
      (currentStatus === 'APPROVED_MANAGER' || currentStatus === 'COMPLETED') &&
      (isSuper || role === 'MANAGER')
    ) {
      // Close Job Card — lock financials in one step
      nextStatus = 'CLOSED'
    }

    if (nextStatus === currentStatus) {
      throw new Error(`Invalid transition or insufficient permissions for role ${role} at state ${currentStatus}`)
    }

    if (nextStatus === 'CLOSED') {
      const jobSnap = await getDoc(doc(db, 'jobCards', id))
      const jobData: any = jobSnap.exists() ? jobSnap.data() : null
      if (jobData) {
        const updatedSections = jobData.requisitionSections || []
        const updatedAdHoc = jobData.adHocExpenses || []
        const updatedStaffRates = (jobData.staffRates || []).map((r: any) => {
          if (r.approvalStatus === 'APPROVED_ACCOUNTANT' || !r.approvalStatus) {
            requireStaffEarningPeriod(r)
            return { ...r, approvalStatus: 'APPROVED_MANAGER', approvedAt: r.approvedAt || now }
          }
          return r
        })
        const updatedSubcontractWorks = jobData.subcontractWorks || []
        const linkedTotal = Number(jobData.generalInfo?.linkedCrmTotal || 0)
        const financials = computeFinancials(
          updatedSections,
          updatedAdHoc,
          jobData.inventoryReturns || [],
          updatedStaffRates,
          jobData.generalInfo?.referrers || [],
          nextStatus,
          updatedSubcontractWorks,
          jobData.otherServices || [],
          {
            countPendingMaterials: linkedTotal > 0 || Boolean(jobData.generalInfo?.linkedCrmId),
            linkedCrmTotal: linkedTotal,
          },
        )
        const adHocTotal = updatedAdHoc.reduce((sum: number, e: any) => sum + (e.totalAmount || 0), 0)
        const staffRatesTotal = updatedStaffRates.reduce((sum: number, r: any) => sum + (r.jobRateAmount || 0), 0)
        const subcontractWorksTotal = updatedSubcontractWorks.reduce((sum: number, w: any) => sum + (w.totalAmount || 0), 0)
        const implementationCost = adHocTotal + staffRatesTotal + subcontractWorksTotal

        await updateDoc(doc(db, 'jobCards', id), {
          lockedTotalInvoiceValue: financials.totalInvoiceValue,
          lockedImplementationCost: implementationCost,
          closedAt: serverTimestamp(),
          closedBy: userName,
          updatedAt: serverTimestamp()
        })
      }
    }

    await get().updateJobCardStatus(id, nextStatus, {
      user: userName,
      role,
      status: `Approved -> ${nextStatus}`
    })
  },

  rejectJobCard: async (id, role, userName, reason) => {
    await get().updateJobCardStatus(id, 'REJECTED', {
      user: userName,
      role,
      status: 'Rejected',
      comment: reason
    })
  },

  updateJobCardArray: async (jobId, arrayField, updatedArray, actor) => {
    const ref = doc(db, 'jobCards', jobId)
    let previousAdHoc: any[] | null = null
    let jobNumber: string | null = null

    if (arrayField === 'adHocExpenses') {
      try {
        const snap = await getDoc(ref)
        if (snap.exists()) {
          previousAdHoc = snap.data().adHocExpenses || []
          jobNumber = snap.data().generalInfo?.jobNumber || null
        }
      } catch (err) {
        console.warn('[updateJobCardArray] Failed to read prior ad-hoc expenses:', err)
      }
    }

    await updateDoc(ref, {
      [arrayField]: updatedArray,
      updatedAt: serverTimestamp()
    })

    if (arrayField === 'adHocExpenses' && previousAdHoc) {
      try {
        await cascadeRemovedAdHocExpenses({
          jobCardId: jobId,
          jobNumber,
          previous: previousAdHoc,
          next: updatedArray || [],
          deletedBy: actor || null,
          deletedVia: 'SAVE_DIFF',
        })
      } catch (err) {
        console.warn('[updateJobCardArray] Ad-hoc remove cascade failed:', err)
      }
    }
  },

  approveAdHocExpenseFromFinance: async (jobId, itemId, financeStoreRecordFn) => {
    void financeStoreRecordFn
    await postJobExpenseApproval(jobId, itemId)
  },

  approveItem: async (jobId, arrayField, itemId, newStatus, userContext, localItems) => {
    const { isAccountant, isManager, userName } = userContext || {}
    if (!hasApprovalRole(newStatus, isAccountant, isManager)) {
      toast.error('You do not have permission to perform this approval')
      return
    }
    if (newStatus === 'APPROVED_MANAGER' && (arrayField === 'requisitionItems' || arrayField === 'inventoryReturns')) {
      await postJobInventoryLine(jobId, itemId, arrayField === 'inventoryReturns' ? 'RETURN' : 'ISSUE')
      return
    }
    if (newStatus === 'APPROVED_MANAGER' && arrayField === 'adHocExpenses') {
      try {
        const local = (localItems || []).find((item: any) => item.id === itemId)
        const method = normalizeAccountKey(local?.paymentMethod)
        if (method === 'UNKNOWN' || !LIQUID_ACCOUNTS.includes(method)) {
          throw new Error('Select a valid payment account before approval')
        }
        await get().updateJobCardArray(jobId, 'adHocExpenses', localItems || [])
        await postJobExpenseApproval(jobId, itemId)
      } catch (err: any) {
        toast.error(err?.message || 'Expense approval failed')
      }
      return
    }
    if (newStatus === 'APPROVED_ACCOUNTANT' && arrayField === 'adHocExpenses') {
      const local = (localItems || []).find((item: any) => item.id === itemId)
      if (local?.approvalStatus === 'APPROVED_ACCOUNTANT' && isJobCardAdHocAutoEligible(normalizeExpenseTotalAmount(local))) {
        try {
          assertAdHocExpenseCanAutoPost(local)
          // Persist local payment-method edits before server debit (same as manager path).
          await get().updateJobCardArray(jobId, 'adHocExpenses', localItems || [])
          await postAutoJobExpenseApproval(jobId, itemId)
        } catch (err: any) {
          toast.error(err?.message || 'Automatic expense approval failed')
        }
        return
      }
      // First accountant approve for under-$200: block before writing ACCT OK.
      if (
        local &&
        (!local.approvalStatus || local.approvalStatus === 'PENDING') &&
        isJobCardAdHocAutoEligible(normalizeExpenseTotalAmount(local))
      ) {
        try {
          assertAdHocExpenseCanAutoPost(local)
        } catch (err: any) {
          toast.error(err?.message || 'Automatic expense approval failed')
          return
        }
      }
    }
    if (newStatus === 'APPROVED_MANAGER' && arrayField === 'referrers') {
      const local = (localItems || []).find((item: any) => item.id === itemId)
      if (normalizeAccountKey(local?.paymentMethod) === 'RESERVE') {
        try {
          assertSufficientFunds(
            'RESERVE',
            Number(local?.amount || 0),
            useFinanceStore.getState(),
          )
          await postReserveCommissionApproval(jobId, itemId)
        } catch (err: any) {
          toast.error(err?.message || 'Reserve commission approval failed')
        }
        return
      }
    }
    const approvedBy = userName || (isManager ? 'Manager' : isAccountant ? 'Accountant' : 'System')
    const now = new Date().toISOString()
    const ref = doc(db, 'jobCards', jobId)
    const deleteActor = toDeleteActor(userContext)

    // The job card is read FRESH inside a transaction and only the affected
    // array is rewritten. Previously this read the Zustand cache, which goes
    // stale once its listener is torn down (e.g. after leaving the list page),
    // so approving one item silently reverted earlier approvals to PENDING.
    // External side effects (stock, ledger, payroll) are collected during the
    // transaction and executed after it commits, since transactions can retry.
    const runApproval = async () => await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref)
      if (!snap.exists()) throw new Error('Job Card not found')
      const job: any = snap.data()

      const jobNumberOrId = job.generalInfo?.jobNumber || jobId
      const jobIdentifier = job.generalInfo?.jobNumber || jobId.substring(0, 8)
      const result: {
        jobNumberOrId: string
        jobIdentifier: string
        startDate?: string
        stockDeduction?: { inventoryItemId: string; qty: number; unitCost: number }
        stockReturn?: { inventoryItemId: string; qty: number }
        financeExpense?: any
        subcontractWork?: any
        payrollRates?: any[]
        deletedAdHocExpense?: any
      } = { jobNumberOrId, jobIdentifier, startDate: job.generalInfo?.startDate }

      if (arrayField === 'requisitionItems') {
        const localSections = looksLikeRequisitionSections(localItems) ? localItems : undefined
        const localFlat = localSections
          ? flattenRequisitionSections(localSections)
          : localItems
        const mergedSections = mergeRequisitionSections(job.requisitionSections, localSections)
        const hasSections = mergedSections.length > 0 || (job.requisitionSections && job.requisitionSections.length > 0)

        if (hasSections || (localSections && localSections.length > 0)) {
          const clonedSections = (mergedSections.length > 0
            ? mergedSections
            : mergeRequisitionSections(job.requisitionSections || [], localSections)
          )

          if (!findRequisitionLine(clonedSections, itemId)) {
            const flatFallback = mergeRequisitionLines(job.requisitionItems || [], localFlat)
              .find((item: any) => requisitionLineMatches(item, itemId))
            if (flatFallback) {
              if (clonedSections.length === 0) {
                clonedSections.push({
                  id: newRequisitionId(),
                  jobCategoryId: '',
                  description: '',
                  items: [],
                })
              }
              clonedSections[0].items = [...(clonedSections[0].items || []), { ...flatFallback, id: flatFallback.id || itemId || newRequisitionId() }]
            }
          }

          let foundItem: any = null
          if (newStatus === 'REJECTED') {
            clonedSections.forEach((s: any) => {
              s.items = (s.items || []).filter((i: any) => {
                if (requisitionLineMatches(i, itemId)) {
                  foundItem = i
                  return false
                }
                return true
              })
            })
          } else {
            const found = findRequisitionLine(clonedSections, itemId)
            if (found) {
              found.item.approvalStatus = newStatus
              if (newStatus === 'APPROVED_MANAGER') {
                found.item.approvedAt = now
                found.item.approvedBy = approvedBy
              } else if (newStatus === 'APPROVED_ACCOUNTANT') {
                found.item.accountantApprovedAt = now
                found.item.accountantApprovedBy = approvedBy
              }
              foundItem = found.item
            }
          }

          if (!foundItem) throw new Error('Item not found in sections')

          // AUTOMATIC STOCK DEDUCTION (Per Item) — flagged here, executed post-commit
          if (newStatus === 'APPROVED_MANAGER') {
            if (foundItem.inventoryItemId && !foundItem.inventoryDeducted) {
              const qty = Number(foundItem.qtyRequired || foundItem.quantity || 0)
              if (qty > 0) {
                result.stockDeduction = {
                  inventoryItemId: foundItem.inventoryItemId,
                  qty,
                  unitCost: Number(foundItem.costSnapshot || foundItem.unitCost || 0)
                }
                foundItem.inventoryDeducted = true
              }
            }
          }

          const flattenedItems = flattenRequisitionSections(clonedSections)

          transaction.update(ref, stripUndefinedDeep({
            requisitionSections: clonedSections,
            requisitionItems: flattenedItems,
            updatedAt: serverTimestamp()
          }))
        } else {
          let clonedItems = mergeAdHocArrays(job.requisitionItems, localFlat)
          const idx = clonedItems.findIndex((i: any) => i.id === itemId)
          if (idx === -1) throw new Error('Item not found')

          if (newStatus === 'REJECTED') {
            clonedItems = clonedItems.filter((i: any) => i.id !== itemId)
          } else {
            clonedItems[idx].approvalStatus = newStatus
            if (newStatus === 'APPROVED_MANAGER') {
              const item = clonedItems[idx]
              item.approvedAt = now
              item.approvedBy = approvedBy
              if (item.inventoryItemId && !item.inventoryDeducted) {
                const qty = Number(item.qtyRequired || item.quantity || 0)
                if (qty > 0) {
                  result.stockDeduction = {
                    inventoryItemId: item.inventoryItemId,
                    qty,
                    unitCost: Number(item.costSnapshot || item.unitCost || 0)
                  }
                  item.inventoryDeducted = true
                }
              }
            } else if (newStatus === 'APPROVED_ACCOUNTANT') {
              clonedItems[idx].accountantApprovedAt = now
              clonedItems[idx].accountantApprovedBy = approvedBy
            }
          }

          transaction.update(ref, stripUndefinedDeep({
            requisitionItems: clonedItems,
            updatedAt: serverTimestamp()
          }))
        }
      } else if (arrayField === 'adHocExpenses') {
        // Merge unsaved UI rows so accountant Add Row → Approve works without Save
        const clonedArray = mergeAdHocArrays(job.adHocExpenses, localItems)
        const idx = clonedArray.findIndex((i: any) => i.id === itemId)
        if (idx === -1) throw new Error('Expense not found')

        if (newStatus === 'REJECTED') {
          result.deletedAdHocExpense = { ...clonedArray[idx] }
          const filtered = clonedArray.filter((i: any) => i.id !== itemId)
          transaction.update(ref, stripUndefinedDeep({ adHocExpenses: filtered, updatedAt: serverTimestamp() }))
          return result
        }

        const amount = normalizeExpenseTotalAmount(clonedArray[idx])
        const prevStatus = clonedArray[idx].approvalStatus
        const alreadyHasOpex = !!clonedArray[idx].opexId
        clonedArray[idx].totalAmount = amount
        clonedArray[idx].approvalStatus = newStatus

        const finalStatus = clonedArray[idx].approvalStatus
        if (finalStatus === 'APPROVED_MANAGER') {
          clonedArray[idx].approvedAt = now
          clonedArray[idx].approvedBy = approvedBy
        } else if (finalStatus === 'APPROVED_ACCOUNTANT') {
          clonedArray[idx].accountantApprovedAt = now
          clonedArray[idx].accountantApprovedBy = approvedBy
          // Under-$200 accountant approve posts immediately — require funds before ACCT OK.
          if (
            (!prevStatus || prevStatus === 'PENDING') &&
            isJobCardAdHocAutoEligible(amount)
          ) {
            assertAdHocExpenseCanAutoPost(clonedArray[idx])
          }
        }

        // AUTOMATIC LEDGER DEDUCTION — executed post-commit (only on first transition into manager approval)
        if (
          finalStatus === 'APPROVED_MANAGER' &&
          prevStatus !== 'APPROVED_MANAGER' &&
          !alreadyHasOpex
        ) {
          assertSufficientFunds(
            clonedArray[idx].paymentMethod,
            amount,
            useFinanceStore.getState()
          )
          result.financeExpense = { ...clonedArray[idx] }
        }

        transaction.update(ref, stripUndefinedDeep({ adHocExpenses: clonedArray, updatedAt: serverTimestamp() }))
      } else if (arrayField === 'subcontractWorks') {
        const clonedArray = mergeAdHocArrays(job.subcontractWorks, localItems)
        const idx = clonedArray.findIndex((i: any) => i.id === itemId)
        if (idx === -1) throw new Error('Subcontract work not found')

        // SCN-linked rows: payments are approved via the SCN module / ScnPaymentsPanel
        if (clonedArray[idx].isScnLink || clonedArray[idx].subcontractorJobId) {
          throw new Error('Approve SCN payments from the contract payment list, not the row itself')
        }

        if (newStatus === 'REJECTED') {
          const filtered = clonedArray.filter((i: any) => i.id !== itemId)
          transaction.update(ref, stripUndefinedDeep({ subcontractWorks: filtered, updatedAt: serverTimestamp() }))
          return result
        }

        if (!clonedArray[idx].subcontractorId) {
          throw new Error('Select a subcontractor before approving')
        }

        const amount = normalizeExpenseTotalAmount(clonedArray[idx])
        clonedArray[idx].totalAmount = amount
        clonedArray[idx].approvalStatus = newStatus

        const finalStatus = clonedArray[idx].approvalStatus
        if (finalStatus === 'APPROVED_MANAGER') {
          clonedArray[idx].approvedAt = now
          clonedArray[idx].approvedBy = approvedBy
        } else if (finalStatus === 'APPROVED_ACCOUNTANT') {
          clonedArray[idx].accountantApprovedAt = now
          clonedArray[idx].accountantApprovedBy = approvedBy
        }

        if (finalStatus === 'APPROVED_MANAGER' && !clonedArray[idx].transactionChargeId) {
          const method = String(clonedArray[idx].paymentMethod || 'PENDING').toUpperCase()
          if (method !== 'PENDING' && amount > 0) {
            assertSufficientFunds(method, amount, useFinanceStore.getState())
          }
          result.subcontractWork = { ...clonedArray[idx] }
        }

        transaction.update(ref, stripUndefinedDeep({ subcontractWorks: clonedArray, updatedAt: serverTimestamp() }))
      } else if (arrayField === 'inventoryReturns') {
        const clonedArray = (job.inventoryReturns || []).map((i: any) => ({ ...i }))
        const idx = clonedArray.findIndex((i: any) => i.id === itemId)
        if (idx === -1) throw new Error('Return item not found')

        if (newStatus === 'REJECTED') {
          const filtered = clonedArray.filter((i: any) => i.id !== itemId)
          transaction.update(ref, { inventoryReturns: filtered, updatedAt: serverTimestamp() })
          return result
        }

        clonedArray[idx].approvalStatus = newStatus

        if (newStatus === 'APPROVED_MANAGER') {
          const returnItem = clonedArray[idx]
          if (returnItem.inventoryItemId && !returnItem.inventoryReturned) {
            result.stockReturn = {
              inventoryItemId: returnItem.inventoryItemId,
              qty: Number(returnItem.qtyReturned || 0)
            }
            clonedArray[idx].inventoryReturned = true
            clonedArray[idx].approvedAt = now
          }
        }

        transaction.update(ref, { inventoryReturns: clonedArray, updatedAt: serverTimestamp() })
      } else if (arrayField === 'staffRates') {
        const clonedArray = mergeAdHocArrays(job.staffRates, localItems).map((row: any) => ({
          ...row,
          paymentMethod: 'SALARIES',
        }))
        const idx = clonedArray.findIndex((i: any) => i.id === itemId)
        if (idx === -1) throw new Error('Staff rate not found')
        const item = clonedArray[idx]

        if (newStatus === 'REJECTED') {
          if (item.payrollPosted) {
            throw new Error('This staff rate has already been posted to payroll and cannot be rejected')
          }
          const filtered = clonedArray.filter((i: any) => i.id !== itemId)
          transaction.update(ref, stripUndefinedDeep({ staffRates: filtered, updatedAt: serverTimestamp() }))
          return result
        }

        if (!item.employeeId) {
          throw new Error('Assign an employee before approving this staff rate')
        }
        if (!(Number(item.jobRateAmount) > 0)) {
          throw new Error('Staff rate amount must be greater than zero')
        }
        requireStaffEarningPeriod(item)

        // Idempotency guard: re-approving an already-approved rate (e.g. a
        // double-click before the snapshot refreshes) must not re-stamp the
        // item or trigger another payroll posting.
        if (item.approvalStatus !== newStatus) {
          item.approvalStatus = newStatus
          item.paymentMethod = 'SALARIES'
          if (newStatus === 'APPROVED_MANAGER') {
            item.approvedAt = now
            item.approvedBy = approvedBy
          } else if (newStatus === 'APPROVED_ACCOUNTANT') {
            item.accountantApprovedAt = now
            item.accountantApprovedBy = approvedBy
          }
          transaction.update(ref, stripUndefinedDeep({ staffRates: clonedArray, updatedAt: serverTimestamp() }))
        } else if (item.paymentMethod !== 'SALARIES') {
          item.paymentMethod = 'SALARIES'
          transaction.update(ref, stripUndefinedDeep({ staffRates: clonedArray, updatedAt: serverTimestamp() }))
        }

        // Collect every fully-approved rate so posting can reconcile missed or
        // wiped earnings. Posting is idempotent (keyed on a per-rate log doc).
        result.payrollRates = clonedArray.filter(
          (r: any) =>
            r.approvalStatus === 'APPROVED_MANAGER' &&
            !!r.employeeId &&
            Number(r.jobRateAmount) > 0
        )
      } else if (arrayField === 'referrers') {
        const generalInfo = { ...(job.generalInfo || {}) }
        const clonedArray = mergeAdHocArrays(generalInfo.referrers, localItems)
        const idx = clonedArray.findIndex((i: any) => i.id === itemId)
        if (idx === -1) throw new Error('Commission recipient not found')

        if (newStatus === 'REJECTED') {
          const filtered = clonedArray.filter((i: any) => i.id !== itemId)
          transaction.update(ref, stripUndefinedDeep({
            generalInfo: { ...generalInfo, referrers: filtered },
            updatedAt: serverTimestamp()
          }))
          return result
        }

        if (clonedArray[idx].approvalStatus === newStatus) {
          return result
        }

        clonedArray[idx].approvalStatus = newStatus
        if (newStatus === 'APPROVED_MANAGER') {
          clonedArray[idx].approvedAt = now
          clonedArray[idx].approvedBy = approvedBy
        } else if (newStatus === 'APPROVED_ACCOUNTANT') {
          clonedArray[idx].accountantApprovedAt = now
          clonedArray[idx].accountantApprovedBy = approvedBy
        }

        transaction.update(ref, stripUndefinedDeep({
          generalInfo: { ...generalInfo, referrers: clonedArray },
          updatedAt: serverTimestamp()
        }))
      }

      return result
    })

    let effects: Awaited<ReturnType<typeof runApproval>>
    try {
      effects = await runApproval()
    } catch (err: any) {
      console.error('Item approval failed:', err)
      toast.error(err?.message || 'Approval failed')
      return
    }

    if (arrayField === 'adHocExpenses' && newStatus === 'APPROVED_ACCOUNTANT') {
      const local = (localItems || []).find((item: any) => item.id === itemId)
      if (local && isJobCardAdHocAutoEligible(normalizeExpenseTotalAmount(local))) {
        try {
          await postAutoJobExpenseApproval(jobId, itemId)
        } catch (err: any) {
          try {
            await revertAdHocExpenseToPending(jobId, itemId)
          } catch (revertErr) {
            console.error('[approveItem] Failed to revert ACCT OK after auto-post failure:', revertErr)
          }
          toast.error(err?.message || 'Automatic posting failed', {
            description: 'Expense left as Pending so you can pick a funded account and try again.',
          })
        }
      }
    }

    // ── Post-commit side effects ──────────────────────────────────────────
    if (effects.stockDeduction) {
      const inventoryStore = useInventoryStore.getState()
      await inventoryStore.adjustStock(effects.stockDeduction.inventoryItemId, {
        type: 'REMOVE',
        qty: effects.stockDeduction.qty,
        reason: `Item Approved: ${effects.jobNumberOrId}`,
        reference: effects.jobNumberOrId,
        unitCost: effects.stockDeduction.unitCost
      })
    }

    if (effects.stockReturn) {
      const inventoryStore = useInventoryStore.getState()
      await inventoryStore.adjustStock(effects.stockReturn.inventoryItemId, {
        type: 'ADD',
        qty: effects.stockReturn.qty,
        reason: `Return from Job ${effects.jobIdentifier}`,
        reference: jobId
      })
    }

    if (effects.financeExpense) {
      try {
        const expenseItem = effects.financeExpense
        const financeStore = useFinanceStore.getState()
        const opexId = await financeStore.recordExpense({
          category: 'Job Card Expense',
          amount: Number(expenseItem.totalAmount || 0),
          paymentMethod: normalizeAccountKey(expenseItem.paymentMethod),
          description: `Job Card ${effects.jobIdentifier} - ${expenseItem.description || 'Ad-hoc expense'}`,
          attachmentUrl: expenseItem.attachmentUrl || null,
          attachmentUrls: expenseItem.attachmentUrls || (expenseItem.attachmentUrl ? [expenseItem.attachmentUrl] : []),
          status: 'APPROVED',
          sourceJobId: jobId,
          sourceItemId: itemId
        })
        if (opexId) {
          try {
            await stampAdHocOpexId(jobId, itemId, opexId)
          } catch (err) {
            console.error('[approveItem] Failed to stamp opexId:', err)
          }
        }
      } catch (err: any) {
        console.error('[approveItem] Failed to post OPEX:', err)
        toast.error(err?.message || 'Failed to post expense to ledger')
      }
    }

    if (effects.subcontractWork) {
      await postSubcontractWorkApproval(jobId, effects.jobIdentifier, effects.subcontractWork, approvedBy, now)
    }

    if (effects.payrollRates && effects.payrollRates.length > 0) {
      await postStaffRatesAndReport(jobId, effects.jobIdentifier, effects.payrollRates, effects.startDate)
    }

    if (effects.deletedAdHocExpense) {
      try {
        await cascadeDeleteAdHocExpense({
          jobCardId: jobId,
          jobNumber: effects.jobIdentifier,
          expense: effects.deletedAdHocExpense,
          deletedBy: deleteActor,
          deletedVia: 'REJECT',
          skipArrayUpdate: true,
        })
      } catch (err) {
        console.error('[approveItem] Ad-hoc reject cascade failed:', err)
      }
    }
  },

  approveAllItems: async (jobId, arrayField, targetStatus, userContext, localItems) => {
    const { isAccountant, isManager, userName } = userContext || {}
    if (!hasApprovalRole(targetStatus, isAccountant, isManager)) {
      toast.error('You do not have permission to perform this approval')
      return
    }
    if (targetStatus === 'APPROVED_MANAGER' && (arrayField === 'requisitionItems' || arrayField === 'inventoryReturns')) {
      return postAllJobInventoryLines(jobId, arrayField === 'inventoryReturns' ? 'RETURN' : 'ISSUE')
    }
    if (targetStatus === 'APPROVED_MANAGER' && arrayField === 'adHocExpenses') {
      try {
        const pendingRows = (localItems || []).filter((item: any) => item.approvalStatus === 'APPROVED_ACCOUNTANT' && !isJobCardAdHocAutoEligible(normalizeExpenseTotalAmount(item)))
        for (const row of pendingRows) {
          const method = normalizeAccountKey(row.paymentMethod)
          if (method === 'UNKNOWN' || !LIQUID_ACCOUNTS.includes(method)) {
            throw new Error(`Select a valid payment account before approving ${row.description || 'this expense'}`)
          }
          assertSufficientFunds(method, normalizeExpenseTotalAmount(row), useFinanceStore.getState())
        }
        await get().updateJobCardArray(jobId, 'adHocExpenses', localItems || [])
        for (const row of pendingRows) {
          if (!row.id) throw new Error('Cannot approve an expense without a stable row ID')
          await postJobExpenseApproval(jobId, row.id)
        }
      } catch (err: any) {
        console.error('Bulk ad-hoc expense approval failed:', err)
        toast.error(err?.message || 'Bulk expense approval failed')
      }
      return
    }
    if (targetStatus === 'APPROVED_MANAGER' && arrayField === 'referrers') {
      const eligible = (localItems || []).filter(
        (item: any) => item.approvalStatus === 'APPROVED_ACCOUNTANT'
      )
      const failures: Array<{ name: string; reason: string }> = []
      for (const item of eligible) {
        try {
          if (normalizeAccountKey(item.paymentMethod) === 'RESERVE') {
            assertSufficientFunds('RESERVE', Number(item.amount || 0), useFinanceStore.getState())
            await postReserveCommissionApproval(jobId, item.id)
          } else {
            await get().approveItem(jobId, 'referrers', item.id, targetStatus, userContext, localItems)
          }
        } catch (err: any) {
          failures.push({ name: item.name || 'Commission recipient', reason: err?.message || 'Approval failed' })
        }
      }
      failures.forEach((failure) => {
        toast.error(`Could not approve ${failure.name}`, { description: failure.reason })
      })
      return
    }
    const localInventoryRows = arrayField === 'requisitionItems'
      ? (looksLikeRequisitionSections(localItems) ? flattenRequisitionSections(localItems || []) : (localItems || []))
      : []
    const eligibleInventoryCount = targetStatus === 'APPROVED_ACCOUNTANT'
      ? localInventoryRows.filter((item: any) => !item.approvalStatus || item.approvalStatus === 'PENDING').length
      : 0
    const approvedBy = userName || (isManager ? 'Manager' : isAccountant ? 'Accountant' : 'System')
    const now = new Date().toISOString()
    const ref = doc(db, 'jobCards', jobId)

    const applyBulkStatus = (item: any) => {
      const alreadyApproved = item.approvalStatus === 'APPROVED_MANAGER'
      const needsManager = targetStatus === 'APPROVED_MANAGER' && item.approvalStatus === 'APPROVED_ACCOUNTANT'
      const needsAccountant = targetStatus === 'APPROVED_ACCOUNTANT' && (!item.approvalStatus || item.approvalStatus === 'PENDING')

      if (!alreadyApproved && (needsManager || needsAccountant)) {
        const updatedItem = { ...item, approvalStatus: targetStatus }
        if (targetStatus === 'APPROVED_MANAGER') {
          updatedItem.approvedAt = now
          updatedItem.approvedBy = approvedBy
        } else if (targetStatus === 'APPROVED_ACCOUNTANT') {
          updatedItem.accountantApprovedAt = now
          updatedItem.accountantApprovedBy = approvedBy
        }
        return updatedItem
      }
      return { ...item }
    }

    // Fresh transactional read-modify-write — see approveItem for rationale.
    let effects: {
      jobNumberOrId: string
      jobIdentifier: string
      startDate?: string
      stockDeductions: Array<{ inventoryItemId: string; qty: number; unitCost: number }>
      financeExpenses: any[]
      subcontractWorks: any[]
      payrollRates: any[]
    }
    try {
      effects = await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref)
      if (!snap.exists()) throw new Error('Job Card not found')
      const job: any = snap.data()

      const jobNumberOrId = job.generalInfo?.jobNumber || jobId
      const jobIdentifier = job.generalInfo?.jobNumber || jobId.substring(0, 8)
      const result: {
        jobNumberOrId: string
        jobIdentifier: string
        startDate?: string
        stockDeductions: Array<{ inventoryItemId: string; qty: number; unitCost: number }>
        financeExpenses: any[]
        subcontractWorks: any[]
        payrollRates: any[]
      } = {
        jobNumberOrId,
        jobIdentifier,
        startDate: job.generalInfo?.startDate,
        stockDeductions: [],
        financeExpenses: [],
        subcontractWorks: [],
        payrollRates: []
      }

      const collectDeduction = (item: any) => {
        if (item.approvalStatus === 'APPROVED_MANAGER' && item.inventoryItemId && !item.inventoryDeducted) {
          const qty = Number(item.qtyRequired || item.quantity || 0)
          if (qty > 0) {
            result.stockDeductions.push({
              inventoryItemId: item.inventoryItemId,
              qty,
              unitCost: Number(item.costSnapshot || item.unitCost || 0)
            })
            item.inventoryDeducted = true
          }
        }
      }

      if (arrayField === 'requisitionItems') {
        const localSections = looksLikeRequisitionSections(localItems) ? localItems : undefined
        const localFlat = localSections
          ? flattenRequisitionSections(localSections)
          : localItems
        const mergedSections = mergeRequisitionSections(job.requisitionSections, localSections)
        const hasSections = mergedSections.length > 0 || (job.requisitionSections && job.requisitionSections.length > 0)

        if (hasSections || (localSections && localSections.length > 0)) {
          const clonedSections = (mergedSections.length > 0
            ? mergedSections
            : mergeRequisitionSections(job.requisitionSections || [], localSections)
          ).map((s: any) => ({
            ...s,
            items: (s.items || []).map(applyBulkStatus)
          }))

          clonedSections.forEach((s: any) => s.items.forEach(collectDeduction))

          const flattenedItems = flattenRequisitionSections(clonedSections)

          transaction.update(ref, stripUndefinedDeep({
            requisitionSections: clonedSections,
            requisitionItems: flattenedItems,
            updatedAt: serverTimestamp()
          }))
        } else {
          const clonedItems = mergeAdHocArrays(job.requisitionItems, localFlat).map(applyBulkStatus)
          clonedItems.forEach(collectDeduction)

          transaction.update(ref, stripUndefinedDeep({
            requisitionItems: clonedItems,
            updatedAt: serverTimestamp()
          }))
        }
      } else if (arrayField === 'adHocExpenses') {
        const merged = mergeAdHocArrays(job.adHocExpenses, localItems)
        // Block bulk accountant approve for under-$200 rows that cannot post.
        if (targetStatus === 'APPROVED_ACCOUNTANT') {
          for (const item of merged) {
            const needsAccountant = !item.approvalStatus || item.approvalStatus === 'PENDING'
            if (!needsAccountant) continue
            if (!isJobCardAdHocAutoEligible(normalizeExpenseTotalAmount(item))) continue
            assertAdHocExpenseCanAutoPost(item)
          }
        }
        const clonedExpenses = merged.map((item: any) => {
          const alreadyApproved = item.approvalStatus === 'APPROVED_MANAGER'
          const needsManager = targetStatus === 'APPROVED_MANAGER' && item.approvalStatus === 'APPROVED_ACCOUNTANT'
          const needsAccountant = targetStatus === 'APPROVED_ACCOUNTANT' && (!item.approvalStatus || item.approvalStatus === 'PENDING')

          if (!alreadyApproved && (needsManager || needsAccountant)) {
            const updatedStatus = targetStatus
            const amount = normalizeExpenseTotalAmount(item)
            const updatedItem = { ...item, totalAmount: amount, approvalStatus: updatedStatus }
            if (updatedStatus === 'APPROVED_MANAGER') {
              updatedItem.approvedAt = now
              updatedItem.approvedBy = approvedBy
            } else if (updatedStatus === 'APPROVED_ACCOUNTANT') {
              updatedItem.accountantApprovedAt = now
              updatedItem.accountantApprovedBy = approvedBy
            }
            return updatedItem
          }
          return { ...item, totalAmount: normalizeExpenseTotalAmount(item) }
        })

        const pendingFinance = clonedExpenses.filter(
          (e: any) =>
            e.approvalStatus === 'APPROVED_MANAGER' &&
            e.approvedAt === now &&
            !e.opexId
        )
        for (const e of pendingFinance) {
          assertSufficientFunds(
            e.paymentMethod,
            Number(e.totalAmount || 0),
            useFinanceStore.getState()
          )
        }

        transaction.update(ref, stripUndefinedDeep({ adHocExpenses: clonedExpenses, updatedAt: serverTimestamp() }))
        result.financeExpenses = pendingFinance
      } else if (arrayField === 'subcontractWorks') {
        const merged = mergeAdHocArrays(job.subcontractWorks, localItems)
        const clonedWorks = merged.map((item: any) => {
          // SCN links: payments approved via ScnPaymentsPanel — skip bulk row approval
          if (item.isScnLink || item.subcontractorJobId) return { ...item }

          const alreadyApproved = item.approvalStatus === 'APPROVED_MANAGER'
          const needsManager = targetStatus === 'APPROVED_MANAGER' && item.approvalStatus === 'APPROVED_ACCOUNTANT'
          const needsAccountant = targetStatus === 'APPROVED_ACCOUNTANT' && (!item.approvalStatus || item.approvalStatus === 'PENDING')

          if (!alreadyApproved && (needsManager || needsAccountant)) {
            if (!item.subcontractorId) return { ...item }
            let updatedStatus = targetStatus
            const amount = normalizeExpenseTotalAmount(item)
            const updatedItem = { ...item, totalAmount: amount, approvalStatus: updatedStatus }
            if (updatedStatus === 'APPROVED_MANAGER') {
              updatedItem.approvedAt = now
              updatedItem.approvedBy = approvedBy
            } else if (updatedStatus === 'APPROVED_ACCOUNTANT') {
              updatedItem.accountantApprovedAt = now
              updatedItem.accountantApprovedBy = approvedBy
            }
            return updatedItem
          }
          return { ...item, totalAmount: normalizeExpenseTotalAmount(item) }
        })

        const pendingSubWorks = clonedWorks.filter(
          (e: any) =>
            e.approvalStatus === 'APPROVED_MANAGER' &&
            e.approvedAt === now &&
            !e.transactionChargeId &&
            !!e.subcontractorId &&
            !e.isScnLink &&
            !e.subcontractorJobId
        )
        for (const e of pendingSubWorks) {
          const method = String(e.paymentMethod || 'PENDING').toUpperCase()
          const amt = Number(e.totalAmount || 0)
          if (method !== 'PENDING' && amt > 0) {
            assertSufficientFunds(method, amt, useFinanceStore.getState())
          }
        }

        transaction.update(ref, stripUndefinedDeep({ subcontractWorks: clonedWorks, updatedAt: serverTimestamp() }))
        result.subcontractWorks = pendingSubWorks
      } else if (arrayField === 'staffRates') {
        // Rates without an employee or a positive amount are left untouched
        // rather than approved with unpostable data.
        const clonedRates = mergeAdHocArrays(job.staffRates, localItems).map((item: any) => {
          const withSalaries = { ...item, paymentMethod: 'SALARIES' }
          const valid = !!withSalaries.employeeId && Number(withSalaries.jobRateAmount) > 0
          if (valid && !withSalaries.payrollPosted) requireStaffEarningPeriod(withSalaries)
          return valid ? applyBulkStatus(withSalaries) : withSalaries
        })

        transaction.update(ref, stripUndefinedDeep({ staffRates: clonedRates, updatedAt: serverTimestamp() }))

        // Every fully-approved rate is collected so missed/wiped earnings are
        // reconciled. Posting is idempotent (per-rate log docs).
        result.payrollRates = clonedRates.filter(
          (r: any) =>
            r.approvalStatus === 'APPROVED_MANAGER' &&
            !!r.employeeId &&
            Number(r.jobRateAmount) > 0
        )
      } else if (arrayField === 'referrers') {
        const generalInfo = { ...(job.generalInfo || {}) }
        const clonedReferrers = mergeAdHocArrays(generalInfo.referrers, localItems).map(applyBulkStatus)
        transaction.update(ref, stripUndefinedDeep({
          generalInfo: { ...generalInfo, referrers: clonedReferrers },
          updatedAt: serverTimestamp()
        }))
      }

      return result
    })
    } catch (err: any) {
      console.error('Bulk approval failed:', err)
      if (arrayField === 'requisitionItems') throw err
      toast.error(err?.message || 'Bulk approval failed')
      return
    }

    // ── Post-commit side effects ──────────────────────────────────────────
    if (arrayField === 'adHocExpenses' && targetStatus === 'APPROVED_ACCOUNTANT') {
      const eligible = (localItems || []).filter((row: any) =>
        (!row.approvalStatus || row.approvalStatus === 'PENDING' || row.approvalStatus === 'APPROVED_ACCOUNTANT') &&
        isJobCardAdHocAutoEligible(normalizeExpenseTotalAmount(row))
      )
      const failures: string[] = []
      if (eligible.length > 0) {
        try {
          for (const row of eligible) {
            assertAdHocExpenseCanAutoPost(row)
          }
          // Persist any local payment-method edits before auto-posting.
          await get().updateJobCardArray(jobId, 'adHocExpenses', localItems || [])
        } catch (err: any) {
          for (const row of eligible) {
            try {
              await revertAdHocExpenseToPending(jobId, row.id)
            } catch (revertErr) {
              console.error('[approveAllItems] Failed to revert after pre-post check:', revertErr)
            }
          }
          toast.error(err?.message || 'Could not save expense payment methods before posting', {
            description: 'Expenses left as Pending where possible so you can pick a funded account.',
          })
          return
        }
      }
      for (const row of eligible) {
        try {
          await postAutoJobExpenseApproval(jobId, row.id)
        } catch (err: any) {
          try {
            await revertAdHocExpenseToPending(jobId, row.id)
          } catch (revertErr) {
            console.error('[approveAllItems] Failed to revert ACCT OK after auto-post failure:', revertErr)
          }
          failures.push(`${row.description || row.id}: ${err?.message || 'Posting failed'}`)
        }
      }
      if (failures.length) toast.error(`${failures.length} expense(s) could not be posted`, {
        description: `${failures.join('; ')}. Reverted to Pending where possible.`,
      })
    }
    if (effects.stockDeductions.length > 0) {
      const inventoryStore = useInventoryStore.getState()
      for (const deduction of effects.stockDeductions) {
        try {
          await inventoryStore.adjustStock(deduction.inventoryItemId, {
            type: 'REMOVE',
            qty: deduction.qty,
            reason: `Bulk Item Approval: ${effects.jobNumberOrId}`,
            reference: effects.jobNumberOrId,
            unitCost: deduction.unitCost
          })
        } catch (err) {
          console.error(err)
        }
      }
    }

    if (effects.financeExpenses.length > 0) {
      const financeStore = useFinanceStore.getState()
      for (const expenseItem of effects.financeExpenses) {
        try {
          const opexId = await financeStore.recordExpense({
            category: 'Job Card Expense',
            amount: Number(expenseItem.totalAmount || 0),
            paymentMethod: normalizeAccountKey(expenseItem.paymentMethod),
            description: `Job Card ${effects.jobIdentifier} - ${expenseItem.description || 'Ad-hoc expense'}`,
            attachmentUrl: expenseItem.attachmentUrl || null,
            attachmentUrls: expenseItem.attachmentUrls || (expenseItem.attachmentUrl ? [expenseItem.attachmentUrl] : []),
            status: 'APPROVED',
            sourceJobId: jobId,
            sourceItemId: expenseItem.id,
            accountantApprovedBy: expenseItem.accountantApprovedBy || approvedBy || 'Accountant',
            accountantApprovedAt: expenseItem.accountantApprovedAt || now,
            managerApprovedBy: expenseItem.approvedBy || approvedBy || 'Manager',
            managerApprovedAt: expenseItem.approvedAt || now
          })
          if (opexId && expenseItem.id) {
            await stampAdHocOpexId(jobId, expenseItem.id, opexId)
          }
        } catch (err: any) {
          console.error(err)
          toast.error(err?.message || 'Failed to post expense to ledger')
        }
      }
    }

    if (effects.subcontractWorks.length > 0) {
      for (const workItem of effects.subcontractWorks) {
        await postSubcontractWorkApproval(jobId, effects.jobIdentifier, workItem, approvedBy, now)
      }
    }

    if (effects.payrollRates.length > 0) {
      await postStaffRatesAndReport(jobId, effects.jobIdentifier, effects.payrollRates, effects.startDate)
    }

    if (arrayField === 'requisitionItems' && targetStatus === 'APPROVED_ACCOUNTANT') {
      return {
        eligible: eligibleInventoryCount,
        approved: eligibleInventoryCount,
        alreadyPosted: 0,
        failed: [],
      }
    }
  },

  syncStaffRatesToPayroll: async (jobId) => {
    const { accrualPayrollEnabled } = await import('@/lib/payroll/client')
    if (accrualPayrollEnabled) {
      toast.message('Staff rates post from HR on the 15th')
      return
    }
    try {
      const snap = await getDoc(doc(db, 'jobCards', jobId))
      if (!snap.exists()) {
        toast.error('Job card not found')
        return
      }
      const job: any = snap.data()
      const rates = (job.staffRates || [])
        .filter(
          (r: any) =>
            r.approvalStatus === 'APPROVED_MANAGER' &&
            !!r.employeeId &&
            Number(r.jobRateAmount) > 0
        )
        .map((r: any) => ({ ...r, paymentMethod: 'SALARIES' }))
      if (rates.length === 0) {
        toast.message('No approved staff rates to sync')
        return
      }
      // Coerce funding account on the job card so old Cash/Bank/EcoCash rows stick to Salaries.
      const normalizedStaffRates = (job.staffRates || []).map((r: any) => ({
        ...r,
        paymentMethod: 'SALARIES',
      }))
      await updateDoc(doc(db, 'jobCards', jobId), {
        staffRates: normalizedStaffRates,
        updatedAt: serverTimestamp(),
      })
      const jobIdentifier = job.generalInfo?.jobNumber || jobId.substring(0, 8)
      await postStaffRatesAndReport(jobId, jobIdentifier, rates, job.generalInfo?.startDate)
    } catch (err: any) {
      console.error('Staff rate payroll sync failed:', err)
      toast.error('Payroll sync failed', { description: err?.message || 'Please try again.' })
    }
  },

  deleteAdHocExpense: async (jobId, expense, actor) => {
    if (!jobId || !expense?.id) return
    const ref = doc(db, 'jobCards', jobId)

    const { snapshot, jobNumber } = await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref)
      if (!snap.exists()) throw new Error('Job Card not found')
      const job: any = snap.data()
      const existing = job.adHocExpenses || []
      const target = existing.find((e: any) => e.id === expense.id) || expense
      const filtered = existing.filter((e: any) => e.id !== expense.id)
      transaction.update(ref, stripUndefinedDeep({
        adHocExpenses: filtered,
        updatedAt: serverTimestamp(),
      }))
      return {
        snapshot: { ...target },
        jobNumber: job.generalInfo?.jobNumber || null,
      }
    })

    await cascadeDeleteAdHocExpense({
      jobCardId: jobId,
      jobNumber,
      expense: snapshot,
      deletedBy: actor || null,
      deletedVia: 'TRASH',
      skipArrayUpdate: true,
    })
  },

  updateFullJobCard: async (id, payload, actor) => {
    try {
      const docRef = doc(db, 'jobCards', id)
      const updateData: any = {
        updatedAt: serverTimestamp()
      }

      const fields = [
        'generalInfo',
        'requisitionItems',
        'requisitionSections',
        'adHocExpenses',
        'subcontractWorks',
        'inventoryReturns',
        'staffRates',
        'allocatedTools',
        'totals',
        'summary',
        'status',
        'jobChecklists'
      ]

      fields.forEach(field => {
        if (payload[field] !== undefined) {
          updateData[field] = payload[field]
        }
      })

      // Staff rates already posted to payroll are immutable: whole-array
      // saves (possibly from stale local state) must not change or drop them,
      // or payroll and the job card silently diverge.
      let previousAdHoc: any[] | null = null
      let jobNumberForAudit: string | null = null

      if (Array.isArray(updateData.adHocExpenses) || Array.isArray(updateData.staffRates)) {
        const snap = await getDoc(docRef)
        if (snap.exists()) {
          const data = snap.data()
          previousAdHoc = data.adHocExpenses || []
          jobNumberForAudit = data.generalInfo?.jobNumber || null

          if (Array.isArray(updateData.staffRates)) {
            const existingPosted: any[] = (data.staffRates || []).filter((r: any) => r.payrollPosted)

            if (existingPosted.length > 0) {
              const postedById = new Map(existingPosted.map((r: any) => [r.id, r]))
              const incoming: any[] = updateData.staffRates
              const incomingIds = new Set(incoming.map((r: any) => r.id))

              const merged = incoming.map((r: any) => postedById.get(r.id) || r)
              const removedPosted = existingPosted.filter((r: any) => !incomingIds.has(r.id))
              const restored = [...merged, ...removedPosted]

              const changed =
                removedPosted.length > 0 ||
                incoming.some((r: any) => {
                  const original = postedById.get(r.id)
                  return original && JSON.stringify(original) !== JSON.stringify(r)
                })
              if (changed) {
                toast.warning('Some staff rates are already posted to payroll and were left unchanged')
              }

              updateData.staffRates = restored
            }
          }
        }
      }

      await updateDoc(docRef, updateData)

      if (Array.isArray(updateData.adHocExpenses) && previousAdHoc) {
        try {
          await cascadeRemovedAdHocExpenses({
            jobCardId: id,
            jobNumber: jobNumberForAudit,
            previous: previousAdHoc,
            next: updateData.adHocExpenses,
            deletedBy: actor || null,
            deletedVia: 'SAVE_DIFF',
          })
        } catch (err) {
          console.warn('[updateFullJobCard] Ad-hoc remove cascade failed:', err)
        }
      }
    } catch (err: any) {
      console.error('Error updating full job card:', err)
      throw err
    }
  },

  deleteJobCardCascade: async (id, currentStatus, isAdmin = false) => {
    if (!isAdmin && (currentStatus === 'APPROVED_MANAGER' || currentStatus === 'COMPLETED')) {
      throw new Error('Cannot delete a fully approved Job Card. It must be voided to maintain ledger integrity.')
    }

    try {
      const batch = writeBatch(db)

      const itemsSnap = await getDocs(collection(db, 'jobCards', id, 'items'))
      itemsSnap.forEach(docSnap => batch.delete(docSnap.ref))

      const expensesSnap = await getDocs(collection(db, 'jobCards', id, 'expenses'))
      expensesSnap.forEach(docSnap => batch.delete(docSnap.ref))

      const paymentsQ = query(collection(db, 'jobPayments'), where('jobCardId', '==', id))
      const paymentsSnap = await getDocs(paymentsQ)
      paymentsSnap.forEach(docSnap => batch.delete(docSnap.ref))

      const opexQ = query(collection(db, 'operationalExpenses'), where('sourceJobId', '==', id))
      const opexSnap = await getDocs(opexQ)
      opexSnap.forEach(docSnap => batch.delete(docSnap.ref))

      batch.delete(doc(db, 'jobCards', id))
      await batch.commit()

      try {
        await useSubcontractorsStore.getState().voidTransactionsForJobCard(id)
      } catch (voidErr) {
        console.warn('Failed to void subcontractor transactions:', voidErr)
      }

      set((state) => ({
        jobCards: state.jobCards.filter(j => j.id !== id)
      }))
    } catch (err: any) {
      console.error('Error deleting job card cascade:', err)
      throw err
    }
  },

  lockApprovedItems: async (id, type) => {
    try {
      const docRef = doc(db, 'jobCards', id)
      const docSnap = await getDocs(query(collection(db, 'jobCards'), where('__name__', '==', id)))
      if (docSnap.empty) throw new Error('Job Card not found')

      const snapDoc = docSnap.docs[0]
      if (!snapDoc) throw new Error('Job Card document not found')
      const data = snapDoc.data()
      const updateData: any = { updatedAt: serverTimestamp() }

      if (type === 'inventory') {
        const sections = data.requisitionSections || []
        const items = data.requisitionItems || []

        updateData.requisitionSections = sections.map((s: any) => ({
          ...s,
          items: s.items.map((i: any) => i.approvalStatus === 'APPROVED_MANAGER' ? { ...i, isLockedAgainstPdf: true } : i)
        }))
        updateData.requisitionItems = items.map((i: any) => i.approvalStatus === 'APPROVED_MANAGER' ? { ...i, isLockedAgainstPdf: true } : i)
      } else {
        const expenses = data.adHocExpenses || []
        updateData.adHocExpenses = expenses.map((e: any) => e.approvalStatus === 'APPROVED_MANAGER' ? { ...e, isLockedAgainstPdf: true } : e)
        const works = data.subcontractWorks || []
        updateData.subcontractWorks = works.map((e: any) => e.approvalStatus === 'APPROVED_MANAGER' ? { ...e, isLockedAgainstPdf: true } : e)
      }

      await updateDoc(docRef, updateData)

      if (type === 'expenses') {
        try {
          const q = query(collection(db, 'operationalExpenses'), where('sourceJobId', '==', id))
          const opexSnap = await getDocs(q)
          const batch = writeBatch(db)
          let count = 0
          
          opexSnap.forEach(d => {
            const opexData = d.data()
            if (opexData.sourceItemId) {
              const isRecentlyLocked = updateData.adHocExpenses.some((e: any) => e.id === opexData.sourceItemId && e.isLockedAgainstPdf)
              if (isRecentlyLocked) {
                batch.update(d.ref, { pdfGenerated: true, pdfLockedAt: serverTimestamp() })
                count++
              }
            }
          })
          
          if (count > 0) await batch.commit()
        } catch (err) {
          console.warn('Cross-module locking partially failed:', err)
        }
      }
    } catch (err: any) {
      console.error(`Error locking ${type}:`, err)
      throw err
    }
  },

  duplicateJobCard: async (sourceId, submittedBy) => {
    const sourceSnap = await getDoc(doc(db, 'jobCards', sourceId))
    if (!sourceSnap.exists()) throw new Error('Source job card not found')
    const src = sourceSnap.data()

    const newJobNumber = await get().generateJobNumber()

    const generalInfo = {
      ...(src.generalInfo || {}),
      jobNumber: newJobNumber,
      recipientName: '',
      recipientAddress: '',
      recipientPhone: '',
      receiptNumber: '',
      ecocashOrBankAccount: '',
      referrers: (src.generalInfo?.referrers || []).map((ref: any) => ({
        id: `ref_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: ref.name || '',
        amount: Number(ref.amount) || 0,
        paymentMethod: ref.paymentMethod || 'CASH',
        approvalStatus: 'PENDING',
        createdAt: new Date().toISOString()
      }))
    }

    const inventoryMap = new Map()
    try {
      const invSnap = await getDocs(collection(db, 'inventoryItems'))
      invSnap.docs.forEach(d => {
        const data = d.data()
        const cost = Number(data.totalCost ?? (Number(data.purchasePrice ?? 0) + Number(data.freightDuty ?? 0)))
        inventoryMap.set(d.id, cost)
      })
    } catch (err) {
      console.warn('Could not fetch inventory items for cost healing on duplication:', err)
    }

    const requisitionSections = (src.requisitionSections || []).map((s: any) => ({
      ...s,
      id: crypto.randomUUID(),
      items: (s.items || []).map((item: any) => {
        const { approvalStatus, isLockedAgainstPdf, ...rest } = item
        let resolvedCost = Number(item.costSnapshot || 0)
        if (item.inventoryItemId && resolvedCost === 0) {
          resolvedCost = inventoryMap.get(item.inventoryItemId) || 0
        }
        return { ...rest, id: crypto.randomUUID(), approvalStatus: 'PENDING', costSnapshot: resolvedCost }
      })
    }))

    const requisitionItems = requisitionSections.flatMap((s: any) =>
      (s.items || []).map((item: any) => ({ ...item, jobCategoryId: s.jobCategoryId || '' }))
    )

    const adHocExpenses = (src.adHocExpenses || []).map((e: any) => {
      const { approvalStatus, isLockedAgainstPdf, ...rest } = e
      return { ...rest, id: crypto.randomUUID(), approvalStatus: 'PENDING' }
    })

    const staffRates = (src.staffRates || []).map((r: any) => {
      const { approvalStatus, isLockedAgainstPdf, ...rest } = r
      return { ...rest, id: crypto.randomUUID(), approvalStatus: 'PENDING' }
    })

    const subcontractWorks = (src.subcontractWorks || []).map((w: any) => {
      const {
        approvalStatus,
        isLockedAgainstPdf,
        transactionChargeId,
        opexId,
        transactionPaymentId,
        ...rest
      } = w
      return { ...rest, id: crypto.randomUUID(), approvalStatus: 'PENDING' }
    })

    const newRef = doc(collection(db, 'jobCards'))
    await writeBatch(db).set(newRef, {
      status: 'SUBMITTED',
      generalInfo,
      submittedBy,
      requisitionSections,
      requisitionItems,
      adHocExpenses,
      subcontractWorks,
      staffRates,
      allocatedTools: [],
      inventoryReturns: [],
      totals: src.totals || {},
      summary: src.summary || {},
      duplicatedFrom: sourceId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }).commit()

    return newRef.id
  },

  cleanup: () => {
    if (get().unsubscribeListener) {
      get().unsubscribeListener?.()
      set({ unsubscribeListener: null })
    }
  }
}))
