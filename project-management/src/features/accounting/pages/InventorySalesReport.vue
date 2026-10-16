<script setup lang="ts">
import { onMounted, computed, ref } from 'vue'
import { useReportStore } from '../store/reportStore'
import { storeToRefs } from 'pinia'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Search, Package, CheckCircle2, AlertCircle, Download, RefreshCw, PackageMinus, ShieldAlert } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { useJobCardsStore } from '@/features/jobCards/store/jobCardsStore'
import { toast } from 'vue-sonner'
import { debugPermissions } from '../../inventory/utils/debugPermissions'

const reportStore = useReportStore()
const jobCardsStore = useJobCardsStore()
const { inventorySalesReport, loading } = storeToRefs(reportStore)
const searchQuery = ref('')
const isSyncing = ref(false)
const isDebugging = ref(false)

async function handleDebug() {
    isDebugging.value = true
    try {
        const results = await debugPermissions()
        alert('Permission Results:\n' + JSON.stringify(results, null, 2))
    } finally {
        isDebugging.value = false
    }
}

async function handleSyncBacklog() {
  const confirmed = confirm('This will identify all approved Job Cards that were NOT deducted from inventory and adjust their stock levels now. Continue?')
  if (!confirmed) return

  isSyncing.value = true
  toast.loading('Syncing inventory backlog...', { id: 'backlog-sync' })
  try {
    const count = await jobCardsStore.syncInventoryBacklog()
    toast.success('Sync Complete', { id: 'backlog-sync', description: `Successfully processed ${count} job cards.` })
    await reportStore.generateInventoryReport()
  } catch (err: any) {
    toast.error('Sync Failed', { id: 'backlog-sync', description: err.message })
  } finally {
    isSyncing.value = false
  }
}

function handleExport() {
  toast.info('Exporting report...', { description: 'Generating CSV file' })
  // Simple CSV export logic
  const headers = ['Date', 'Job Number', 'Client', 'Item', 'Qty', 'Unit Cost', 'Total Value', 'Status']
  const rows = filteredReport.value.map(r => [
    formatDate(r.date),
    r.jobNumber,
    r.clientName,
    r.itemName,
    r.qty,
    r.unitCost,
    r.totalCost,
    r.isDeducted ? 'SYNCED' : 'PENDING'
  ])
  
  const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n")
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement("a")
  const url = URL.createObjectURL(blob)
  link.setAttribute("href", url)
  link.setAttribute("download", `inventory_sales_report_${new Date().toISOString().split('T')[0]}.csv`)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

onMounted(() => {
  reportStore.generateInventoryReport()
})

const filteredReport = computed(() => {
  const q = searchQuery.value.toLowerCase()
  return inventorySalesReport.value.filter(item => 
    item.itemName.toLowerCase().includes(q) || 
    item.jobNumber.toLowerCase().includes(q) ||
    item.clientName.toLowerCase().includes(q) ||
    item.sku.toLowerCase().includes(q)
  )
})

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(val)
}

const formatDate = (date: any) => {
  if (!(date instanceof Date) || isNaN(date.getTime())) return 'N/A'
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(date)
}

const formatTime = (date: any) => {
  if (!(date instanceof Date) || isNaN(date.getTime())) return '--:--'
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(date)
}
</script>

<template>
  <div class="space-y-6 animate-in fade-in duration-500">
    <div class="flex justify-between items-center">
      <div class="relative w-full max-w-md">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input 
          v-model="searchQuery" 
          placeholder="Search by Item, SKU or Job #..." 
          class="pl-10 bg-card border-brand-primary/10 shadow-sm"
        />
      </div>
        <div class="flex gap-2">
          <Button 
            variant="outline" 
            size="sm"
            @click="handleDebug"
            :disabled="isDebugging"
            class="border-orange-500 text-orange-500 hover:bg-orange-50"
          >
            <ShieldAlert class="w-4 h-4 mr-2" />
            {{ isDebugging ? 'Testing...' : 'Debug Permissions' }}
          </Button>

          <Button 
            variant="outline" 
            size="sm"
            @click="handleSyncBacklog"
            :disabled="isSyncing"
            class="border-blue-500 text-blue-500 hover:bg-blue-50"
          >
            <RefreshCw :class="['w-4 h-4 mr-2', { 'animate-spin': isSyncing }]" />
            {{ isSyncing ? 'Syncing...' : 'Sync Backlog' }}
          </Button>
          <Button variant="outline" size="sm" @click="handleExport">
            <Download class="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
    </div>

    <Card class="border-brand-primary/10 shadow-xl overflow-hidden bg-card/50 backdrop-blur-sm">
      <CardHeader class="bg-muted/30 border-b">
        <div class="flex justify-between items-center">
          <CardTitle class="text-sm font-bold uppercase tracking-widest flex items-center gap-2">
            <Package class="size-4 text-brand-primary" />
            Inventory Sales Audit Trail
          </CardTitle>
          <div class="flex gap-4 text-xs font-medium">
            <div class="flex items-center gap-1.5 text-emerald-600">
              <CheckCircle2 class="size-3" /> Deducted
            </div>
            <div class="flex items-center gap-1.5 text-orange-500">
              <AlertCircle class="size-3" /> Pending Deduction
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent class="p-0">
        <div class="max-h-[600px] overflow-auto">
          <Table>
            <TableHeader class="bg-muted/50 sticky top-0 z-10 shadow-sm">
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Job Card #</TableHead>
                <TableHead>Item / SKU</TableHead>
                <TableHead class="text-right">Qty</TableHead>
                <TableHead class="text-right">Unit Cost</TableHead>
                <TableHead class="text-right">Total Value</TableHead>
                <TableHead class="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-if="loading" v-for="i in 5" :key="i">
                <TableCell v-for="j in 7" :key="j"><div class="h-4 w-full bg-muted animate-pulse rounded"></div></TableCell>
              </TableRow>
              <TableRow v-else-if="filteredReport.length === 0">
                <TableCell colspan="7" class="h-32 text-center text-muted-foreground italic">
                  No inventory sales found matching your criteria.
                </TableCell>
              </TableRow>
              <TableRow v-for="row in filteredReport" :key="row.id" class="group hover:bg-brand-primary/5 transition-colors">
                <TableCell class="text-xs font-medium">
                  <div class="flex flex-col">
                    <span>{{ formatDate(row.date) }}</span>
                    <span class="text-[10px] text-muted-foreground">{{ formatTime(row.date) }}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div class="flex flex-col">
                    <span class="text-xs font-bold">{{ row.jobNumber }}</span>
                    <span class="text-[10px] text-muted-foreground truncate max-w-[150px]">{{ row.clientName }}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div class="flex flex-col">
                    <div class="flex items-center gap-2">
                      <span class="text-sm font-medium">{{ row.itemName }}</span>
                      <Badge v-if="row.isReturn" variant="outline" class="text-[8px] h-4 bg-orange-500/10 text-orange-600 border-orange-500/20 px-1 py-0 font-black">RETURN</Badge>
                    </div>
                    <span v-if="row.sku && row.sku !== 'N/A'" class="text-[10px] font-mono text-muted-foreground">{{ row.sku }}</span>
                  </div>
                </TableCell>
                <TableCell class="text-right font-bold tabular-nums" :class="row.isReturn ? 'text-orange-600' : ''">
                  {{ row.qty > 0 ? '+' : '' }}{{ row.qty }}
                </TableCell>
                <TableCell class="text-right tabular-nums">{{ formatCurrency(row.unitCost) }}</TableCell>
                <TableCell class="text-right font-black tabular-nums" :class="row.isReturn ? 'text-orange-600' : ''">
                  {{ formatCurrency(row.totalCost) }}
                </TableCell>
                <TableCell class="text-center">
                  <Badge 
                    variant="outline"
                    class="text-[10px] px-2 py-0 h-5"
                    :class="row.isDeducted ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-orange-500/10 text-orange-600 border-orange-500/20'"
                  >
                    {{ row.isDeducted ? 'SYNCED' : 'PENDING' }}
                  </Badge>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>

    <!-- Summary Stats -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
      <div class="p-4 rounded-xl border border-brand-primary/10 bg-brand-primary/5 space-y-1">
        <p class="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Net Inventory Consumption</p>
        <p class="text-2xl font-black tabular-nums">
          {{ formatCurrency(filteredReport.reduce((sum, r) => sum + r.totalCost, 0)) }}
        </p>
      </div>
      <div class="p-4 rounded-xl border border-emerald-500/10 bg-emerald-500/5 space-y-1">
        <p class="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Deducted (Synced) Value</p>
        <p class="text-2xl font-black tabular-nums text-emerald-600">
          {{ formatCurrency(filteredReport.filter(r => r.isDeducted).reduce((sum, r) => sum + r.totalCost, 0)) }}
        </p>
      </div>
      <div class="p-4 rounded-xl border border-orange-500/10 bg-orange-500/5 space-y-1">
        <p class="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Pending Reconciliation</p>
        <p class="text-2xl font-black tabular-nums text-orange-600">
          {{ formatCurrency(filteredReport.filter(r => !r.isDeducted).reduce((sum, r) => sum + r.totalCost, 0)) }}
        </p>
      </div>
    </div>
  </div>
</template>
