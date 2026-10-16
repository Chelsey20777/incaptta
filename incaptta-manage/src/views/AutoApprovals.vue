<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useFinanceStore } from '@/stores/financeStore'
import { useAdminStore } from '@/stores/adminStore'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { 
  ShieldCheck, 
  Clock, 
  CalendarDays, 
  CalendarRange, 
  ChevronLeft,
  Search,
  Filter,
  Printer
} from 'lucide-vue-next'

const router = useRouter()
const financeStore = useFinanceStore()
const adminStore = useAdminStore()
const { expenses, loading } = storeToRefs(financeStore)

const THRESHOLD = 300

// Granularity tabs
type Granularity = 'daily' | 'weekly' | 'monthly'
const activeTab = ref<Granularity>('daily')

// Search filter
const searchQuery = ref('')
const showFilters = ref(false)

onMounted(() => {
  financeStore.fetchExpenses()
  adminStore.fetchSettings()
})

// -- Print / Export handler --
const handlePrint = () => {
  window.print()
}

// ── Core: Filter only auto-approved < $300 expenses ─────────────────────────
const autoApprovedExpenses = computed(() => {
  return expenses.value.filter(e => {
    const amount = Number(e.amount || 0)
    const isAutoApproved =
      (e.managerApprovedBy && String(e.managerApprovedBy).includes('Auto-approved')) ||
      (e.status === 'APPROVED_FOR_PAYMENT' && amount < THRESHOLD && e.accountantApprovedBy) ||
      (e.status === 'APPROVED' && amount < THRESHOLD && e.category === 'job-card-expense')
    return amount < THRESHOLD && amount > 0 && isAutoApproved
  })
})

// ── Date helpers ──────────────────────────────────────────────────────────────
const getDate = (e: any): Date => {
  if (e.accountantApprovedAt?.toDate) return e.accountantApprovedAt.toDate()
  if (e.createdAt?.toDate) return e.createdAt.toDate()
  return new Date(e.createdAt || 0)
}

const fd = (e: any) => {
  const d = getDate(e)
  return d.toLocaleString('en-US', { 
    day: '2-digit', 
    month: 'short', 
    year: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit', 
    hour12: false 
  })
}

// ── TODAY stats ───────────────────────────────────────────────────────────────
const todayStats = computed(() => {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  
  const items = autoApprovedExpenses.value.filter(e => {
    const d = getDate(e)
    return d >= startOfToday && d <= endOfToday
  })
  return {
    count: items.length,
    total: items.reduce((s, e) => s + Math.abs(Number(e.amount || 0)), 0)
  }
})

// ── THIS WEEK stats ───────────────────────────────────────────────────────────
const weekStats = computed(() => {
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1) // adjust when day is sunday
  const startOfWeek = new Date(now.setDate(diff))
  startOfWeek.setHours(0, 0, 0, 0)
  const endOfWeek = new Date(startOfWeek)
  endOfWeek.setDate(startOfWeek.getDate() + 6)
  endOfWeek.setHours(23, 59, 59, 999)

  const items = autoApprovedExpenses.value.filter(e => {
    const d = getDate(e)
    return d >= startOfWeek && d <= endOfWeek
  })
  return {
    count: items.length,
    total: items.reduce((s, e) => s + Math.abs(Number(e.amount || 0)), 0)
  }
})

// ── THIS MONTH stats ──────────────────────────────────────────────────────────
const monthStats = computed(() => {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

  const items = autoApprovedExpenses.value.filter(e => {
    const d = getDate(e)
    return d >= startOfMonth && d <= endOfMonth
  })
  return {
    count: items.length,
    total: items.reduce((s, e) => s + Math.abs(Number(e.amount || 0)), 0)
  }
})

// ── Active table items (flat, filtered by search query) ──────────────────────
const activeItems = computed(() => {
  const items = [...autoApprovedExpenses.value].sort((a, b) => getDate(b).getTime() - getDate(a).getTime())

  if (!searchQuery.value.trim()) return items
  const q = searchQuery.value.toLowerCase()
  return items.filter(e =>
    (e.description || '').toLowerCase().includes(q) ||
    (e.category || '').toLowerCase().includes(q) ||
    (e.accountantApprovedBy || e.managerApprovedBy || '').toLowerCase().includes(q)
  )
})

// ── Pagination State ─────────────────────────────────────────────────────────
const currentPage = ref(1)
const itemsPerPage = ref(20)

const totalPages = computed(() => {
  return Math.ceil(activeItems.value.length / itemsPerPage.value) || 1
})

watch([activeTab, searchQuery], () => {
  currentPage.value = 1
})

const paginatedItems = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value
  const end = start + itemsPerPage.value
  return activeItems.value.slice(start, end)
})

// ── Native Week Number Helper ────────────────────────────────────────────────
const getWeekNumber = (d: Date) => {
  const date = new Date(d.getTime())
  date.setHours(0, 0, 0, 0)
  // Thursday in current week decides the year.
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7)
  // January 4 is always in week 1.
  const week1 = new Date(date.getFullYear(), 0, 4)
  // Adjust to Thursday in week 1 and count number of weeks from then to date.
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)
}

// ── Group only the currently paginated items ─────────────────────────────────
const paginatedGroups = computed(() => {
  const groups: { label: string; count: number; total: number; items: any[] }[] = []
  
  paginatedItems.value.forEach(e => {
    const d = getDate(e)
    let label = ''
    
    if (activeTab.value === 'daily') {
      label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    } else if (activeTab.value === 'weekly') {
      const weekNum = getWeekNumber(d)
      const day = d.getDay()
      const diff = d.getDate() - day + (day === 0 ? -6 : 1)
      const start = new Date(d.getFullYear(), d.getMonth(), diff)
      const end = new Date(start)
      end.setDate(start.getDate() + 6)
      label = `Week ${weekNum} (${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})`
    } else {
      label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    }
    
    let g = groups.find(x => x.label === label)
    if (!g) {
      g = { label, count: 0, total: 0, items: [] }
      groups.push(g)
    }
    g.count++
    g.total += Math.abs(Number(e.amount || 0))
    g.items.push(e)
  })
  
  return groups
})

// ── Formatters ─────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const getCategoryLabel = (e: any) => {
  if (e.category === 'job-card-expense') return 'Ad-hoc'
  return (e.category || e.title || 'Opex').replace(/-/g, ' ')
}
</script>

<template>
  <div class="flex-1 flex flex-col pb-20 bg-muted/20 min-h-screen">
    <!-- Header -->
    <header class="p-4 border-b bg-card sticky top-0 z-10 space-y-4 print:hidden">
      <div class="flex items-center gap-4">
        <Button variant="ghost" size="icon" @click="router.push('/')">
          <ChevronLeft class="size-6" />
        </Button>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <h1 class="text-xl font-black tracking-tight flex items-center gap-1.5">
              <ShieldCheck class="size-5 text-[#ff8903]" />
              Auto Approvals
            </h1>
            <Badge class="bg-primary/10 text-primary border-primary/20 text-[9px] font-black h-5 px-2">
              AUDIT TRAIL
            </Badge>
          </div>
          <p class="text-xs text-muted-foreground truncate">Expenses &lt; $300 (Sign-off bypassed)</p>
        </div>

        <Button 
          variant="outline" 
          size="sm" 
          @click="handlePrint"
          class="h-9 text-xs font-bold gap-1.5 border-[#79c21b]/20 hover:bg-[#79c21b]/10 text-foreground"
        >
          <Printer class="size-4" />
          <span class="hidden sm:inline">Print / Export</span>
        </Button>
      </div>

      <!-- Quick Search & Filter Toggle -->
      <div class="flex gap-2">
        <div class="relative flex-1">
          <Search class="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input 
            v-model="searchQuery" 
            placeholder="Search by details or categories..." 
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
          v-for="t in (['daily', 'weekly', 'monthly'] as Granularity[])" 
          :key="t"
          variant="secondary" 
          size="sm"
          :class="{ 'bg-primary text-white': activeTab === t }"
          class="capitalize text-xs font-bold"
          @click="activeTab = t"
        >
          {{ t }}
        </Button>
      </div>
    </header>

    <!-- Print-only Title block -->
    <div class="hidden print:block p-8 border-b text-center space-y-2">
      <h1 class="text-2xl font-bold tracking-tight">AUTO-APPROVALS AUDIT TRAIL REPORT</h1>
      <p class="text-xs text-muted-foreground">Generated by Capability Portal &middot; Period: {{ activeTab.toUpperCase() }}</p>
      <p class="text-[10px] text-muted-foreground">Date: {{ new Date().toLocaleString() }}</p>
    </div>

    <!-- Summary Cards -->
    <div class="p-4 grid grid-cols-3 gap-3 print:grid-cols-3">
      <!-- Today -->
      <Card class="border-none shadow-sm bg-gradient-to-br from-card to-background/50">
        <CardContent class="p-4 flex flex-col justify-between h-full space-y-2">
          <div class="flex justify-between items-center">
            <span class="text-[9px] font-black uppercase tracking-widest text-[#ff8903]">TODAY</span>
            <Clock class="size-3.5 text-[#ff8903]" />
          </div>
          <div>
            <p class="text-lg font-black tracking-tight">{{ fmt(todayStats.total) }}</p>
            <p class="text-[9px] text-muted-foreground">{{ todayStats.count }} item{{ todayStats.count !== 1 ? 's' : '' }}</p>
          </div>
        </CardContent>
      </Card>

      <!-- This Week -->
      <Card class="border-none shadow-sm bg-gradient-to-br from-card to-background/50">
        <CardContent class="p-4 flex flex-col justify-between h-full space-y-2">
          <div class="flex justify-between items-center">
            <span class="text-[9px] font-black uppercase tracking-widest text-[#79c21b]">THIS WEEK</span>
            <CalendarDays class="size-3.5 text-[#79c21b]" />
          </div>
          <div>
            <p class="text-lg font-black tracking-tight">{{ fmt(weekStats.total) }}</p>
            <p class="text-[9px] text-muted-foreground">{{ weekStats.count }} item{{ weekStats.count !== 1 ? 's' : '' }}</p>
          </div>
        </CardContent>
      </Card>

      <!-- This Month -->
      <Card class="border-none shadow-sm bg-gradient-to-br from-card to-background/50">
        <CardContent class="p-4 flex flex-col justify-between h-full space-y-2">
          <div class="flex justify-between items-center">
            <span class="text-[9px] font-black uppercase tracking-widest text-blue-500">THIS MONTH</span>
            <CalendarRange class="size-3.5 text-blue-500" />
          </div>
          <div>
            <p class="text-lg font-black tracking-tight">{{ fmt(monthStats.total) }}</p>
            <p class="text-[9px] text-muted-foreground">{{ monthStats.count }} item{{ monthStats.count !== 1 ? 's' : '' }}</p>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- main section -->
    <main class="px-4 space-y-6 pb-4">
      <div v-if="loading" class="flex flex-col items-center justify-center py-20">
        <Clock class="size-8 animate-spin text-muted-foreground" />
      </div>
      
      <div v-else-if="activeItems.length === 0" class="text-center py-20 text-muted-foreground">
        <p class="text-sm">No auto-approved expenses found.</p>
      </div>

      <div v-else class="space-y-6">
        <div v-for="(group, gi) in paginatedGroups" :key="gi" class="space-y-2">
          <!-- group header -->
          <div class="flex items-center justify-between border-b pb-1">
            <span class="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{{ group.label }}</span>
            <div class="flex gap-3 text-[10px] font-black text-muted-foreground">
              <span>{{ group.count }} transaction{{ group.count !== 1 ? 's' : '' }}</span>
              <span class="text-[#ff8903]">{{ fmt(group.total) }}</span>
            </div>
          </div>

          <!-- Cards list -->
          <div class="grid gap-3">
            <Card v-for="(item, ii) in group.items" :key="ii" class="border-none shadow-sm overflow-hidden">
              <CardContent class="p-4 space-y-2">
                <div class="flex justify-between items-start">
                  <div class="space-y-1 min-w-0">
                    <div class="flex items-center gap-1.5">
                      <Badge class="bg-primary/10 text-primary border-transparent text-[8px] uppercase font-black px-1.5 py-0 h-4">
                        {{ getCategoryLabel(item) }}
                      </Badge>
                      <span class="text-[10px] text-muted-foreground font-semibold">{{ fd(item) }}</span>
                    </div>
                    <h3 class="font-bold text-sm truncate text-foreground">{{ item.description || item.title || 'General OPEX' }}</h3>
                    <p class="text-[10px] text-muted-foreground">
                      Bypassed Rule: <span class="font-bold text-green-500">&lt; $300</span>
                      <span v-if="item.accountantApprovedBy"> &middot; Accountant: {{ item.accountantApprovedBy }}</span>
                    </p>
                  </div>
                  <span class="font-black text-sm text-[#ff8903] shrink-0 ml-2">
                    {{ fmt(Math.abs(Number(item.amount || 0))) }}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <!-- Pagination Footer -->
        <div class="flex items-center justify-between px-2 py-4 border-t border-border/30 flex-wrap gap-4 mt-6 print:hidden">
          <div class="text-xs text-muted-foreground flex items-center gap-1">
            Showing
            <span class="font-bold text-foreground">{{ activeItems.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1 }}</span>
            to
            <span class="font-bold text-foreground">{{ Math.min(currentPage * itemsPerPage, activeItems.length) }}</span>
            of
            <span class="font-bold text-foreground">{{ activeItems.length }}</span>
            entries
          </div>
          
          <div class="flex items-center gap-6 flex-wrap">
            <div class="flex items-center gap-2">
              <span class="text-xs text-muted-foreground whitespace-nowrap">Show:</span>
              <select 
                v-model="itemsPerPage" 
                class="bg-background border border-muted-foreground/30 rounded text-xs px-2 py-1.5 focus:ring-1 focus:ring-primary focus:outline-none cursor-pointer text-foreground"
                @change="currentPage = 1"
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

<style scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
@media print {
  .print\:hidden {
    display: none !important;
  }
}
</style>
