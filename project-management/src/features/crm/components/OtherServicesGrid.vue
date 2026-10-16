<script setup lang="ts">
import { ref } from 'vue'
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

const props = defineProps<{
    modelValue: any[]
}>()

const emit = defineEmits(['update:modelValue'])

const activeRowIndex = ref(-1)
const activeColIndex = ref(-1)
const isEditingActive = ref(false)

const columns = [
    { key: 'description', label: 'Service Description', width: 'w-[50%]', editable: true, type: 'text' },
    { key: 'qty', label: 'Qty', width: 'w-[10%]', editable: true, type: 'number', align: 'right' },
    { key: 'unitPrice', label: 'Unit Price', width: 'w-[20%]', editable: true, type: 'currency', align: 'right' },
    { key: 'total', label: 'Total', width: 'w-[20%]', editable: false, type: 'currency', align: 'right' },
]

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
    
    // Auto-calculate total
    item.total = (item.qty || 0) * (item.unitPrice || 0)
    
    newItems[index] = item
    emit('update:modelValue', newItems)
}

function removeItem(index: number) {
    const newItems = props.modelValue.filter((_, i) => i !== index)
    emit('update:modelValue', newItems)
}

function addNewRow() {
    const newItem = {
        description: '',
        qty: 1,
        unitPrice: 0,
        total: 0
    }
    emit('update:modelValue', [...props.modelValue, newItem])
    setActiveCell(props.modelValue.length, 0, true)
}

const calculateRow = (item: any) => {
    return (item.qty || 0) * (item.unitPrice || 0)
}
</script>

<template>
    <div class="border rounded-md overflow-hidden bg-background" @keydown="handleKeyDown">
        <div class="overflow-x-auto max-h-[400px] overflow-y-auto relative">
            <Table class="border-collapse table-fixed w-full min-w-[700px]">
                <TableHeader class="sticky top-0 bg-background z-40 border-b shadow-sm">
                    <TableRow class="h-10 hover:bg-transparent">
                        <TableHead v-for="col in columns" :key="col.key"
                            :class="[col.width, col.align === 'right' ? 'text-right' : '', 'text-[12px] font-bold px-2']">
                            {{ col.label }}
                        </TableHead>
                        <TableHead class="w-[50px]"></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    <TableRow v-for="(item, rIdx) in modelValue" :key="rIdx"
                        class="group h-9 hover:bg-muted/30 odd:bg-muted/10 transition-colors"
                        :class="{ 'bg-muted/40': activeRowIndex === rIdx }">

                        <!-- Description -->
                        <TableCell class="p-0 border-r border-muted/30"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === rIdx && activeColIndex === 0 }">
                            <EditableCell :value="item.description" type="text"
                                :is-active="activeRowIndex === rIdx && activeColIndex === 0"
                                :is-editing="isEditingActive && activeRowIndex === rIdx && activeColIndex === 0"
                                @update="(v) => updateItem(rIdx, 'description', v)" @click="setActiveCell(rIdx, 0)"
                                placeholder="Service or manual fee description..." />
                        </TableCell>

                        <!-- Qty -->
                        <TableCell class="p-0 border-r border-muted/30"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === rIdx && activeColIndex === 1 }">
                            <EditableCell :value="item.qty" type="number"
                                :is-active="activeRowIndex === rIdx && activeColIndex === 1"
                                :is-editing="isEditingActive && activeRowIndex === rIdx && activeColIndex === 1"
                                @update="(v) => updateItem(rIdx, 'qty', v)" @click="setActiveCell(rIdx, 1)" />
                        </TableCell>

                        <!-- Unit Price -->
                        <TableCell class="p-0 border-r border-muted/30"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === rIdx && activeColIndex === 2 }">
                            <EditableCell :value="item.unitPrice" type="currency"
                                :is-active="activeRowIndex === rIdx && activeColIndex === 2"
                                :is-editing="isEditingActive && activeRowIndex === rIdx && activeColIndex === 2"
                                @update="(v) => updateItem(rIdx, 'unitPrice', v)" @click="setActiveCell(rIdx, 2)" />
                        </TableCell>

                        <!-- Total (Read-Only) -->
                        <TableCell class="p-0 border-r border-muted/30 text-right bg-accent/5"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === rIdx && activeColIndex === 3 }">
                            <div class="px-2 py-1 text-[12px] truncate h-full flex items-center justify-end font-medium"
                                @click="setActiveCell(rIdx, 3)">
                                {{ formatCurrency(calculateRow(item)) }}
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
                <Plus class="size-4 mr-1" /> Add Service Row
            </Button>
        </div>
    </div>
</template>
