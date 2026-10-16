<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useBreakpoints, breakpointsTailwind } from '@vueuse/core'
import {
    Table,
    TableHeader,
    TableRow,
    TableHead,
    TableBody,
    TableCell
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, Lock, ChevronDown, Users, Wallet } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { toast } from 'vue-sonner'
import EditableCell from '@/features/inventory/components/EditableCell.vue'
import { formatCurrency } from '@/features/inventory/utils/pricing'
import { useHrStore } from '@/features/hr/store/hrStore'
import { storeToRefs } from 'pinia'
import type { StaffRate } from '../types'
import { formatDate } from '@/lib/utils'
import { PAYMENT_METHODS } from '@/constants/payment'

const props = defineProps<{
    modelValue: StaffRate[]
    generalInfo?: any
    isAdmin?: boolean
}>()

const emit = defineEmits<{
    'update:modelValue': [value: StaffRate[]]
}>()

const hrStore = useHrStore()
const { employees } = storeToRefs(hrStore)

// Fetch employees when component mounts
onMounted(() => {
    hrStore.fetchEmployees()
})

const APPROVED_STATUSES = ['APPROVED_ACCOUNTANT', 'APPROVED_MANAGER']

function isRowLocked(item: StaffRate): boolean {
    return !props.isAdmin && APPROVED_STATUSES.includes(item.approvalStatus || '')
}

const activeRowIndex = ref(-1)
const activeColIndex = ref(-1)
const isEditingActive = ref(false)

const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('md')

const columns = [
    { key: 'index', label: '#', width: 'w-[40px]', editable: false, align: 'center' },
    { key: 'employeeId', label: 'Name', editable: true, type: 'select' },
    { key: 'employmentCode', label: 'Employment Code', width: 'w-[14%]', editable: false, type: 'text' },
    { key: 'nationalId', label: 'ID. Number', width: 'w-[14%]', editable: false, type: 'text' },
    { key: 'jobRateAmount', label: 'Job Rate Amount', width: 'w-[16%]', editable: true, type: 'currency', align: 'right' },
    { key: 'paymentMethod', label: 'Debit Account', width: 'w-[13%]', editable: true, type: 'select' },
    { key: 'approvalStatus', label: 'Status', width: 'w-[18%]', editable: false, type: 'text' },
]

function setActiveCell(rowIndex: number, colIndex: number, editing = false) {
    const item = props.modelValue[rowIndex]
    if (item && isRowLocked(item)) return
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

function updateItem(index: number, field: keyof StaffRate, value: any) {
    const item = props.modelValue[index]
    if (!item || isRowLocked(item)) return
    const newItems = [...props.modelValue]
    const updatedItem = { ...item, [field]: value } as StaffRate
    newItems[index] = updatedItem
    emit('update:modelValue', newItems)
}

function removeItem(index: number) {
    const item = props.modelValue[index]
    if (!item || isRowLocked(item)) return
    const newItems = props.modelValue.filter((_, i) => i !== index)
    emit('update:modelValue', newItems)
}

function addNewRow() {
    const newItem: StaffRate = {
        id: crypto.randomUUID(),
        employeeId: '',
        jobRateAmount: 0,
        paymentMethod: 'CASH',
        createdAt: new Date().toISOString(),
    }
    const newList = [...props.modelValue, newItem]
    emit('update:modelValue', newList)
    
    import('vue').then(({ nextTick }) => {
        nextTick(() => {
            setActiveCell(newList.length - 1, 1, true)
        })
    })
}

const employeeOptions = computed(() => {
    return employees.value.map(e => ({
        value: e.id!,
        label: e.fullName
    }))
})

function getEmployee(employeeId: string) {
    return employees.value.find(e => e.id === employeeId)
}

function getEmploymentCode(employeeId: string): string {
    const emp = getEmployee(employeeId)
    return emp?.id?.slice(-6).toUpperCase() || 'N/A'
}

function getNationalId(employeeId: string): string {
    const emp = getEmployee(employeeId)
    return emp?.nationalId || 'N/A'
}

function getStatusBadgeClass(status?: string): string {
    switch (status) {
        case 'APPROVED_MANAGER': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
        case 'APPROVED_ACCOUNTANT': return 'bg-blue-500/10 text-blue-600 border-blue-500/20'
        case 'REJECTED': return 'bg-red-500/10 text-red-600 border-red-500/20'
        default: return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'
    }
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
            <div v-if="generalInfo.recipientName" class="flex items-center gap-2 border-l pl-8">
                <span class="font-bold text-muted-foreground uppercase tracking-tight">Customer:</span>
                <span class="font-bold text-foreground">{{ generalInfo.recipientName }}</span>
            </div>
        </div>

        <div class="overflow-x-auto max-h-[400px] overflow-y-auto relative">
            <!-- Desktop Table View -->
            <Table v-if="!isMobile" class="border-collapse table-fixed w-full min-w-[700px] border-t border-l border-white/80">
                <TableHeader class="sticky top-0 bg-background z-40 border-b border-white/80 shadow-sm">
                    <TableRow class="h-10 hover:bg-transparent">
                        <TableHead v-for="col in columns" :key="col.key"
                            :class="[col.width, col.align === 'right' ? 'text-right' : '', 'text-[12px] font-bold px-2 border-r border-b border-white/80']">
                            {{ col.label }}
                        </TableHead>
                        <TableHead class="w-[50px] border-b border-r border-white/80"></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    <TableRow v-for="(item, rIdx) in modelValue" :key="item.id"
                        class="group h-10 border-b border-white/80"
                        :class="[
                            isRowLocked(item) ? 'bg-muted/20 opacity-70 cursor-not-allowed' : 'hover:bg-muted/30',
                            activeRowIndex === rIdx && !isRowLocked(item) ? 'bg-muted/40' : ''
                        ]">
                        <!-- Index -->
                        <TableCell class="text-center tabular-nums font-bold text-[11px] opacity-50 border-r border-b border-white/80"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === rIdx && activeColIndex === 0 }">
                            {{ Number(rIdx) + 1 }}
                        </TableCell>

                        <!-- Employee Name (Select) -->
                        <TableCell class="p-0 border-r border-b border-white/80"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === rIdx && activeColIndex === 1 }">
                            <div class="flex flex-col py-1">
                                <div class="flex items-center gap-2">
                                    <EditableCell :value="item.employeeId" type="select" :options="employeeOptions"
                                        :read-only="isRowLocked(item)"
                                        :is-active="activeRowIndex === rIdx && activeColIndex === 1"
                                        :is-editing="isEditingActive && activeRowIndex === rIdx && activeColIndex === 1"
                                        @update="(v) => updateItem(rIdx, 'employeeId', v)" @click="setActiveCell(rIdx, 1, true)"
                                        placeholder="Select employee..." />
                                    <span v-if="item.isAdjustment"
                                        class="text-[8px] font-black bg-amber-100 text-amber-700 px-1 rounded border border-amber-200 shrink-0">ADJUSTMENT</span>
                                </div>
                                <div class="flex items-center gap-2 px-3 mt-0.5">
                                    <span v-if="item.createdAt && item.createdAt.includes('T')" class="text-[9px] text-yellow-500 italic">Added: {{ new Date(item.createdAt).toLocaleString() }}</span>
                                    <span v-else-if="item.isAdjustment"
                                        class="text-[9px] font-bold text-amber-600/80">
                                        {{ formatDate(item.adjustmentDate || generalInfo?.updatedAt) }}
                                    </span>
                                </div>
                            </div>
                        </TableCell>

                        <!-- Employment Code (Display Only) -->
                        <TableCell class="p-0 border-r border-b border-white/80 bg-muted/10"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === rIdx && activeColIndex === 2 }">
                            <div class="px-2 py-1 text-[12px] truncate h-full flex items-center text-muted-foreground"
                                @click="setActiveCell(rIdx, 2)">
                                {{ getEmploymentCode(item.employeeId) }}
                            </div>
                        </TableCell>

                        <!-- ID Number (Display Only) -->
                        <TableCell class="p-0 border-r border-b border-white/80 bg-muted/10"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === rIdx && activeColIndex === 3 }">
                            <div class="px-2 py-1 text-[12px] truncate h-full flex items-center text-muted-foreground"
                                @click="setActiveCell(rIdx, 3)">
                                {{ getNationalId(item.employeeId) }}
                            </div>
                        </TableCell>

                        <!-- Job Rate Amount -->
                        <TableCell class="p-0 border-r border-b border-white/80"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === rIdx && activeColIndex === 4 }">
                            <EditableCell :value="item.jobRateAmount" type="currency"
                                :read-only="isRowLocked(item)"
                                :is-active="activeRowIndex === rIdx && activeColIndex === 4"
                                :is-editing="isEditingActive && activeRowIndex === rIdx && activeColIndex === 4"
                                @update="(v) => updateItem(rIdx, 'jobRateAmount', v)" @click="setActiveCell(rIdx, 4, true)" />
                        </TableCell>

                        <!-- Debit Account / Payment Method -->
                        <TableCell class="p-0 border-r border-b border-white/80 text-xs"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === rIdx && activeColIndex === 5 }">
                            <EditableCell :value="item.paymentMethod || 'CASH'" type="select" :options="PAYMENT_METHODS"
                                :read-only="isRowLocked(item)"
                                :is-active="activeRowIndex === rIdx && activeColIndex === 5"
                                :is-editing="isEditingActive && activeRowIndex === rIdx && activeColIndex === 5"
                                @update="(v) => updateItem(rIdx, 'paymentMethod', v)" @click="setActiveCell(rIdx, 5, true)" />
                        </TableCell>

                        <!-- Approval Status -->
                        <TableCell class="p-0 border-r border-b border-white/80 text-center"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === rIdx && activeColIndex === 6 }">
                            <div class="px-2 py-1 text-[11px] h-full flex items-center justify-center"
                                @click="setActiveCell(rIdx, 6)">
                                <span v-if="item.approvalStatus" class="text-xs px-2 py-0.5 rounded-full border"
                                    :class="getStatusBadgeClass(item.approvalStatus)">
                                    {{ item.approvalStatus.replace('_', ' ') }}
                                </span>
                                <span v-else class="text-xs px-2 py-0.5 rounded-full border bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
                                    PENDING
                                </span>
                            </div>
                        </TableCell>

                        <TableCell class="p-0 text-center border-r border-b border-white/80">
                            <template v-if="isRowLocked(item)">
                                <Lock class="size-3 mx-auto text-muted-foreground/50" />
                            </template>
                            <template v-else>
                                <Button variant="ghost" size="icon"
                                    class="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                    @click="removeItem(rIdx)">
                                    <Trash2 class="size-4" />
                                </Button>
                            </template>
                        </TableCell>
                    </TableRow>
                </TableBody>
            </Table>

            <!-- Mobile Card Editor -->
            <div v-else class="space-y-6 px-2 py-4">
                <div v-for="(item, rIdx) in modelValue" :key="item.id || rIdx" 
                    class="relative overflow-hidden rounded-2xl border bg-card shadow-lg transition-all active:scale-[0.99]"
                    :class="[isRowLocked(item) ? 'opacity-80 bg-muted/20 border-border/50' : 'border-emerald-500/20 shadow-emerald-500/5']">
                    
                    <!-- Card Header: Index & Status -->
                    <div class="flex items-center justify-between px-4 py-3 bg-muted/10 border-b border-border/50">
                        <div class="flex items-center gap-3">
                            <span class="flex size-7 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-black text-white shadow-sm">
                                {{ Number(rIdx) + 1 }}
                            </span>
                            <div class="flex flex-col">
                                <span class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground leading-none">Staff Rate Entry</span>
                                <span v-if="item.createdAt" class="text-[9px] text-muted-foreground italic mt-0.5">
                                    {{ new Date(item.createdAt).toLocaleDateString() }}
                                </span>
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            <Badge v-if="item.isAdjustment" variant="outline" class="bg-amber-100 text-amber-700 border-amber-200 text-[8px] font-black h-5">ADJ</Badge>
                            <Badge v-if="isRowLocked(item)" variant="secondary" class="h-5 text-[8px] font-black gap-1 uppercase">
                                <Lock class="size-2" /> Locked
                            </Badge>
                        </div>
                    </div>

                    <div class="p-4 space-y-6">
                        <!-- Employee Selection Section -->
                        <div class="space-y-2">
                            <label class="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70 ml-1">Staff Member</label>
                            <div class="relative">
                                <select :value="item.employeeId" 
                                        :disabled="isRowLocked(item)"
                                        @change="(e: any) => updateItem(rIdx, 'employeeId', e.target.value)"
                                        class="h-12 w-full rounded-xl border-border/60 bg-background px-4 text-sm font-bold focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50 transition-all shadow-sm appearance-none pr-10">
                                    <option value="">Select Employee...</option>
                                    <option v-for="opt in employeeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                                </select>
                                <ChevronDown class="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                            </div>
                        </div>

                        <!-- Staff Identity Details -->
                        <div class="rounded-2xl bg-muted/30 p-4 space-y-5 border border-border/40">
                            <div class="flex items-center gap-2 mb-1">
                                <div class="p-1.5 rounded-lg bg-emerald-600/10 text-emerald-600">
                                    <Users class="size-4" />
                                </div>
                                <span class="text-[11px] font-black uppercase tracking-widest text-foreground/80">Employment Details</span>
                            </div>
                            <div class="grid grid-cols-2 gap-4">
                                <div class="space-y-2">
                                    <label class="text-[10px] font-black uppercase text-muted-foreground/60 ml-1">Emp. Code</label>
                                    <div class="h-11 w-full rounded-xl border border-border/60 bg-background/50 flex items-center px-4 text-xs font-bold text-muted-foreground shadow-inner">
                                        {{ getEmploymentCode(item.employeeId) || '—' }}
                                    </div>
                                </div>
                                <div class="space-y-2">
                                    <label class="text-[10px] font-black uppercase text-muted-foreground/60 ml-1">National ID</label>
                                    <div class="h-11 w-full rounded-xl border border-border/60 bg-background/50 flex items-center px-4 text-[10px] font-bold text-muted-foreground shadow-inner overflow-hidden">
                                        {{ getNationalId(item.employeeId) || '—' }}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Rate & Status Row -->
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div class="space-y-2">
                                <label class="text-[10px] font-black uppercase text-muted-foreground/60 ml-1">Job Rate Amount ($)</label>
                                <input type="number" :value="item.jobRateAmount" 
                                       :disabled="isRowLocked(item)"
                                       @input="(e: any) => updateItem(rIdx, 'jobRateAmount', Number(e.target.value))"
                                       class="h-12 w-full rounded-xl border-border/60 bg-background px-4 text-base font-black text-emerald-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all shadow-sm"
                                       placeholder="0.00" />
                            </div>
                            
                            <!-- Debit Account -->
                            <div class="space-y-2">
                                <label class="text-[10px] font-black uppercase text-muted-foreground/60 ml-1 flex items-center gap-1">
                                    <Wallet class="size-3 text-muted-foreground/40" /> Debit Account
                                </label>
                                <div class="relative">
                                    <select :value="item.paymentMethod || 'CASH'"
                                            :disabled="isRowLocked(item)"
                                            @change="(e: any) => updateItem(rIdx, 'paymentMethod', e.target.value)"
                                            class="h-12 w-full rounded-xl border-border/60 bg-background px-4 text-sm font-bold focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50 transition-all shadow-sm appearance-none pr-10">
                                        <option v-for="opt in PAYMENT_METHODS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                                    </select>
                                    <ChevronDown class="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                                </div>
                            </div>

                            <div class="space-y-2">
                                <label class="text-[10px] font-black uppercase text-muted-foreground/60 ml-1">Approval Status</label>
                                <div class="h-12 w-full flex items-center">
                                    <Badge v-if="item.approvalStatus" class="h-8 px-4 text-[10px] font-black uppercase tracking-wider"
                                        :class="getStatusBadgeClass(item.approvalStatus)">
                                        {{ item.approvalStatus.replace('_', ' ') }}
                                    </Badge>
                                    <Badge v-else class="h-8 px-4 text-[10px] font-black uppercase tracking-wider bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
                                        PENDING
                                    </Badge>
                                </div>
                            </div>
                        </div>

                        <!-- Card Actions -->
                        <div v-if="!isRowLocked(item)" class="pt-4 border-t border-border/50">
                            <Button variant="ghost" size="sm" 
                                class="h-11 w-full rounded-xl text-destructive hover:bg-destructive/10 gap-2 border border-destructive/10"
                                @click="removeItem(rIdx)">
                                <Trash2 class="size-4" />
                                <span class="text-[11px] font-black uppercase">Remove This Staff Entry</span>
                            </Button>
                        </div>
                    </div>
                </div>

                <div v-if="modelValue.length === 0" class="flex flex-col items-center justify-center py-20 px-4 text-center space-y-5">
                    <div class="size-20 rounded-3xl bg-emerald-500/10 flex items-center justify-center shadow-inner">
                        <Users class="size-10 text-emerald-500/30" />
                    </div>
                    <div class="space-y-2">
                        <h4 class="text-base font-black text-muted-foreground tracking-tight">No Staff Assigned</h4>
                        <p class="text-sm text-muted-foreground/60 max-w-[200px] mx-auto">Start by adding staff members to this job card.</p>
                    </div>
                </div>
            </div>
        </div>
        <div class="p-2 border-t bg-muted/5">
            <Button variant="outline" size="sm" class="h-8 border-dashed" @click="addNewRow">
                <Plus class="size-4 mr-1" /> Add Row
            </Button>
        </div>
    </div>
</template>
