<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { db } from '@/lib/firebase'
import { collection, query, where, onSnapshot, addDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useFinanceStore } from '@/stores/financeStore'
import { useSession } from '@/composables/useSession'
import { useApprovalMonitor } from '@/composables/useApprovalMonitor'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { 
  ChevronLeft, 
  ArrowLeftRight, 
  Plus, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Loader2,
  History,
  Ban
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'

const router = useRouter()
const { user } = useSession()
const finStore = useFinanceStore()
const { counts } = useApprovalMonitor()

const { finalBalances: balances, totalBusinessBalance: totalBalance, loading, transfers, topUps } = storeToRefs(finStore)

// -- Modal State --
const showTransferModal = ref(false)
const showTopUpModal = ref(false)
const isSubmitting = ref(false)
const processing = ref<string | null>(null)

// -- Form State --
const transferForm = ref({
  fromAccount: '',
  toAccount: '',
  amount: 0,
  reference: ''
})

const topUpForm = ref({
  account: '',
  amount: 0,
  description: '',
  reference: ''
})

// -- Pending lists --
const pendingTransfers = ref<any[]>([])
const pendingTopUps = ref<any[]>([])

// -- History & Tabs State --
const activeTab = ref<'transfers' | 'topups'>('transfers')

const transfersPage = ref(1)
const transfersPerPage = ref(10)

const topUpsPage = ref(1)
const topUpsPerPage = ref(10)

// Computed lists
const paginatedTransfers = computed(() => {
  const start = (transfersPage.value - 1) * transfersPerPage.value
  const end = start + transfersPerPage.value
  return (transfers.value || []).slice(start, end)
})

const totalTransfersPages = computed(() => {
  return Math.ceil((transfers.value || []).length / transfersPerPage.value) || 1
})

const paginatedTopUps = computed(() => {
  const start = (topUpsPage.value - 1) * topUpsPerPage.value
  const end = start + topUpsPerPage.value
  return (topUps.value || []).slice(start, end)
})

const totalTopUpsPages = computed(() => {
  return Math.ceil((topUps.value || []).length / topUpsPerPage.value) || 1
})

// Watches
watch(activeTab, () => {
  transfersPage.value = 1
  topUpsPage.value = 1
})

watch(transfers, () => {
  transfersPage.value = 1
})

watch(topUps, () => {
  topUpsPage.value = 1
})

// Status styling mapping for portal design
const statusLabel = (status: string) => {
  const map: Record<string, string> = {
    PENDING_ACCOUNTANT: 'Awaiting Initial',
    PENDING_MANAGER: 'Awaiting Approval',
    PENDING: 'Awaiting Approval',
    PENDING_APPROVAL: 'Awaiting Approval',
    COMPLETED: 'Completed',
    REJECTED: 'Rejected',
    CANCELLED: 'Cancelled',
  }
  return map[status] || status
}

const statusBadgeClass = (status: string) => {
  switch (status) {
    case 'PENDING_ACCOUNTANT': return 'bg-orange-500/10 text-orange-600 border-orange-500/20'
    case 'PENDING_MANAGER':
    case 'PENDING':
    case 'PENDING_APPROVAL': return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'
    case 'COMPLETED': return 'bg-green-500/10 text-green-600 border-green-500/20'
    case 'REJECTED': return 'bg-red-500/10 text-red-600 border-red-500/20'
    case 'CANCELLED': return 'bg-gray-500/10 text-gray-600 border-gray-500/20'
    default: return 'bg-muted text-muted-foreground border-transparent'
  }
}

let unsubPendingTr: any = null
let unsubPendingTp: any = null

onMounted(() => {
  finStore.fetchExpenses()
  finStore.fetchTransfers()
  finStore.fetchJobPayments()
  finStore.fetchTopUps()
  finStore.fetchSalariesTransactions()
  finStore.fetchHistoricalInventoryConsumption()

  unsubPendingTr = onSnapshot(
    query(collection(db, 'fundTransfers'), where('status', 'in', ['PENDING_MANAGER', 'PENDING_APPROVAL', 'PENDING'])),
    (snap) => {
      pendingTransfers.value = snap.docs.map(d => ({ id: d.id, _type: 'TRANSFER', ...d.data() }))
    }
  )

  unsubPendingTp = onSnapshot(
    query(collection(db, 'ledgerTopUps'), where('status', 'in', ['PENDING_MANAGER', 'PENDING_APPROVAL', 'PENDING'])),
    (snap) => {
      pendingTopUps.value = snap.docs.map(d => ({ id: d.id, _type: 'TOP_UP', ...d.data() }))
    }
  )
})

onUnmounted(() => {
  unsubPendingTr?.()
  unsubPendingTp?.()
})

// -- Calculations & Helpers --
const fmt = (n: number) =>
  (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtDate = (ts: any) => {
  if (!ts) return '—'
  const date = ts.toDate ? ts.toDate() : new Date(ts)
  return date.toLocaleDateString()
}

const fromBalance = computed(() => {
  if (!transferForm.value.fromAccount) return null
  return balances.value[transferForm.value.fromAccount.toUpperCase()] ?? 0
})

const isInsufficientFunds = computed(() =>
  fromBalance.value !== null &&
  transferForm.value.amount > 0 &&
  transferForm.value.amount > fromBalance.value
)

// -- Operations --
const initiateTransfer = async () => {
  if (!transferForm.value.fromAccount || !transferForm.value.toAccount) {
    toast.error('Select both accounts')
    return
  }
  if (transferForm.value.fromAccount === transferForm.value.toAccount) {
    toast.error('Accounts must be different')
    return
  }
  if (transferForm.value.amount <= 0) {
    toast.error('Amount must be positive')
    return
  }
  if (isInsufficientFunds.value) {
    toast.error('Insufficient funds')
    return
  }

  isSubmitting.value = true
  try {
    await addDoc(collection(db, 'fundTransfers'), {
      fromAccount: transferForm.value.fromAccount.toLowerCase(),
      toAccount: transferForm.value.toAccount.toLowerCase(),
      amount: Number(transferForm.value.amount),
      reference: transferForm.value.reference,
      status: 'PENDING_ACCOUNTANT',
      initiatedBy: user.value?.displayName || 'Manager',
      initiatedByEmail: user.value?.email || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
    toast.success('Transfer Initiated', { description: 'Submitted for accountant review.' })
    showTransferModal.value = false
    transferForm.value = { fromAccount: '', toAccount: '', amount: 0, reference: '' }
  } catch (err: any) {
    console.error(err)
    toast.error('Failed to submit transfer')
  } finally {
    isSubmitting.value = false
  }
}

const initiateTopUp = async () => {
  if (!topUpForm.value.account) {
    toast.error('Select destination account')
    return
  }
  if (topUpForm.value.amount <= 0) {
    toast.error('Amount must be positive')
    return
  }

  isSubmitting.value = true
  try {
    await addDoc(collection(db, 'ledgerTopUps'), {
      account: topUpForm.value.account.toLowerCase(),
      amount: Number(topUpForm.value.amount),
      description: topUpForm.value.description,
      reference: topUpForm.value.reference,
      status: 'PENDING_ACCOUNTANT',
      requestedBy: user.value?.displayName || 'Manager',
      requestedByEmail: user.value?.email || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
    toast.success('Top-Up Requested', { description: 'Awaiting accountant initial.' })
    showTopUpModal.value = false
    topUpForm.value = { account: '', amount: 0, description: '', reference: '' }
  } catch (err: any) {
    console.error(err)
    toast.error('Failed to request top-up')
  } finally {
    isSubmitting.value = false
  }
}

const approveItem = async (item: any) => {
  processing.value = item.id
  try {
    if (item._type === 'TRANSFER') {
      await updateDoc(doc(db, 'fundTransfers', item.id), {
        status: 'COMPLETED',
        approvedAt: serverTimestamp(),
        approvedBy: user.value?.displayName || 'Manager',
        updatedAt: serverTimestamp()
      })
    } else {
      await updateDoc(doc(db, 'ledgerTopUps', item.id), {
        status: 'COMPLETED',
        managerApprovedBy: user.value?.displayName || 'Manager',
        managerApprovedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
    }
    toast.success('Approved Successfully')
  } catch (err) {
    console.error(err)
    toast.error('Approval failed')
  } finally {
    processing.value = null
  }
}

const rejectItem = async (item: any) => {
  const reason = prompt('Enter rejection reason:')
  if (!reason) return

  processing.value = item.id
  try {
    const col = item._type === 'TRANSFER' ? 'fundTransfers' : 'ledgerTopUps'
    await updateDoc(doc(db, col, item.id), {
      status: 'REJECTED',
      rejectionReason: reason,
      rejectedBy: user.value?.displayName || 'Manager',
      rejectedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
    toast.success('Rejected Successfully')
  } catch (err) {
    console.error(err)
    toast.error('Rejection failed')
  } finally {
    processing.value = null
  }
}

const cancelItem = async (item: any) => {
  if (item._type !== 'TRANSFER') return

  const confirmCancel = confirm('Are you sure you want to cancel this transfer?')
  if (!confirmCancel) return

  processing.value = item.id
  try {
    await updateDoc(doc(db, 'fundTransfers', item.id), {
      status: 'CANCELLED',
      cancelledBy: user.value?.displayName || 'Staff',
      cancelledByEmail: user.value?.email || '',
      cancelledAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
    toast.success('Transfer Cancelled Successfully')
  } catch (err) {
    console.error(err)
    toast.error('Cancellation failed')
  } finally {
    processing.value = null
  }
}

const accountColors: Record<string, string> = {
  BANK: 'text-blue-500',
  ECOCASH: 'text-green-500',
  CASH: 'text-yellow-500',
  SALARIES: 'text-emerald-500',
  IRD: 'text-purple-500'
}

const accountBg: Record<string, string> = {
  BANK: 'bg-blue-500/10 border-blue-500/20',
  ECOCASH: 'bg-green-500/10 border-green-500/20',
  CASH: 'bg-yellow-500/10 border-yellow-500/20',
  SALARIES: 'bg-emerald-500/10 border-emerald-500/20',
  IRD: 'bg-purple-500/10 border-purple-500/20'
}

const accountIcon: Record<string, string> = {
  BANK: '🏦', ECOCASH: '📱', CASH: '💵', SALARIES: '💼', IRD: '🏛️'
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
        <h1 class="text-xl font-black tracking-tight">Finance Portal</h1>
        <p class="text-xs text-muted-foreground">Manage cash flow & fund transfers</p>
      </div>
      <Badge v-if="counts.transfers + counts.topUps > 0" class="bg-orange-500 text-white animate-pulse text-[10px] font-black h-5 px-2">
        {{ counts.transfers + counts.topUps }} AWAITING ACTION
      </Badge>
    </header>

    <div v-if="loading" class="flex-1 flex flex-col items-center justify-center py-20 gap-4">
      <Loader2 class="size-8 animate-spin text-primary" />
      <p class="text-sm text-muted-foreground">Synchronizing balances…</p>
    </div>

    <main v-else class="p-4 space-y-6">
      <!-- Business Total Card -->
      <div class="rounded-3xl bg-gradient-to-br from-[#79c21b] to-[#ff8903] text-white p-6 shadow-xl relative overflow-hidden group">
        <div class="absolute -right-6 -top-6 size-32 bg-white/10 rounded-full blur-2xl group-hover:scale-110 transition-all duration-700" />
        <div class="absolute -left-10 -bottom-10 size-40 bg-white/5 rounded-full blur-3xl" />
        
        <p class="text-[10px] font-black uppercase tracking-widest text-white/80">Liquidity Summary</p>
        <p class="text-4xl font-black mt-2 tracking-tight">
          {{ fmt(totalBalance) }}
        </p>
        <p class="text-xs text-white/70 mt-1">Total business cash balances across accounts</p>

        <!-- Quick actions -->
        <div class="grid grid-cols-2 gap-3 mt-6">
          <Button 
            class="bg-white/20 hover:bg-white/30 text-white border border-white/10 rounded-xl h-10 font-bold text-xs gap-1.5"
            @click="showTransferModal = true"
          >
            <ArrowLeftRight class="size-4" /> Transfer Funds
          </Button>
          <Button 
            class="bg-white/20 hover:bg-white/30 text-white border border-white/10 rounded-xl h-10 font-bold text-xs gap-1.5"
            @click="showTopUpModal = true"
          >
            <Plus class="size-4" /> Request Top-Up
          </Button>
        </div>
      </div>

      <!-- Live Account Balances -->
      <section class="space-y-3">
        <h2 class="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1">Ledger Balances</h2>
        <div class="grid grid-cols-2 gap-3">
          <div
            v-for="key in (['BANK', 'ECOCASH', 'CASH', 'SALARIES', 'IRD'] as const)"
            :key="key"
            :class="['rounded-2xl border p-4 space-y-2', accountBg[key]]"
          >
            <div class="flex items-center justify-between">
              <span class="text-lg">{{ accountIcon[key] }}</span>
              <span class="text-[9px] font-black tracking-widest text-muted-foreground">{{ key }}</span>
            </div>
            <p :class="['text-xl font-black tracking-tight', accountColors[key], (balances[key] || 0) < 0 ? 'text-destructive' : '']">
              {{ fmt(balances[key] || 0) }}
            </p>
          </div>
        </div>
      </section>

      <!-- Awaiting Authorizations -->
      <section v-if="pendingTransfers.length > 0 || pendingTopUps.length > 0" class="space-y-3">
        <h2 class="text-xs font-bold text-orange-500 uppercase tracking-widest px-1 flex items-center gap-1.5">
          <AlertTriangle class="size-4" /> Action Required ({{ pendingTransfers.length + pendingTopUps.length }})
        </h2>
        <div class="space-y-3">
          <Card 
            v-for="item in [...pendingTransfers, ...pendingTopUps]" 
            :key="item.id" 
            class="border-orange-500/20 bg-orange-500/5 overflow-hidden"
          >
            <CardContent class="p-4 space-y-3">
              <div class="flex justify-between items-start">
                <div>
                  <Badge variant="outline" class="text-[9px] bg-orange-500/10 text-orange-600 border-transparent uppercase font-black px-1.5">
                    {{ item._type === 'TRANSFER' ? 'Fund Transfer' : 'Top-Up' }}
                  </Badge>
                  <h3 class="font-bold text-sm mt-1">
                    {{ item._type === 'TRANSFER' ? `${item.fromAccount} → ${item.toAccount}` : (item.description || 'Ledger Top-Up') }}
                  </h3>
                  <p class="text-[10px] text-muted-foreground mt-0.5">
                    Requested: {{ fmtDate(item.createdAt) }} · By: {{ item.requestedBy || item.initiatedBy || 'Staff' }}
                  </p>
                </div>
                <span class="font-black text-sm text-orange-600">
                  {{ fmt(item.amount) }}
                </span>
              </div>

              <div class="flex gap-2 pt-1">
                <Button 
                  size="sm"
                  class="flex-1 bg-green-600 hover:bg-green-700 h-9 font-bold text-xs" 
                  :disabled="processing === item.id"
                  @click="approveItem(item)"
                >
                  <CheckCircle2 class="mr-1.5 size-3.5" /> Approve
                </Button>
                <Button 
                  size="sm"
                  variant="outline"
                  class="flex-1 text-red-600 border-red-200 hover:bg-red-50 h-9 font-bold text-xs" 
                  :disabled="processing === item.id"
                  @click="rejectItem(item)"
                >
                  <XCircle class="mr-1.5 size-3.5" /> Reject
                </Button>
                <Button 
                  v-if="item._type === 'TRANSFER'"
                  size="sm"
                  variant="outline"
                  class="flex-1 text-gray-600 border-gray-200 hover:bg-gray-50 h-9 font-bold text-xs" 
                  :disabled="processing === item.id"
                  @click="cancelItem(item)"
                >
                  <Ban class="mr-1.5 size-3.5" /> Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <!-- History Log Section -->
      <section class="space-y-4 pt-4 border-t border-border/30">
        <div class="flex items-center justify-between px-1">
          <div class="flex items-center gap-2">
            <History class="size-4 text-primary" />
            <h2 class="text-xs font-bold text-muted-foreground uppercase tracking-widest">History Log</h2>
          </div>
          
          <!-- Tab Buttons -->
          <div class="flex bg-muted/60 p-0.5 rounded-lg border border-border/40">
            <button 
              type="button"
              class="px-3 py-1 text-[10px] font-bold rounded-md transition-all"
              :class="activeTab === 'transfers' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
              @click="activeTab = 'transfers'"
            >
              Transfers
            </button>
            <button 
              type="button"
              class="px-3 py-1 text-[10px] font-bold rounded-md transition-all"
              :class="activeTab === 'topups' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
              @click="activeTab = 'topups'"
            >
              Top-Ups
            </button>
          </div>
        </div>

        <!-- Tab 1: Transfers History -->
        <div v-if="activeTab === 'transfers'" class="space-y-3">
          <div v-if="paginatedTransfers.length === 0" class="text-center py-10 text-muted-foreground text-sm">
            No completed or historical transfers found.
          </div>
          
          <Card 
            v-for="tr in paginatedTransfers" 
            :key="tr.id" 
            class="border-none shadow-sm relative overflow-hidden"
          >
            <!-- side accent based on status -->
            <div 
              class="absolute left-0 top-0 bottom-0 w-1" 
              :class="{
                'bg-orange-500': tr.status === 'PENDING_ACCOUNTANT',
                'bg-yellow-500': ['PENDING_MANAGER', 'PENDING', 'PENDING_APPROVAL'].includes(tr.status),
                'bg-green-500': tr.status === 'COMPLETED',
                'bg-red-500': tr.status === 'REJECTED'
              }" 
            />
            
            <CardContent class="p-4 space-y-3">
              <div class="flex justify-between items-start">
                <div class="space-y-1 min-w-0">
                  <div class="flex items-center gap-1.5">
                    <Badge variant="outline" class="text-[9px] uppercase font-bold px-1.5" :class="statusBadgeClass(tr.status)">
                      {{ statusLabel(tr.status) }}
                    </Badge>
                    <span v-if="tr.reference" class="text-[9px] font-mono text-muted-foreground bg-muted px-1 rounded">{{ tr.reference }}</span>
                  </div>
                  <h3 class="font-bold text-sm truncate mt-1">
                    {{ tr.fromAccount?.toUpperCase() }} &rarr; {{ tr.toAccount?.toUpperCase() }}
                  </h3>
                  <p class="text-[10px] text-muted-foreground">
                    {{ tr.date }} · By: {{ tr.initiatedBy || 'Staff' }}
                  </p>
                  <p v-if="tr.rejectionReason" class="text-[10px] text-red-500 mt-1 italic">
                    Reason: {{ tr.rejectionReason }}
                  </p>
                </div>
                <span class="font-black text-sm text-foreground ml-2">
                  {{ fmt(tr.amount) }}
                </span>
              </div>
            </CardContent>
          </Card>

          <!-- Transfers Pagination Footer -->
          <div v-if="transfers.length > 0" class="flex items-center justify-between px-2 py-4 border-t border-border/30 flex-wrap gap-4 mt-4">
            <div class="text-xs text-muted-foreground flex items-center gap-1">
              Showing
              <span class="font-bold text-foreground">{{ transfers.length === 0 ? 0 : (transfersPage - 1) * transfersPerPage + 1 }}</span>
              to
              <span class="font-bold text-foreground">{{ Math.min(transfersPage * transfersPerPage, transfers.length) }}</span>
              of
              <span class="font-bold text-foreground">{{ transfers.length }}</span>
              entries
            </div>
            
            <div class="flex items-center gap-6 flex-wrap">
              <div class="flex items-center gap-2">
                <span class="text-xs text-muted-foreground whitespace-nowrap">Show:</span>
                <select 
                  v-model="transfersPerPage" 
                  class="bg-background border border-muted-foreground/30 rounded text-xs px-2 py-1.5 focus:ring-1 focus:ring-primary focus:outline-none cursor-pointer text-foreground"
                  @change="transfersPage = 1"
                >
                  <option :value="10">10 per view</option>
                  <option :value="20">20 per view</option>
                  <option :value="50">50 per view</option>
                </select>
              </div>
              
              <div class="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  class="h-8 w-8 text-foreground"
                  :disabled="transfersPage === 1"
                  @click="transfersPage = 1"
                  title="First Page"
                >
                  &laquo;
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  class="h-8 w-8 text-foreground"
                  :disabled="transfersPage === 1"
                  @click="transfersPage--"
                  title="Previous Page"
                >
                  &lsaquo;
                </Button>
                
                <span class="text-xs text-muted-foreground px-2 whitespace-nowrap">
                  Page <span class="font-bold text-foreground">{{ transfersPage }}</span> of <span class="font-bold text-foreground">{{ totalTransfersPages }}</span>
                </span>
                
                <Button
                  variant="outline"
                  size="icon"
                  class="h-8 w-8 text-foreground"
                  :disabled="transfersPage === totalTransfersPages"
                  @click="transfersPage++"
                  title="Next Page"
                >
                  &rsaquo;
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  class="h-8 w-8 text-foreground"
                  :disabled="transfersPage === totalTransfersPages"
                  @click="transfersPage = totalTransfersPages"
                  title="Last Page"
                >
                  &raquo;
                </Button>
              </div>
            </div>
          </div>
        </div>

        <!-- Tab 2: Top-Ups History -->
        <div v-if="activeTab === 'topups'" class="space-y-3">
          <div v-if="paginatedTopUps.length === 0" class="text-center py-10 text-muted-foreground text-sm">
            No completed or historical top-ups found.
          </div>
          
          <Card 
            v-for="tu in paginatedTopUps" 
            :key="tu.id" 
            class="border-none shadow-sm relative overflow-hidden"
          >
            <!-- side accent based on status -->
            <div 
              class="absolute left-0 top-0 bottom-0 w-1" 
              :class="{
                'bg-orange-500': tu.status === 'PENDING_ACCOUNTANT',
                'bg-yellow-500': ['PENDING_MANAGER', 'PENDING', 'PENDING_APPROVAL'].includes(tu.status),
                'bg-green-500': tu.status === 'COMPLETED',
                'bg-red-500': tu.status === 'REJECTED'
              }" 
            />
            
            <CardContent class="p-4 space-y-3">
              <div class="flex justify-between items-start">
                <div class="space-y-1 min-w-0">
                  <div class="flex items-center gap-1.5">
                    <Badge variant="outline" class="text-[9px] uppercase font-bold px-1.5" :class="statusBadgeClass(tu.status)">
                      {{ statusLabel(tu.status) }}
                    </Badge>
                    <span v-if="tu.reference" class="text-[9px] font-mono text-muted-foreground bg-muted px-1 rounded">{{ tu.reference }}</span>
                  </div>
                  <h3 class="font-bold text-sm truncate mt-1">
                    {{ tu.account?.toUpperCase() }} &middot; {{ tu.description }}
                  </h3>
                  <p class="text-[10px] text-muted-foreground">
                    {{ fmtDate(tu.createdAt) }} &middot; By: {{ tu.requestedBy || 'Staff' }}
                  </p>
                  <p v-if="tu.rejectionReason" class="text-[10px] text-red-500 mt-1 italic">
                    Reason: {{ tu.rejectionReason }}
                  </p>
                </div>
                <span class="font-black text-sm text-green-500 ml-2">
                  {{ fmt(tu.amount) }}
                </span>
              </div>
            </CardContent>
          </Card>

          <!-- Top-Ups Pagination Footer -->
          <div v-if="topUps.length > 0" class="flex items-center justify-between px-2 py-4 border-t border-border/30 flex-wrap gap-4 mt-4">
            <div class="text-xs text-muted-foreground flex items-center gap-1">
              Showing
              <span class="font-bold text-foreground">{{ topUps.length === 0 ? 0 : (topUpsPage - 1) * topUpsPerPage + 1 }}</span>
              to
              <span class="font-bold text-foreground">{{ Math.min(topUpsPage * topUpsPerPage, topUps.length) }}</span>
              of
              <span class="font-bold text-foreground">{{ topUps.length }}</span>
              entries
            </div>
            
            <div class="flex items-center gap-6 flex-wrap">
              <div class="flex items-center gap-2">
                <span class="text-xs text-muted-foreground whitespace-nowrap">Show:</span>
                <select 
                  v-model="topUpsPerPage" 
                  class="bg-background border border-muted-foreground/30 rounded text-xs px-2 py-1.5 focus:ring-1 focus:ring-primary focus:outline-none cursor-pointer text-foreground"
                  @change="topUpsPage = 1"
                >
                  <option :value="10">10 per view</option>
                  <option :value="20">20 per view</option>
                  <option :value="50">50 per view</option>
                </select>
              </div>
              
              <div class="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  class="h-8 w-8 text-foreground"
                  :disabled="topUpsPage === 1"
                  @click="topUpsPage = 1"
                  title="First Page"
                >
                  &laquo;
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  class="h-8 w-8 text-foreground"
                  :disabled="topUpsPage === 1"
                  @click="topUpsPage--"
                  title="Previous Page"
                >
                  &lsaquo;
                </Button>
                
                <span class="text-xs text-muted-foreground px-2 whitespace-nowrap">
                  Page <span class="font-bold text-foreground">{{ topUpsPage }}</span> of <span class="font-bold text-foreground">{{ totalTopUpsPages }}</span>
                </span>
                
                <Button
                  variant="outline"
                  size="icon"
                  class="h-8 w-8 text-foreground"
                  :disabled="topUpsPage === totalTopUpsPages"
                  @click="topUpsPage++"
                  title="Next Page"
                >
                  &rsaquo;
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  class="h-8 w-8 text-foreground"
                  :disabled="topUpsPage === totalTopUpsPages"
                  @click="topUpsPage = totalTopUpsPages"
                  title="Last Page"
                >
                  &raquo;
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>

    <!-- 1. Initiate Transfer Modal -->
    <div v-if="showTransferModal" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <Card class="w-full max-w-sm bg-card border shadow-2xl rounded-3xl overflow-hidden animate-in zoom-in-95 duration-200">
        <CardHeader class="pb-4">
          <CardTitle class="text-lg font-black tracking-tight">Initiate Fund Transfer</CardTitle>
          <CardDescription class="text-xs">Submit a transfer request between accounts.</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="space-y-1.5">
            <Label class="text-xs font-black uppercase text-muted-foreground">From Account</Label>
            <select v-model="transferForm.fromAccount" class="w-full h-10 px-3 rounded-xl border bg-background text-sm">
              <option value="" disabled>Select source account</option>
              <option value="cash">Cash</option>
              <option value="bank">Bank</option>
              <option value="ecocash">EcoCash</option>
              <option value="ird">IRD</option>
            </select>
            <p v-if="transferForm.fromAccount && fromBalance !== null" class="text-[10px] text-muted-foreground font-bold px-1">
              Available balance: <span :class="isInsufficientFunds ? 'text-destructive' : 'text-green-500'">{{ fmt(fromBalance) }}</span>
            </p>
          </div>

          <div class="space-y-1.5">
            <Label class="text-xs font-black uppercase text-muted-foreground">To Account</Label>
            <select v-model="transferForm.toAccount" class="w-full h-10 px-3 rounded-xl border bg-background text-sm">
              <option value="" disabled>Select destination account</option>
              <option value="cash">Cash</option>
              <option value="bank">Bank</option>
              <option value="ecocash">EcoCash</option>
              <option value="ird">IRD</option>
              <option value="salaries">Salaries</option>
            </select>
          </div>

          <div class="space-y-1.5">
            <Label class="text-xs font-black uppercase text-muted-foreground">Transfer Amount ($)</Label>
            <Input type="number" v-model.number="transferForm.amount" min="0.01" step="0.01" class="h-10 text-sm font-bold" />
          </div>

          <div class="space-y-1.5">
            <Label class="text-xs font-black uppercase text-muted-foreground">Reference / Batch ID</Label>
            <Input v-model="transferForm.reference" placeholder="e.g. EBK-9901" class="h-10 text-sm" />
          </div>

          <div class="flex gap-3 pt-2">
            <Button variant="outline" class="flex-1 rounded-xl h-10 font-bold" @click="showTransferModal = false">Cancel</Button>
            <Button 
              class="flex-1 rounded-xl h-10 font-bold"
              :disabled="isSubmitting || isInsufficientFunds"
              @click="initiateTransfer"
            >
              <Loader2 v-if="isSubmitting" class="size-4 animate-spin mr-1" />
              {{ isSubmitting ? 'Posting...' : 'Submit' }}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- 2. Request Top-Up Modal -->
    <div v-if="showTopUpModal" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <Card class="w-full max-w-sm bg-card border shadow-2xl rounded-3xl overflow-hidden animate-in zoom-in-95 duration-200">
        <CardHeader class="pb-4">
          <CardTitle class="text-lg font-black tracking-tight">Request Account Top-Up</CardTitle>
          <CardDescription class="text-xs">Request floating capital or external float injection.</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="space-y-1.5">
            <Label class="text-xs font-black uppercase text-muted-foreground">Target Account</Label>
            <select v-model="topUpForm.account" class="w-full h-10 px-3 rounded-xl border bg-background text-sm">
              <option value="" disabled>Select target account</option>
              <option value="cash">Cash</option>
              <option value="bank">Bank</option>
              <option value="ecocash">EcoCash</option>
              <option value="ird">IRD</option>
            </select>
          </div>

          <div class="space-y-1.5">
            <Label class="text-xs font-black uppercase text-muted-foreground">Top-Up Amount ($)</Label>
            <Input type="number" v-model.number="topUpForm.amount" min="0.01" step="0.01" class="h-10 text-sm font-bold text-green-500" />
          </div>

          <div class="space-y-1.5">
            <Label class="text-xs font-black uppercase text-muted-foreground">Description / Source</Label>
            <Input v-model="topUpForm.description" placeholder="e.g. Weekly Cash Float" class="h-10 text-sm" />
          </div>

          <div class="space-y-1.5">
            <Label class="text-xs font-black uppercase text-muted-foreground">Receipt / Reference</Label>
            <Input v-model="topUpForm.reference" placeholder="e.g. DEP-998" class="h-10 text-sm" />
          </div>

          <div class="flex gap-3 pt-2">
            <Button variant="outline" class="flex-1 rounded-xl h-10 font-bold" @click="showTopUpModal = false">Cancel</Button>
            <Button 
              class="flex-1 rounded-xl h-10 font-bold bg-[#ff8903] hover:bg-[#ff8903]/90 text-white"
              :disabled="isSubmitting"
              @click="initiateTopUp"
            >
              <Loader2 v-if="isSubmitting" class="size-4 animate-spin mr-1" />
              {{ isSubmitting ? 'Submitting...' : 'Submit' }}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
