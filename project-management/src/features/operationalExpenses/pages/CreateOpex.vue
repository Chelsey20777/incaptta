<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useFinanceStore } from '../../fundTransfers/store/financeStore'
import { useAdminStore } from '../../admin/store/adminStore'
import { storeToRefs } from 'pinia'
import { AlertTriangle } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ArrowLeft, UploadCloud, FileIcon, X, Plus, Trash2, Loader2 } from 'lucide-vue-next'
import { uploadExpenseAttachment } from '../../fundTransfers/utils/financeUtils'
import { toast } from 'vue-sonner'
import { useSession } from '@/composables/useSession'

const router = useRouter()
const store = useFinanceStore()
const adminStore = useAdminStore()
const { user, hasAnyRole } = useSession()
const { departments, expenseCategories, cashAccounts, loading: adminLoading } = storeToRefs(adminStore)
const { finalBalances, loading: balancesLoading } = storeToRefs(store)
const isSubmitting = ref(false)

onMounted(() => {
  adminStore.fetchAll()
  store.fetchExpenses()
  store.fetchTransfers()
  store.fetchJobPayments()
  store.fetchTopUps()
})

onUnmounted(() => {
  adminStore.cleanup()
  store.cleanup()
})

const fmt = (n: number) =>
  Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Live balance for the selected payment account
const paymentBalance = computed(() => {
  if (!form.value.pettyCashAccount) return null
  return finalBalances.value[form.value.pettyCashAccount.toUpperCase()] ?? 0
})

const isInsufficientFunds = computed(() =>
  paymentBalance.value !== null &&
  totalAmount.value > 0 &&
  totalAmount.value > paymentBalance.value
)

const form = ref({
  title: '',
  description: '',
  project: '',
  department: '',
  requestType: '',
  beneficiary: '',
  accountNo: '',
  dueDate: '',
  pettyCashAccount: '',
  category: 'operational', // Default for opex
  taxCategory: 'DEDUCTIBLE', // Default for ZIMRA compliance
  currency: 'USD',
  paymentMethod: '' // Synced from pettyCashAccount selection
})

// Keep paymentMethod in sync with pettyCashAccount (they represent the same concept)
watch(() => form.value.pettyCashAccount, (val) => {
  form.value.paymentMethod = val
})

const items = ref([
  { description: '', quantity: 1, estCost: 0 }
])

interface LineItem {
  description: string
  quantity: number
  estCost: number
}

const addItem = () => {
  items.value.push({ description: '', quantity: 1, estCost: 0 })
}

const removeItem = (index: number) => {
  if (items.value.length > 1) {
    items.value.splice(index, 1)
  }
}

const totalAmount = computed(() => {
  return items.value.reduce((sum, item) => sum + (item.quantity * item.estCost), 0)
})

const fileInput = ref<HTMLInputElement | null>(null)
const selectedFiles = ref<File[]>([])

const handleFileSelect = (e: Event) => {
  const target = e.target as HTMLInputElement
  if (target.files) {
    selectedFiles.value.push(...Array.from(target.files))
  }
}

const triggerFileUpload = () => {
  fileInput.value?.click()
}

const removeFile = (index: number) => {
  selectedFiles.value.splice(index, 1)
  if (selectedFiles.value.length === 0 && fileInput.value) {
    fileInput.value.value = ''
  }
}

const handleSubmit = async () => {
  if (!form.value.title || !form.value.department || !form.value.requestType) {
    return toast.error('Required Fields', { description: 'Please fill in title, department and request type.' })
  }

  if (!form.value.pettyCashAccount) {
    return toast.error('Payment Account Required', { description: 'Please select which account this expense will be deducted from.' })
  }

  if (items.value.some(i => !i.description || i.estCost <= 0)) {
    return toast.error('Item Details', { description: 'Please ensure all items have a description and cost.' })
  }

  if (isInsufficientFunds.value) {
    const account = form.value.pettyCashAccount.toUpperCase()
    const shortfall = totalAmount.value - (paymentBalance.value ?? 0)
    return toast.error(`Insufficient Funds in ${account}`, {
      description: `Available: $${fmt(paymentBalance.value ?? 0)} — Required: $${fmt(totalAmount.value)} — Shortfall: $${fmt(shortfall)}. Please select a different payment account or reduce the amount.`,
      duration: 6000
    })
  }

  isSubmitting.value = true
  try {
    let attachmentUrls: string[] = []
    let attachmentUrl = ''
    if (selectedFiles.value.length > 0) {
      toast.loading(`Uploading ${selectedFiles.value.length} attachment(s)...`, { id: 'opex-upload' })
      attachmentUrls = await Promise.all(
        selectedFiles.value.map(file => uploadExpenseAttachment(file, 'opex'))
      )
      attachmentUrl = attachmentUrls[0] || ''
    }

    // Accountants/Admins submitting on behalf — auto-pass accountant stage, auto-approve < $300
    const isAccountantOrAbove = hasAnyRole(['ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN'])
    const isAutoApproved = totalAmount.value < 300
    const initialStatus = isAccountantOrAbove 
      ? (isAutoApproved ? 'APPROVED_FOR_PAYMENT' : 'APPROVED_ACCOUNTANT')
      : 'PENDING_ACCOUNTANT'

    await store.recordExpense({
      ...form.value,
      items: items.value,
      amount: totalAmount.value,
      attachmentUrl,
      attachmentUrls,
      taxCategory: form.value.taxCategory,
      type: 'INTERNAL_REQUISITION',
      status: initialStatus,
      createdByEmail: user.value?.email || '',
      createdByName: user.value?.displayName || user.value?.email || 'Unknown',
      ...(isAccountantOrAbove && {
        accountantApprovedBy: user.value?.displayName || user.value?.email || 'Accountant',
        accountantApprovedAt: new Date().toISOString(),
      }),
      ...(isAccountantOrAbove && isAutoApproved && {
        managerApprovedBy: 'System (Auto-approved < $300)',
        managerApprovedAt: new Date().toISOString(),
      })
    })

    const approvalMsg = isAccountantOrAbove
      ? (isAutoApproved ? 'Expense auto-approved & posted to ledger (< $300).' : 'Forwarded for manager final approval.')
      : 'Pending accountant review before manager approval.'
    toast.success('Expense Request Submitted', { id: 'opex-upload', description: approvalMsg })
    router.push('/opex')
  } catch (err: any) {
    console.error('Failed to record requisition:', err)
    toast.error('Submission Failed', { id: 'opex-upload', description: err.message })
  } finally {
    isSubmitting.value = false
  }
}

</script>

<template>
  <div class="w-full space-y-8 py-8 px-6">
    <div class="flex items-center gap-4">
      <Button variant="ghost" size="icon" @click="router.back()"
        class="hover:bg-primary/10 hover:text-primary transition-colors">
        <ArrowLeft class="size-5" />
      </Button>
      <div class="flex flex-col">
        <span class="text-sm font-medium text-muted-foreground uppercase tracking-widest">Internal Requisitions &gt;
          Create</span>
        <h2 class="text-4xl font-extrabold tracking-tight">Create Internal Requisition</h2>
      </div>
    </div>

    <!-- Main Form Container -->
    <div class="space-y-6">

      <!-- General Information Section -->
      <Card class="backdrop-blur-md bg-card/40 border-muted/20 shadow-2xl overflow-hidden">
        <div class="bg-[#2a0808] px-6 py-3 border-b border-[#3d0c0c]">
          <h3 class="text-lg font-bold text-brand-secondary tracking-wide">General Information</h3>
        </div>
        <CardContent class="grid grid-cols-1 md:grid-cols-4 gap-6 p-8">
          <div class="space-y-2 md:col-span-2">
            <Label for="title" class="text-xs font-bold uppercase opacity-60">Expense Title*</Label>
            <Input id="title" v-model="form.title" placeholder="e.g. Office Supplies for March"
              class="bg-background/50 border-muted/30 h-10" />
          </div>
          <div class="space-y-2 md:col-span-2">
            <Label for="project" class="text-xs font-bold uppercase opacity-60">Project (if applicable)</Label>
            <Input id="project" v-model="form.project" placeholder="e.g. Building Renovation Phase 2"
              class="bg-background/50 border-muted/30 h-10" />
          </div>
          <div class="space-y-2 md:col-span-4">
            <Label for="desc" class="text-xs font-bold uppercase opacity-60">Description</Label>
            <Textarea id="desc" v-model="form.description" placeholder="Describe the purpose and business justification for this expense..."
              class="bg-background/50 border-muted/30 min-h-[80px]" />
          </div>
          <div class="space-y-2">
            <Label for="dept" class="text-xs font-bold uppercase opacity-60">Requesting Department*</Label>
            <Select v-model="form.department">
              <SelectTrigger id="dept" class="bg-background/50 border-muted/30 h-10">
                <SelectValue placeholder="Select Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-if="adminLoading" value="loading" disabled>
                  <div class="flex items-center gap-2">
                    <Loader2 class="size-3 animate-spin" />
                    Loading...
                  </div>
                </SelectItem>
                <SelectItem v-for="dept in departments" :key="dept.id" :value="dept.name">
                  {{ dept.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="space-y-2">
            <Label for="category" class="text-xs font-bold uppercase opacity-60">Expense Category*</Label>
            <Select v-model="form.category">
              <SelectTrigger id="category" class="bg-background/50 border-muted/30 h-10">
                <SelectValue placeholder="Select Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-if="adminLoading" value="loading" disabled>
                  <div class="flex items-center gap-2">
                    <Loader2 class="size-3 animate-spin" />
                    Loading...
                  </div>
                </SelectItem>
                <SelectItem v-for="cat in expenseCategories" :key="cat.id" :value="cat.name">
                  {{ cat.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <Label for="taxCategory" class="text-xs font-bold uppercase opacity-60">Tax Compliance (ITF12C)*</Label>
              <span class="text-[10px] text-brand-secondary font-bold uppercase tracking-tighter">ZIMRA</span>
            </div>
            <Select v-model="form.taxCategory">
              <SelectTrigger id="taxCategory" class="bg-background/50 border-brand-secondary/20 h-10 ring-1 ring-brand-secondary/10">
                <SelectValue placeholder="Tax Treatment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DEDUCTIBLE">Deductible (Standard)</SelectItem>
                <SelectItem value="NON_DEDUCTIBLE_DEPRECIATION">Non-Deductible: Depreciation</SelectItem>
                <SelectItem value="NON_DEDUCTIBLE_FINES">Non-Deductible: Fines & Penalties</SelectItem>
                <SelectItem value="NON_DEDUCTIBLE_ENTERTAINMENT">Non-Deductible: Entertainment</SelectItem>
                <SelectItem value="NON_DEDUCTIBLE_OTHER">Non-Deductible: Other</SelectItem>
              </SelectContent>
            </Select>
            <p class="text-[10px] text-muted-foreground italic">Affects annual tax reconciliation.</p>
          </div>
          <div class="space-y-2">
            <Label for="type" class="text-xs font-bold uppercase opacity-60">Request Type*</Label>
            <Select v-model="form.requestType">
              <SelectTrigger id="type" class="bg-background/50 border-muted/30 h-10">
                <SelectValue placeholder="Select an option" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="purchase">Purchase Request</SelectItem>
                <SelectItem value="service">Service/Maintenance</SelectItem>
                <SelectItem value="reimbursement">Reimbursement</SelectItem>
                <SelectItem value="advance">Cash Advance</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <!-- Details Section -->
      <Card class="backdrop-blur-md bg-card/40 border-muted/20 shadow-2xl overflow-hidden">
        <CardContent class="grid grid-cols-1 md:grid-cols-5 gap-6 p-8">
          <div class="space-y-2">
            <Label for="beneficiary" class="text-xs font-bold uppercase opacity-60">Beneficiary</Label>
            <Input id="beneficiary" v-model="form.beneficiary" placeholder="Person/Company"
              class="bg-background/50 border-muted/30 h-10" />
          </div>
          <div class="space-y-2">
            <Label for="account" class="text-xs font-bold uppercase opacity-60">EcoCash No./Bank A/C No.</Label>
            <Input id="account" v-model="form.accountNo" placeholder="Account Details"
              class="bg-background/50 border-muted/30 h-10" />
          </div>
          <div class="space-y-2">
            <Label for="dueDate" class="text-xs font-bold uppercase opacity-60">Due Date</Label>
            <Input id="dueDate" type="date" v-model="form.dueDate" class="bg-background/50 border-muted/30 h-10" />
          </div>
          <div class="space-y-2">
            <Label class="text-xs font-bold uppercase opacity-60">Currency</Label>
            <Select v-model="form.currency">
              <SelectTrigger class="bg-background/50 border-muted/30 h-10">
                <SelectValue placeholder="Select Currency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD — US Dollar</SelectItem>
                <SelectItem value="ZWL">ZWL — Zimbabwe Dollar</SelectItem>
                <SelectItem value="ZAR">ZAR — South African Rand</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="space-y-2">
            <Label class="text-xs font-bold uppercase opacity-60">Total Amount</Label>
            <div
              class="h-10 flex items-center px-4 bg-muted/20 rounded-md border border-muted/20 font-mono font-bold text-brand-secondary">
              {{ form.currency }} {{ totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }) }}
            </div>
          </div>
          <div class="space-y-2">
            <Label for="pettyCash" class="text-xs font-bold uppercase opacity-60">Payment Account* <span class="normal-case font-normal opacity-70">(account to deduct from)</span></Label>
            <Select v-model="form.pettyCashAccount">
              <SelectTrigger id="pettyCash" class="bg-background/50 border-muted/30 h-10"
                :class="isInsufficientFunds ? 'border-destructive/60' : ''">
                <SelectValue placeholder="Select account to debit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ecocash">EcoCash</SelectItem>
                <SelectItem value="bank">Bank Transfer</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="ird">IRD</SelectItem>
              </SelectContent>
            </Select>
            <!-- Live balance indicator -->
            <div v-if="form.pettyCashAccount" class="flex items-center gap-1.5 text-xs px-1">
              <template v-if="balancesLoading">
                <span class="text-muted-foreground italic">Loading balance…</span>
              </template>
              <template v-else-if="isInsufficientFunds">
                <AlertTriangle class="size-3.5 text-destructive shrink-0" />
                <span class="text-destructive font-semibold">
                  Insufficient — Available: ${{ fmt(paymentBalance ?? 0) }}
                </span>
              </template>
              <template v-else>
                <span class="text-muted-foreground">Available:</span>
                <span class="font-bold text-emerald-600">${{ fmt(paymentBalance ?? 0) }}</span>
              </template>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Items Section -->
      <Card class="backdrop-blur-md bg-card/40 border-muted/20 shadow-2xl overflow-hidden">
        <div class="bg-[#2a0808] px-6 py-3 border-b border-[#3d0c0c] flex items-center justify-between">
          <div class="space-y-0.5">
            <h3 class="text-lg font-bold text-brand-secondary tracking-wide">Internal Requisition Items</h3>
            <p class="text-xs text-brand-secondary/60 font-medium">Add items to your internal requisition</p>
          </div>
          <Button variant="outline" size="sm" @click="addItem"
            class="bg-brand-secondary/10 border-brand-secondary/20 text-brand-secondary hover:bg-brand-secondary/20 gap-2">
            <Plus class="size-4" />
            Add Line
          </Button>
        </div>
        <CardContent class="p-0">
          <Table>
            <TableHeader class="bg-muted/10 border-b border-muted/20">
              <TableRow class="hover:bg-transparent">
                <TableHead class="text-center font-bold text-brand-secondary uppercase tracking-tighter text-xs py-4">
                  Description</TableHead>
                <TableHead
                  class="w-32 text-center font-bold text-brand-secondary uppercase tracking-tighter text-xs py-4 border-l border-muted/20">
                  Quantity</TableHead>
                <TableHead
                  class="w-48 text-center font-bold text-brand-secondary uppercase tracking-tighter text-xs py-4 border-l border-muted/20">
                  Est. Cost</TableHead>
                <TableHead
                  class="w-40 text-center font-bold text-brand-secondary uppercase tracking-tighter text-xs py-4 border-l border-muted/20">
                  Total</TableHead>
                <TableHead class="w-16 text-center py-4 border-l border-muted/20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="(item, index) in items" :key="index" class="hover:bg-muted/5 border-b border-muted/10">
                <TableCell class="p-2">
                  <Input v-model="item.description" placeholder="Description of the item/service"
                    class="bg-transparent border-none focus-visible:ring-1 focus-visible:ring-brand-secondary/30 h-10" />
                </TableCell>
                <TableCell class="p-2 border-l border-muted/10">
                  <Input type="number" v-model="item.quantity"
                    class="bg-transparent border-none text-center focus-visible:ring-1 focus-visible:ring-brand-secondary/30 h-10" />
                </TableCell>
                <TableCell class="p-2 border-l border-muted/10">
                  <div class="relative">
                    <span class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    <Input type="number" v-model="item.estCost" step="0.01"
                      class="bg-transparent border-none pl-7 focus-visible:ring-1 focus-visible:ring-brand-secondary/30 h-10" />
                  </div>
                </TableCell>
                <TableCell class="p-2 border-l border-muted/10 text-center font-mono font-bold text-brand-secondary italic">
                  $ {{ (item.quantity * item.estCost).toFixed(2) }}
                </TableCell>
                <TableCell class="p-2 border-l border-muted/10 text-center">
                  <Button variant="ghost" size="icon" @click="removeItem(index)"
                    class="text-destructive hover:bg-destructive/10">
                    <Trash2 class="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <!-- Attachment Support -->
      <Card class="backdrop-blur-md bg-card/40 border-muted/20 shadow-2xl">
        <CardContent class="p-8 space-y-4">
          <Label class="text-xs font-bold uppercase opacity-60">Supporting Documents (Optional)</Label>
          <input type="file" ref="fileInput" class="hidden" accept="image/*,.pdf" multiple @change="handleFileSelect" />

          <div @click="triggerFileUpload"
            class="group border-2 border-dashed rounded-xl p-6 flex items-center justify-center gap-4 hover:bg-primary/5 hover:border-primary/30 cursor-pointer transition-all border-muted/20">
            <UploadCloud class="size-6 text-muted-foreground group-hover:text-primary" />
            <span class="text-sm font-medium">Click to upload receipts, invoices, or quotes (multiple allowed)</span>
          </div>

          <div v-if="selectedFiles.length > 0" class="space-y-2">
            <div v-for="(file, idx) in selectedFiles" :key="idx" class="flex items-center justify-between p-3 border rounded-lg bg-primary/5 border-primary/20">
              <div class="flex items-center gap-3">
                <FileIcon class="size-5 text-primary" />
                <span class="text-sm font-bold truncate max-w-[400px]">{{ file.name }}</span>
              </div>
              <Button variant="ghost" size="icon" @click="removeFile(idx)" class="h-8 w-8 text-destructive">
                <X class="size-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

    </div>

    <!-- Actions -->
    <div class="flex justify-end gap-4 pb-12">
      <Button variant="outline" @click="router.back()" class="h-12 px-8">Cancel</Button>
      <Button :disabled="isSubmitting || isInsufficientFunds" @click="handleSubmit"
        class="h-12 px-12 text-base font-bold bg-brand-secondary hover:bg-[#e67a02] text-white shadow-lg shadow-[#ff8903]/20 transition-all active:scale-95"
        :class="isInsufficientFunds ? 'opacity-50 cursor-not-allowed' : ''">
        {{ isSubmitting ? 'Submitting...' : 'Submit Requisition' }}
      </Button>
    </div>
  </div>
</template>

<style scoped>
/* Darker green colors to match the premium theme but keeping the green highlights */
</style>
