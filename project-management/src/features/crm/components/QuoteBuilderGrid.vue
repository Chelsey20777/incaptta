<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
    Table,
    TableHeader,
    TableRow,
    TableHead,
    TableBody,
    TableCell
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Plus, Trash2 } from 'lucide-vue-next'
import EditableCell from '@/features/inventory/components/EditableCell.vue'
import { formatCurrency } from '@/features/inventory/utils/pricing'
import { inventoryApi } from '@/features/inventory/api/inventoryApi'

const props = defineProps<{
    modelValue: any[]
}>()

const emit = defineEmits(['update:modelValue'])

const inventoryItems = ref<any[]>([])
const activeRowIndex = ref(-1)
const activeColIndex = ref(-1)
const isEditingActive = ref(false)

const columns = [
    { key: 'inventoryItemId', label: 'Name', width: 'w-[25%]', editable: true, type: 'select', sticky: true, left: '0' },
    { key: 'description', label: 'Description', width: 'w-[25%]', editable: true, type: 'text' },
    { key: 'qtyRequired', label: 'Qty', width: 'w-[10%]', editable: true, type: 'number', align: 'right' },
    { key: 'irdSellingPrice', label: 'IRD Selling Price', width: 'w-[14%]', editable: false, type: 'currency', align: 'right' },
    { key: 'markupPercent', label: 'TWID Markup %', width: 'w-[12%]', editable: true, type: 'percent', align: 'right' },
    { key: 'totalInventoryPrice', label: 'Total Price', width: 'w-[14%]', editable: false, type: 'currency', align: 'right' },
]

onMounted(async () => {
    try {
        inventoryItems.value = await inventoryApi.listInventory({ isActive: true })
    } catch (err) {
        console.error('Failed to fetch inventory items:', err)
    }
})

const inventoryOptions = computed(() =>
    inventoryItems.value.map(item => ({
        value: item.id,
        label: `${item.name} (${item.sku})`,
        description: item.description || '',
        price: item.sellingPrice,
        markup: item.markupPercent
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

function updateItem(index: number, field: string, value: any) {
    const newItems = [...props.modelValue]
    const item = { ...newItems[index], [field]: value }

    // Auto-populate price, description, and markup if item changed
    if (field === 'inventoryItemId') {
        const option = inventoryOptions.value.find(o => o.value === value)
        if (option) {
            item.irdSellingPrice = option.price
            item.markupPercent = Math.max(0, option.markup || 0) // Explicitly allow overriding to zero or higher, defaulting to item default
            item.itemName = option.label
            item.description = option.description // Auto-populate description
        }
    }

    newItems[index] = item
    emit('update:modelValue', newItems)
}

function removeItem(index: number) {
    const newItems = props.modelValue.filter((_, i) => i !== index)
    emit('update:modelValue', newItems)
}

function addNewRow() {
    const newItem = {
        inventoryItemId: '',
        itemName: '',
        description: '',
        qtyRequired: 1,
        irdSellingPrice: 0,
        markupPercent: 0,
    }
    emit('update:modelValue', [...props.modelValue, newItem])
    setActiveCell(props.modelValue.length, 0)
}

// Calculations
const calculateRow = (item: any) => {
    const qty = item.qtyRequired || 0
    const price = item.irdSellingPrice || 0
    const markup = item.markupPercent || 0

    const baseIRD = qty * price
    const twidMU = baseIRD * (markup / 100)
    const totalInventoryPrice = baseIRD + twidMU

    return { baseIRD, twidMU, totalInventoryPrice }
}
</script>

<template>
    <div class="border rounded-md overflow-hidden bg-background" @keydown="handleKeyDown">
        <div class="overflow-x-auto max-h-[400px] overflow-y-auto relative">
            <Table class="border-collapse table-fixed w-full min-w-[800px]">
                <TableHeader class="sticky top-0 bg-background z-40 border-b shadow-sm">
                    <TableRow class="h-10 hover:bg-transparent">
                        <TableHead v-for="col in columns" :key="col.key"
                            :class="[col.width, col.align === 'right' ? 'text-right' : '', col.sticky ? 'sticky left-0 z-50 bg-background border-r' : '', 'text-[12px] font-bold px-2']">
                            {{ col.label }}
                        </TableHead>
                        <TableHead class="w-[50px]"></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    <TableRow v-for="(item, rIdx) in modelValue" :key="rIdx"
                        class="group h-9 hover:bg-muted/30 odd:bg-muted/10 transition-colors"
                        :class="{ 'bg-muted/40': activeRowIndex === rIdx }">

                        <!-- Inventory Item -->
                        <TableCell
                            class="p-0 border-r border-muted/30 sticky left-0 z-20 bg-background group-hover:bg-muted/30 transition-colors"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === rIdx && activeColIndex === 0 }">
                            <EditableCell :value="item.inventoryItemId" type="select" :options="inventoryOptions"
                                :is-active="activeRowIndex === rIdx && activeColIndex === 0"
                                :is-editing="isEditingActive && activeRowIndex === rIdx && activeColIndex === 0"
                                @update="(v) => updateItem(rIdx, 'inventoryItemId', v)" @click="setActiveCell(rIdx, 0)"
                                placeholder="Select Catalog Item" />
                        </TableCell>

                        <!-- Description -->
                        <TableCell class="p-0 border-r border-muted/30"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === rIdx && activeColIndex === 1 }">
                            <EditableCell :value="item.description" type="text"
                                :is-active="activeRowIndex === rIdx && activeColIndex === 1"
                                :is-editing="isEditingActive && activeRowIndex === rIdx && activeColIndex === 1"
                                @update="(v) => updateItem(rIdx, 'description', v)" @click="setActiveCell(rIdx, 1)"
                                placeholder="Optional description" />
                        </TableCell>

                        <!-- Qty -->
                        <TableCell class="p-0 border-r border-muted/30"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === rIdx && activeColIndex === 2 }">
                            <EditableCell :value="item.qtyRequired" type="number"
                                :is-active="activeRowIndex === rIdx && activeColIndex === 2"
                                :is-editing="isEditingActive && activeRowIndex === rIdx && activeColIndex === 2"
                                @update="(v) => updateItem(rIdx, 'qtyRequired', v)" @click="setActiveCell(rIdx, 2)" />
                        </TableCell>

                        <!-- IRD Selling Price (Read-Only) -->
                        <TableCell class="p-0 border-r border-muted/30 text-right bg-accent/5"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === rIdx && activeColIndex === 3 }">
                            <div class="px-2 py-1 text-[12px] truncate h-full flex items-center justify-end text-muted-foreground"
                                @click="setActiveCell(rIdx, 3)">
                                {{ formatCurrency(item.irdSellingPrice || 0) }}
                            </div>
                        </TableCell>

                        <!-- Markup % -->
                        <TableCell class="p-0 border-r border-muted/30"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === rIdx && activeColIndex === 4 }">
                            <EditableCell :value="item.markupPercent" type="percent"
                                :is-active="activeRowIndex === rIdx && activeColIndex === 4"
                                :is-editing="isEditingActive && activeRowIndex === rIdx && activeColIndex === 4"
                                @update="(v) => updateItem(rIdx, 'markupPercent', v)" @click="setActiveCell(rIdx, 4)" />
                        </TableCell>

                        <!-- Total Inventory Price (Read-Only) -->
                        <TableCell class="p-0 border-r border-muted/30 text-right bg-accent/5"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === rIdx && activeColIndex === 5 }">
                            <div class="px-2 py-1 text-[12px] truncate h-full flex items-center justify-end font-medium"
                                @click="setActiveCell(rIdx, 5)">
                                {{ formatCurrency(calculateRow(item).totalInventoryPrice) }}
                            </div>
                        </TableCell>

                        <TableCell class="p-0 text-center">
                            <Button variant="ghost" size="icon"
                                class="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                @click="removeItem(rIdx)">
                                <Trash2 class="size-4" />
                            </Button>
                        </TableCell>
                    </TableRow>
                </TableBody>
            </Table>
        </div>
        <div class="p-2 border-t bg-muted/5 flex items-center gap-4 text-xs text-muted-foreground">
            <Button variant="outline" size="sm" class="h-8 border-dashed" @click="addNewRow">
                <Plus class="size-4 mr-1" /> Add Quote Row
            </Button>
            <span>* Tab/Arrow keys navigate. Enter edits.</span>
        </div>
    </div>
</template>
