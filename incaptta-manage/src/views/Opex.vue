<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { db } from '@/lib/firebase'
import { collection, query, orderBy, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { useSession } from '@/composables/useSession'
import { useApprovalMonitor } from '@/composables/useApprovalMonitor'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { 
  Banknote, 
  ChevronLeft,
  Filter,
  Search,
  Clock,
  BarChart3,
  Fuel,
  Utensils,
  Settings,
  FileText,
  CircleEllipsis,
  CheckCircle2,
  XCircle,
  AlertCircle
} from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'

const { user } = useSession()
const router = useRouter()
const { counts } = useApprovalMonitor()

const expenses = ref<any[]>([])
const loading = ref(true)
const searchQuery = ref('')
const timeframe = ref('month')
const showFilters = ref(false)
const processing = ref<string | null>(null)

let unsub: any = null

const fetchData = () => {
  loading.value = true
  const q = query(collection(db, 'operationalExpenses'), orderBy('createdAt', 'desc'))
  unsub = onSnapshot(q, (snap) => {
    expenses.value = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    loading.value = false
  })
}

// ── Actions ────────────────────────────────────────────────────────
const approveExpense = async (exp: any) => {
  processing.value = exp.id
  try {
    await updateDoc(doc(db, 'operationalExpenses', exp.id), {
      status: 'APPROVED',
      approvedByManager: user.value?.displayName || 'Manager',
      approvedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
    toast.success('Expense Approved')
  } catch (err) {
    console.error(err)
    toast.error('Failed to approve expense')
  } finally {
    processing.value = null
  }
}

const rejectExpense = async (exp: any) => {
  const reason = prompt('Reason for rejection:')
  if (!reason) return

  processing.value = exp.id
  try {
    await updateDoc(doc(db, 'operationalExpenses', exp.id), {
      status: 'REJECTED',
      rejectionReason: reason,
      rejectedBy: user.value?.displayName || user.value?.email || 'Manager',
      rejectedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
    toast.success('Expense Rejected')
  } catch (err) {
    console.error(err)
    toast.error('Failed to reject expense')
  } finally {
    processing.value = null
  }
}

const filteredExpenses = computed(() => {
  return expenses.value.filter(exp => {
    // Search
    const searchMatch = !searchQuery.value || 
      exp.description?.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      exp.category?.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      exp.expenseNumber?.toLowerCase().includes(searchQuery.value.toLowerCase())

    // Timeframe
    let timeMatch = true
    const now = new Date()
    const expDate = exp.createdAt?.toDate?.() || new Date(0)
    
    if (timeframe.value === 'today') {
      timeMatch = expDate.toDateString() === now.toDateString()
    } else if (timeframe.value === 'week') {
      const weekAgo = new Date()
      weekAgo.setDate(now.getDate() - 7)
      timeMatch = expDate >= weekAgo
    } else if (timeframe.value === 'month') {
      timeMatch = expDate.getMonth() === now.getMonth() && expDate.getFullYear() === now.getFullYear()
    }

    return searchMatch && timeMatch
  })
})

// ── Pagination State ──
const currentPage = ref(1)
const pageSize = ref(20)

const paginatedExpenses = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filteredExpenses.value.slice(start, end)
})

const totalPages = computed(() => {
  return Math.ceil(filteredExpenses.value.length / pageSize.value) || 1
})

watch([searchQuery, timeframe], () => {
  currentPage.value = 1
})

const totalAmount = computed(() => {
  // Only count approved items in the summary total?
  // User said "show summary", usually means approved ones.
  return filteredExpenses.value
    .filter(e => e.status === 'APPROVED' || e.status === 'PAYMENT_PROCESSED')
    .reduce((sum, exp) => sum + Number(exp.amount || 0), 0)
})

onMounted(() => fetchData())
onUnmounted(() => unsub?.())

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

const formatDate = (val: any) => {
  if (!val) return 'N/A'
  if (val.toDate) return val.toDate().toLocaleDateString()
  return new Date(val).toLocaleDateString()
}

const getCategoryStyle = (exp: any) => {
  const cat = (exp.category || '').toLowerCase()
  const desc = (exp.description || '').toLowerCase()
  const text = `${cat} ${desc}`

  if (text.includes('fuel') || text.includes('petrol') || text.includes('diesel') || text.includes('food') || text.includes('meal')) {
    const isFood = text.includes('food') || text.includes('meal')
    return { 
      color: 'text-[#8dc63f]', 
      bg: 'bg-[#8dc63f]/10', 
      icon: isFood ? Utensils : Fuel, 
      label: isFood ? 'Food & Meals' : 'Fuel' 
    }
  }

  if (text.includes('maintenance') || text.includes('repair') || text.includes('service') || text.includes('job card') || text.includes('work order')) {
    return { color: 'text-[#f58220]', bg: 'bg-[#f58220]/10', icon: text.includes('maintenance') ? Settings : FileText, label: text.includes('maintenance') ? 'Maintenance' : 'Job Card' }
  }

  if (text.includes('salary') || text.includes('wage') || text.includes('payroll')) {
    return { color: 'text-[#8dc63f]', bg: 'bg-[#8dc63f]/10', icon: Banknote, label: 'Salary/Wages' }
  }
  
  return { color: 'text-primary', bg: 'bg-primary/10', icon: CircleEllipsis, label: exp.category || 'General' }
}
</script>

<template>
  <div class="flex-1 flex flex-col pb-20 bg-muted/20">
    <!-- Header -->
    <header class="p-4 border-b bg-card sticky top-0 z-10 space-y-4">
      <div class="flex items-center gap-4">
        <Button variant="ghost" size="icon" @click="router.push('/')">
          <ChevronLeft class="size-6" />
        </Button>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <h1 class="text-xl font-bold">OPEX Summary</h1>
            <Badge v-if="counts.opex > 0" class="bg-orange-500 text-white animate-pulse text-[10px] font-black h-5 px-2">
              {{ counts.opex }} AWAITING ACTION
            </Badge>
          </div>
          <p class="text-xs text-muted-foreground truncate">Total Approved: ${{ totalAmount.toLocaleString() }}</p>
        </div>
      </div>

      <!-- Quick Search & Filter Toggle -->
      <div class="flex gap-2">
        <div class="relative flex-1">
          <Search class="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input 
            v-model="searchQuery" 
            placeholder="Search EXP# or details..." 
            class="pl-8 bg-muted/40 h-10 border-none"
          />
        </div>
        <Button 
          variant="outline" 
          size="icon" 
          :class="{ 'bg-primary text-white': showFilters }"
          @click="showFilters = !showFilters"
        >
          <Filter class="size-4" />
        </Button>
      </div>

      <!-- Multi-select Timeframe -->
      <div v-if="showFilters" class="flex gap-2 overflow-x-auto no-scrollbar pb-2 pt-1">
        <Button 
          v-for="t in ['today', 'week', 'month', 'all']" 
          :key="t"
          variant="secondary" 
          size="sm"
          :class="{ 'bg-primary text-white': timeframe === t }"
          class="capitalize text-xs font-bold"
          @click="timeframe = t"
        >
          {{ t }}
        </Button>
      </div>
    </header>

    <!-- Summary Card -->
    <div class="p-4">
      <Card class="bg-gradient-to-br from-[#f58220] to-[#8dc63f] text-white shadow-2xl shadow-orange-500/20 border-none relative overflow-hidden group">
        <!-- Abstract Decoration -->
        <div class="absolute -right-6 -top-6 size-32 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-all duration-700" />
        <div class="absolute -left-10 -bottom-10 size-40 bg-white/10 rounded-full blur-3xl" />
        
        <CardContent class="p-6 relative z-10 flex justify-between items-center">
          <div>
            <div class="inline-flex items-center gap-2 px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-md border border-white/20 mb-3">
              <BarChart3 class="size-3" />
              <span class="text-[10px] font-bold uppercase tracking-wider">Operational Overview</span>
            </div>
            <p class="text-xs font-medium text-white/90 uppercase tracking-tighter">Approved for Period</p>
            <h2 class="text-4xl font-black tracking-tight mt-1 flex items-baseline gap-1">
              <span class="text-xl font-medium opacity-80">$</span>{{ totalAmount.toLocaleString() }}
            </h2>
            <div class="flex items-center gap-2 mt-4">
              <div class="px-2 py-1 rounded-lg bg-black/20 text-[10px] font-bold backdrop-blur-md">
                {{ filteredExpenses.filter(e => e.status === 'APPROVED' || e.status === 'PAYMENT_PROCESSED').length }} Approved
              </div>
              <div v-if="counts.opex > 0" class="px-2 py-1 rounded-lg bg-white/20 text-white text-[10px] font-bold backdrop-blur-md flex items-center gap-1">
                <AlertCircle class="size-3" />
                {{ counts.opex }} Pending
              </div>
            </div>
          </div>
          <div class="size-16 rounded-2xl bg-white/10 backdrop-blur-xl flex items-center justify-center border border-white/20 shadow-inner">
            <Banknote class="size-8 text-white" />
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Expense List -->
    <main class="px-4 space-y-3 pb-4">
      <div v-if="loading" class="flex flex-col items-center justify-center py-20">
        <Clock class="size-8 animate-spin text-muted-foreground" />
      </div>
      
      <div v-else-if="paginatedExpenses.length === 0" class="text-center py-20 text-muted-foreground">
        <p class="text-sm">No expenses found for this period.</p>
      </div>

      <Card v-for="exp in paginatedExpenses" :key="exp.id" class="border-none shadow-sm relative overflow-hidden">
        <!-- Optional side accent -->
        <div class="absolute left-0 top-0 bottom-0 w-1" :class="getCategoryStyle(exp).bg.replace('/10', '')" />
        
        <CardContent class="p-4 space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3 min-w-0">
              <div class="size-10 rounded-full flex items-center justify-center shrink-0" :class="getCategoryStyle(exp).bg">
                <component :is="getCategoryStyle(exp).icon" class="size-5" :class="getCategoryStyle(exp).color" />
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-1.5">
                  <p class="font-bold text-sm truncate">{{ exp.description || 'General Expense' }}</p>
                  <span v-if="exp.expenseNumber" class="text-[9px] font-mono text-muted-foreground bg-muted px-1 rounded">{{ exp.expenseNumber }}</span>
                </div>
                <div class="flex items-center gap-2 mt-0.5">
                  <p class="text-[10px] text-muted-foreground">{{ formatDate(exp.createdAt) }}</p>
                  <Badge 
                    variant="outline" 
                    class="text-[9px] px-1.5 py-0 h-4 uppercase border-transparent"
                    :class="[getCategoryStyle(exp).bg, getCategoryStyle(exp).color]"
                  >
                    {{ getCategoryStyle(exp).label }}
                  </Badge>
                </div>
                <div v-if="(exp.attachmentUrls && exp.attachmentUrls.length > 0) || exp.attachmentUrl || exp.receiptUrl" class="flex items-center gap-2 mt-2 flex-wrap">
                  <template v-if="exp.attachmentUrls && exp.attachmentUrls.length > 0">
                    <a v-for="(url, idx) in exp.attachmentUrls" :key="idx" 
                      :href="url" target="_blank"
                      :title="getFileName(url)"
                      class="text-[10px] font-bold text-[#ff8903] hover:underline flex items-center gap-1 bg-[#ff8903]/10 px-2 py-0.5 rounded border border-[#ff8903]/20"
                    >
                      <FileText class="size-3" />
                      Doc {{ Number(idx) + 1 }}
                    </a>
                  </template>
                  <a v-else :href="exp.attachmentUrl || exp.receiptUrl" target="_blank"
                    class="text-[10px] font-bold text-[#ff8903] hover:underline flex items-center gap-1 bg-[#ff8903]/10 px-2 py-0.5 rounded border border-[#ff8903]/20"
                  >
                    <FileText class="size-3" />
                    View Receipt
                  </a>
                </div>
              </div>
            </div>
            <div class="text-right shrink-0 ml-4">
              <p class="font-bold text-sm">${{ Number(exp.amount || 0).toLocaleString() }}</p>
              <Badge 
                v-if="exp.status" 
                :variant="exp.status === 'APPROVED' || exp.status === 'PAYMENT_PROCESSED' ? 'secondary' : 'default'"
                class="text-[9px] h-4 mt-1 uppercase font-black"
                :class="{
                  'bg-orange-500/10 text-orange-600 border-orange-500/20': exp.status === 'APPROVED_ACCOUNTANT',
                  'bg-green-500/10 text-green-600 border-green-500/20': exp.status === 'APPROVED' || exp.status === 'PAYMENT_PROCESSED',
                  'bg-red-500/10 text-red-600 border-red-500/20': exp.status === 'REJECTED'
                }"
              >
                {{ exp.status === 'APPROVED_ACCOUNTANT' ? 'Needs Manager' : exp.status.replace('_', ' ') }}
              </Badge>
            </div>
          </div>

          <!-- Approval Actions -->
          <div v-if="exp.status === 'APPROVED_ACCOUNTANT'" class="flex gap-2 pt-1">
            <Button 
              class="flex-1 bg-green-600 hover:bg-green-700 h-9 text-xs font-bold" 
              :disabled="processing === exp.id"
              @click="approveExpense(exp)"
            >
              <CheckCircle2 class="mr-2 size-4" /> Approve
            </Button>
            <Button 
              variant="outline" 
              class="flex-1 text-red-600 border-red-200 hover:bg-red-50 h-9 text-xs font-bold" 
              :disabled="processing === exp.id"
              @click="rejectExpense(exp)"
            >
              <XCircle class="mr-2 size-4" /> Reject
            </Button>
          </div>
        </CardContent>
      </Card>

      <!-- Pagination Footer -->
      <div v-if="filteredExpenses.length > 0" class="flex items-center justify-between px-2 py-4 border-t border-border/30 flex-wrap gap-4 mt-6">
        <div class="text-xs text-muted-foreground flex items-center gap-1">
          Showing
          <span class="font-bold text-foreground">{{ filteredExpenses.length === 0 ? 0 : (currentPage - 1) * pageSize + 1 }}</span>
          to
          <span class="font-bold text-foreground">{{ Math.min(currentPage * pageSize, filteredExpenses.length) }}</span>
          of
          <span class="font-bold text-foreground">{{ filteredExpenses.length }}</span>
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
    </main>


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
