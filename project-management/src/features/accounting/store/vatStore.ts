import { defineStore } from 'pinia'
import { ref } from 'vue'
import { db } from '@/lib/firebase'
import { collection, query, getDocs, where, Timestamp } from 'firebase/firestore'

export const useVatStore = defineStore('vat', () => {
  const outputVat = ref(0)
  const inputVat = ref(0)
  const netVatPayable = ref(0)
  
  const poultryVat = ref(0)
  const jobVat = ref(0)
  
  const loading = ref(false)

  async function calculateVat(month: number, year: number) {
    loading.value = true
    poultryVat.value = 0
    jobVat.value = 0
    try {
      const startDate = new Date(year, month - 1, 1)
      const endDate = new Date(year, month, 0, 23, 59, 59)
      const startTimestamp = Timestamp.fromDate(startDate)
      const endTimestamp = Timestamp.fromDate(endDate)

      // 1. Calculate Output VAT (from Poultry Sales & Job Payments)
      let totalOutput = 0
      
      const poultrySalesSnap = await getDocs(query(
        collection(db, 'poultrySales'),
        where('date', '>=', startDate),
        where('date', '<=', endDate)
      ))
      
      // Poultry Sales logic (assuming price is inclusive of VAT)
      poultrySalesSnap.docs.forEach(doc => {
        const data = doc.data()
        const revenue = Number(data.totalRevenue || 0)
        const vat = (revenue / 1.15) * 0.15
        poultryVat.value += vat
        totalOutput += vat
      })

      // Job Payments (Income)
      const jobPaymentsSnap = await getDocs(query(
        collection(db, 'jobPayments'),
        where('createdAt', '>=', startTimestamp),
        where('createdAt', '<=', endTimestamp)
      ))

      jobPaymentsSnap.docs.forEach(doc => {
        const data = doc.data()
        const amount = Number(data.amount || 0)
        const vat = (amount / 1.15) * 0.15
        jobVat.value += vat
        totalOutput += vat
      })

      outputVat.value = totalOutput

      // 2. Calculate Input VAT (from operationalExpenses)
      let totalInput = 0
      const expensesSnap = await getDocs(query(
        collection(db, 'operationalExpenses'),
        where('createdAt', '>=', startTimestamp),
        where('createdAt', '<=', endTimestamp),
        where('status', '==', 'APPROVED') // Only approved/paid expenses
      ))

      expensesSnap.docs.forEach(doc => {
        const data = doc.data()
        // Only calculate VAT for categories that typically have VAT (Excluding Salaries, Bank Charges)
        const nonTaxableCategories = ['Salaries & Wages', 'Bank Charges', 'Tax Payment']
        if (!nonTaxableCategories.includes(data.category)) {
          const amount = Number(data.amount || 0)
          totalInput += (amount / 1.15) * 0.15
        }
      })

      inputVat.value = totalInput
      netVatPayable.value = outputVat.value - inputVat.value

    } catch (error) {
      console.error('VAT Calculation Error:', error)
    } finally {
      loading.value = false
    }
  }

  return {
    outputVat,
    inputVat,
    netVatPayable,
    poultryVat,
    jobVat,
    loading,
    calculateVat
  }
})
