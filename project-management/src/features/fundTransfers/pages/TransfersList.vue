<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Wallet, CheckCheck, X, PenLine, Trash2, Ban } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useFinanceStore } from '../store/financeStore'
import { useAdminStore } from '@/features/admin/store/adminStore'
import { useSession } from '@/composables/useSession'
import { toast } from 'vue-sonner'
import AdminDeleteDialog from '@/components/AdminDeleteDialog.vue'

const router = useRouter()
const store = useFinanceStore()
const adminStore = useAdminStore()
const { hasAnyRole, isSuperAdmin, user } = useSession()
const { appSettings } = storeToRefs(adminStore)
const { transfers, topUps } = storeToRefs(store)
const isProcessing = ref<string | null>(null)

// ── Pagination State: Transfers ───────────────────────────────────────────────
const transfersPage = ref(1)
const transfersPerPage = ref(20)

const paginatedTransfers = computed(() => {
  const start = (transfersPage.value - 1) * transfersPerPage.value
  const end = start + transfersPerPage.value
  return transfers.value.slice(start, end)
})

const totalTransfersPages = computed(() => {
  return Math.ceil(transfers.value.length / transfersPerPage.value) || 1
})

watch(transfers, () => {
  transfersPage.value = 1
})

// ── Pagination State: Top-Ups ──────────────────────────────────────────────────
const topUpsPage = ref(1)
const topUpsPerPage = ref(20)

const paginatedTopUps = computed(() => {
  const start = (topUpsPage.value - 1) * topUpsPerPage.value
  const end = start + topUpsPerPage.value
  return topUps.value.slice(start, end)
})

const totalTopUpsPages = computed(() => {
  return Math.ceil(topUps.value.length / topUpsPerPage.value) || 1
})

watch(topUps, () => {
  topUpsPage.value = 1
})

// Admin Deletion State
const isAdminDeleteOpen = ref(false)
const selectedItemForAdminDelete = ref<any>(null)
const adminDeleteType = ref<'TRANSFER' | 'TOPUP'>('TRANSFER')
const isDeleting = ref(false)

const isAccountant = computed(() => hasAnyRole(['ACCOUNTANT', 'SUPER_ADMIN', 'ADMIN']))
const isManager = computed(() => hasAnyRole(['MANAGER', 'SUPER_ADMIN']))

function currentUser() {
  return { name: user.value?.displayName || '', email: user.value?.email || '' }
}

// ── Transfers ──────────────────────────────────────────────────────────────

const handleAccountantInitial = async (id: string) => {
  isProcessing.value = id
  try {
    await store.accountantInitialTransfer(id, currentUser())
    toast.success('Transfer initialed', { description: 'Sent to manager for approval.' })
  } catch (err: any) {
    toast.error('Failed to initial', { description: err.message })
  } finally { isProcessing.value = null }
}

const handleApprove = async (id: string) => {
  isProcessing.value = id
  try {
    await store.approveTransfer(id, currentUser())
    toast.success('Transfer approved', { description: 'Funds have been moved.' })
  } catch (err: any) {
    toast.error('Approval failed', { description: err.message })
  } finally { isProcessing.value = null }
}

const handleReject = async (id: string) => {
  isProcessing.value = id
  try {
    await store.rejectTransfer(id, currentUser())
    toast.info('Transfer rejected.')
  } catch (err: any) {
    toast.error('Failed to reject', { description: err.message })
  } finally { isProcessing.value = null }
}

const handleCancel = async (id: string) => {
  const confirmCancel = confirm('Are you sure you want to cancel this transfer?')
  if (!confirmCancel) return

  isProcessing.value = id
  try {
    await store.cancelTransfer(id, currentUser())
    toast.success('Transfer cancelled.')
  } catch (err: any) {
    toast.error('Failed to cancel', { description: err.message })
  } finally { isProcessing.value = null }
}

// ── Top-Ups ────────────────────────────────────────────────────────────────

const handleTopUpAccountantInitial = async (id: string) => {
  isProcessing.value = id
  try {
    await store.accountantInitialTopUp(id, currentUser())
    toast.success('Top-up initialed', { description: 'Sent to manager for approval.' })
  } catch (err: any) {
    toast.error('Failed to initial', { description: err.message })
  } finally { isProcessing.value = null }
}

const handleApproveTopUp = async (id: string) => {
  isProcessing.value = id
  try {
    await store.approveTopUp(id, currentUser())
    toast.success('Top-up approved', { description: 'Account balance has been updated.' })
  } catch (err: any) {
    toast.error('Approval failed', { description: err.message })
  } finally { isProcessing.value = null }
}

const handleRejectTopUp = async (id: string) => {
  isProcessing.value = id
  try {
    await store.rejectTopUp(id, currentUser())
    toast.info('Top-up rejected.')
  } catch (err: any) {
    toast.error('Failed to reject', { description: err.message })
  } finally { isProcessing.value = null }
}

onMounted(() => { store.fetchTransfers(); store.fetchTopUps() })
onUnmounted(() => { store.cleanup() })

function statusLabel(status: string) {
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

function statusStyle(status: string) {
  switch (status) {
    case 'PENDING_ACCOUNTANT': return 'background:#ff8903;color:#fff'
    case 'PENDING_MANAGER':
    case 'PENDING':
    case 'PENDING_APPROVAL': return 'background:#eab308;color:#fff'
    case 'COMPLETED': return 'background:#22c55e;color:#fff'
    case 'REJECTED': return 'background:#ef4444;color:#fff'
    case 'CANCELLED': return 'background:#6b7280;color:#fff'
    default: return 'background:#6b7280;color:#fff'
  }
}

const openAdminDelete = (item: any, type: 'TRANSFER' | 'TOPUP') => {
  selectedItemForAdminDelete.value = item
  adminDeleteType.value = type
  isAdminDeleteOpen.value = true
}

const handleAdminDeleteConfirm = async () => {
    if (!selectedItemForAdminDelete.value) return
    
    const item = selectedItemForAdminDelete.value
    isAdminDeleteOpen.value = false
    isDeleting.value = true
    
    const label = adminDeleteType.value === 'TRANSFER' ? 'transfer' : 'top-up'
    toast.loading(`ADMIN: Force deleting ${label}...`, { id: 'admin-delete' })
    
    try {
        if (adminDeleteType.value === 'TRANSFER') {
            await store.deleteTransfer(item.id)
        } else {
            await store.deleteTopUp(item.id)
        }
        toast.success(`Admin: Deleted ${label} successfully`, { id: 'admin-delete' })
    } catch (err: any) {
        toast.error('Admin Delete Failed', { id: 'admin-delete', description: err.message })
    } finally {
        isDeleting.value = false
        selectedItemForAdminDelete.value = null
    }
}
</script>

<template>
  <div class="space-y-6">

    <!-- Header -->
    <div class="flex justify-between items-center">
      <div>
        <h2 class="text-3xl font-bold tracking-tight">Fund Transfers</h2>
        <p class="text-muted-foreground">Manage and track internal fund movements.</p>
      </div>
      <div class="flex gap-2">
        <Button
          :style="{ backgroundColor: appSettings?.uiColors?.brandSecondaryColor || '#ff8903' }"
          class="hover:opacity-90 text-white border-none shadow-lg"
          @click="router.push('/ledger/top-up')">
          <Wallet class="mr-2 size-4" />Top Up Request
        </Button>
        <Button
          :style="{ backgroundColor: appSettings?.uiColors?.brandPrimaryColor || '#79c21b' }"
          class="hover:opacity-90 text-white border-none shadow-lg"
          @click="router.push('/transfers/new')">
          <Plus class="mr-2 size-4" />New Transfer
        </Button>
      </div>
    </div>

    <!-- Approval flow indicator -->
    <div class="flex items-center gap-3 text-xs text-muted-foreground bg-muted/30 border border-muted/40 rounded-lg px-4 py-2.5 w-fit">
      <span class="flex items-center gap-1.5 font-semibold text-foreground/70">
        <span class="h-2 w-2 rounded-full bg-orange-500 inline-block"></span>Accountant Initials
      </span>
      <span class="opacity-40">&rarr;</span>
      <span class="flex items-center gap-1.5 font-semibold text-foreground/70">
        <span class="h-2 w-2 rounded-full bg-yellow-500 inline-block"></span>Manager Approves
      </span>
      <span class="opacity-40">&rarr;</span>
      <span class="flex items-center gap-1.5 font-semibold text-foreground/70">
        <span class="h-2 w-2 rounded-full bg-green-500 inline-block"></span>Recorded in Ledger
      </span>
    </div>

    <!-- Fund Transfers Table -->
    <Card class="bg-brand-primary/5 dark:bg-brand-primary/10 backdrop-blur-md border-brand-primary/20 shadow-lg overflow-hidden">
      <CardContent class="p-0">
        <Table>
          <TableHeader>
            <TableRow class="border-b hover:bg-transparent" :style="{ borderColor: 'var(--grid-border)' }">
              <TableHead class="text-[11px] font-bold uppercase tracking-wider" :style="{ color: 'var(--grid-header-text)' }">Date</TableHead>
              <TableHead class="text-[11px] font-bold uppercase tracking-wider" :style="{ color: 'var(--grid-header-text)' }">Initiated By</TableHead>
              <TableHead class="text-[11px] font-bold uppercase tracking-wider" :style="{ color: 'var(--grid-header-text)' }">From</TableHead>
              <TableHead class="text-[11px] font-bold uppercase tracking-wider" :style="{ color: 'var(--grid-header-text)' }">To</TableHead>
              <TableHead class="text-[11px] font-bold uppercase tracking-wider" :style="{ color: 'var(--grid-header-text)' }">Status</TableHead>
              <TableHead class="text-[11px] font-bold uppercase tracking-wider" :style="{ color: 'var(--grid-header-text)' }">Reference</TableHead>
              <TableHead class="text-right text-[11px] font-bold uppercase tracking-wider" :style="{ color: 'var(--grid-header-text)' }">Amount</TableHead>
              <TableHead class="w-[160px]" :style="{ color: 'var(--grid-header-text)' }"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="tr in paginatedTransfers" :key="tr.id"
              class="border-b transition-colors hover:bg-brand-primary/5 dark:hover:bg-brand-primary/10"
              :style="{ borderColor: 'var(--grid-border)' }">
              <TableCell class="text-muted-foreground text-xs py-4">{{ tr.date }}</TableCell>
              <TableCell class="text-[11px] opacity-70">{{ tr.initiatedBy || '—' }}</TableCell>
              <TableCell>
                <Badge class="font-bold text-[10px] uppercase shadow-sm"
                  :style="{ backgroundColor: (appSettings?.uiColors?.brandSecondaryColor || '#ff8903') + '20', color: appSettings?.uiColors?.brandSecondaryColor || '#ff8903' }">
                  {{ tr.fromAccount?.toUpperCase() }}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge class="font-bold text-[10px] uppercase shadow-sm"
                  :style="{ backgroundColor: (appSettings?.uiColors?.brandPrimaryColor || '#79c21b') + '20', color: appSettings?.uiColors?.brandPrimaryColor || '#79c21b' }">
                  {{ tr.toAccount?.toUpperCase() }}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge class="font-bold text-[10px] uppercase border-none shadow-sm" :style="statusStyle(tr.status)">
                  {{ statusLabel(tr.status) }}
                </Badge>
              </TableCell>
              <TableCell class="text-[11px] text-muted-foreground italic">{{ tr.reference }}</TableCell>
              <TableCell class="text-right font-bold text-base tabular-nums">
                ${{ Number(tr.amount).toLocaleString(undefined, { minimumFractionDigits: 2 }) }}
              </TableCell>
              <TableCell class="text-right py-3">
                <div class="flex items-center justify-end gap-1.5">
                  <!-- Accountant initial button -->
                  <Button
                    v-if="tr.status === 'PENDING_ACCOUNTANT' && isAccountant"
                    size="sm"
                    :style="{ backgroundColor: appSettings?.uiColors?.brandSecondaryColor || '#ff8903' }"
                    class="text-white hover:opacity-90 border-none h-7 px-2.5 text-[11px]"
                    :disabled="isProcessing === tr.id"
                    @click="handleAccountantInitial(tr.id)">
                    <PenLine class="size-3 mr-1" />{{ isProcessing === tr.id ? '...' : 'Initial' }}
                  </Button>
                  <!-- Manager approve button -->
                  <Button
                    v-if="(tr.status === 'PENDING_MANAGER' || tr.status === 'PENDING' || tr.status === 'PENDING_APPROVAL') && isManager"
                    size="sm"
                    :style="{ backgroundColor: appSettings?.uiColors?.brandPrimaryColor || '#79c21b' }"
                    class="text-white hover:opacity-90 border-none h-7 px-2.5 text-[11px]"
                    :disabled="isProcessing === tr.id"
                    @click="handleApprove(tr.id)">
                    <CheckCheck class="size-3 mr-1" />{{ isProcessing === tr.id ? '...' : 'Approve' }}
                  </Button>
                  <!-- Manager reject button -->
                  <Button
                    v-if="(tr.status === 'PENDING_ACCOUNTANT' || tr.status === 'PENDING_MANAGER' || tr.status === 'PENDING' || tr.status === 'PENDING_APPROVAL') && isManager"
                    size="sm" variant="ghost"
                    title="Reject"
                    class="h-7 w-7 p-0 text-red-500 hover:bg-red-500/10 hover:text-red-500"
                    :disabled="isProcessing === tr.id"
                    @click="handleReject(tr.id)">
                    <X class="size-3.5" />
                  </Button>
                  <!-- Cancel button -->
                  <Button
                    v-if="(tr.status === 'PENDING_ACCOUNTANT' || tr.status === 'PENDING_MANAGER' || tr.status === 'PENDING' || tr.status === 'PENDING_APPROVAL') && (isAccountant || tr.initiatedByEmail === user?.email)"
                    size="sm" variant="ghost"
                    title="Cancel"
                    class="h-7 w-7 p-0 text-gray-500 hover:bg-gray-500/10 hover:text-gray-600"
                    :disabled="isProcessing === tr.id"
                    @click="handleCancel(tr.id)">
                    <Ban class="size-3.5" />
                  </Button>
                  <!-- Admin Force Delete -->
                  <Button v-if="isSuperAdmin" variant="ghost" size="icon" title="Force Delete (Admin)"
                      class="h-7 w-7 text-destructive hover:bg-destructive/10 border border-destructive/20 ml-1"
                      @click="openAdminDelete(tr, 'TRANSFER')">
                      <Trash2 v-if="!isDeleting || selectedItemForAdminDelete?.id !== tr.id" class="size-3.5" />
                      <span v-else class="size-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
            <TableRow v-if="transfers.length === 0">
              <TableCell colspan="8" class="text-center py-10 text-muted-foreground italic">No transfers found.</TableCell>
            </TableRow>
          </TableBody>
        </Table>

        <!-- Transfers Pagination Footer -->
        <div class="flex items-center justify-between px-6 py-4 border-t border-brand-primary/15 flex-wrap gap-4 bg-black/10">
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
                class="bg-background border border-muted-foreground/30 rounded text-xs px-2 py-1.5 focus:ring-1 focus:ring-brand-primary focus:outline-none cursor-pointer text-foreground"
                @change="transfersPage = 1"
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
      </CardContent>
    </Card>

    <!-- Top-Up Requests -->
    <div class="pt-6">
      <div class="flex justify-between items-center mb-4">
        <div>
          <h2 class="text-3xl font-bold tracking-tight">Top-Up Requests</h2>
          <p class="text-muted-foreground">Approve external capital injections into accounts.</p>
        </div>
      </div>

      <Card class="bg-emerald-600/5 dark:bg-emerald-600/10 backdrop-blur-md border-emerald-600/20 shadow-lg overflow-hidden">
        <CardContent class="p-0">
          <Table>
            <TableHeader>
              <TableRow class="border-b hover:bg-transparent" :style="{ borderColor: 'var(--ledger-grid-border)' }">
                <TableHead class="text-[11px] font-bold uppercase tracking-wider" :style="{ backgroundColor: 'var(--ledger-grid-header-bg)', color: 'var(--ledger-grid-header-text)' }">Date</TableHead>
                <TableHead class="text-[11px] font-bold uppercase tracking-wider" :style="{ backgroundColor: 'var(--ledger-grid-header-bg)', color: 'var(--ledger-grid-header-text)' }">Account</TableHead>
                <TableHead class="text-[11px] font-bold uppercase tracking-wider" :style="{ backgroundColor: 'var(--ledger-grid-header-bg)', color: 'var(--ledger-grid-header-text)' }">Description</TableHead>
                <TableHead class="text-[11px] font-bold uppercase tracking-wider" :style="{ backgroundColor: 'var(--ledger-grid-header-bg)', color: 'var(--ledger-grid-header-text)' }">Requested By</TableHead>
                <TableHead class="text-[11px] font-bold uppercase tracking-wider" :style="{ backgroundColor: 'var(--ledger-grid-header-bg)', color: 'var(--ledger-grid-header-text)' }">Status</TableHead>
                <TableHead class="text-[11px] font-bold uppercase tracking-wider" :style="{ backgroundColor: 'var(--ledger-grid-header-bg)', color: 'var(--ledger-grid-header-text)' }">Reference</TableHead>
                <TableHead class="text-right text-[11px] font-bold uppercase tracking-wider" :style="{ backgroundColor: 'var(--ledger-grid-header-bg)', color: 'var(--ledger-grid-header-text)' }">Amount</TableHead>
                <TableHead class="w-[160px]" :style="{ backgroundColor: 'var(--ledger-grid-header-bg)' }"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="tu in paginatedTopUps" :key="tu.id"
                class="border-b transition-colors hover:bg-emerald-600/5"
                :style="{ borderColor: 'var(--ledger-grid-border)' }">
                <TableCell class="text-muted-foreground text-xs py-4">
                  {{ tu.createdAt?.toDate?.()?.toLocaleDateString() || '—' }}
                </TableCell>
                <TableCell>
                  <Badge class="bg-emerald-600/10 text-emerald-600 border-emerald-600/20 font-bold text-[10px] uppercase">
                    {{ tu.account?.toUpperCase() }}
                  </Badge>
                </TableCell>
                <TableCell class="text-[11px] font-semibold max-w-[180px] truncate">{{ tu.description }}</TableCell>
                <TableCell class="text-[10px] opacity-70">{{ tu.requestedBy || '—' }}</TableCell>
                <TableCell>
                  <Badge class="font-bold text-[10px] uppercase border-none shadow-sm" :style="statusStyle(tu.status)">
                    {{ statusLabel(tu.status) }}
                  </Badge>
                </TableCell>
                <TableCell class="text-[11px] text-muted-foreground italic">{{ tu.reference }}</TableCell>
                <TableCell class="text-right font-bold text-emerald-600 text-base tabular-nums">
                  ${{ Number(tu.amount).toLocaleString(undefined, { minimumFractionDigits: 2 }) }}
                </TableCell>
                <TableCell class="text-right py-3">
                  <div class="flex items-center justify-end gap-1.5">
                    <Button
                      v-if="tu.status === 'PENDING_ACCOUNTANT' && isAccountant"
                      size="sm"
                      class="bg-orange-500 text-white hover:bg-orange-400 border-none h-7 px-2.5 text-[11px]"
                      :disabled="isProcessing === tu.id"
                      @click="handleTopUpAccountantInitial(tu.id)">
                      <PenLine class="size-3 mr-1" />{{ isProcessing === tu.id ? '...' : 'Initial' }}
                    </Button>
                    <Button
                      v-if="(tu.status === 'PENDING_MANAGER' || tu.status === 'PENDING' || tu.status === 'PENDING_APPROVAL') && isManager"
                      size="sm"
                      class="bg-emerald-600 text-white hover:bg-emerald-500 border-none h-7 px-2.5 text-[11px]"
                      :disabled="isProcessing === tu.id"
                      @click="handleApproveTopUp(tu.id)">
                      <CheckCheck class="size-3 mr-1" />{{ isProcessing === tu.id ? '...' : 'Approve' }}
                    </Button>
                    <Button
                      v-if="(tu.status === 'PENDING_ACCOUNTANT' || tu.status === 'PENDING_MANAGER' || tu.status === 'PENDING' || tu.status === 'PENDING_APPROVAL') && isManager"
                      size="sm" variant="ghost"
                      class="h-7 w-7 p-0 text-red-500 hover:bg-red-500/10"
                      :disabled="isProcessing === tu.id"
                      @click="handleRejectTopUp(tu.id)">
                      <X class="size-3.5" />
                    </Button>
                    <!-- Admin Force Delete -->
                    <Button v-if="isSuperAdmin" variant="ghost" size="icon" title="Force Delete (Admin)"
                        class="h-7 w-7 text-destructive hover:bg-destructive/10 border border-destructive/20 ml-1"
                        @click="openAdminDelete(tu, 'TOPUP')">
                        <Trash2 v-if="!isDeleting || selectedItemForAdminDelete?.id !== tu.id" class="size-3.5" />
                        <span v-else class="size-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
              <TableRow v-if="topUps.length === 0">
                <TableCell colspan="8" class="text-center py-8 text-muted-foreground italic">No top-up requests found.</TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <!-- TopUps Pagination Footer -->
          <div class="flex items-center justify-between px-6 py-4 border-t border-brand-primary/15 flex-wrap gap-4 bg-black/10">
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
                  class="bg-background border border-muted-foreground/30 rounded text-xs px-2 py-1.5 focus:ring-1 focus:ring-brand-primary focus:outline-none cursor-pointer text-foreground"
                  @change="topUpsPage = 1"
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
        </CardContent>
      </Card>
    </div>

    <!-- Admin Confirmation Dialog -->
    <AdminDeleteDialog
        v-if="selectedItemForAdminDelete"
        v-model:open="isAdminDeleteOpen"
        title="Admin Force Delete"
        :description="`You are about to PERMANENTLY delete this ${adminDeleteType.toLowerCase()}: ${selectedItemForAdminDelete.reference || selectedItemForAdminDelete.description || selectedItemForAdminDelete.id}. This will bypass all safety checks and directly update the database.`"
        :target-id="String(selectedItemForAdminDelete.id).substring(0, 8).toUpperCase()"
        :loading="isDeleting"
        @confirm="handleAdminDeleteConfirm"
    />
  </div>
</template>
