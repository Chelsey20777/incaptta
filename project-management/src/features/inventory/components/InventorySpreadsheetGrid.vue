<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import {
    TableHeader,
    TableRow,
    TableHead,
    TableBody,
    TableCell
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Plus, Save, Loader2, Info, Trash2, CheckSquare, Square } from 'lucide-vue-next'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { InventoryItem } from '../types'
import EditableCell from './EditableCell.vue'
import { computeTotalCost, computeSellingPrice, formatCurrency } from '../utils/pricing'
import { inventoryApi } from '../api/inventoryApi'
import { useSession } from '@/composables/useSession'
import { toast } from 'vue-sonner'
import { useBreakpoints, breakpointsTailwind } from '@vueuse/core'
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
    SheetFooter,
} from '@/components/ui/sheet'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
    Select as UISelect,
    SelectContent as UISelectContent,
    SelectItem as UISelectItem,
    SelectTrigger as UISelectTrigger,
    SelectValue as UISelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

const props = defineProps<{
    items: InventoryItem[]
    categories: any[]
    canManage?: boolean
}>()

const emit = defineEmits<{
    (e: 'refresh'): void
}>()

const { user } = useSession()
const savingId = ref<string | null>(null)
const selectedIds = ref<Set<string>>(new Set())

// Mobile View State
const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('md')
const isMobileEditOpen = ref(false)
const mobileEditItem = ref<InventoryItem | null>(null)

const isAllSelected = computed(() => {
    return props.items.length > 0 && selectedIds.value.size === props.items.length
})

function toggleAllSelection() {
    if (isAllSelected.value) {
        selectedIds.value.clear()
    } else {
        props.items.forEach(item => selectedIds.value.add(item.id))
    }
}

function toggleSelection(id: string) {
    if (selectedIds.value.has(id)) {
        selectedIds.value.delete(id)
    } else {
        selectedIds.value.add(id)
    }
}

async function handleDeleteItem(item: InventoryItem) {
    if (!window.confirm(`Are you sure you want to delete "${item.name}"? This action cannot be undone.`)) return

    try {
        savingId.value = item.id
        await inventoryApi.deleteInventoryItem(item.id)
        toast.success('Item Deleted', { description: `${item.name} has been removed.` })
        emit('refresh')
    } catch (err: any) {
        toast.error('Deletion Failed', { description: err.message })
    } finally {
        savingId.value = null
    }
}

async function handleBulkDelete() {
    const count = selectedIds.value.size
    if (count === 0) return
    if (!window.confirm(`Are you sure you want to delete ${count} selected items? This action cannot be undone.`)) return

    try {
        savingId.value = 'bulk'
        await inventoryApi.bulkDeleteInventoryItems(Array.from(selectedIds.value))
        toast.success('Bulk Deletion Successful', { description: `${count} items removed.` })
        selectedIds.value.clear()
        emit('refresh')
    } catch (err: any) {
        toast.error('Bulk Deletion Failed', { description: err.message })
    } finally {
        savingId.value = null
    }
}

// --- Add Item Row State ---
const showAddRow = ref(false)
const newItem = reactive<Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>>({
    sku: '',
    name: '',
    description: '',
    categoryId: '',
    categoryName: '',
    uom: 'PCS',
    onHand: 0,
    isActive: true,
    purchasePrice: 0,
    freightDuty: 0,
    totalCost: 0,
    markupPercent: 0,
    sellingPrice: 0
})

const categoryOptions = computed(() =>
    props.categories.map(c => ({ value: c.id, label: c.name }))
)

// --- Computed Updates for New Item ---
function updateNewItemPricing() {
    newItem.totalCost = computeTotalCost(newItem.purchasePrice, newItem.freightDuty)
    newItem.sellingPrice = computeSellingPrice(newItem.totalCost, newItem.markupPercent)
}

async function handleSaveNewItem() {
    if (!newItem.sku || !newItem.name || !newItem.categoryId) {
        toast.error('Missing Required Fields', { description: 'SKU, Name, and Category are required.' })
        return
    }

    try {
        savingId.value = 'new'
        const category = props.categories.find(c => c.id === newItem.categoryId)
        newItem.categoryName = category?.name || ''

        await inventoryApi.createInventoryItem({ ...newItem }, { uid: user.value?.uid!, email: user.value?.email! })
        toast.success('Item Created', { description: `${newItem.name} added to inventory.` })

        // Reset
        showAddRow.value = false
        Object.assign(newItem, {
            sku: '', name: '', description: '', categoryId: '', categoryName: '', uom: 'PCS',
            onHand: 0, isActive: true, purchasePrice: 0, freightDuty: 0,
            totalCost: 0, markupPercent: 0, sellingPrice: 0
        })
        emit('refresh')
    } catch (err: any) {
        toast.error('Failed to Create Item', { description: err.message })
    } finally {
        savingId.value = null
    }
}

// --- Grid Selection & Navigation State ---
const activeRowIndex = ref(-1)
const activeColIndex = ref(-1)
const isEditingActive = ref(false)

const columns = [
    { key: 'categoryId', label: 'Category', width: 'w-[180px]', editable: true, type: 'select', sticky: true, left: '0' },
    { key: 'name', label: 'Name', width: 'w-[250px]', editable: true, type: 'text', sticky: true, left: '180px' },
    { key: 'description', label: 'Description', width: 'w-[250px]', editable: true, type: 'text' },
    { key: 'sku', label: 'SKU', width: 'w-[120px]', editable: true, type: 'text' },
    { key: 'uom', label: 'UOM', width: 'w-[80px]', editable: true, type: 'text' },
    { key: 'onHand', label: 'Qty', width: 'w-[100px]', editable: true, type: 'number', align: 'right' },
    { key: 'purchasePrice', label: 'Purchase $', width: 'w-[120px]', editable: true, type: 'currency', align: 'right' },
    { key: 'freightDuty', label: 'Freight', width: 'w-[100px]', editable: true, type: 'number', align: 'right' },
    { key: 'totalCost', label: 'Cost $', width: 'w-[120px]', editable: false, type: 'currency', align: 'right' },
    { key: 'markupPercent', label: 'Markup %', width: 'w-[90px]', editable: true, type: 'percent', align: 'right' },
    { key: 'sellingPrice', label: 'IRD (Selling $)', width: 'w-[120px]', editable: false, type: 'currency', align: 'right', primary: true },
    { key: 'totalPurchaseVal', label: 'Total Purchase $', width: 'w-[130px]', editable: false, type: 'currency', align: 'right' },
    { key: 'totalFreightVal', label: 'Total Freight', width: 'w-[120px]', editable: false, type: 'number', align: 'right' },
    { key: 'totalCostVal', label: 'Total Cost $', width: 'w-[130px]', editable: false, type: 'currency', align: 'right' },
    { key: 'totalSellingVal', label: 'Total IRD Selling $', width: 'w-[140px]', editable: false, type: 'currency', align: 'right', primary: true },
]

const gridTotals = computed(() => {
    return props.items.reduce(
        (acc, item) => {
            acc.totalPurchase += (item.onHand ?? 0) * (item.purchasePrice ?? 0)
            acc.totalFreight  += (item.onHand ?? 0) * (item.freightDuty ?? 0)
            acc.totalCost     += (item.onHand ?? 0) * (item.totalCost ?? 0)
            acc.totalSelling  += (item.onHand ?? 0) * (item.sellingPrice ?? 0)
            return acc
        },
        { totalPurchase: 0, totalFreight: 0, totalCost: 0, totalSelling: 0 }
    )
})

function setActiveCell(rowIndex: number, colIndex: number, editing = false) {
    activeRowIndex.value = rowIndex
    activeColIndex.value = colIndex
    isEditingActive.value = editing
}

function handleKeyDown(e: KeyboardEvent) {
    // If not in the grid area or focused on some other input (not our cells), ignore
    if (activeRowIndex.value === -1) return

    const maxRow = props.items.length + (showAddRow.value ? 0 : -1)
    const maxCol = columns.length - 1

    // If editing, only handle specific keys that SHOULD break out of edit mode
    if (isEditingActive.value) {
        if (e.key === 'Enter') {
            e.preventDefault()
            isEditingActive.value = false
            // Move down
            if (activeRowIndex.value < maxRow) {
                activeRowIndex.value++
            }
        } else if (e.key === 'Tab') {
            e.preventDefault()
            isEditingActive.value = false
            if (e.shiftKey) {
                // Move left
                if (activeColIndex.value > 0) {
                    activeColIndex.value--
                } else if (activeRowIndex.value > 0) {
                    activeRowIndex.value--
                    activeColIndex.value = maxCol
                }
            } else {
                // Move right
                if (activeColIndex.value < maxCol) {
                    activeColIndex.value++
                } else if (activeRowIndex.value < maxRow) {
                    activeRowIndex.value++
                    activeColIndex.value = 0
                }
            }
        } else if (e.key === 'Escape') {
            e.preventDefault()
            isEditingActive.value = false
        }
        return
    }

    // Navigation mode
    switch (e.key) {
        case 'ArrowUp':
            e.preventDefault()
            if (activeRowIndex.value > 0) activeRowIndex.value--
            break
        case 'ArrowDown':
            e.preventDefault()
            if (activeRowIndex.value < maxRow) activeRowIndex.value++
            break
        case 'ArrowLeft':
            e.preventDefault()
            if (activeColIndex.value > 0) activeColIndex.value--
            break
        case 'ArrowRight':
            e.preventDefault()
            if (activeColIndex.value < maxCol) activeColIndex.value++
            break
        case 'Enter':
            e.preventDefault()
            // Only start editing if the column is editable
            if (columns[activeColIndex.value]?.editable) {
                isEditingActive.value = true
            }
            break
        case 'Tab':
            e.preventDefault()
            if (e.shiftKey) {
                if (activeColIndex.value > 0) {
                    activeColIndex.value--
                } else if (activeRowIndex.value > 0) {
                    activeRowIndex.value--
                    activeColIndex.value = maxCol
                }
            } else {
                if (activeColIndex.value < maxCol) {
                    activeColIndex.value++
                } else if (activeRowIndex.value < maxRow) {
                    activeRowIndex.value++
                    activeColIndex.value = 0
                }
            }
            break
    }
}

async function updateItem(item: InventoryItem, field: keyof InventoryItem, value: any) {
    try {
        savingId.value = item.id
        const patch: any = { [field]: value }

        // Auto-calculate dependencies
        if (['purchasePrice', 'freightDuty', 'markupPercent'].includes(field)) {
            const pPrice = field === 'purchasePrice' ? value : item.purchasePrice
            const fDuty = field === 'freightDuty' ? value : item.freightDuty
            const mPercent = field === 'markupPercent' ? value : item.markupPercent

            const newTotal = computeTotalCost(pPrice, fDuty)
            const newSelling = computeSellingPrice(newTotal, mPercent)

            patch.totalCost = newTotal
            patch.sellingPrice = newSelling
        }

        if (field === 'categoryId') {
            const cat = props.categories.find(c => c.id === value)
            patch.categoryName = cat?.name || ''
        }

        await inventoryApi.updateInventoryItem(item.id, patch, { uid: user.value?.uid!, email: user.value?.email! })
        // Optimistic UI update or refresh
        emit('refresh')
    } catch (err: any) {
        toast.error('Update Failed', { description: err.message })
    } finally {
        savingId.value = null
    }
}

function openMobileEdit(item: InventoryItem) {
    mobileEditItem.value = JSON.parse(JSON.stringify(item)) // Deep clone for safe local edits
    isMobileEditOpen.value = true
}

function openMobileAdd() {
    mobileEditItem.value = {
        id: 'new',
        sku: '',
        name: '',
        description: '',
        categoryId: '',
        categoryName: '',
        uom: 'PCS',
        onHand: 0,
        isActive: true,
        purchasePrice: 0,
        freightDuty: 0,
        totalCost: 0,
        markupPercent: 0,
        sellingPrice: 0
    } as any
    isMobileEditOpen.value = true
}

async function handleMobileSave() {
    if (!mobileEditItem.value) return
    const item = mobileEditItem.value

    if (!item.sku || !item.name || !item.categoryId) {
        toast.error('Missing Required Fields', { description: 'SKU, Name, and Category are required.' })
        return
    }

    try {
        savingId.value = item.id
        if (item.id === 'new') {
            await inventoryApi.createInventoryItem({ ...item }, { uid: user.value?.uid!, email: user.value?.email! })
            toast.success('Item Created')
        } else {
            // Simplified: Save everything in the current object
            // Usually we'd diff, but for the mobile sheet, we'll push the whole state
            await inventoryApi.updateInventoryItem(item.id, { ...item }, { uid: user.value?.uid!, email: user.value?.email! })
            toast.success('Item Updated')
        }
        isMobileEditOpen.value = false
        emit('refresh')
    } catch (err: any) {
        toast.error('Save Failed', { description: err.message })
    } finally {
        savingId.value = null
    }
}

function updateMobilePricing() {
    if (!mobileEditItem.value) return
    const item = mobileEditItem.value
    item.totalCost = computeTotalCost(item.purchasePrice, item.freightDuty)
    item.sellingPrice = computeSellingPrice(item.totalCost, item.markupPercent)
}
</script>

<template>
    <div v-if="!isMobile" class="border rounded-md bg-background flex flex-col h-[calc(100vh-270px)] min-h-[400px]"
        @keydown="handleKeyDown">
        <div class="overflow-auto flex-1 relative">
            <table class="caption-bottom text-sm border-collapse min-w-[2200px] w-max">
                <TableHeader class="sticky top-0 bg-background z-40 border-b shadow-sm drop-shadow-sm">
                    <TableRow class="h-10 hover:bg-transparent text-[11px] uppercase font-bold whitespace-nowrap"
                        :style="{ backgroundColor: 'var(--inv-grid-header-bg)', color: 'var(--inv-grid-header-text)' }">
                        <TableHead class="w-[40px] px-2 text-center sticky left-0 z-50 border-r"
                            :style="{ backgroundColor: 'var(--inv-grid-header-bg)', color: 'var(--inv-grid-header-text)', borderColor: 'var(--inv-grid-border)' }">
                            <input type="checkbox" :checked="isAllSelected" @change="toggleAllSelection"
                                class="rounded border-gray-300" />
                        </TableHead>
                        <TableHead class="w-[180px] px-2 sticky left-[40px] z-50 border-r"
                            :style="{ backgroundColor: 'var(--inv-grid-header-bg)', color: 'var(--inv-grid-header-text)', borderColor: 'var(--inv-grid-border)' }">
                            Category
                        </TableHead>
                        <TableHead class="w-[250px] px-2 sticky left-[220px] z-50 border-r"
                            :style="{ backgroundColor: 'var(--inv-grid-header-bg)', color: 'var(--inv-grid-header-text)', borderColor: 'var(--inv-grid-border)' }">
                            Name
                        </TableHead>
                        <TableHead class="w-[250px] px-2" :style="{ color: 'var(--inv-grid-header-text)' }">Description
                        </TableHead>
                        <TableHead class="w-[120px] px-2" :style="{ color: 'var(--inv-grid-header-text)' }">SKU
                        </TableHead>
                        <TableHead class="w-[80px] px-2" :style="{ color: 'var(--inv-grid-header-text)' }">UOM
                        </TableHead>
                        <TableHead class="w-[100px] px-2 text-right" :style="{ color: 'var(--inv-grid-header-text)' }">
                            Qty
                        </TableHead>
                        <TableHead class="w-[120px] px-2 text-right" :style="{ color: 'var(--inv-grid-header-text)' }">
                            Purchase $</TableHead>
                        <TableHead class="w-[100px] px-2 text-right" :style="{ color: 'var(--inv-grid-header-text)' }">
                            Freight</TableHead>
                        <TableHead class="w-[120px] px-2 text-right" :style="{ color: 'var(--inv-grid-header-text)' }">
                            Cost
                            $</TableHead>
                        <TableHead class="w-[90px] px-2 text-right" :style="{ color: 'var(--inv-grid-header-text)' }">
                            Markup
                            %</TableHead>
                        <TableHead class="w-[120px] px-2 text-right" :style="{ color: 'var(--inv-grid-header-text)' }">
                            IRD
                            (Selling $)
                        </TableHead>
                        <TableHead class="w-[130px] px-2 text-right" :style="{ color: 'var(--inv-grid-header-text)' }">
                            Total Purchase $
                        </TableHead>
                        <TableHead class="w-[120px] px-2 text-right" :style="{ color: 'var(--inv-grid-header-text)' }">
                            Total Freight
                        </TableHead>
                        <TableHead class="w-[130px] px-2 text-right" :style="{ color: 'var(--inv-grid-header-text)' }">
                            Total Cost $
                        </TableHead>
                        <TableHead class="w-[140px] px-2 text-right" :style="{ color: 'var(--inv-grid-header-text)' }">
                            Total IRD Selling $
                        </TableHead>
                        <TableHead class="w-[60px] px-2 text-center" :style="{ color: 'var(--inv-grid-header-text)' }">
                            Action</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    <TableRow v-for="(item, rIdx) in items" :key="item.id"
                        class="group h-9 hover:bg-muted/30 odd:bg-muted/10 transition-colors"
                        :class="{ 'opacity-50': savingId === item.id, 'bg-muted/40': activeRowIndex === rIdx || selectedIds.has(item.id) }">

                        <!-- Checkbox -->
                        <TableCell
                            class="p-0 border-r border-muted/30 sticky left-0 z-20 bg-background group-hover:bg-muted/30 transition-colors text-center shadow-sm">
                            <input type="checkbox" :checked="selectedIds.has(item.id)"
                                @change="toggleSelection(item.id)" class="rounded border-gray-300 mx-auto" />
                        </TableCell>

                        <!-- Category -->
                        <TableCell class="p-0 border-r border-muted/30 sticky left-[40px] z-20 transition-colors"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === rIdx && activeColIndex === 0 }"
                            :style="{ backgroundColor: 'var(--inv-grid-secondary-bg)', borderColor: 'var(--inv-grid-border)' }">
                            <EditableCell :value="item.categoryId" type="select" :options="categoryOptions"
                                :is-active="activeRowIndex === rIdx && activeColIndex === 0"
                                :is-editing="isEditingActive && activeRowIndex === rIdx && activeColIndex === 0"
                                @update="(v) => updateItem(item, 'categoryId', v)" @click="setActiveCell(rIdx, 0)" />
                        </TableCell>

                        <!-- Name -->
                        <TableCell
                            class="p-0 border-r border-muted/30 sticky left-[220px] z-20 bg-background group-hover:bg-muted/30 transition-colors shadow-sm"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === rIdx && activeColIndex === 1 }">
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger as-child>
                                        <div class="w-full">
                                            <EditableCell :value="item.name"
                                                :is-active="activeRowIndex === rIdx && activeColIndex === 1"
                                                :is-editing="isEditingActive && activeRowIndex === rIdx && activeColIndex === 1"
                                                @update="(v) => updateItem(item, 'name', v)"
                                                @click="setActiveCell(rIdx, 1)" />
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent v-if="item.name?.length > 40">
                                        {{ item.name }}
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </TableCell>

                        <!-- Description -->
                        <TableCell class="p-0 border-r border-muted/30 transition-colors"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === rIdx && activeColIndex === 2 }"
                            :style="{ backgroundColor: 'var(--inv-grid-secondary-bg)', borderColor: 'var(--inv-grid-border)' }">
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger as-child>
                                        <div class="w-full">
                                            <EditableCell :value="item.description"
                                                :is-active="activeRowIndex === rIdx && activeColIndex === 2"
                                                :is-editing="isEditingActive && activeRowIndex === rIdx && activeColIndex === 2"
                                                @update="(v) => updateItem(item, 'description', v)"
                                                @click="setActiveCell(rIdx, 2)" />
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent v-if="(item.description?.length || 0) > 30">
                                        {{ item.description }}
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </TableCell>

                        <!-- SKU -->
                        <TableCell class="p-0 border-r border-muted/30 text-muted-foreground"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === rIdx && activeColIndex === 3 }">
                            <EditableCell :value="item.sku" :is-active="activeRowIndex === rIdx && activeColIndex === 3"
                                :is-editing="isEditingActive && activeRowIndex === rIdx && activeColIndex === 3"
                                @update="(v) => updateItem(item, 'sku', v)" @click="setActiveCell(rIdx, 3)" />
                        </TableCell>

                        <!-- UOM -->
                        <TableCell class="p-0 border-r border-muted/30"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === rIdx && activeColIndex === 4 }">
                            <EditableCell :value="item.uom" :is-active="activeRowIndex === rIdx && activeColIndex === 4"
                                :is-editing="isEditingActive && activeRowIndex === rIdx && activeColIndex === 4"
                                @update="(v) => updateItem(item, 'uom', v)" @click="setActiveCell(rIdx, 4)" />
                        </TableCell>

                        <!-- Qty -->
                        <TableCell class="p-0 border-r border-muted/30 text-right"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === rIdx && activeColIndex === 5 }">
                            <EditableCell :value="item.onHand" type="number"
                                :is-active="activeRowIndex === rIdx && activeColIndex === 5"
                                :is-editing="isEditingActive && activeRowIndex === rIdx && activeColIndex === 5"
                                @update="(v) => updateItem(item, 'onHand', v)" @click="setActiveCell(rIdx, 5)" />
                        </TableCell>

                        <!-- Purchase Price -->
                        <TableCell class="p-0 border-r border-muted/30 text-right"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === rIdx && activeColIndex === 6 }">
                            <EditableCell :value="item.purchasePrice" type="currency"
                                :is-active="activeRowIndex === rIdx && activeColIndex === 6"
                                :is-editing="isEditingActive && activeRowIndex === rIdx && activeColIndex === 6"
                                @update="(v) => updateItem(item, 'purchasePrice', v)" @click="setActiveCell(rIdx, 6)" />
                        </TableCell>

                        <!-- Freight -->
                        <TableCell class="p-0 border-r border-muted/30 text-right"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === rIdx && activeColIndex === 7 }">
                            <EditableCell :value="item.freightDuty" type="number"
                                :is-active="activeRowIndex === rIdx && activeColIndex === 7"
                                :is-editing="isEditingActive && activeRowIndex === rIdx && activeColIndex === 7"
                                @update="(v) => updateItem(item, 'freightDuty', v)" @click="setActiveCell(rIdx, 7)" />
                        </TableCell>

                        <!-- Total Cost (Read-Only) -->
                        <TableCell
                            class="p-0 border-r border-muted/30 text-right font-medium text-muted-foreground bg-accent/5"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === rIdx && activeColIndex === 8 }">
                            <div class="px-2 py-1 text-[12px] truncate h-full flex items-center justify-end"
                                @click="setActiveCell(rIdx, 8)">
                                {{ formatCurrency(item.totalCost) }}
                            </div>
                        </TableCell>

                        <!-- Markup -->
                        <TableCell class="p-0 border-r border-muted/30 text-right"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === rIdx && activeColIndex === 9 }">
                            <EditableCell :value="item.markupPercent" type="percent"
                                :is-active="activeRowIndex === rIdx && activeColIndex === 9"
                                :is-editing="isEditingActive && activeRowIndex === rIdx && activeColIndex === 9"
                                @update="(v) => updateItem(item, 'markupPercent', v)" @click="setActiveCell(rIdx, 9)" />
                        </TableCell>

                        <!-- Selling Price (Read-Only) -->
                        <TableCell class="p-0 border-r border-muted/30 text-right font-bold transition-colors"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === rIdx && activeColIndex === 10 }"
                            :style="{ backgroundColor: 'var(--inv-grid-secondary-bg)', color: 'var(--inv-grid-header-text)', borderColor: 'var(--inv-grid-border)' }">
                            <div class="px-2 py-1 text-[12px] truncate h-full flex items-center justify-end"
                                @click="setActiveCell(rIdx, 10)">
                                {{ formatCurrency(item.sellingPrice) }}
                            </div>
                        </TableCell>

                        <!-- Total Purchase $ (Read-Only) -->
                        <TableCell class="p-0 border-r border-muted/30 text-right font-medium bg-accent/5"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === rIdx && activeColIndex === 11 }"
                            @click="setActiveCell(rIdx, 11)">
                            <div class="px-2 py-1 text-[12px] truncate h-full flex items-center justify-end">
                                {{ formatCurrency(item.onHand * item.purchasePrice) }}
                            </div>
                        </TableCell>

                        <!-- Total Freight (Read-Only) -->
                        <TableCell class="p-0 border-r border-muted/30 text-right font-medium bg-accent/5"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === rIdx && activeColIndex === 12 }"
                            @click="setActiveCell(rIdx, 12)">
                            <div class="px-2 py-1 text-[12px] truncate h-full flex items-center justify-end">
                                {{ formatCurrency(item.onHand * item.freightDuty) }}
                            </div>
                        </TableCell>

                        <!-- Total Cost $ (Read-Only) -->
                        <TableCell class="p-0 border-r border-muted/30 text-right font-medium bg-accent/5"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === rIdx && activeColIndex === 13 }"
                            @click="setActiveCell(rIdx, 13)">
                            <div class="px-2 py-1 text-[12px] truncate h-full flex items-center justify-end">
                                {{ formatCurrency(item.onHand * item.totalCost) }}
                            </div>
                        </TableCell>

                        <!-- Total IRD Selling $ (Read-Only) -->
                        <TableCell class="p-0 border-r border-muted/30 text-right font-bold transition-colors"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === rIdx && activeColIndex === 14 }"
                            :style="{ backgroundColor: 'var(--inv-grid-secondary-bg)', color: 'var(--inv-grid-header-text)', borderColor: 'var(--inv-grid-border)' }"
                            @click="setActiveCell(rIdx, 14)">
                            <div class="px-2 py-1 text-[12px] truncate h-full flex items-center justify-end">
                                {{ formatCurrency(item.onHand * item.sellingPrice) }}
                            </div>
                        </TableCell>

                        <TableCell class="p-0 text-center">
                            <div class="flex items-center justify-center gap-1">
                                <Loader2 v-if="savingId === item.id" class="size-3 animate-spin text-primary" />
                                <Button v-else-if="canManage" variant="ghost" size="icon"
                                    class="size-6 h-6 w-6 text-muted-foreground hover:text-destructive"
                                    @click="handleDeleteItem(item)">
                                    <Trash2 class="size-3.5" />
                                </Button>
                            </div>
                        </TableCell>
                    </TableRow>

                    <!-- Totals Footer Row -->
                    <TableRow v-if="items.length > 0" class="h-9 font-bold text-xs border-t-2"
                        :style="{ backgroundColor: 'var(--inv-grid-header-bg)', color: 'var(--inv-grid-header-text)', borderColor: 'var(--inv-grid-border)' }">
                        <TableCell class="border-r sticky left-0 z-20 px-2"
                            :style="{ backgroundColor: 'var(--inv-grid-header-bg)', borderColor: 'var(--inv-grid-border)' }">
                        </TableCell>
                        <TableCell class="border-r sticky left-[40px] z-20 px-2 uppercase tracking-wider text-[10px]"
                            :style="{ backgroundColor: 'var(--inv-grid-header-bg)', borderColor: 'var(--inv-grid-border)' }">
                            Totals
                        </TableCell>
                        <!-- Name, Description, SKU, UOM, Qty, Purchase $, Freight, Cost $, Markup %, IRD -->
                        <TableCell colspan="10"
                            :style="{ backgroundColor: 'var(--inv-grid-header-bg)', borderColor: 'var(--inv-grid-border)' }">
                        </TableCell>
                        <TableCell class="px-2 text-right border-r"
                            :style="{ backgroundColor: 'var(--inv-grid-header-bg)', color: 'var(--inv-grid-header-text)', borderColor: 'var(--inv-grid-border)' }">
                            {{ formatCurrency(gridTotals.totalPurchase) }}
                        </TableCell>
                        <TableCell class="px-2 text-right border-r"
                            :style="{ backgroundColor: 'var(--inv-grid-header-bg)', color: 'var(--inv-grid-header-text)', borderColor: 'var(--inv-grid-border)' }">
                            {{ formatCurrency(gridTotals.totalFreight) }}
                        </TableCell>
                        <TableCell class="px-2 text-right border-r"
                            :style="{ backgroundColor: 'var(--inv-grid-header-bg)', color: 'var(--inv-grid-header-text)', borderColor: 'var(--inv-grid-border)' }">
                            {{ formatCurrency(gridTotals.totalCost) }}
                        </TableCell>
                        <TableCell class="px-2 text-right border-r font-bold"
                            :style="{ backgroundColor: 'var(--inv-grid-secondary-bg)', color: 'var(--inv-grid-header-text)', borderColor: 'var(--inv-grid-border)' }">
                            {{ formatCurrency(gridTotals.totalSelling) }}
                        </TableCell>
                        <TableCell :style="{ backgroundColor: 'var(--inv-grid-header-bg)' }"></TableCell>
                    </TableRow>

                    <!-- Add New Item Row -->
                    <TableRow v-if="showAddRow" class="group h-10 bg-accent/20 border-t-2 border-primary"
                        :class="{ 'bg-muted/40': activeRowIndex === items.length }">
                        <TableCell
                            class="p-0 border-r border-muted/30 sticky left-0 z-20 bg-background group-hover:bg-muted/30 transition-colors text-center shadow-sm">
                        </TableCell>
                        <TableCell
                            class="p-0 border-r border-muted/30 sticky left-[40px] z-20 bg-background group-hover:bg-muted/30 transition-colors"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === items.length && activeColIndex === 0 }">
                            <EditableCell :value="newItem.categoryId" type="select" :options="categoryOptions"
                                :is-active="activeRowIndex === items.length && activeColIndex === 0"
                                :is-editing="isEditingActive && activeRowIndex === items.length && activeColIndex === 0"
                                placeholder="Select Category" @update="(v) => newItem.categoryId = v"
                                @click="setActiveCell(items.length, 0)" />
                        </TableCell>
                        <TableCell
                            class="p-0 border-r border-muted/30 sticky left-[220px] z-20 bg-background group-hover:bg-muted/30 transition-colors shadow-sm"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === items.length && activeColIndex === 1 }">
                            <EditableCell :value="newItem.name" placeholder="Item Name"
                                :is-active="activeRowIndex === items.length && activeColIndex === 1"
                                :is-editing="isEditingActive && activeRowIndex === items.length && activeColIndex === 1"
                                @update="(v) => newItem.name = v" @click="setActiveCell(items.length, 1)" />
                        </TableCell>
                        <TableCell class="p-0 border-r border-muted/30"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === items.length && activeColIndex === 2 }">
                            <EditableCell :value="newItem.description" placeholder="Description"
                                :is-active="activeRowIndex === items.length && activeColIndex === 2"
                                :is-editing="isEditingActive && activeRowIndex === items.length && activeColIndex === 2"
                                @update="(v) => newItem.description = v" @click="setActiveCell(items.length, 2)" />
                        </TableCell>
                        <TableCell class="p-0 border-r border-muted/30"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === items.length && activeColIndex === 3 }">
                            <EditableCell :value="newItem.sku" placeholder="SKU"
                                :is-active="activeRowIndex === items.length && activeColIndex === 3"
                                :is-editing="isEditingActive && activeRowIndex === items.length && activeColIndex === 3"
                                @update="(v) => newItem.sku = v" @click="setActiveCell(items.length, 3)" />
                        </TableCell>
                        <TableCell class="p-0 border-r border-muted/30"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === items.length && activeColIndex === 4 }">
                            <EditableCell :value="newItem.uom" placeholder="PCS"
                                :is-active="activeRowIndex === items.length && activeColIndex === 4"
                                :is-editing="isEditingActive && activeRowIndex === items.length && activeColIndex === 4"
                                @update="(v) => newItem.uom = v" @click="setActiveCell(items.length, 4)" />
                        </TableCell>
                        <TableCell class="p-0 border-r border-muted/30 text-right"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === items.length && activeColIndex === 5 }">
                            <EditableCell :value="newItem.onHand" type="number"
                                :is-active="activeRowIndex === items.length && activeColIndex === 5"
                                :is-editing="isEditingActive && activeRowIndex === items.length && activeColIndex === 5"
                                @update="(v) => newItem.onHand = v" @click="setActiveCell(items.length, 5)" />
                        </TableCell>
                        <TableCell class="p-0 border-r border-muted/30 text-right"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === items.length && activeColIndex === 6 }">
                            <EditableCell :value="newItem.purchasePrice" type="number"
                                :is-active="activeRowIndex === items.length && activeColIndex === 6"
                                :is-editing="isEditingActive && activeRowIndex === items.length && activeColIndex === 6"
                                @update="(v) => { newItem.purchasePrice = v; updateNewItemPricing() }"
                                @click="setActiveCell(items.length, 6)" />
                        </TableCell>
                        <TableCell class="p-0 border-r border-muted/30 text-right"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === items.length && activeColIndex === 7 }">
                            <EditableCell :value="newItem.freightDuty" type="number"
                                :is-active="activeRowIndex === items.length && activeColIndex === 7"
                                :is-editing="isEditingActive && activeRowIndex === items.length && activeColIndex === 7"
                                @update="(v) => { newItem.freightDuty = v; updateNewItemPricing() }"
                                @click="setActiveCell(items.length, 7)" />
                        </TableCell>
                        <TableCell class="p-0 border-r border-muted/30 text-right bg-muted/30 text-xs font-mono"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === items.length && activeColIndex === 8 }">
                            <div class="px-2 py-1 h-full flex items-center justify-end"
                                @click="setActiveCell(items.length, 8)">
                                ${{ newItem.totalCost.toFixed(2) }}
                            </div>
                        </TableCell>
                        <TableCell class="p-0 border-r border-muted/30 text-right"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === items.length && activeColIndex === 9 }">
                            <EditableCell :value="newItem.markupPercent" type="number"
                                :is-active="activeRowIndex === items.length && activeColIndex === 9"
                                :is-editing="isEditingActive && activeRowIndex === items.length && activeColIndex === 9"
                                @update="(v) => { newItem.markupPercent = v; updateNewItemPricing() }"
                                @click="setActiveCell(items.length, 9)" />
                        </TableCell>
                        <TableCell
                            class="p-0 border-r border-muted/30 text-right bg-primary/10 font-bold text-xs font-mono"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === items.length && activeColIndex === 10 }">
                            <div class="px-2 py-1 h-full flex items-center justify-end"
                                @click="setActiveCell(items.length, 10)">
                                ${{ newItem.sellingPrice.toFixed(2) }}
                            </div>
                        </TableCell>
                        <TableCell class="p-0 border-r border-muted/30 text-right bg-muted/30 text-xs font-mono"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === items.length && activeColIndex === 11 }">
                            <div class="px-2 py-1 h-full flex items-center justify-end"
                                @click="setActiveCell(items.length, 11)">
                                {{ formatCurrency(newItem.onHand * newItem.purchasePrice) }}
                            </div>
                        </TableCell>
                        <TableCell class="p-0 border-r border-muted/30 text-right bg-muted/30 text-xs font-mono"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === items.length && activeColIndex === 12 }">
                            <div class="px-2 py-1 h-full flex items-center justify-end"
                                @click="setActiveCell(items.length, 12)">
                                {{ formatCurrency(newItem.onHand * newItem.freightDuty) }}
                            </div>
                        </TableCell>
                        <TableCell class="p-0 border-r border-muted/30 text-right bg-muted/30 text-xs font-mono"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === items.length && activeColIndex === 13 }">
                            <div class="px-2 py-1 h-full flex items-center justify-end"
                                @click="setActiveCell(items.length, 13)">
                                {{ formatCurrency(newItem.onHand * newItem.totalCost) }}
                            </div>
                        </TableCell>
                        <TableCell class="p-0 border-r border-muted/30 text-right bg-primary/10 font-bold text-xs font-mono"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === items.length && activeColIndex === 14 }">
                            <div class="px-2 py-1 h-full flex items-center justify-end"
                                @click="setActiveCell(items.length, 14)">
                                {{ formatCurrency(newItem.onHand * newItem.sellingPrice) }}
                            </div>
                        </TableCell>
                        <TableCell class="p-0 text-center"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === items.length && activeColIndex === 15 }">
                            <Button variant="default" size="icon"
                                class="size-7 bg-primary hover:bg-primary/90 shadow-md" @click="handleSaveNewItem"
                                :disabled="!!savingId">
                                <Loader2 v-if="savingId === 'new'" class="size-4 animate-spin" />
                                <Save v-else class="size-4" />
                            </Button>
                        </TableCell>
                    </TableRow>
                </TableBody>
            </table>
        </div>

        <div class="p-2 border-t flex justify-between items-center bg-muted/5">
            <div class="flex items-center gap-2">
                <Button v-if="!showAddRow" variant="outline" size="sm" class="h-8 border-dashed"
                    @click="isMobile ? openMobileAdd() : (showAddRow = true)">
                    <Plus class="size-4 mr-1" /> Add Row
                </Button>
                <div v-else-if="!isMobile" class="flex items-center gap-2">
                    <Button variant="outline" size="sm" class="h-8" @click="showAddRow = false">
                        Cancel
                    </Button>
                    <Button variant="default" size="sm" class="h-8 bg-primary font-bold shadow-sm"
                        @click="handleSaveNewItem" :disabled="!!savingId">
                        <Loader2 v-if="savingId === 'new'" class="size-4 mr-2 animate-spin" />
                        <Save v-else class="size-4 mr-2" />
                        Save New Item
                    </Button>
                </div>

                <Button v-if="selectedIds.size > 0 && canManage && !isMobile" variant="destructive" size="sm" class="h-8 ml-2"
                    @click="handleBulkDelete" :disabled="!!savingId">
                    <Trash2 class="size-4 mr-1" /> Delete Selected ({{ selectedIds.size }})
                </Button>
            </div>

            <div
                class="flex items-center gap-2 text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                <Info class="size-3" />
                Click cells to edit • Calculations update instantly
            </div>
        </div>
    </div>

    <!-- Mobile Card View -->
    <div v-else class="space-y-3 pb-20">
        <Card v-for="item in items" :key="item.id" class="overflow-hidden border-orange-100 shadow-sm active:bg-muted transition-colors" @click="openMobileEdit(item)">
            <CardContent class="p-4 space-y-4">
                <div class="flex items-start justify-between">
                    <div class="space-y-1">
                        <span class="text-[10px] font-bold text-orange-600 uppercase tracking-widest">{{ item.sku }}</span>
                        <h3 class="font-bold text-base leading-tight">{{ item.name }}</h3>
                        <Badge variant="outline" class="text-[9px] h-4 font-bold border-orange-200 text-orange-700">
                            {{ item.categoryName || 'Uncategorized' }}
                        </Badge>
                    </div>
                    <div class="text-right">
                        <span class="text-[10px] font-bold text-muted-foreground uppercase">Stock</span>
                        <p class="text-xl font-black leading-none mt-1" :class="(item.onHand ?? 0) <= 0 ? 'text-destructive' : 'text-foreground'">
                            {{ item.onHand }} <span class="text-[10px] text-muted-foreground font-normal lowercase">{{ item.uom }}</span>
                        </p>
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-4 py-3 border-y border-dashed">
                    <div class="space-y-0.5">
                        <span class="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Unit Cost</span>
                        <p class="text-sm font-bold">{{ formatCurrency(item.totalCost) }}</p>
                    </div>
                    <div class="space-y-0.5 text-right">
                        <span class="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">IRD Selling Price</span>
                        <p class="text-base font-black text-orange-600">{{ formatCurrency(item.sellingPrice) }}</p>
                    </div>
                </div>

                <div class="flex items-center justify-between text-[11px]">
                    <span class="text-muted-foreground">Markup: {{ item.markupPercent }}%</span>
                    <Button variant="ghost" size="sm" class="h-8 text-destructive px-2" @click.stop="handleDeleteItem(item)">
                        <Trash2 class="size-3 mr-1" /> Delete
                    </Button>
                </div>
            </CardContent>
        </Card>
    </div>

    <!-- Mobile Edit Sheet -->
    <Sheet v-model:open="isMobileEditOpen">
        <SheetContent side="bottom" class="h-[85vh] p-0 flex flex-col border-none shadow-2xl rounded-t-3xl overflow-hidden">
            <SheetHeader class="p-6 border-b bg-accent/5">
                <SheetTitle>{{ mobileEditItem?.id === 'new' ? 'Add New Product' : 'Edit Inventory Item' }}</SheetTitle>
                <SheetDescription>
                    All values reflect real-time calculations.
                </SheetDescription>
            </SheetHeader>

            <div v-if="mobileEditItem" class="flex-1 overflow-y-auto p-6 space-y-6 pb-32">
                <!-- Basic Info Segment -->
                <div class="space-y-4">
                    <h3 class="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">Product Details</h3>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-2 col-span-2">
                            <Label>Product Name *</Label>
                            <Input v-model="mobileEditItem.name" placeholder="Enter product name" class="h-11" />
                        </div>
                        <div class="space-y-2">
                            <Label>SKU *</Label>
                            <Input v-model="mobileEditItem.sku" placeholder="SKU-001" class="h-11" />
                        </div>
                        <div class="space-y-2">
                            <Label>Category *</Label>
                            <UISelect v-model="mobileEditItem.categoryId">
                                <UISelectTrigger class="h-11">
                                    <UISelectValue placeholder="Select Category" />
                                </UISelectTrigger>
                                <UISelectContent>
                                    <UISelectItem v-for="cat in categories" :key="cat.id" :value="cat.id">
                                        {{ cat.name }}
                                    </UISelectItem>
                                </UISelectContent>
                            </UISelect>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-2">
                            <Label>On Hand Stock</Label>
                            <Input type="number" v-model.number="mobileEditItem.onHand" class="h-11" />
                        </div>
                        <div class="space-y-2">
                            <Label>UOM</Label>
                            <Input v-model="mobileEditItem.uom" placeholder="PCS" class="h-11" />
                        </div>
                    </div>
                </div>

                <!-- Pricing & Calculations Segment -->
                <div class="space-y-4 pt-4 border-t">
                    <h3 class="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">Pricing & Costs</h3>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-2">
                            <Label>Purchase Price ($)</Label>
                            <Input type="number" step="0.01" v-model.number="mobileEditItem.purchasePrice" class="h-11" @input="updateMobilePricing" />
                        </div>
                        <div class="space-y-2">
                            <Label>Freight / Duty ($)</Label>
                            <Input type="number" step="0.01" v-model.number="mobileEditItem.freightDuty" class="h-11" @input="updateMobilePricing" />
                        </div>
                        <div class="space-y-2">
                            <Label>Markup (%)</Label>
                            <Input type="number" v-model.number="mobileEditItem.markupPercent" class="h-11" @input="updateMobilePricing" />
                        </div>
                    </div>

                    <!-- Calculated Results -->
                    <div class="bg-primary/5 rounded-xl p-4 grid grid-cols-2 gap-4 border border-primary/10">
                        <div>
                            <span class="text-[10px] font-bold text-muted-foreground uppercase">Total Cost</span>
                            <p class="text-lg font-bold">{{ formatCurrency(mobileEditItem.totalCost) }}</p>
                        </div>
                        <div class="text-right">
                            <span class="text-[10px] font-bold text-orange-600 uppercase">Selling Price</span>
                            <p class="text-2xl font-black text-orange-600 leading-none">{{ formatCurrency(mobileEditItem.sellingPrice) }}</p>
                        </div>
                    </div>
                </div>
            </div>

            <SheetFooter class="p-6 border-t bg-background absolute bottom-0 left-0 right-0">
                <Button class="w-full h-12 text-lg font-bold" @click="handleMobileSave" :disabled="!!savingId">
                    <Loader2 v-if="savingId" class="mr-2 size-5 animate-spin" />
                    {{ mobileEditItem?.id === 'new' ? 'Create Product' : 'Save Changes' }}
                </Button>
            </SheetFooter>
        </SheetContent>
    </Sheet>
</template>
