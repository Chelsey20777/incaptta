'use client'

import { create } from 'zustand'
import { auth, db } from '@/lib/firebase'
import {
  collection,
  query,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  orderBy,
  getDocs,
  where,
  getDoc,
  runTransaction,
  increment,
  Timestamp
} from 'firebase/firestore'

export type LeadStage = 'New' | 'Contacted' | 'Qualified' | 'Proposal' | 'Negotiation' | 'Won' | 'Lost'
export type LeadPriority = 'Low' | 'Medium' | 'High'

/** Firestore Timestamp or null — used across CRM entities */
type FirestoreTimestamp = Timestamp | null | any


export interface Lead {
  id: string
  companyName: string
  contactName: string
  email: string
  phone: string
  stage: LeadStage
  priority: LeadPriority
  value: number
  source: string
  notes: string
  assignedTo: string
  expectedCloseDate: string
  createdBy: { uid: string; name: string }
  receivedBy?: { uid: string; name: string }
  owner?: { uid: string; name: string }
  partyType?: 'individual' | 'business'
  channel?: string
  requirementSummary?: string
  nextActionSummary?: string
  nextActionDueAt?: string
  receivedAt?: string
  capturedAt?: string
  firstRespondedAt?: string
  customerId?: string
  identityStatus?: 'PROSPECT' | 'CUSTOMER'
  activities?: Array<Record<string, unknown>>
  pendingHandover?: {
    requestedBy: { uid: string; name: string }
    requestedTo: { uid: string; name: string }
    reason: string
    requestedAt: string
  } | null
  createdAt: FirestoreTimestamp
  updatedAt: FirestoreTimestamp
}

export interface Customer {
  id: string
  name?: string
  email?: string
  phone?: string
  company?: string
  address?: string
  customerType?: 'COMPANY' | 'INDIVIDUAL'
  primaryContactName?: string
  siteAddress?: string
  taxId?: string
  registrationNumber?: string
  status?: 'ACTIVE' | 'INACTIVE' | 'BLACKLISTED'
  creditLimit?: number
  notes?: string
  createdAt?: FirestoreTimestamp
  updatedAt?: FirestoreTimestamp
  [key: string]: any
}

export interface CrmQuote {
  id: string
  quoteNumber?: string
  leadId?: string | null
  leadName?: string | null
  customerName?: string
  customerEmail?: string
  grandTotal?: number
  status?: string
  createdBy?: string
  createdByName?: string
  createdAt?: FirestoreTimestamp
  [key: string]: any
}

export interface CrmInvoice {
  id: string
  customerId?: string
  customerName?: string
  grandTotal?: number
  amountPaid?: number
  status?: string
  items?: any[]
  payments?: any[]
  createdBy?: string
  createdByName?: string
  createdAt?: FirestoreTimestamp
  creditControl?: Record<string, unknown>
  [key: string]: any
}


export interface CreditAccount {
  id?: string
  clientId?: string
  clientName?: string
  balance: number
  totalDeposited: number
  totalApplied: number
  currency?: string
  createdAt?: FirestoreTimestamp
  updatedAt?: FirestoreTimestamp
}

export interface CreditTransaction {
  id: string
  clientId?: string
  clientName?: string
  type?: 'DEPOSIT' | 'APPLIED' | 'ADJUSTMENT'
  amount?: number
  balanceBefore?: number
  balanceAfter?: number
  paymentMethod?: 'BANK' | 'ECOCASH' | 'CASH'
  reference?: string
  notes?: string
  currency?: string
  createdBy?: string
  createdByName?: string
  createdAt?: FirestoreTimestamp
  isVoid?: boolean
  [key: string]: any
}

/** Sequential CRM document numbers start at 2000 (QT-2000 / INV-2000). */
const CRM_NUMBER_START = 2000
/** Upper bound to reject legacy Date.now()-based numbers (e.g. QT-159557). */
const CRM_NUMBER_MAX = 99999

export function isSequentialQuoteNumber(value?: string | null): boolean {
  const match = String(value || '').trim().match(/^QT-(\d+)$/i)
  if (!match) return false
  const n = Number(match[1])
  return Number.isFinite(n) && n >= CRM_NUMBER_START && n <= CRM_NUMBER_MAX
}

export function isSequentialInvoiceNumber(value?: string | null): boolean {
  const match = String(value || '').trim().match(/^INV-(\d+)$/i)
  if (!match) return false
  const n = Number(match[1])
  return Number.isFinite(n) && n >= CRM_NUMBER_START && n <= CRM_NUMBER_MAX
}

async function generateCrmSequenceNumber(
  counterId: string,
  prefix: 'QT' | 'INV',
  startAt: number = CRM_NUMBER_START,
): Promise<string> {
  const counterRef = doc(db, 'systemCounters', counterId)
  const nextNumber = await runTransaction(db, async (transaction) => {
    const counterSnap = await transaction.get(counterRef)
    let seq: number
    if (counterSnap.exists()) {
      const current = Number(counterSnap.data()?.sequence)
      seq = (Number.isFinite(current) ? current : startAt - 1) + 1
    } else {
      seq = startAt
    }
    if (seq < startAt) seq = startAt
    transaction.set(
      counterRef,
      {
        sequence: seq,
        prefix,
        lastUpdatedAt: serverTimestamp(),
      },
      { merge: true },
    )
    return seq
  })
  return `${prefix}-${nextNumber}`
}

let quoteBackfillInFlight: Promise<number> | null = null
let invoiceBackfillInFlight: Promise<number> | null = null

interface CrmState {
  customers: Customer[]
  quotes: CrmQuote[]
  invoices: CrmInvoice[]
  leads: Lead[]
  creditAccounts: Record<string, CreditAccount>
  creditTransactions: Record<string, CreditTransaction[]>
  loading: boolean
  error: string | null

  subscriptions: (() => void)[]

  fetchCustomers: () => () => void
  fetchQuotes: () => () => void
  fetchInvoices: () => () => void
  fetchLeads: () => () => void

  createCustomer: (data: Partial<Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>>) => Promise<string>
  convertLeadToCustomer: (
    leadId: string,
    input?: {
      existingCustomerId?: string
      name?: string
      email?: string
      phone?: string
      primaryContactName?: string
      customerType?: 'COMPANY' | 'INDIVIDUAL'
      address?: string
      siteAddress?: string
      taxId?: string
      registrationNumber?: string
      creditLimit?: number
      notes?: string
    }
  ) => Promise<{ id: string; alreadyConverted?: boolean; linked?: boolean; created?: boolean }>
  updateCustomer: (id: string, data: Partial<Omit<Customer, 'id' | 'createdAt'>>) => Promise<void>
  createQuote: (quoteData: Partial<CrmQuote> & { customerName: string; grandTotal: number }) => Promise<string>
  duplicateQuote: (
    sourceId: string,
    creator?: { createdBy?: string; createdByName?: string }
  ) => Promise<string>
  generateQuoteNumber: () => Promise<string>
  generateInvoiceNumber: () => Promise<string>
  createInvoice: (invoiceData: Partial<CrmInvoice> & Record<string, any>, options?: CreditOverrideOptions) => Promise<string>
  updateInvoice: (id: string, invoiceData: Partial<CrmInvoice> & Record<string, any>, options?: CreditOverrideOptions) => Promise<void>
  recordInvoicePayment: (id: string, paymentData: Record<string, unknown>) => Promise<void>
  backfillMissingQuoteNumbers: () => Promise<number>
  backfillMissingInvoiceNumbers: () => Promise<number>

  addLead: (data: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  updateLead: (id: string, data: Partial<Omit<Lead, 'id' | 'createdAt'>>) => Promise<void>
  deleteLead: (id: string) => Promise<void>
  moveStageLead: (id: string, stage: LeadStage) => Promise<void>
  syncLeadStage: (contactName: string, email: string, companyName: string, stage: LeadStage, value?: number) => Promise<void>
  recordLeadActivity: (id: string, activity: Record<string, unknown>, nextAction?: { summary: string; dueAt: string }) => Promise<void>
  requestLeadHandover: (id: string, handover: { requestedTo: { uid: string; name: string }; reason: string; requestedBy: { uid: string; name: string } }) => Promise<void>
  acceptLeadHandover: (id: string, actor: { uid: string; name: string }) => Promise<void>
  reassignLeadOwner: (id: string, nextOwner: { uid: string; name: string }, reason: string, actor: { uid: string; name: string }) => Promise<void>

  // Credit account methods
  fetchCreditAccount: (customerId: string) => Promise<void>
  fetchCreditTransactions: (customerId: string) => Promise<void>
  recordDeposit: (depositData: {
    clientId: string
    clientName: string
    amount: number
    paymentMethod: 'BANK' | 'ECOCASH' | 'CASH'
    reference: string
    notes: string
    currency: string
    createdBy: string
    createdByName: string
  }) => Promise<void>

  fetchAll: () => () => void
  cleanup: () => void
}

export interface CreditOverrideOptions {
  overrideCreditLimit?: boolean
  overrideReason?: string
}

async function invoiceApi(path: string, method: 'POST' | 'PATCH', body: Record<string, unknown>) {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('Authentication required')
  const response = await fetch(path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const result = await response.json().catch(() => ({})) as {
    id?: string
    error?: string
    code?: string
    details?: Record<string, number>
  }
  if (!response.ok) {
    const error = Object.assign(new Error(result.error || `Invoice request failed (${response.status})`), {
      status: response.status,
      code: result.code,
      details: result.details,
    })
    throw error
  }
  return result
}

export const useCrmStore = create<CrmState>((set, get) => ({
  customers: [],
  quotes: [],
  invoices: [],
  leads: [],
  creditAccounts: {},
  creditTransactions: {},
  loading: false,
  error: null,
  subscriptions: [],

  fetchCustomers: () => {
    set({ loading: true })
    const q = query(collection(db, 'customers'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, (snapshot) => {
      set({ customers: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer)), loading: false })
    }, (err) => {
      console.error('Error fetching customers:', err)
      set({ error: err.message, loading: false })
    })
    set((state) => ({ subscriptions: [...state.subscriptions, unsub] }))
    return unsub
  },

  fetchQuotes: () => {
    set({ loading: true })
    const q = query(collection(db, 'crmQuotes'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, (snapshot) => {
      set({ quotes: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CrmQuote)), loading: false })
    }, (err) => {
      console.error('Error fetching quotes:', err)
      set({ error: err.message, loading: false })
    })
    set((state) => ({ subscriptions: [...state.subscriptions, unsub] }))
    return unsub
  },

  fetchInvoices: () => {
    set({ loading: true })
    const q = query(collection(db, 'crmInvoices'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, (snapshot) => {
      set({ invoices: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CrmInvoice)), loading: false })
    }, (err) => {
      console.error('Error fetching invoices:', err)
      set({ error: err.message, loading: false })
    })
    set((state) => ({ subscriptions: [...state.subscriptions, unsub] }))
    return unsub
  },

  fetchLeads: () => {
    set({ loading: true })
    const q = query(collection(db, 'leads'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, (snap) => {
      set({ leads: snap.docs.map(d => ({ id: d.id, ...d.data() } as Lead)), loading: false })
    }, (err) => {
      console.error('Error fetching leads:', err)
      set({ error: err.message, loading: false })
    })
    set((state) => ({ subscriptions: [...state.subscriptions, unsub] }))
    return unsub
  },

  createCustomer: async (data) => {
    try {
      const token = await auth.currentUser?.getIdToken()
      if (!token) throw new Error('Authentication required')
      const response = await fetch('/api/crm/customers', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not create customer')

      try {
        await get().syncLeadStage(
          (data.name as string) || '',
          (data.email as string) || '',
          (data.company as string) || '',
          'New'
        )
      } catch (error) {
        // A CRM lead sync failure must not make a committed customer look unsaved.
        console.warn('Customer created, but lead sync failed:', error)
      }
      return result.id
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error('Error creating customer:', message)
      throw err
    }
  },

  convertLeadToCustomer: async (leadId, input = {}) => {
    const token = await auth.currentUser?.getIdToken()
    if (!token) throw new Error('Authentication required')
    const response = await fetch(`/api/crm/leads/${encodeURIComponent(leadId)}/convert-customer`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result.error || 'Could not convert enquiry to customer')
    return result
  },

  updateCustomer: async (id, data) => {
    try {
      const token = await auth.currentUser?.getIdToken()
      if (!token) throw new Error('Authentication required')
      const response = await fetch(`/api/crm/customers/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not update customer')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error('Error updating customer:', message)
      throw err
    }
  },

  createQuote: async (quoteData) => {
    try {
      const quoteNumber = isSequentialQuoteNumber(quoteData.quoteNumber)
        ? String(quoteData.quoteNumber).trim().toUpperCase()
        : await get().generateQuoteNumber()

      const enriched = {
        ...quoteData,
        quoteNumber,
        createdAt: quoteData.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      }
      const ref = await addDoc(collection(db, 'crmQuotes'), enriched)
      return ref.id
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error('Error creating quote:', message)
      throw err
    }
  },

  generateQuoteNumber: async () => {
    return generateCrmSequenceNumber('crmQuotes', 'QT', CRM_NUMBER_START)
  },

  generateInvoiceNumber: async () => {
    return generateCrmSequenceNumber('crmInvoices', 'INV', CRM_NUMBER_START)
  },

  createInvoice: async (invoiceData, options = {}) => {
    try {
      const result = await invoiceApi('/api/crm/invoices', 'POST', { ...invoiceData, ...options })
      if (!result.id) throw new Error('Invoice was created without an ID')
      return result.id
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error('Error creating invoice:', message)
      throw err
    }
  },

  updateInvoice: async (id, invoiceData, options = {}) => {
    await invoiceApi(`/api/crm/invoices/${encodeURIComponent(id)}`, 'PATCH', { ...invoiceData, ...options })
  },

  recordInvoicePayment: async (id, paymentData) => {
    await invoiceApi(`/api/crm/invoices/${encodeURIComponent(id)}/payments`, 'POST', paymentData)
  },

  backfillMissingQuoteNumbers: async () => {
    if (quoteBackfillInFlight) return quoteBackfillInFlight
    quoteBackfillInFlight = (async () => {
      const missing = get().quotes.filter((q) => q.id && !isSequentialQuoteNumber(q.quoteNumber))
      for (const quote of missing) {
        // Re-check in case a parallel save already assigned a number
        const latest = get().quotes.find((q) => q.id === quote.id)
        if (!latest || isSequentialQuoteNumber(latest.quoteNumber)) continue
        const quoteNumber = await get().generateQuoteNumber()
        await updateDoc(doc(db, 'crmQuotes', quote.id), {
          quoteNumber,
          updatedAt: serverTimestamp(),
        })
      }
      return missing.length
    })().finally(() => {
      quoteBackfillInFlight = null
    })
    return quoteBackfillInFlight
  },

  backfillMissingInvoiceNumbers: async () => {
    if (invoiceBackfillInFlight) return invoiceBackfillInFlight
    invoiceBackfillInFlight = (async () => {
      const missing = get().invoices.filter((inv) => inv.id && !isSequentialInvoiceNumber(inv.invoiceNumber))
      for (const invoice of missing) {
        const latest = get().invoices.find((inv) => inv.id === invoice.id)
        if (!latest || isSequentialInvoiceNumber(latest.invoiceNumber)) continue
        const invoiceNumber = await get().generateInvoiceNumber()
        await get().updateInvoice(invoice.id, { invoiceNumber })
        const jobCardId = String(latest.jobCardId || '').trim()
        if (jobCardId) {
          await updateDoc(doc(db, 'jobCards', jobCardId), {
            'generalInfo.linkedCrmNumber': invoiceNumber,
            updatedAt: serverTimestamp(),
          })
        }
      }
      return missing.length
    })().finally(() => {
      invoiceBackfillInFlight = null
    })
    return invoiceBackfillInFlight
  },

  duplicateQuote: async (sourceId, creator) => {
    try {
      const sourceSnap = await getDoc(doc(db, 'crmQuotes', sourceId))
      if (!sourceSnap.exists()) throw new Error('Source quotation not found')

      const duplicatedData = { ...sourceSnap.data() }
      delete duplicatedData.createdAt
      delete duplicatedData.updatedAt
      delete duplicatedData.linkedJobCardId
      delete duplicatedData.linkedJobNumber
      delete duplicatedData.createdBy
      delete duplicatedData.createdByName

      duplicatedData.quoteNumber = await get().generateQuoteNumber()
      duplicatedData.status = 'DRAFT'
      duplicatedData.duplicatedFrom = sourceId
      duplicatedData.requisitionSections = (duplicatedData.requisitionSections || []).map(
        (section: Record<string, unknown>) => ({ ...section, id: crypto.randomUUID() })
      )
      duplicatedData.otherServices = (duplicatedData.otherServices || []).map(
        (service: Record<string, unknown>) => ({ ...service, id: crypto.randomUUID() })
      )
      if (creator?.createdBy) duplicatedData.createdBy = creator.createdBy
      if (creator?.createdByName) duplicatedData.createdByName = creator.createdByName
      duplicatedData.createdAt = serverTimestamp()
      duplicatedData.updatedAt = serverTimestamp()

      const duplicateRef = await addDoc(collection(db, 'crmQuotes'), duplicatedData)
      return duplicateRef.id
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error('Error duplicating quote:', message)
      throw err
    }
  },

  addLead: async (data) => {
    try {
      const user = auth.currentUser
      const owner = data.owner || data.createdBy || (user
        ? { uid: user.uid, name: user.displayName || user.email || user.uid }
        : { uid: 'unknown', name: 'Unknown' })
      await addDoc(collection(db, 'leads'), {
        ...data,
        priority: String(data.priority || 'MEDIUM').toUpperCase() === 'HIGH'
          ? 'HIGH'
          : String(data.priority || 'MEDIUM').toUpperCase() === 'LOW' ? 'LOW' : 'MEDIUM',
        createdBy: data.createdBy || owner,
        receivedBy: data.receivedBy || owner,
        owner,
        assignedTo: data.assignedTo || owner.name,
        identityStatus: data.identityStatus || 'PROSPECT',
        capturedAt: data.capturedAt || new Date().toISOString(),
        receivedAt: data.receivedAt || data.capturedAt || new Date().toISOString(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error('Error adding lead:', message)
      throw err
    }
  },

  updateLead: async (id, data) => {
    try {
      await updateDoc(doc(db, 'leads', id), {
        ...data,
        updatedAt: serverTimestamp()
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error('Error updating lead:', message)
      throw err
    }
  },

  deleteLead: async (id) => {
    try {
      await deleteDoc(doc(db, 'leads', id))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error('Error deleting lead:', message)
      throw err
    }
  },

  moveStageLead: async (id, stage) => {
    try {
      await updateDoc(doc(db, 'leads', id), {
        stage,
        updatedAt: serverTimestamp()
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error('Error moving lead stage:', message)
      throw err
    }
  },

  syncLeadStage: async () => {
    // Name/email fallbacks must not manufacture commercial progress.
  },

  recordLeadActivity: async (id, activity, nextAction) => {
    const snap = await getDoc(doc(db, 'leads', id))
    if (!snap.exists()) throw new Error('Enquiry not found')
    const current = snap.data() as Lead
    const activities = [...(current.activities || []), {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      ...activity,
    }]
    await updateDoc(doc(db, 'leads', id), {
      activities,
      ...(current.firstRespondedAt ? {} : { firstRespondedAt: new Date().toISOString() }),
      ...(nextAction ? {
        nextActionSummary: nextAction.summary,
        nextActionDueAt: nextAction.dueAt,
      } : {}),
      updatedAt: serverTimestamp(),
    })
  },

  requestLeadHandover: async (id, handover) => {
    const current = get().leads.find(lead => lead.id === id)
    await updateDoc(doc(db, 'leads', id), {
      pendingHandover: {
        ...handover,
        requestedAt: new Date().toISOString(),
      },
      activities: [...(current?.activities || []), {
        id: crypto.randomUUID(),
        type: 'handover',
        at: new Date().toISOString(),
        authorUid: handover.requestedBy.uid,
        authorName: handover.requestedBy.name,
        summary: `Handover requested to ${handover.requestedTo.name}`,
        outcome: handover.reason,
      }],
      updatedAt: serverTimestamp(),
    })
  },

  acceptLeadHandover: async (id, actor) => {
    const snap = await getDoc(doc(db, 'leads', id))
    if (!snap.exists()) throw new Error('Enquiry not found')
    const current = snap.data() as Lead
    if (!current.pendingHandover) throw new Error('No handover is pending')
    if (current.pendingHandover.requestedTo.uid !== actor.uid) {
      throw new Error('Only the selected recipient can accept this handover')
    }
    const previousOwner = current.owner || current.createdBy
    await updateDoc(doc(db, 'leads', id), {
      owner: current.pendingHandover.requestedTo,
      assignedTo: current.pendingHandover.requestedTo.name,
      pendingHandover: null,
      activities: [...(current.activities || []), {
        id: crypto.randomUUID(),
        type: 'handover',
        at: new Date().toISOString(),
        authorUid: actor.uid,
        authorName: actor.name,
        summary: `Ownership accepted from ${previousOwner?.name || 'previous owner'}`,
      }],
      updatedAt: serverTimestamp(),
    })
  },

  reassignLeadOwner: async (id, nextOwner, reason, actor) => {
    const snap = await getDoc(doc(db, 'leads', id))
    if (!snap.exists()) throw new Error('Enquiry not found')
    const current = snap.data() as Lead
    await updateDoc(doc(db, 'leads', id), {
      owner: nextOwner,
      assignedTo: nextOwner.name,
      pendingHandover: null,
      activities: [...(current.activities || []), {
        id: crypto.randomUUID(),
        type: 'reassign',
        at: new Date().toISOString(),
        authorUid: actor.uid,
        authorName: actor.name,
        summary: `Manager reassigned ownership to ${nextOwner.name}`,
        outcome: reason,
      }],
      updatedAt: serverTimestamp(),
    })
  },

  // ── Credit account methods ─────────────────────────────────────────────────

  fetchCreditAccount: async (customerId) => {
    try {
      const snap = await getDoc(doc(db, 'clientCreditAccounts', customerId))
      if (snap.exists()) {
        set((state) => ({
          creditAccounts: { ...state.creditAccounts, [customerId]: { id: snap.id, clientId: customerId, ...snap.data() } as CreditAccount }
        }))
      } else {
        set((state) => ({
          creditAccounts: { ...state.creditAccounts, [customerId]: { clientId: customerId, balance: 0, totalDeposited: 0, totalApplied: 0 } }
        }))
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error('Error fetching credit account:', message)
      set((state) => ({
        creditAccounts: { ...state.creditAccounts, [customerId]: { clientId: customerId, balance: 0, totalDeposited: 0, totalApplied: 0 } }
      }))
    }
  },

  fetchCreditTransactions: async (customerId) => {
    try {
      const q = query(
        collection(db, 'clientCreditTransactions'),
        where('clientId', '==', customerId),
        orderBy('createdAt', 'desc')
      )
      const snap = await getDocs(q)
      set((state) => ({
        creditTransactions: {
          ...state.creditTransactions,
          [customerId]: snap.docs.map(d => ({ id: d.id, ...d.data() } as CreditTransaction))
        }
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error('Error fetching credit transactions:', message)
      set((state) => ({
        creditTransactions: { ...state.creditTransactions, [customerId]: [] }
      }))
    }
  },

  recordDeposit: async (depositData) => {
    const accountRef = doc(db, 'clientCreditAccounts', depositData.clientId)

    await runTransaction(db, async (tx) => {
      const accountSnap = await tx.get(accountRef)
      const current = accountSnap.exists()
        ? accountSnap.data()
        : { balance: 0, totalDeposited: 0, totalApplied: 0 }
      const balanceBefore = Number(current.balance ?? 0)
      const balanceAfter = balanceBefore + depositData.amount

      if (accountSnap.exists()) {
        tx.update(accountRef, {
          balance: increment(depositData.amount),
          totalDeposited: increment(depositData.amount),
          updatedAt: serverTimestamp()
        })
      } else {
        tx.set(accountRef, {
          clientId: depositData.clientId,
          clientName: depositData.clientName,
          balance: depositData.amount,
          totalDeposited: depositData.amount,
          totalApplied: 0,
          currency: depositData.currency,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        })
      }

      const txRef = doc(collection(db, 'clientCreditTransactions'))
      tx.set(txRef, {
        clientId: depositData.clientId,
        clientName: depositData.clientName,
        type: 'DEPOSIT',
        amount: depositData.amount,
        balanceBefore,
        balanceAfter,
        paymentMethod: depositData.paymentMethod,
        reference: depositData.reference,
        notes: depositData.notes,
        currency: depositData.currency,
        createdBy: depositData.createdBy,
        createdByName: depositData.createdByName,
        createdAt: serverTimestamp()
      })
    })

    // Refresh local state
    await get().fetchCreditAccount(depositData.clientId)
    await get().fetchCreditTransactions(depositData.clientId)
  },

  fetchAll: () => {
    get().cleanup()
    const subs = [
      get().fetchCustomers(),
      get().fetchQuotes(),
      get().fetchInvoices(),
      get().fetchLeads()
    ]
    return () => {
      subs.forEach(unsub => unsub())
      set({ subscriptions: [] })
    }
  },

  cleanup: () => {
    get().subscriptions.forEach(unsub => unsub())
    set({ subscriptions: [] })
  }
}))
