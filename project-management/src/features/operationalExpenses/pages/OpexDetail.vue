<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useFinanceStore } from '../../fundTransfers/store/financeStore'
import { useAdminStore } from '@/features/admin/store/adminStore'
import { storeToRefs } from 'pinia'
import { db } from '@/lib/firebase'
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { useSession } from '@/composables/useSession'
import {
  ArrowLeft, Download, Paperclip, CheckCircle2, XCircle, Loader2, Calendar,
  CreditCard, FileText, Eye, Trash2, Edit, Plus, X, AlertTriangle, Clock, DollarSign,
  UploadCloud, FileIcon
} from 'lucide-vue-next'
import { uploadExpenseAttachment } from '../../fundTransfers/utils/financeUtils'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { generateOpexPdf } from '../utils/generateOpexPdf'
import { useVerificationStore } from '@/features/verification/store/verificationStore'
import { toast } from 'vue-sonner'

const route = useRoute()
const router = useRouter()
const financeStore = useFinanceStore()
const adminStore = useAdminStore()
const verificationStore = useVerificationStore()
const { departments, expenseCategories, cashAccounts } = storeToRefs(adminStore)
const { hasAnyRole, user } = useSession()

const expenseId = route.params.id as string
const loading = ref(true)
const expense = ref<any>(null)
const isDownloading = ref(false)
const isApproving = ref(false)
const isManagerApproving = ref(false)
const isDeleting = ref(false)
const showDeleteConfirm = ref(false)

// ── Status Helpers ─────────────────────────────────────────────────────────────
function statusLabel(status: string) {
  const map: Record<string, { label: string; variant: string }> = {
    PENDING_ACCOUNTANT:   { label: 'Pending Accountant Approval', variant: 'bg-yellow-600 text-white' },
    APPROVED_ACCOUNTANT:  { label: 'Pending Manager Approval',    variant: 'bg-blue-600 text-white' },
    REJECTED_ACCOUNTANT:  { label: 'Rejected by Accountant',      variant: 'bg-destructive text-white' },
    REJECTED_MANAGER:     { label: 'Rejected by Manager',         variant: 'bg-destructive text-white' },
    APPROVED:             { label: 'Approved for Payment',        variant: 'bg-green-600 text-white' },
    APPROVED_FOR_PAYMENT: { label: 'Approved for Payment',        variant: 'bg-green-600 text-white' },
    PAYMENT_PROCESSED:    { label: 'Payment Processed',           variant: 'bg-emerald-700 text-white' },
  }
  return map[status] || { label: status || 'Pending', variant: 'bg-muted text-muted-foreground' }
}

const canDownloadPdf = computed(() => !!expense.value)

const canProcessPayment = computed(() =>
  ['APPROVED', 'APPROVED_FOR_PAYMENT'].includes(expense.value?.status)
)

// ── Edit Mode ──────────────────────────────────────────────────────────────────
const isEditing = ref(false)
const isSaving = ref(false)

const editForm = ref({
  title: '', description: '', project: '', department: '', requestType: '',
  beneficiary: '', accountNo: '', dueDate: '', pettyCashAccount: '', paymentMethod: '',
  category: '', currency: 'USD',
  items: [] as { description: string; quantity: number; estCost: number }[]
})

watch(() => editForm.value.pettyCashAccount, (val) => { editForm.value.paymentMethod = val })

const editTotalAmount = computed(() =>
  editForm.value.items.reduce((s, i) => s + (Number(i.quantity) * Number(i.estCost)), 0)
)

function startEdit() {
  editForm.value = {
    title: expense.value.title || expense.value.description || '',
    description: expense.value.description || '',
    project: expense.value.project || '',
    department: expense.value.department || '',
    requestType: expense.value.requestType || '',
    beneficiary: expense.value.beneficiary || '',
    accountNo: expense.value.accountNo || '',
    dueDate: expense.value.dueDate || '',
    pettyCashAccount: expense.value.pettyCashAccount || expense.value.paymentMethod || '',
    paymentMethod: expense.value.paymentMethod || '',
    category: expense.value.category || '',
    currency: expense.value.currency || 'USD',
    items: expense.value.items?.length
      ? expense.value.items.map((i: any) => ({ ...i }))
      : [{ description: '', quantity: 1, estCost: 0 }]
  }
  isEditing.value = true
}

function cancelEdit() { isEditing.value = false }
function addItem() { editForm.value.items.push({ description: '', quantity: 1, estCost: 0 }) }
function removeItem(idx: number) { if (editForm.value.items.length > 1) editForm.value.items.splice(idx, 1) }

async function handleSave() {
  if (!editForm.value.title || !editForm.value.department || !editForm.value.requestType) {
    return toast.error('Required Fields', { description: 'Title, department and request type are required.' })
  }
  if (!editForm.value.pettyCashAccount) {
    return toast.error('Payment Account Required', { description: 'Please select which account this expense is deducted from.' })
  }
  if (editForm.value.items.some(i => !i.description || i.estCost <= 0)) {
    return toast.error('Item Details', { description: 'All items need a description and cost greater than zero.' })
  }
  isSaving.value = true
  try {
    const amount = editTotalAmount.value
    await updateDoc(doc(db, 'operationalExpenses', expenseId), {
      title: editForm.value.title,
      description: editForm.value.description,
      project: editForm.value.project,
      department: editForm.value.department,
      requestType: editForm.value.requestType,
      beneficiary: editForm.value.beneficiary,
      accountNo: editForm.value.accountNo,
      dueDate: editForm.value.dueDate,
      pettyCashAccount: editForm.value.pettyCashAccount,
      paymentMethod: editForm.value.paymentMethod,
      category: editForm.value.category,
      currency: editForm.value.currency,
      items: editForm.value.items,
      amount,
      amendedAt: serverTimestamp(),
      amendedBy: user.value?.displayName || user.value?.email || 'Unknown'
    })
    expense.value = { ...expense.value, ...editForm.value, amount }
    isEditing.value = false
    toast.success('Expense Updated', { description: 'The requisition has been amended successfully.' })
  } catch (err: any) {
    toast.error('Save Failed', { description: err.message })
  } finally {
    isSaving.value = false
  }
}

// ── Rejection Modal ────────────────────────────────────────────────────────────
const rejectModal = ref({ show: false, type: '' as 'accountant' | 'manager', comment: '' })
const isRejecting = ref(false)

async function confirmReject() {
  if (!rejectModal.value.comment.trim()) return toast.error('Comment Required', { description: 'Please provide a reason for rejection.' })
  isRejecting.value = true
  try {
    const by = { name: user.value?.displayName || undefined, email: user.value?.email || undefined }
    if (rejectModal.value.type === 'accountant') {
      await financeStore.rejectExpenseByAccountant(expense.value.id, by, rejectModal.value.comment)
      expense.value.status = 'REJECTED_ACCOUNTANT'
      expense.value.accountantComment = rejectModal.value.comment
      expense.value.accountantRejectedBy = user.value?.displayName || user.value?.email
      toast.success('Rejected by Accountant', { description: 'Request returned to requester with comments.' })
    } else {
      await financeStore.rejectExpenseByManager(expense.value.id, by, rejectModal.value.comment)
      expense.value.status = 'REJECTED_MANAGER'
      expense.value.managerComment = rejectModal.value.comment
      expense.value.managerRejectedBy = user.value?.displayName || user.value?.email
      toast.success('Rejected by Manager', { description: 'Request returned to requester with comments.' })
    }
    rejectModal.value.show = false
  } catch (err: any) {
    toast.error('Rejection Failed', { description: err.message })
  } finally {
    isRejecting.value = false
  }
}

// ── Payment Modal ──────────────────────────────────────────────────────────────
const paymentModal = ref({
  show: false,
  form: {
    paymentMethod: '',
    ledgerAccount: '',
    transactionDate: new Date().toISOString().split('T')[0],
    referenceNumber: '',
    notes: ''
  }
})
const isProcessingPayment = ref(false)

const cardFileInput = ref<HTMLInputElement | null>(null)
const isUploadingAttachment = ref(false)
const paymentModalFile = ref<File | null>(null)
const paymentModalFileInput = ref<HTMLInputElement | null>(null)

const canManageAttachments = computed(() =>
  hasAnyRole(['ACCOUNTANT', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'])
)

function triggerCardAttachmentUpload() {
  cardFileInput.value?.click()
}

async function handleCardFileSelect(e: Event) {
  const target = e.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    const files = Array.from(target.files)
    isUploadingAttachment.value = true
    const toastId = toast.loading(`Uploading ${files.length} attachment(s)...`)
    try {
      const urls = await Promise.all(files.map(file => uploadExpenseAttachment(file, 'opex')))
      const currentUrls = [...(expense.value.attachmentUrls || (expense.value.attachmentUrl ? [expense.value.attachmentUrl] : []))]
      const updatedUrls = [...currentUrls, ...urls]
      
      await updateDoc(doc(db, 'operationalExpenses', expenseId), {
        attachmentUrls: updatedUrls,
        attachmentUrl: updatedUrls[0] || '',
        updatedAt: serverTimestamp(),
        updatedBy: user.value?.displayName || user.value?.email || 'Unknown'
      })
      expense.value.attachmentUrls = updatedUrls
      expense.value.attachmentUrl = updatedUrls[0] || ''
      toast.success('Attachment(s) uploaded successfully!', { id: toastId })
    } catch (err: any) {
      console.error(err)
      toast.error(err.message || 'Failed to upload attachment(s)', { id: toastId })
    } finally {
      isUploadingAttachment.value = false
      if (cardFileInput.value) cardFileInput.value.value = ''
    }
  }
}

async function handleRemoveAttachment(index: number) {
  if (!confirm('Are you sure you want to remove this attachment?')) return
  isUploadingAttachment.value = true
  const toastId = toast.loading('Removing attachment...')
  try {
    const currentUrls = [...(expense.value.attachmentUrls || (expense.value.attachmentUrl ? [expense.value.attachmentUrl] : []))]
    currentUrls.splice(index, 1)
    
    await updateDoc(doc(db, 'operationalExpenses', expenseId), {
      attachmentUrls: currentUrls,
      attachmentUrl: currentUrls[0] || '',
      updatedAt: serverTimestamp(),
      updatedBy: user.value?.displayName || user.value?.email || 'Unknown'
    })
    expense.value.attachmentUrls = currentUrls
    expense.value.attachmentUrl = currentUrls[0] || ''
    toast.success('Attachment removed successfully!', { id: toastId })
  } catch (err: any) {
    console.error(err)
    toast.error(err.message || 'Failed to remove attachment', { id: toastId })
  } finally {
    isUploadingAttachment.value = false
  }
}

function handlePaymentFileSelect(e: Event) {
  const target = e.target as HTMLInputElement
  if (target.files && target.files[0]) {
    paymentModalFile.value = target.files[0]
  }
}

function openPaymentDialog() {
  paymentModalFile.value = null
  if (paymentModalFileInput.value) paymentModalFileInput.value.value = ''
  paymentModal.value.form = {
    paymentMethod: expense.value?.paymentMethod || '',
    ledgerAccount: '',
    transactionDate: new Date().toISOString().split('T')[0] as string,
    referenceNumber: '',
    notes: ''
  }
  paymentModal.value.show = true
}

async function confirmPayment() {
  const f = paymentModal.value.form
  if (!f.paymentMethod || !f.transactionDate || !f.referenceNumber || !f.ledgerAccount) {
    return toast.error('Required Fields', { description: 'Please fill in all required payment fields.' })
  }
  isProcessingPayment.value = true
  const toastId = paymentModalFile.value ? toast.loading('Uploading payment receipt...') : null
  try {
    let attachmentUrls = expense.value.attachmentUrls || (expense.value.attachmentUrl ? [expense.value.attachmentUrl] : [])
    let attachmentUrl = expense.value.attachmentUrl || ''
    if (paymentModalFile.value) {
      const url = await uploadExpenseAttachment(paymentModalFile.value, 'opex')
      attachmentUrls = [...attachmentUrls, url]
      attachmentUrl = attachmentUrls[0] || url
      await updateDoc(doc(db, 'operationalExpenses', expenseId), {
        attachmentUrl,
        attachmentUrls,
        updatedAt: serverTimestamp()
      })
      expense.value.attachmentUrl = attachmentUrl
      expense.value.attachmentUrls = attachmentUrls
    }

    await financeStore.processExpensePayment(
      expense.value.id,
      { name: user.value?.displayName || undefined, email: user.value?.email || undefined },
      f
    )
    expense.value.status = 'PAYMENT_PROCESSED'
    expense.value.paymentDetails = f
    expense.value.paymentProcessedBy = user.value?.displayName || user.value?.email
    if (toastId) {
      toast.success('Payment Processed with Receipt', { id: toastId })
    } else {
      toast.success('Payment Processed', { description: 'Ledger entry created and linked to this expense.' })
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

const getFileName = (url: string) => {
  if (!url) return 'Document'
  try {
    const decoded = decodeURIComponent(url)
    const pathPart = decoded.split('?')[0] || ''
    const parts = pathPart.split('/')
    const fullName = parts[parts.length - 1] || ''
    return fullName.replace(/^\d+_/g, '')
  } catch (err) {
    return 'Document'
  }
}

// ── Existing Actions ───────────────────────────────────────────────────────────
onMounted(async () => {
  adminStore.fetchAll()
  if (financeStore.expenses.length === 0) {
    financeStore.fetchExpenses()
    await new Promise(r => setTimeout(r, 1000))
  }
  expense.value = financeStore.expenses.find(e => e.id === expenseId)
  if (!expense.value) {
    const snap = await getDoc(doc(db, 'operationalExpenses', expenseId))
    if (snap.exists()) {
      expense.value = { id: snap.id, ...snap.data() }
    } else {
      toast.error('Expense record not found')
      router.push('/opex')
    }
  }
  loading.value = false
})

const handleDownloadPdf = async () => {
  if (!expense.value) return
  isDownloading.value = true
  try {
    let currentSettings = adminStore.appSettings
    if (!currentSettings?.logoUrl) {
      const snap = await getDoc(doc(db, 'appSettings', 'general'))
      if (snap.exists()) {
        currentSettings = { id: snap.id, ...snap.data() }
        adminStore.appSettings = currentSettings
      }
    }
    const token = await verificationStore.ensureVerificationToken(
      expense.value.id,
      'OPEX',
      expense.value.id ? `OPEX-${String(expense.value.id).substring(0, 8).toUpperCase()}` : 'OPEX',
      expense.value.title || expense.value.description || 'Internal Requisition'
    )
    await generateOpexPdf(expense.value, currentSettings, currentSettings, user.value?.displayName || user.value?.email || 'System User', token)
    toast.success('PDF Downloaded!')
  } catch (err: any) {
    toast.error('Failed to generate PDF')
  } finally {
    isDownloading.value = false
  }
}

const handleAccountantApprove = async () => {
  if (!expense.value) return
  isApproving.value = true
  try {
    await financeStore.approveExpenseByAccountant(expense.value.id, {
      name: user.value?.displayName || undefined,
      email: user.value?.email || undefined
    })
    const isAutoApproved = Number(expense.value.amount || 0) < 300
    if (isAutoApproved) {
      expense.value.status = 'APPROVED_FOR_PAYMENT'
      expense.value.managerApprovedBy = 'System (Auto-approved < $300)'
      expense.value.managerApprovedAt = new Date().toISOString()
      toast.success('Accountant Approved', { description: 'Expense approved and ready for payment (< $300 auto-approval).' })
    } else {
      expense.value.status = 'APPROVED_ACCOUNTANT'
      toast.success('Accountant Approved', { description: 'Forwarded for manager final approval.' })
    }
    expense.value.accountantApprovedBy = user.value?.displayName || user.value?.email
    expense.value.accountantApprovedAt = new Date().toISOString()
  } catch (err: any) {
    toast.error('Failed to approve')
  } finally {
    isApproving.value = false
  }
}

const handleManagerApprove = async () => {
  if (!expense.value) return
  isManagerApproving.value = true
  try {
    await financeStore.approveExpenseByManager(expense.value.id, {
      name: user.value?.displayName || undefined,
      email: user.value?.email || undefined
    })
    const isAccountantApprove = hasAnyRole(['ACCOUNTANT']) && !hasAnyRole(['MANAGER', 'ADMIN', 'SUPER_ADMIN']) && Number(expense.value.amount || 0) < 300
    const descMsg = isAccountantApprove
      ? 'Expense approved and ready for payment (< $300 auto-approval).'
      : 'Expense approved for payment processing.'
    toast.success('Final Approval Granted', { description: descMsg })
    expense.value.status = 'APPROVED_FOR_PAYMENT'
    expense.value.managerApprovedBy = user.value?.displayName || user.value?.email
    expense.value.managerApprovedAt = new Date().toISOString()
  } catch (err: any) {
    toast.error('Failed to approve')
  } finally {
    isManagerApproving.value = false
  }
}

const handleDelete = async () => {
  if (!expense.value) return
  isDeleting.value = true
  try {
    await financeStore.deleteExpense(expense.value.id)
    toast.success('Expense Deleted')
    router.push('/opex')
  } catch (err: any) {
    toast.error('Delete Failed', { description: err.message })
  } finally {
    isDeleting.value = false
    showDeleteConfirm.value = false
  }
}

const formatDate = (val: any) => {
  if (!val) return 'N/A'
  if (val.toDate) return val.toDate().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  return new Date(val).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const canEdit = computed(() =>
  hasAnyRole(['ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN', 'MANAGER']) &&
  !['APPROVED', 'APPROVED_FOR_PAYMENT', 'PAYMENT_PROCESSED'].includes(expense.value?.status)
)
</script>

<template>
  <div v-if="loading" class="h-[400px] flex items-center justify-center">
    <Loader2 class="size-8 animate-spin text-primary" />
  </div>

  <div v-else-if="expense" class="space-y-6 max-w-5xl mx-auto">

    <!-- Rejection Modal -->
    <div v-if="rejectModal.show" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div class="bg-card border rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 space-y-4">
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-full bg-destructive/10 text-destructive"><XCircle class="size-5" /></div>
          <div>
            <h3 class="font-bold text-base">
              {{ rejectModal.type === 'accountant' ? 'Reject — Accountant Stage' : 'Reject — Manager Stage' }}
            </h3>
            <p class="text-xs text-muted-foreground mt-0.5">{{ expense.title || expense.description }}</p>
          </div>
        </div>
        <div class="space-y-2">
          <Label class="text-xs font-bold uppercase tracking-widest">Reason for Rejection *</Label>
          <Textarea v-model="rejectModal.comment" :rows="4"
            placeholder="Provide a clear reason so the requester can revise and resubmit..."
            class="resize-none" />
        </div>
        <div class="flex justify-end gap-3 pt-1">
          <Button variant="outline" @click="rejectModal.show = false" :disabled="isRejecting">Cancel</Button>
          <Button class="bg-destructive hover:bg-destructive/90 text-white"
            :disabled="!rejectModal.comment.trim() || isRejecting" @click="confirmReject">
            <Loader2 v-if="isRejecting" class="size-4 animate-spin mr-2" />
            <XCircle v-else class="size-4 mr-2" />
            {{ isRejecting ? 'Rejecting...' : 'Confirm Rejection' }}
          </Button>
        </div>
      </div>
    </div>

    <!-- Payment Modal -->
    <div v-if="paymentModal.show" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div class="bg-card border rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4 space-y-4">
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-full bg-emerald-500/10 text-emerald-600"><CreditCard class="size-5" /></div>
          <div>
            <h3 class="font-bold text-base text-emerald-600">Process Payment</h3>
            <p class="text-xs text-muted-foreground mt-0.5">{{ expense.title || expense.description }}</p>
            <p class="text-xs font-bold text-brand-secondary mt-0.5">
              Amount: ${{ Number(expense.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }) }}
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
            <Textarea v-model="paymentModal.form.notes" :rows="2" placeholder="Additional payment notes..." class="resize-none" />
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
          Expense Request ID: {{ expense.id }} &nbsp;|&nbsp; Linked automatically to this record.
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

    <!-- Delete Confirmation -->
    <div v-if="showDeleteConfirm" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div class="bg-card border rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4 space-y-4">
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-full bg-destructive/10 text-destructive"><Trash2 class="size-5" /></div>
          <div>
            <h3 class="font-bold text-base">Delete Expense Request?</h3>
            <p class="text-xs text-muted-foreground mt-0.5">This action cannot be undone.</p>
          </div>
        </div>
        <p class="text-sm text-muted-foreground">
          You are about to permanently delete <span class="font-semibold text-foreground">{{ expense.title || expense.description }}</span>.
        </p>
        <div class="flex justify-end gap-3 pt-2">
          <Button variant="outline" @click="showDeleteConfirm = false" :disabled="isDeleting">Cancel</Button>
          <Button class="bg-destructive hover:bg-destructive/90 text-white" @click="handleDelete" :disabled="isDeleting">
            <Loader2 v-if="isDeleting" class="size-4 animate-spin mr-2" />
            <Trash2 v-else class="mr-2 size-4" />
            {{ isDeleting ? 'Deleting...' : 'Yes, Delete' }}
          </Button>
        </div>
      </div>
    </div>

    <!-- Header -->
    <div class="flex flex-col md:flex-row md:items-start justify-between gap-4">
      <div class="flex items-start gap-4">
        <Button variant="outline" size="icon" @click="router.back()"><ArrowLeft class="size-4" /></Button>
        <div>
          <p class="text-sm font-medium text-muted-foreground uppercase tracking-widest">Expense Request</p>
          <h2 class="text-2xl font-extrabold tracking-tight flex items-center gap-3 flex-wrap">
            {{ expense.title || expense.description || 'Expense Requisition' }}
            <Badge :class="statusLabel(expense.status).variant" class="uppercase text-xs tracking-wider font-bold">
              {{ statusLabel(expense.status).label }}
            </Badge>
            <Badge v-if="isEditing" class="bg-amber-500 text-white text-xs font-bold animate-pulse">EDITING</Badge>
          </h2>
          <p class="text-muted-foreground uppercase text-xs tracking-widest font-black mt-1">
            REF: #OPEX-{{ expense.id.substring(0, 8).toUpperCase() }}
          </p>
        </div>
      </div>

      <div class="flex items-center gap-2 flex-wrap">
        <!-- Edit / Save / Cancel -->
        <template v-if="canEdit && !isEditing">
          <Button variant="outline" class="border-amber-500/40 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 gap-2"
            @click="startEdit">
            <Edit class="size-4" />Amend
          </Button>
        </template>
        <template v-else-if="isEditing">
          <Button variant="outline" @click="cancelEdit" :disabled="isSaving"><X class="mr-2 size-4" />Cancel</Button>
          <Button class="bg-brand-primary hover:bg-brand-primary/90 text-white gap-2" :disabled="isSaving" @click="handleSave">
            <Loader2 v-if="isSaving" class="size-4 animate-spin" />
            <CheckCircle2 v-else class="size-4" />
            {{ isSaving ? 'Saving...' : 'Save Changes' }}
          </Button>
        </template>

        <template v-if="!isEditing">
          <!-- Stage 1: Accountant -->
          <template v-if="expense.status === 'PENDING_ACCOUNTANT' && hasAnyRole(['ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN'])">
            <Button class="bg-blue-600 hover:bg-blue-700 text-white shadow-sm" :disabled="isApproving" @click="handleAccountantApprove">
              <Loader2 v-if="isApproving" class="size-4 animate-spin mr-2" />
              <CheckCircle2 v-else class="mr-2 size-4" />
              Accountant Approve
            </Button>
            <Button variant="outline" class="border-destructive/40 text-destructive hover:bg-destructive/10"
              @click="() => { rejectModal.type = 'accountant'; rejectModal.comment = ''; rejectModal.show = true }">
              <XCircle class="mr-2 size-4" />Reject
            </Button>
          </template>

          <!-- Stage 2: Manager (or Accountant if opex < $300) -->
          <template v-if="expense.status === 'APPROVED_ACCOUNTANT' && (hasAnyRole(['MANAGER', 'ADMIN', 'SUPER_ADMIN']) || (hasAnyRole(['ACCOUNTANT']) && Number(expense.amount) < 300))">
            <Button class="bg-brand-primary hover:bg-brand-primary/90 text-white shadow-sm" :disabled="isManagerApproving" @click="handleManagerApprove">
              <Loader2 v-if="isManagerApproving" class="size-4 animate-spin mr-2" />
              <CheckCircle2 v-else class="mr-2 size-4" />
              {{ hasAnyRole(['ACCOUNTANT']) && !hasAnyRole(['MANAGER', 'ADMIN', 'SUPER_ADMIN']) ? 'Accountant Approve' : 'Final Approve' }}
            </Button>
            <Button variant="outline" class="border-destructive/40 text-destructive hover:bg-destructive/10"
              @click="() => { rejectModal.type = 'manager'; rejectModal.comment = ''; rejectModal.show = true }">
              <XCircle class="mr-2 size-4" />Reject
            </Button>
          </template>

          <!-- Payment processing -->
          <Button v-if="canProcessPayment && hasAnyRole(['ADMIN', 'ACCOUNTANT', 'MANAGER', 'SUPER_ADMIN'])"
            class="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm" @click="openPaymentDialog">
            <CreditCard class="mr-2 size-4" />Process Payment
          </Button>

          <!-- PDF Download -->
          <Button variant="outline" @click="handleDownloadPdf" :disabled="isDownloading || !canDownloadPdf"
            class="shadow-sm">
            <Loader2 v-if="isDownloading" class="size-4 animate-spin mr-2" />
            <Download v-else class="mr-2 size-4" />
            {{ ['APPROVED', 'APPROVED_FOR_PAYMENT', 'PAYMENT_PROCESSED'].includes(expense?.status) ? 'Download PDF' : 'Download Draft PDF' }}
          </Button>

          <Button v-if="hasAnyRole(['MANAGER', 'SUPER_ADMIN'])" variant="outline"
            class="border-destructive/50 text-destructive hover:bg-destructive hover:text-white shadow-sm"
            :disabled="isDeleting" @click="showDeleteConfirm = true">
            <Trash2 class="mr-2 size-4" />Delete
          </Button>
        </template>
      </div>
    </div>

    <!-- Rejection Alert -->
    <div v-if="['REJECTED_ACCOUNTANT', 'REJECTED_MANAGER'].includes(expense.status)"
      class="border border-destructive/30 bg-destructive/5 rounded-lg p-4 flex items-start gap-3">
      <AlertTriangle class="size-5 text-destructive shrink-0 mt-0.5" />
      <div>
        <p class="font-bold text-destructive text-sm">
          {{ expense.status === 'REJECTED_ACCOUNTANT' ? 'Rejected by Accountant' : 'Rejected by Manager' }}
        </p>
        <p class="text-sm text-foreground/80 mt-1 italic">
          "{{ expense.accountantComment || expense.managerComment || 'No reason provided.' }}"
        </p>
        <p class="text-xs text-muted-foreground mt-1">
          — {{ expense.accountantRejectedBy || expense.managerRejectedBy || 'Reviewer' }}
        </p>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <!-- Left Column -->
      <div class="md:col-span-2 space-y-6">

        <!-- Read Mode: General Information -->
        <Card v-if="!isEditing" class="bg-brand-secondary/5 border-brand-secondary/20 shadow-md">
          <CardHeader class="pb-4">
            <CardTitle class="text-brand-secondary flex items-center gap-2 text-lg">
              <FileText class="size-5" />General Information
            </CardTitle>
          </CardHeader>
          <CardContent class="grid grid-cols-2 md:grid-cols-3 gap-6">
            <div class="col-span-2 md:col-span-3 space-y-1">
              <span class="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Expense Title</span>
              <p class="font-bold text-lg text-foreground">{{ expense.title || expense.description }}</p>
              <p v-if="expense.description && expense.description !== expense.title" class="text-sm text-muted-foreground mt-1">
                {{ expense.description }}
              </p>
            </div>
            <div v-if="expense.project" class="col-span-2 md:col-span-3 space-y-1">
              <span class="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Project</span>
              <p class="font-bold text-foreground">{{ expense.project }}</p>
            </div>
            <div class="space-y-1">
              <span class="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Department</span>
              <p class="font-bold text-foreground">{{ expense.department || 'N/A' }}</p>
            </div>
            <div class="space-y-1">
              <span class="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Request Type</span>
              <p class="font-bold text-foreground uppercase">{{ expense.requestType || 'N/A' }}</p>
            </div>
            <div class="space-y-1">
              <span class="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Category</span>
              <p class="font-bold text-foreground">{{ expense.category }}</p>
            </div>
            <div class="space-y-1">
              <span class="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Beneficiary</span>
              <p class="font-bold text-foreground">{{ expense.beneficiary || 'N/A' }}</p>
            </div>
            <div class="space-y-1">
              <span class="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Account Details</span>
              <p class="font-bold text-foreground">{{ expense.accountNo || 'N/A' }}</p>
            </div>
            <div class="space-y-1">
              <span class="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Due Date</span>
              <div class="flex items-center gap-2 font-bold">
                <Calendar class="size-4 text-muted-foreground" />{{ expense.dueDate || 'N/A' }}
              </div>
            </div>
            <div class="space-y-1">
              <span class="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Currency</span>
              <p class="font-bold text-foreground">{{ expense.currency || 'USD' }}</p>
            </div>
            <div class="space-y-1">
              <span class="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Payment Method</span>
              <div class="flex items-center gap-2 font-bold uppercase text-foreground">
                <CreditCard class="size-4 text-muted-foreground" />{{ expense.paymentMethod }}
              </div>
            </div>
            <div class="space-y-1">
              <span class="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Source Account</span>
              <p class="font-bold text-foreground uppercase">{{ expense.pettyCashAccount || 'N/A' }}</p>
            </div>
            <div class="space-y-1">
              <span class="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Requested By</span>
              <p class="font-bold text-foreground">{{ expense.createdByName || expense.createdByEmail || 'N/A' }}</p>
            </div>
            <div class="space-y-1">
              <span class="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Date Submitted</span>
              <div class="flex items-center gap-2 font-bold">
                <Calendar class="size-4 text-muted-foreground" />{{ formatDate(expense.createdAt) }}
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Edit Mode: General Information -->
        <Card v-else class="border-amber-500/30 shadow-md">
          <CardHeader class="pb-4 bg-amber-500/5 border-b border-amber-500/20">
            <CardTitle class="text-amber-600 flex items-center gap-2 text-lg">
              <Edit class="size-5" />Amend Requisition Details
            </CardTitle>
          </CardHeader>
          <CardContent class="pt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="md:col-span-2 space-y-1.5">
              <Label class="text-xs font-black uppercase tracking-widest">Expense Title *</Label>
              <Input v-model="editForm.title" placeholder="Enter expense title" />
            </div>
            <div class="md:col-span-2 space-y-1.5">
              <Label class="text-xs font-black uppercase tracking-widest">Description</Label>
              <Textarea v-model="editForm.description" :rows="2" placeholder="Business justification..." class="resize-none" />
            </div>
            <div class="md:col-span-2 space-y-1.5">
              <Label class="text-xs font-black uppercase tracking-widest">Project (optional)</Label>
              <Input v-model="editForm.project" placeholder="Project name if applicable" />
            </div>
            <div class="space-y-1.5">
              <Label class="text-xs font-black uppercase tracking-widest">Department *</Label>
              <Select v-model="editForm.department">
                <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="d in departments" :key="d.id" :value="d.name">{{ d.name }}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="space-y-1.5">
              <Label class="text-xs font-black uppercase tracking-widest">Request Type *</Label>
              <Select v-model="editForm.requestType">
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="purchase">Purchase</SelectItem>
                  <SelectItem value="service">Service/Maintenance</SelectItem>
                  <SelectItem value="reimbursement">Reimbursement</SelectItem>
                  <SelectItem value="advance">Cash Advance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="space-y-1.5">
              <Label class="text-xs font-black uppercase tracking-widest">Category</Label>
              <Select v-model="editForm.category">
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="c in expenseCategories" :key="c.id" :value="c.name">{{ c.name }}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="space-y-1.5">
              <Label class="text-xs font-black uppercase tracking-widest">Currency</Label>
              <Select v-model="editForm.currency">
                <SelectTrigger><SelectValue placeholder="Select currency" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD — US Dollar</SelectItem>
                  <SelectItem value="ZWL">ZWL — Zimbabwe Dollar</SelectItem>
                  <SelectItem value="ZAR">ZAR — South African Rand</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="space-y-1.5">
              <Label class="text-xs font-black uppercase tracking-widest">Payment Account *</Label>
              <Select v-model="editForm.pettyCashAccount">
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank">Bank</SelectItem>
                  <SelectItem value="ecocash">EcoCash</SelectItem>
                  <SelectItem value="ird">IRD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="space-y-1.5">
              <Label class="text-xs font-black uppercase tracking-widest">Beneficiary</Label>
              <Input v-model="editForm.beneficiary" placeholder="Name of beneficiary" />
            </div>
            <div class="space-y-1.5">
              <Label class="text-xs font-black uppercase tracking-widest">Account Details / Ref</Label>
              <Input v-model="editForm.accountNo" placeholder="Bank account / EcoCash number" />
            </div>
            <div class="space-y-1.5">
              <Label class="text-xs font-black uppercase tracking-widest">Due Date</Label>
              <Input v-model="editForm.dueDate" type="date" />
            </div>
          </CardContent>
        </Card>

        <!-- Line Items (Read) -->
        <Card v-if="!isEditing && expense.items && expense.items.length > 0" class="shadow-md overflow-hidden">
          <CardHeader class="pb-3 bg-muted/30 border-b">
            <CardTitle class="text-sm flex items-center gap-2 font-bold uppercase tracking-wider text-brand-secondary">
              <FileText class="size-4" />Line Items Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent class="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead class="text-center">Qty</TableHead>
                  <TableHead class="text-right">Unit Cost</TableHead>
                  <TableHead class="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="(item, idx) in expense.items" :key="idx">
                  <TableCell class="font-medium">{{ item.description }}</TableCell>
                  <TableCell class="text-center">{{ item.quantity }}</TableCell>
                  <TableCell class="text-right">{{ expense.currency || 'USD' }} {{ Number(item.estCost).toFixed(2) }}</TableCell>
                  <TableCell class="text-right font-bold text-brand-secondary">
                    {{ expense.currency || 'USD' }} {{ (Number(item.quantity) * Number(item.estCost)).toFixed(2) }}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <!-- Line Items (Edit) -->
        <Card v-if="isEditing" class="border-amber-500/30 shadow-md overflow-hidden">
          <CardHeader class="pb-3 bg-amber-500/5 border-b border-amber-500/20">
            <div class="flex items-center justify-between">
              <CardTitle class="text-sm flex items-center gap-2 font-bold uppercase tracking-wider text-amber-600">
                <FileText class="size-4" />Line Items
              </CardTitle>
              <Button size="sm" variant="outline" class="h-7 text-xs gap-1 border-brand-primary/30 text-brand-primary hover:bg-brand-primary/5" @click="addItem">
                <Plus class="size-3" />Add Item
              </Button>
            </div>
          </CardHeader>
          <CardContent class="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead class="w-20 text-center">Qty</TableHead>
                  <TableHead class="w-28 text-right">Unit Cost</TableHead>
                  <TableHead class="w-28 text-right">Total</TableHead>
                  <TableHead class="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="(item, idx) in editForm.items" :key="idx">
                  <TableCell class="py-1 px-2">
                    <Input v-model="item.description" placeholder="Item description" class="h-8 text-sm" />
                  </TableCell>
                  <TableCell class="py-1 px-2">
                    <Input v-model.number="item.quantity" type="number" min="1" class="h-8 text-sm text-center w-16" />
                  </TableCell>
                  <TableCell class="py-1 px-2">
                    <Input v-model.number="item.estCost" type="number" min="0" step="0.01" placeholder="0.00" class="h-8 text-sm text-right" />
                  </TableCell>
                  <TableCell class="py-1 px-2 text-right font-bold text-brand-secondary text-sm tabular-nums">
                    ${{ (Number(item.quantity) * Number(item.estCost)).toFixed(2) }}
                  </TableCell>
                  <TableCell class="py-1 px-1">
                    <Button size="icon" variant="ghost" class="h-7 w-7 text-destructive/60 hover:text-destructive hover:bg-destructive/10"
                      :disabled="editForm.items.length <= 1" @click="removeItem(idx)">
                      <X class="size-3" />
                    </Button>
                  </TableCell>
                </TableRow>
                <TableRow class="bg-muted/20 font-black">
                  <TableCell colspan="3" class="text-right text-xs uppercase tracking-widest text-muted-foreground px-3">Total Amount</TableCell>
                  <TableCell class="text-right font-black text-base tabular-nums text-brand-secondary">
                    ${{ editTotalAmount.toFixed(2) }}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <!-- Payment Details (if processed) -->
        <Card v-if="expense.status === 'PAYMENT_PROCESSED' && expense.paymentDetails" class="border-emerald-500/30 shadow-md">
          <CardHeader class="pb-3 bg-emerald-500/5 border-b border-emerald-500/20">
            <CardTitle class="text-sm flex items-center gap-2 font-bold uppercase tracking-wider text-emerald-600">
              <DollarSign class="size-4" />Payment Details
            </CardTitle>
          </CardHeader>
          <CardContent class="grid grid-cols-2 md:grid-cols-3 gap-4 pt-4">
            <div class="space-y-1">
              <span class="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Ledger Account</span>
              <p class="font-bold">{{ expense.paymentDetails.ledgerAccount }}</p>
            </div>
            <div class="space-y-1">
              <span class="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Payment Method</span>
              <p class="font-bold uppercase">{{ expense.paymentDetails.paymentMethod }}</p>
            </div>
            <div class="space-y-1">
              <span class="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Transaction Date</span>
              <p class="font-bold">{{ expense.paymentDetails.transactionDate }}</p>
            </div>
            <div class="space-y-1">
              <span class="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Reference Number</span>
              <p class="font-bold font-mono">{{ expense.paymentDetails.referenceNumber }}</p>
            </div>
            <div class="space-y-1">
              <span class="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Expense Request ID</span>
              <p class="font-bold font-mono text-xs">{{ expense.id }}</p>
            </div>
            <div v-if="expense.paymentDetails.notes" class="col-span-2 md:col-span-3 space-y-1">
              <span class="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Notes</span>
              <p class="text-sm italic">{{ expense.paymentDetails.notes }}</p>
            </div>
          </CardContent>
        </Card>

        <!-- Supporting Documents -->
        <Card class="shadow-sm relative overflow-hidden">
          <!-- Loading Overlay -->
          <div v-if="isUploadingAttachment" class="absolute inset-0 bg-background/60 backdrop-blur-sm z-10 flex items-center justify-center flex-col gap-2">
            <Loader2 class="size-8 animate-spin text-primary" />
            <span class="text-xs font-semibold text-muted-foreground">Processing attachment...</span>
          </div>

          <CardHeader class="pb-3 bg-muted/30 border-b">
            <CardTitle class="text-sm flex items-center gap-2 font-bold uppercase tracking-wider">
              <Paperclip class="size-4 text-muted-foreground" />Supporting Documents
            </CardTitle>
          </CardHeader>
          <CardContent class="pt-6">
            <input type="file" ref="cardFileInput" class="hidden" accept="image/*,.pdf" multiple @change="handleCardFileSelect" />

            <div class="space-y-3">
              <div v-if="canManageAttachments" @click="triggerCardAttachmentUpload"
                class="group border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center gap-1 hover:bg-primary/5 hover:border-primary/30 cursor-pointer transition-all border-muted/20 text-center mb-4">
                <UploadCloud class="size-6 text-muted-foreground group-hover:text-primary" />
                <span class="text-xs font-semibold">Upload Receipt, Invoice or Quote</span>
                <span class="text-[10px] text-muted-foreground">Click to upload images or PDFs (multiple allowed)</span>
              </div>

              <template v-if="(expense.attachmentUrls && expense.attachmentUrls.length > 0) || expense.attachmentUrl || expense.receiptUrl">
                <div v-for="(url, idx) in (expense.attachmentUrls && expense.attachmentUrls.length > 0 ? expense.attachmentUrls : [expense.attachmentUrl || expense.receiptUrl])" :key="url + '-' + idx"
                  class="flex items-center gap-4 p-3 border rounded-lg bg-background hover:bg-muted/10 transition-colors">
                  <div class="bg-blue-100 dark:bg-blue-900/30 p-2.5 rounded-full text-blue-600 dark:text-blue-400 shrink-0">
                    <FileText class="size-5" />
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="font-semibold text-sm truncate">{{ getFileName(url) }}</p>
                    <p class="text-xs text-muted-foreground truncate">Attachment {{ Number(idx) + 1 }} • Attached via application</p>
                  </div>
                  <div class="flex items-center gap-2 shrink-0">
                    <Button variant="outline" size="sm" as="a" :href="url" target="_blank" class="group h-8 px-3">
                      <Eye class="size-3.5 mr-1.5 text-muted-foreground group-hover:text-foreground" />View
                    </Button>
                    <Button v-if="canManageAttachments" variant="ghost" size="icon" @click="handleRemoveAttachment(Number(idx))" class="text-destructive hover:bg-destructive/10 h-8 w-8">
                      <Trash2 class="size-3.5" />
                    </Button>
                  </div>
                </div>
              </template>

              <template v-else>
                <div class="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                  <Paperclip class="size-8 mx-auto mb-3 opacity-20" />
                  <p class="text-sm font-semibold">No Attachments</p>
                  <p class="text-xs mt-1">No receipts or invoices were uploaded.</p>
                </div>
              </template>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- Right Column -->
      <div class="space-y-6">
        <!-- Amount Card -->
        <Card class="bg-brand-secondary text-white overflow-hidden shadow-lg border-none relative">
          <div class="absolute -right-6 -top-6 opacity-10 pointer-events-none">
            <CreditCard class="size-32" />
          </div>
          <CardHeader class="pb-4 relative z-10">
            <CardTitle class="text-white/80 text-sm tracking-widest uppercase font-black">
              {{ isEditing ? 'Amended Amount' : 'Authorized Amount' }}
            </CardTitle>
          </CardHeader>
          <CardContent class="relative z-10">
            <p class="text-4xl font-black drop-shadow-sm tracking-tighter">
              ${{ Number(isEditing ? editTotalAmount : (expense.amount || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 }) }}
            </p>
            <p class="text-white/70 text-xs mt-2 uppercase font-mono tracking-widest">{{ expense.currency || 'USD' }}</p>
            <p v-if="isEditing && editTotalAmount !== expense.amount" class="text-white/60 text-xs mt-1 italic">
              Was: ${{ Number(expense.amount || 0).toFixed(2) }}
            </p>
          </CardContent>
        </Card>

        <!-- PDF Draft Notice -->
        <div v-if="!['APPROVED', 'APPROVED_FOR_PAYMENT', 'PAYMENT_PROCESSED'].includes(expense?.status)"
          class="flex items-start gap-3 p-3 rounded-lg border border-muted/30 bg-muted/20 text-xs text-muted-foreground">
          <Download class="size-4 shrink-0 mt-0.5 opacity-50" />
          <span>PDF download is available at all stages. Draft PDFs include a DRAFT watermark and no manager signature. The final signed PDF is available once the Manager gives final approval.</span>
        </div>

        <!-- Audit Trail -->
        <Card class="shadow-sm">
          <CardHeader class="bg-muted/10 pb-4 border-b">
            <CardTitle class="text-sm font-bold tracking-wider uppercase">Approval Audit Trail</CardTitle>
          </CardHeader>
          <CardContent class="space-y-5 pt-6 text-sm">

            <!-- Step 1: Submitted -->
            <div class="flex items-start gap-3">
              <div class="mt-0.5 p-1.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600">
                <Clock class="size-3" />
              </div>
              <div>
                <p class="font-bold text-xs uppercase text-blue-600">Submitted</p>
                <p class="font-medium">{{ formatDate(expense.createdAt) }}</p>
                <p class="text-xs text-muted-foreground mt-0.5">{{ expense.createdByName || expense.createdByEmail || 'Unknown' }}</p>
                <p class="text-xs text-muted-foreground">{{ expense.createdByEmail }}</p>
              </div>
            </div>

            <!-- Amendment -->
            <div v-if="expense.amendedAt" class="flex items-start gap-3">
              <div class="mt-0.5 p-1.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600">
                <Edit class="size-3" />
              </div>
              <div>
                <p class="font-bold text-xs uppercase text-amber-600">Amended</p>
                <p class="font-medium">{{ formatDate(expense.amendedAt) }}</p>
                <p class="text-xs text-muted-foreground mt-0.5">{{ expense.amendedBy }}</p>
              </div>
            </div>

            <!-- Step 2: Accountant Decision -->
            <div v-if="['APPROVED_ACCOUNTANT','APPROVED','APPROVED_FOR_PAYMENT','PAYMENT_PROCESSED'].includes(expense.status)"
              class="flex items-start gap-3">
              <div class="mt-0.5 p-1.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600">
                <CheckCircle2 class="size-3" />
              </div>
              <div>
                <p class="font-bold text-xs uppercase text-blue-600">Approved by Accountant</p>
                <p class="font-medium">{{ formatDate(expense.accountantApprovedAt) }}</p>
                <p class="text-xs text-muted-foreground mt-0.5">{{ expense.accountantApprovedBy || 'Accountant' }}</p>
                <p v-if="expense.accountantComment" class="text-xs italic text-muted-foreground mt-1">
                  "{{ expense.accountantComment }}"
                </p>
              </div>
            </div>
            <div v-else-if="expense.status === 'REJECTED_ACCOUNTANT'" class="flex items-start gap-3">
              <div class="mt-0.5 p-1.5 rounded-full bg-red-100 dark:bg-red-900/30 text-destructive">
                <XCircle class="size-3" />
              </div>
              <div>
                <p class="font-bold text-xs uppercase text-destructive">Rejected by Accountant</p>
                <p class="font-medium">{{ formatDate(expense.accountantRejectedAt) }}</p>
                <p class="text-xs text-muted-foreground mt-0.5">{{ expense.accountantRejectedBy || 'Accountant' }}</p>
                <p v-if="expense.accountantComment" class="text-xs italic text-destructive/80 mt-1 border-l-2 border-destructive/40 pl-2">
                  "{{ expense.accountantComment }}"
                </p>
              </div>
            </div>
            <div v-else class="flex items-start gap-3 opacity-40">
              <div class="mt-0.5 p-1.5 rounded-full border-2 border-dashed border-muted-foreground">
                <div class="size-2" />
              </div>
              <div>
                <p class="font-bold text-xs uppercase text-muted-foreground">Pending Accountant Approval</p>
                <p class="text-xs italic mt-0.5">Awaiting accountant review</p>
              </div>
            </div>

            <!-- Step 3: Manager Decision -->
            <div v-if="['APPROVED','APPROVED_FOR_PAYMENT','PAYMENT_PROCESSED'].includes(expense.status)"
              class="flex items-start gap-3">
              <div class="mt-0.5 p-1.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600">
                <CheckCircle2 class="size-3" />
              </div>
              <div>
                <p class="font-bold text-xs uppercase text-green-600">Final Approval by Manager</p>
                <p class="font-medium">{{ formatDate(expense.managerApprovedAt || expense.approvedAt) }}</p>
                <p class="text-xs text-muted-foreground mt-0.5">{{ expense.managerApprovedBy || 'Manager' }}</p>
                <p v-if="expense.managerComment" class="text-xs italic text-muted-foreground mt-1">
                  "{{ expense.managerComment }}"
                </p>
              </div>
            </div>
            <div v-else-if="expense.status === 'REJECTED_MANAGER'" class="flex items-start gap-3">
              <div class="mt-0.5 p-1.5 rounded-full bg-red-100 dark:bg-red-900/30 text-destructive">
                <XCircle class="size-3" />
              </div>
              <div>
                <p class="font-bold text-xs uppercase text-destructive">Rejected by Manager</p>
                <p class="font-medium">{{ formatDate(expense.managerRejectedAt) }}</p>
                <p class="text-xs text-muted-foreground mt-0.5">{{ expense.managerRejectedBy || 'Manager' }}</p>
                <p v-if="expense.managerComment" class="text-xs italic text-destructive/80 mt-1 border-l-2 border-destructive/40 pl-2">
                  "{{ expense.managerComment }}"
                </p>
              </div>
            </div>
            <div v-else-if="!['REJECTED_ACCOUNTANT'].includes(expense.status)" class="flex items-start gap-3 opacity-40">
              <div class="mt-0.5 p-1.5 rounded-full border-2 border-dashed border-muted-foreground">
                <div class="size-2" />
              </div>
              <div>
                <p class="font-bold text-xs uppercase text-muted-foreground">Pending Manager Approval</p>
                <p class="text-xs italic mt-0.5">Awaiting manager final authorization</p>
              </div>
            </div>

            <!-- Step 4: Payment Processed -->
            <div v-if="expense.status === 'PAYMENT_PROCESSED'" class="flex items-start gap-3">
              <div class="mt-0.5 p-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600">
                <DollarSign class="size-3" />
              </div>
              <div>
                <p class="font-bold text-xs uppercase text-emerald-600">Payment Processed &amp; Ledger Posted</p>
                <p class="font-medium">{{ formatDate(expense.paymentProcessedAt) }}</p>
                <p class="text-xs text-muted-foreground mt-0.5">{{ expense.paymentProcessedBy || 'Finance' }}</p>
                <p v-if="expense.paymentDetails?.referenceNumber" class="text-xs font-mono text-muted-foreground mt-1">
                  Ref: {{ expense.paymentDetails.referenceNumber }}
                </p>
              </div>
            </div>
            <div v-else-if="['APPROVED','APPROVED_FOR_PAYMENT'].includes(expense.status)" class="flex items-start gap-3 opacity-40">
              <div class="mt-0.5 p-1.5 rounded-full border-2 border-dashed border-muted-foreground">
                <div class="size-2" />
              </div>
              <div>
                <p class="font-bold text-xs uppercase text-muted-foreground">Awaiting Payment Processing</p>
                <p class="text-xs italic mt-0.5">Finance to record payment and post to ledger</p>
              </div>
            </div>

          </CardContent>
        </Card>
      </div>
    </div>
  </div>
</template>
