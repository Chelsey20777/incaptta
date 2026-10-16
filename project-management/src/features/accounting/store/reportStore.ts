import { defineStore } from 'pinia'
import { ref } from 'vue'
import { db } from '@/lib/firebase'
import { collection, query, getDocs, where, Timestamp } from 'firebase/firestore'
import { useAccountingStore } from './accountingStore'
import { useFinanceStore } from '@/features/fundTransfers/store/financeStore'

export const useReportStore = defineStore('reports', () => {
  const plData = ref({
    revenue: 0,
    cogs: 0,
    grossProfit: 0,
    operatingExpenses: 0,
    netProfit: 0
  })

  const balanceSheetData = ref({
    assets: {
      cashAndBank: 0,
      inventory: 0,
      totalAssets: 0
    },
    liabilities: {
      statutoryPayables: 0,
      totalLiabilities: 0
    },
    equity: 0
  })

  const loading = ref(false)
  const financialMetrics = ref<any[]>([])
  const inventorySalesReport = ref<any[]>([])

  async function generatePandL(year: number) {
    loading.value = true
    try {
      const start = new Date(year, 0, 1)
      const end = new Date(year, 11, 31, 23, 59, 59)
      const startTS = Timestamp.fromDate(start)
      const endTS = Timestamp.fromDate(end)

      let revenue = 0
      let cogs = 0
      let opex = 0

      // 1. Revenue
      const jobPayments = await getDocs(query(collection(db, 'jobPayments'), where('createdAt', '>=', startTS), where('createdAt', '<=', endTS)))
      jobPayments.docs.forEach(d => revenue += Number(d.data().amount || 0))

      const poultrySales = await getDocs(query(collection(db, 'poultrySales'), where('date', '>=', start), where('date', '<=', end)))
      poultrySales.docs.forEach(d => revenue += Number(d.data().totalRevenue || 0))

      // 2. COGS & OPEX (from operationalExpenses)
      const expenses = await getDocs(query(collection(db, 'operationalExpenses'), where('createdAt', '>=', startTS), where('createdAt', '<=', endTS), where('status', 'in', ['APPROVED', 'APPROVED_FOR_PAYMENT', 'PAYMENT_PROCESSED'])))
      
      expenses.docs.forEach(d => {
        const data = d.data()
        const amount = Number(data.amount || 0)
        if (data.type === 'COST_OF_SALES' || data.category === 'Cost of Sales') {
          cogs += amount
        } else {
          opex += amount
        }
      })

      const grossProfit = revenue - cogs
      plData.value = {
        revenue,
        cogs,
        grossProfit,
        operatingExpenses: opex,
        netProfit: grossProfit - opex
      }
    } catch (err) {
      console.error('Error in generatePandL:', err)
    } finally {
      loading.value = false
    }
  }

  async function generateInventoryReport() {
    loading.value = true
    try {
      const q = query(collection(db, 'jobCards'))
      const snap = await getDocs(q)
      
      const parseSafeDate = (val: any) => {
        if (!val) return null
        const d = val instanceof Timestamp ? val.toDate() : new Date(val)
        return isNaN(d.getTime()) ? null : d
      }
      
      const report: any[] = []
      snap.docs.forEach(doc => {
        const job = doc.data()
        
        // 1. Process Requisition Sections (Nested Items)
        const sections = job.requisitionSections || []
        sections.forEach((section: any) => {
          const items = section.items || []
          items.forEach((item: any, idx: number) => {
            // ONLY include items that were explicitly approved by the Manager
            if (item.inventoryItemId && item.approvalStatus === 'APPROVED_MANAGER') {
              const qty = Number(item.qtyRequired || item.quantity || 0)
              const price = Number(item.irdSellingPrice || item.unitCost || item.costSnapshot || 0)
              
              report.push({
                id: `${doc.id}_${item.inventoryItemId}_${idx}`,
                jobId: doc.id,
                jobNumber: job.generalInfo?.jobNumber || 'N/A',
                clientName: job.generalInfo?.recipientName || 'N/A',
                date: parseSafeDate(item.approvedAt) || parseSafeDate(job.updatedAt) || new Date(),
                itemId: item.inventoryItemId,
                itemName: item.itemName || item.name || 'Unknown Item',
                sku: item.sku || 'N/A',
                qty: qty,
                unitCost: price,
                totalCost: qty * price,
                isDeducted: item.inventoryDeducted || !!job.inventoryDeducted
              })
            }
          })
        })

        // 2. Process Flat Requisition Items (for backward compatibility or flat structures)
        const flatItems = job.requisitionItems || []
        flatItems.forEach((item: any, idx: number) => {
          // Check if item is an inventory item and is approved
          if (item.inventoryItemId && item.approvalStatus === 'APPROVED_MANAGER') {
            // Avoid duplicates if the item was already added from sections
            const alreadyAdded = report.some(r => r.jobId === doc.id && r.itemId === item.inventoryItemId)
            if (!alreadyAdded) {
              const qty = Number(item.qtyRequired || item.quantity || 0)
              const price = Number(item.irdSellingPrice || item.unitCost || item.costSnapshot || 0)

              report.push({
                id: `${doc.id}_flat_${item.inventoryItemId}_${idx}`,
                jobId: doc.id,
                jobNumber: job.generalInfo?.jobNumber || 'N/A',
                clientName: job.generalInfo?.recipientName || 'N/A',
                date: parseSafeDate(item.approvedAt) || parseSafeDate(job.updatedAt) || new Date(),
                itemId: item.inventoryItemId,
                itemName: item.itemName || item.name || 'Unknown Item',
                sku: item.sku || 'N/A',
                qty: qty,
                unitCost: price,
                totalCost: qty * price,
                isDeducted: item.inventoryDeducted || !!job.inventoryDeducted
              })
            }
          }
        })

        // 3. Process Inventory Returns
        const returns = job.inventoryReturns || []
        returns.forEach((ret: any, idx: number) => {
          // ONLY include returns that were explicitly approved by the Manager
          if (ret.inventoryItemId && ret.approvalStatus === 'APPROVED_MANAGER') {
            const qty = Number(ret.qtyReturned || 0)
            const price = Number(ret.unitPrice || 0)

            report.push({
              id: `${doc.id}_return_${ret.inventoryItemId}_${idx}`,
              jobId: doc.id,
              jobNumber: job.generalInfo?.jobNumber || 'N/A',
              clientName: job.generalInfo?.recipientName || 'N/A',
              date: parseSafeDate(ret.approvedAt) || parseSafeDate(job.updatedAt) || new Date(),
              itemId: ret.inventoryItemId,
              itemName: `${ret.itemName || 'Unknown Item'}`,
              sku: ret.sku || 'N/A',
              qty: -qty, // Negative quantity for returns
              unitCost: price,
              totalCost: -(qty * price), // Negative value for returns
              isDeducted: ret.inventoryReturned || !!job.inventoryDeducted,
              isReturn: true
            })
          }
        })
      })
      
      inventorySalesReport.value = report.sort((a, b) => b.date.getTime() - a.date.getTime())
    } catch (err) {
      console.error('Error in generateInventoryReport:', err)
    } finally {
      loading.value = false
    }
  }

  async function generateBalanceSheet() {
    loading.value = true
    const accountingStore = useAccountingStore()
    const financeStore = useFinanceStore()
    
    try {
      // 1. Assets
      await accountingStore.fetchInventoryValuation()
      const cashBalances = Object.values(financeStore.finalBalances).reduce((a, b) => a + b, 0)

      // 2. Liabilities (Pending Statutory)
      let statutory = 0
      const liabilities = await getDocs(query(
        collection(db, 'operationalExpenses'), 
        where('type', '==', 'STATUTORY_LIABILITY'),
        where('status', '==', 'PENDING')
      ))
      liabilities.docs.forEach(d => statutory += Number(d.data().amount || 0))

      const totalAssets = cashBalances + accountingStore.inventoryValue
      
      balanceSheetData.value = {
        assets: {
          cashAndBank: cashBalances,
          inventory: accountingStore.inventoryValue,
          totalAssets
        },
        liabilities: {
          statutoryPayables: statutory,
          totalLiabilities: statutory
        },
        equity: totalAssets - statutory
      }
    } catch (err) {
      console.error('Error in generateBalanceSheet:', err)
    } finally {
      loading.value = false
    }
  }

  async function generateFinancialMetrics(year: number) {
    loading.value = true
    
    // 0. Initialize 12 months (0-indexed for simplicity)
    // We do this first so the UI has structure even if queries fail
    const monthlyBuckets = Array.from({ length: 12 }, (_, i) => ({
      month: i,
      year: year,
      sales: 0,
      opex: 0,
      jobcardAdhoc: 0,
      staffRates: 0,
      salaries: 0
    }))
    financialMetrics.value = monthlyBuckets

    try {
      const start = new Date(year, 0, 1)
      const end = new Date(year, 11, 31, 23, 59, 59)
      const startTS = Timestamp.fromDate(start)
      const endTS = Timestamp.fromDate(end)

      // 1. Fetch all relevant data for the year
      const [jobPaymentsSnap, poultrySalesSnap, expensesSnap, jobCardsSnap] = await Promise.all([
        getDocs(query(collection(db, 'jobPayments'), where('createdAt', '>=', startTS), where('createdAt', '<=', endTS))),
        getDocs(query(collection(db, 'poultrySales'), where('date', '>=', start), where('date', '<=', end))),
        getDocs(query(collection(db, 'operationalExpenses'), where('createdAt', '>=', startTS), where('createdAt', '<=', endTS), where('status', 'in', ['APPROVED', 'APPROVED_FOR_PAYMENT', 'PAYMENT_PROCESSED']))),
        getDocs(query(collection(db, 'jobCards'), where('updatedAt', '>=', startTS), where('updatedAt', '<=', endTS), where('status', 'in', ['APPROVED_MANAGER', 'COMPLETED'])))
      ])

      // 2. Process Sales
      jobPaymentsSnap.docs.forEach(d => {
        const data = d.data()
        const date = data.createdAt?.toDate?.() || new Date()
        if (date.getFullYear() === year) {
          const monthData = monthlyBuckets[date.getMonth()]
          if (monthData) monthData.sales += Number(data.amount || 0)
        }
      })

      poultrySalesSnap.docs.forEach(d => {
        const data = d.data()
        const date = data.date instanceof Timestamp ? data.date.toDate() : new Date(data.date)
        if (date.getFullYear() === year) {
          const monthData = monthlyBuckets[date.getMonth()]
          if (monthData) monthData.sales += Number(data.totalRevenue || 0)
        }
      })

      // 3. Process Expenses (Opex, Salaries, Adhoc)
      expensesSnap.docs.forEach(d => {
        const data = d.data()
        const date = data.createdAt?.toDate?.() || new Date()
        if (date.getFullYear() === year) {
          const amount = Number(data.amount || 0)
          const type = data.type || ''
          const category = data.category || ''
          const monthData = monthlyBuckets[date.getMonth()]

          if (monthData) {
            if (['PAYROLL_NET', 'STATUTORY_LIABILITY', 'SALARY_ADVANCE'].includes(type) || category === 'Salaries & Wages' || category === 'Statutory Liabilities') {
              monthData.salaries += amount
            } else if (category === 'job-card-expense') {
              monthData.jobcardAdhoc += amount
            } else if (type !== 'COST_OF_SALES' && category !== 'Cost of Sales') {
              monthData.opex += amount
            }
          }
        }
      })

      // 4. Process Staff Rates from Job Cards
      jobCardsSnap.docs.forEach(d => {
        const job = d.data()
        const date = job.updatedAt?.toDate?.() || new Date()
        if (date.getFullYear() === year) {
          const ratesTotal = (job.staffRates || [])
            .filter((r: any) => r.approvalStatus === 'APPROVED_MANAGER')
            .reduce((sum: number, r: any) => sum + (Number(r.jobRateAmount) || 0), 0)
          
          const monthData = monthlyBuckets[date.getMonth()]
          if (monthData) monthData.staffRates += ratesTotal
        }
      })

      financialMetrics.value = [...monthlyBuckets]
    } catch (err) {
      console.error('Error in generateFinancialMetrics:', err)
      // We keep the initialized buckets so the chart still renders (with 0s)
    } finally {
      loading.value = false
    }
  }

  return {
    plData,
    balanceSheetData,
    inventorySalesReport,
    financialMetrics,
    loading,
    generatePandL,
    generateBalanceSheet,
    generateInventoryReport,
    generateFinancialMetrics
  }
})
