<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import {
    Package,
    RefreshCw,
    Search,
    Filter,
    AlertCircle,
    Loader2
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { agricInventoryApi } from '../api/agricInventoryApi'
import type { InventoryItem } from '@/features/inventory/types'
import AgricInventorySpreadsheetGrid from '../components/AgricInventorySpreadsheetGrid.vue'
import { useSession } from '@/composables/useSession'
import { useRouter } from 'vue-router'

const { loading: sessionLoading, hasAnyRole } = useSession()
const router = useRouter()

const canView = computed(() => {
    return hasAnyRole(['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'MANAGER', 'STOREKEEPER'])
})

const canManage = computed(() => {
    return hasAnyRole(['SUPER_ADMIN', 'ADMIN', 'MANAGER'])
})

const items = ref<InventoryItem[]>([])
const loading = ref(false)
const search = ref('')
const activeOnly = ref(true)

async function fetchData() {
    if (!canView.value) return
    try {
        loading.value = true
        items.value = await agricInventoryApi.listInventory({ search: search.value, isActive: activeOnly.value })
    } catch (err: any) {
        toast.error('Fetch Failed', { description: err.message })
    } finally {
        loading.value = false
    }
}

const categories = [
    { id: 'structural', name: 'Structural Steel' },
    { id: 'roofing', name: 'Roofing & Cladding' },
    { id: 'concrete', name: 'Concrete & Masonry' },
    { id: 'hardware', name: 'Hardware & Fasteners' },
    { id: 'labour', name: 'Labour & Services' }
]

onMounted(() => {
    if (!sessionLoading.value && canView.value) {
        fetchData()
    }
})
</script>

<template>
    <div class="h-full space-y-4 p-8 pt-6">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
                <h2 class="text-2xl font-bold flex items-center gap-2 text-orange-600">
                    <Package class="size-6" />
                    Agric Material Inventory
                </h2>
                <p class="text-sm text-muted-foreground">Dedicated stock management for agricultural structures.</p>
            </div>

            <div class="flex items-center gap-2">
                <Button variant="outline" size="sm" @click="fetchData" :disabled="loading">
                    <RefreshCw class="size-4 mr-2" :class="{ 'animate-spin': loading }" />
                    Refresh
                </Button>
            </div>
        </div>

        <Card class="border-none shadow-none bg-orange-50/50">
            <CardContent class="p-3">
                <div class="flex flex-wrap items-center gap-3">
                    <div class="relative w-full max-w-xs">
                        <Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input v-model="search" placeholder="Search Agric Items..." class="pl-9 h-9 text-[13px]"
                            @keyup.enter="fetchData" />
                    </div>

                    <Button variant="ghost" size="sm" class="text-[12px] h-9"
                        @click="activeOnly = !activeOnly; fetchData()">
                        <AlertCircle class="size-3.5 mr-2"
                            :class="activeOnly ? 'text-orange-600' : 'text-muted-foreground'" />
                        {{ activeOnly ? 'Active Items' : 'All Items' }}
                    </Button>
                </div>
            </CardContent>
        </Card>

        <AgricInventorySpreadsheetGrid 
            :items="items" 
            :categories="categories" 
            :can-manage="canManage"
            @refresh="fetchData" 
        />

        <div v-if="loading && items.length === 0" class="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 class="size-8 animate-spin text-orange-600" />
            <p class="text-sm text-muted-foreground font-medium">Loading Agric Inventory...</p>
        </div>
    </div>
</template>
