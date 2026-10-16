/* eslint-disable @typescript-eslint/no-explicit-any */
import { create } from 'zustand'
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  where,
  serverTimestamp,
  getDocs,
  getDoc,
  writeBatch,
  runTransaction,
  type Unsubscribe,
} from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
import type {
  Subcontractor,
  SubcontractorTransaction,
  SubcontractorPaymentTerms,
  SubcontractorStatus,
  SubcontractorJob,
  SubcontractorJobPayment,
  SubcontractorJobStatus,
  SubcontractWork,
} from '@/features/subcontractors/types'

type SubcontractorInput = Omit<Subcontractor, 'id' | 'createdAt' | 'updatedAt'>

const paymentCreatedAtMillis = (value: SubcontractorJobPayment['createdAt']): number => {
  if (!value) return 0
  return typeof value === 'string' ? new Date(value).getTime() : value.toMillis()
}

interface RecordTxInput {
  subcontractorId: string
  subcontractorName: string
  amount: number
  description: string
  jobCardId?: string | null
  jobCardNumber?: string | null
  sourceItemId?: string | null
  subcontractorJobId?: string | null
  contractNumber?: string | null
  opexId?: string | null
  paymentMethod?: string | null
  paymentRef?: string | null
  attachmentUrls?: string[]
  createdBy: string
  createdByName?: string
}

interface RecordPaymentWithOpexInput extends RecordTxInput {
  postOpex?: boolean
}

interface CreateJobInput {
  subcontractorId: string
  subcontractorName: string
  description: string
  contractValue: number
  createdBy: string
  createdByName?: string
  status?: SubcontractorJobStatus
}

interface RecordJobPaymentInput {
  subcontractorJobId: string
  amount: number
  paymentMethod: string
  paymentRef?: string
  description?: string
  attachmentUrls?: string[]
  createdBy: string
  createdByName?: string
}

interface RecordDirectPaymentInput {
  subcontractorId: string
  subcontractorName: string
  amount: number
  paymentMethod: string
  paymentRef?: string
  description?: string
  attachmentUrls?: string[]
  jobCardId?: string | null
  jobCardNumber?: string | null
  createdBy: string
  createdByName?: string
}

interface SubcontractorsState {
  subcontractors: Subcontractor[]
  transactions: SubcontractorTransaction[]
  jobs: SubcontractorJob[]
  jobPayments: SubcontractorJobPayment[]
  directPayments: SubcontractorJobPayment[]
  loading: boolean
  loadingTransactions: boolean
  loadingJobs: boolean
  loadingJobPayments: boolean
  loadingDirectPayments: boolean
  fetchSubcontractors: () => void
  addSubcontractor: (data: SubcontractorInput) => Promise<string>
  updateSubcontractor: (id: string, data: Partial<Subcontractor>) => Promise<void>
  deleteSubcontractor: (id: string) => Promise<void>
  fetchTransactions: (subcontractorId: string) => void
  stopTransactions: () => void
  recordCharge: (data: RecordTxInput) => Promise<string>
  recordPayment: (data: RecordTxInput) => Promise<string>
  recordAdjustment: (data: RecordTxInput) => Promise<string>
  recordPaymentWithOpex: (data: RecordPaymentWithOpexInput) => Promise<{ paymentId: string }>
  recordDirectPayment: (data: RecordDirectPaymentInput) => Promise<string>
  fetchDirectPayments: (subcontractorId: string) => void
  stopDirectPayments: () => void
  voidTransactionsForJobCard: (jobCardId: string) => Promise<void>
  generateContractNumber: () => Promise<string>
  fetchJobs: () => void
  stopJobs: () => void
  createJob: (data: CreateJobInput) => Promise<string>
  updateJob: (id: string, data: Partial<SubcontractorJob>) => Promise<void>
  linkJobToJobCard: (jobId: string, jobCardId: string, jobCardNumber: string) => Promise<void>
  unlinkJobFromJobCard: (
    jobId: string,
    opts?: { isAdminOrManager?: boolean }
  ) => Promise<void>
  fetchJobPayments: (jobId: string) => void
  fetchPaymentsForJobCard: (jobCardId: string) => void
  stopJobPayments: () => void
  recordJobPayment: (data: RecordJobPaymentInput) => Promise<string>
  approveJobPayment: (
    paymentId: string,
    targetStatus: 'APPROVED_ACCOUNTANT' | 'APPROVED_MANAGER' | 'REJECTED',
    comment?: string
  ) => Promise<{
    approvalStatus: string
    opexId?: string
    transactionPaymentId?: string
    balanceBefore?: number
    balanceAfter?: number
    idempotent: boolean
  }>
  cleanup: () => void
}

let subcontractorsUnsub: Unsubscribe | null = null
let transactionsUnsub: Unsubscribe | null = null
let jobsUnsub: Unsubscribe | null = null
let jobPaymentsUnsub: Unsubscribe | null = null
let directPaymentsUnsub: Unsubscribe | null = null

export function computeSubcontractorBalance(transactions: SubcontractorTransaction[]): {
  totalCharges: number
  totalPayments: number
  totalAdjustments: number
  balance: number
} {
  let totalCharges = 0
  let totalPayments = 0
  let totalAdjustments = 0
  for (const tx of transactions) {
    if (tx.voided) continue
    const amt = Number(tx.amount) || 0
    if (tx.type === 'CHARGE') totalCharges += amt
    else if (tx.type === 'PAYMENT') totalPayments += amt
    else if (tx.type === 'ADJUSTMENT') totalAdjustments += amt
  }
  return {
    totalCharges,
    totalPayments,
    totalAdjustments,
    balance: totalCharges - totalPayments + totalAdjustments,
  }
}

export function computeApprovedPaidTotal(payments: SubcontractorJobPayment[]): number {
  return payments
    .filter((p) => p.approvalStatus === 'APPROVED_MANAGER')
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
}

function buildJobCardProjection(job: SubcontractorJob, paidApprovedTotal = 0): SubcontractWork {
  const value = Number(job.contractValue) || 0
  return {
    id: job.id,
    subcontractorId: job.subcontractorId,
    subcontractorName: job.subcontractorName,
    description: job.description || job.contractNumber,
    quantity: 1,
    unitPrice: value,
    totalAmount: value,
    paymentMethod: 'PENDING',
    paymentRef: '',
    attachmentUrl: null,
    attachmentUrls: [],
    createdAt: typeof job.createdAt === 'string' ? job.createdAt : new Date().toISOString(),
    approvalStatus: job.status === 'COMPLETED' ? 'APPROVED_MANAGER' : 'PENDING',
    isScnLink: true,
    subcontractorJobId: job.id,
    contractNumber: job.contractNumber,
    contractValue: value,
    paidApprovedTotal,
    scnStatus: job.status,
    transactionChargeId: job.transactionChargeId || undefined,
  }
}

async function syncJobCardProjection(job: SubcontractorJob, paidApprovedTotal: number) {
  if (!job.jobCardId) return
  const ref = doc(db, 'jobCards', job.jobCardId)
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref)
    if (!snap.exists()) return
    const data: any = snap.data()
    const works: SubcontractWork[] = [...(data.subcontractWorks || [])]
    const idx = works.findIndex(
      (w) => w.subcontractorJobId === job.id || (w.isScnLink && w.id === job.id)
    )
    const projection = buildJobCardProjection(
      { ...job, status: job.status },
      paidApprovedTotal
    )
    if (idx === -1) {
      works.push(projection)
    } else {
      works[idx] = {
        ...works[idx],
        ...projection,
        id: works[idx].id || projection.id,
      }
    }
    transaction.update(ref, {
      subcontractWorks: works,
      updatedAt: serverTimestamp(),
    })
  })
}

async function removeJobCardProjection(jobCardId: string, jobId: string) {
  const ref = doc(db, 'jobCards', jobCardId)
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref)
    if (!snap.exists()) return
    const data: any = snap.data()
    const works = (data.subcontractWorks || []).filter(
      (w: SubcontractWork) => w.subcontractorJobId !== jobId && !(w.isScnLink && w.id === jobId)
    )
    transaction.update(ref, {
      subcontractWorks: works,
      updatedAt: serverTimestamp(),
    })
  })
}

export const useSubcontractorsStore = create<SubcontractorsState>((set, get) => ({
  subcontractors: [],
  transactions: [],
  jobs: [],
  jobPayments: [],
  directPayments: [],
  loading: false,
  loadingTransactions: false,
  loadingJobs: false,
  loadingJobPayments: false,
  loadingDirectPayments: false,

  fetchSubcontractors: () => {
    if (subcontractorsUnsub) {
      subcontractorsUnsub()
      subcontractorsUnsub = null
    }
    set({ loading: true })
    const q = query(collection(db, 'subcontractors'), orderBy('name', 'asc'))
    subcontractorsUnsub = onSnapshot(
      q,
      (snapshot) => {
        set({
          subcontractors: snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Subcontractor)),
          loading: false,
        })
      },
      (error) => {
        console.error('Error fetching subcontractors:', error)
        set({ loading: false })
      }
    )
  },

  addSubcontractor: async (data) => {
    const docRef = await addDoc(collection(db, 'subcontractors'), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return docRef.id
  },

  updateSubcontractor: async (id, data) => {
    await updateDoc(doc(db, 'subcontractors', id), {
      ...data,
      updatedAt: serverTimestamp(),
    })
  },

  deleteSubcontractor: async (id) => {
    const jobsSnap = await getDocs(
      query(collection(db, 'subcontractorJobs'), where('subcontractorId', '==', id))
    )
    if (jobsSnap.size > 0) {
      throw new Error(
        `Cannot delete: ${jobsSnap.size} SCN contract(s) exist for this subcontractor.`
      )
    }

    const txSnap = await getDocs(
      query(collection(db, 'subcontractorTransactions'), where('subcontractorId', '==', id))
    )
    const activeCount = txSnap.docs.filter((d) => !d.data().voided).length
    if (activeCount > 0) {
      throw new Error(
        `Cannot delete: ${activeCount} active transaction(s) exist. Settle or void them first, or set the subcontractor to Inactive.`
      )
    }

    if (txSnap.size > 0) {
      const batch = writeBatch(db)
      txSnap.docs.forEach((d) => batch.delete(d.ref))
      batch.delete(doc(db, 'subcontractors', id))
      await batch.commit()
    } else {
      await deleteDoc(doc(db, 'subcontractors', id))
    }

    if (transactionsUnsub) {
      transactionsUnsub()
      transactionsUnsub = null
    }
    set((state) => ({
      subcontractors: state.subcontractors.filter((s) => s.id !== id),
      transactions: state.transactions.filter((t) => t.subcontractorId !== id),
    }))
  },

  fetchTransactions: (subcontractorId) => {
    if (transactionsUnsub) {
      transactionsUnsub()
      transactionsUnsub = null
    }
    set({ loadingTransactions: true, transactions: [] })
    const q = query(
      collection(db, 'subcontractorTransactions'),
      where('subcontractorId', '==', subcontractorId),
      orderBy('createdAt', 'desc')
    )
    transactionsUnsub = onSnapshot(
      q,
      (snapshot) => {
        set({
          transactions: snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as SubcontractorTransaction)),
          loadingTransactions: false,
        })
      },
      (error) => {
        console.error('Error fetching subcontractor transactions:', error)
        set({ loadingTransactions: false })
      }
    )
  },

  stopTransactions: () => {
    if (transactionsUnsub) {
      transactionsUnsub()
      transactionsUnsub = null
    }
    set({ transactions: [] })
  },

  recordCharge: async (data) => {
    const docRef = await addDoc(collection(db, 'subcontractorTransactions'), {
      ...data,
      type: 'CHARGE',
      amount: Number(data.amount) || 0,
      attachmentUrls: data.attachmentUrls || [],
      voided: false,
      createdAt: serverTimestamp(),
    })
    return docRef.id
  },

  recordPayment: async (data) => {
    const docRef = await addDoc(collection(db, 'subcontractorTransactions'), {
      ...data,
      type: 'PAYMENT',
      amount: Number(data.amount) || 0,
      attachmentUrls: data.attachmentUrls || [],
      voided: false,
      createdAt: serverTimestamp(),
    })
    return docRef.id
  },

  recordAdjustment: async (data) => {
    const docRef = await addDoc(collection(db, 'subcontractorTransactions'), {
      ...data,
      type: 'ADJUSTMENT',
      amount: Number(data.amount) || 0,
      attachmentUrls: data.attachmentUrls || [],
      voided: false,
      createdAt: serverTimestamp(),
    })
    return docRef.id
  },

  recordPaymentWithOpex: async (data) => {
    const paymentId = await get().recordDirectPayment({
      subcontractorId: data.subcontractorId,
      subcontractorName: data.subcontractorName,
      amount: Number(data.amount) || 0,
      paymentMethod: data.paymentMethod || 'BANK',
      paymentRef: data.paymentRef || undefined,
      description: data.description || `Payment to ${data.subcontractorName}`,
      attachmentUrls: data.attachmentUrls,
      jobCardId: data.jobCardId,
      jobCardNumber: data.jobCardNumber,
      createdBy: data.createdBy,
      createdByName: data.createdByName,
    })
    return { paymentId }
  },

  recordDirectPayment: async (data) => {
    const amount = Number(data.amount) || 0
    if (amount <= 0) throw new Error('Payment amount must be greater than zero')

    const docRef = await addDoc(collection(db, 'subcontractorJobPayments'), {
      paymentKind: 'DIRECT',
      subcontractorJobId: null,
      contractNumber: null,
      subcontractorId: data.subcontractorId,
      subcontractorName: data.subcontractorName,
      amount,
      paymentMethod: data.paymentMethod || 'BANK',
      paymentRef: data.paymentRef || '',
      description: data.description || `Payment to ${data.subcontractorName}`,
      attachmentUrls: data.attachmentUrls || [],
      approvalStatus: 'PENDING',
      opexId: null,
      transactionPaymentId: null,
      jobCardId: data.jobCardId || null,
      jobCardNumber: data.jobCardNumber || null,
      createdBy: data.createdBy,
      createdByName: data.createdByName || '',
      createdAt: serverTimestamp(),
    })

    return docRef.id
  },

  fetchDirectPayments: (subcontractorId) => {
    if (directPaymentsUnsub) {
      directPaymentsUnsub()
      directPaymentsUnsub = null
    }
    set({ loadingDirectPayments: true, directPayments: [] })
    const q = query(
      collection(db, 'subcontractorJobPayments'),
      where('subcontractorId', '==', subcontractorId),
      where('paymentKind', '==', 'DIRECT')
    )
    directPaymentsUnsub = onSnapshot(
      q,
      (snapshot) => {
        const payments = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as SubcontractorJobPayment))
        payments.sort((a, b) => {
          return paymentCreatedAtMillis(b.createdAt) - paymentCreatedAtMillis(a.createdAt)
        })
        set({
          directPayments: payments,
          loadingDirectPayments: false,
        })
      },
      (error) => {
        console.error('Error fetching direct subcontractor payments:', error)
        set({ loadingDirectPayments: false })
      }
    )
  },

  stopDirectPayments: () => {
    if (directPaymentsUnsub) {
      directPaymentsUnsub()
      directPaymentsUnsub = null
    }
    set({ directPayments: [] })
  },

  voidTransactionsForJobCard: async (jobCardId) => {
    const q = query(
      collection(db, 'subcontractorTransactions'),
      where('jobCardId', '==', jobCardId)
    )
    const snap = await getDocs(q)
    await Promise.all(
      snap.docs.map((d) =>
        updateDoc(d.ref, {
          voided: true,
          voidedAt: serverTimestamp(),
          voidReason: 'Job card deleted',
        })
      )
    )
  },

  generateContractNumber: async () => {
    const counterRef = doc(db, 'systemCounters', 'subcontractorJobs')
    const nextNumber = await runTransaction(db, async (transaction) => {
      const counterSnap = await transaction.get(counterRef)
      let seq: number
      if (counterSnap.exists()) {
        const current = Number(counterSnap.data()?.sequence)
        seq = (Number.isFinite(current) ? current : 0) + 1
      } else {
        seq = 1
      }
      transaction.set(
        counterRef,
        {
          sequence: seq,
          prefix: 'SCN',
          lastUpdatedAt: serverTimestamp(),
        },
        { merge: true }
      )
      return seq
    })
    return `SCN-${String(nextNumber).padStart(4, '0')}`
  },

  fetchJobs: () => {
    if (jobsUnsub) {
      jobsUnsub()
      jobsUnsub = null
    }
    set({ loadingJobs: true })
    const q = query(collection(db, 'subcontractorJobs'), orderBy('createdAt', 'desc'))
    jobsUnsub = onSnapshot(
      q,
      (snapshot) => {
        set({
          jobs: snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as SubcontractorJob)),
          loadingJobs: false,
        })
      },
      (error) => {
        console.error('Error fetching subcontractor jobs:', error)
        set({ loadingJobs: false })
      }
    )
  },

  stopJobs: () => {
    if (jobsUnsub) {
      jobsUnsub()
      jobsUnsub = null
    }
    set({ jobs: [] })
  },

  createJob: async (data) => {
    const contractValue = Number(data.contractValue) || 0
    if (contractValue <= 0) throw new Error('Contract value must be greater than zero')
    if (!data.subcontractorId) throw new Error('Subcontractor is required')

    const contractNumber = await get().generateContractNumber()
    const status: SubcontractorJobStatus = data.status || 'ACTIVE'

    const docRef = await addDoc(collection(db, 'subcontractorJobs'), {
      contractNumber,
      subcontractorId: data.subcontractorId,
      subcontractorName: data.subcontractorName,
      description: data.description || '',
      contractValue,
      status,
      jobCardId: null,
      jobCardNumber: null,
      transactionChargeId: null,
      paidApprovedTotal: 0,
      attachmentUrls: [],
      createdBy: data.createdBy,
      createdByName: data.createdByName || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      completedAt: null,
    })

    const chargeId = await get().recordCharge({
      subcontractorId: data.subcontractorId,
      subcontractorName: data.subcontractorName,
      amount: contractValue,
      description: `${contractNumber} — ${data.description || 'Subcontract contract'}`,
      subcontractorJobId: docRef.id,
      contractNumber,
      createdBy: data.createdBy,
      createdByName: data.createdByName,
    })

    await updateDoc(docRef, {
      transactionChargeId: chargeId,
      updatedAt: serverTimestamp(),
    })

    return docRef.id
  },

  updateJob: async (id, data) => {
    const rest = { ...data } as Partial<SubcontractorJob> & { id?: string }
    delete rest.id
    await updateDoc(doc(db, 'subcontractorJobs', id), {
      ...rest,
      updatedAt: serverTimestamp(),
    })
  },

  linkJobToJobCard: async (jobId, jobCardId, jobCardNumber) => {
    const jobRef = doc(db, 'subcontractorJobs', jobId)
    const jobSnap = await getDoc(jobRef)
    if (!jobSnap.exists()) throw new Error('SCN contract not found')
    const job = { id: jobSnap.id, ...jobSnap.data() } as SubcontractorJob

    if (job.jobCardId && job.jobCardId !== jobCardId) {
      throw new Error(`Contract ${job.contractNumber} is already linked to ${job.jobCardNumber || job.jobCardId}`)
    }

    await updateDoc(jobRef, {
      jobCardId,
      jobCardNumber,
      updatedAt: serverTimestamp(),
    })

    const updatedJob = { ...job, jobCardId, jobCardNumber }
    await syncJobCardProjection(updatedJob, Number(job.paidApprovedTotal) || 0)

    // Stamp job card refs on the original CHARGE if present
    if (job.transactionChargeId) {
      await updateDoc(doc(db, 'subcontractorTransactions', job.transactionChargeId), {
        jobCardId,
        jobCardNumber,
      })
    }

    // Stamp open payments with job card refs
    const paySnap = await getDocs(
      query(collection(db, 'subcontractorJobPayments'), where('subcontractorJobId', '==', jobId))
    )
    await Promise.all(
      paySnap.docs.map((d) =>
        updateDoc(d.ref, {
          jobCardId,
          jobCardNumber,
        })
      )
    )
  },

  unlinkJobFromJobCard: async (jobId, opts) => {
    const jobRef = doc(db, 'subcontractorJobs', jobId)
    const jobSnap = await getDoc(jobRef)
    if (!jobSnap.exists()) throw new Error('SCN contract not found')
    const job = { id: jobSnap.id, ...jobSnap.data() } as SubcontractorJob
    if (!job.jobCardId) return

    const isApproved =
      (Number(job.paidApprovedTotal) || 0) > 0 || job.status === 'COMPLETED'
    if (isApproved && !opts?.isAdminOrManager) {
      throw new Error(
        'Only managers and admins can unlink an approved subcontract from a job card'
      )
    }

    await removeJobCardProjection(job.jobCardId, jobId)
    await updateDoc(jobRef, {
      jobCardId: null,
      jobCardNumber: null,
      updatedAt: serverTimestamp(),
    })
  },

  fetchJobPayments: (jobId) => {
    if (jobPaymentsUnsub) {
      jobPaymentsUnsub()
      jobPaymentsUnsub = null
    }
    set({ loadingJobPayments: true, jobPayments: [] })
    const q = query(
      collection(db, 'subcontractorJobPayments'),
      where('subcontractorJobId', '==', jobId),
      orderBy('createdAt', 'desc')
    )
    jobPaymentsUnsub = onSnapshot(
      q,
      (snapshot) => {
        set({
          jobPayments: snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as SubcontractorJobPayment)),
          loadingJobPayments: false,
        })
      },
      (error) => {
        console.error('Error fetching SCN payments:', error)
        set({ loadingJobPayments: false })
      }
    )
  },

  fetchPaymentsForJobCard: (jobCardId) => {
    if (jobPaymentsUnsub) {
      jobPaymentsUnsub()
      jobPaymentsUnsub = null
    }
    set({ loadingJobPayments: true, jobPayments: [] })
    const q = query(
      collection(db, 'subcontractorJobPayments'),
      where('jobCardId', '==', jobCardId),
      orderBy('createdAt', 'desc')
    )
    jobPaymentsUnsub = onSnapshot(
      q,
      (snapshot) => {
        set({
          jobPayments: snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as SubcontractorJobPayment)),
          loadingJobPayments: false,
        })
      },
      (error) => {
        console.error('Error fetching job-card SCN payments:', error)
        set({ loadingJobPayments: false })
      }
    )
  },

  stopJobPayments: () => {
    if (jobPaymentsUnsub) {
      jobPaymentsUnsub()
      jobPaymentsUnsub = null
    }
    set({ jobPayments: [] })
  },

  recordJobPayment: async (data) => {
    const amount = Number(data.amount) || 0
    if (amount <= 0) throw new Error('Payment amount must be greater than zero')

    const jobRef = doc(db, 'subcontractorJobs', data.subcontractorJobId)
    const jobSnap = await getDoc(jobRef)
    if (!jobSnap.exists()) throw new Error('SCN contract not found')
    const job = { id: jobSnap.id, ...jobSnap.data() } as SubcontractorJob

    if (job.status === 'CANCELLED') throw new Error('Cannot record payment on a cancelled contract')
    if (job.status === 'COMPLETED') throw new Error('Contract is already completed')

    const pendingSnap = await getDocs(
      query(
        collection(db, 'subcontractorJobPayments'),
        where('subcontractorJobId', '==', job.id)
      )
    )
    const pendingOrApproved = pendingSnap.docs
      .map((d) => d.data() as SubcontractorJobPayment)
      .filter((p) => p.approvalStatus === 'PENDING' || p.approvalStatus === 'APPROVED_ACCOUNTANT' || p.approvalStatus === 'APPROVED_MANAGER')
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0)

    if (pendingOrApproved + amount > Number(job.contractValue) + 0.001) {
      throw new Error(
        `Payment would exceed contract value ($${Number(job.contractValue).toFixed(2)}). Remaining capacity: $${Math.max(0, Number(job.contractValue) - pendingOrApproved).toFixed(2)}`
      )
    }

    const docRef = await addDoc(collection(db, 'subcontractorJobPayments'), {
      paymentKind: 'SCN',
      subcontractorJobId: job.id,
      contractNumber: job.contractNumber,
      subcontractorId: job.subcontractorId,
      subcontractorName: job.subcontractorName,
      amount,
      paymentMethod: data.paymentMethod || 'BANK',
      paymentRef: data.paymentRef || '',
      description: data.description || `Payment on ${job.contractNumber}`,
      attachmentUrls: data.attachmentUrls || [],
      approvalStatus: 'PENDING',
      opexId: null,
      transactionPaymentId: null,
      jobCardId: job.jobCardId || null,
      jobCardNumber: job.jobCardNumber || null,
      createdBy: data.createdBy,
      createdByName: data.createdByName || '',
      createdAt: serverTimestamp(),
    })

    return docRef.id
  },

  approveJobPayment: async (paymentId, targetStatus, comment) => {
    const token = await auth.currentUser?.getIdToken()
    if (!token) throw new Error('Authentication required')
    const response = await fetch(
      `/api/subcontractors/payments/${encodeURIComponent(paymentId)}/approve`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ targetStatus, ...(comment ? { comment } : {}) }),
      }
    )
    const responseText = await response.text()
    let result: any = {}
    try {
      result = responseText ? JSON.parse(responseText) : {}
    } catch {
      result = {}
    }
    if (!response.ok) {
      const plainTextError = responseText && !responseText.trim().startsWith('<') ? responseText : ''
      throw new Error(
        result.error || plainTextError || `Subcontractor payment approval failed (HTTP ${response.status})`
      )
    }
    return result
  },

  cleanup: () => {
    if (subcontractorsUnsub) {
      subcontractorsUnsub()
      subcontractorsUnsub = null
    }
    if (transactionsUnsub) {
      transactionsUnsub()
      transactionsUnsub = null
    }
    if (jobsUnsub) {
      jobsUnsub()
      jobsUnsub = null
    }
    if (jobPaymentsUnsub) {
      jobPaymentsUnsub()
      jobPaymentsUnsub = null
    }
    if (directPaymentsUnsub) {
      directPaymentsUnsub()
      directPaymentsUnsub = null
    }
    set({
      subcontractors: [],
      transactions: [],
      jobs: [],
      jobPayments: [],
      directPayments: [],
      loading: false,
      loadingTransactions: false,
      loadingJobs: false,
      loadingJobPayments: false,
      loadingDirectPayments: false,
    })
  },
}))

export type { SubcontractorPaymentTerms, SubcontractorStatus }
