'use client'

import { create } from 'zustand'
import { db } from '@/lib/firebase'
import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  onSnapshot,
  Unsubscribe
} from 'firebase/firestore'

export interface Commission {
  id: string
  referrerId: string
  referrerName: string
  referredClient: string
  referredClientId: string
  projectType: string
  commissionAmount: number
  commissionRate: number
  status: 'PENDING' | 'APPROVED' | 'PAID' | 'CANCELLED'
  paidDate: string | null
  paidBy: string
  notes: string
  createdBy: string
  createdAt: any
  updatedAt: any
}

export interface CommissionPayout {
  id: string
  referrerId: string
  referrerName: string
  amount: number
  payoutDate: string
  paymentMethod: string
  reference: string
  notes: string
  createdBy: string
  createdAt: any
}

interface CommissionsState {
  commissions: Commission[]
  payouts: CommissionPayout[]
  loadingCommissions: boolean
  loadingPayouts: boolean

  subscriptions: (() => void)[]

  fetchCommissions: (referrerId?: string) => () => void
  addCommission: (data: Omit<Commission, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>
  updateCommissionStatus: (id: string, status: Commission['status'], paidBy?: string, paidDate?: string) => Promise<void>

  fetchPayouts: (referrerId?: string) => Promise<void>
  addPayout: (data: Omit<CommissionPayout, 'id' | 'createdAt'>) => Promise<string>

  getMyCommissions: (referrerId: string) => Commission[]
  getPendingTotals: (referrerId: string) => { pending: number; approved: number; paid: number; total: number }

  cleanup: () => void
}

export const useCommissionsStore = create<CommissionsState>((set, get) => ({
  commissions: [],
  payouts: [],
  loadingCommissions: false,
  loadingPayouts: false,
  subscriptions: [],

  cleanup: () => {
    get().subscriptions.forEach(unsub => unsub())
    set({ subscriptions: [] })
  },

  fetchCommissions: (referrerId) => {
    set({ loadingCommissions: true })
    let q = query(collection(db, 'commissions'), orderBy('createdAt', 'desc'))
    if (referrerId) {
      q = query(q, where('referrerId', '==', referrerId))
    }
    const unsub = onSnapshot(q, (snap) => {
      set({ commissions: snap.docs.map(d => ({ id: d.id, ...d.data() } as Commission)), loadingCommissions: false })
    }, (err) => {
      console.error('Error fetching commissions:', err)
      set({ loadingCommissions: false })
    })
    set((state) => ({ subscriptions: [...state.subscriptions, unsub] }))
    return unsub
  },

  addCommission: async (data) => {
    const docRef = await addDoc(collection(db, 'commissions'), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
    return docRef.id
  },

  updateCommissionStatus: async (id, status, paidBy, paidDate) => {
    const updateData: any = { status, updatedAt: serverTimestamp() }
    if (status === 'PAID') {
      updateData.paidBy = paidBy || ''
      updateData.paidDate = paidDate || new Date().toISOString()
    }
    await updateDoc(doc(db, 'commissions', id), updateData)
  },

  fetchPayouts: async (referrerId) => {
    set({ loadingPayouts: true })
    try {
      let q = query(collection(db, 'commissionPayouts'), orderBy('payoutDate', 'desc'))
      if (referrerId) {
        q = query(q, where('referrerId', '==', referrerId))
      }
      const snapshot = await getDocs(q)
      set({ payouts: snapshot.docs.map(d => ({ id: d.id, ...d.data() } as CommissionPayout)) })
    } catch (err: any) {
      console.error('Error fetching payouts:', err)
    } finally {
      set({ loadingPayouts: false })
    }
  },

  addPayout: async (data) => {
    const docRef = await addDoc(collection(db, 'commissionPayouts'), {
      ...data,
      createdAt: serverTimestamp()
    })
    await get().fetchPayouts()
    return docRef.id
  },

  getMyCommissions: (referrerId) => {
    return get().commissions.filter(c => c.referrerId === referrerId)
  },

  getPendingTotals: (referrerId) => {
    const myCommissions = get().commissions.filter(c => c.referrerId === referrerId)
    return {
      pending: myCommissions.filter(c => c.status === 'PENDING').reduce((s, c) => s + c.commissionAmount, 0),
      approved: myCommissions.filter(c => c.status === 'APPROVED').reduce((s, c) => s + c.commissionAmount, 0),
      paid: myCommissions.filter(c => c.status === 'PAID').reduce((s, c) => s + c.commissionAmount, 0),
      total: myCommissions.reduce((s, c) => s + c.commissionAmount, 0),
    }
  }
}))