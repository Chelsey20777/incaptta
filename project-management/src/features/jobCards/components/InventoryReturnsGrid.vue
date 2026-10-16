<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
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
import { Plus, Trash2, ChevronDown, LayoutGrid, Package } from 'lucide-vue-next'
import EditableCell from '@/features/inventory/components/EditableCell.vue'
import { formatCurrency } from '@/features/inventory/utils/pricing'
import { inventoryApi } from '@/features/inventory/api/inventoryApi'
import { formatDate } from '@/lib/utils'

const props = defineProps<{
    modelValue: any[]
    generalInfo?: any
}>()

const emit = defineEmits(['update:modelValue'])

const adminStore = useAdminStore()
const { jobCategories } = storeToRefs(adminStore)

const inventoryItems = ref<any[]>([])
const activeRowIndex = ref(-1)
const activeColIndex = ref(-1)
const isEditingActive = ref(false)

const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('md')

const columns = [
    { key: 'inventoryItemId', label: 'Item Name', width: 'w-[30%]', editable: true, type: 'select' },
    { key: 'jobCategoryId', label: 'Job Category', width: 'w-[20%]', editable: true, type: 'select' },
    { key: 'qtyReturned', label: 'Qty Ret.', width: 'w-[10%]', editable: true, type: 'number', align: 'right' },
    { key: 'unitPrice', label: 'Unit Price', width: 'w-[15%]', editable: false, type: 'currency', align: 'right' },
    { key: 'totalCredit', label: 'Total Credit', width: 'w-[20%]', editable: false, type: 'currency', align: 'right' },
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
        price: item.sellingPrice,
        cost: item.totalCost ?? 0      // purchase cost — recovered as profit on return
    }))
)

function updateItem(index: number, field: string, value: any) {
    const newList = [...props.modelValue]
    const item = { ...newList[index], [field]: value }

    if (field === 'inventoryItemId') {
        const option = inventoryOptions.value.find(o => o.value === value)
        if (option) {
            item.unitPrice    = option.price
            item.costSnapshot = option.cost ?? 0   // purchase cost recovered as profit
            item.itemName     = option.label
        }
    }

    // Calculate total credit
    if (field === 'qtyReturned' || field === 'inventoryItemId') {
        item.totalCredit = (Number(item.qtyReturned || 0) * Number(item.unitPrice || 0))
    }

    newList[index] = item
    emit('update:modelValue', newList)
}

function removeItem(index: number) {
    const newList = props.modelValue.filter((_, i) => i !== index)
    emit('update:modelValue', newList)
}

function addNewItem() {
    const newItem = {
        id: crypto.randomUUID(),
        inventoryItemId: '',
        itemName: '',
        jobCategoryId: '',
        qtyReturned: 1,
        unitPrice: 0,
        totalCredit: 0,
        approvalStatus: 'PENDING',
        inventoryReturned: false
    }
    const newList = [...props.modelValue, newItem]
    emit('update:modelValue', newList)
    
    import('vue').then(({ nextTick }) => {
        nextTick(() => {
            setActiveCell(newList.length - 1, 0, true)
        })
    })
}

function setActiveCell(rowIndex: number, colIndex: number, editing = false) {
    activeRowIndex.value = rowIndex
    activeColIndex.value = colIndex
    isEditingActive.value = editing
}
</script>

<template>
    <div class="border rounded-xl overflow-hidden bg-background font-sans shadow-sm">
        <div class="overflow-x-auto max-h-[500px] overflow-y-auto relative">
            <!-- Desktop Table View -->
            <Table v-if="!isMobile" class="border-collapse table-fixed w-full border-t border-l border-white/80">
                <TableHeader class="bg-muted/50 border-b">
                    <TableRow class="h-10 hover:bg-transparent">
                        <TableHead v-for="col in columns" :key="col.key"
                            :class="[col.width, col.align === 'right' ? 'text-right' : '', 'text-[12px] font-bold px-4 border-r border-b border-white/80']">
                            {{ col.label }}
                        </TableHead>
                        <TableHead class="w-[50px] border-b border-r border-white/80"></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    <TableRow v-for="(item, idx) in modelValue" :key="item.id"
                        class="group h-10 hover:bg-muted/30 border-b border-white/80">
                        <TableCell class="p-0 border-r border-b border-white/80">
                            <div class="flex flex-col py-1">
                                <div class="flex items-center gap-2">
                                    <EditableCell :value="item.inventoryItemId" type="select" :options="inventoryOptions"
                                        :is-active="activeRowIndex === idx && activeColIndex === 0"
                                        :is-editing="isEditingActive && activeRowIndex === idx && activeColIndex === 0"
                                        @update="(v) => updateItem(idx, 'inventoryItemId', v)" @click="setActiveCell(idx, 0, true)"
                                        placeholder="Select Item" />
                                    <span v-if="item.isAdjustment"
                                        class="text-[8px] font-black bg-amber-100 text-amber-700 px-1 rounded border border-amber-200 shrink-0">ADJUSTMENT</span>
                                </div>
                                <span v-if="item.isAdjustment"
                                    class="text-[9px] font-bold text-amber-600/80 ml-1.5 mt-0.5">
                                    {{ formatDate(item.adjustmentDate || generalInfo?.updatedAt) }}
                                </span>
                            </div>
                        </TableCell>
                        <TableCell class="p-0 border-r border-b border-white/80">
                            <EditableCell :value="item.jobCategoryId" type="select" :options="jobCategoryOptions"
                                :is-active="activeRowIndex === idx && activeColIndex === 1"
                                :is-editing="isEditingActive && activeRowIndex === idx && activeColIndex === 1"
                                @update="(v) => updateItem(idx, 'jobCategoryId', v)" @click="setActiveCell(idx, 1, true)"
                                placeholder="Select Category" />
                        </TableCell>
                        <TableCell class="p-0 border-r border-b border-white/80 text-right">
                            <EditableCell :value="item.qtyReturned" type="number"
                                :is-active="activeRowIndex === idx && activeColIndex === 2"
                                :is-editing="isEditingActive && activeRowIndex === idx && activeColIndex === 2"
                                @update="(v) => updateItem(idx, 'qtyReturned', v)" @click="setActiveCell(idx, 2, true)" />
                        </TableCell>
                        <TableCell
                            class="p-4 border-r border-b border-white/80 text-right text-[12px] text-muted-foreground bg-accent/5">
                            {{ formatCurrency(item.unitPrice || 0) }}
                        </TableCell>
                        <TableCell
                            class="p-4 border-r border-b border-white/80 text-right text-[12px] font-medium bg-accent/5 text-foreground dark:text-white">
                            {{ formatCurrency(item.totalCredit || 0) }}
                        </TableCell>
                        <TableCell class="p-0 text-center border-r border-b border-white/80">
                            <Button variant="ghost" size="icon"
                                class="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100" @click="removeItem(idx)">
                                <Trash2 class="size-4" />
                            </Button>
                        </TableCell>
                    </TableRow>
                    <TableRow v-if="modelValue.length === 0">
                        <TableCell colspan="6" class="h-24 text-center text-muted-foreground text-sm">
                            No returns recorded for this Job Card.
                        </TableCell>
                    </TableRow>
                </TableBody>
            </Table>

            <!-- Mobile Card Editor -->
            <div v-else class="space-y-4 p-4 bg-muted/5">
                <div v-for="(item, idx) in modelValue" :key="item.id || idx" 
                    class="relative overflow-hidden rounded-3xl border bg-card shadow-sm transition-all border-border/60">
                    
                    <!-- Card Header -->
                    <div class="flex items-center justify-between px-4 py-3 bg-muted/30 border-b border-border/40">
                        <div class="flex items-center gap-2">
                            <span class="flex size-5 items-center justify-center rounded-full bg-brand-primary text-[10px] font-black text-white shadow-sm">
                                {{ idx + 1 }}
                            </span>
                            <span class="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Return Entry</span>
                        </div>
                        <Button variant="ghost" size="icon" class="h-8 w-8 text-rose-500 hover:text-rose-600 hover:bg-rose-50 rounded-full" @click="removeItem(idx)">
                            <Trash2 class="size-4" />
                        </Button>
                    </div>

                    <div class="p-4 space-y-4">
                        <!-- Inventory Item Selection -->
                        <div class="space-y-1.5">
                            <label class="text-[10px] font-black uppercase text-muted-foreground/70 tracking-widest ml-1">Returned Item</label>
                            <div class="relative group">
                                <select :value="item.inventoryItemId" 
                                        @change="(e: any) => updateItem(idx, 'inventoryItemId', e.target.value)"
                                        class="w-full bg-background border border-border/60 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none transition-all appearance-none shadow-sm">
                                    <option value="">Choose Inventory Item</option>
                                    <option v-for="opt in inventoryOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                                </select>
                                <div class="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground/50 group-focus-within:text-brand-primary">
                                    <ChevronDown class="size-4" />
                                </div>
                            </div>
                        </div>

                        <!-- Job Category Selection -->
                        <div class="space-y-1.5">
                            <label class="text-[10px] font-black uppercase text-muted-foreground/70 tracking-widest ml-1">Associated Job Category</label>
                            <div class="relative group">
                                <select :value="item.jobCategoryId" 
                                        @change="(e: any) => updateItem(idx, 'jobCategoryId', e.target.value)"
                                        class="w-full bg-background border border-border/60 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none transition-all appearance-none shadow-sm">
                                    <option value="">Select Category</option>
                                    <option v-for="opt in jobCategoryOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                                </select>
                                <div class="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground/50 group-focus-within:text-brand-primary">
                                    <ChevronDown class="size-4" />
                                </div>
                            </div>
                        </div>

                        <!-- Qty & Unit Price -->
                        <div class="grid grid-cols-2 gap-4">
                            <div class="space-y-1.5">
                                <label class="text-[10px] font-black uppercase text-muted-foreground/70 tracking-widest ml-1">Qty Returned</label>
                                <input type="number" :value="item.qtyReturned" 
                                       @input="(e: any) => updateItem(idx, 'qtyReturned', Number(e.target.value))"
                                       class="w-full bg-background border border-border/60 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none transition-all shadow-sm" />
                            </div>
                            <div class="space-y-1.5">
                                <label class="text-[10px] font-black uppercase text-muted-foreground/70 tracking-widest ml-1">Unit Value</label>
                                <div class="bg-muted/30 px-4 py-3 rounded-xl border border-dashed border-border/60 text-xs font-bold text-muted-foreground h-[46px] flex items-center shadow-inner">
                                    {{ formatCurrency(item.unitPrice || 0) }}
                                </div>
                            </div>
                        </div>

                        <!-- Total Credit -->
                        <div class="flex justify-between items-center p-3 rounded-2xl bg-brand-primary/5 border border-brand-primary/10 shadow-inner">
                            <div class="flex flex-col">
                                <span class="text-[10px] font-black uppercase text-muted-foreground/60 tracking-widest leading-none mb-1">Pricing Detail</span>
                                <span class="text-xs font-bold text-muted-foreground/80">{{ item.qtyReturned || 0 }} units × {{ formatCurrency(item.unitPrice || 0) }}</span>
                            </div>

                            <div class="text-right flex flex-col items-end">
                                <span class="text-[10px] font-black uppercase text-brand-primary tracking-widest leading-none mb-1">Total Credit</span>
                                <span class="text-lg font-black text-brand-primary">{{ formatCurrency(item.totalCredit || 0) }}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div v-if="modelValue.length === 0" class="flex flex-col items-center justify-center py-12 px-4 text-center space-y-4">
                    <div class="size-16 rounded-2xl bg-muted flex items-center justify-center">
                        <Plus class="size-8 text-muted-foreground/30" />
                    </div>
                    <p class="text-sm text-muted-foreground italic font-medium">No returns recorded for this job card yet.</p>
                </div>
            </div>
        </div>
        <div class="p-3 border-t bg-muted/10">
            <Button variant="ghost" size="sm" class="h-10 px-4 text-xs font-bold gap-2 text-brand-primary hover:bg-brand-primary/5" @click="addNewItem">
                <Plus class="size-4" /> Add Return Item
            </Button>
        </div>
    </div>
</template>
