<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useJobCardsStore } from '../store/jobCardsStore'
import { useSession } from '@/composables/useSession'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Filter, Plus, MoreHorizontal, Eye, Download, Loader2, Trash2, Search, FileText, CheckCircle2, AlertCircle, ChevronDown } from 'lucide-vue-next'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAdminStore } from '@/features/admin/store/adminStore'
import { useReferenceResolver } from '@/composables/useReferenceResolver'
import { exportDetailedJobCardsCsv } from '../utils/exportCsv'
import { generateJobCardsReportPdf } from '../utils/generateJobCardsReportPdf'
import { toast } from 'vue-sonner'
import AdminDeleteDialog from '@/components/AdminDeleteDialog.vue'

const router = useRouter()
const store = useJobCardsStore()
const adminStore = useAdminStore()
const { jobCards, loading } = storeToRefs(store)
const { jobCategories, appSettings } = storeToRefs(adminStore)
const { claims } = useSession()
const { resolveJobCategoryName } = useReferenceResolver()

const selectedCategoryId = ref<string>('all')
const searchQuery = ref('')
const isExporting = ref(false)

// Admin Deletion State
const { isSuperAdmin } = useSession()
const isAdminDeleteOpen = ref(false)
const selectedJobForAdminDelete = ref<any>(null)

const filteredJobs = computed(() => {
  let filtered = jobCards.value

  if (selectedCategoryId.value !== 'all') {
    filtered = filtered.filter(job => job.generalInfo?.jobCategoryId === selectedCategoryId.value)
  }

  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    filtered = filtered.filter(job => {
      const jn = (job.generalInfo?.jobNumber || job.id).toLowerCase()
      const cust = (job.generalInfo?.recipientName || '').toLowerCase()
      const cat = resolveJobCategoryName(job.generalInfo?.jobCategoryId).toLowerCase()
      return jn.includes(q) || cust.includes(q) || cat.includes(q)
    })
  }

  return filtered
})

const isAdmin = computed(() => {
  const roles = claims.value?.roles || []
  return roles.includes('SUPER_ADMIN') || roles.includes('ADMIN')
})

const userCache = ref<Record<string, string>>({})

const getUserName = (job: any) => {
  if (job.submittedBy?.name) return job.submittedBy.name
  if (!job.submittedBy?.uid) return '---'
  const uid = job.submittedBy.uid
  if (userCache.value[uid]) return userCache.value[uid]

  // Fetch if not cached
  userCache.value[uid] = 'Loading...'
  getDoc(doc(db, 'users', uid)).then(userSnap => {
    if (userSnap.exists()) {
      const data = userSnap.data()
      userCache.value[uid] = data.displayName || data.email || uid
    } else {
      userCache.value[uid] = 'Unknown User'
    }
  }).catch(() => {
    userCache.value[uid] = 'Unknown User'
  })

  return 'Loading...'
}

const getSafeGrandTotal = (job: any) => {
  // Prioritize CRM and Manual Invoice Values based on JobCardDetail logic
  if (job.generalInfo?.linkedCrmTotal != null && job.generalInfo.linkedCrmTotal > 0) {
    return job.generalInfo.linkedCrmTotal
  }
  if (job.generalInfo?.jobInvoiceValue != null && job.generalInfo.jobInvoiceValue > 0) {
    return job.generalInfo.jobInvoiceValue
  }

  // Fallback calculations for backwards compatibility on very old jobs
  const totals = job.totals || {}
  const summary = job.summary || {}

  // Use locked implementation cost if job is approved, otherwise use calculated
  const isApproved = ['APPROVED_MANAGER', 'COMPLETED'].includes(job.status)
  const lockedImplementationCost = job.lockedImplementationCost
  
  const inventoryIRDTotal = totals.inventoryIRDTotal ?? summary.inventoryIRDTotal ?? 0
  const inventoryMUTotal = totals.inventoryMUTotal ?? summary.inventoryMUTotal ?? 0
  const implementationCost = isApproved && lockedImplementationCost != null 
    ? lockedImplementationCost 
    : (totals.implementationCost ?? summary.implementationCost ?? totals.inventoryIMPCostTotal ?? summary.inventoryIMPCostTotal ?? 0)

  const computedGrandTotal = inventoryIRDTotal + inventoryMUTotal + implementationCost
  return totals.grandTotal ?? summary.grandTotal ?? totals.overallGrandTotal ?? computedGrandTotal
}

const getAmountDue = (job: any) => {
  const invoiceValue = getSafeGrandTotal(job)
  const paid = job.totalPaid || 0
  return Math.max(0, invoiceValue - paid)
}

const cumulativeTotals = computed(() => {
  let invoiceTotal = 0
  let amountDueTotal = 0
  
  filteredJobs.value.forEach(job => {
    if (job.status && job.status.toUpperCase() === 'SUBMITTED') {
      return
    }
    invoiceTotal += getSafeGrandTotal(job)
    amountDueTotal += getAmountDue(job)
  })
  
  const collectedTotal = Math.max(0, invoiceTotal - amountDueTotal)
  
  return {
    invoiceTotal,
    amountDueTotal,
    collectedTotal
  }
})

const runBackfill = async () => {
  const { collection, getDocs, doc, writeBatch } = await import('firebase/firestore')
  toast.loading('Running historical payments backfill...', { id: 'backfill' })
  try {
    const paymentsSnap = await getDocs(collection(db, 'jobPayments'))
    const paymentsGrouped: Record<string, number> = {}
    
    paymentsSnap.forEach(d => {
      const p = d.data()
      if (p.jobCardId) {
        paymentsGrouped[p.jobCardId] = (paymentsGrouped[p.jobCardId] || 0) + (Number(p.amount) || 0)
      }
    })
    
    const jobsSnap = await getDocs(collection(db, 'jobCards'))
    const batch = writeBatch(db)
    
    jobsSnap.forEach(d => {
      const jId = d.id
      const totalPaid = paymentsGrouped[jId] || 0
      batch.update(doc(db, 'jobCards', jId), { totalPaid })
    })
    
    await batch.commit()
    toast.success('Historical payments backfill complete!', { id: 'backfill' })
    store.fetchJobCards()
  } catch (err: any) {
    console.error('Backfill failed:', err)
    toast.error('Backfill failed: ' + err.message, { id: 'backfill' })
  }
}

const handleExportCsv = async () => {
  isExporting.value = true
  toast.loading('Generating Detailed Report...', { id: 'csv-export' })
  try {
    await exportDetailedJobCardsCsv(filteredJobs.value, resolveJobCategoryName, (id: string) => id)
    toast.success('Report Downloaded Successfully!', { id: 'csv-export' })
  } catch (err: any) {
    console.error('Export Error:', err)
    toast.error('Export Failed', { id: 'csv-export', description: err.message })
  } finally {
    isExporting.value = false
  }
}

const handleExportPdf = async () => {
  isExporting.value = true
  toast.loading('Generating PDF Report...', { id: 'pdf-export' })
  try {
    const jobsWithCategoryNames = filteredJobs.value.map(job => ({
      ...job,
      generalInfo: {
        ...job.generalInfo,
        categoryName: resolveJobCategoryName(job.generalInfo?.jobCategoryId)
      }
    }))
    
    const selectedCategoryName = selectedCategoryId.value === 'all'
      ? 'All Categories'
      : resolveJobCategoryName(selectedCategoryId.value)

    const { user } = useSession()

    await generateJobCardsReportPdf(
      jobsWithCategoryNames,
      searchQuery.value,
      selectedCategoryName,
      adminStore.appSettings,
      user.value?.displayName || user.value?.email || 'System User'
    )
    toast.success('PDF Report Downloaded Successfully!', { id: 'pdf-export' })
  } catch (err: any) {
    console.error('PDF Export Error:', err)
    toast.error('PDF Export Failed', { id: 'pdf-export', description: err.message })
  } finally {
    isExporting.value = false
  }
}

const isDeleting = ref<string | null>(null)
const handleDeleteJob = async (job: any) => {
  if (!['DRAFT', 'SUBMITTED', 'APPROVAL_PENDING_ACCOUNTANT', 'APPROVAL_PENDING_MANAGER'].includes(job.status)) {
    toast.error('Deletion Blocked', { description: 'Approved Job Cards cannot be structurally deleted.' })
    return
  }

  const confirmed = confirm(`Are you SURE you want to permanently delete Job Card ${job.generalInfo?.jobNumber || job.id.substring(0, 8)}? This action CANNOT be undone.`)
  if (!confirmed) return

  isDeleting.value = job.id
  toast.loading('Deleting Job Card & records...', { id: 'delete-jc' })
  try {
    await store.deleteJobCardCascade(job.id, job.status)
    toast.success('Job Card Deleted Successfully', { id: 'delete-jc' })
  } catch (err: any) {
    toast.error('Deletion Failed', { id: 'delete-jc', description: err.message })
  } finally {
    isDeleting.value = null
  }
}

const openAdminDelete = (job: any) => {
  selectedJobForAdminDelete.value = job
  isAdminDeleteOpen.value = true
}

const handleAdminDeleteConfirm = async () => {
    if (!selectedJobForAdminDelete.value) return
    
    const job = selectedJobForAdminDelete.value
    isAdminDeleteOpen.value = false
    
    isDeleting.value = job.id
    toast.loading('ADMIN: Force deleting job card...', { id: 'admin-delete' })
    try {
        await store.deleteJobCardCascade(job.id, job.status, true)
        toast.success('Admin: Job Card Deleted Successfully', { id: 'admin-delete' })
    } catch (err: any) {
        toast.error('Admin Delete Failed', { id: 'admin-delete', description: err.message })
    } finally {
        isDeleting.value = null
        selectedJobForAdminDelete.value = null
    }
}

onMounted(() => {
  adminStore.fetchAll()
  store.fetchJobCards()
})

onUnmounted(() => {
  store.cleanup()
})

const getStatusVariant = (status: string) => {
  switch (status) {
    case 'APPROVED_MANAGER':
    case 'COMPLETED': return 'bg-brand-primary text-white hover:bg-brand-primary/80'
    case 'APPROVAL_PENDING_ACCOUNTANT':
    case 'APPROVAL_PENDING_MANAGER': return 'bg-brand-secondary text-white hover:bg-brand-secondary/80'
    case 'REJECTED': return 'bg-destructive text-destructive-foreground hover:bg-destructive/80'
    case 'SUBMITTED':
    case 'APPROVED_ACCOUNTANT': return 'bg-blue-500 text-white hover:bg-blue-500/80'
    case 'DRAFT':
    default: return 'bg-muted text-muted-foreground'
  }
}

</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
      <div class="w-full lg:w-auto">
        <h2 class="text-2xl md:text-3xl font-bold tracking-tight">Job Cards</h2>
        <p class="text-sm md:text-base text-muted-foreground">Manage and track your service job cards.</p>
      </div>
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto">
        <div class="relative flex-1 sm:w-[250px] lg:w-[300px]">
          <Search class="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input v-model="searchQuery" placeholder="Search..."
            class="pl-9 h-10 lg:h-9 bg-card border-brand-primary/30 focus-visible:ring-brand-primary/50" />
        </div>

        <div class="flex items-center gap-2">
          <Select v-model="selectedCategoryId">
            <SelectTrigger class="flex-1 sm:w-[160px] lg:w-[200px] h-10 lg:h-9 bg-card border-brand-primary/30">
              <Filter class="mr-2 size-4 text-muted-foreground" />
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem v-for="cat in jobCategories" :key="cat.id" :value="cat.id">
                {{ cat.name }}
              </SelectItem>
            </SelectContent>
          </Select>

          <!-- Premium Export Dropdown Menu -->
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <div>
                <!-- Mobile button (icon only) -->
                <Button variant="outline" size="icon" :disabled="isExporting" class="h-10 w-10 lg:h-9 lg:w-9 shrink-0 sm:hidden">
                  <Download v-if="!isExporting" class="size-4" />
                  <Loader2 v-else class="size-4 animate-spin" />
                </Button>
                
                <!-- Desktop button (with text) -->
                <Button variant="outline" size="sm" :disabled="isExporting" class="hidden sm:flex h-10 lg:h-9 items-center gap-1.5">
                  <template v-if="!isExporting">
                    <Download class="size-4" />
                    <span>Export</span>
                    <ChevronDown class="size-3.5 opacity-60 ml-0.5" />
                  </template>
                  <template v-else>
                    <Loader2 class="size-4 animate-spin" />
                    <span>...</span>
                  </template>
                </Button>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-44 bg-card border-brand-primary/30">
              <DropdownMenuItem @click="handleExportCsv" class="cursor-pointer hover:bg-brand-primary/10">
                <FileText class="mr-2 size-4 text-muted-foreground" />
                <span>Export as CSV</span>
              </DropdownMenuItem>
              <DropdownMenuItem @click="handleExportPdf" class="cursor-pointer hover:bg-brand-primary/10 font-medium">
                <FileText class="mr-2 size-4 text-brand-primary" :style="{ color: appSettings?.uiColors?.brandPrimaryColor || '#79c21b' }" />
                <span>Export as PDF</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Button size="sm"
          :style="{ backgroundColor: appSettings?.uiColors?.brandSecondaryColor || '#ff8903', borderColor: appSettings?.uiColors?.brandSecondaryColor || '#ff8903' }"
          class="h-12 sm:h-10 lg:h-9 hover:opacity-90 text-white font-bold" @click="router.push('/job-cards/new')">
          <Plus class="mr-2 size-5 sm:size-4" />
          Add Job Card
        </Button>
      </div>
    </div>

    <!-- Cumulative Financial Summary Strip -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4" v-if="!loading && filteredJobs.length > 0">
      <Card class="bg-brand-primary/5 border-brand-primary/20 shadow-md">
        <CardContent class="p-4 flex items-center justify-between">
          <div class="space-y-1">
            <p class="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total Invoice Value</p>
            <h3 class="text-2xl font-black tracking-tight" :style="{ color: appSettings?.uiColors?.brandPrimaryColor || '#79c21b' }">
              ${{ cumulativeTotals.invoiceTotal.toLocaleString(undefined, { minimumFractionDigits: 2 }) }}
            </h3>
          </div>
          <div class="p-3 bg-brand-primary/10 rounded-full">
            <FileText class="size-6 text-brand-primary" :style="{ color: appSettings?.uiColors?.brandPrimaryColor || '#79c21b' }" />
          </div>
        </CardContent>
      </Card>

      <Card class="bg-emerald-500/5 border-emerald-500/20 shadow-md">
        <CardContent class="p-4 flex items-center justify-between">
          <div class="space-y-1">
            <p class="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total Payments Collected</p>
            <h3 class="text-2xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
              ${{ cumulativeTotals.collectedTotal.toLocaleString(undefined, { minimumFractionDigits: 2 }) }}
            </h3>
          </div>
          <div class="p-3 bg-emerald-500/10 rounded-full">
            <CheckCircle2 class="size-6 text-emerald-500" />
          </div>
        </CardContent>
      </Card>

      <Card class="bg-amber-500/5 border-amber-500/20 shadow-md">
        <CardContent class="p-4 flex items-center justify-between">
          <div class="space-y-1">
            <p class="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total Outstanding Balance</p>
            <h3 class="text-2xl font-black text-amber-600 dark:text-amber-500 tracking-tight">
              ${{ cumulativeTotals.amountDueTotal.toLocaleString(undefined, { minimumFractionDigits: 2 }) }}
            </h3>
          </div>
          <div class="p-3 bg-amber-500/10 rounded-full">
            <AlertCircle class="size-6 text-amber-500" />
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Desktop View (Table) -->
    <Card
      class="hidden md:block bg-brand-primary/5 dark:bg-brand-primary/10 backdrop-blur-md border-brand-primary/20 dark:border-brand-primary/30 shadow-lg text-foreground dark:text-white overflow-hidden">
      <CardContent class="p-0">
        <div class="overflow-x-auto">
          <Table class="min-w-[900px]">
            <TableHeader>
              <TableRow class="border-b hover:bg-transparent" :style="{ borderColor: 'var(--job-cards-grid-border)' }">
                <TableHead class="w-[150px] text-[11px] font-bold uppercase tracking-wider"
                  :style="{ backgroundColor: 'var(--job-cards-grid-header-bg)', color: 'var(--job-cards-grid-header-text)' }">
                  Job Number</TableHead>
                <TableHead class="text-[11px] font-bold uppercase tracking-wider"
                  :style="{ backgroundColor: 'var(--job-cards-grid-header-bg)', color: 'var(--job-cards-grid-header-text)' }">
                  Customer</TableHead>
                <TableHead class="text-[11px] font-bold uppercase tracking-wider"
                  :style="{ backgroundColor: 'var(--job-cards-grid-header-bg)', color: 'var(--job-cards-grid-header-text)' }">
                  Category</TableHead>
                <TableHead class="text-[11px] font-bold uppercase tracking-wider"
                  :style="{ backgroundColor: 'var(--job-cards-grid-header-bg)', color: 'var(--job-cards-grid-header-text)' }">
                  Dimensions</TableHead>
                <TableHead class="text-[11px] font-bold uppercase tracking-wider"
                  :style="{ backgroundColor: 'var(--job-cards-grid-header-bg)', color: 'var(--job-cards-grid-header-text)' }">
                  Sales Rep</TableHead>
                <TableHead class="text-[11px] font-bold uppercase tracking-wider"
                  :style="{ backgroundColor: 'var(--job-cards-grid-header-bg)', color: 'var(--job-cards-grid-header-text)' }">
                  Status</TableHead>
                <TableHead class="text-[11px] font-bold uppercase tracking-wider"
                  :style="{ backgroundColor: 'var(--job-cards-grid-header-bg)', color: 'var(--job-cards-grid-header-text)' }">
                  Invoice Value</TableHead>
                <TableHead class="text-[11px] font-bold uppercase tracking-wider"
                  :style="{ backgroundColor: 'var(--job-cards-grid-header-bg)', color: 'var(--job-cards-grid-header-text)' }">
                  Amount Due</TableHead>
                <TableHead class="text-right text-[11px] font-bold uppercase tracking-wider"
                  :style="{ backgroundColor: 'var(--job-cards-grid-header-bg)', color: 'var(--job-cards-grid-header-text)' }">
                  Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="job in filteredJobs" :key="job.id"
                class="cursor-pointer border-b text-[13px] transition-colors duration-200"
                :style="{ borderColor: 'var(--job-cards-grid-border)' }"
                :class="'hover:bg-brand-primary/5 dark:hover:bg-brand-primary/10'"
                @click="router.push(`/job-cards/${job.id}`)">
                <TableCell class="font-semibold py-4 px-4 text-foreground dark:text-white">
                  <span class="px-3 py-1.5 rounded-md border text-brand-primary shadow-sm font-bold"
                    :style="{ backgroundColor: (appSettings?.uiColors?.brandPrimaryColor || '#79c21b') + '15', borderColor: (appSettings?.uiColors?.brandPrimaryColor || '#79c21b') + '30' }">
                    {{ job.generalInfo?.jobNumber || job.id.substring(0, 8) }}
                  </span>
                </TableCell>
                <TableCell class="text-foreground/90 dark:text-white/90">{{ job.generalInfo?.recipientName || '---' }}
                </TableCell>
                <TableCell class="text-foreground/90 dark:text-white/90">{{
                  resolveJobCategoryName(job.generalInfo?.jobCategoryId) }}</TableCell>
                <TableCell class="text-foreground/90 dark:text-white/90">{{ job.generalInfo?.dimensionsOfStructure ||
                  '---'
                }}</TableCell>
                <TableCell class="text-foreground/90 dark:text-white/90">{{ getUserName(job) }}</TableCell>
                <TableCell>
                  <Badge
                    :class="[getStatusVariant(job.status), 'font-bold text-[10px] px-2 py-0.5 border-none shadow-sm']">
                    {{ job.status.replace(/_/g, ' ') }}
                  </Badge>
                </TableCell>
                <TableCell class="tabular-nums font-bold text-brand-primary text-base"
                  :style="{ color: appSettings?.uiColors?.brandPrimaryColor || '#79c21b' }">${{
                    getSafeGrandTotal(job).toLocaleString(undefined, {
                      minimumFractionDigits: 2
                    }) }}</TableCell>
                <TableCell class="tabular-nums font-semibold">
                  <span v-if="getAmountDue(job) <= 0" class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 dark:border-emerald-500/30">
                    Fully Paid
                  </span>
                  <span v-else class="text-amber-600 dark:text-amber-500 font-bold">
                    ${{ getAmountDue(job).toLocaleString(undefined, { minimumFractionDigits: 2 }) }}
                  </span>
                </TableCell>
                <TableCell class="text-right" @click.stop>
                  <DropdownMenu>
                    <DropdownMenuTrigger as-child>
                      <Button variant="ghost" size="icon"
                        class="text-foreground/70 dark:text-white/70 hover:text-foreground dark:hover:text-white hover:bg-brand-primary/10">
                        <MoreHorizontal class="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem @click="router.push(`/job-cards/${job.id}`)">
                        <Eye class="mr-2 size-4" />
                        View Details
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        v-if="['DRAFT', 'SUBMITTED', 'APPROVAL_PENDING_ACCOUNTANT', 'APPROVAL_PENDING_MANAGER'].includes(job.status)"
                        @click="handleDeleteJob(job)" class="text-destructive font-medium"
                        :disabled="isDeleting === job.id">
                        <Loader2 v-if="isDeleting === job.id" class="mr-2 size-4 animate-spin" />
                        <Trash2 v-else class="mr-2 size-4" />
                        Delete Job Card
                      </DropdownMenuItem>
                      <DropdownMenuItem v-if="isAdmin" class="text-orange-600 font-medium">
                        Cancel Job
                      </DropdownMenuItem>
                      <DropdownMenuItem v-if="isSuperAdmin" @click="openAdminDelete(job)" class="text-destructive font-bold bg-destructive/5">
                        <Trash2 class="mr-2 size-4" />
                        Force Delete (Admin)
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>

    <!-- Mobile View (Cards) -->
    <div class="md:hidden space-y-4">
      <div v-if="loading && filteredJobs.length === 0" class="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Loader2 class="size-8 animate-spin mb-2" />
        <p>Loading your job cards...</p>
      </div>
      
      <div v-else-if="filteredJobs.length === 0" class="text-center py-12 border rounded-lg bg-card text-muted-foreground">
        <Filter class="size-12 mx-auto mb-2 opacity-20" />
        <p>No job cards match your search.</p>
      </div>

      <div v-for="job in filteredJobs" :key="job.id" 
           @click="router.push(`/job-cards/${job.id}`)"
           class="group relative bg-card border border-brand-primary/10 rounded-xl overflow-hidden shadow-sm active:scale-[0.98] transition-all">
        <div class="p-4 space-y-3">
          <!-- Card Header: Job # and Status -->
          <div class="flex items-start justify-between">
            <div class="space-y-1">
              <span class="text-xs font-bold text-muted-foreground uppercase tracking-wider">Job Number</span>
              <div class="text-base font-black text-brand-primary flex items-center gap-2">
                {{ job.generalInfo?.jobNumber || job.id.substring(0, 8) }}
                <div v-if="['APPROVED_MANAGER', 'COMPLETED'].includes(job.status)" class="size-1.5 rounded-full bg-brand-primary animate-pulse"></div>
              </div>
            </div>
            <Badge :class="[getStatusVariant(job.status), 'font-black text-[9px] px-2 py-0.5 border-none uppercase tracking-tighter']">
              {{ job.status.replace(/_/g, ' ') }}
            </Badge>
          </div>

          <!-- Card Body: Customer & Category -->
          <div class="grid grid-cols-2 gap-4 pt-1">
            <div class="space-y-1">
              <span class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Customer</span>
              <p class="text-sm font-semibold truncate">{{ job.generalInfo?.recipientName || '---' }}</p>
            </div>
            <div class="space-y-1">
              <span class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Category</span>
              <p class="text-sm font-medium truncate">{{ resolveJobCategoryName(job.generalInfo?.jobCategoryId) }}</p>
            </div>
          </div>

          <!-- Card Footer: Amount and Actions -->
          <div class="flex items-center justify-between pt-3 border-t border-brand-primary/5">
            <div class="flex items-center gap-6">
              <div class="space-y-0.5">
                 <span class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Invoice Value</span>
                 <p class="text-sm font-black text-brand-primary" :style="{ color: appSettings?.uiColors?.brandPrimaryColor || '#79c21b' }">
                    ${{ getSafeGrandTotal(job).toLocaleString(undefined, { minimumFractionDigits: 2 }) }}
                 </p>
              </div>
              <div class="space-y-0.5">
                 <span class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Amount Due</span>
                 <p class="text-sm font-black">
                    <span v-if="getAmountDue(job) <= 0" class="text-[9px] font-bold bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20 dark:border-emerald-500/30">
                      Paid
                    </span>
                    <span v-else class="text-amber-600 dark:text-amber-500">
                      ${{ getAmountDue(job).toLocaleString(undefined, { minimumFractionDigits: 2 }) }}
                    </span>
                 </p>
              </div>
            </div>
            
            <DropdownMenu>
              <DropdownMenuTrigger as-child @click.stop>
                <Button variant="secondary" size="icon" class="rounded-full h-10 w-10 bg-brand-primary/5 border-none">
                  <MoreHorizontal class="size-5 text-brand-primary" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" class="w-48">
                <DropdownMenuItem @click="router.push(`/job-cards/${job.id}`)">
                  <Eye class="mr-2 size-4" /> View Details
                </DropdownMenuItem>
                <DropdownMenuItem
                  v-if="['DRAFT', 'SUBMITTED', 'APPROVAL_PENDING_ACCOUNTANT', 'APPROVAL_PENDING_MANAGER'].includes(job.status)"
                  @click="handleDeleteJob(job)" class="text-destructive font-bold">
                  <Trash2 class="mr-2 size-4" /> Delete Job Card
                </DropdownMenuItem>
                <DropdownMenuItem
                  v-if="isSuperAdmin"
                  @click="openAdminDelete(job)" class="text-destructive font-bold bg-destructive/5">
                  <Trash2 class="mr-2 size-4" /> Force Delete (Admin)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>

    <!-- Admin Confirmation Dialog -->
    <AdminDeleteDialog
        v-if="selectedJobForAdminDelete"
        v-model:open="isAdminDeleteOpen"
        title="Admin Force Delete"
        :description="`You are about to PERMANENTLY delete Job Card ${selectedJobForAdminDelete.generalInfo?.jobNumber || selectedJobForAdminDelete.id}. This will bypass all safety checks and clean up linked items.`"
        :target-id="selectedJobForAdminDelete.generalInfo?.jobNumber || selectedJobForAdminDelete.id"
        :loading="isDeleting === selectedJobForAdminDelete.id"
        @confirm="handleAdminDeleteConfirm"
    />
  </div>
</template>
