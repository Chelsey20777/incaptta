import { defineStore } from 'pinia'
import { ref } from 'vue'
import { db } from '@/lib/firebase'
import { collection, query, getDocs, where, Timestamp } from 'firebase/firestore'
import { calculateCapitalAllowance } from '../utils/taxEngine'

export const useTaxStore = defineStore('tax', () => {
  const netProfit = ref(0)
  const totalAddBacks = ref(0)
  const totalDeductions = ref(0)
  const taxableIncome = ref(0)
  const taxPayable = ref(0)
  const aidsLevy = ref(0)
  const loading = ref(false)
  const qpds = ref<any[]>([])
  
  const QPD_SCHEDULE = [
    { name: '1st QPD (10%)', date: 'March 25', percentage: 0.10 },
    { name: '2nd QPD (25%)', date: 'June 25', percentage: 0.25 },
    { name: '3rd QPD (30%)', date: 'Sept 25', percentage: 0.30 },
    { name: '4th QPD (35%)', date: 'Dec 20', percentage: 0.35 }
  ]

  async function calculateTax(year: number) {
    loading.value = true
    try {
      // ... existing logic ...
      const startDate = new Date(year, 0, 1)
      const endDate = new Date(year, 11, 31, 23, 59, 59)
      const startTimestamp = Timestamp.fromDate(startDate)
      const endTimestamp = Timestamp.fromDate(endDate)

      // 1. Calculate Net Profit
      let totalRevenue = 0
      let totalExpenses = 0
      
      const jobPaymentsSnap = await getDocs(query(collection(db, 'jobPayments'), where('createdAt', '>=', startTimestamp), where('createdAt', '<=', endTimestamp)))
      jobPaymentsSnap.docs.forEach(d => totalRevenue += Number(d.data().amount || 0))
      
      const poultrySalesSnap = await getDocs(query(collection(db, 'poultrySales'), where('date', '>=', startDate), where('date', '<=', endDate)))
      poultrySalesSnap.docs.forEach(d => totalRevenue += Number(d.data().totalRevenue || 0))
      
      const expensesSnap = await getDocs(query(collection(db, 'operationalExpenses'), where('createdAt', '>=', startTimestamp), where('createdAt', '<=', endTimestamp), where('status', '==', 'APPROVED')))
      expensesSnap.docs.forEach(d => totalExpenses += Number(d.data().amount || 0))
      
      netProfit.value = totalRevenue - totalExpenses

      // 2. Add Backs
      const addBacksSnap = await getDocs(query(collection(db, 'operationalExpenses'), where('createdAt', '>=', startTimestamp), where('createdAt', '<=', endTimestamp), where('status', '==', 'APPROVED'), where('taxCategory', 'in', ['NON_DEDUCTIBLE_DEPRECIATION', 'NON_DEDUCTIBLE_FINES', 'NON_DEDUCTIBLE_ENTERTAINMENT', 'NON_DEDUCTIBLE_OTHER'])))
      let addBackSum = 0
      addBacksSnap.docs.forEach(d => addBackSum += Number(d.data().amount || 0))
      totalAddBacks.value = addBackSum

      // 3. Deductions
      const assetsSnap = await getDocs(collection(db, 'assets'))
      let deductionSum = 0
      assetsSnap.docs.forEach(d => deductionSum += calculateCapitalAllowance({ id: d.id, ...d.data() } as any, year))
      totalDeductions.value = deductionSum

      // 4. Taxable Income
      taxableIncome.value = netProfit.value + totalAddBacks.value - totalDeductions.value
      
      // 5. Tax Computation
      const baseTax = taxableIncome.value > 0 ? taxableIncome.value * 0.24 : 0
      taxPayable.value = baseTax
      aidsLevy.value = baseTax * 0.03
      
      // 6. QPD Projections
      const totalTaxDue = taxPayable.value + aidsLevy.value
      qpds.value = QPD_SCHEDULE.map(qpd => ({
        ...qpd,
        amount: totalTaxDue * qpd.percentage,
        dueDate: `${qpd.date}, ${year}`
      }))
      
    } catch (error) {
      console.error('Tax Calculation Error:', error)
    } finally {
      loading.value = false
    }
  }

  return {
    netProfit,
    totalAddBacks,
    totalDeductions,
    taxableIncome,
    taxPayable,
    aidsLevy,
    qpds,
    loading,
    calculateTax
  }
})
