'use client'

import { create } from 'zustand'
import { db } from '@/lib/firebase'
import {
  collection,
  query,
  getDocs,
  where,
  Timestamp,
} from 'firebase/firestore'

interface VatState {
  outputVat: number
  inputVat: number
  netVatPayable: number
  poultryVat: number
  jobVat: number
  loading: boolean
  calculateVat: (month: number, year: number) => Promise<void>
}

export const useVatStore = create<VatState>((set) => ({
  outputVat: 0,
  inputVat: 0,
  netVatPayable: 0,
  poultryVat: 0,
  jobVat: 0,
  loading: false,

  calculateVat: async (month: number, year: number) => {
    set({ loading: true, poultryVat: 0, jobVat: 0 })
    try {
      const startDate = new Date(year, month - 1, 1)
      const endDate = new Date(year, month, 0, 23, 59, 59)
      const startTimestamp = Timestamp.fromDate(startDate)
      const endTimestamp = Timestamp.fromDate(endDate)

      let totalOutput = 0
      let poultryVat = 0
      let jobVat = 0

      // Output VAT from Poultry Sales
      const poultrySalesSnap = await getDocs(
        query(collection(db, 'poultrySales'),
          where('date', '>=', startDate),
          where('date', '<=', endDate))
      )
      poultrySalesSnap.docs.forEach((doc) => {
        const data = doc.data()
        const revenue = Number(data.totalRevenue || 0)
        const vat = (revenue / 1.15) * 0.15
        poultryVat += vat
        totalOutput += vat
      })

      // Output VAT from Job Payments
      const jobPaymentsSnap = await getDocs(
        query(collection(db, 'jobPayments'),
          where('createdAt', '>=', startTimestamp),
          where('createdAt', '<=', endTimestamp))
      )
      jobPaymentsSnap.docs.forEach((doc) => {
        const data = doc.data()
        const amount = Number(data.amount || 0)
        const vat = (amount / 1.15) * 0.15
        jobVat += vat
        totalOutput += vat
      })

      // Input VAT from Expenses
      let totalInput = 0
      const nonTaxableCategories = ['Salaries & Wages', 'Bank Charges', 'Tax Payment']
      const expensesSnap = await getDocs(
        query(collection(db, 'operationalExpenses'),
          where('createdAt', '>=', startTimestamp),
          where('createdAt', '<=', endTimestamp),
          where('status', '==', 'APPROVED'))
      )
      expensesSnap.docs.forEach((doc) => {
        const data = doc.data()
        if (!nonTaxableCategories.includes(data.category)) {
          const amount = Number(data.amount || 0)
          totalInput += (amount / 1.15) * 0.15
        }
      })

      const netVatPayable = totalOutput - totalInput

      set({
        outputVat: totalOutput,
        inputVat: totalInput,
        netVatPayable,
        poultryVat,
        jobVat,
      })
    } catch (error) {
      console.error('VAT Calculation Error:', error)
    } finally {
      set({ loading: false })
    }
  },
}))
