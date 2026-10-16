'use client'

import { accrualPayrollEnabled } from '@/lib/payroll/client'
import { fetchPayrollAccounting } from '@/lib/payroll/reporting'
import { payrollTotals } from '@/lib/payroll/core'
import { create } from 'zustand'
import { db } from '@/lib/firebase'
import {
  collection,
  query,
  getDocs,
  where,
  Timestamp,
} from 'firebase/firestore'
import { fetchCashbookBalances } from '@/lib/cashbook'

export interface PLData {
  revenue: number
  cogs: number
  grossProfit: number
  operatingExpenses: number
  netProfit: number
}

export interface BalanceSheetData {
  assets: {
    cashAndBank: number
    inventory: number
    employeeAdvances: number
    totalAssets: number
  }
  liabilities: {
    salariesPayable: number
    statutoryPayables: number
    businessLoans: number
    totalLiabilities: number
  }
  equity: number
}

export interface MonthlyMetric {
  month: number
  year: number
  sales: number
  opex: number
  jobcardAdhoc: number
  staffRates: number
  salaries: number
}

export interface InventorySaleItem {
  date: Date
  jobNumber: string
  clientName: string
  itemName: string
  sku: string
  qty: number
  unitCost: number
  totalCost: number
  isDeducted: boolean
  isReturn: boolean
}

interface ReportState {
  payrollWarnings: string[]
  plData: PLData
  balanceSheetData: BalanceSheetData
  inventorySalesReport: InventorySaleItem[]
  financialMetrics: MonthlyMetric[]
  loading: boolean
  generatePandL: (year: number) => Promise<void>
  generateBalanceSheet: () => Promise<void>
  generateInventoryReport: () => Promise<void>
  generateFinancialMetrics: (year: number) => Promise<void>
}

export const useReportStore = create<ReportState>((set, get) => ({
  payrollWarnings: [],
  plData: { revenue: 0, cogs: 0, grossProfit: 0, operatingExpenses: 0, netProfit: 0 },
  balanceSheetData: {
    assets: { cashAndBank: 0, inventory: 0, employeeAdvances: 0, totalAssets: 0 },
    liabilities: { salariesPayable: 0, statutoryPayables: 0, businessLoans: 0, totalLiabilities: 0 },
    equity: 0,
  },
  inventorySalesReport: [],
  financialMetrics: [],
  loading: false,

  generatePandL: async (year: number) => {
    set({ loading: true })
    try {
      const start = new Date(year, 0, 1)
      const end = new Date(year, 11, 31, 23, 59, 59)
      const startTS = Timestamp.fromDate(start)
      const endTS = Timestamp.fromDate(end)

      let revenue = 0
      let cogs = 0
      let opex = 0

      const jobPayments = await getDocs(
        query(collection(db, 'jobPayments'),
          where('createdAt', '>=', startTS),
          where('createdAt', '<=', endTS))
      )
      jobPayments.docs.forEach((d) => (revenue += Number(d.data().amount || 0)))

      const poultrySales = await getDocs(
        query(collection(db, 'poultrySales'),
          where('date', '>=', start),
          where('date', '<=', end))
      )
      poultrySales.docs.forEach((d) => (revenue += Number(d.data().totalRevenue || 0)))

      const expenses = await getDocs(
        query(collection(db, 'operationalExpenses'),
          where('createdAt', '>=', startTS),
          where('createdAt', '<=', endTS),
          where('status', 'in', ['APPROVED', 'APPROVED_FOR_PAYMENT', 'PAYMENT_PROCESSED']))
      )

      expenses.docs.forEach((d) => {
        const data = d.data()
        const amount = Number(data.amount || 0)
        if (data.type === 'SALARY_ADVANCE' || data.type === 'PAYROLL_SETTLEMENT') return
        if (data.type === 'COST_OF_SALES' || data.category === 'Cost of Sales') {
          cogs += amount
        } else {
          opex += amount
        }
      })

      const payroll = await fetchPayrollAccounting(`${year}-12-31`, `${year}-01-01`)
      set({ payrollWarnings: payroll.warnings })
      opex += payroll.currencies.USD?.expense || 0
      const grossProfit = revenue - cogs
      set({
        plData: { revenue, cogs, grossProfit, operatingExpenses: opex, netProfit: grossProfit - opex },
      })
    } catch (err) {
      console.error('Error in generatePandL:', err)
    } finally {
      set({ loading: false })
    }
  },
  generateBalanceSheet: async () => {
    set({ loading: true })
    try {
      // Live cashbook (same rules as the ledger page / dashboard), replacing the
      // deprecated `ledger` collection which used a different account vocabulary
      // and never included IRD.
      const cashbook = await fetchCashbookBalances()
      const bankBalance = cashbook.BANK
      const cashBalance = cashbook.CASH
      const ecoCashBalance = cashbook.ECOCASH
      const irdBalance = cashbook.IRD
      const salariesBalance = cashbook.SALARIES

      let inventoryValue = 0
      const invSnap = await getDocs(query(collection(db, 'inventoryItems')))
      invSnap.docs.forEach((d) => {
        const data = d.data()
        const qty = Number(data.quantityOnHand || data.qty || 0)
        const unitCost = Number(data.unitCost || data.purchasePrice || 0)
        inventoryValue += qty * Math.abs(unitCost)
      })

      let statutoryPayables = 0
      const expSnap = await getDocs(
        query(collection(db, 'operationalExpenses'),
          where('status', 'in', (accrualPayrollEnabled ? ['PENDING', 'APPROVED', 'APPROVED_FOR_PAYMENT', 'PAYMENT_PROCESSED'] : ['APPROVED', 'APPROVED_FOR_PAYMENT', 'PAYMENT_PROCESSED'])))
      )
      expSnap.docs.forEach((d) => {
        const data = d.data()
        if ((data.type === 'STATUTORY_LIABILITY' || data.category === 'Statutory Liabilities') && (!accrualPayrollEnabled || data.status !== 'PAYMENT_PROCESSED')) {
          statutoryPayables += Number(data.amount || 0)
        }
      })

      // Salaries/Reserve wallets are earmarked cash the business still holds —
      // assets, not liabilities. Unpaid statutory amounts remain the liability.
      const cashAndBank = bankBalance + cashBalance + ecoCashBalance + irdBalance + salariesBalance + cashbook.RESERVE
      let employeeAdvances = 0
      const advancesSnap = await getDocs(query(collection(db, 'salaryAdvances')))
      advancesSnap.docs.forEach((d) => {
        const advance = d.data()
        if (advance.status === 'ACTIVE') employeeAdvances += Math.max(0, Number(advance.outstandingBalance || 0))
      })
      const totalAssets = cashAndBank + inventoryValue + employeeAdvances
      let businessLoans = 0
      const lenderSnap = await getDocs(query(collection(db, 'businessLoanLenders')))
      lenderSnap.docs.forEach((d) => {
        businessLoans += Math.max(0, Number(d.data().outstandingPrincipal || 0))
      })
      const payroll = await fetchPayrollAccounting()
      set({ payrollWarnings: payroll.warnings })
      const salariesPayable = payroll.currencies.USD?.employeePayable || 0
      statutoryPayables += payroll.currencies.USD?.statutoryPayable || 0
      const totalLiabilities = statutoryPayables + businessLoans + salariesPayable
      const equity = totalAssets - totalLiabilities

      set({
        balanceSheetData: {
          assets: { cashAndBank, inventory: inventoryValue, employeeAdvances, totalAssets },
          liabilities: { salariesPayable, statutoryPayables, businessLoans, totalLiabilities },
          equity,
        },
      })
    } catch (err) {
      console.error('Error in generateBalanceSheet:', err)
    } finally {
      set({ loading: false })
    }
  },
  generateInventoryReport: async () => {
    set({ loading: true })
    try {
      const [snap, ledgerSnap] = await Promise.all([
        getDocs(query(collection(db, 'jobCards'))),
        getDocs(query(collection(db, 'stockLedger'))),
      ])
      const report: InventorySaleItem[] = []
      const ledgerIds = new Set(ledgerSnap.docs.map(entry => entry.id))
      const sourceKeys = new Set(ledgerSnap.docs.map(entry => {
        const value = entry.data()
        return `${value.sourceType || ''}:${value.sourceId || ''}:${value.sourceLineId || ''}`
      }))

      const parseSafeDate = (val: any): Date | null => {
        if (!val) return null
        const d = val instanceof Timestamp ? val.toDate() : new Date(val)
        return isNaN(d.getTime()) ? null : d
      }

      snap.docs.forEach((doc) => {
        const job = doc.data()

        const seen = new Set<string>()
        const items = (job.requisitionSections || []).flatMap((section: any) => section.items || [])
        for (const item of [...items, ...(job.requisitionItems || [])]) {
          if (!item.id || seen.has(item.id) || item.approvalStatus !== 'APPROVED_MANAGER') continue
          seen.add(item.id)
          const qty = Number(item.qtyRequired ?? item.quantity ?? item.qty ?? 0)
          const unitCost = Number(item.costSnapshot?.purchasePrice ?? item.costSnapshot ?? item.unitCost ?? 0)
          const posted = (item.postingLedgerId && ledgerIds.has(item.postingLedgerId))
            || sourceKeys.has(`JOB_CARD_ISSUE:${doc.id}:${item.id}`)
          report.push({
            date: parseSafeDate(item.approvedAt || job.updatedAt || job.createdAt) || new Date(),
            jobNumber: job.generalInfo?.jobNumber || job.jobNumber || doc.id,
            clientName: job.generalInfo?.recipientName || job.client?.name || job.clientName || 'Unknown',
            itemName: item.itemName || item.name || 'Unknown Item', sku: item.sku || 'N/A',
            qty, unitCost, totalCost: qty * unitCost, isDeducted: posted, isReturn: false,
          })
        }

        for (const ret of job.inventoryReturns || []) {
          if (ret.approvalStatus !== 'APPROVED_MANAGER') continue
          const retQty = Number(ret.qtyReturned || 0)
          const retUC = Number(ret.unitCost || ret.unitPrice || 0)
          const posted = (ret.postingLedgerId && ledgerIds.has(ret.postingLedgerId))
            || sourceKeys.has(`JOB_CARD_RETURN:${doc.id}:${ret.id}`)
          report.push({
            date: parseSafeDate(ret.approvedAt || job.updatedAt) || new Date(),
            jobNumber: job.generalInfo?.jobNumber || job.jobNumber || doc.id,
            clientName: job.generalInfo?.recipientName || job.client?.name || job.clientName || 'Unknown',
            itemName: ret.itemName || ret.name || 'Returned Item', sku: ret.sku || 'N/A',
            qty: -retQty, unitCost: retUC, totalCost: -(retQty * retUC),
            isDeducted: posted, isReturn: true,
          })
        }
      })

      set({ inventorySalesReport: report })
    } catch (err) {
      console.error('Error in generateInventoryReport:', err)
    } finally {
      set({ loading: false })
    }
  },
  generateFinancialMetrics: async (year: number) => {
    set({ loading: true })
    try {
      const start = new Date(year, 0, 1)
      const end = new Date(year, 11, 31, 23, 59, 59)
      const startTS = Timestamp.fromDate(start)
      const endTS = Timestamp.fromDate(end)

      const monthlyBuckets: MonthlyMetric[] = Array.from({ length: 12 }, (_, i) => ({
        month: i, year, sales: 0, opex: 0, jobcardAdhoc: 0, staffRates: 0, salaries: 0,
      }))

      const [jobPaymentsSnap, poultrySalesSnap, expensesSnap, jobCardsSnap] = await Promise.all([
        getDocs(query(collection(db, 'jobPayments'), where('createdAt', '>=', startTS), where('createdAt', '<=', endTS))),
        getDocs(query(collection(db, 'poultrySales'), where('date', '>=', start), where('date', '<=', end))),
        getDocs(query(collection(db, 'operationalExpenses'), where('createdAt', '>=', startTS), where('createdAt', '<=', endTS), where('status', 'in', ['APPROVED', 'APPROVED_FOR_PAYMENT', 'PAYMENT_PROCESSED']))),
        getDocs(query(collection(db, 'jobCards'), where('updatedAt', '>=', startTS), where('updatedAt', '<=', endTS), where('status', 'in', ['APPROVED_MANAGER', 'COMPLETED']))),
      ])

      jobPaymentsSnap.docs.forEach((d) => {
        const data = d.data()
        const date = data.createdAt?.toDate?.() || new Date()
        if (date.getFullYear() === year) {
          const m = monthlyBuckets[date.getMonth()]
          if (m) m.sales += Number(data.amount || 0)
        }
      })
      poultrySalesSnap.docs.forEach((d) => {
        const data = d.data()
        const date = data.date instanceof Timestamp ? data.date.toDate() : new Date(data.date)
        if (date.getFullYear() === year) {
          const m = monthlyBuckets[date.getMonth()]
          if (m) m.sales += Number(data.totalRevenue || 0)
        }
      })
      expensesSnap.docs.forEach((d) => {
        const data = d.data()
        const date = data.createdAt?.toDate?.() || new Date()
        if (date.getFullYear() === year) {
          if (accrualPayrollEnabled && (data.type === 'PAYROLL_SETTLEMENT' || data.type === 'SALARY_ADVANCE')) return
          const amount = Number(data.amount || 0)
          const type = data.type || ''
          const category = data.category || ''
          const m = monthlyBuckets[date.getMonth()]
          if (m) {
            if (['PAYROLL_NET', 'STATUTORY_LIABILITY', 'SALARY_ADVANCE'].includes(type) || category === 'Salaries & Wages' || category === 'Statutory Liabilities') {
              m.salaries += amount
            } else if (category === 'job-card-expense') {
              m.jobcardAdhoc += amount
            } else if (type !== 'COST_OF_SALES' && category !== 'Cost of Sales') {
              m.opex += amount
            }
          }
        }
      })
      jobCardsSnap.docs.forEach((d) => {
        // Staging wage expense comes from payroll recognition; job rates remain job-cost detail.
        if (accrualPayrollEnabled) return
        const job = d.data()
        const date = job.updatedAt?.toDate?.() || new Date()
        if (date.getFullYear() === year) {
          const ratesTotal = (job.staffRates || [])
            .filter((r: any) => r.approvalStatus === 'APPROVED_MANAGER')
            .reduce((sum: number, r: any) => sum + (Number(r.jobRateAmount) || 0), 0)
          const m = monthlyBuckets[date.getMonth()]
          if (m) m.staffRates += ratesTotal
        }
      })

      const payroll = await fetchPayrollAccounting(`${year}-12-31`, `${year}-01-01`)
      for (const bucket of monthlyBuckets) {
        const from = `${year}-${String(bucket.month + 1).padStart(2, '0')}-01`
        const end = new Date(Date.UTC(year, bucket.month + 1, 0)).toISOString().slice(0, 10)
        bucket.salaries += payrollTotals(payroll.journals, payroll.payments, end, from).USD?.expense || 0
      }
      set({ financialMetrics: monthlyBuckets })
    } catch (err) {
      console.error('Error in generateFinancialMetrics:', err)
    } finally {
      set({ loading: false })
    }
  },
}))
