<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useFinanceStore } from '../../fundTransfers/store/financeStore'
import { useSession } from '@/composables/useSession'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Plus, Search, Filter, X, CheckCircle2, XCircle, Paperclip, Download, Loader2,
  Trash2, FileText, CreditCard, AlertTriangle, UploadCloud, FileIcon
} from 'lucide-vue-next'
import { generateOpexPdf } from '../utils/generateOpexPdf'
import { generateOpexReportPdf } from '../utils/generateOpexReportPdf'
import { useAdminStore } from '@/features/admin/store/adminStore'
import { useVerificationStore } from '@/features/verification/store/verificationStore'
import AdminDeleteDialog from '@/components/AdminDeleteDialog.vue'
import { db } from '@/lib/firebase'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { uploadExpenseAttachment } from '../../fundTransfers/utils/financeUtils'

const router = useRouter()
const store = useFinanceStore()
const adminStore = useAdminStore()
const verificationStore = useVerificationStore()
const { hasAnyRole, isSuperAdmin, user } = useSession()
const { appSettings } = storeToRefs(adminStore)
const { expenses, loading } = storeToRefs(store)

const downloadingId = ref<string | null>(null)
const deletingId = ref<string | null>(null)
const confirmDeleteId = ref<string | null>(null)
const downloadingReport = ref(false)

// Admin Deletion State
const isAdminDeleteOpen = ref(false)
const selectedOpexForAdminDelete = ref<any>(null)

// ── Filters ──────────────────────────────────────────────────────────────────
const searchQuery = ref('')
const methodFilter = ref('all')
const timeframe = ref('all')
const dateFrom = ref('')
const dateTo = ref('')
const statusFilter = ref('all')
const showFilters = ref(false)
const isProcessing = ref<string | null>(null)

// ── Rejection Modal ────────────────────────────────────────────────────────────
const rejectModal = ref({
  show: false,
  type: '' as 'accountant' | 'manager',
  expenseId: '',
  expenseName: '',
  comment: ''
})
const isRejecting = ref(false)

function openRejectDialog(exp: any, type: 'accountant' | 'manager') {
  rejectModal.value = { show: true, type, expenseId: exp.id, expenseName: exp.title || exp.description || 'Expense', comment: '' }
}

async function confirmReject() {
  if (!rejectModal.value.comment.trim()) return toast.error('Comment Required', { description: 'Please provide a reason for rejection.' })
  isRejecting.value = true
  try {
    const by = { name: user.value?.displayName || undefined, email: user.value?.email || undefined }
    if (rejectModal.value.type === 'accountant') {
      await store.rejectExpenseByAccountant(rejectModal.value.expenseId, by, rejectModal.value.comment)
      toast.success('Rejected by Accountant', { description: 'Request returned to the requester with comments.' })
    } else {
      await store.rejectExpenseByManager(rejectModal.value.expenseId, by, rejectModal.value.comment)
      toast.success('Rejected by Manager', { description: 'Request returned to the requester with comments.' })
    }
    rejectModal.value.show = false
  } catch (err: any) {
    toast.error('Rejection Failed', { description: err.message })
  } finally {
    isRejecting.value = false
  }
}

// ── Payment Processing Modal ────────────────────────────────────────────────────
const paymentModal = ref({
  show: false,
  expenseId: '',
  expenseName: '',
  expenseAmount: 0,
  form: {
    paymentMethod: '',
    ledgerAccount: '',
    transactionDate: new Date().toISOString().split('T')[0],
    referenceNumber: '',
    notes: ''
  }
})
const isProcessingPayment = ref(false)

const paymentModalFile = ref<File | null>(null)
const paymentModalFileInput = ref<HTMLInputElement | null>(null)

function handlePaymentFileSelect(e: Event) {
  const target = e.target as HTMLInputElement
  if (target.files && target.files[0]) {
    paymentModalFile.value = target.files[0]
  }
}

function openPaymentDialog(exp: any) {
  paymentModalFile.value = null
  if (paymentModalFileInput.value) paymentModalFileInput.value.value = ''
  paymentModal.value = {
    show: true,
    expenseId: exp.id,
    expenseName: exp.title || exp.description || 'Expense',
    expenseAmount: exp.amount || 0,
    form: {
      paymentMethod: exp.paymentMethod || '',
      ledgerAccount: '',
      transactionDate: new Date().toISOString().split('T')[0] as string,
      referenceNumber: '',
      notes: ''
    }
  }
}

const handleViewAttachment = (url: string) => {
  if (url) window.open(url, '_blank')
}

async function confirmPayment() {
  const f = paymentModal.value.form
  if (!f.paymentMethod || !f.transactionDate || !f.referenceNumber || !f.ledgerAccount) {
    return toast.error('Required Fields', { description: 'Please fill in all required payment fields.' })
  }
  isProcessingPayment.value = true
  const toastId = paymentModalFile.value ? toast.loading('Uploading payment receipt...') : null
  try {
    const exp = store.expenses.find(e => e.id === paymentModal.value.expenseId)
    if (paymentModalFile.value) {
      const url = await uploadExpenseAttachment(paymentModalFile.value, 'opex')
      let attachmentUrls = exp?.attachmentUrls || (exp?.attachmentUrl ? [exp.attachmentUrl] : [])
      attachmentUrls = [...attachmentUrls, url]
      
      await updateDoc(doc(db, 'operationalExpenses', paymentModal.value.expenseId), {
        attachmentUrl: attachmentUrls[0] || url,
        attachmentUrls,
        updatedAt: serverTimestamp()
      })
      
      if (exp) {
        exp.attachmentUrl = attachmentUrls[0] || url
        exp.attachmentUrls = attachmentUrls
      }
    }

    await store.processExpensePayment(
      paymentModal.value.expenseId,
      { name: user.value?.displayName || undefined, email: user.value?.email || undefined },
      f
    )
    if (toastId) {
      toast.success('Payment Processed with Receipt', { id: toastId })
    } else {
      toast.success('Payment Processed', { description: 'Ledger entry created and linked to expense request.' })
    }
    paymentModal.value.show = false
  } catch (err: any) {
    if (toastId) {
      toast.error('Processing Failed', { id: toastId, description: err.message })
    } else {
      toast.error('Processing Failed', { description: err.message })
    }
  } finally {
    isProcessingPayment.value = false
  }
}

// ── Status Helpers ─────────────────────────────────────────────────────────────
function statusInfo(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    PENDING_ACCOUNTANT:  { label: 'Pending Accountant', cls: 'bg-yellow-600/15 text-yellow-500 border-yellow-600/30' },
    APPROVED_ACCOUNTANT: { label: 'Pending Manager',    cls: 'bg-blue-600/15 text-blue-400 border-blue-600/30' },
    REJECTED_ACCOUNTANT: { label: 'Rejected',           cls: 'bg-red-600/15 text-red-500 border-red-600/30' },
    REJECTED_MANAGER:    { label: 'Rejected',           cls: 'bg-red-600/15 text-red-500 border-red-600/30' },
    APPROVED:            { label: 'Approved',           cls: 'bg-green-600/15 text-green-500 border-green-600/30' },
    APPROVED_FOR_PAYMENT:{ label: 'Approved',           cls: 'bg-green-600/15 text-green-500 border-green-600/30' },
    PAYMENT_PROCESSED:   { label: 'Payment Processed',  cls: 'bg-emerald-600/20 text-emerald-400 border-emerald-600/30' },
  }
  return map[status] || { label: 'Pending', cls: 'bg-yellow-600/15 text-yellow-500 border-yellow-600/30' }
}

const canDownloadPdf = (expense: any) =>
  ['APPROVED', 'APPROVED_FOR_PAYMENT', 'PAYMENT_PROCESSED'].includes(expense.status) && !expense.pdfGenerated

const canProcessPayment = (status: string) =>
  ['APPROVED', 'APPROVED_FOR_PAYMENT'].includes(status)

// ── Data ──────────────────────────────────────────────────────────────────────
const combinedExpenses = computed(() => {
  const generalExpenses = expenses.value.filter(exp => exp.category !== 'job-card-expense')
  return [...generalExpenses].sort((a, b) => {
    const da = a.createdAt?.toDate?.() || new Date(a.createdAt || 0)
    const db = b.createdAt?.toDate?.() || new Date(b.createdAt || 0)
    return db.getTime() - da.getTime()
  })
})

const filteredExpenses = computed(() => {
  return combinedExpenses.value.filter(exp => {
    const q = searchQuery.value.toLowerCase()
    const searchMatch = !q ||
      exp.title?.toLowerCase().includes(q) ||
      exp.description?.toLowerCase().includes(q) ||
      exp.category?.toLowerCase().includes(q) ||
      exp.beneficiary?.toLowerCase().includes(q)

    const methodMatch = methodFilter.value === 'all' ||
      exp.paymentMethod?.toLowerCase() === methodFilter.value.toLowerCase()

    const expStatus = exp.status || 'PENDING_ACCOUNTANT'
    const statusMatch = statusFilter.value === 'all' ||
      (statusFilter.value === 'pending_accountant' && expStatus === 'PENDING_ACCOUNTANT') ||
      (statusFilter.value === 'pending_manager' && ['APPROVED_ACCOUNTANT', 'PENDING_MANAGER'].includes(expStatus)) ||
      (statusFilter.value === 'rejected' && ['REJECTED_ACCOUNTANT', 'REJECTED_MANAGER'].includes(expStatus)) ||
      (statusFilter.value === 'approved' && ['APPROVED', 'APPROVED_FOR_PAYMENT'].includes(expStatus)) ||
      (statusFilter.value === 'payment_processed' && expStatus === 'PAYMENT_PROCESSED')

    let timeMatch = true
    if (timeframe.value !== 'all') {
      const now = new Date()
      const expDate = exp.createdAt?.toDate?.() || new Date()
      if (timeframe.value === 'today') {
        timeMatch = expDate.toDateString() === now.toDateString()
      } else if (timeframe.value === 'week') {
        const weekAgo = new Date(); weekAgo.setDate(now.getDate() - 7)
        timeMatch = expDate >= weekAgo
      } else if (timeframe.value === 'month') {
        timeMatch = expDate.getMonth() === now.getMonth() && expDate.getFullYear() === now.getFullYear()
      } else if (timeframe.value === 'custom') {
        const from = dateFrom.value ? new Date(dateFrom.value) : null
        const to   = dateTo.value   ? new Date(dateTo.value + 'T23:59:59') : null
        if (from) timeMatch = expDate >= from
        if (to)   timeMatch = timeMatch && expDate <= to
      }
    }

    return searchMatch && methodMatch && statusMatch && timeMatch
  })
})

// ── Pagination State ──────────────────────────────────────────────────────────
const currentPage = ref(1)
const itemsPerPage = ref(20)

const paginatedExpenses = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value
  const end = start + itemsPerPage.value
  return filteredExpenses.value.slice(start, end)
})

const totalPages = computed(() => {
  return Math.ceil(filteredExpenses.value.length / itemsPerPage.value) || 1
})

watch([searchQuery, methodFilter, timeframe, dateFrom, dateTo, statusFilter], () => {
  currentPage.value = 1
})

const resetFilters = () => {
  searchQuery.value = ''
  methodFilter.value = 'all'
  statusFilter.value = 'all'
  timeframe.value = 'all'
  dateFrom.value = ''
  dateTo.value = ''
}

// ── Actions ────────────────────────────────────────────────────────────────────
const handleDownloadReport = async () => {
  if (filteredExpenses.value.length === 0) {
    return toast.error('No expenses to export', { description: 'Adjust your filters and try again.' })
  }
  downloadingReport.value = true
  try {
    const range = timeframe.value === 'custom' && (dateFrom.value || dateTo.value)
      ? { from: dateFrom.value || 'Start', to: dateTo.value || 'End' } : null
    await generateOpexReportPdf(
      filteredExpenses.value, range, adminStore.appSettings, adminStore.appSettings,
      user.value?.displayName || user.value?.email || 'System User'
    )
    toast.success('Report Downloaded!')
  } catch (err: any) {
    toast.error('Failed to generate report')
  } finally {
    downloadingReport.value = false
  }
}

const handleAccountantApprove = async (id: string) => {
  isProcessing.value = id
  try {
    await store.approveExpenseByAccountant(id, {
      name: user.value?.displayName || undefined,
      email: user.value?.email || undefined
    })
    const exp = expenses.value.find(e => e.id === id)
    const amount = Number(exp?.amount || 0)
    const isAutoApproved = amount < 300
    const descMsg = isAutoApproved
      ? 'Expense approved and ready for payment (< $300 auto-approval).'
      : 'Forwarded for manager final approval.'
    toast.success('Accountant Approved', { description: descMsg })
  } catch (err: any) {
    toast.error('Failed to approve', { description: err.message })
  } finally {
    isProcessing.value = null
  }
}

const handleManagerApprove = async (id: string) => {
  isProcessing.value = id
  try {
    await store.approveExpenseByManager(id, {
      name: user.value?.displayName || undefined,
      email: user.value?.email || undefined
    })
    const exp = expenses.value.find(e => e.id === id)
    const isAccountantApprove = hasAnyRole(['ACCOUNTANT']) && !hasAnyRole(['MANAGER', 'ADMIN', 'SUPER_ADMIN']) && Number(exp?.amount || 0) < 300
    const descMsg = isAccountantApprove
      ? 'Expense approved and ready for payment (< $300 auto-approval).'
      : 'Expense approved for payment processing.'
    toast.success('Final Approval Granted', { description: descMsg })
  } catch (err: any) {
    toast.error('Failed to approve', { description: err.message })
  } finally {
    isProcessing.value = null
  }
}

const handleDownloadPdf = async (expense: any) => {
  downloadingId.value = expense.id
  try {
    const token = await verificationStore.ensureVerificationToken(
      expense.id,
      'OPEX',
      expense.id ? `OPEX-${String(expense.id).substring(0, 8).toUpperCase()}` : 'OPEX',
      expense.title || expense.description || 'Internal Requisition'
    )
    await generateOpexPdf(
      expense, adminStore.appSettings, adminStore.appSettings,
      user.value?.displayName || user.value?.email || 'System User',
      token
    )
    
    // Enforce single-download rule immediately
    await store.lockExpensePdf(expense.id)
    
    toast.success('PDF Downloaded!')
  } catch (err: any) {
    toast.error('Failed to generate PDF')
  } finally {
    downloadingId.value = null
  }
}

const handleUnlockPdf = async (id: string) => {
  isProcessing.value = id
  try {
    await store.unlockExpensePdf(id)
    toast.success('Download Re-enabled', { description: 'This PDF can now be downloaded again once.' })
  } catch (err: any) {
    toast.error('Unlock Failed', { description: err.message })
  } finally {
    isProcessing.value = null
  }
}

const handleDelete = async (id: string) => {
  deletingId.value = id
  try {
    await store.deleteExpense(id)
    toast.success('Expense Deleted')
  } catch (err: any) {
    toast.error('Delete Failed', { description: err.message })
  } finally {
    deletingId.value = null
    confirmDeleteId.value = null
  }
}

const openAdminDelete = (exp: any) => {
  selectedOpexForAdminDelete.value = exp
  isAdminDeleteOpen.value = true
}

const handleAdminDeleteConfirm = async () => {
    if (!selectedOpexForAdminDelete.value) return
    
    const exp = selectedOpexForAdminDelete.value
    isAdminDeleteOpen.value = false
    
    deletingId.value = exp.id
    toast.loading('ADMIN: Force deleting expense...', { id: 'admin-delete' })
    try {
        await store.deleteExpense(exp.id)
        toast.success('Admin: Expense Deleted Successfully', { id: 'admin-delete' })
    } catch (err: any) {
        toast.error('Admin Delete Failed', { id: 'admin-delete', description: err.message })
    } finally {
        deletingId.value = null
        selectedOpexForAdminDelete.value = null
    }
}

const formatDate = (val: any) => {
  if (!val) return 'N/A'
  if (val.toDate) return val.toDate().toLocaleDateString()
  return new Date(val).toLocaleDateString()
}

onMounted(() => {
  store.fetchExpenses()
  adminStore.fetchAll()
})

onUnmounted(() => {
  store.cleanup()
})
</script>

<template>
  <div class="space-y-6">

    <!-- Rejection Modal -->
    <div v-if="rejectModal.show" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div class="bg-card border rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 space-y-4">
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-full bg-destructive/10 text-destructive">
            <XCircle class="size-5" />
          </div>
          <div>
            <h3 class="font-bold text-base">Reject Expense Request</h3>
            <p class="text-xs text-muted-foreground mt-0.5 truncate max-w-[280px]">{{ rejectModal.expenseName }}</p>
          </div>
        </div>
        <div class="space-y-2">
          <Label class="text-xs font-bold uppercase tracking-widest">Reason for Rejection *</Label>
          <Textarea v-model="rejectModal.comment" :rows="3"
            placeholder="Please provide a reason so the requester can revise and resubmit..."
            class="resize-none" />
        </div>
        <div class="flex justify-end gap-3 pt-1">
          <Button variant="outline" @click="rejectModal.show = false" :disabled="isRejecting">Cancel</Button>
          <Button class="bg-destructive hover:bg-destructive/90 text-white" :disabled="!rejectModal.comment.trim() || isRejecting" @click="confirmReject">
            <Loader2 v-if="isRejecting" class="size-4 animate-spin mr-2" />
            <XCircle v-else class="size-4 mr-2" />
            {{ isRejecting ? 'Rejecting...' : 'Confirm Rejection' }}
          </Button>
        </div>
      </div>
    </div>

    <!-- Payment Processing Modal -->
    <div v-if="paymentModal.show" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div class="bg-card border rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4 space-y-4">
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-full bg-emerald-500/10 text-emerald-600">
            <CreditCard class="size-5" />
          </div>
          <div>
            <h3 class="font-bold text-base text-emerald-600">Process Payment</h3>
            <p class="text-xs text-muted-foreground mt-0.5">{{ paymentModal.expenseName }}</p>
            <p class="text-xs font-bold text-brand-secondary mt-0.5">
              Amount: ${{ Number(paymentModal.expenseAmount).toLocaleString(undefined, { minimumFractionDigits: 2 }) }}
            </p>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-1.5 col-span-2">
            <Label class="text-xs font-bold uppercase tracking-widest">Expense Account (Debit) *</Label>
            <Select v-model="paymentModal.form.ledgerAccount">
              <SelectTrigger><SelectValue placeholder="Select ledger account" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Admin Expenses">Admin Expenses</SelectItem>
                <SelectItem value="Operations Expenses">Operations Expenses</SelectItem>
                <SelectItem value="Marketing Expenses">Marketing Expenses</SelectItem>
                <SelectItem value="Repairs & Maintenance">Repairs &amp; Maintenance</SelectItem>
                <SelectItem value="Cost of Sales">Cost of Sales</SelectItem>
                <SelectItem value="Staff Welfare">Staff Welfare</SelectItem>
                <SelectItem value="Travel & Transport">Travel &amp; Transport</SelectItem>
                <SelectItem value="Utilities">Utilities</SelectItem>
                <SelectItem value="Other Expenses">Other Expenses</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="space-y-1.5">
            <Label class="text-xs font-bold uppercase tracking-widest">Payment Method *</Label>
            <Select v-model="paymentModal.form.paymentMethod">
              <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="bank">Bank Transfer</SelectItem>
                <SelectItem value="ecocash">EcoCash</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="space-y-1.5">
            <Label class="text-xs font-bold uppercase tracking-widest">Transaction Date *</Label>
            <Input type="date" v-model="paymentModal.form.transactionDate" />
          </div>
          <div class="space-y-1.5 col-span-2">
            <Label class="text-xs font-bold uppercase tracking-widest">Reference Number *</Label>
            <Input v-model="paymentModal.form.referenceNumber" placeholder="Bank ref / EcoCash receipt / Voucher #" />
          </div>
          <div class="space-y-1.5 col-span-2">
            <Label class="text-xs font-bold uppercase tracking-widest">Notes (optional)</Label>
            <Textarea v-model="paymentModal.form.notes" :rows="2" placeholder="Any additional payment notes..." class="resize-none" />
          </div>
          <div class="space-y-1.5 col-span-2">
            <Label class="text-xs font-bold uppercase tracking-widest">Receipt Attachment (Optional)</Label>
            <input type="file" ref="paymentModalFileInput" class="hidden" accept="image/*,.pdf" @change="handlePaymentFileSelect" />
            <div v-if="!paymentModalFile" @click="paymentModalFileInput?.click()"
              class="group border-2 border-dashed rounded-xl p-4 flex items-center justify-center gap-3 hover:bg-emerald-500/5 hover:border-emerald-500/30 cursor-pointer transition-all border-muted/20 text-xs">
              <UploadCloud class="size-5 text-muted-foreground group-hover:text-emerald-600" />
              <span class="font-medium text-muted-foreground group-hover:text-foreground">Click to upload payment receipt</span>
            </div>
            <div v-else class="flex items-center justify-between p-2 border rounded-lg bg-emerald-500/5 border-emerald-500/20 text-xs">
              <div class="flex items-center gap-2">
                <FileIcon class="size-4 text-emerald-600" />
                <span class="font-bold truncate max-w-[250px]">{{ paymentModalFile.name }}</span>
              </div>
              <Button variant="ghost" size="icon" @click="paymentModalFile = null" class="h-6 w-6 text-destructive">
                <X class="size-3.5" />
              </Button>
            </div>
          </div>
        </div>
        <div class="text-xs text-muted-foreground border rounded p-2 bg-muted/30 font-mono">
          Expense Request ID: {{ paymentModal.expenseId }}
        </div>
        <div class="flex justify-end gap-3 pt-1">
          <Button variant="outline" @click="paymentModal.show = false" :disabled="isProcessingPayment">Cancel</Button>
          <Button class="bg-emerald-600 hover:bg-emerald-700 text-white" :disabled="isProcessingPayment" @click="confirmPayment">
            <Loader2 v-if="isProcessingPayment" class="size-4 animate-spin mr-2" />
            <CheckCircle2 v-else class="size-4 mr-2" />
            {{ isProcessingPayment ? 'Processing...' : 'Record Payment & Post to Ledger' }}
          </Button>
        </div>
      </div>
    </div>

    <!-- Page Header -->
    <div class="flex justify-between items-center">
      <div>
        <h2 class="text-3xl font-bold tracking-tight">Operational Expenses</h2>
        <p class="text-muted-foreground">Manage and authorize operational expenditure requests.</p>
      </div>
      <div class="flex items-center gap-2">
        <Button variant="outline" class="border-dashed" :disabled="downloadingReport" @click="handleDownloadReport">
          <Loader2 v-if="downloadingReport" class="mr-2 size-4 animate-spin" />
          <FileText v-else class="mr-2 size-4" />
          Download Report
        </Button>
        <Button
          :style="{ backgroundColor: appSettings?.uiColors?.brandSecondaryColor || '#ff8903' }"
          class="hover:opacity-90 text-white" @click="router.push('/opex/new')">
          <Plus class="mr-2 size-4" />
          New Expense Request
        </Button>
      </div>
    </div>

    <!-- Search & Filter Bar -->
    <div class="flex items-center gap-4 flex-wrap">
      <div class="relative flex-1 min-w-[200px] max-w-sm">
        <Search class="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input v-model="searchQuery" placeholder="Search expenses..." class="pl-8" />
      </div>

      <Select v-model="statusFilter">
        <SelectTrigger class="w-[200px]">
          <SelectValue placeholder="All Statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          <SelectItem value="pending_accountant">Pending Accountant</SelectItem>
          <SelectItem value="pending_manager">Pending Manager</SelectItem>
          <SelectItem value="rejected">Rejected</SelectItem>
          <SelectItem value="approved">Approved for Payment</SelectItem>
          <SelectItem value="payment_processed">Payment Processed</SelectItem>
        </SelectContent>
      </Select>

      <Button variant="outline" :class="{ 'bg-muted': showFilters }" @click="showFilters = !showFilters">
        <Filter class="mr-2 size-4" />
        More Filters
      </Button>
      <Button
        v-if="searchQuery || methodFilter !== 'all' || timeframe !== 'all' || statusFilter !== 'all' || dateFrom || dateTo"
        variant="ghost" @click="resetFilters">
        <X class="mr-2 size-4" />
        Reset
      </Button>
    </div>

    <!-- Extended Filters -->
    <Card v-if="showFilters" class="bg-muted/30">
      <CardContent class="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="space-y-2">
          <label class="text-xs font-semibold uppercase text-muted-foreground">Payment Method</label>
          <Select v-model="methodFilter">
            <SelectTrigger><SelectValue placeholder="All methods" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Methods</SelectItem>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="bank">Bank Transfer</SelectItem>
              <SelectItem value="ecocash">EcoCash</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div class="space-y-2">
          <label class="text-xs font-semibold uppercase text-muted-foreground">Timeframe</label>
          <Select v-model="timeframe">
            <SelectTrigger><SelectValue placeholder="All time" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">Past 7 Days</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <template v-if="timeframe === 'custom'">
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase text-muted-foreground">From</label>
            <Input type="date" v-model="dateFrom" class="w-full" />
          </div>
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase text-muted-foreground">To</label>
            <Input type="date" v-model="dateTo" class="w-full" />
          </div>
        </template>
      </CardContent>
    </Card>

    <!-- Expense Table -->
    <Card class="bg-brand-primary/5 dark:bg-brand-primary/10 backdrop-blur-md border-brand-primary/20 dark:border-brand-primary/30 shadow-lg overflow-hidden">
      <CardContent class="p-0">
        <div class="w-full overflow-x-auto">
          <Table class="w-full table-fixed">
            <TableHeader>
              <TableRow class="border-b hover:bg-transparent" :style="{ borderColor: 'var(--opex-grid-border)' }">
                <TableHead class="w-24 text-[11px] font-bold uppercase tracking-wider"
                  :style="{ backgroundColor: 'var(--opex-grid-header-bg)', color: 'var(--opex-grid-header-text)' }">Date</TableHead>
                <TableHead class="w-28 text-[11px] font-bold uppercase tracking-wider"
                  :style="{ backgroundColor: 'var(--opex-grid-header-bg)', color: 'var(--opex-grid-header-text)' }">Category</TableHead>
                <TableHead class="text-[11px] font-bold uppercase tracking-wider"
                  :style="{ backgroundColor: 'var(--opex-grid-header-bg)', color: 'var(--opex-grid-header-text)' }">Title / Description</TableHead>
                <TableHead class="w-36 text-[11px] font-bold uppercase tracking-wider"
                  :style="{ backgroundColor: 'var(--opex-grid-header-bg)', color: 'var(--opex-grid-header-text)' }">Status</TableHead>
                <TableHead class="w-24 text-right text-[11px] font-bold uppercase tracking-wider"
                  :style="{ backgroundColor: 'var(--opex-grid-header-bg)', color: 'var(--opex-grid-header-text)' }">Amount</TableHead>
                <TableHead class="w-36 text-right text-[11px] font-bold uppercase tracking-wider"
                  :style="{ backgroundColor: 'var(--opex-grid-header-bg)', color: 'var(--opex-grid-header-text)' }">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-if="loading">
                <TableCell colspan="6" class="text-center py-16 text-muted-foreground">
                  <Loader2 class="size-6 animate-spin mx-auto mb-2" />
                  Loading expense requests...
                </TableCell>
              </TableRow>
              <TableRow v-else-if="filteredExpenses.length === 0">
                <TableCell colspan="6" class="text-center py-16 text-muted-foreground">
                  <FileText class="size-10 mx-auto mb-3 opacity-20" />
                  <p class="font-semibold">No expense requests found</p>
                  <p class="text-xs mt-1">Adjust your filters or create a new expense request.</p>
                </TableCell>
              </TableRow>
              <TableRow v-for="exp in paginatedExpenses" :key="exp.id"
                class="border-b transition-colors duration-200 hover:bg-brand-primary/5 dark:hover:bg-brand-primary/10"
                :style="{ borderColor: 'var(--opex-grid-border)' }"
                :class="['REJECTED_ACCOUNTANT','REJECTED_MANAGER'].includes(exp.status) ? 'opacity-70' : ''">

                <!-- Date -->
                <TableCell class="text-muted-foreground dark:text-white/60 text-xs py-3 align-top">
                  {{ formatDate(exp.createdAt) }}
                </TableCell>

                <!-- Category -->
                <TableCell class="align-top py-3">
                  <span class="inline-block px-2 py-1 rounded-md border text-brand-primary text-[10px] shadow-sm uppercase font-bold truncate max-w-full"
                    :style="{ backgroundColor: (appSettings?.uiColors?.brandPrimaryColor || '#79c21b') + '15', borderColor: (appSettings?.uiColors?.brandPrimaryColor || '#79c21b') + '30' }">
                    {{ exp.category }}
                  </span>
                </TableCell>

                <!-- Title + meta -->
                <TableCell class="text-foreground/90 dark:text-white/90 align-top py-3">
                  <div class="font-semibold text-sm truncate">{{ exp.title || exp.description || '—' }}</div>
                  <div class="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span v-if="exp.beneficiary" class="text-[10px] text-muted-foreground">{{ exp.beneficiary }}</span>
                    <span v-if="exp.paymentMethod" class="text-[10px] uppercase font-bold text-muted-foreground/70">{{ exp.paymentMethod }}</span>
                    <template v-if="exp.attachmentUrls && exp.attachmentUrls.length > 0">
                      <button v-for="(url, idx) in exp.attachmentUrls" :key="idx" 
                        :title="`View attachment ${Number(idx) + 1}`"
                        class="text-brand-primary/70 hover:text-brand-primary flex items-center gap-0.5"
                        @click.stop="handleViewAttachment(url)">
                        <Paperclip class="size-3" />
                        <span class="text-[9px] font-bold" v-if="exp.attachmentUrls.length > 1">{{ Number(idx) + 1 }}</span>
                      </button>
                    </template>
                    <button v-else-if="exp.attachmentUrl" title="View attachment"
                      class="text-brand-primary/70 hover:text-brand-primary"
                      @click.stop="handleViewAttachment(exp.attachmentUrl)">
                      <Paperclip class="size-3" />
                    </button>
                  </div>
                  <div v-if="['REJECTED_ACCOUNTANT','REJECTED_MANAGER'].includes(exp.status)"
                    class="text-[10px] text-red-500 mt-1 flex items-start gap-1">
                    <AlertTriangle class="size-3 shrink-0 mt-0.5" />
                    <span class="italic line-clamp-2">{{ exp.accountantComment || exp.managerComment || 'No reason provided' }}</span>
                  </div>
                </TableCell>

                <!-- Status -->
                <TableCell class="align-top py-3">
                  <span class="inline-block px-2 py-1 rounded border text-[9px] font-black uppercase tracking-wider whitespace-nowrap"
                    :class="statusInfo(exp.status || 'PENDING_ACCOUNTANT').cls">
                    {{ statusInfo(exp.status || 'PENDING_ACCOUNTANT').label }}
                  </span>
                </TableCell>

                <!-- Amount -->
                <TableCell class="text-right font-bold text-foreground dark:text-white text-sm tabular-nums align-top py-3 whitespace-nowrap">
                  ${{ Number(exp.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }) }}
                </TableCell>

                <!-- Actions — icon-only buttons -->
                <TableCell class="text-right align-top py-3">
                  <div class="flex items-center justify-end gap-1">

                    <!-- Stage 1: Accountant approve/reject -->
                    <template v-if="exp.status === 'PENDING_ACCOUNTANT' && hasAnyRole(['ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN'])">
                      <Button variant="ghost" size="icon" title="Accountant Approve"
                        class="h-7 w-7 bg-blue-600/10 text-blue-600 hover:bg-blue-600 hover:text-white"
                        :disabled="isProcessing === exp.id"
                        @click="handleAccountantApprove(exp.id)">
                        <Loader2 v-if="isProcessing === exp.id" class="size-3.5 animate-spin" />
                        <CheckCircle2 v-else class="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" title="Reject"
                        class="h-7 w-7 bg-destructive/10 text-destructive hover:bg-destructive hover:text-white"
                        :disabled="isProcessing === exp.id"
                        @click="openRejectDialog(exp, 'accountant')">
                        <XCircle class="size-3.5" />
                      </Button>
                    </template>

                    <!-- Stage 2: Manager approve/reject (or Accountant if opex < $300) -->
                    <template v-if="exp.status === 'APPROVED_ACCOUNTANT' && (hasAnyRole(['MANAGER', 'ADMIN', 'SUPER_ADMIN']) || (hasAnyRole(['ACCOUNTANT']) && Number(exp.amount) < 300))">
                      <Button variant="ghost" size="icon" :title="hasAnyRole(['ACCOUNTANT']) && !hasAnyRole(['MANAGER', 'ADMIN', 'SUPER_ADMIN']) ? 'Accountant Approve' : 'Final Approve'"
                        :style="{ backgroundColor: (appSettings?.uiColors?.brandPrimaryColor || '#79c21b') + '20', color: appSettings?.uiColors?.brandPrimaryColor || '#79c21b' }"
                        class="h-7 w-7 hover:opacity-80"
                        :disabled="isProcessing === exp.id"
                        @click="handleManagerApprove(exp.id)">
                        <Loader2 v-if="isProcessing === exp.id" class="size-3.5 animate-spin" />
                        <CheckCircle2 v-else class="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" title="Reject"
                        class="h-7 w-7 bg-destructive/10 text-destructive hover:bg-destructive hover:text-white"
                        :disabled="isProcessing === exp.id"
                        @click="openRejectDialog(exp, 'manager')">
                        <XCircle class="size-3.5" />
                      </Button>
                    </template>

                    <!-- Process Payment -->
                    <Button v-if="canProcessPayment(exp.status) && hasAnyRole(['ADMIN', 'ACCOUNTANT', 'MANAGER', 'SUPER_ADMIN'])"
                      variant="ghost" size="icon" title="Process Payment"
                      class="h-7 w-7 bg-emerald-600/10 text-emerald-600 hover:bg-emerald-600 hover:text-white"
                      @click="openPaymentDialog(exp)">
                      <CreditCard class="size-3.5" />
                    </Button>

                    <!-- PDF download -->
                    <Button v-if="canDownloadPdf(exp)" variant="ghost" size="icon" title="Download PDF"
                      class="h-7 w-7 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                      :disabled="downloadingId === exp.id"
                      @click="handleDownloadPdf(exp)">
                      <Loader2 v-if="downloadingId === exp.id" class="size-3.5 animate-spin" />
                      <Download v-else class="size-3.5" />
                    </Button>

                    <!-- Super Admin Unlock PDF -->
                    <Button v-if="exp.pdfGenerated && isSuperAdmin" variant="ghost" size="icon" title="Unlock for Re-download"
                      class="h-7 w-7 text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20"
                      :disabled="isProcessing === exp.id"
                      @click="handleUnlockPdf(exp.id)">
                      <Loader2 v-if="isProcessing === exp.id" class="size-3.5 animate-spin" />
                      <XCircle v-else class="size-3.5" />
                    </Button>

                    <!-- Details -->
                    <Button variant="ghost" size="icon" title="View Details"
                      class="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-brand-primary/10"
                      @click="router.push(`/opex/${exp.id}`)">
                      <FileText class="size-3.5" />
                    </Button>

                    <!-- Admin Force Delete -->
                    <Button v-if="isSuperAdmin" variant="ghost" size="icon" title="Force Delete (Admin)"
                      class="h-7 w-7 text-destructive hover:bg-destructive/10 border border-destructive/20 ml-1"
                      @click="openAdminDelete(exp)">
                      <Trash2 class="size-3.5" />
                    </Button>

                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        
        <!-- Pagination Footer -->
        <div class="flex items-center justify-between px-6 py-4 border-t border-brand-primary/15 flex-wrap gap-4 bg-black/10">
          <div class="text-xs text-muted-foreground flex items-center gap-1">
            Showing
            <span class="font-bold text-foreground">{{ filteredExpenses.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1 }}</span>
            to
            <span class="font-bold text-foreground">{{ Math.min(currentPage * itemsPerPage, filteredExpenses.length) }}</span>
            of
            <span class="font-bold text-foreground">{{ filteredExpenses.length }}</span>
            entries
          </div>
          
          <div class="flex items-center gap-6 flex-wrap">
            <div class="flex items-center gap-2">
              <span class="text-xs text-muted-foreground whitespace-nowrap">Show:</span>
              <select 
                v-model="itemsPerPage" 
                class="bg-background border border-muted-foreground/30 rounded text-xs px-2 py-1.5 focus:ring-1 focus:ring-brand-primary focus:outline-none cursor-pointer text-foreground"
                @change="currentPage = 1"
              >
                <option :value="20">20 per view</option>
                <option :value="50">50 per view</option>
                <option :value="100">100 per view</option>
              </select>
            </div>
            
            <div class="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                class="h-8 w-8 text-foreground"
                :disabled="currentPage === 1"
                @click="currentPage = 1"
                title="First Page"
              >
                &laquo;
              </Button>
              <Button
                variant="outline"
                size="icon"
                class="h-8 w-8 text-foreground"
                :disabled="currentPage === 1"
                @click="currentPage--"
                title="Previous Page"
              >
                &lsaquo;
              </Button>
              
              <span class="text-xs text-muted-foreground px-2 whitespace-nowrap">
                Page <span class="font-bold text-foreground">{{ currentPage }}</span> of <span class="font-bold text-foreground">{{ totalPages }}</span>
              </span>
              
              <Button
                variant="outline"
                size="icon"
                class="h-8 w-8 text-foreground"
                :disabled="currentPage === totalPages"
                @click="currentPage++"
                title="Next Page"
              >
                &rsaquo;
              </Button>
              <Button
                variant="outline"
                size="icon"
                class="h-8 w-8 text-foreground"
                :disabled="currentPage === totalPages"
                @click="currentPage = totalPages"
                title="Last Page"
              >
                &raquo;
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Admin Confirmation Dialog -->
    <AdminDeleteDialog
        v-if="selectedOpexForAdminDelete"
        v-model:open="isAdminDeleteOpen"
        title="Admin Force Delete"
        :description="`You are about to PERMANENTLY delete Expense: ${selectedOpexForAdminDelete.title || selectedOpexForAdminDelete.description}. This will bypass all safety checks and clean up verification entries.`"
        :target-id="String(selectedOpexForAdminDelete.id).substring(0, 8).toUpperCase()"
        :loading="deletingId === selectedOpexForAdminDelete.id"
        @confirm="handleAdminDeleteConfirm"
    />
  </div>
</template>
