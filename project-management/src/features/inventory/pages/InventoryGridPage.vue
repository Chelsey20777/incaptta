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
    Download,
    Loader2,
    Upload
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { inventoryApi } from '../api/inventoryApi'
import type { InventoryItem } from '../types'
import InventorySpreadsheetGrid from '../components/InventorySpreadsheetGrid.vue'
import { useSession } from '@/composables/useSession'
import { useRouter } from 'vue-router'
import { downloadInventoryTemplateCsv, parseAndUploadInventoryCsv } from '../utils/importCsv'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuLabel,
    DropdownMenuSeparator
} from '@/components/ui/dropdown-menu'

const { loading: sessionLoading, hasAnyRole, user } = useSession()
const router = useRouter()

// Access Gate (Reactive)
const canView = computed(() => {
    return hasAnyRole(['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'STOREKEEPER', 'MANAGER'])
})

const canManage = computed(() => {
    return hasAnyRole(['SUPER_ADMIN', 'ADMIN', 'STOREKEEPER', 'MANAGER'])
})

const items = ref<InventoryItem[]>([])
const categories = ref<any[]>([])
const loading = ref(false)
const search = ref('')
const categoryFilter = ref('all')
const activeOnly = ref(true)

const fileInputRef = ref<HTMLInputElement | null>(null)
const isImporting = ref(false)

async function fetchData() {
    if (!canView.value) return
    try {
        loading.value = true
        const [invItems, invCats] = await Promise.all([
            inventoryApi.listInventory({ search: search.value, isActive: activeOnly.value }),
            inventoryApi.fetchCategories()
        ])
        items.value = invItems
        categories.value = invCats
    } catch (err: any) {
        toast.error('Fetch Failed', { description: err.message })
    } finally {
        loading.value = false
    }
}

const filteredItems = computed(() => {
    let result = items.value
    if (categoryFilter.value !== 'all') {
        result = result.filter(i => i.categoryId === categoryFilter.value)
    }
    return result
})

// Trigger fetch when session becomes ready and authorized
watch([sessionLoading, canView], ([sLoading, authorized]) => {
    if (!sLoading && authorized && items.value.length === 0 && !loading.value) {
        fetchData()
    }
}, { immediate: true })

onMounted(() => {
    if (!sessionLoading.value && canView.value) {
        fetchData()
    }
})

const handleDownloadTemplate = () => {
    try {
        downloadInventoryTemplateCsv(items.value, categories.value)
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
    toast.loading('Importing Stock Take...', { id: 'inv-import' })
    try {
        const result = await parseAndUploadInventoryCsv(
            file,
            items.value,
            categories.value,
            { uid: user.value.uid, email: user.value.email || '' }
        )

        if (result.errors.length > 0) {
            console.warn('Import Errors:', result.errors)
            toast.error(`Imported ${result.success}. See console for ${result.errors.length} errors.`, { id: 'inv-import', duration: 8000 })
        } else {
            toast.success(`Successfully imported/adjusted ${result.success} items!`, { id: 'inv-import' })
        }
        await fetchData()
    } catch (err: any) {
        toast.error("Import Failed", { id: 'inv-import', description: err.message })
    } finally {
        isImporting.value = false
        if (fileInputRef.value) fileInputRef.value.value = '' // Reset input
    }
}
</script>

<template>
    <div v-if="sessionLoading" class="flex items-center justify-center h-[50vh]">
        <Loader2 class="size-8 animate-spin text-primary" />
    </div>

    <div v-else-if="!canView" class="flex flex-col items-center justify-center h-[50vh] space-y-4">
        <AlertCircle class="w-12 h-12 text-destructive" />
        <div class="text-center">
            <h3 class="text-lg font-semibold">Access Denied</h3>
            <p class="text-muted-foreground">You do not have permission to view the inventory master.</p>
        </div>
        <Button variant="outline" @click="router.push('/')">Go to Dashboard</Button>
    </div>

    <div v-else class="h-full space-y-4">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
                <h2 class="text-2xl font-bold flex items-center gap-2">
                    <Package class="size-6 text-primary" />
                    Inventory Master
                </h2>
                <p class="text-sm text-muted-foreground">Manage products, pricing, and stock levels in real-time.</p>
            </div>

            <div class="flex items-center gap-2">
                <input type="file" ref="fileInputRef" accept=".csv" class="hidden" @change="handleFileUpload" />

                <Button variant="outline" size="sm" @click="fetchData" :disabled="loading || isImporting">
                    <RefreshCw class="size-4 mr-2" :class="{ 'animate-spin': loading }" />
                    Refresh
                </Button>

                <DropdownMenu v-if="canManage">
                    <DropdownMenuTrigger as-child>
                        <Button variant="outline" size="sm" :disabled="isImporting">
                            <Loader2 v-if="isImporting" class="size-4 mr-2 animate-spin" />
                            <Upload v-else class="size-4 mr-2" />
                            Options
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Batch Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem @click="handleDownloadTemplate">
                            <Download class="mr-2 h-4 w-4" /> Download Stock Take Template
                        </DropdownMenuItem>
                        <DropdownMenuItem @click="triggerFileInput">
                            <Upload class="mr-2 h-4 w-4 text-primary" /> Import Stock Take (CSV)
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>

        <Card class="border-none shadow-none bg-accent/5">
            <CardContent class="p-3">
                <div class="flex flex-wrap items-center gap-3">
                    <div class="relative w-full max-w-xs">
                        <Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input v-model="search" placeholder="Search by SKU or Name..." class="pl-9 h-9 text-[13px]"
                            @keyup.enter="fetchData" />
                    </div>

                    <Select v-model="categoryFilter">
                        <SelectTrigger
                            class="w-[200px] h-9 text-[13px] border-brand-secondary text-brand-secondary transition-colors hover:bg-brand-secondary/10 bg-transparent">
                            <Filter class="size-3.5 mr-2 text-brand-secondary" />
                            <SelectValue placeholder="All Categories" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Categories</SelectItem>
                            <SelectItem v-for="cat in categories" :key="cat.id" :value="cat.id">
                                {{ cat.name }}
                            </SelectItem>
                        </SelectContent>
                    </Select>

                    <Button variant="ghost" size="sm" class="text-[12px] h-9"
                        @click="activeOnly = !activeOnly; fetchData()">
                        <AlertCircle class="size-3.5 mr-2"
                            :class="activeOnly ? 'text-primary' : 'text-muted-foreground'" />
                        {{ activeOnly ? 'Active Items' : 'All Items' }}
                    </Button>
                </div>
            </CardContent>
        </Card>

        <InventorySpreadsheetGrid :items="filteredItems" :categories="categories" :can-manage="canManage"
            @refresh="fetchData" />

        <div v-if="loading && items.length === 0" class="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 class="size-8 animate-spin text-primary" />
            <p class="text-sm text-muted-foreground font-medium">Loading Inventory Grid...</p>
        </div>

        <div v-else-if="filteredItems.length === 0 && !loading"
            class="text-center py-20 border-2 border-dashed rounded-lg">
            <Package class="size-12 text-muted-foreground/30 mx-auto mb-4" />
            <p class="text-muted-foreground">No items found matching your filters.</p>
        </div>
    </div>
</template>
