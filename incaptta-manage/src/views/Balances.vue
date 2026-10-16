<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { db } from '@/lib/firebase'
import { doc, updateDoc, serverTimestamp, collection, query, where, onSnapshot } from 'firebase/firestore'
import { useRouter } from 'vue-router'
import {
  RefreshCcw,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronLeft,
  Ban
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { useSession } from '@/composables/useSession'
import { useApprovalMonitor } from '@/composables/useApprovalMonitor'
import { useFinanceStore } from '@/stores/financeStore'
import { storeToRefs } from 'pinia'
import { toast } from 'vue-sonner'

const router = useRouter()
const { user } = useSession()
const { counts } = useApprovalMonitor()
const finStore = useFinanceStore()

const { ledger, finalBalances: balances, totalBusinessBalance: totalBalance, loading } = storeToRefs(finStore)

// ── Pending items (Keep local listener or add to store? Let's add to store later if needed, for now keep simple) ──
const pendingTransfers = ref<any[]>([])
const pendingTopUps = ref<any[]>([])
const processing = ref<string | null>(null)

let unsubPendingTr: any = null
let unsubPendingTp: any = null

onMounted(() => {
  finStore.fetchExpenses()
  finStore.fetchTransfers()
  finStore.fetchJobPayments()
  finStore.fetchTopUps()
  finStore.fetchSalariesTransactions()
  finStore.fetchHistoricalInventoryConsumption()

  // Keep local listeners for pending items as they have specific status filters
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

// ── Actions ──────────────────────────────────────────
const approveFinance = async (item: any) => {
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
        managerApprovedAt: serverTimestamp()
      })
    }
    toast.success('Transaction Approved')
  } catch (err) {
    console.error(err)
    toast.error('Failed to approve transaction')
  } finally {
    processing.value = null
  }
}

const rejectFinance = async (item: any) => {
  const reason = prompt('Reason for rejection:')
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
    toast.success('Transaction Rejected')
  } catch (err) {
    console.error(err)
    toast.error('Failed to reject transaction')
  } finally {
    processing.value = null
  }
}

const cancelFinance = async (item: any) => {
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

// ── Helpers ───────────────────────────────────────────
const fmt = (n: number) =>
  (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtDate = (ts: any) => {
  if (!ts) return '—'
  const date = ts.toDate ? ts.toDate() : new Date(ts)
  return date.toLocaleDateString()
}

// ── Pagination State ──
const currentPage = ref(1)
const pageSize = ref(20)

const paginatedTransactions = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return ledger.value.slice(start, end)
})

const totalPages = computed(() => {
  return Math.ceil(ledger.value.length / pageSize.value) || 1
})

watch(ledger, () => {
  currentPage.value = 1
})

const accountColors: Record<string, string> = {
  BANK:    'text-blue-400',
  ECOCASH: 'text-green-400',
  CASH:    'text-yellow-400',
  SALARIES: 'text-emerald-400',
  IRD:     'text-purple-400'
}
const accountBg: Record<string, string> = {
  BANK:    'bg-blue-500/10 border-blue-500/20',
  ECOCASH: 'bg-green-500/10 border-green-500/20',
  CASH:    'bg-yellow-500/10 border-yellow-500/20',
  SALARIES: 'bg-emerald-500/10 border-emerald-500/20',
  IRD:     'bg-purple-500/10 border-purple-500/20'
}
const accountIcon: Record<string, string> = {
  BANK: '🏦', ECOCASH: '📱', CASH: '💵', SALARIES: '💼', IRD: '🏛️'
}
</script>

<template>
  <div class="flex flex-col pb-20 bg-background min-h-screen">
    <!-- Header -->
    <header class="sticky top-0 z-10 bg-card border-b px-4 py-4 flex items-center gap-4">
      <Button variant="ghost" size="icon" @click="router.push('/')">
        <ChevronLeft class="size-6" />
      </Button>
      <div class="flex-1">
        <h1 class="text-xl font-bold">Running Balances</h1>
        <p class="text-xs text-muted-foreground">Live account balances</p>
      </div>
      <Badge v-if="counts.transfers + counts.topUps > 0" class="bg-primary text-white animate-pulse text-[10px] font-black h-5 px-2">
        {{ counts.transfers + counts.topUps }} AWAITING ACTION
      </Badge>
    </header>

    <!-- Loading -->
    <div v-if="loading" class="flex-1 flex flex-col items-center justify-center py-20 gap-4">
      <RefreshCcw class="size-8 animate-spin text-muted-foreground" />
      <p class="text-sm text-muted-foreground">Loading balances…</p>
    </div>

    <main v-else class="p-4 space-y-6">

      <!-- Pending Financial Approvals -->
      <section v-if="pendingTransfers.length > 0 || pendingTopUps.length > 0" class="space-y-3">
        <div class="flex items-center gap-2 px-1">
          <AlertCircle class="size-4 text-orange-500" />
          <span class="text-xs font-bold uppercase tracking-widest text-muted-foreground">Pending Authorizations</span>
        </div>

        <div v-for="item in [...pendingTransfers, ...pendingTopUps]" :key="item.id" class="rounded-xl border bg-orange-500/5 border-orange-500/10 p-4 space-y-3 shadow-sm">
          <div class="flex justify-between items-start">
            <div class="space-y-1 flex-1 min-w-0">
              <Badge variant="secondary" class="text-[9px] h-4 uppercase font-bold bg-orange-500/10 text-orange-600">
                {{ item._type === 'TRANSFER' ? 'Fund Transfer' : 'Top-Up' }}
              </Badge>
              <p class="font-bold text-sm truncate">
                {{ item._type === 'TRANSFER' ? `${item.fromAccount} → ${item.toAccount}` : (item.description || 'Ledger Top-Up') }}
              </p>
              <p class="text-[10px] text-muted-foreground">
                Requested by {{ item.submittedBy || item.requestedBy || 'Staff' }} · {{ fmtDate(item.createdAt?.toDate?.()?.getTime()) }}
              </p>
            </div>
            <p class="font-black text-base text-orange-500 shrink-0 ml-2">
              {{ fmt(item.amount) }}
            </p>
          </div>

          <div class="flex gap-2">
            <Button 
              size="sm" 
              class="flex-1 bg-green-600 hover:bg-green-700 h-9 font-bold text-xs" 
              :disabled="processing === item.id"
              @click="approveFinance(item)"
            >
              <CheckCircle2 class="mr-1.5 size-3.5" /> Approve
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              class="flex-1 text-red-600 border-red-200 hover:bg-red-50 h-9 font-bold text-xs" 
              :disabled="processing === item.id"
              @click="rejectFinance(item)"
            >
              <XCircle class="mr-1.5 size-3.5" /> Reject
            </Button>
            <Button 
              v-if="item._type === 'TRANSFER'"
              size="sm" 
              variant="outline" 
              class="flex-1 text-gray-600 border-gray-200 hover:bg-gray-50 h-9 font-bold text-xs" 
              :disabled="processing === item.id"
              @click="cancelFinance(item)"
            >
              <Ban class="mr-1.5 size-3.5" /> Cancel
            </Button>
          </div>
        </div>
      </section>

      <!-- Total Summary -->
      <div class="rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border border-primary/20 p-5 text-center">
        <p class="text-xs text-muted-foreground uppercase tracking-widest mb-1">Total Business Balance</p>
        <p :class="['text-4xl font-black', totalBalance >= 0 ? 'text-foreground' : 'text-destructive']">
          {{ fmt(totalBalance) }}
        </p>
      </div>

      <!-- Account Tiles -->
      <div class="grid grid-cols-2 gap-3">
        <div
          v-for="(key) in (['BANK', 'ECOCASH', 'CASH', 'SALARIES', 'IRD'] as const)"
          :key="key"
          :class="['rounded-xl border p-4 space-y-2', accountBg[key]]"
        >
          <div class="flex items-center justify-between">
            <span class="text-lg">{{ accountIcon[key] }}</span>
            <span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{{ key }}</span>
          </div>
          <p :class="['text-2xl font-black', accountColors[key], (balances[key] || 0) < 0 ? 'text-destructive' : '']">
            {{ fmt(balances[key] || 0) }}
          </p>
        </div>
      </div>

      <!-- Inventory Consumption (Absolute Value) -->
      <div class="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4 space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-lg">📦</span>
          <span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-purple-400">Inventory Consumption</span>
        </div>
        <p class="text-3xl font-black text-purple-400">
          {{ fmt(Math.abs(balances['INVENTORY'] || 0)) }}
        </p>
        <p class="text-[10px] font-medium text-muted-foreground italic">Cumulative value of stock consumed</p>
      </div>

      <!-- Recent Transactions -->
      <div>
        <h2 class="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-3">Recent Transactions</h2>
        <div class="space-y-2">
          <div
            v-for="tx in paginatedTransactions"
            :key="tx.id"
            class="flex items-center gap-3 rounded-xl bg-card border p-3"
          >
            <!-- Icon -->
            <div :class="[
              'size-9 rounded-full flex items-center justify-center shrink-0 text-sm',
              tx.type === 'INCOME' || tx.type === 'TOPUP' ? 'bg-green-500/15 text-green-400' :
              tx.type === 'EXPENSE' || tx.type === 'SALARY_PAYMENT' ? 'bg-red-500/15 text-red-400' :
              'bg-blue-500/15 text-blue-400'
            ]">
              <ArrowDownLeft v-if="tx.type === 'INCOME' || tx.type === 'TOPUP'" class="size-4" />
              <ArrowUpRight v-else-if="tx.type === 'EXPENSE' || tx.type === 'SALARY_PAYMENT'" class="size-4" />
              <ArrowLeftRight v-else class="size-4" />
            </div>

            <!-- Details -->
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium truncate">{{ tx.description || 'Transaction' }}</p>
              <p class="text-xs text-muted-foreground">
                {{ tx.account }} · {{ fmtDate(tx.createdAt) }}
              </p>
            </div>

            <!-- Amount -->
            <p :class="['text-sm font-bold shrink-0', tx.amount >= 0 ? 'text-green-400' : 'text-red-400']">
              {{ fmt(tx.amount) }}
            </p>
          </div>

          <p v-if="paginatedTransactions.length === 0" class="text-center text-sm text-muted-foreground py-6">
            No transactions yet.
          </p>
        </div>

        <!-- Pagination Footer -->
        <div v-if="ledger.length > 0" class="flex items-center justify-between px-2 py-4 border-t border-border/30 flex-wrap gap-4 mt-6">
          <div class="text-xs text-muted-foreground flex items-center gap-1">
            Showing
            <span class="font-bold text-foreground">{{ ledger.length === 0 ? 0 : (currentPage - 1) * pageSize + 1 }}</span>
            to
            <span class="font-bold text-foreground">{{ Math.min(currentPage * pageSize, ledger.length) }}</span>
            of
            <span class="font-bold text-foreground">{{ ledger.length }}</span>
            entries
          </div>
          
          <div class="flex items-center gap-6 flex-wrap">
            <div class="flex items-center gap-2">
              <span class="text-xs text-muted-foreground whitespace-nowrap">Show:</span>
              <select 
                v-model="pageSize" 
                class="bg-background border border-muted-foreground/30 rounded text-xs px-2 py-1.5 focus:ring-1 focus:ring-primary focus:outline-none cursor-pointer text-foreground"
                @change="currentPage = 1"
              >
                <option :value="10">10 per view</option>
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
      </div>
    </main>


  </div>
</template>
