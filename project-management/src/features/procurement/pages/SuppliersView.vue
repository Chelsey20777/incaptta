<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useProcurementStore } from '../store/procurementStore'
import type { Supplier, SupplierStatus } from '../types'
import { toast } from 'vue-sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Search, Loader2, Edit, User, Phone, Mail, FileText, Tag, MoreHorizontal } from 'lucide-vue-next'
import SupplierSheet from '../components/SupplierSheet.vue'

const procurementStore = useProcurementStore()
const searchQuery = ref('')
const isSheetOpen = ref(false)
const selectedSupplier = ref<Supplier | null>(null)

// Fetch suppliers on mount
onMounted(() => {
  procurementStore.fetchSuppliers()
})

// Cleanup listeners on unmount
onUnmounted(() => {
  procurementStore.cleanupListeners()
})

// Filtered suppliers based on search query
const filteredSuppliers = computed(() => {
  if (!searchQuery.value) return procurementStore.suppliers

  const query = searchQuery.value.toLowerCase()
  return procurementStore.suppliers.filter((supplier: Supplier) =>
    supplier.name.toLowerCase().includes(query) ||
    supplier.contactPerson.toLowerCase().includes(query) ||
    supplier.email.toLowerCase().includes(query) ||
    supplier.phone.toLowerCase().includes(query) ||
    (supplier.categories?.some((cat: string) => cat.toLowerCase().includes(query)))
  )
})

// Handle edit supplier
function handleEditSupplier(supplier: Supplier) {
  selectedSupplier.value = supplier
  isSheetOpen.value = true
}

// Handle add new supplier
function handleAddSupplier() {
  selectedSupplier.value = null
  isSheetOpen.value = true
}

// Handle status toggle
async function handleToggleStatus(supplier: Supplier) {
  try {
    const newStatus: SupplierStatus = supplier.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    await procurementStore.updateSupplier(supplier.id, { status: newStatus })
    toast.success(`Supplier ${newStatus === 'ACTIVE' ? 'activated' : 'deactivated'}`)
  } catch (error: any) {
    console.error('Error toggling supplier status:', error)
    toast.error('Failed to update supplier status', {
      description: error.message || 'Please try again'
    })
  }
}

// Handle sheet saved
function handleSheetSaved() {
  isSheetOpen.value = false
  selectedSupplier.value = null
}

// Format categories for display (max 3, show "+N more")
function formatCategories(categories: string[] = []) {
  if (categories.length === 0) return []
  if (categories.length <= 3) return categories
  return [...categories.slice(0, 3), `+${categories.length - 3} more`]
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 class="text-3xl font-bold tracking-tight">Suppliers</h2>
        <p class="text-muted-foreground">Manage your supplier master list</p>
      </div>
      <Button @click="handleAddSupplier" class="bg-orange-600 hover:bg-orange-700 text-white">
        <Plus class="mr-2 h-4 w-4" />
        Add Supplier
      </Button>
    </div>

    <!-- Search Bar -->
    <div class="relative">
      <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        v-model="searchQuery"
        placeholder="Search suppliers by name, contact, email, phone, or categories..."
        class="pl-9"
      />
    </div>

    <!-- Main Content Card -->
    <Card>
      <CardHeader>
        <CardTitle>Supplier Directory</CardTitle>
        <CardDescription>
          {{ filteredSuppliers.length }} supplier{{ filteredSuppliers.length !== 1 ? 's' : '' }} found
          {{ searchQuery ? 'matching your search' : '' }}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <!-- Loading State -->
        <div v-if="procurementStore.loadingSuppliers && procurementStore.suppliers.length === 0" class="space-y-4">
          <div v-for="i in 5" :key="i" class="flex items-center space-x-4">
            <Skeleton class="h-12 w-full" />
          </div>
        </div>

        <!-- Empty State -->
        <div
          v-else-if="filteredSuppliers.length === 0"
          class="text-center py-12"
        >
          <User class="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 class="mt-4 text-lg font-semibold">No suppliers found</h3>
          <p class="text-muted-foreground max-w-md mx-auto mt-2">
            {{
              searchQuery
                ? 'No suppliers match your search query. Try a different search.'
                : 'Get started by adding your first supplier.'
            }}
          </p>
          <Button v-if="!searchQuery" @click="handleAddSupplier" class="mt-4">
            <Plus class="mr-2 h-4 w-4" />
            Add Your First Supplier
          </Button>
        </div>

        <!-- Suppliers Table -->
        <Table v-else>
          <TableHeader>
            <TableRow>
              <TableHead>Supplier</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Contact Info</TableHead>
              <TableHead>Payment Terms</TableHead>
              <TableHead>Categories</TableHead>
              <TableHead>Status</TableHead>
              <TableHead class="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="supplier in filteredSuppliers" :key="supplier.id">
              <!-- Supplier Name -->
              <TableCell class="font-medium">
                <div class="flex items-center gap-3">
                  <div class="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                    <User class="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div class="font-medium">{{ supplier.name }}</div>
                    <div class="text-xs text-muted-foreground">{{ supplier.email }}</div>
                  </div>
                </div>
              </TableCell>

              <!-- Contact Person -->
              <TableCell>
                <div class="flex items-center gap-2">
                  <User class="h-4 w-4 text-muted-foreground" />
                  <span>{{ supplier.contactPerson }}</span>
                </div>
              </TableCell>

              <!-- Contact Info -->
              <TableCell>
                <div class="space-y-1">
                  <div class="flex items-center gap-2">
                    <Phone class="h-3 w-3 text-muted-foreground" />
                    <span class="text-sm">{{ supplier.phone }}</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <Mail class="h-3 w-3 text-muted-foreground" />
                    <span class="text-sm truncate max-w-[200px]">{{ supplier.email }}</span>
                  </div>
                </div>
              </TableCell>

              <!-- Payment Terms -->
              <TableCell>
                <Badge variant="outline" class="font-normal">
                  {{ supplier.paymentTerms }}
                </Badge>
              </TableCell>

              <!-- Categories -->
              <TableCell>
                <div class="flex flex-wrap gap-1">
                  <Badge
                    v-for="(category, index) in formatCategories(supplier.categories)"
                    :key="index"
                    variant="secondary"
                    class="text-xs"
                    :class="{ 'bg-muted text-muted-foreground': category.startsWith('+') }"
                  >
                    {{ category }}
                  </Badge>
                  <span v-if="!supplier.categories?.length" class="text-xs text-muted-foreground italic">
                    No categories
                  </span>
                </div>
              </TableCell>

              <!-- Status -->
              <TableCell>
                <Badge :variant="supplier.status === 'ACTIVE' ? 'default' : 'secondary'">
                  {{ supplier.status === 'ACTIVE' ? 'Active' : 'Inactive' }}
                </Badge>
              </TableCell>

              <!-- Actions -->
              <TableCell class="text-right">
                <div class="flex items-center justify-end gap-2">
                  <Button variant="ghost" size="icon" @click="handleEditSupplier(supplier)">
                    <Edit class="h-4 w-4" />
                  </Button>
                  <Switch
                    :checked="supplier.status === 'ACTIVE'"
                    @update:checked="() => handleToggleStatus(supplier)"
                    :class="supplier.status === 'ACTIVE' ? 'bg-green-500' : 'bg-gray-300'"
                  />
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <!-- Supplier Sheet Component -->
    <SupplierSheet
      v-model:open="isSheetOpen"
      :supplier="selectedSupplier"
      @saved="handleSheetSaved"
    />
  </div>
</template>