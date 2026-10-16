'use client'

import { create } from 'zustand'
import { db } from '@/lib/firebase'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  limit,
  runTransaction,
  onSnapshot,
  Unsubscribe
} from 'firebase/firestore'
import { fetchCashbookBalances } from '@/lib/cashbook'

export interface LedgerEntry {
  id: string
  account: string
  type: 'DEBIT' | 'CREDIT'
  amount: number
  description: string
  reference: string
  referenceType: 'EXPENSE' | 'INVOICE' | 'PAYMENT' | 'TRANSFER' | 'TOPUP' | 'SALARY' | 'ADJUSTMENT'
  category: string
  date: any
  postedBy: string
  createdAt: any
}

export interface VatFiling {
  id: string
  period: string
  year: number
  month: number
  totalSales: number
  vatOnSales: number
  totalPurchases: number
  vatOnPurchases: number
  netVatDue: number
  status: 'DRAFT' | 'FILED' | 'PAID'
  filedAt: any | null
  paidAt: any | null
  createdBy: string
  createdAt: any
  updatedAt: any
}

export interface AutoApprovalParam {
  id: string
  type: 'EXPENSE' | 'TRANSFER' | 'SALARY' | 'PURCHASE_ORDER'
  minAmount: number
  maxAmount: number
  role: string
  requiresManagerApproval: boolean
  isActive: boolean
  createdBy: string
  createdAt: any
  updatedAt: any
}

interface AccountingState {
  // Ledger
  ledgerEntries: LedgerEntry[]
  loadingLedger: boolean
  fetchLedger: (filters?: { account?: string; startDate?: string; endDate?: string; limitCount?: number }) => Promise<void>
  addLedgerEntry: (entry: Omit<LedgerEntry, 'id' | 'createdAt'>) => Promise<string>

  // VAT
  vatFilings: VatFiling[]
  loadingVat: boolean
  fetchVatFilings: () => Promise<void>
  addVatFiling: (filing: Omit<VatFiling, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>
  updateVatFiling: (id: string, data: Partial<VatFiling>) => Promise<void>

  // Auto-Approvals
  autoApprovalParams: AutoApprovalParam[]
  loadingApprovals: boolean
  fetchAutoApprovalParams: () => Promise<void>
  addAutoApprovalParam: (param: Omit<AutoApprovalParam, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>
  updateAutoApprovalParam: (id: string, data: Partial<AutoApprovalParam>) => Promise<void>
  deleteAutoApprovalParam: (id: string) => Promise<void>

  // Account Balances
  fetchAccountBalance: (account: string) => Promise<number>
  fetchAllBalances: () => Promise<Record<string, number>>
}

export const useAccountingStore = create<AccountingState>((set, get) => ({
  // === LEDGER ===
  ledgerEntries: [],
  loadingLedger: false,
  vatFilings: [],
  loadingVat: false,
  autoApprovalParams: [],
  loadingApprovals: false,

  fetchLedger: async (filters = {}) => {
    set({ loadingLedger: true })
    try {
      let q = query(collection(db, 'ledger'), orderBy('date', 'desc'))

      if (filters.account) {
        q = query(q, where('account', '==', filters.account))
      }
      if (filters.limitCount) {
        q = query(q, limit(filters.limitCount))
      }

      const snapshot = await getDocs(q)
      let entries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LedgerEntry))

      if (filters.startDate) {
        const start = new Date(filters.startDate)
        entries = entries.filter(e => new Date(e.date) >= start)
      }
      if (filters.endDate) {
        const end = new Date(filters.endDate)
        entries = entries.filter(e => new Date(e.date) <= end)
      }

      set({ ledgerEntries: entries })
    } catch (err: any) {
      console.error('Error fetching ledger:', err)
    } finally {
      set({ loadingLedger: false })
    }
  },

  /**
   * @deprecated The `ledger` collection is a parallel, stale bookkeeping path.
   * Live cash balances come from operationalExpenses/fundTransfers/jobPayments/
   * ledgerTopUps (see lib/cashbook.ts and finance-store). Do not add new writes.
   */
  addLedgerEntry: async (entry) => {
    const docRef = await addDoc(collection(db, 'ledger'), {
      ...entry,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
    return docRef.id
  },

  // === VAT ===
  fetchVatFilings: async () => {
    set({ loadingVat: true })
    try {
      const q = query(collection(db, 'vatFilings'), orderBy('period', 'desc'))
      const snapshot = await getDocs(q)
      set({ vatFilings: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as VatFiling)) })
    } catch (err: any) {
      console.error('Error fetching VAT filings:', err)
    } finally {
      set({ loadingVat: false })
    }
  },

  addVatFiling: async (filing) => {
    const docRef = await addDoc(collection(db, 'vatFilings'), {
      ...filing,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
    await get().fetchVatFilings()
    return docRef.id
  },

  updateVatFiling: async (id, data) => {
    const updateData: any = {
      ...data,
      updatedAt: serverTimestamp()
    }
    if (data.status === 'FILED') {
      updateData.filedAt = serverTimestamp()
    } else if (data.status === 'PAID') {
      updateData.paidAt = serverTimestamp()
    }
    await updateDoc(doc(db, 'vatFilings', id), updateData)
    await get().fetchVatFilings()
  },

  // === AUTO-APPROVALS ===
  fetchAutoApprovalParams: async () => {
    set({ loadingApprovals: true })
    try {
      const q = query(collection(db, 'autoApprovalParams'), orderBy('minAmount', 'asc'))
      const snapshot = await getDocs(q)
      set({ autoApprovalParams: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AutoApprovalParam)) })
    } catch (err: any) {
      console.error('Error fetching auto-approval params:', err)
    } finally {
      set({ loadingApprovals: false })
    }
  },

  addAutoApprovalParam: async (param) => {
    const docRef = await addDoc(collection(db, 'autoApprovalParams'), {
      ...param,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
    await get().fetchAutoApprovalParams()
    return docRef.id
  },

  updateAutoApprovalParam: async (id, data) => {
    await updateDoc(doc(db, 'autoApprovalParams', id), {
      ...data,
      updatedAt: serverTimestamp()
    })
    await get().fetchAutoApprovalParams()
  },

  deleteAutoApprovalParam: async (id) => {
    await deleteDoc(doc(db, 'autoApprovalParams', id))
    await get().fetchAutoApprovalParams()
  },

  // === ACCOUNT BALANCES ===
  fetchAccountBalance: async (account) => {
    try {
      const q = query(collection(db, 'ledger'), where('account', '==', account))
      const snapshot = await getDocs(q)
      let balance = 0
      snapshot.docs.forEach(doc => {
        const data = doc.data()
        if (data.type === 'DEBIT') balance += Number(data.amount) || 0
        else if (data.type === 'CREDIT') balance -= Number(data.amount) || 0
      })
      return balance
    } catch (err: any) {
      console.error(`Error fetching balance for ${account}:`, err)
      return 0
    }
  },

  fetchAllBalances: async () => {
    // Live cashbook (same rules as ledger page / dashboard). The old `ledger`
    // collection is deprecated — it used a different account vocabulary and was
    // never written to by the live flows, so its balances were stale/zero.
    const [cashbook, invSnap] = await Promise.all([
      fetchCashbookBalances(),
      getDocs(query(collection(db, 'inventoryItems'))),
    ])

    let inventoryValue = 0
    invSnap.docs.forEach((d) => {
      const data = d.data()
      const qty = Number(data.quantityOnHand || data.qty || 0)
      const unitCost = Number(data.unitCost || data.purchasePrice || 0)
      inventoryValue += qty * Math.abs(unitCost)
    })

    return {
      Bank: cashbook.BANK,
      Cash: cashbook.CASH,
      EcoCash: cashbook.ECOCASH,
      IRD: cashbook.IRD,
      Salaries: cashbook.SALARIES,
      Reserve: cashbook.RESERVE,
      Inventory: inventoryValue,
      PettyCash: cashbook.CASH,
    }
  }
}))
