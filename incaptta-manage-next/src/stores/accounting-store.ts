'use client'

import { create } from 'zustand'
import { db } from '@/lib/firebase'
import {
  collection,
  query,
  orderBy,
  getDocs,
  onSnapshot,
  Unsubscribe,
  Timestamp
} from 'firebase/firestore'

export interface TaxCategory {
  id: string
  name: string
  rate: number
  type: 'VAT' | 'WITHHOLDING' | 'OTHER'
  isActive: boolean
}

export interface VatReturn {
  id: string
  period: string
  outputVat: number
  inputVat: number
  netVat: number
  status: 'DRAFT' | 'SUBMITTED' | 'PAID'
  createdAt: any
}

export interface AccountingState {
  taxCategories: TaxCategory[]
  vatReturns: VatReturn[]
  localJobPayments: any[]
  localExpenses: any[]
  localPoultrySales: any[]
  localJobCards: any[]
  loading: boolean
  error: string | null

  fetchTaxCategories: () => Promise<void>
  fetchVatReturns: () => Promise<void>
  startListeners: () => void
  cleanup: () => void
  isInTimeframe: (dateInput: any, timeframe: 'month' | 'ytd' | 'all') => boolean
  getPeriodLabel: (timeframe: 'month' | 'ytd' | 'all') => string
  fmt: (n: number) => string
  computePandL: (timeframe: 'month' | 'ytd' | 'all') => {
    revenue: number
    cogs: number
    grossProfit: number
    operatingExpenses: number
    netProfit: number
  }
  computeBalanceSheet: (cashAndBank: number, inventoryValue: number) => {
    cashAndBank: number
    inventoryValue: number
    totalAssets: number
    statutoryPayables: number
    totalLiabilities: number
    equity: number
  }
}

let unsubJobPayments: Unsubscribe | null = null
let unsubExpenses: Unsubscribe | null = null
let unsubPoultry: Unsubscribe | null = null
let unsubJobCards: Unsubscribe | null = null

export const useAccountingStore = create<AccountingState>((set, get) => ({
  taxCategories: [],
  vatReturns: [],
  localJobPayments: [],
  localExpenses: [],
  localPoultrySales: [],
  localJobCards: [],
  loading: false,
  error: null,

  fetchTaxCategories: async () => {
    set({ loading: true, error: null })
    try {
      const q = query(collection(db, 'taxCategories'), orderBy('name', 'asc'))
      const snapshot = await getDocs(q)
      set({ taxCategories: snapshot.docs.map(d => ({ id: d.id, ...d.data() } as TaxCategory)) })
    } catch (err: any) {
      set({ error: err.message })
      console.error('Failed to fetch tax categories:', err)
    } finally {
      set({ loading: false })
    }
  },

  fetchVatReturns: async () => {
    set({ loading: true, error: null })
    try {
      const q = query(collection(db, 'vatReturns'), orderBy('period', 'desc'))
      const snapshot = await getDocs(q)
      set({ vatReturns: snapshot.docs.map(d => ({ id: d.id, ...d.data() } as VatReturn)) })
    } catch (err: any) {
      set({ error: err.message })
      console.error('Failed to fetch VAT returns:', err)
    } finally {
      set({ loading: false })
    }
  },

  startListeners: () => {
    set({ loading: true })

    if (!unsubJobPayments) {
      unsubJobPayments = onSnapshot(
        query(collection(db, 'jobPayments')),
        (snap) => {
          set({ localJobPayments: snap.docs.map(d => ({ id: d.id, ...d.data() })) })
        },
        (err) => console.error('Error listening to jobPayments:', err)
      )
    }

    if (!unsubExpenses) {
      unsubExpenses = onSnapshot(
        query(collection(db, 'operationalExpenses')),
        (snap) => {
          set({ localExpenses: snap.docs.map(d => ({ id: d.id, ...d.data() })) })
        },
        (err) => console.error('Error listening to operationalExpenses:', err)
      )
    }

    if (!unsubPoultry) {
      unsubPoultry = onSnapshot(
        query(collection(db, 'poultrySales')),
        (snap) => {
          set({ localPoultrySales: snap.docs.map(d => ({ id: d.id, ...d.data() })) })
        },
        (err) => console.error('Error listening to poultrySales:', err)
      )
    }

    if (!unsubJobCards) {
      unsubJobCards = onSnapshot(
        query(collection(db, 'jobCards')),
        (snap) => {
          set({ localJobCards: snap.docs.map(d => ({ id: d.id, ...d.data() })) })
          set({ loading: false })
        },
        (err) => {
          console.error('Error listening to jobCards:', err)
          set({ loading: false })
        }
      )
    }
  },

  cleanup: () => {
    if (unsubJobPayments) { unsubJobPayments(); unsubJobPayments = null }
    if (unsubExpenses) { unsubExpenses(); unsubExpenses = null }
    if (unsubPoultry) { unsubPoultry(); unsubPoultry = null }
    if (unsubJobCards) { unsubJobCards(); unsubJobCards = null }
  },

  isInTimeframe: (dateInput: any, timeframe: 'month' | 'ytd' | 'all') => {
    if (!dateInput) return false
    let date: Date
    if (dateInput instanceof Timestamp) {
      date = dateInput.toDate()
    } else if (dateInput?.seconds) {
      date = new Timestamp(dateInput.seconds, dateInput.nanoseconds).toDate()
    } else {
      date = new Date(dateInput)
    }
    if (isNaN(date.getTime())) return false

    const now = new Date()
    if (timeframe === 'month') {
      return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
    } else if (timeframe === 'ytd') {
      return date.getFullYear() === now.getFullYear()
    }
    return true
  },

  getPeriodLabel: (timeframe) => {
    if (timeframe === 'month') {
      return new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    } else if (timeframe === 'ytd') {
      return `YTD (${new Date().getFullYear()})`
    }
    return 'All-Time Financial Overview'
  },

  fmt: (n: number) => {
    return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  },

  computePandL: (timeframe) => {
    const state = get()
    const isInTimeframe = state.isInTimeframe

    let revenue = 0
    let cogs = 0
    let opex = 0

    // 1. Revenue from jobPayments
    state.localJobPayments.forEach((payment: any) => {
      if (isInTimeframe(payment.createdAt, timeframe)) {
        revenue += Number(payment.amount || 0)
      }
    })

    // 2. Revenue from poultrySales
    state.localPoultrySales.forEach((sale: any) => {
      if (isInTimeframe(sale.date || sale.createdAt, timeframe)) {
        revenue += Number(sale.totalRevenue || sale.amount || 0)
      }
    })

    // 3. COGS & OPEX from operationalExpenses
    state.localExpenses.forEach((exp: any) => {
      if (['APPROVED', 'APPROVED_FOR_PAYMENT', 'PAYMENT_PROCESSED'].includes(exp.status) && isInTimeframe(exp.createdAt, timeframe)) {
        const amount = Number(exp.amount || 0)
        if (exp.type === 'COST_OF_SALES' || exp.category === 'Cost of Sales') {
          cogs += amount
        } else {
          opex += amount
        }
      }
    })

    // 4. Job Card inventory consumption (COGS) - APPROVED_MANAGER items
    state.localJobCards.forEach((job: any) => {
      const sections = job.requisitionSections || []
      sections.forEach((section: any) => {
        const items = section.items || []
        items.forEach((item: any) => {
          if (item.inventoryItemId && item.approvalStatus === 'APPROVED_MANAGER') {
            const itemDate = item.approvedAt || job.updatedAt || job.createdAt
            if (isInTimeframe(itemDate, timeframe)) {
              const qty = Number(item.qtyRequired || item.quantity || 0)
              const price = Number(item.irdSellingPrice || item.unitCost || item.costSnapshot || 0)
              cogs += qty * price
            }
          }
        })
      })

      const flatItems = job.requisitionItems || []
      flatItems.forEach((item: any) => {
        if (item.inventoryItemId && item.approvalStatus === 'APPROVED_MANAGER') {
          const itemDate = item.approvedAt || job.updatedAt || job.createdAt
          if (isInTimeframe(itemDate, timeframe)) {
            const qty = Number(item.qtyRequired || item.quantity || 0)
            const price = Number(item.irdSellingPrice || item.unitCost || item.costSnapshot || 0)
            const inSections = sections.some((s: any) => (s.items || []).some((si: any) => si.inventoryItemId === item.inventoryItemId))
            if (!inSections) {
              cogs += qty * price
            }
          }
        }
      })

      // Subtract Returns
      const returns = job.inventoryReturns || []
      returns.forEach((ret: any) => {
        if (ret.inventoryItemId && ret.approvalStatus === 'APPROVED_MANAGER') {
          const retDate = ret.approvedAt || job.updatedAt || job.createdAt
          if (isInTimeframe(retDate, timeframe)) {
            const qty = Number(ret.qtyReturned || 0)
            const price = Number(ret.unitPrice || 0)
            cogs -= qty * price
          }
        }
      })
    })

    const grossProfit = revenue - cogs
    const netProfit = grossProfit - opex

    return { revenue, cogs, grossProfit, operatingExpenses: opex, netProfit }
  },

  computeBalanceSheet: (cashAndBank: number, inventoryValue: number) => {
    const state = get()
    let statutoryPayables = 0

    state.localExpenses.forEach((exp: any) => {
      if (exp.type === 'STATUTORY_LIABILITY' && exp.status === 'PENDING') {
        statutoryPayables += Number(exp.amount || 0)
      }
    })

    const totalAssets = cashAndBank + inventoryValue
    const totalLiabilities = statutoryPayables
    const equity = totalAssets - totalLiabilities

    return {
      cashAndBank,
      inventoryValue,
      totalAssets,
      statutoryPayables,
      totalLiabilities,
      equity
    }
  }
}))