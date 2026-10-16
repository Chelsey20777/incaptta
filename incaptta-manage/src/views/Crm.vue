<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { db } from '@/lib/firebase'
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, deleteDoc } from 'firebase/firestore'
import { useRouter } from 'vue-router'
import { useSession } from '@/composables/useSession'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { 
  ChevronLeft, 
  Plus, 
  Search, 
  Loader2, 
  Phone, 
  Mail, 
  Building2, 
  X,
  User,
  Target,
  Users,
  FileText,
  Receipt,
  DollarSign,
  Trash2,
  Calendar,
  MapPin
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'

// Interfaces & Types
type LeadStage = 'New' | 'Contacted' | 'Qualified' | 'Proposal' | 'Negotiation' | 'Won' | 'Lost'
type LeadPriority = 'Low' | 'Medium' | 'High'

interface Lead {
  id: string
  companyName: string
  contactName: string
  email: string
  phone: string
  stage: LeadStage
  priority: LeadPriority
  value: number
  source: string
  notes: string
  assignedTo: string
  expectedCloseDate: string
  createdAt: any
}

interface Customer {
  id: string
  name: string
  email: string
  phone: string
  address: string
  createdAt: any
}

interface QuoteItem {
  description: string
  qty: number
  unitPrice: number
}

interface Quote {
  id: string
  quoteRef: string
  customerId: string
  customerName: string
  grandTotal: number
  status: 'DRAFT' | 'APPROVED'
  items: QuoteItem[]
  notes?: string
  createdAt: any
}

interface InvoicePayment {
  amount: number
  method: 'CASH' | 'BANK' | 'ECOCASH'
  reference: string
  date: string
}

interface Invoice {
  id: string
  originalQuoteId?: string
  customerId: string
  customerName: string
  grandTotal: number
  amountPaid: number
  status: 'UNPAID' | 'PARTIAL' | 'PAID'
  payments: InvoicePayment[]
  items: QuoteItem[]
  notes?: string
  createdAt: any
}

const router = useRouter()
const { user } = useSession()

// Tab state
const activeTab = ref<'leads' | 'customers' | 'quotes' | 'invoices'>('leads')

// Loading & Lists State
const loading = ref(false)
const searchQuery = ref('')

const leads = ref<Lead[]>([])
const customers = ref<Customer[]>([])
const quotes = ref<Quote[]>([])
const invoices = ref<Invoice[]>([])

// Filter options
const stageFilter = ref<'all' | LeadStage>('all')
const quoteStatusFilter = ref<'all' | 'DRAFT' | 'APPROVED'>('all')
const invoiceStatusFilter = ref<'all' | 'UNPAID' | 'PARTIAL' | 'PAID'>('all')

// Collapsible List details state
const expandedQuoteId = ref('')
const expandedInvoiceId = ref('')

// Unsubscribe handles
let unsubLeads: (() => void) | null = null
let unsubCustomers: (() => void) | null = null
let unsubQuotes: (() => void) | null = null
let unsubInvoices: (() => void) | null = null

onMounted(() => {
  loading.value = true
  
  // Leads listener
  const qLeads = query(collection(db, 'leads'), orderBy('createdAt', 'desc'))
  unsubLeads = onSnapshot(qLeads, (snap) => {
    leads.value = snap.docs.map(d => ({ id: d.id, ...d.data() } as Lead))
  }, (err) => console.error('Leads error:', err))

  // Customers listener
  const qCust = query(collection(db, 'customers'), orderBy('createdAt', 'desc'))
  unsubCustomers = onSnapshot(qCust, (snap) => {
    customers.value = snap.docs.map(d => ({ id: d.id, ...d.data() } as Customer))
  }, (err) => console.error('Customers error:', err))

  // Quotes listener
  const qQuotes = query(collection(db, 'crmQuotes'), orderBy('createdAt', 'desc'))
  unsubQuotes = onSnapshot(qQuotes, (snap) => {
    quotes.value = snap.docs.map(d => ({ id: d.id, ...d.data() } as Quote))
  }, (err) => console.error('Quotes error:', err))

  // Invoices listener
  const qInvoices = query(collection(db, 'crmInvoices'), orderBy('createdAt', 'desc'))
  unsubInvoices = onSnapshot(qInvoices, (snap) => {
    invoices.value = snap.docs.map(d => ({ id: d.id, ...d.data() } as Invoice))
    loading.value = false
  }, (err) => {
    console.error('Invoices error:', err)
    loading.value = false
  })
})

onUnmounted(() => {
  unsubLeads?.()
  unsubCustomers?.()
  unsubQuotes?.()
  unsubInvoices?.()
})

const STAGES: LeadStage[] = ['New', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost']
const PRIORITIES: LeadPriority[] = ['Low', 'Medium', 'High']

// Modals display states
const showModal = ref(false) // Lead modal
const showCustomerModal = ref(false)
const showQuoteModal = ref(false)
const showPaymentModal = ref(false)

const editingLead = ref<Lead | null>(null)
const editingCustomer = ref<Customer | null>(null)
const editingQuote = ref<Quote | null>(null)
const activeInvoice = ref<Invoice | null>(null)

const isSubmitting = ref(false)

// Blank Form initializers
const blankLeadForm = () => ({
  companyName: '',
  contactName: '',
  email: '',
  phone: '',
  stage: 'New' as LeadStage,
  priority: 'Medium' as LeadPriority,
  value: 0,
  source: 'Other',
  notes: '',
  assignedTo: '',
  expectedCloseDate: ''
})

const blankCustomerForm = () => ({
  name: '',
  email: '',
  phone: '',
  address: ''
})

const blankQuoteForm = () => ({
  customerId: '',
  notes: '',
  items: [] as QuoteItem[]
})

const blankPaymentForm = () => ({
  amount: 0,
  method: 'ECOCASH' as 'CASH' | 'BANK' | 'ECOCASH',
  reference: ''
})

// Active forms refs
const form = ref(blankLeadForm())
const customerForm = ref(blankCustomerForm())
const quoteForm = ref(blankQuoteForm())
const paymentForm = ref(blankPaymentForm())

// Computed Lists
const filteredLeads = computed(() => {
  let list = [...leads.value]
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(l =>
      l.companyName?.toLowerCase().includes(q) ||
      l.contactName?.toLowerCase().includes(q) ||
      l.email?.toLowerCase().includes(q)
    )
  }
  if (stageFilter.value !== 'all') {
    list = list.filter(l => l.stage === stageFilter.value)
  }
  return list
})

const filteredCustomers = computed(() => {
  let list = [...customers.value]
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.phone?.toLowerCase().includes(q)
    )
  }
  return list
})

const filteredQuotes = computed(() => {
  let list = [...quotes.value]
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(qItem =>
      qItem.customerName?.toLowerCase().includes(q) ||
      qItem.quoteRef?.toLowerCase().includes(q)
    )
  }
  if (quoteStatusFilter.value !== 'all') {
    list = list.filter(qItem => qItem.status === quoteStatusFilter.value)
  }
  return list
})

const filteredInvoices = computed(() => {
  let list = [...invoices.value]
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(inv =>
      inv.customerName?.toLowerCase().includes(q) ||
      `inv-${inv.id.substring(0, 8)}`.toLowerCase().includes(q)
    )
  }
  if (invoiceStatusFilter.value !== 'all') {
    list = list.filter(inv => inv.status === invoiceStatusFilter.value)
  }
  return list
})

// Pagination state
const leadsPage = ref(1)
const customersPage = ref(1)
const quotesPage = ref(1)
const invoicesPage = ref(1)

// Watchers to reset page numbers when search or filters change
watch(searchQuery, () => {
  leadsPage.value = 1
  customersPage.value = 1
  quotesPage.value = 1
  invoicesPage.value = 1
})
watch(stageFilter, () => {
  leadsPage.value = 1
})
watch(quoteStatusFilter, () => {
  quotesPage.value = 1
})
watch(invoiceStatusFilter, () => {
  invoicesPage.value = 1
})

const paginatedLeads = computed(() => {
  const start = (leadsPage.value - 1) * 30
  return filteredLeads.value.slice(start, start + 30)
})

const paginatedCustomers = computed(() => {
  const start = (customersPage.value - 1) * 30
  return filteredCustomers.value.slice(start, start + 30)
})

const paginatedQuotes = computed(() => {
  const start = (quotesPage.value - 1) * 30
  return filteredQuotes.value.slice(start, start + 30)
})

const paginatedInvoices = computed(() => {
  const start = (invoicesPage.value - 1) * 30
  return filteredInvoices.value.slice(start, start + 30)
})

const totalLeadsPages = computed(() => Math.ceil(filteredLeads.value.length / 30) || 1)
const totalCustomersPages = computed(() => Math.ceil(filteredCustomers.value.length / 30) || 1)
const totalQuotesPages = computed(() => Math.ceil(filteredQuotes.value.length / 30) || 1)
const totalInvoicesPages = computed(() => Math.ceil(filteredInvoices.value.length / 30) || 1)

// Dynamic statistics computed values
const statsLeft = computed(() => {
  if (activeTab.value === 'leads') {
    const totalValue = leads.value
      .filter(l => l.stage !== 'Lost')
      .reduce((sum, l) => sum + Number(l.value || 0), 0)
    return {
      label: 'Pipeline Value',
      value: formatCurrency(totalValue)
    }
  } else if (activeTab.value === 'customers') {
    return {
      label: 'Total Clients',
      value: String(customers.value.length)
    }
  } else if (activeTab.value === 'quotes') {
    const totalValue = quotes.value
      .reduce((sum, q) => sum + Number(q.grandTotal || 0), 0)
    return {
      label: 'Total Quoted',
      value: formatCurrency(totalValue)
    }
  } else {
    const totalRevenue = invoices.value
      .reduce((sum, i) => sum + Number(i.amountPaid || 0), 0)
    return {
      label: 'Revenue Received',
      value: formatCurrency(totalRevenue)
    }
  }
})

const statsRight = computed(() => {
  if (activeTab.value === 'leads') {
    const activeLeads = leads.value.filter(l => !['Won', 'Lost'].includes(l.stage))
    return {
      label: 'Active Deals',
      value: `${activeLeads.length} leads`
    }
  } else if (activeTab.value === 'customers') {
    const withContacts = customers.value.filter(c => c.phone || c.email).length
    return {
      label: 'Contactable',
      value: `${withContacts} clients`
    }
  } else if (activeTab.value === 'quotes') {
    const drafts = quotes.value.filter(q => q.status === 'DRAFT').length
    return {
      label: 'Draft Offers',
      value: `${drafts} quotes`
    }
  } else {
    const outstanding = invoices.value
      .reduce((sum, i) => sum + (Number(i.grandTotal || 0) - Number(i.amountPaid || 0)), 0)
    return {
      label: 'Outstanding Sum',
      value: formatCurrency(outstanding)
    }
  }
})

// Actions for Leads
const openCreate = () => {
  editingLead.value = null
  form.value = blankLeadForm()
  showModal.value = true
}

const openEdit = (lead: Lead) => {
  editingLead.value = lead
  form.value = {
    companyName: lead.companyName || '',
    contactName: lead.contactName || '',
    email: lead.email || '',
    phone: lead.phone || '',
    stage: lead.stage || 'New',
    priority: lead.priority || 'Medium',
    value: lead.value || 0,
    source: lead.source || 'Other',
    notes: lead.notes || '',
    assignedTo: lead.assignedTo || '',
    expectedCloseDate: lead.expectedCloseDate || ''
  }
  showModal.value = true
}

const saveLead = async () => {
  if (!form.value.companyName.trim()) {
    toast.error('Company Name is required')
    return
  }

  isSubmitting.value = true
  try {
    if (editingLead.value) {
      await updateDoc(doc(db, 'leads', editingLead.value.id), {
        ...form.value,
        updatedAt: serverTimestamp()
      })
      toast.success('Lead Updated')
    } else {
      await addDoc(collection(db, 'leads'), {
        ...form.value,
        createdBy: {
          uid: user.value?.uid || '',
          name: user.value?.displayName || user.value?.email || 'Manager'
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
      toast.success('Lead Created')
    }
    showModal.value = false
  } catch (err: any) {
    console.error(err)
    toast.error('Failed to save lead')
  } finally {
    isSubmitting.value = false
  }
}

const updateLeadStage = async (lead: Lead, newStage: LeadStage) => {
  try {
    await updateDoc(doc(db, 'leads', lead.id), {
      stage: newStage,
      updatedAt: serverTimestamp()
    })
    toast.success(`Moved to ${newStage}`)
  } catch (err) {
    console.error(err)
    toast.error('Failed to update stage')
  }
}

// Actions for Customers
const openCreateCustomer = () => {
  editingCustomer.value = null
  customerForm.value = blankCustomerForm()
  showCustomerModal.value = true
}

const openEditCustomer = (cust: Customer) => {
  editingCustomer.value = cust
  customerForm.value = {
    name: cust.name || '',
    email: cust.email || '',
    phone: cust.phone || '',
    address: cust.address || ''
  }
  showCustomerModal.value = true
}

const saveCustomer = async () => {
  if (!customerForm.value.name.trim()) {
    toast.error('Customer name is required')
    return
  }

  isSubmitting.value = true
  try {
    if (editingCustomer.value) {
      await updateDoc(doc(db, 'customers', editingCustomer.value.id), {
        ...customerForm.value,
        updatedAt: serverTimestamp()
      })
      toast.success('Customer Updated')
    } else {
      await addDoc(collection(db, 'customers'), {
        ...customerForm.value,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
      toast.success('Customer Registered')
    }
    showCustomerModal.value = false
  } catch (err) {
    console.error(err)
    toast.error('Failed to save customer')
  } finally {
    isSubmitting.value = false
  }
}

// Actions for Quotations
const openCreateQuote = () => {
  editingQuote.value = null
  quoteForm.value = blankQuoteForm()
  addQuoteItem() // start with 1 item row
  showQuoteModal.value = true
}

const openEditQuote = (quote: Quote) => {
  editingQuote.value = quote
  quoteForm.value = {
    customerId: quote.customerId || '',
    notes: quote.notes || '',
    items: quote.items ? [...quote.items] : []
  }
  showQuoteModal.value = true
}

const addQuoteItem = () => {
  quoteForm.value.items.push({
    description: '',
    qty: 1,
    unitPrice: 0
  })
}

const removeQuoteItem = (idx: number) => {
  quoteForm.value.items.splice(idx, 1)
}

const quoteGrandTotal = computed(() => {
  return quoteForm.value.items.reduce((sum, item) => sum + (Number(item.qty || 0) * Number(item.unitPrice || 0)), 0)
})

const saveQuote = async () => {
  if (!quoteForm.value.customerId) {
    toast.error('Customer is required')
    return
  }
  if (quoteForm.value.items.length === 0) {
    toast.error('At least one item is required')
    return
  }
  if (quoteForm.value.items.some(i => !i.description.trim())) {
    toast.error('All items must have a description')
    return
  }

  isSubmitting.value = true
  try {
    const customer = customers.value.find(c => c.id === quoteForm.value.customerId)
    const customerName = customer?.name || 'Unknown Client'
    const grandTotal = quoteGrandTotal.value

    const payload = {
      customerId: quoteForm.value.customerId,
      customerName,
      items: quoteForm.value.items,
      notes: quoteForm.value.notes,
      grandTotal,
      updatedAt: serverTimestamp()
    }

    if (editingQuote.value) {
      await updateDoc(doc(db, 'crmQuotes', editingQuote.value.id), payload)
      toast.success('Quotation Updated')
    } else {
      await addDoc(collection(db, 'crmQuotes'), {
        ...payload,
        status: 'DRAFT',
        quoteRef: `QT-${Date.now().toString().slice(-6)}`,
        createdAt: serverTimestamp()
      })
      toast.success('Quotation Draft Saved')
    }
    showQuoteModal.value = false
  } catch (err) {
    console.error(err)
    toast.error('Failed to save quotation')
  } finally {
    isSubmitting.value = false
  }
}

const approveQuote = async (quote: Quote) => {
  isSubmitting.value = true
  try {
    // 1. Update quote status to APPROVED
    await updateDoc(doc(db, 'crmQuotes', quote.id), {
      status: 'APPROVED',
      updatedAt: serverTimestamp()
    })

    // 2. Generate a CRM Invoice copy in unpaid state
    const invoiceData = {
      customerId: quote.customerId,
      customerName: quote.customerName,
      grandTotal: quote.grandTotal,
      items: quote.items,
      notes: quote.notes || '',
      originalQuoteId: quote.id,
      status: 'UNPAID',
      payments: [] as InvoicePayment[],
      amountPaid: 0,
      createdAt: serverTimestamp()
    }
    await addDoc(collection(db, 'crmInvoices'), invoiceData)

    toast.success('Quote Approved & Invoice Created')
  } catch (err) {
    console.error(err)
    toast.error('Failed to convert quote to invoice')
  } finally {
    isSubmitting.value = false
  }
}

const deleteDraftQuote = async (quoteId: string) => {
  if (!confirm('Are you sure you want to delete this quote draft?')) return
  try {
    await deleteDoc(doc(db, 'crmQuotes', quoteId))
    toast.success('Quotation draft deleted')
  } catch (err) {
    console.error(err)
    toast.error('Failed to delete quote')
  }
}

// Actions for Invoices
const openPaymentModal = (invoice: Invoice) => {
  activeInvoice.value = invoice
  const remaining = invoice.grandTotal - (invoice.amountPaid || 0)
  paymentForm.value = {
    amount: Math.max(0, remaining),
    method: 'ECOCASH',
    reference: ''
  }
  showPaymentModal.value = true
}

const recordInvoicePayment = async () => {
  if (!activeInvoice.value) return
  const amount = Number(paymentForm.value.amount || 0)
  if (amount <= 0) {
    toast.error('Please enter a valid amount')
    return
  }

  const remaining = activeInvoice.value.grandTotal - (activeInvoice.value.amountPaid || 0)
  if (amount > remaining) {
    toast.error(`Amount cannot exceed the remaining balance of ${formatCurrency(remaining)}`)
    return
  }

  if (!paymentForm.value.reference.trim()) {
    toast.error('Please enter a payment reference')
    return
  }

  isSubmitting.value = true
  try {
    const invoiceRef = doc(db, 'crmInvoices', activeInvoice.value.id)
    const newTotalPaid = (activeInvoice.value.amountPaid || 0) + amount
    const newStatus = newTotalPaid >= activeInvoice.value.grandTotal ? 'PAID' : 'PARTIAL'

    const paymentObj: InvoicePayment = {
      amount,
      method: paymentForm.value.method,
      reference: paymentForm.value.reference,
      date: new Date().toISOString()
    }

    const existingPayments = activeInvoice.value.payments || []

    // 1. Update the Invoice
    await updateDoc(invoiceRef, {
      amountPaid: newTotalPaid,
      status: newStatus,
      payments: [...existingPayments, paymentObj],
      updatedAt: serverTimestamp()
    })

    // 2. Post financial INCOME to ledger jobPayments
    await addDoc(collection(db, 'jobPayments'), {
      amount,
      paymentMethod: paymentForm.value.method,
      jobCardId: `CRM-INV-${activeInvoice.value.id.substring(0, 8)}`,
      customerName: activeInvoice.value.customerName,
      referenceNote: `CRM Payment - ${paymentForm.value.reference}`,
      createdAt: serverTimestamp()
    })

    toast.success('Payment Recorded to Ledger!')
    showPaymentModal.value = false
  } catch (err) {
    console.error(err)
    toast.error('Failed to log payment')
  } finally {
    isSubmitting.value = false
  }
}

// Styling & Utilities
const stageColor = (s: LeadStage) => {
  return {
    New: 'bg-blue-500/10 text-blue-500 border-blue-500/25',
    Contacted: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/25',
    Qualified: 'bg-violet-500/10 text-violet-500 border-violet-500/25',
    Proposal: 'bg-amber-500/10 text-amber-500 border-amber-500/25',
    Negotiation: 'bg-orange-500/10 text-orange-500 border-orange-500/25',
    Won: 'bg-green-500/10 text-green-500 border-green-500/25',
    Lost: 'bg-red-500/10 text-red-500 border-red-500/25'
  }[s] || 'bg-muted text-muted-foreground'
}

const priorityColor = (p: LeadPriority) => {
  return {
    High: 'bg-red-500/15 text-red-500',
    Medium: 'bg-orange-500/15 text-orange-500',
    Low: 'bg-blue-500/15 text-blue-500'
  }[p] || 'bg-muted text-muted-foreground'
}

const formatCurrency = (v: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(v || 0)
}
</script>

<template>
  <div class="flex-1 flex flex-col pb-20 bg-background min-h-screen">
    <!-- Header -->
    <header class="sticky top-0 z-10 bg-card border-b px-4 py-4 flex items-center gap-4 shadow-sm">
      <Button variant="ghost" size="icon" @click="router.push('/')">
        <ChevronLeft class="size-6" />
      </Button>
      <div class="flex-1">
        <h1 class="text-xl font-black tracking-tight">CRM Hub</h1>
        <p class="text-xs text-muted-foreground">Monitor sales pipelines & clients</p>
      </div>
      <!-- Dynamically trigger action depending on the tab -->
      <Button 
        v-if="activeTab !== 'invoices'" 
        size="icon" 
        class="rounded-full bg-[#ff8903] hover:bg-[#ff8903]/90 text-white" 
        @click="activeTab === 'leads' ? openCreate() : activeTab === 'customers' ? openCreateCustomer() : openCreateQuote()"
      >
        <Plus class="size-5" />
      </Button>
    </header>

    <!-- Core Statistics Dashboard -->
    <section class="p-4 grid grid-cols-2 gap-3 animate-in fade-in duration-200">
      <Card class="bg-card border shadow-sm">
        <CardContent class="p-4 space-y-1">
          <p class="text-[9px] font-black uppercase text-muted-foreground tracking-widest">{{ statsLeft.label }}</p>
          <p class="text-xl font-black text-[#79c21b]">{{ statsLeft.value }}</p>
        </CardContent>
      </Card>
      <Card class="bg-card border shadow-sm">
        <CardContent class="p-4 space-y-1">
          <p class="text-[9px] font-black uppercase text-muted-foreground tracking-widest">{{ statsRight.label }}</p>
          <p class="text-xl font-black text-[#ff8903]">{{ statsRight.value }}</p>
        </CardContent>
      </Card>
    </section>

    <!-- Segments Switcher -->
    <div class="px-4">
      <div class="flex gap-1.5 border-b pb-2.5 overflow-x-auto no-scrollbar">
        <button 
          v-for="tab in ['leads', 'customers', 'quotes', 'invoices']"
          :key="tab"
          class="flex items-center gap-1.5 px-4 py-2 text-[10px] font-black uppercase tracking-wider rounded-full transition-all duration-200 whitespace-nowrap"
          :class="activeTab === tab ? 'bg-[#ff8903] text-white shadow' : 'bg-muted/40 text-muted-foreground hover:bg-muted'"
          @click="activeTab = tab as any"
        >
          <Target v-if="tab === 'leads'" class="size-3.5" />
          <Users v-if="tab === 'customers'" class="size-3.5" />
          <FileText v-if="tab === 'quotes'" class="size-3.5" />
          <Receipt v-if="tab === 'invoices'" class="size-3.5" />
          {{ tab }}
        </button>
      </div>
    </div>

    <!-- Filter & Search Toolbar -->
    <section class="px-4 pt-4 space-y-2.5">
      <div class="relative">
        <Search class="absolute left-3 top-2.5 size-4 text-muted-foreground" />
        <Input 
          v-model="searchQuery" 
          :placeholder="
            activeTab === 'leads' ? 'Search leads, companies...' :
            activeTab === 'customers' ? 'Search customer name, contact...' :
            activeTab === 'quotes' ? 'Search quote customer, reference...' :
            'Search invoices, customer...'
          " 
          class="pl-9 h-10 border bg-muted/20"
        />
      </div>

      <!-- Contextual Sub-filters -->
      <div v-if="activeTab === 'leads'" class="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
        <Button 
          variant="secondary"
          size="sm"
          :class="stageFilter === 'all' ? 'bg-[#ff8903] text-white' : ''"
          class="capitalize text-[10px] font-black px-3 rounded-full shrink-0"
          @click="stageFilter = 'all'"
        >
          All Stages
        </Button>
        <Button 
          v-for="s in STAGES" 
          :key="s"
          variant="secondary"
          size="sm"
          :class="stageFilter === s ? 'bg-[#ff8903] text-white' : ''"
          class="capitalize text-[10px] font-black px-3 rounded-full shrink-0"
          @click="stageFilter = s"
        >
          {{ s }}
        </Button>
      </div>

      <div v-else-if="activeTab === 'quotes'" class="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
        <Button 
          v-for="s in ['all', 'DRAFT', 'APPROVED']"
          :key="s"
          variant="secondary"
          size="sm"
          :class="quoteStatusFilter === s ? 'bg-[#ff8903] text-white' : ''"
          class="uppercase text-[10px] font-black px-3 rounded-full shrink-0"
          @click="quoteStatusFilter = s as any"
        >
          {{ s === 'all' ? 'All Status' : s }}
        </Button>
      </div>

      <div v-else-if="activeTab === 'invoices'" class="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
        <Button 
          v-for="s in ['all', 'UNPAID', 'PARTIAL', 'PAID']"
          :key="s"
          variant="secondary"
          size="sm"
          :class="invoiceStatusFilter === s ? 'bg-[#ff8903] text-white' : ''"
          class="uppercase text-[10px] font-black px-3 rounded-full shrink-0"
          @click="invoiceStatusFilter = s as any"
        >
          {{ s === 'all' ? 'All Invoices' : s }}
        </Button>
      </div>
    </section>

    <!-- Main List content -->
    <main class="p-4 flex-1 space-y-3">
      <div v-if="loading" class="flex flex-col items-center justify-center py-20">
        <Loader2 class="size-8 animate-spin text-primary" />
      </div>

      <!-- LEADS LIST -->
      <div v-else-if="activeTab === 'leads'" class="space-y-3">
        <div v-if="filteredLeads.length === 0" class="text-center py-20 text-muted-foreground">
          <p class="text-sm">No leads match your criteria.</p>
        </div>

        <Card 
          v-for="lead in paginatedLeads" 
          :key="lead.id" 
          class="border shadow-sm hover:shadow-md transition-shadow relative overflow-hidden"
        >
          <CardContent class="p-4 space-y-3">
            <div class="flex justify-between items-start">
              <div class="space-y-0.5">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <h3 class="font-black text-sm tracking-tight text-foreground truncate max-w-[150px]">{{ lead.companyName }}</h3>
                  <Badge variant="outline" :class="['text-[9px] font-bold h-4 px-1 rounded', stageColor(lead.stage)]">
                    {{ lead.stage }}
                  </Badge>
                </div>
                <p class="text-xs text-muted-foreground font-medium flex items-center gap-1">
                  <User class="size-3.5" /> {{ lead.contactName || 'No Contact' }}
                </p>
              </div>
              <div class="text-right">
                <span class="font-black text-sm text-[#79c21b]">{{ formatCurrency(lead.value) }}</span>
                <div class="mt-1">
                  <Badge :class="['text-[8px] h-3.5 uppercase font-bold', priorityColor(lead.priority)]">
                    {{ lead.priority }}
                  </Badge>
                </div>
              </div>
            </div>

            <div class="flex items-center gap-4 text-xs border-t border-dashed pt-3 text-muted-foreground">
              <span class="flex items-center gap-1">
                <Building2 class="size-3.5" /> {{ lead.source || 'Direct' }}
              </span>
              <span v-if="lead.assignedTo" class="flex items-center gap-1">
                💼 {{ lead.assignedTo }}
              </span>
            </div>

            <div class="flex gap-2 border-t pt-3 justify-between items-center">
              <div class="flex gap-1">
                <a 
                  v-if="lead.phone" 
                  :href="`tel:${lead.phone}`" 
                  class="size-8 rounded-full bg-muted/60 hover:bg-muted flex items-center justify-center text-muted-foreground transition-colors"
                >
                  <Phone class="size-4 text-[#ff8903]" />
                </a>
                <a 
                  v-if="lead.email" 
                  :href="`mailto:${lead.email}`" 
                  class="size-8 rounded-full bg-muted/60 hover:bg-muted flex items-center justify-center text-muted-foreground transition-colors"
                >
                  <Mail class="size-4 text-[#79c21b]" />
                </a>
              </div>

              <div class="flex gap-2">
                <select 
                  :value="lead.stage" 
                  @change="updateLeadStage(lead, ($event.target as HTMLSelectElement).value as LeadStage)"
                  class="h-8 rounded-lg border bg-background text-[10px] font-bold px-2 max-w-[100px]"
                >
                  <option v-for="s in STAGES" :key="s" :value="s">{{ s }}</option>
                </select>
                <Button size="sm" variant="outline" class="h-8 text-[10px] font-bold" @click="openEdit(lead)">
                  Edit
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Leads Pagination Controls -->
        <div v-if="filteredLeads.length > 0" class="flex items-center justify-between border-t border-dashed pt-4 mt-4 px-1">
          <p class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            Showing {{ Math.min((leadsPage - 1) * 30 + 1, filteredLeads.length) }}-{{ Math.min(leadsPage * 30, filteredLeads.length) }} of {{ filteredLeads.length }}
          </p>
          <div class="flex items-center gap-1.5">
            <Button 
              variant="outline" 
              size="sm" 
              class="h-8 text-[10px] font-bold" 
              :disabled="leadsPage === 1" 
              @click="leadsPage--"
            >
              Previous
            </Button>
            <span class="text-[10px] font-bold px-2 py-1 rounded bg-muted">
              {{ leadsPage }} / {{ totalLeadsPages }}
            </span>
            <Button 
              variant="outline" 
              size="sm" 
              class="h-8 text-[10px] font-bold" 
              :disabled="leadsPage >= totalLeadsPages" 
              @click="leadsPage++"
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      <!-- CUSTOMERS LIST -->
      <div v-else-if="activeTab === 'customers'" class="space-y-3">
        <div v-if="filteredCustomers.length === 0" class="text-center py-20 text-muted-foreground">
          <p class="text-sm">No customers registered yet.</p>
        </div>

        <Card 
          v-for="customer in paginatedCustomers" 
          :key="customer.id" 
          class="border shadow-sm hover:shadow-md transition-shadow relative overflow-hidden"
        >
          <CardContent class="p-4 space-y-3">
            <div class="flex justify-between items-start">
              <div class="flex gap-2.5 items-center">
                <div class="size-9 rounded-full bg-[#79c21b]/15 text-[#79c21b] border border-[#79c21b]/30 flex items-center justify-center text-sm font-black uppercase">
                  {{ customer.name.charAt(0) }}
                </div>
                <div>
                  <h3 class="font-black text-sm tracking-tight text-foreground">{{ customer.name }}</h3>
                  <span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-muted/70 text-muted-foreground uppercase tracking-wider font-mono">
                    ID: {{ customer.id.substring(0, 8) }}
                  </span>
                </div>
              </div>
              <Button size="sm" variant="outline" class="h-8 text-[10px] font-bold" @click="openEditCustomer(customer)">
                Edit
              </Button>
            </div>

            <!-- Contacts Details -->
            <div class="text-xs space-y-1.5 text-muted-foreground bg-muted/10 p-2.5 rounded-xl border border-dashed">
              <div class="flex items-center gap-2" v-if="customer.email">
                <Mail class="size-3.5 text-muted-foreground" /> <span>{{ customer.email }}</span>
              </div>
              <div class="flex items-center gap-2" v-if="customer.phone">
                <Phone class="size-3.5 text-muted-foreground" /> <span>{{ customer.phone }}</span>
              </div>
              <div class="flex items-center gap-2" v-if="customer.address">
                <MapPin class="size-3.5 text-muted-foreground" /> <span class="truncate">{{ customer.address }}</span>
              </div>
            </div>

            <!-- Dial/Mail Quick Buttons -->
            <div class="flex gap-2 pt-1.5 justify-end">
              <a 
                v-if="customer.phone" 
                :href="`tel:${customer.phone}`" 
                class="flex-1 max-w-[100px] h-8 rounded-lg bg-[#ff8903]/10 hover:bg-[#ff8903]/25 flex items-center justify-center gap-1 text-[10px] font-bold text-[#ff8903] transition-colors"
              >
                <Phone class="size-3.5" /> Call
              </a>
              <a 
                v-if="customer.email" 
                :href="`mailto:${customer.email}`" 
                class="flex-1 max-w-[100px] h-8 rounded-lg bg-[#79c21b]/10 hover:bg-[#79c21b]/25 flex items-center justify-center gap-1 text-[10px] font-bold text-[#79c21b] transition-colors"
              >
                <Mail class="size-3.5" /> Email
              </a>
            </div>
          </CardContent>
        </Card>

        <!-- Customers Pagination Controls -->
        <div v-if="filteredCustomers.length > 0" class="flex items-center justify-between border-t border-dashed pt-4 mt-4 px-1">
          <p class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            Showing {{ Math.min((customersPage - 1) * 30 + 1, filteredCustomers.length) }}-{{ Math.min(customersPage * 30, filteredCustomers.length) }} of {{ filteredCustomers.length }}
          </p>
          <div class="flex items-center gap-1.5">
            <Button 
              variant="outline" 
              size="sm" 
              class="h-8 text-[10px] font-bold" 
              :disabled="customersPage === 1" 
              @click="customersPage--"
            >
              Previous
            </Button>
            <span class="text-[10px] font-bold px-2 py-1 rounded bg-muted">
              {{ customersPage }} / {{ totalCustomersPages }}
            </span>
            <Button 
              variant="outline" 
              size="sm" 
              class="h-8 text-[10px] font-bold" 
              :disabled="customersPage >= totalCustomersPages" 
              @click="customersPage++"
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      <!-- QUOTATIONS LIST -->
      <div v-else-if="activeTab === 'quotes'" class="space-y-3">
        <div v-if="filteredQuotes.length === 0" class="text-center py-20 text-muted-foreground">
          <p class="text-sm">No quotations found.</p>
        </div>

        <Card 
          v-for="quote in paginatedQuotes" 
          :key="quote.id" 
          class="border shadow-sm hover:shadow-md transition-shadow relative overflow-hidden"
        >
          <CardContent class="p-4 space-y-3">
            <div class="flex justify-between items-start">
              <div>
                <span class="text-[9px] font-mono font-black uppercase text-[#79c21b] border border-[#79c21b]/35 px-1.5 py-0.5 rounded bg-[#79c21b]/10">
                  {{ quote.quoteRef || `QT-${quote.id.substring(0, 6).toUpperCase()}` }}
                </span>
                <h3 class="font-black text-sm tracking-tight text-foreground mt-1.5">{{ quote.customerName }}</h3>
                <p class="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Calendar class="size-3" /> {{ quote.createdAt?.toDate?.()?.toLocaleDateString() || 'Drafted' }}
                </p>
              </div>
              <div class="text-right space-y-1">
                <span class="font-black text-sm text-[#79c21b] block">{{ formatCurrency(quote.grandTotal) }}</span>
                <Badge :class="[
                  'text-[8px] font-black h-4 px-1 rounded uppercase tracking-wider', 
                  quote.status === 'APPROVED' ? 'bg-[#79c21b]/15 text-[#79c21b]' : 'bg-[#ff8903]/15 text-[#ff8903]'
                ]">
                  {{ quote.status }}
                </Badge>
              </div>
            </div>

            <!-- Collapsible Items Section -->
            <div v-if="expandedQuoteId === quote.id" class="mt-3 pt-3 border-t border-dashed space-y-2 animate-in slide-in-from-top-2 duration-200">
              <h4 class="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Line Items</h4>
              <div class="bg-muted/30 rounded-xl p-2.5 space-y-1.5 text-xs">
                <div v-for="(item, idx) in quote.items" :key="idx" class="flex justify-between items-center text-foreground font-medium">
                  <span>{{ item.description }} <span class="text-muted-foreground font-normal">x{{ item.qty }}</span></span>
                  <span>{{ formatCurrency(item.qty * item.unitPrice) }}</span>
                </div>
              </div>
              <p v-if="quote.notes" class="text-[10px] text-muted-foreground italic px-1">Note: {{ quote.notes }}</p>
            </div>

            <!-- Quick interactions -->
            <div class="flex gap-2 border-t pt-3 justify-between items-center">
              <Button 
                size="sm" 
                variant="ghost" 
                class="h-8 text-[10px] font-bold text-muted-foreground hover:text-foreground"
                @click="expandedQuoteId = expandedQuoteId === quote.id ? '' : quote.id"
              >
                {{ expandedQuoteId === quote.id ? 'Hide Items' : 'View Items' }}
              </Button>

              <div class="flex gap-1.5">
                <Button 
                  v-if="quote.status === 'DRAFT'" 
                  size="sm" 
                  class="h-8 text-[10px] font-black bg-[#79c21b] hover:bg-[#79c21b]/95 text-white" 
                  @click="approveQuote(quote)"
                >
                  Approve & Invoice
                </Button>
                <Button 
                  v-if="quote.status === 'DRAFT'" 
                  size="sm" 
                  variant="outline" 
                  class="h-8 text-[10px] font-bold" 
                  @click="openEditQuote(quote)"
                >
                  Edit
                </Button>
                <Button 
                  v-if="quote.status === 'DRAFT'" 
                  size="icon" 
                  variant="ghost" 
                  class="h-8 w-8 text-red-500 hover:bg-red-500/10 rounded-lg"
                  @click="deleteDraftQuote(quote.id)"
                >
                  <Trash2 class="size-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Quotes Pagination Controls -->
        <div v-if="filteredQuotes.length > 0" class="flex items-center justify-between border-t border-dashed pt-4 mt-4 px-1">
          <p class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            Showing {{ Math.min((quotesPage - 1) * 30 + 1, filteredQuotes.length) }}-{{ Math.min(quotesPage * 30, filteredQuotes.length) }} of {{ filteredQuotes.length }}
          </p>
          <div class="flex items-center gap-1.5">
            <Button 
              variant="outline" 
              size="sm" 
              class="h-8 text-[10px] font-bold" 
              :disabled="quotesPage === 1" 
              @click="quotesPage--"
            >
              Previous
            </Button>
            <span class="text-[10px] font-bold px-2 py-1 rounded bg-muted">
              {{ quotesPage }} / {{ totalQuotesPages }}
            </span>
            <Button 
              variant="outline" 
              size="sm" 
              class="h-8 text-[10px] font-bold" 
              :disabled="quotesPage >= totalQuotesPages" 
              @click="quotesPage++"
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      <!-- INVOICES LIST -->
      <div v-else-if="activeTab === 'invoices'" class="space-y-3">
        <div v-if="filteredInvoices.length === 0" class="text-center py-20 text-muted-foreground">
          <p class="text-sm">No invoices found. Approve quote drafts to create binding invoices.</p>
        </div>

        <Card 
          v-for="invoice in paginatedInvoices" 
          :key="invoice.id" 
          class="border shadow-sm hover:shadow-md transition-shadow relative overflow-hidden"
        >
          <CardContent class="p-4 space-y-3">
            <div class="flex justify-between items-start">
              <div>
                <span class="text-[9px] font-mono font-black uppercase text-[#ff8903] border border-[#ff8903]/35 px-1.5 py-0.5 rounded bg-[#ff8903]/10">
                  INV-{{ invoice.id.substring(0, 8).toUpperCase() }}
                </span>
                <h3 class="font-black text-sm tracking-tight text-foreground mt-1.5">{{ invoice.customerName }}</h3>
                <p class="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Calendar class="size-3" /> Issued: {{ invoice.createdAt?.toDate?.()?.toLocaleDateString() || 'N/A' }}
                </p>
              </div>
              <div class="text-right space-y-1">
                <span class="font-black text-sm text-foreground block">{{ formatCurrency(invoice.grandTotal) }}</span>
                <span class="text-[10px] text-muted-foreground block">Paid: <span class="font-bold text-[#79c21b]">{{ formatCurrency(invoice.amountPaid) }}</span></span>
                <Badge :class="[
                  'text-[8px] font-black h-4 px-1 rounded uppercase tracking-wider', 
                  invoice.status === 'PAID' ? 'bg-[#79c21b]/15 text-[#79c21b]' :
                  invoice.status === 'PARTIAL' ? 'bg-[#ff8903]/15 text-[#ff8903]' : 'bg-red-500/15 text-red-500'
                ]">
                  {{ invoice.status }}
                </Badge>
              </div>
            </div>

            <!-- Collapsible Items & Payments Section -->
            <div v-if="expandedInvoiceId === invoice.id" class="mt-3 pt-3 border-t border-dashed space-y-3.5 animate-in slide-in-from-top-2 duration-200">
              <!-- Line Items -->
              <div class="space-y-1">
                <h4 class="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Line Items</h4>
                <div class="bg-muted/30 rounded-xl p-2.5 space-y-1.5 text-xs">
                  <div v-for="(item, idx) in invoice.items" :key="idx" class="flex justify-between items-center text-foreground font-medium">
                    <span>{{ item.description }} <span class="text-muted-foreground font-normal">x{{ item.qty }}</span></span>
                    <span>{{ formatCurrency(item.qty * item.unitPrice) }}</span>
                  </div>
                </div>
              </div>

              <!-- Payments Log -->
              <div class="space-y-1" v-if="invoice.payments && invoice.payments.length > 0">
                <h4 class="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Payment Ledger</h4>
                <div class="bg-muted/30 rounded-xl p-2.5 space-y-2 text-[11px]">
                  <div 
                    v-for="(payment, idx) in invoice.payments" 
                    :key="idx" 
                    class="flex justify-between items-start border-b border-muted/50 last:border-0 pb-1.5 last:pb-0"
                  >
                    <div class="space-y-0.5">
                      <div class="font-bold text-foreground">
                        {{ payment.method }} <span class="text-muted-foreground font-normal">- {{ payment.reference }}</span>
                      </div>
                      <div class="text-[9px] text-muted-foreground">{{ new Date(payment.date).toLocaleDateString() }}</div>
                    </div>
                    <span class="font-bold text-[#79c21b]">+{{ formatCurrency(payment.amount) }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Quick interactions -->
            <div class="flex gap-2 border-t pt-3 justify-between items-center">
              <Button 
                size="sm" 
                variant="ghost" 
                class="h-8 text-[10px] font-bold text-muted-foreground hover:text-foreground"
                @click="expandedInvoiceId = expandedInvoiceId === invoice.id ? '' : invoice.id"
              >
                {{ expandedInvoiceId === invoice.id ? 'Hide Details' : 'View Details' }}
              </Button>

              <div class="flex gap-1.5">
                <Button 
                  v-if="invoice.status !== 'PAID'" 
                  size="sm" 
                  class="h-8 text-[10px] font-black bg-[#ff8903] hover:bg-[#ff8903]/95 text-white" 
                  @click="openPaymentModal(invoice)"
                >
                  <DollarSign class="size-3.5 mr-0.5" /> Record Payment
                </Button>
                <div v-else class="text-xs text-[#79c21b] font-bold italic flex items-center pr-2">
                  Settled ✓
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Invoices Pagination Controls -->
        <div v-if="filteredInvoices.length > 0" class="flex items-center justify-between border-t border-dashed pt-4 mt-4 px-1">
          <p class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            Showing {{ Math.min((invoicesPage - 1) * 30 + 1, filteredInvoices.length) }}-{{ Math.min(invoicesPage * 30, filteredInvoices.length) }} of {{ filteredInvoices.length }}
          </p>
          <div class="flex items-center gap-1.5">
            <Button 
              variant="outline" 
              size="sm" 
              class="h-8 text-[10px] font-bold" 
              :disabled="invoicesPage === 1" 
              @click="invoicesPage--"
            >
              Previous
            </Button>
            <span class="text-[10px] font-bold px-2 py-1 rounded bg-muted">
              {{ invoicesPage }} / {{ totalInvoicesPages }}
            </span>
            <Button 
              variant="outline" 
              size="sm" 
              class="h-8 text-[10px] font-bold" 
              :disabled="invoicesPage >= totalInvoicesPages" 
              @click="invoicesPage++"
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </main>

    <!-- Dialog for New / Edit Lead -->
    <div v-if="showModal" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <Card class="w-full max-w-sm bg-card border shadow-2xl rounded-3xl overflow-hidden max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
        <div class="p-4 border-b flex justify-between items-center shrink-0">
          <h2 class="text-base font-black tracking-tight">{{ editingLead ? 'Edit Lead Details' : 'Register New Lead' }}</h2>
          <Button variant="ghost" size="icon" class="rounded-full" @click="showModal = false">
            <X class="size-5" />
          </Button>
        </div>

        <div class="flex-1 overflow-y-auto p-4 space-y-4">
          <div class="space-y-1.5">
            <Label class="text-xs font-black uppercase text-muted-foreground">Company Name *</Label>
            <Input v-model="form.companyName" placeholder="Enter company name..." class="h-10" />
          </div>

          <div class="space-y-1.5">
            <Label class="text-xs font-black uppercase text-muted-foreground">Contact Person</Label>
            <Input v-model="form.contactName" placeholder="Full name..." class="h-10" />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <Label class="text-xs font-black uppercase text-muted-foreground">Phone</Label>
              <Input v-model="form.phone" placeholder="+263..." class="h-10" />
            </div>
            <div class="space-y-1.5">
              <Label class="text-xs font-black uppercase text-muted-foreground">Email</Label>
              <Input v-model="form.email" type="email" placeholder="example@..." class="h-10" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <Label class="text-xs font-black uppercase text-muted-foreground">Pipeline Stage</Label>
              <select v-model="form.stage" class="w-full h-10 px-3 rounded-xl border bg-background text-sm">
                <option v-for="s in STAGES" :key="s" :value="s">{{ s }}</option>
              </select>
            </div>
            <div class="space-y-1.5">
              <Label class="text-xs font-black uppercase text-muted-foreground">Priority</Label>
              <select v-model="form.priority" class="w-full h-10 px-3 rounded-xl border bg-background text-sm">
                <option v-for="p in PRIORITIES" :key="p" :value="p">{{ p }}</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <Label class="text-xs font-black uppercase text-muted-foreground">Value ($)</Label>
              <Input type="number" v-model.number="form.value" class="h-10 text-sm font-bold" />
            </div>
            <div class="space-y-1.5">
              <Label class="text-xs font-black uppercase text-muted-foreground">Assigned Rep</Label>
              <Input v-model="form.assignedTo" placeholder="Rep name..." class="h-10 text-sm" />
            </div>
          </div>

          <div class="space-y-1.5">
            <Label class="text-xs font-black uppercase text-muted-foreground">Notes / Observations</Label>
            <textarea v-model="form.notes" rows="3" placeholder="Enter additional details..." class="w-full rounded-xl border bg-background text-sm p-3"></textarea>
          </div>
        </div>

        <div class="p-4 border-t flex gap-3 shrink-0 bg-muted/10">
          <Button variant="outline" class="flex-1 rounded-xl h-10 font-bold" @click="showModal = false">Cancel</Button>
          <Button 
            class="flex-1 rounded-xl h-10 font-bold bg-[#ff8903] hover:bg-[#ff8903]/90 text-white"
            :disabled="isSubmitting"
            @click="saveLead"
          >
            <Loader2 v-if="isSubmitting" class="size-4 animate-spin mr-1" />
            {{ editingLead ? 'Save Changes' : 'Register' }}
          </Button>
        </div>
      </Card>
    </div>

    <!-- Dialog for New / Edit Customer -->
    <div v-if="showCustomerModal" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <Card class="w-full max-w-sm bg-card border shadow-2xl rounded-3xl overflow-hidden max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
        <div class="p-4 border-b flex justify-between items-center shrink-0">
          <h2 class="text-base font-black tracking-tight">{{ editingCustomer ? 'Edit Customer Details' : 'Register Customer' }}</h2>
          <Button variant="ghost" size="icon" class="rounded-full" @click="showCustomerModal = false">
            <X class="size-5" />
          </Button>
        </div>

        <div class="flex-1 overflow-y-auto p-4 space-y-4">
          <div class="space-y-1.5">
            <Label class="text-xs font-black uppercase text-muted-foreground">Customer Name / Company *</Label>
            <Input v-model="customerForm.name" placeholder="Enter customer name..." class="h-10" />
          </div>

          <div class="space-y-1.5">
            <Label class="text-xs font-black uppercase text-muted-foreground">Email Address</Label>
            <Input v-model="customerForm.email" type="email" placeholder="contact@example.com" class="h-10" />
          </div>

          <div class="space-y-1.5">
            <Label class="text-xs font-black uppercase text-muted-foreground">Phone Number</Label>
            <Input v-model="customerForm.phone" placeholder="+263 77..." class="h-10" />
          </div>

          <div class="space-y-1.5">
            <Label class="text-xs font-black uppercase text-muted-foreground">Physical Address</Label>
            <textarea v-model="customerForm.address" rows="3" placeholder="Enter business or site address..." class="w-full rounded-xl border bg-background text-sm p-3"></textarea>
          </div>
        </div>

        <div class="p-4 border-t flex gap-3 shrink-0 bg-muted/10">
          <Button variant="outline" class="flex-1 rounded-xl h-10 font-bold" @click="showCustomerModal = false">Cancel</Button>
          <Button 
            class="flex-1 rounded-xl h-10 font-bold bg-[#ff8903] hover:bg-[#ff8903]/90 text-white"
            :disabled="isSubmitting"
            @click="saveCustomer"
          >
            <Loader2 v-if="isSubmitting" class="size-4 animate-spin mr-1" />
            {{ editingCustomer ? 'Save Changes' : 'Register' }}
          </Button>
        </div>
      </Card>
    </div>

    <!-- Dialog for New / Edit Quotation (Mobile Offer Builder) -->
    <div v-if="showQuoteModal" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <Card class="w-full max-w-sm bg-card border shadow-2xl rounded-3xl overflow-hidden max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
        <div class="p-4 border-b flex justify-between items-center shrink-0">
          <h2 class="text-base font-black tracking-tight">{{ editingQuote ? 'Modify Quote' : 'Create Quotation' }}</h2>
          <Button variant="ghost" size="icon" class="rounded-full" @click="showQuoteModal = false">
            <X class="size-5" />
          </Button>
        </div>

        <div class="flex-1 overflow-y-auto p-4 space-y-4">
          <!-- Client Selection -->
          <div class="space-y-1.5">
            <Label class="text-xs font-black uppercase text-muted-foreground">Select Customer *</Label>
            <select v-model="quoteForm.customerId" class="w-full h-10 px-3 rounded-xl border bg-background text-sm" :disabled="!!editingQuote">
              <option value="" disabled>Choose a registered client</option>
              <option v-for="c in customers" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </div>

          <!-- Items Workspace -->
          <div class="space-y-2">
            <div class="flex justify-between items-center">
              <Label class="text-xs font-black uppercase text-muted-foreground">Line Items</Label>
              <Button type="button" size="sm" variant="ghost" class="h-6 text-[10px] font-black text-[#ff8903] flex items-center gap-0.5" @click="addQuoteItem">
                <Plus class="size-3.5" /> Add Row
              </Button>
            </div>

            <!-- Dynamic items loop -->
            <div class="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
              <div v-for="(item, idx) in quoteForm.items" :key="idx" class="p-2.5 bg-muted/30 border rounded-xl space-y-2 relative">
                <Button 
                  v-if="quoteForm.items.length > 1" 
                  type="button" 
                  size="icon" 
                  variant="ghost" 
                  class="absolute top-1 right-1 size-6 text-red-500 hover:bg-red-500/10 rounded-full"
                  @click="removeQuoteItem(idx)"
                >
                  <X class="size-3.5" />
                </Button>

                <div class="space-y-1">
                  <span class="text-[9px] font-bold text-muted-foreground block">Item #{{ idx + 1 }}</span>
                  <Input v-model="item.description" placeholder="Description / Service details..." class="h-8 text-xs" />
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <div class="space-y-1">
                    <Label class="text-[9px] text-muted-foreground">Quantity</Label>
                    <Input type="number" v-model.number="item.qty" class="h-8 text-xs font-bold" min="1" />
                  </div>
                  <div class="space-y-1">
                    <Label class="text-[9px] text-muted-foreground">Unit Price ($)</Label>
                    <Input type="number" v-model.number="item.unitPrice" class="h-8 text-xs font-bold" min="0" step="0.01" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Summary section -->
          <div class="p-3 bg-muted/20 border rounded-xl space-y-1">
            <div class="flex justify-between items-center text-xs">
              <span class="text-muted-foreground">Number of items:</span>
              <span class="font-bold">{{ quoteForm.items.length }}</span>
            </div>
            <div class="flex justify-between items-center text-sm font-black border-t pt-1.5 mt-1.5">
              <span>Grand Total:</span>
              <span class="text-[#79c21b] text-base">{{ formatCurrency(quoteGrandTotal) }}</span>
            </div>
          </div>

          <div class="space-y-1.5">
            <Label class="text-xs font-black uppercase text-muted-foreground">Additional Terms / Notes</Label>
            <textarea v-model="quoteForm.notes" rows="2" placeholder="Quote terms, validity period..." class="w-full rounded-xl border bg-background text-sm p-3"></textarea>
          </div>
        </div>

        <div class="p-4 border-t flex gap-3 shrink-0 bg-muted/10">
          <Button variant="outline" class="flex-1 rounded-xl h-10 font-bold" @click="showQuoteModal = false">Cancel</Button>
          <Button 
            class="flex-1 rounded-xl h-10 font-bold bg-[#ff8903] hover:bg-[#ff8903]/90 text-white"
            :disabled="isSubmitting"
            @click="saveQuote"
          >
            <Loader2 v-if="isSubmitting" class="size-4 animate-spin mr-1" />
            {{ editingQuote ? 'Save' : 'Save Draft' }}
          </Button>
        </div>
      </Card>
    </div>

    <!-- Dialog for Record Invoice Payment -->
    <div v-if="showPaymentModal" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <Card class="w-full max-w-sm bg-card border shadow-2xl rounded-3xl overflow-hidden max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
        <div class="p-4 border-b flex justify-between items-center shrink-0">
          <h2 class="text-base font-black tracking-tight">Record CRM Payment</h2>
          <Button variant="ghost" size="icon" class="rounded-full" @click="showPaymentModal = false">
            <X class="size-5" />
          </Button>
        </div>

        <div class="flex-1 overflow-y-auto p-4 space-y-4" v-if="activeInvoice">
          <div class="flex justify-between items-center p-3 bg-muted/30 border border-dashed rounded-xl text-xs">
            <div class="space-y-0.5">
              <span class="text-muted-foreground font-medium">Invoice Total:</span>
              <span class="block font-black text-sm text-foreground">{{ formatCurrency(activeInvoice.grandTotal) }}</span>
            </div>
            <div class="space-y-0.5 text-right">
              <span class="text-muted-foreground font-medium">Remaining Balance:</span>
              <span class="block font-black text-sm text-[#ff8903]">{{ formatCurrency(activeInvoice.grandTotal - (activeInvoice.amountPaid || 0)) }}</span>
            </div>
          </div>

          <div class="space-y-1.5">
            <Label class="text-xs font-black uppercase text-muted-foreground">Amount Received ($) *</Label>
            <Input type="number" v-model.number="paymentForm.amount" class="h-10 text-sm font-bold" min="0.01" step="0.01" />
          </div>

          <div class="space-y-1.5">
            <Label class="text-xs font-black uppercase text-muted-foreground">Payment Method</Label>
            <select v-model="paymentForm.method" class="w-full h-10 px-3 rounded-xl border bg-background text-sm">
              <option value="ECOCASH">EcoCash</option>
              <option value="CASH">Cash</option>
              <option value="BANK">Bank Transfer</option>
            </select>
          </div>

          <div class="space-y-1.5">
            <Label class="text-xs font-black uppercase text-muted-foreground">Transaction Reference *</Label>
            <Input v-model="paymentForm.reference" placeholder="POP# / Check# / Details" class="h-10" />
          </div>
        </div>

        <div class="p-4 border-t flex gap-3 shrink-0 bg-muted/10">
          <Button variant="outline" class="flex-1 rounded-xl h-10 font-bold" @click="showPaymentModal = false">Cancel</Button>
          <Button 
            class="flex-1 rounded-xl h-10 font-bold bg-[#ff8903] hover:bg-[#ff8903]/90 text-white"
            :disabled="isSubmitting"
            @click="recordInvoicePayment"
          >
            <Loader2 v-if="isSubmitting" class="size-4 animate-spin mr-1" />
            Settle Payment
          </Button>
        </div>
      </Card>
    </div>
  </div>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>

