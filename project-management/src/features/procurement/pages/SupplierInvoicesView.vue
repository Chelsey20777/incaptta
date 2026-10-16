<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useProcurementStore } from '../store/procurementStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { FileText, Loader2, Plus } from 'lucide-vue-next'
import { format } from 'date-fns'
import type { SupplierInvoice, InvoiceStatus, MatchStatus } from '../types/procurement'

const router = useRouter()
const procurementStore = useProcurementStore()

const activeTab = ref<'ALL' | 'PENDING' | 'APPROVED' | 'PAYMENT_PENDING' | 'PAID' | 'DISPUTED'>('ALL')

onMounted(() => {
  procurementStore.fetchSupplierInvoices()
})

const tabs: { key: typeof activeTab.value; label: string }[] = [
  { key: 'ALL',             label: 'All' },
  { key: 'PENDING',         label: 'Pending' },
  { key: 'APPROVED',        label: 'Approved' },
  { key: 'PAYMENT_PENDING', label: 'Payment Pending' },
  { key: 'PAID',            label: 'Paid' },
  { key: 'DISPUTED',        label: 'Disputed' },
]

const filteredInvoices = computed(() => {
  const all = procurementStore.supplierInvoices
  switch (activeTab.value) {
    case 'PENDING':         return all.filter(i => i.status === 'PENDING_MATCH' || i.status === 'DRAFT' || i.status === 'VARIANCE_FLAGGED' || i.status === 'MATCHED')
    case 'APPROVED':        return all.filter(i => i.status === 'APPROVED')
    case 'PAYMENT_PENDING': return all.filter(i => i.status === 'PAYMENT_PENDING')
    case 'PAID':            return all.filter(i => i.status === 'PAYMENT_PROCESSED')
    case 'DISPUTED':        return all.filter(i => i.status === 'DISPUTED')
    default:                return all
  }
})

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount)
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  try {
    return format(new Date(dateStr), 'MMM dd, yyyy')
  } catch {
    return dateStr
  }
}

function isOverdue(dateStr: string): boolean {
  if (!dateStr) return false
  try {
    return new Date(dateStr) < new Date(new Date().toDateString())
  } catch {
    return false
  }
}

function getStatusClass(status: InvoiceStatus): string {
  switch (status) {
    case 'DRAFT':             return 'bg-gray-100 text-gray-700 border-gray-200'
    case 'PENDING_MATCH':     return 'bg-yellow-100 text-yellow-700 border-yellow-200'
    case 'MATCHED':           return 'bg-blue-100 text-blue-700 border-blue-200'
    case 'VARIANCE_FLAGGED':  return 'bg-amber-100 text-amber-700 border-amber-200'
    case 'APPROVED':          return 'bg-green-100 text-green-700 border-green-200'
    case 'PAYMENT_PENDING':   return 'bg-purple-100 text-purple-700 border-purple-200'
    case 'PAYMENT_PROCESSED': return 'bg-green-100 text-green-700 border-green-200'
    case 'DISPUTED':          return 'bg-red-100 text-red-700 border-red-200'
    default:                  return ''
  }
}

function getStatusLabel(status: InvoiceStatus): string {
  switch (status) {
    case 'DRAFT':             return 'Draft'
    case 'PENDING_MATCH':     return 'Pending'
    case 'MATCHED':           return 'Matched'
    case 'VARIANCE_FLAGGED':  return 'Variance Flagged'
    case 'APPROVED':          return 'Approved'
    case 'PAYMENT_PENDING':   return 'Payment Pending'
    case 'PAYMENT_PROCESSED': return 'Paid'
    case 'DISPUTED':          return 'Disputed'
    default:                  return status
  }
}

function getMatchStatusClass(status: MatchStatus): string {
  switch (status) {
    case 'MATCHED':                    return 'bg-green-100 text-green-700 border-green-200'
    case 'VARIANCE_WITHIN_THRESHOLD':  return 'bg-amber-100 text-amber-700 border-amber-200'
    case 'VARIANCE_EXCEEDED':          return 'bg-red-100 text-red-700 border-red-200'
    case 'OVERRIDE_APPROVED':          return 'bg-purple-100 text-purple-700 border-purple-200'
    case 'PENDING':                    return 'bg-gray-100 text-gray-700 border-gray-200'
    default:                           return ''
  }
}

function getMatchStatusLabel(status: MatchStatus): string {
  switch (status) {
    case 'MATCHED':                    return 'Matched'
    case 'VARIANCE_WITHIN_THRESHOLD':  return 'Minor Variance'
    case 'VARIANCE_EXCEEDED':          return 'Variance'
    case 'OVERRIDE_APPROVED':          return 'Override'
    case 'PENDING':                    return 'Pending'
    default:                           return status
  }
}

function tabCount(key: typeof activeTab.value): number {
  const all = procurementStore.supplierInvoices
  switch (key) {
    case 'PENDING':         return all.filter(i => i.status === 'PENDING_MATCH' || i.status === 'DRAFT' || i.status === 'VARIANCE_FLAGGED' || i.status === 'MATCHED').length
    case 'APPROVED':        return all.filter(i => i.status === 'APPROVED').length
    case 'PAYMENT_PENDING': return all.filter(i => i.status === 'PAYMENT_PENDING').length
    case 'PAID':            return all.filter(i => i.status === 'PAYMENT_PROCESSED').length
    case 'DISPUTED':        return all.filter(i => i.status === 'DISPUTED').length
    default:                return all.length
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-extrabold tracking-tight">Supplier Invoices</h1>
        <p class="text-sm text-muted-foreground mt-0.5">Review and approve supplier invoices</p>
      </div>
    </div>

    <!-- Filter Tabs -->
    <div class="flex flex-wrap gap-1 border-b pb-0">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        @click="activeTab = tab.key"
        class="px-4 py-2 text-sm font-medium rounded-t-md transition-colors border-b-2 -mb-px"
        :class="activeTab === tab.key
          ? 'border-primary text-primary bg-primary/5'
          : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'"
      >
        {{ tab.label }}
        <span
          v-if="tab.key !== 'ALL'"
          class="ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-bold"
          :class="activeTab === tab.key ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'"
        >
          {{ tabCount(tab.key) }}
        </span>
      </button>
    </div>

    <!-- Table Card -->
    <Card>
      <CardContent class="p-0">
        <!-- Loading skeleton -->
        <div v-if="procurementStore.loadingInvoices" class="p-6 space-y-3">
          <Skeleton v-for="i in 5" :key="i" class="h-10 w-full" />
        </div>

        <!-- Empty state -->
        <div
          v-else-if="filteredInvoices.length === 0"
          class="flex flex-col items-center justify-center py-16 text-center gap-3"
        >
          <div class="p-4 rounded-full bg-muted">
            <FileText class="size-8 text-muted-foreground" />
          </div>
          <p class="text-sm font-medium text-muted-foreground">No invoices found</p>
          <p class="text-xs text-muted-foreground">Invoices are created from confirmed GRNs</p>
        </div>

        <!-- Table -->
        <Table v-else>
          <TableHeader>
            <TableRow>
              <TableHead class="pl-6">Invoice #</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>PO</TableHead>
              <TableHead>GRN</TableHead>
              <TableHead class="text-right">Total</TableHead>
              <TableHead class="text-right">Expected</TableHead>
              <TableHead>Match</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead class="pr-6"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow
              v-for="inv in filteredInvoices"
              :key="inv.id"
              class="cursor-pointer hover:bg-muted/50 transition-colors"
              @click="router.push(`/procurement/invoices/${inv.id}`)"
            >
              <TableCell class="pl-6 font-mono text-sm font-bold">
                {{ inv.invoiceNumber }}
              </TableCell>
              <TableCell class="font-medium">{{ inv.supplierName }}</TableCell>
              <TableCell>
                <button
                  class="text-primary underline-offset-4 hover:underline text-sm font-mono"
                  @click.stop="router.push(`/procurement/purchase-orders/${inv.poId}`)"
                >
                  {{ inv.poNumber }}
                </button>
              </TableCell>
              <TableCell>
                <button
                  class="text-primary underline-offset-4 hover:underline text-sm font-mono"
                  @click.stop="router.push(`/procurement/grns/${inv.grnId}`)"
                >
                  {{ inv.grnNumber }}
                </button>
              </TableCell>
              <TableCell class="text-right font-mono font-bold">
                {{ formatCurrency(inv.totalAmount) }}
              </TableCell>
              <TableCell class="text-right font-mono text-muted-foreground text-sm">
                {{ formatCurrency(inv.expectedAmount) }}
              </TableCell>
              <TableCell>
                <Badge variant="outline" :class="getMatchStatusClass(inv.matchStatus)" class="text-xs font-bold uppercase tracking-wider whitespace-nowrap">
                  {{ getMatchStatusLabel(inv.matchStatus) }}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant="outline" :class="getStatusClass(inv.status)" class="text-xs font-bold uppercase tracking-wider whitespace-nowrap">
                  {{ getStatusLabel(inv.status) }}
                </Badge>
              </TableCell>
              <TableCell>
                <span
                  class="text-sm"
                  :class="isOverdue(inv.dueDate) && inv.status !== 'PAYMENT_PROCESSED' ? 'text-red-600 font-semibold' : 'text-foreground'"
                >
                  {{ formatDate(inv.dueDate) }}
                </span>
              </TableCell>
              <TableCell class="pr-6">
                <Button
                  variant="outline"
                  size="sm"
                  @click.stop="router.push(`/procurement/invoices/${inv.id}`)"
                >
                  View
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  </div>
</template>
