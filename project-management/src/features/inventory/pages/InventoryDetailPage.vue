<script setup lang="ts">
import { onMounted, computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useInventoryStore } from '../store/inventoryStore'
import { useSession } from '@/composables/useSession'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import {
  ChevronLeft,
  Edit,
  ArrowUpRight,
  AlertTriangle,
  History,
  Info,
  Package,
  Loader2
} from 'lucide-vue-next'
import { format } from 'date-fns'
import { inventoryApi } from '../api/inventoryApi'
import type { StockLedgerEntry } from '../types'

const route = useRoute()
const router = useRouter()
const inventoryStore = useInventoryStore()
const { hasAnyRole } = useSession()

const itemId = route.params.id as string
const canManage = computed(() => hasAnyRole(['SUPER_ADMIN', 'ADMIN', 'STOREKEEPER']))
const movements = ref<StockLedgerEntry[]>([])
const loadingMovements = ref(false)

async function fetchMovements() {
  try {
    loadingMovements.value = true
    movements.value = await inventoryApi.getMovements(itemId)
  } catch (err) {
    console.error('Failed to fetch movements:', err)
  } finally {
    loadingMovements.value = false
  }
}

onMounted(() => {
  inventoryStore.fetchItem(itemId)
  fetchMovements()
})

const item = computed(() => inventoryStore.selectedItem)

const formatDate = (ts: any) => {
  if (!ts) return 'N/A'
  return format(ts.toDate(), 'MMM d, yyyy HH:mm')
}

const getMovementColor = (type: string, qty: number) => {
  if (type === 'ISSUE' || qty < 0) return 'text-destructive'
  if (type === 'RETURN' || qty > 0) return 'text-green-600'
  return 'text-muted-foreground'
}
</script>

<template>
  <div class="space-y-6">
    <div v-if="inventoryStore.loading && !item" class="flex flex-col items-center justify-center h-64">
      <Loader2 class="h-8 w-8 animate-spin text-primary" />
      <p class="mt-2 text-muted-foreground">Loading item details...</p>
    </div>

    <div v-else-if="!item && !inventoryStore.loading" class="flex flex-col items-center justify-center h-64">
      <AlertTriangle class="h-8 w-8 text-destructive" />
      <p class="mt-2 text-muted-foreground">Inventory item not found.</p>
      <Button variant="link" @click="router.push('/inventory')">Back to Inventory</Button>
    </div>

    <template v-else-if="item">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-4">
          <Button variant="ghost" size="icon" @click="router.push('/inventory')">
            <ChevronLeft class="h-4 w-4" />
          </Button>
          <div>
            <h2 class="text-3xl font-bold tracking-tight">{{ item.name }}</h2>
            <div class="flex items-center gap-2 mt-1">
              <Badge variant="outline">{{ item.sku }}</Badge>
              <Badge :variant="item.isActive ? 'default' : 'secondary'">
                {{ item.isActive ? 'Active' : 'Inactive' }}
              </Badge>
              <Badge variant="secondary" class="uppercase text-[10px]">
                {{ item.categoryName || 'No Category' }}
              </Badge>
            </div>
          </div>
        </div>
        <div class="flex gap-2" v-if="canManage">
          <Button variant="outline" @click="router.push(`/inventory/${item.id}/edit`)">
            <Edit class="mr-2 h-4 w-4" /> Edit
          </Button>
          <Button @click="router.push(`/inventory/${item.id}/adjust`)">
            <ArrowUpRight class="mr-2 h-4 w-4" /> Adjust Stock
          </Button>
        </div>
      </div>

      <div class="grid gap-6 md:grid-cols-4">
        <Card>
          <CardHeader class="pb-2">
            <CardTitle class="text-sm font-medium">On Hand</CardTitle>
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold flex items-center gap-2">
              <Package class="h-5 w-5 text-muted-foreground" />
              <span
                :class="{ 'text-destructive': item.reorderLevel !== undefined && item.onHand <= item.reorderLevel }">
                {{ item.onHand }} {{ item.uom }}
              </span>
            </div>
            <div v-if="item.reorderLevel !== undefined && item.onHand <= item.reorderLevel"
              class="flex items-center gap-1 mt-1 text-xs text-destructive">
              <AlertTriangle class="h-3 w-3" />
              Low stock (Reorder at {{ item.reorderLevel }})
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader class="pb-2">
            <CardTitle class="text-sm font-medium">Unit Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">${{ (item.purchasePrice || 0).toFixed(2) }}</div>
            <p class="text-xs text-muted-foreground mt-1">Base Purchase Price</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader class="pb-2">
            <CardTitle class="text-sm font-medium">Total Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">${{ (item.onHand * (item.purchasePrice || 0)).toLocaleString() }}</div>
            <p class="text-xs text-muted-foreground mt-1">On Hand * Unit Cost</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader class="pb-2">
            <CardTitle class="text-sm font-medium">Last Movement</CardTitle>
          </CardHeader>
          <CardContent>
            <div class="text-sm font-medium">
              {{ movements[0] ? formatDate(movements[0].postedAt) : 'No movements' }}
            </div>
            <p class="text-xs text-muted-foreground mt-1">Transaction History</p>
          </CardContent>
        </Card>
      </div>

      <div class="grid gap-6 md:grid-cols-3">
        <Card class="md:col-span-1">
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Info class="h-4 w-4" /> Attributes
            </CardTitle>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="space-y-1">
              <p class="text-sm font-medium text-muted-foreground">Category</p>
              <p>{{ item.categoryName || 'Not specified' }}</p>
            </div>
            <div class="space-y-1">
              <p class="text-sm font-medium text-muted-foreground">Location</p>
              <p>{{ item.location || 'Not specified' }}</p>
            </div>
            <div class="space-y-1">
              <p class="text-sm font-medium text-muted-foreground">Unit of Measure</p>
              <p>{{ item.uom }}</p>
            </div>
            <div class="space-y-1">
              <p class="text-sm font-medium text-muted-foreground">Reorder Level</p>
              <p>{{ item.reorderLevel ?? 'Not set' }}</p>
            </div>
            <div class="space-y-1">
              <p class="text-sm font-medium text-muted-foreground">Created At</p>
              <p>{{ formatDate(item.createdAt) }}</p>
            </div>
          </CardContent>
        </Card>

        <Card class="md:col-span-2">
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <History class="h-4 w-4" /> Movement History
            </CardTitle>
            <CardDescription>Recent stock transactions and adjustments.</CardDescription>
          </CardHeader>
          <CardContent>
            <div class="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead class="text-right">Qty</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-if="loadingMovements">
                    <TableCell colspan="5" class="h-24 text-center">
                      <Loader2 class="size-4 animate-spin mx-auto mr-2 inline" />
                      Loading movements...
                    </TableCell>
                  </TableRow>
                  <TableRow v-else-if="movements.length === 0">
                    <TableCell colspan="5" class="h-24 text-center">
                      No movements recorded yet.
                    </TableCell>
                  </TableRow>
                  <TableRow v-for="mv in movements" :key="mv.id">
                    <TableCell>{{ formatDate(mv.postedAt) }}</TableCell>
                    <TableCell>
                      <Badge variant="outline" :class="getMovementColor(mv.movementType, mv.qty)">
                        {{ mv.movementType }}
                      </Badge>
                    </TableCell>
                    <TableCell :class="['text-right font-medium', getMovementColor(mv.movementType, mv.qty)]">
                      {{ mv.qty > 0 ? '+' : '' }}{{ mv.qty }}
                    </TableCell>
                    <TableCell class="text-xs">{{ mv.reference || '-' }}</TableCell>
                    <TableCell class="text-xs">{{ mv.postedByUid.substring(0, 8) }}...</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </template>
  </div>
</template>
