'use client'

import { fetchPayrollAccounting } from '@/lib/payroll/reporting'
import { accrualPayrollEnabled } from '@/lib/payroll/client'
import { create } from 'zustand'
import { db } from '@/lib/firebase'
import {
  collection,
  query,
  getDocs,
  where,
  Timestamp,
} from 'firebase/firestore'
import { calculateCapitalAllowance, type Asset } from '@/lib/tax-engine'

interface QpdItem {
  name: string
  date: string
  percentage: number
  amount: number
  dueDate: string
}

interface TaxState {
  netProfit: number
  totalAddBacks: number
  totalDeductions: number
  taxableIncome: number
  taxPayable: number
  aidsLevy: number
  qpds: QpdItem[]
  loading: boolean
  calculateTax: (year: number) => Promise<void>
}

const QPD_SCHEDULE = [
  { name: '1st QPD (10%)', date: 'March 25', percentage: 0.10 },
  { name: '2nd QPD (25%)', date: 'June 25', percentage: 0.25 },
  { name: '3rd QPD (30%)', date: 'Sept 25', percentage: 0.30 },
  { name: '4th QPD (35%)', date: 'Dec 20', percentage: 0.35 },
]

export const useTaxStore = create<TaxState>((set) => ({
  netProfit: 0,
  totalAddBacks: 0,
  totalDeductions: 0,
  taxableIncome: 0,
  taxPayable: 0,
  aidsLevy: 0,
  qpds: [],
  loading: false,

  calculateTax: async (year: number) => {
    set({ loading: true })
    try {
      const startDate = new Date(year, 0, 1)
      const endDate = new Date(year, 11, 31, 23, 59, 59)
      const startTimestamp = Timestamp.fromDate(startDate)
      const endTimestamp = Timestamp.fromDate(endDate)

      // 1. Net Profit
      let totalRevenue = 0
      let totalExpenses = 0

      const jobPaymentsSnap = await getDocs(
        query(collection(db, 'jobPayments'),
          where('createdAt', '>=', startTimestamp),
          where('createdAt', '<=', endTimestamp))
      )
      jobPaymentsSnap.docs.forEach((d) => (totalRevenue += Number(d.data().amount || 0)))

      const poultrySalesSnap = await getDocs(
        query(collection(db, 'poultrySales'),
          where('date', '>=', startDate),
          where('date', '<=', endDate))
      )
      poultrySalesSnap.docs.forEach((d) => (totalRevenue += Number(d.data().totalRevenue || 0)))

      const expensesSnap = await getDocs(
        query(collection(db, 'operationalExpenses'),
          where('createdAt', '>=', startTimestamp),
          where('createdAt', '<=', endTimestamp),
          where('status', '==', 'APPROVED'))
      )
      expensesSnap.docs.forEach((d) => { if (!accrualPayrollEnabled || !['PAYROLL_SETTLEMENT', 'SALARY_ADVANCE'].includes(d.data().type)) totalExpenses += Number(d.data().amount || 0) })
      const payroll = await fetchPayrollAccounting(`${year}-12-31`, `${year}-01-01`)
      totalExpenses += payroll.currencies.USD?.expense || 0

      const netProfit = totalRevenue - totalExpenses

      // 2. Add Backs
      const addBacksSnap = await getDocs(
        query(collection(db, 'operationalExpenses'),
          where('createdAt', '>=', startTimestamp),
          where('createdAt', '<=', endTimestamp),
          where('status', '==', 'APPROVED'),
          where('taxCategory', 'in', [
            'NON_DEDUCTIBLE_DEPRECIATION',
            'NON_DEDUCTIBLE_FINES',
            'NON_DEDUCTIBLE_ENTERTAINMENT',
            'NON_DEDUCTIBLE_OTHER',
          ]))
      )
      let addBackSum = 0
      addBacksSnap.docs.forEach((d) => (addBackSum += Number(d.data().amount || 0)))

      // 3. Deductions (Capital Allowances)
      const assetsSnap = await getDocs(collection(db, 'assets'))
      let deductionSum = 0
      assetsSnap.docs.forEach((d) => {
        deductionSum += calculateCapitalAllowance(
          { id: d.id, ...d.data() } as Asset,
          year
        )
      })

      // 4. Taxable Income
      const taxableIncome = netProfit + addBackSum - deductionSum

      // 5. Tax Computation
      const baseTax = taxableIncome > 0 ? taxableIncome * 0.24 : 0
      const taxPayable = baseTax
      const aidsLevy = baseTax * 0.03

      // 6. QPD Projections
      const totalTaxDue = taxPayable + aidsLevy
      const qpds: QpdItem[] = QPD_SCHEDULE.map((qpd) => ({
        ...qpd,
        amount: totalTaxDue * qpd.percentage,
        dueDate: `${qpd.date}, ${year}`,
      }))

      set({
        netProfit,
        totalAddBacks: addBackSum,
        totalDeductions: deductionSum,
        taxableIncome,
        taxPayable,
        aidsLevy,
        qpds,
      })
    } catch (error) {
      console.error('Tax Calculation Error:', error)
    } finally {
      set({ loading: false })
    }
  },
}))
