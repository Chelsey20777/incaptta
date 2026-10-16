<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useInventoryStore } from '../store/inventoryStore'
import { useSession } from '@/composables/useSession'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu'
import {
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Eye,
  Edit,
  ArrowUpRight,
  AlertTriangle,
  Loader2,
  Package,
  CheckCircle2,
  History,
  Wallet,
  Upload,
  Download
} from 'lucide-vue-next'
import { format } from 'date-fns'

import { toast } from 'vue-sonner'
import { downloadInventoryTemplateCsv, parseAndUploadInventoryCsv } from '../utils/importCsv'
import { inventoryApi } from '../api/inventoryApi'

const router = useRouter()
const inventoryStore = useInventoryStore()
const { hasAnyRole, user } = useSession()

import { useAdminStore } from '@/features/admin/store/adminStore'
import { storeToRefs } from 'pinia'
const adminStore = useAdminStore()
const { appSettings } = storeToRefs(adminStore)

const fileInputRef = ref<HTMLInputElement | null>(null)
const isImporting = ref(false)

const searchQuery = ref('')
const statusFilter = ref('all') // Default to all as per requirement
const sortBy = ref<'name' | 'onHand' | 'updatedAt'>('updatedAt')

const canManage = computed(() => hasAnyRole(['SUPER_ADMIN', 'ADMIN', 'STOREKEEPER']))

const filteredItems = computed(() => {
  return inventoryStore.items.filter(item => {
    const matchesSearch = !searchQuery.value ||
      item.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      item.sku.toLowerCase().includes(searchQuery.value.toLowerCase())

    const matchesStatus = statusFilter.value === 'all' ||
      (statusFilter.value === 'active' && item.isActive) ||
      (statusFilter.value === 'inactive' && !item.isActive) ||
      (statusFilter.value === 'low' && item.reorderLevel !== undefined && item.onHand <= item.reorderLevel)

    return matchesSearch && matchesStatus
  })
})

const fetchItems = async () => {
  try {
    await inventoryStore.fetchItems()
    if (inventoryStore.error) {
      toast.error('Error', {
        description: inventoryStore.error
      })
    }
  } catch (err: any) {
    toast.error('Connection Error', {
      description: err.message || 'Failed to fetch inventory items.'
    })
  }
}

onMounted(() => {
  adminStore.fetchSettings()
  fetchItems()
})

const formatDate = (ts: any) => {
  if (!ts) return 'N/A'
  return format(ts.toDate(), 'MMM d, yyyy HH:mm')
}

const handleDownloadTemplate = async () => {
  try {
    const categories = await inventoryApi.fetchCategories()
    downloadInventoryTemplateCsv(inventoryStore.items, categories)
    toast.success("Stock Take Template Downloaded")
  } catch (err: any) {
    toast.error("Failed to download template", { description: err.message })
  }
}

const triggerFileInput = () => {
  fileInputRef.value?.click()
}

const handleFileUpload = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  if (!user.value) {
    toast.error("You must be logged in to do this")
    return
  }

  isImporting.value = true
  toast.loading('Importing Inventory / Stock Take...', { id: 'inventory-import' })
  try {
    const categories = await inventoryApi.fetchCategories()
    const result = await parseAndUploadInventoryCsv(
      file,
      inventoryStore.items,
      categories,
      { uid: user.value.uid, email: user.value.email || '' }
    )

    if (result.errors.length > 0) {
      console.warn('Import Errors:', result.errors)
      toast.error(`Imported ${result.success} items with ${result.errors.length} errors. Set to check console.`, { id: 'inventory-import', duration: 8000 })
    } else {
      toast.success(`Successfully imported/adjusted ${result.success} items!`, { id: 'inventory-import' })
    }
    await fetchItems()
  } catch (err: any) {
    toast.error("Import Failed", { id: 'inventory-import', description: err.message })
  } finally {
    isImporting.value = false
    if (fileInputRef.value) fileInputRef.value.value = '' // Reset input
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header Section -->
    <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div class="w-full lg:w-auto">
        <h2 class="text-2xl md:text-3xl font-bold tracking-tight text-orange-900 dark:text-orange-500">Inventory</h2>
        <p class="text-sm md:text-base text-muted-foreground">Manage your stock, SKUs, and track movements.</p>
      </div>
      <div v-if="canManage" class="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
        <input type="file" ref="fileInputRef" accept=".csv" class="hidden" @change="handleFileUpload" />

        <div class="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="outline" class="flex-1 sm:flex-none border-orange-200 text-orange-700 hover:bg-orange-50 h-11 lg:h-9"
                :disabled="isImporting">
                <Loader2 v-if="isImporting" class="h-4 w-4 mr-2 animate-spin" />
                <Upload v-else class="h-4 w-4 mr-2" />
                Actions
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-56">
              <DropdownMenuLabel>Batch Operations</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem @click="handleDownloadTemplate">
                <Download class="mr-2 h-4 w-4" /> Stock Take Template
              </DropdownMenuItem>
              <DropdownMenuItem @click="triggerFileInput">
                <Upload class="mr-2 h-4 w-4 text-primary" /> Import Stock Take
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button class="bg-orange-600 hover:bg-orange-700 text-white border-orange-700 h-11 lg:h-9 flex-1 sm:flex-none font-bold"
            @click="router.push('/inventory/new')">
            <Plus class="mr-2 h-5 w-5 sm:h-4 sm:w-4" /> Add Item
          </Button>
        </div>
      </div>
    </div>

    <!-- Summary Stats -->
    <div class="grid gap-4 grid-cols-2 lg:grid-cols-4">
      <Card class="bg-card/50">
        <CardHeader class="flex flex-row items-center justify-between space-y-0 p-3 md:p-6 pb-2">
          <CardTitle class="text-[10px] md:text-sm font-bold uppercase tracking-wider text-muted-foreground">Total Items</CardTitle>
          <Package class="h-4 w-4 text-orange-500" />
        </CardHeader>
        <CardContent class="p-3 md:p-6 pt-0">
          <div class="text-xl md:text-2xl font-black">{{ inventoryStore.items.length }}</div>
        </CardContent>
      </Card>
      <Card class="bg-card/50">
        <CardHeader class="flex flex-row items-center justify-between space-y-0 p-3 md:p-6 pb-2">
          <CardTitle class="text-[10px] md:text-sm font-bold uppercase tracking-wider text-muted-foreground">Low Stock</CardTitle>
          <AlertTriangle class="h-4 w-4"
            :style="{ color: appSettings?.uiColors?.lowStockColor || 'var(--destructive)' }" />
        </CardHeader>
        <CardContent class="p-3 md:p-6 pt-0">
          <div class="text-xl md:text-2xl font-black"
            :style="{ color: appSettings?.uiColors?.lowStockColor || 'var(--destructive)' }">
            {{ inventoryStore.lowStockItems.length }}
          </div>
        </CardContent>
      </Card>
      <Card class="bg-card/50">
        <CardHeader class="flex flex-row items-center justify-between space-y-0 p-3 md:p-6 pb-2">
          <CardTitle class="text-[10px] md:text-sm font-bold uppercase tracking-wider text-muted-foreground">Total Value</CardTitle>
          <Wallet class="h-4 w-4 text-green-500" />
        </CardHeader>
        <CardContent class="p-3 md:p-6 pt-0">
          <div class="text-xl md:text-2xl font-black">${{ inventoryStore.totalValue.toLocaleString() }}</div>
        </CardContent>
      </Card>
      <Card class="bg-card/50">
        <CardHeader class="flex flex-row items-center justify-between space-y-0 p-3 md:p-6 pb-2">
          <CardTitle class="text-[10px] md:text-sm font-bold uppercase tracking-wider text-muted-foreground">Active</CardTitle>
          <CheckCircle2 class="h-4 w-4 text-blue-500" />
        </CardHeader>
        <CardContent class="p-3 md:p-6 pt-0">
          <div class="text-xl md:text-2xl font-black">{{inventoryStore.items.filter(i => i.isActive).length}}</div>
        </CardContent>
      </Card>
    </div>

    <!-- Main Content Area -->
    <Card class="border-orange-100 shadow-sm overflow-hidden">
      <CardHeader class="pb-3 border-b bg-muted/20">
        <div class="flex flex-col gap-4 md:flex-row md:items-center">
          <div class="relative flex-1">
            <Search class="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input type="search" placeholder="Search by name or SKU..." class="pl-10 h-11 lg:h-10 bg-background" v-model="searchQuery" />
          </div>
          <div class="flex items-center gap-2">
            <Select v-model="statusFilter">
              <SelectTrigger class="flex-1 md:w-[150px] h-11 lg:h-10 bg-background">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Items</SelectItem>
                <SelectItem value="active">Active Only</SelectItem>
                <SelectItem value="inactive">Inactive Only</SelectItem>
                <SelectItem value="low">Low Stock</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" @click="fetchItems" class="h-11 w-11 lg:h-10 lg:w-10 shrink-0">
              <History v-if="!inventoryStore.loading" class="h-4 w-4" />
              <Loader2 v-else class="h-4 w-4 animate-spin" />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent class="p-0">
        <!-- Desktop Table View -->
        <div class="hidden md:block">
          <Table>
            <TableHeader class="bg-muted/30">
              <TableRow>
                <TableHead class="text-[11px] font-bold uppercase tracking-wider py-4">SKU</TableHead>
                <TableHead class="text-[11px] font-bold uppercase tracking-wider py-4">Name</TableHead>
                <TableHead class="text-[11px] font-bold uppercase tracking-wider py-4">UOM</TableHead>
                <TableHead class="text-right text-[11px] font-bold uppercase tracking-wider py-4">On Hand</TableHead>
                <TableHead class="text-right text-[11px] font-bold uppercase tracking-wider py-4">Reorder</TableHead>
                <TableHead class="text-[11px] font-bold uppercase tracking-wider py-4">Status</TableHead>
                <TableHead class="text-[11px] font-bold uppercase tracking-wider py-4">Last Updated</TableHead>
                <TableHead class="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-if="inventoryStore.loading && inventoryStore.items.length === 0">
                <TableCell colspan="8" class="h-24 text-center">
                  <div class="flex items-center justify-center gap-2">
                    <Loader2 class="h-4 w-4 animate-spin" />
                    Loading inventory...
                  </div>
                </TableCell>
              </TableRow>
              <TableRow v-else-if="filteredItems.length === 0">
                <TableCell colspan="8" class="h-24 text-center text-muted-foreground">
                  No items found.
                </TableCell>
              </TableRow>
              <TableRow v-for="item in filteredItems" :key="item.id" class="cursor-pointer hover:bg-muted/30 transition-colors" @click="router.push(`/inventory/${item.id}`)">
                <TableCell class="font-bold text-orange-700">{{ item.sku }}</TableCell>
                <TableCell class="font-medium">{{ item.name }}</TableCell>
                <TableCell class="text-xs text-muted-foreground">{{ item.uom }}</TableCell>
                <TableCell class="text-right">
                  <div class="flex items-center justify-end gap-2 text-right">
                    <span class="font-black text-base"
                      :style="item.reorderLevel !== undefined && item.onHand <= item.reorderLevel ? { color: appSettings?.uiColors?.lowStockColor || 'var(--destructive)' } : {}">
                      {{ item.onHand }}
                    </span>
                    <AlertTriangle v-if="item.reorderLevel !== undefined && item.onHand <= item.reorderLevel"
                      class="h-4 w-4"
                      :style="{ color: appSettings?.uiColors?.lowStockColor || 'var(--destructive)' }" />
                  </div>
                </TableCell>
                <TableCell class="text-right text-muted-foreground font-mono text-xs">{{ item.reorderLevel ?? '-' }}</TableCell>
                <TableCell>
                  <Badge :variant="item.isActive ? 'default' : 'secondary'" class="font-bold text-[10px] uppercase tracking-wider">
                    {{ item.isActive ? 'Active' : 'Inactive' }}
                  </Badge>
                </TableCell>
                <TableCell class="text-[11px] text-muted-foreground">{{ formatDate(item.updatedAt) }}</TableCell>
                <TableCell @click.stop>
                  <DropdownMenu>
                    <DropdownMenuTrigger as-child>
                      <Button variant="ghost" class="h-8 w-8 p-0">
                        <MoreHorizontal class="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" class="w-48">
                      <DropdownMenuLabel>Item Actions</DropdownMenuLabel>
                      <DropdownMenuItem @click="router.push(`/inventory/${item.id}`)">
                        <Eye class="mr-2 h-4 w-4" /> View Details
                      </DropdownMenuItem>
                      <template v-if="canManage">
                        <DropdownMenuItem @click="router.push(`/inventory/${item.id}/edit`)">
                          <Edit class="mr-2 h-4 w-4" /> Edit Item
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem @click="router.push(`/inventory/${item.id}/adjust`)">
                          <ArrowUpRight class="mr-2 h-4 w-4 text-orange-600" /> Adjust Stock
                        </DropdownMenuItem>
                      </template>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <!-- Mobile Card View -->
        <div class="md:hidden divide-y">
          <div v-if="inventoryStore.loading && filteredItems.length === 0" class="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Loader2 class="size-8 animate-spin mb-2" />
            <p>Loading items...</p>
          </div>
          
          <div v-else-if="filteredItems.length === 0" class="text-center py-12 text-muted-foreground">
            <Package class="size-12 mx-auto mb-2 opacity-20" />
            <p>No inventory items matches your search.</p>
          </div>

          <div v-for="item in filteredItems" :key="item.id" 
               @click="router.push(`/inventory/${item.id}`)"
               class="p-4 space-y-3 active:bg-muted transition-colors relative">
            <div class="flex items-start justify-between">
              <div class="space-y-1 overflow-hidden">
                <span class="text-[10px] font-bold text-orange-600 uppercase tracking-widest">{{ item.sku }}</span>
                <h3 class="font-black text-base truncate">{{ item.name }}</h3>
                <p class="text-xs text-muted-foreground">{{ item.uom }}</p>
              </div>
              <Badge :variant="item.isActive ? 'default' : 'secondary'" class="font-bold text-[9px] uppercase tracking-tighter">
                {{ item.isActive ? 'Active' : 'Inactive' }}
              </Badge>
            </div>
            
            <div class="flex items-end justify-between pt-2">
              <div class="flex gap-4">
                <div class="space-y-0.5">
                  <span class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">On Hand</span>
                  <div class="flex items-center gap-1.5">
                    <p class="text-2xl font-black leading-none"
                       :style="item.reorderLevel !== undefined && item.onHand <= item.reorderLevel ? { color: appSettings?.uiColors?.lowStockColor || 'var(--destructive)' } : {}">
                      {{ item.onHand }}
                    </p>
                    <AlertTriangle v-if="item.reorderLevel !== undefined && item.onHand <= item.reorderLevel"
                      class="size-4"
                      :style="{ color: appSettings?.uiColors?.lowStockColor || 'var(--destructive)' }" />
                  </div>
                </div>
                <div v-if="item.reorderLevel !== undefined" class="space-y-0.5 opacity-60">
                  <span class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Reorder</span>
                  <p class="text-sm font-mono font-bold leading-none mt-1">{{ item.reorderLevel }}</p>
                </div>
              </div>
              
              <div @click.stop>
                <DropdownMenu>
                  <DropdownMenuTrigger as-child>
                    <Button variant="ghost" size="icon" class="h-10 w-10 rounded-full border border-orange-100 bg-orange-50/50">
                      <MoreHorizontal class="size-5 text-orange-600" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" class="w-48">
                    <DropdownMenuItem @click="router.push(`/inventory/${item.id}`)">
                       <Eye class="mr-2 size-4" /> View Details
                    </DropdownMenuItem>
                    <template v-if="canManage">
                      <DropdownMenuItem @click="router.push(`/inventory/${item.id}/edit`)">
                        <Edit class="mr-2 h-4 w-4" /> Edit Item
                      </DropdownMenuItem>
                      <DropdownMenuItem @click="router.push(`/inventory/${item.id}/adjust`)">
                        <ArrowUpRight class="mr-2 h-4 w-4 text-orange-600" /> Adjust Stock
                      </DropdownMenuItem>
                    </template>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            
            <div class="text-[9px] text-muted-foreground font-mono mt-2 pt-2 border-t border-dashed">
              Updated: {{ formatDate(item.updatedAt) }}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
