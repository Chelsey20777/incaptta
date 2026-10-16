<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import { useAdminStore } from '@/features/admin/store/adminStore'
import { storeToRefs } from 'pinia'

const props = defineProps<{
  ledger: any[]
}>()

const adminStore = useAdminStore()
const { appSettings } = storeToRefs(adminStore)

// ── Pagination State ──────────────────────────────────────────────────────────
const currentPage = ref(1)
const itemsPerPage = ref(20)

const paginatedEntries = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value
  const end = start + itemsPerPage.value
  return props.ledger.slice(start, end)
})

const totalPages = computed(() => {
  return Math.ceil(props.ledger.length / itemsPerPage.value) || 1
})

watch(() => props.ledger, () => {
  currentPage.value = 1
})
</script>

<template>
  <Card
    class="bg-brand-primary/5 dark:bg-brand-primary/10 backdrop-blur-md border-brand-primary/20 dark:border-brand-primary/30 shadow-lg text-foreground dark:text-white overflow-hidden">
    <CardContent class="p-0">
      <Table>
        <TableHeader>
          <TableRow class="border-b hover:bg-transparent" :style="{ borderColor: 'var(--ledger-grid-border)' }">
            <TableHead class="text-[11px] font-bold uppercase tracking-wider"
              :style="{ backgroundColor: 'var(--ledger-grid-header-bg)', color: 'var(--ledger-grid-header-text)' }">Date
            </TableHead>
            <TableHead class="text-[11px] font-bold uppercase tracking-wider"
              :style="{ backgroundColor: 'var(--ledger-grid-header-bg)', color: 'var(--ledger-grid-header-text)' }">
              Account</TableHead>
            <TableHead class="text-[11px] font-bold uppercase tracking-wider"
              :style="{ backgroundColor: 'var(--ledger-grid-header-bg)', color: 'var(--ledger-grid-header-text)' }">
              Description</TableHead>
            <TableHead class="text-[11px] font-bold uppercase tracking-wider"
              :style="{ backgroundColor: 'var(--ledger-grid-header-bg)', color: 'var(--ledger-grid-header-text)' }">Type
            </TableHead>
            <TableHead class="text-right text-[11px] font-bold uppercase tracking-wider"
              :style="{ backgroundColor: 'var(--ledger-grid-header-bg)', color: 'var(--ledger-grid-header-text)' }">
              Amount</TableHead>
            <TableHead class="text-right text-[11px] font-bold uppercase tracking-wider"
              :style="{ backgroundColor: 'var(--ledger-grid-header-bg)', color: 'var(--ledger-grid-header-text)' }">
              Running Balance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="entry in paginatedEntries" :key="entry.id" class="border-b transition-colors duration-200"
            :style="{ borderColor: 'var(--ledger-grid-border)' }"
            :class="'hover:bg-brand-primary/5 dark:hover:bg-brand-primary/10'">
            <TableCell class="whitespace-nowrap text-muted-foreground dark:text-white/60 text-xs py-4">{{ entry.date }}
            </TableCell>
            <TableCell class="font-bold text-[10px] uppercase"
              :style="{ color: appSettings?.uiColors?.brandPrimaryColor || '#79c21b' }">{{ entry.account }}</TableCell>
            <TableCell class="text-foreground/90 dark:text-white/90">{{ entry.description }}</TableCell>
            <TableCell>
              <Badge :style="entry.amount >= 0
                ? { backgroundColor: (appSettings?.uiColors?.brandPrimaryColor || '#79c21b') + '20', color: appSettings?.uiColors?.brandPrimaryColor || '#79c21b', borderColor: (appSettings?.uiColors?.brandPrimaryColor || '#79c21b') + '30' }
                : { backgroundColor: '#ef444420', color: '#ef4444', borderColor: '#ef444430' }"
                class="font-bold text-[10px] uppercase px-2 py-0.5 border shadow-sm">
                {{ entry.type }}
              </Badge>
            </TableCell>
            <TableCell class="text-right font-bold tabular-nums"
              :style="{ color: entry.amount >= 0 ? (appSettings?.uiColors?.brandPrimaryColor || '#79c21b') : '#ef4444' }">
              {{ entry.amount >= 0 ? '+' : '-' }}${{ Math.abs(entry.amount || 0).toLocaleString(undefined, {
                minimumFractionDigits: 2, maximumFractionDigits: 2
              }) }}
            </TableCell>
            <TableCell class="text-right font-bold text-foreground dark:text-white text-base tabular-nums">
              ${{ entry.balance?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '0.00' }}
            </TableCell>
          </TableRow>
          <TableRow v-if="ledger.length === 0">
            <TableCell colspan="6" class="h-24 text-center text-muted-foreground italic">
              No ledger entries found.
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      
      <!-- Pagination Footer -->
      <div class="flex items-center justify-between px-6 py-4 border-t border-brand-primary/15 flex-wrap gap-4 bg-black/10">
        <div class="text-xs text-muted-foreground flex items-center gap-1">
          Showing
          <span class="font-bold text-foreground">{{ props.ledger.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1 }}</span>
          to
          <span class="font-bold text-foreground">{{ Math.min(currentPage * itemsPerPage, props.ledger.length) }}</span>
          of
          <span class="font-bold text-foreground">{{ props.ledger.length }}</span>
          entries
        </div>
        
        <div class="flex items-center gap-6 flex-wrap">
          <div class="flex items-center gap-2">
            <span class="text-xs text-muted-foreground whitespace-nowrap">Show:</span>
            <select 
              v-model="itemsPerPage" 
              class="bg-background border border-muted-foreground/30 rounded text-xs px-2 py-1.5 focus:ring-1 focus:ring-brand-primary focus:outline-none cursor-pointer text-foreground"
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
</template>
