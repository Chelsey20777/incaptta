<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useBreakpoints, breakpointsTailwind } from '@vueuse/core'
import { useAdminStore } from '@/features/admin/store/adminStore'
import { storeToRefs } from 'pinia'
import {
    Table,
    TableHeader,
    TableRow,
    TableHead,
    TableBody,
    TableCell
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, Lock, Search, ChevronDown, LayoutGrid, Package } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import EditableCell from '@/features/inventory/components/EditableCell.vue'
import { formatCurrency } from '@/features/inventory/utils/pricing'
import { inventoryApi } from '@/features/inventory/api/inventoryApi'
import { formatDate } from '@/lib/utils'

const props = defineProps<{
    modelValue: any[] // Now expected to be sections
    generalInfo?: any
    isAdmin?: boolean
}>()

const APPROVED_STATUSES = ['APPROVED_ACCOUNTANT', 'APPROVED_MANAGER']

function isItemLocked(item: any): boolean {
    return !props.isAdmin && APPROVED_STATUSES.includes(item.approvalStatus)
}

const emit = defineEmits(['update:modelValue'])

const adminStore = useAdminStore()
const { jobCategories } = storeToRefs(adminStore)

const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('md')

const inventoryItems = ref<any[]>([])
const activeRowIndex = ref(-1)
const activeColIndex = ref(-1)
const isEditingActive = ref(false)

const columns = [
    { key: 'index', label: '#', width: 'w-[50px]', editable: false, align: 'center' },
    { key: 'itemName', label: 'Item / Service Name', width: 'w-[30%]', editable: true, type: 'text' },
    { key: 'description', label: 'Description', width: 'w-[25%]', editable: true, type: 'textarea' },
    { key: 'qtyRequired', label: 'Qty', width: 'w-[80px]', editable: true, type: 'number', align: 'right' },
    { key: 'irdSellingPrice', label: 'Unit Price', width: 'w-[120px]', editable: true, type: 'currency', align: 'right' },
    { key: 'totalInventoryPrice', label: 'Total Price', width: 'w-[120px]', editable: false, type: 'currency', align: 'right' },
]

onMounted(async () => {
    try {
        inventoryItems.value = await inventoryApi.listInventory({ isActive: true })
    } catch (err) {
        console.error('Failed to fetch inventory items:', err)
    }
})

const jobCategoryOptions = computed(() =>
    jobCategories.value.map(cat => ({
        value: cat.id,
        label: cat.name
    }))
)

const inventoryOptions = computed(() =>
    inventoryItems.value.map(item => ({
        value: item.id,
        label: `${item.name} (${item.sku})`,
        description: item.description || '',
        price: item.sellingPrice,
        cost: item.totalCost ?? 0,      // purchase price + freight — used as costSnapshot
        markup: item.markupPercent,
        stockCount: item.onHand ?? 0,
        uom: item.uom || ''
    }))
)

function setActiveCell(rowIndex: number, colIndex: number, editing = false) {
    activeRowIndex.value = rowIndex
    activeColIndex.value = colIndex
    isEditingActive.value = editing
}

function handleKeyDown(e: KeyboardEvent) {
    if (activeRowIndex.value === -1) return

    const maxRow = props.modelValue.length
    const maxCol = columns.length - 1

    if (isEditingActive.value) {
        if (e.key === 'Enter') {
            e.preventDefault()
            isEditingActive.value = false
            if (activeRowIndex.value < maxRow) activeRowIndex.value++
        } else if (e.key === 'Tab') {
            e.preventDefault()
            isEditingActive.value = false
            if (e.shiftKey) {
                if (activeColIndex.value > 0) activeColIndex.value--
                else if (activeRowIndex.value > 0) { activeRowIndex.value--; activeColIndex.value = maxCol }
            } else {
                if (activeColIndex.value < maxCol) activeColIndex.value++
                else if (activeRowIndex.value < maxRow) { activeRowIndex.value++; activeColIndex.value = 0 }
            }
        } else if (e.key === 'Escape') {
            e.preventDefault()
            isEditingActive.value = false
        }
        return
    }

    switch (e.key) {
        case 'ArrowUp': e.preventDefault(); if (activeRowIndex.value > 0) activeRowIndex.value--; break
        case 'ArrowDown': e.preventDefault(); if (activeRowIndex.value < maxRow) activeRowIndex.value++; break
        case 'ArrowLeft': e.preventDefault(); if (activeColIndex.value > 0) activeColIndex.value--; break
        case 'ArrowRight': e.preventDefault(); if (activeColIndex.value < maxCol) activeColIndex.value++; break
        case 'Enter': e.preventDefault(); if (columns[activeColIndex.value]?.editable) isEditingActive.value = true; break
        case 'Tab':
            e.preventDefault()
            if (e.shiftKey) {
                if (activeColIndex.value > 0) activeColIndex.value--
                else if (activeRowIndex.value > 0) { activeRowIndex.value--; activeColIndex.value = maxCol }
            } else {
                if (activeColIndex.value < maxCol) activeColIndex.value++
                else if (activeRowIndex.value < maxRow) { activeRowIndex.value++; activeColIndex.value = 0 }
            }
            break
    }
}

function updateSection(index: number, field: string, value: any) {
    const newSections = [...props.modelValue]
    const updatedSection = { ...newSections[index] }

    if (field === 'jobCategoryId') {
        updatedSection.jobCategoryId = value
        const cat = jobCategories.value.find(c => c.id === value)
        if (cat && cat.unit && (!updatedSection.unit || updatedSection.unit === 'Unit')) {
            updatedSection.unit = cat.unit
        }
    } else if (field === 'qty') {
        const oldQty = Number(updatedSection.qty) || 1
        const newQty = Math.max(1, Number(value) || 1)
        updatedSection.qty = newQty
        
        const factor = newQty / oldQty
        if (updatedSection.items && updatedSection.items.length > 0) {
            updatedSection.items = updatedSection.items.map((item: any) => {
                if (isItemLocked(item)) return item
                const currentQty = item.qtyRequired || 0
                return {
                    ...item,
                    qtyRequired: parseFloat((currentQty * factor).toFixed(4))
                }
            })
        }
    } else {
        updatedSection[field] = value
    }

    newSections[index] = updatedSection
    emit('update:modelValue', newSections)
}

function updateItemInSection(sIdx: number, iIdx: number, field: string, value: any) {
    if (isItemLocked(props.modelValue[sIdx]?.items?.[iIdx])) return
    const newSections = [...props.modelValue]
    const section = { ...newSections[sIdx] }
    const items = [...section.items]
    const item = { ...items[iIdx], [field]: value }

    if (field === 'inventoryItemId') {
        const option = inventoryOptions.value.find(o => o.value === value)
        if (option) {
            item.inventoryItemId = option.value
            item.itemName        = option.label
            item.irdSellingPrice = option.price
            item.costSnapshot    = option.cost ?? 0   // snapshot totalCost at time of selection
            item.markupPercent   = 0                  // TWID markup always starts at 0 — set manually
            item.description     = option.description
        }
    }

    items[iIdx] = item
    section.items = items
    newSections[sIdx] = section
    emit('update:modelValue', newSections)
}

function removeSection(index: number) {
    const newSections = props.modelValue.filter((_: any, i: number) => i !== index)
    emit('update:modelValue', newSections)
}

function removeItemFromSection(sIdx: number, iIdx: number) {
    if (isItemLocked(props.modelValue[sIdx]?.items?.[iIdx])) return
    const newSections = [...props.modelValue]
    const section = { ...newSections[sIdx] }
    section.items = section.items.filter((_: any, i: number) => i !== iIdx)
    newSections[sIdx] = section
    emit('update:modelValue', newSections)
}

const allItemsCompleteGlobally = computed(() => {
    return props.modelValue.every(section =>
        (section.items || []).every((item: any) => !!item.inventoryItemId || !!item.itemName)
    )
})

function addNewSection() {
    if (!allItemsCompleteGlobally.value) return

    const newSection = {
        id: crypto.randomUUID(),
        jobCategoryId: '',
        description: '',
        unit: 'Unit',
        qty: 1,
        items: [],
        createdAt: new Date().toISOString()
    }
    emit('update:modelValue', [...props.modelValue, newSection])
}

const canAddItemToSection = (section: any) => {
    if (!allItemsCompleteGlobally.value) return false
    if (!section.items || section.items.length === 0) return true
    return section.items.every((item: any) => !!item.inventoryItemId || !!item.itemName)
}

function addNewItemToSection(sIdx: number, isManual = false) {
    if (!canAddItemToSection(props.modelValue[sIdx])) return

    const newSections = [...props.modelValue]
    const section = { ...newSections[sIdx] }
    const newItem = {
        id: crypto.randomUUID(),
        inventoryItemId: '',
        itemName: isManual ? 'New Service' : '',
        description: '',
        qtyRequired: 1,
        irdSellingPrice: 0,
        markupPercent: 0,
        createdAt: new Date().toISOString(),
    }
    const newItems = [...section.items, newItem]
    section.items = newItems
    newSections[sIdx] = section
    emit('update:modelValue', newSections)

    import('vue').then(({ nextTick }) => {
        nextTick(() => {
            setActiveCell(getRowIndex(sIdx, newItems.length - 1), 1, true)
        })
    })
}

function handleAddFromCatalog(sIdx: number, itemId: string) {
    if (!canAddItemToSection(props.modelValue[sIdx])) return
    const option = inventoryOptions.value.find(o => o.value === itemId)
    if (!option) return
    
    const newSections = [...props.modelValue]
    const section = { ...newSections[sIdx] }
    const newItem = {
        id: crypto.randomUUID(),
        inventoryItemId: option.value,
        itemName: option.label,
        description: option.description,
        qtyRequired: 1,
        irdSellingPrice: option.price,
        costSnapshot: option.cost ?? 0,
        markupPercent: 0,
        createdAt: new Date().toISOString(),
    }
    section.items = [...(section.items || []), newItem]
    newSections[sIdx] = section
    emit('update:modelValue', newSections)
}

// Calculations
const calculateRow = (item: any) => {
    const qty = item.qtyRequired || 0
    const price = item.irdSellingPrice || 0
    const markup = item.markupPercent || 0

    const baseIRD = qty * price
    const twidMU = baseIRD * (markup / 100)
    const subTotal = baseIRD + twidMU
    const totalInventoryPrice = subTotal

    return { baseIRD, twidMU, subTotal, totalInventoryPrice }
}

const calculateSectionTotal = (section: any) => {
    return (section.items || []).reduce((sum: number, item: any) => {
        return sum + calculateRow(item).totalInventoryPrice
    }, 0)
}

const resolveDepartmentName = (id: string) => {
    return adminStore.departments.find(d => d.id === id)?.name || 'Unknown'
}

const resolveJobCategoryName = (id: string) => {
    return (jobCategories.value.find(c => c.id === id)?.name || 'Unknown Category').toUpperCase()
}

const getRowIndex = (sIdx: any, iIdx: any) => {
    return (Number(sIdx) * 1000) + Number(iIdx) + 1
}

const getHeaderRowIndex = (sIdx: any) => {
    return Number(sIdx) * 1000
}
</script>

<template>
    <div class="border rounded-md overflow-hidden bg-background font-sans" @keydown="handleKeyDown">
        <!-- General Info Header (Summary) -->
        <div v-if="generalInfo"
            class="bg-muted/30 border-b px-4 py-2 flex flex-wrap items-center gap-x-8 gap-y-2 text-[11px]">
            <div class="flex items-center gap-2">
                <span class="font-bold text-muted-foreground uppercase tracking-tight">Job #:</span>
                <span class="font-mono text-primary font-bold">{{ generalInfo.jobNumber || 'N/A' }}</span>
            </div>
            <div v-if="generalInfo.projectLocation" class="flex items-center gap-2">
                <span class="font-bold text-muted-foreground uppercase tracking-tight">Location:</span>
                <span class="font-medium truncate max-w-[200px]">{{ generalInfo.projectLocation }}</span>
            </div>
            <div v-if="generalInfo.requestingDepartmentId" class="flex items-center gap-2">
                <span class="font-bold text-muted-foreground uppercase tracking-tight">Dept:</span>
                <span class="font-medium">{{ resolveDepartmentName(generalInfo.requestingDepartmentId) }}</span>
            </div>
            <div v-if="generalInfo.recipientName" class="flex items-center gap-2 border-l pl-8">
                <span class="font-bold text-muted-foreground uppercase tracking-tight">Customer:</span>
                <span class="font-bold text-foreground">{{ generalInfo.recipientName }}</span>
            </div>
        </div>

        <div class="overflow-x-auto max-h-[600px] overflow-y-auto relative custom-scrollbar">
            <!-- Desktop Table View -->
            <Table v-if="!isMobile" class="border-collapse table-fixed w-full min-w-[800px] border-t border-l border-white/80">
                <TableHeader class="sticky top-0 bg-background z-40 border-b shadow-sm">
                    <TableRow class="h-10 hover:bg-transparent">
                        <TableHead v-for="col in columns" :key="col.key"
                            :class="[col.width, col.align === 'right' ? 'text-right' : '', 'text-[12px] font-bold px-4 border-r border-b border-white/80']">
                            {{ col.label }}
                        </TableHead>
                        <TableHead class="w-[50px] border-b border-r border-white/80"></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    <template v-for="(section, sIdx) in modelValue" :key="section.id">
                        <!-- Category Header Row -->
                        <TableRow class="h-10 bg-muted/50 border-y-2 border-muted hover:bg-muted/60">
                            <!-- Col 1: Index -->
                            <TableCell class="p-0 border-r border-b border-white/80 bg-muted text-center text-[10px] font-black opacity-30">
                                S{{ Number(sIdx) + 1 }}
                            </TableCell>                             <!-- Col 2: Job Category -->
                            <TableCell class="p-0 border-r border-b border-white/80 bg-primary/5">
                                <div class="px-4 py-2 flex items-center gap-2">
                                    <span class="text-[10px] font-black bg-primary text-primary-foreground size-5 flex items-center justify-center rounded-full">{{ String.fromCharCode(65 + Number(sIdx)) }}</span>
                                    <EditableCell :value="section.jobCategoryId" type="select" :options="jobCategoryOptions"
                                        :is-active="activeRowIndex === getHeaderRowIndex(Number(sIdx)) && activeColIndex === 1"
                                        :is-editing="isEditingActive && activeRowIndex === getHeaderRowIndex(Number(sIdx)) && activeColIndex === 1"
                                        @update="(v) => updateSection(Number(sIdx), 'jobCategoryId', v)"
                                        @click="setActiveCell(getHeaderRowIndex(Number(sIdx)), 1, true)"
                                        class="font-black uppercase text-xs flex-1" />
                                </div>
                            </TableCell>
                            <!-- Col 3: Description -->
                            <TableCell class="p-0 border-r border-b border-white/80 bg-primary/5">
                                <EditableCell :value="section.description" type="textarea"
                                    :is-active="activeRowIndex === getHeaderRowIndex(Number(sIdx)) && activeColIndex === 2"
                                    :is-editing="isEditingActive && activeRowIndex === getHeaderRowIndex(Number(sIdx)) && activeColIndex === 2"
                                    @update="(v) => updateSection(Number(sIdx), 'description', v)"
                                    @click="setActiveCell(getHeaderRowIndex(Number(sIdx)), 2, true)"
                                    placeholder="Enter category description..."
                                    class="font-semibold italic !py-1 text-[11px]" />
                            </TableCell>
                            <!-- Col 4: Qty -->
                            <TableCell class="p-0 border-r border-b border-white/80 bg-primary/5 text-right">
                                <EditableCell :value="section.qty || 1" type="number"
                                    :is-active="activeRowIndex === getHeaderRowIndex(Number(sIdx)) && activeColIndex === 3"
                                    :is-editing="isEditingActive && activeRowIndex === getHeaderRowIndex(Number(sIdx)) && activeColIndex === 3"
                                    @update="(v) => updateSection(Number(sIdx), 'qty', v)"
                                    @click="setActiveCell(getHeaderRowIndex(Number(sIdx)), 3, true)"
                                    class="font-bold text-xs" />
                            </TableCell>
                            <!-- Col 5: Unit -->
                            <TableCell class="p-0 border-r border-b border-white/80 bg-primary/5">
                                <EditableCell :value="section.unit || 'Unit'" type="text"
                                    :is-active="activeRowIndex === getHeaderRowIndex(Number(sIdx)) && activeColIndex === 4"
                                    :is-editing="isEditingActive && activeRowIndex === getHeaderRowIndex(Number(sIdx)) && activeColIndex === 4"
                                    @update="(v) => updateSection(Number(sIdx), 'unit', v)"
                                    @click="setActiveCell(getHeaderRowIndex(Number(sIdx)), 4, true)"
                                    placeholder="e.g. sqm, birds, m"
                                    class="font-medium text-xs uppercase" />
                            </TableCell>
                            <!-- Col 6: Section Total -->
                            <TableCell
                                class="p-0 border-r border-b border-white/80 text-right bg-primary/5 font-black text-foreground dark:text-white"
                                :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === getHeaderRowIndex(Number(sIdx)) && activeColIndex === 5 }">
                                <div class="px-2 py-1 text-[12px]" @click="setActiveCell(getHeaderRowIndex(Number(sIdx)), 5)">
                                    {{ formatCurrency(calculateSectionTotal(section)) }}
                                </div>
                            </TableCell>

                            <!-- Col 7: Delete Action -->
                            <TableCell class="p-0 text-center bg-muted/50 border-r border-b border-white/80">
                                <Button variant="ghost" size="icon" class="h-7 w-7 text-destructive"
                                    @click="removeSection(Number(sIdx))">
                                    <Trash2 class="size-3" />
                                </Button>
                            </TableCell>
                        </TableRow>

                        <!-- Nested Items -->
                        <TableRow v-for="(item, iIdx) in section.items" :key="item.id"
                            class="group h-10 border-b border-white/80 transition-colors"
                            :class="[
                                isItemLocked(item) ? 'bg-muted/20 opacity-70 cursor-not-allowed' : 'hover:bg-muted/10',
                                activeRowIndex === getRowIndex(Number(sIdx), Number(iIdx)) && !isItemLocked(item) ? 'bg-muted/40' : ''
                            ]">

                            <!-- Index -->
                            <TableCell class="text-center tabular-nums font-bold text-[11px] opacity-50 border-r border-b border-white/80"
                                :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === getRowIndex(Number(sIdx), Number(iIdx)) && activeColIndex === 0 }">
                                {{ Number(iIdx) + 1 }}
                            </TableCell>

                            <!-- Item Name & Category -->
                            <TableCell
                                class="p-0 border-r border-b border-white/80 group-hover:bg-muted/30 transition-colors pl-4"
                                :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === getRowIndex(Number(sIdx), Number(iIdx)) && activeColIndex === 1 }">
                                <div class="flex flex-col py-1">
                                    <div class="flex items-center gap-2">
                                        <div class="relative flex-1 group/name">
                                            <EditableCell :value="item.itemName || item.name || item.description || ''" type="text"
                                                :read-only="isItemLocked(item)"
                                                :is-active="activeRowIndex === getRowIndex(Number(sIdx), Number(iIdx)) && activeColIndex === 1"
                                                :is-editing="isEditingActive && activeRowIndex === getRowIndex(Number(sIdx), Number(iIdx)) && activeColIndex === 1"
                                                @update="(v) => updateItemInSection(Number(sIdx), Number(iIdx), 'itemName', v)"
                                                @click="setActiveCell(getRowIndex(Number(sIdx), Number(iIdx)), 1, true)"
                                                placeholder="Enter item name or service..." />
                                            
                                            <!-- Catalog Search Trigger -->
                                            <div v-if="!isItemLocked(item)" 
                                                class="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/name:opacity-100 transition-opacity">
                                                <EditableCell :value="item.inventoryItemId" type="searchable-select"
                                                    :options="inventoryOptions"
                                                    @update="(v) => updateItemInSection(Number(sIdx), Number(iIdx), 'inventoryItemId', v)"
                                                    class="!p-0 !min-h-0 border-none bg-transparent">
                                                    <template #default>
                                                        <Button variant="ghost" size="icon" class="h-6 w-6 text-muted-foreground hover:text-primary">
                                                            <Search class="size-3" />
                                                        </Button>
                                                    </template>
                                                </EditableCell>
                                            </div>
                                        </div>

                                        <span v-if="!item.inventoryItemId"
                                            class="text-[8px] font-black bg-blue-100 text-blue-700 px-1 rounded border border-blue-200 shrink-0">OTHER SERVICE</span>
                                        
                                        <span v-if="item.isAdjustment"
                                            class="text-[8px] font-black bg-amber-100 text-amber-700 px-1 rounded border border-amber-200 shrink-0">ADJUSTMENT</span>
                                    </div>
                                    <div class="flex items-center gap-2 px-3 mt-0.5">
                                        <span class="text-[10px] text-muted-foreground italic">
                                            Group: {{ resolveJobCategoryName(item.jobCategoryId || section.jobCategoryId) }}
                                        </span>
                                        <span v-if="item.createdAt" class="text-[9px] text-yellow-500 italic">• Added: {{ formatDate(item.createdAt) }}</span>
                                    </div>
                                </div>
                            </TableCell>

                            <!-- Description -->
                            <TableCell class="p-0 border-r border-b border-white/80">
                                <EditableCell :value="item.description" type="textarea"
                                    :read-only="isItemLocked(item)"
                                    :is-active="activeRowIndex === getRowIndex(Number(sIdx), Number(iIdx)) && activeColIndex === 2"
                                    :is-editing="isEditingActive && activeRowIndex === getRowIndex(Number(sIdx), Number(iIdx)) && activeColIndex === 2"
                                    @update="(v) => updateItemInSection(Number(sIdx), Number(iIdx), 'description', v)"
                                    @click="setActiveCell(getRowIndex(Number(sIdx), Number(iIdx)), 2, true)"
                                    placeholder="Item description" />
                            </TableCell>

                            <!-- Qty -->
                            <TableCell class="p-0 border-r border-b border-white/80" :class="{'bg-blue-50/10': !item.inventoryItemId}">
                                <EditableCell :value="item.qtyRequired" type="number"
                                    :read-only="isItemLocked(item)"
                                    :className="!item.inventoryItemId ? 'border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10' : ''"
                                    :is-active="activeRowIndex === getRowIndex(Number(sIdx), Number(iIdx)) && activeColIndex === 3"
                                    :is-editing="isEditingActive && activeRowIndex === getRowIndex(Number(sIdx), Number(iIdx)) && activeColIndex === 3"
                                    @update="(v) => updateItemInSection(Number(sIdx), Number(iIdx), 'qtyRequired', v)"
                                    @click="setActiveCell(getRowIndex(Number(sIdx), Number(iIdx)), 3, true)" />
                            </TableCell>

                            <!-- Unit Price -->
                            <TableCell class="p-0 border-r border-b border-white/80 text-right" :class="{'bg-blue-50/10': !item.inventoryItemId}">
                                <EditableCell :value="item.irdSellingPrice" type="currency"
                                    :read-only="isItemLocked(item)"
                                    :className="!item.inventoryItemId ? 'border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10' : ''"
                                    :is-active="activeRowIndex === getRowIndex(Number(sIdx), Number(iIdx)) && activeColIndex === 4"
                                    :is-editing="isEditingActive && activeRowIndex === getRowIndex(Number(sIdx), Number(iIdx)) && activeColIndex === 4"
                                    @update="(v) => updateItemInSection(Number(sIdx), Number(iIdx), 'irdSellingPrice', v)"
                                    @click="setActiveCell(getRowIndex(Number(sIdx), Number(iIdx)), 4, true)" />
                            </TableCell>

                            <!-- Row Total -->
                            <TableCell class="p-0 border-r border-b border-white/80 text-right bg-accent/5 font-medium"
                                :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === getRowIndex(Number(sIdx), Number(iIdx)) && activeColIndex === 5 }">
                                <div class="px-2 py-1 text-[11px] h-full flex items-center justify-end"
                                    @click="setActiveCell(getRowIndex(Number(sIdx), Number(iIdx)), 5)">
                                    {{ formatCurrency(calculateRow(item).totalInventoryPrice) }}
                                </div>
                            </TableCell>

                            <TableCell class="p-0 text-center border-r border-b border-white/80">
                                <template v-if="isItemLocked(item)">
                                    <Lock class="size-3 mx-auto text-muted-foreground/50" />
                                </template>
                                <template v-else>
                                    <Button variant="ghost" size="icon"
                                        class="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100"
                                        @click="removeItemFromSection(Number(sIdx), Number(iIdx))">
                                        <Trash2 class="size-3" />
                                    </Button>
                                </template>
                            </TableCell>
                        </TableRow>

                        <!-- Add Item Button for Section -->
                        <TableRow class="h-8 hover:bg-transparent border-b-2 border-muted/30 mb-2">
                            <TableCell colspan="8" class="p-1 px-4">
                                <div class="flex items-center gap-2">
                                    <EditableCell value="" type="searchable-select" :options="inventoryOptions" @update="(v: string) => handleAddFromCatalog(Number(sIdx), v)">
                                        <template #default>
                                            <Button variant="ghost" size="sm"
                                                class="h-6 text-[10px] font-bold text-foreground dark:text-white hover:bg-muted/10 disabled:opacity-50 disabled:cursor-not-allowed"
                                                :disabled="!canAddItemToSection(section)">
                                                <Plus class="size-3 mr-1" /> Add from Catalog
                                            </Button>
                                        </template>
                                    </EditableCell>
                                    <span class="text-muted-foreground text-[10px]">|</span>
                                    <Button variant="ghost" size="sm"
                                        class="h-6 text-[10px] font-bold text-foreground dark:text-white hover:bg-muted/10 disabled:opacity-50 disabled:cursor-not-allowed"
                                        :disabled="!canAddItemToSection(section)"
                                        @click="addNewItemToSection(Number(sIdx), true)">
                                        <Plus class="size-3 mr-1" /> Add Other Service
                                    </Button>
                                </div>
                            </TableCell>
                        </TableRow>
                    </template>
                </TableBody>
            </Table>

            <!-- Mobile Card Editor -->
            <div v-else class="space-y-4 px-2 py-2">
                <div v-for="(section, sIdx) in modelValue" :key="section.id" 
                    class="space-y-3 rounded-xl border bg-muted/10 p-1 shadow-sm">
                    
                    <!-- Section Header -->
                    <div class="relative overflow-hidden rounded-lg border bg-card shadow-sm">
                        <div class="flex items-center justify-between px-3 py-1.5 bg-brand-primary/5 border-b border-brand-primary/10">
                            <div class="flex items-center gap-2">
                                <div class="p-1 rounded-md bg-brand-primary/10 text-brand-primary">
                                    <LayoutGrid class="size-3" />
                                </div>
                                <div class="flex flex-col">
                                    <span class="text-[9px] font-black uppercase tracking-widest text-brand-primary leading-none">Job Section {{ Number(sIdx) + 1 }}</span>
                                </div>
                            </div>
                            <Button variant="ghost" size="icon" class="h-7 w-7 text-destructive hover:bg-destructive/10 rounded-full" @click="removeSection(Number(sIdx))">
                                <Trash2 class="size-3" />
                            </Button>
                        </div>
                        <div class="p-3 space-y-3">
                            <div class="space-y-1.5">
                                <label class="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Accounting Category</label>
                                <div class="relative">
                                    <select :value="section.jobCategoryId" 
                                            @change="(e: any) => updateSection(Number(sIdx), 'jobCategoryId', e.target.value)"
                                            class="h-10 w-full rounded-lg border-border/60 bg-background px-3 text-xs font-bold focus:ring-2 focus:ring-brand-primary/20 appearance-none pr-10">
                                        <option value="">Select Category...</option>
                                        <option v-for="opt in jobCategoryOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                                    </select>
                                    <ChevronDown class="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                                </div>
                            </div>

                            <div class="grid grid-cols-2 gap-3">
                                <div class="space-y-1.5">
                                    <label class="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Section Qty</label>
                                    <input type="number" :value="section.qty || 1"
                                           @input="(e: any) => updateSection(Number(sIdx), 'qty', Number(e.target.value))"
                                           class="h-10 w-full rounded-lg border border-border/60 bg-background px-3 text-xs font-bold focus:ring-2 focus:ring-brand-primary/20" />
                                </div>
                                <div class="space-y-1.5">
                                    <label class="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Section Unit</label>
                                    <input type="text" :value="section.unit || 'Unit'"
                                           @input="(e: any) => updateSection(Number(sIdx), 'unit', e.target.value)"
                                           class="h-10 w-full rounded-lg border border-border/60 bg-background px-3 text-xs font-bold focus:ring-2 focus:ring-brand-primary/20 uppercase" />
                                </div>
                            </div>

                            <div class="space-y-1.5">
                                <label class="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Section Invoice Description</label>
                                <textarea :value="section.description" 
                                          @input="(e: any) => updateSection(Number(sIdx), 'description', e.target.value)"
                                          class="w-full bg-background border border-border/60 rounded-lg px-3 py-2 text-xs italic focus:ring-2 focus:ring-brand-primary/20 min-h-[60px]"
                                          placeholder="This text appears on the client's invoice..."></textarea>
                            </div>

                            <div class="flex justify-between items-center p-2 rounded-lg bg-brand-primary/5 border border-brand-primary/10">
                                <div class="flex items-center gap-2">
                                    <div class="size-2 rounded-full bg-brand-primary animate-pulse"></div>
                                    <span class="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Section Total</span>
                                </div>
                                <span class="text-base font-black text-brand-primary">{{ formatCurrency(calculateSectionTotal(section)) }}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Items in Section -->
                    <div class="space-y-2 px-1">
                        <div v-for="(item, iIdx) in section.items" :key="item.id" 
                            class="relative overflow-hidden rounded-xl border bg-card shadow-sm transition-all"
                            :class="[isItemLocked(item) ? 'opacity-80 bg-muted/20 border-border/50' : 'border-blue-500/10 hover:border-blue-500/30']">
                            
                            <div class="flex items-center justify-between px-3 py-1.5 bg-muted/5 border-b border-border/40">
                                <div class="flex items-center gap-2">
                                    <span class="flex size-4 items-center justify-center rounded-full bg-blue-600 text-[8px] font-black text-white shadow-sm">
                                        {{ Number(iIdx) + 1 }}
                                    </span>
                                    <span class="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Item Entry</span>
                                </div>
                                <div class="flex items-center gap-1.5">
                                    <Badge v-if="!item.inventoryItemId" variant="secondary" class="h-4 text-[7px] font-black uppercase bg-blue-100 text-blue-700 border-blue-200">Custom Service</Badge>
                                    <Badge v-if="isItemLocked(item)" variant="secondary" class="h-4 text-[7px] font-black gap-1 uppercase">
                                        <Lock class="size-2" /> Locked
                                    </Badge>
                                </div>
                            </div>

                            <div class="p-3 space-y-3">
                                <!-- Item Name & Selection -->
                                <div class="space-y-1.5">
                                    <label class="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Item / Service Name</label>
                                    <input :value="item.itemName" 
                                           :readonly="isItemLocked(item)"
                                           @input="(e: any) => updateItemInSection(Number(sIdx), Number(iIdx), 'itemName', e.target.value)"
                                           class="h-9 w-full rounded-lg border-border/60 bg-background px-3 text-xs font-bold focus:ring-2 focus:ring-brand-primary/20"
                                           placeholder="Name or service..." />
                                    
                                    <div class="pt-0.5 space-y-1">
                                        <label class="text-[8px] font-bold text-muted-foreground/60 flex items-center gap-1 ml-1">
                                            <Package class="size-2.5" /> Or link to Catalog Item
                                        </label>
                                        <div class="relative">
                                            <select :value="item.inventoryItemId" 
                                                    :disabled="isItemLocked(item)"
                                                    @change="(e: any) => updateItemInSection(Number(sIdx), Number(iIdx), 'inventoryItemId', e.target.value)"
                                                    class="h-8 w-full rounded-md border-dashed border-border/60 bg-muted/20 px-2 text-[10px] focus:ring-1 focus:ring-brand-primary appearance-none pr-8">
                                                <option value="">-- No Link (Custom Entry) --</option>
                                                <option v-for="opt in inventoryOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                                            </select>
                                            <ChevronDown class="absolute right-2 top-1/2 -translate-y-1/2 size-2.5 text-muted-foreground pointer-events-none" />
                                        </div>
                                    </div>
                                </div>

                                <!-- Item Description -->
                                <div class="space-y-1">
                                    <label class="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Item Description</label>
                                    <textarea :value="item.description" 
                                              :readonly="isItemLocked(item)"
                                              @input="(e: any) => updateItemInSection(Number(sIdx), Number(iIdx), 'description', e.target.value)"
                                              class="w-full bg-background border border-border/60 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-brand-primary/20 min-h-[40px]"
                                              placeholder="Detailed item specs..."></textarea>
                                </div>

                                <!-- Qty & Price -->
                                <div class="grid grid-cols-2 gap-3">
                                    <div class="space-y-1">
                                        <label class="text-[9px] font-black uppercase text-muted-foreground/60 ml-1">Qty Required</label>
                                        <input type="number" :value="item.qtyRequired" 
                                               :readonly="isItemLocked(item)"
                                               step="any"
                                               @input="(e: any) => updateItemInSection(Number(sIdx), Number(iIdx), 'qtyRequired', Number(e.target.value))"
                                               class="h-9 w-full rounded-lg border-border/60 bg-background px-3 text-xs font-bold focus:ring-2 focus:ring-brand-primary/20" />
                                    </div>
                                    <div class="space-y-1">
                                        <label class="text-[9px] font-black uppercase text-muted-foreground/60 ml-1">Unit Price ($)</label>
                                        <input type="number" :value="item.irdSellingPrice" 
                                               :readonly="isItemLocked(item)"
                                               step="any"
                                               @input="(e: any) => updateItemInSection(Number(sIdx), Number(iIdx), 'irdSellingPrice', Number(e.target.value))"
                                               class="h-9 w-full rounded-lg border-border/60 bg-background px-3 text-xs font-bold text-blue-600 focus:ring-2 focus:ring-brand-primary/20" />
                                    </div>
                                </div>

                                <!-- Item Actions & Total -->
                                <div class="pt-2 flex items-center justify-between border-t border-border/40">
                                    <div v-if="!isItemLocked(item)">
                                        <Button variant="ghost" size="sm" class="h-7 px-2 rounded-md text-destructive hover:bg-destructive/10 gap-1.5" 
                                            @click="removeItemFromSection(Number(sIdx), Number(iIdx))">
                                            <Trash2 class="size-3" />
                                            <span class="text-[9px] font-black uppercase">Remove</span>
                                        </Button>
                                    </div>
                                    <div v-else></div>
                                    
                                    <div class="flex flex-col items-end">
                                        <span class="text-[8px] font-black uppercase text-brand-primary tracking-widest leading-tight">Row Total</span>
                                        <span class="text-sm font-black text-brand-primary">{{ formatCurrency(calculateRow(item).totalInventoryPrice) }}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Add Item Controls (Mobile) -->
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                            <EditableCell value="" type="searchable-select" :options="inventoryOptions" @update="(v: string) => handleAddFromCatalog(Number(sIdx), v)">
                                <template #default>
                                    <Button variant="outline" size="sm" 
                                        class="w-full h-9 rounded-lg border-dashed border-brand-primary/40 text-brand-primary hover:bg-brand-primary/5 gap-2 shadow-sm"
                                        :disabled="!canAddItemToSection(section)">
                                        <Search class="size-3.5" />
                                        <span class="text-[10px] font-black uppercase">Search Catalog</span>
                                    </Button>
                                </template>
                            </EditableCell>
                            <Button variant="outline" size="sm" 
                                class="w-full h-9 rounded-lg border-dashed border-blue-500/40 text-blue-600 hover:bg-blue-500/5 gap-2 shadow-sm"
                                :disabled="!canAddItemToSection(section)"
                                @click="addNewItemToSection(Number(sIdx), true)">
                                <Plus class="size-3.5" />
                                <span class="text-[10px] font-black uppercase">Custom Service</span>
                            </Button>
                        </div>
                    </div>
                </div>

                <div v-if="modelValue.length === 0" class="flex flex-col items-center justify-center py-20 px-4 text-center space-y-5">
                    <div class="size-20 rounded-3xl bg-brand-primary/10 flex items-center justify-center shadow-inner">
                        <LayoutGrid class="size-10 text-brand-primary/30" />
                    </div>
                    <div class="space-y-2">
                        <h4 class="text-base font-black text-muted-foreground tracking-tight">Requisition Empty</h4>
                        <p class="text-sm text-muted-foreground/60 max-w-[200px] mx-auto">Add job category sections to start building your requisition.</p>
                    </div>
                </div>
            </div>
        </div>
        <div class="p-3 border-t bg-muted/10 flex flex-col md:flex-row gap-4">
            <Button variant="default" size="sm" class="h-9 md:h-8 shadow-sm font-bold" :disabled="!allItemsCompleteGlobally"
                @click="addNewSection">
                <Plus class="size-4 mr-1" /> Add Job Category Section
            </Button>
            <p class="text-[10px] text-muted-foreground flex items-center italic">
                * Note: Category rows appear as summarized lines on the Project Invoice.
            </p>
        </div>
    </div>
</template>
