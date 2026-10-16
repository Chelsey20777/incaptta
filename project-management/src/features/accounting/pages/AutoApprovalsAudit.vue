<script setup lang="ts">
import { onMounted, computed, ref, watch } from 'vue'
import { useFinanceStore } from '@/features/fundTransfers/store/financeStore'
import { useAdminStore } from '@/features/admin/store/adminStore'
import { useSession } from '@/composables/useSession'
import { generateAutoApprovalsReportPdf } from '@/features/accounting/utils/generateAutoApprovalsReportPdf'
import { storeToRefs } from 'pinia'
import {
  startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  isWithinInterval, parseISO, format, subDays, eachDayOfInterval, getISOWeek, getYear
} from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ShieldCheck, Clock, CalendarDays, CalendarRange, LayoutList,
  TrendingDown, ArrowLeft, Download, Search, Filter
} from 'lucide-vue-next'
import { useRouter } from 'vue-router'

const router = useRouter()
const financeStore = useFinanceStore()
const adminStore = useAdminStore()
const { expenses, loading } = storeToRefs(financeStore)
const { appSettings } = storeToRefs(adminStore)
const { user } = useSession()

const THRESHOLD = 300

// Granularity tabs
type Granularity = 'daily' | 'weekly' | 'monthly'
const activeTab = ref<Granularity>('daily')

// Search filter
const searchQuery = ref('')

onMounted(() => {
  financeStore.fetchExpenses()
  adminStore.fetchSettings()
})

const isExporting = ref(false)

const handleExportPdf = async () => {
  if (isExporting.value) return
  isExporting.value = true
  try {
    await generateAutoApprovalsReportPdf(
      activeItems.value,
      activeTab.value,
      searchQuery.value,
      appSettings.value,
      user.value?.email || 'System'
    )
  } catch (err) {
    console.error('PDF generation failed:', err)
  } finally {
    isExporting.value = false
  }
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
  return new Date()
}

// ── TODAY stats ───────────────────────────────────────────────────────────────
const todayStats = computed(() => {
  const interval = { start: startOfDay(new Date()), end: endOfDay(new Date()) }
  const items = autoApprovedExpenses.value.filter(e => isWithinInterval(getDate(e), interval))
  return {
    count: items.length,
    total: items.reduce((s, e) => s + Math.abs(Number(e.amount || 0)), 0),
    items
  }
})

// ── THIS WEEK stats ───────────────────────────────────────────────────────────
const weekStats = computed(() => {
  const interval = { start: startOfWeek(new Date(), { weekStartsOn: 1 }), end: endOfWeek(new Date(), { weekStartsOn: 1 }) }
  const items = autoApprovedExpenses.value.filter(e => isWithinInterval(getDate(e), interval))
  return {
    count: items.length,
    total: items.reduce((s, e) => s + Math.abs(Number(e.amount || 0)), 0),
    items
  }
})

// ── THIS MONTH stats ──────────────────────────────────────────────────────────
const monthStats = computed(() => {
  const interval = { start: startOfMonth(new Date()), end: endOfMonth(new Date()) }
  const items = autoApprovedExpenses.value.filter(e => isWithinInterval(getDate(e), interval))
  return {
    count: items.length,
    total: items.reduce((s, e) => s + Math.abs(Number(e.amount || 0)), 0),
    items
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

// ── Group only the currently paginated items ─────────────────────────────────
const paginatedGroups = computed(() => {
  const groups: { label: string; count: number; total: number; items: any[] }[] = []
  
  paginatedItems.value.forEach(e => {
    const d = getDate(e)
    let label = ''
    
    if (activeTab.value === 'daily') {
      label = format(d, 'EEE, MMM d')
    } else if (activeTab.value === 'weekly') {
      const week = getISOWeek(d)
      const start = startOfWeek(d, { weekStartsOn: 1 })
      const end = endOfWeek(d, { weekStartsOn: 1 })
      label = `Week ${week} (${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')})`
    } else {
      label = format(d, 'MMMM yyyy')
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
const fc = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v)
const fd = (e: any) => {
  const d = getDate(e)
  return format(d, 'dd MMM yyyy, HH:mm')
}
const getCategoryLabel = (e: any) => {
  if (e.category === 'job-card-expense') return 'Ad-hoc'
  return (e.category || e.title || 'Opex').replace(/-/g, ' ')
}
</script>

<template>
  <div class="p-4 md:p-6 space-y-6 animate-in fade-in duration-500">

    <!-- Header -->
    <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <Button variant="ghost" size="icon" class="text-muted-foreground hover:text-foreground" @click="router.back()">
          <ArrowLeft class="size-4" />
        </Button>
        <div>
          <h1 class="text-2xl font-extrabold tracking-tight flex items-center gap-2">
            <ShieldCheck class="size-6 text-amber-500" />
            Auto-Approvals Audit Trail
          </h1>
          <p class="text-sm text-muted-foreground mt-0.5">
            Opex &amp; Ad-hoc expenses auto-approved under
            <span class="font-bold text-amber-500">$300</span> — no manager sign-off required
          </p>
        </div>
      </div>

      <!-- Export Action -->
      <Button
        variant="outline"
        size="sm"
        @click="handleExportPdf"
        :disabled="isExporting || loading || activeItems.length === 0"
        class="h-10 lg:h-9 text-xs font-semibold gap-1.5 flex items-center shrink-0 border-amber-500/30 hover:bg-amber-500/10 text-foreground"
      >
        <template v-if="!isExporting">
          <Download class="size-4 text-amber-500" />
          <span>Export Audit PDF</span>
        </template>
        <template v-else>
          <span class="size-4 rounded-full border-2 border-amber-500 border-t-transparent animate-spin shrink-0" />
          <span>Exporting...</span>
        </template>
      </Button>
    </div>

    <!-- Summary Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <!-- Today -->
      <Card class="relative overflow-hidden border-amber-500/20 bg-amber-500/5 dark:bg-amber-500/10 shadow-lg">
        <CardContent class="p-5">
          <div class="flex items-center justify-between mb-3">
            <div class="p-2 bg-amber-500/10 rounded-lg">
              <Clock class="size-4 text-amber-500" />
            </div>
            <Badge variant="outline" class="text-[10px] font-bold border-amber-400/40 text-amber-600 dark:text-amber-400">TODAY</Badge>
          </div>
          <p class="text-3xl font-black tabular-nums text-foreground">{{ fc(todayStats.total) }}</p>
          <p class="text-xs text-muted-foreground mt-1">{{ todayStats.count }} transaction{{ todayStats.count !== 1 ? 's' : '' }} auto-approved</p>
        </CardContent>
      </Card>

      <!-- This Week -->
      <Card class="relative overflow-hidden border-blue-500/20 bg-blue-500/5 dark:bg-blue-500/10 shadow-lg">
        <CardContent class="p-5">
          <div class="flex items-center justify-between mb-3">
            <div class="p-2 bg-blue-500/10 rounded-lg">
              <CalendarDays class="size-4 text-blue-500" />
            </div>
            <Badge variant="outline" class="text-[10px] font-bold border-blue-400/40 text-blue-600 dark:text-blue-400">THIS WEEK</Badge>
          </div>
          <p class="text-3xl font-black tabular-nums text-foreground">{{ fc(weekStats.total) }}</p>
          <p class="text-xs text-muted-foreground mt-1">{{ weekStats.count }} transaction{{ weekStats.count !== 1 ? 's' : '' }} auto-approved</p>
        </CardContent>
      </Card>

      <!-- This Month -->
      <Card class="relative overflow-hidden border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-500/10 shadow-lg">
        <CardContent class="p-5">
          <div class="flex items-center justify-between mb-3">
            <div class="p-2 bg-emerald-500/10 rounded-lg">
              <CalendarRange class="size-4 text-emerald-500" />
            </div>
            <Badge variant="outline" class="text-[10px] font-bold border-emerald-400/40 text-emerald-600 dark:text-emerald-400">THIS MONTH</Badge>
          </div>
          <p class="text-3xl font-black tabular-nums text-foreground">{{ fc(monthStats.total) }}</p>
          <p class="text-xs text-muted-foreground mt-1">{{ monthStats.count }} transaction{{ monthStats.count !== 1 ? 's' : '' }} auto-approved</p>
        </CardContent>
      </Card>
    </div>

    <!-- Aggregation Tabs + Search -->
    <Card class="shadow-lg border-border/60">
      <CardHeader class="pb-3">
        <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div>
            <CardTitle class="text-base font-bold flex items-center gap-2">
              <LayoutList class="size-4 text-muted-foreground" />
              Transaction Log
            </CardTitle>
            <CardDescription class="text-xs mt-0.5">All auto-approved expenses grouped by period</CardDescription>
          </div>

          <!-- Tabs -->
          <div class="flex items-center bg-muted/50 rounded-lg p-1 gap-0.5 border border-border/50">
            <button
              v-for="tab in (['daily', 'weekly', 'monthly'] as Granularity[])"
              :key="tab"
              @click="activeTab = tab"
              :class="[
                'px-3 py-1.5 rounded-md text-xs font-semibold transition-all capitalize',
                activeTab === tab
                  ? 'bg-background shadow-sm text-foreground border border-border/60'
                  : 'text-muted-foreground hover:text-foreground'
              ]"
            >
              {{ tab }}
            </button>
          </div>
        </div>

        <!-- Search -->
        <div class="relative mt-3">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search by description, category or approver…"
            class="w-full pl-8 pr-4 py-2 text-sm bg-muted/50 border border-border/60 rounded-lg outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/50 transition-all"
          />
        </div>
      </CardHeader>

      <CardContent class="pt-0">

        <!-- Loading -->
        <div v-if="loading" class="py-12 flex flex-col items-center gap-2 text-muted-foreground">
          <div class="size-8 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
          <p class="text-sm">Loading audit data…</p>
        </div>

        <!-- Empty -->
        <div v-else-if="activeItems.length === 0" class="py-16 flex flex-col items-center gap-3 text-muted-foreground">
          <TrendingDown class="size-10 opacity-30" />
          <p class="text-sm font-medium">No auto-approved expenses found</p>
          <p class="text-xs opacity-70">Expenses under $300 that bypass manager approval will appear here.</p>
        </div>

        <!-- Groups (aggregated view) -->
        <div v-else class="space-y-5">
          <div
            v-for="(group, gi) in paginatedGroups"
            :key="gi"
          >
            <!-- Period header -->
            <div class="flex items-center justify-between py-2 border-b border-dashed border-border/50">
              <span class="text-xs font-bold text-muted-foreground uppercase tracking-wider">{{ group.label }}</span>
              <div class="flex items-center gap-3">
                <span class="text-[10px] text-muted-foreground">{{ group.count }} item{{ group.count !== 1 ? 's' : '' }}</span>
                <span class="text-xs font-black text-amber-600 dark:text-amber-400">{{ fc(group.total) }}</span>
              </div>
            </div>

            <!-- Items table -->
            <div class="overflow-x-auto rounded-lg border border-border/40">
              <table class="w-full text-xs">
                <thead>
                  <tr class="bg-muted/40 border-b border-border/40">
                    <th class="text-left px-3 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Date &amp; Time</th>
                    <th class="text-left px-3 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Type</th>
                    <th class="text-left px-3 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Description</th>
                    <th class="text-left px-3 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Approved By</th>
                    <th class="text-right px-3 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Amount</th>
                    <th class="text-center px-3 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Rule</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-border/30">
                  <tr
                    v-for="(item, ii) in group.items"
                    :key="ii"
                    class="hover:bg-muted/20 transition-colors"
                  >
                    <td class="px-3 py-2.5 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                      {{ fd(item) }}
                    </td>
                    <td class="px-3 py-2.5">
                      <span :class="[
                        'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold',
                        item.category === 'job-card-expense'
                          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                          : 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                      ]">
                        {{ getCategoryLabel(item) }}
                      </span>
                    </td>
                    <td class="px-3 py-2.5 text-foreground max-w-[200px] truncate" :title="item.description || item.title || '—'">
                      {{ item.description || item.title || '—' }}
                    </td>
                    <td class="px-3 py-2.5 text-muted-foreground">
                      {{ item.accountantApprovedBy || '—' }}
                    </td>
                    <td class="px-3 py-2.5 text-right font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                      {{ fc(Math.abs(Number(item.amount || 0))) }}
                    </td>
                    <td class="px-3 py-2.5 text-center">
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                        <ShieldCheck class="size-3" /> &lt; $300
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Pagination Footer -->
        <div v-if="!loading && activeItems.length > 0" class="flex items-center justify-between px-2 py-4 border-t border-border/30 flex-wrap gap-4 mt-6">
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
                class="bg-background border border-muted-foreground/30 rounded text-xs px-2 py-1.5 focus:ring-1 focus:ring-amber-500 focus:outline-none cursor-pointer text-foreground animate-none"
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

  </div>
</template>
