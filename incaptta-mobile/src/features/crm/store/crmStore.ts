import { defineStore } from 'pinia'
import { ref, computed, onUnmounted } from 'vue'
import { db } from '@/lib/firebase'
import { 
  collection, query, onSnapshot, addDoc, doc, updateDoc, 
  serverTimestamp, orderBy, getDoc, getDocs, where
} from 'firebase/firestore'
import type { Customer, Quotation, Invoice } from '../types'

export const useCrmStore = defineStore('crm', () => {
  const customers = ref<Customer[]>([])
  const quotations = ref<Quotation[]>([])
  const invoices = ref<Invoice[]>([])
  const loading = ref(false)
  const currentCustomer = ref<Customer | null>(null)
  const currentQuotation = ref<Quotation | null>(null)
  const currentInvoice = ref<Invoice | null>(null)
  const error = ref<string | null>(null)

  let unsubCustomers: (() => void) | null = null
  let unsubQuotes: (() => void) | null = null
  let unsubInvoices: (() => void) | null = null

  const activeCustomers = computed(() =>
    customers.value.filter(c => c.status === 'ACTIVE')
  )

  const pendingQuotations = computed(() =>
    quotations.value.filter(q => q.status === 'SENT')
  )

  const unpaidInvoices = computed(() =>
    invoices.value.filter(i => i.status !== 'PAID')
  )

  const totalRevenue = computed(() =>
    invoices.value
      .filter(i => i.status === 'PAID')
      .reduce((sum, i) => sum + (i.paidAmount || 0), 0)
  )

  const fetchCustomers = () => {
    loading.value = true
    const q = query(collection(db, 'customers'), orderBy('createdAt', 'desc'))
    unsubCustomers = onSnapshot(q, (snapshot) => {
      customers.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Customer[]
      loading.value = false
    })
  }

  const fetchQuotations = () => {
    loading.value = true
    const q = query(collection(db, 'crmQuotes'), orderBy('createdAt', 'desc'))
    unsubQuotes = onSnapshot(q, (snapshot) => {
      quotations.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Quotation[]
      loading.value = false
    })
  }

  const fetchInvoices = () => {
    loading.value = true
    const q = query(collection(db, 'crmInvoices'), orderBy('createdAt', 'desc'))
    unsubInvoices = onSnapshot(q, (snapshot) => {
      invoices.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Invoice[]
      loading.value = false
    })
  }

  const setCurrentCustomer = (customer: Customer | null) => {
    currentCustomer.value = customer
  }

  const setCurrentQuotation = (quotation: Quotation | null) => {
    currentQuotation.value = quotation
  }

  const setCurrentInvoice = (invoice: Invoice | null) => {
    currentInvoice.value = invoice
  }

  const createCustomer = async (data: Partial<Customer>, userId: string) => {
    try {
      await addDoc(collection(db, 'customers'), {
        ...data,
        status: 'ACTIVE',
        createdBy: userId,
        createdAt: serverTimestamp()
      })
    } catch (err) {
      console.error('[CrmStore] Error creating customer:', err)
      throw err
    }
  }

  const updateCustomer = async (id: string, updates: Partial<Customer>) => {
    try {
      const docRef = doc(db, 'customers', id)
      await updateDoc(docRef, { ...updates, updatedAt: serverTimestamp() })
    } catch (err) {
      console.error('[CrmStore] Error updating customer:', err)
      throw err
    }
  }

  const approveQuoteToInvoice = async (quoteId: string) => {
    try {
      const quoteRef = doc(db, 'crmQuotes', quoteId)
      const quoteSnap = await getDoc(quoteRef)
      if (!quoteSnap.exists()) throw new Error('Quote not found')
      const quoteData = quoteSnap.data()

      await updateDoc(quoteRef, { status: 'APPROVED', updatedAt: serverTimestamp() })

      const invoicePayload = {
        ...quoteData,
        originalQuoteId: quoteId,
        status: 'UNPAID',
        amountPaid: 0,
        createdAt: serverTimestamp()
      }
      delete (invoicePayload as any).updatedAt

      await addDoc(collection(db, 'crmInvoices'), invoicePayload)
    } catch (err) {
      console.error('[CrmStore] Error approving quote:', err)
      throw err
    }
  }

  const cleanup = () => {
    unsubCustomers?.()
    unsubQuotes?.()
    unsubInvoices?.()
  }

  onUnmounted(cleanup)

  return {
    customers,
    quotations,
    invoices,
    loading,
    error,
    currentCustomer,
    currentQuotation,
    currentInvoice,
    activeCustomers,
    pendingQuotations,
    unpaidInvoices,
    totalRevenue,
    fetchCustomers,
    fetchQuotations,
    fetchInvoices,
    setCurrentCustomer,
    setCurrentQuotation,
    setCurrentInvoice,
    createCustomer,
    updateCustomer,
    approveQuoteToInvoice,
    cleanup
  }
})
