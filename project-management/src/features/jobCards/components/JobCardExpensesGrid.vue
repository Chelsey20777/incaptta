<script setup lang="ts">
import { ref, computed } from 'vue'
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
import { Plus, Trash2, Paperclip, Loader2, Eye, X, Lock } from 'lucide-vue-next'
import { uploadExpenseAttachment } from '../../fundTransfers/utils/financeUtils'
import { toast } from 'vue-sonner'
import EditableCell from '@/features/inventory/components/EditableCell.vue'
import { formatCurrency } from '@/features/inventory/utils/pricing'
import { PAYMENT_METHODS } from '@/constants/payment'
import { useAdminStore } from '@/features/admin/store/adminStore'
import { formatDate, isValidDate } from '@/lib/utils'

const props = defineProps<{
    modelValue: any[]
    generalInfo?: any
    isAdmin?: boolean
}>()

const APPROVED_STATUSES = ['APPROVED_ACCOUNTANT', 'APPROVED_MANAGER']

function isRowLocked(item: any): boolean {
    return !props.isAdmin && APPROVED_STATUSES.includes(item.approvalStatus)
}

const emit = defineEmits(['update:modelValue'])

const activeRowIndex = ref(-1)
const activeColIndex = ref(-1)
const isEditingActive = ref(false)

const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('md')

const columns = [
    { key: 'index', label: '#', width: 'w-[30px]', editable: false, align: 'center' },
    { key: 'description', label: 'Description', editable: true, type: 'text' },
    { key: 'recipientName', label: 'Recipient Name', width: 'w-[15%]', editable: true, type: 'text' },
    { key: 'recipientPhone', label: 'Phone', width: 'w-[12%]', editable: true, type: 'text' },
    { key: 'quantity', label: 'Qty', width: 'w-[8%]', editable: true, type: 'number', align: 'right' },
    { key: 'unitPrice', label: 'Unit Price', width: 'w-[12%]', editable: true, type: 'currency', align: 'right' },
    { key: 'paymentMethod', label: 'Payment Method', width: 'w-[10%]', editable: true, type: 'select' },
    { key: 'totalAmount', label: 'Total', width: 'w-[11%]', editable: false, type: 'currency', align: 'right' },
    { key: 'attachmentUrl', label: 'Receipt', width: 'w-[10%]', editable: false, align: 'center' },
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

function updateItem(index: number, fieldOrUpdates: string | Record<string, any>, value?: any) {
    const current = props.modelValue[index]
    if (!current) return

    let updates: Record<string, any> = {}
    if (typeof fieldOrUpdates === 'string') {
        updates[fieldOrUpdates] = value
    } else {
        updates = fieldOrUpdates
    }

    // Allow updating attachments even if the row is locked (per user request)
    const isAttachmentField = 'attachmentUrls' in updates || 'attachmentUrl' in updates
    if (isRowLocked(current) && !isAttachmentField) return
    
    const newItems = [...props.modelValue]
    newItems[index] = { ...newItems[index], ...updates }
    emit('update:modelValue', newItems)
}

function removeItem(index: number) {
    if (isRowLocked(props.modelValue[index])) return
    const newItems = props.modelValue.filter((_, i) => i !== index)
    emit('update:modelValue', newItems)
}

function addNewRow() {
    const newItem = {
        id: crypto.randomUUID(),
        description: '',
        recipientName: '',
        recipientPhone: '',
        quantity: 1,
        unitPrice: 0,
        paymentMethod: 'CASH',
        paymentRef: '',
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

const isUploading = ref<Record<number, boolean>>({})
const fileInputs = ref<Record<number, HTMLInputElement | null>>({})

async function handleFileUpload(index: number, e: Event) {
    const target = e.target as HTMLInputElement
    if (!target.files || target.files.length === 0) return

    isUploading.value[index] = true

    try {
        const item = props.modelValue[index]
        const currentUrls = [...(item.attachmentUrls || (item.attachmentUrl ? [item.attachmentUrl] : []))]
        
        for (let i = 0; i < target.files.length; i++) {
            const file = target.files[i]!
            const url = await uploadExpenseAttachment(file, 'job-expenses')
            currentUrls.push(url)
            toast.success(`Uploaded ${file.name}`)
        }
        
        updateItem(index, {
            attachmentUrls: currentUrls,
            attachmentUrl: currentUrls.length > 0 ? currentUrls[0] : null
        })
    } catch (err: any) {
        toast.error('Upload failed', { description: err.message })
    } finally {
        isUploading.value[index] = false
        target.value = '' // Reset input
    }
}

function removeAttachment(index: number, attachmentIdx: number) {
    // Allow removing attachments even if the row is locked (per user request)
    const item = props.modelValue[index]
    const urls = [...(item.attachmentUrls || (item.attachmentUrl ? [item.attachmentUrl] : []))]
    urls.splice(attachmentIdx, 1)
    
    updateItem(index, {
        attachmentUrls: urls,
        attachmentUrl: urls.length > 0 ? urls[0] : null
    })
}

function triggerFileUpload(index: number, isMobileInput = false) {
    const prefix = isMobileInput ? 'file-input-mobile-' : 'file-input-'
    document.getElementById(`${prefix}${index}`)?.click()
}

const getFileName = (url: string) => {
  if (!url) return 'Document'
  try {
    const decoded = decodeURIComponent(url)
    const pathPart = decoded.split('?')[0] || ''
    const parts = pathPart.split('/')
    const fullName = parts[parts.length - 1] || ''
    return fullName.replace(/^\d+_/g, '')
  } catch (err) {
    return 'Document'
  }
}

function handleViewAttachment(url: string) {
    if (url) window.open(url, '_blank')
}

const adminStore = useAdminStore()

const resolveDepartmentName = (id: string) => {
    return adminStore.departments.find(d => d.id === id)?.name || 'Unknown'
}

const calculateLineTotal = (item: any) => {
    return (item.quantity || 0) * (item.unitPrice || 0)
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

        <div class="overflow-x-auto max-h-[400px] overflow-y-auto relative">
            <!-- Desktop Table View -->
            <Table v-if="!isMobile" class="border-collapse table-fixed w-full min-w-[900px] border-t border-l border-white/80">
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

                        <!-- Description -->
                        <TableCell class="p-0 border-r border-b border-white/80"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === rIdx && activeColIndex === 1 }">
                            <div class="flex flex-col py-1">
                                <div class="flex items-center gap-2">
                                    <EditableCell :value="item.description" type="text"
                                        :read-only="isRowLocked(item)"
                                        :is-active="activeRowIndex === rIdx && activeColIndex === 1"
                                        :is-editing="isEditingActive && activeRowIndex === rIdx && activeColIndex === 1"
                                        @update="(v) => updateItem(rIdx, 'description', v)" @click="setActiveCell(rIdx, 1, true)"
                                        placeholder="Expense description..." />
                                    <span v-if="item.isAdjustment"
                                        class="text-[8px] font-black bg-amber-100 text-amber-700 px-1 rounded border border-amber-200 shrink-0">ADJUSTMENT</span>
                                </div>
                                <div class="flex items-center gap-2 px-3 mt-0.5">
                                    <span v-if="item.createdAt && isValidDate(item.createdAt)" class="text-[9px] text-yellow-500 italic">Added: {{ new Date(item.createdAt).toLocaleString() }}</span>
                                    <span v-else-if="item.isAdjustment"
                                        class="text-[9px] font-bold text-amber-600/80">
                                        {{ formatDate(item.adjustmentDate || generalInfo?.updatedAt) }}
                                    </span>
                                </div>
                            </div>
                        </TableCell>

                        <!-- Recipient Name -->
                        <TableCell class="p-0 border-r border-b border-white/80"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === rIdx && activeColIndex === 2 }">
                            <EditableCell :value="item.recipientName" type="text"
                                :read-only="isRowLocked(item)"
                                :is-active="activeRowIndex === rIdx && activeColIndex === 2"
                                :is-editing="isEditingActive && activeRowIndex === rIdx && activeColIndex === 2"
                                @update="(v) => updateItem(rIdx, 'recipientName', v)" @click="setActiveCell(rIdx, 2)"
                                placeholder="Recipient name..." />
                        </TableCell>

                        <!-- Recipient Phone -->
                        <TableCell class="p-0 border-r border-b border-white/80"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === rIdx && activeColIndex === 3 }">
                            <EditableCell :value="item.recipientPhone" type="text"
                                :read-only="isRowLocked(item)"
                                :is-active="activeRowIndex === rIdx && activeColIndex === 3"
                                :is-editing="isEditingActive && activeRowIndex === rIdx && activeColIndex === 3"
                                @update="(v) => updateItem(rIdx, 'recipientPhone', v)" @click="setActiveCell(rIdx, 3)"
                                placeholder="Phone..." />
                        </TableCell>

                        <!-- Quantity -->
                        <TableCell class="p-0 border-r border-b border-white/80"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === rIdx && activeColIndex === 4 }">
                            <EditableCell :value="item.quantity" type="number"
                                :read-only="isRowLocked(item)"
                                :is-active="activeRowIndex === rIdx && activeColIndex === 4"
                                :is-editing="isEditingActive && activeRowIndex === rIdx && activeColIndex === 4"
                                @update="(v) => updateItem(rIdx, 'quantity', v)" @click="setActiveCell(rIdx, 4)" />
                        </TableCell>

                        <!-- Unit Price -->
                        <TableCell class="p-0 border-r border-b border-white/80"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === rIdx && activeColIndex === 5 }">
                            <EditableCell :value="item.unitPrice" type="currency"
                                :read-only="isRowLocked(item)"
                                :is-active="activeRowIndex === rIdx && activeColIndex === 5"
                                :is-editing="isEditingActive && activeRowIndex === rIdx && activeColIndex === 5"
                                @update="(v) => updateItem(rIdx, 'unitPrice', v)" @click="setActiveCell(rIdx, 5)" />
                        </TableCell>

                        <!-- Payment Method -->
                        <TableCell class="p-0 border-r border-b border-white/80 text-xs"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === rIdx && activeColIndex === 6 }">
                            <EditableCell :value="item.paymentMethod" type="select" :options="PAYMENT_METHODS"
                                :read-only="isRowLocked(item)"
                                :is-active="activeRowIndex === rIdx && activeColIndex === 6"
                                :is-editing="isEditingActive && activeRowIndex === rIdx && activeColIndex === 6"
                                @update="(v) => updateItem(rIdx, 'paymentMethod', v)" @click="setActiveCell(rIdx, 6, true)" />
                        </TableCell>

                        <!-- Total Amount -->
                        <TableCell class="p-0 border-r border-b border-white/80 text-right bg-accent/5"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === rIdx && activeColIndex === 7 }">
                            <div class="px-2 py-1 text-[12px] truncate h-full flex items-center justify-end font-medium"
                                @click="setActiveCell(rIdx, 7)">
                                {{ formatCurrency(calculateLineTotal(item)) }}
                            </div>
                        </TableCell>

                        <!-- Attachment -->
                        <TableCell class="p-0 border-r border-b border-white/80 text-center"
                            :class="{ 'ring-2 ring-primary/40 z-30': activeRowIndex === rIdx && activeColIndex === 8 }">
                            <div class="flex flex-wrap items-center justify-center gap-1 min-h-10 p-1" @click="setActiveCell(rIdx, 8)">
                                <input type="file" :id="`file-input-${rIdx}`" class="hidden" accept="image/*,.pdf" multiple
                                    @change="(e) => handleFileUpload(rIdx, e)" />

                                <template v-if="isUploading[rIdx]">
                                    <Loader2 class="size-4 animate-spin text-muted-foreground" />
                                </template>
                                
                                <div v-if="item.attachmentUrls && item.attachmentUrls.length > 0" class="flex flex-wrap gap-1">
                                    <div v-for="(url, idx) in item.attachmentUrls" :key="url + '-' + idx" class="flex items-center bg-muted/50 rounded-md border border-white/20 px-0.5">
                                        <Button variant="ghost" size="icon" class="h-6 w-6 bg-primary/10 text-primary hover:bg-primary/20 dark:bg-emerald-500/10 dark:text-emerald-400"
                                            :title="getFileName(url)"
                                            @click.stop="handleViewAttachment(url)">
                                            <Eye class="size-3.5" />
                                        </Button>
                                        <Button variant="ghost" size="icon" class="h-5 w-5 bg-destructive/10 text-destructive p-0 hover:bg-destructive/20"
                                            title="Remove Attachment"
                                            @click.stop="removeAttachment(Number(rIdx), Number(idx))">
                                            <X class="size-2.5" />
                                        </Button>
                                    </div>
                                </div>
                                <template v-else-if="item.attachmentUrl">
                                    <div class="flex items-center gap-1">
                                        <Button variant="ghost" size="icon" class="h-7 w-7 bg-primary/10 text-primary hover:bg-primary/20 dark:bg-emerald-500/10 dark:text-emerald-400"
                                            :title="getFileName(item.attachmentUrl)"
                                            @click.stop="handleViewAttachment(item.attachmentUrl)">
                                            <Eye class="size-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon" class="h-7 w-7 text-destructive"
                                            @click.stop="updateItem(Number(rIdx), 'attachmentUrl', null)">
                                            <X class="size-3" />
                                        </Button>
                                    </div>
                                </template>

                                <!-- Upload button: always visible, attachment updates bypass lock -->
                                <Button variant="ghost" size="icon"
                                    class="h-7 w-7 text-muted-foreground hover:text-primary"
                                    title="Add attachment"
                                    @click.stop="triggerFileUpload(Number(rIdx))">
                                    <Plus class="size-4" />
                                </Button>
                            </div>
                        </TableCell>

                        <TableCell class="p-0 text-center border-r border-b border-white/80">
                            <template v-if="isRowLocked(item)">
                                <Lock class="size-3 mx-auto text-muted-foreground/50" />
                            </template>
                            <template v-else>
                                <Button variant="ghost" size="icon"
                                    class="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                    @click="removeItem(Number(rIdx))">
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
                    :class="[isRowLocked(item) ? 'opacity-80 bg-muted/20 border-border/50' : 'border-brand-primary/20 shadow-brand-primary/5']">
                    
                    <!-- Card Header: Index & Status -->
                    <div class="flex items-center justify-between px-4 py-3 bg-muted/10 border-b border-border/50">
                        <div class="flex items-center gap-3">
                            <span class="flex size-7 items-center justify-center rounded-full bg-brand-primary text-[11px] font-black text-white shadow-sm">
                                {{ Number(rIdx) + 1 }}
                            </span>
                            <div class="flex flex-col">
                                <span class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground leading-none">Entry Details</span>
                                <span v-if="item.createdAt" class="text-[9px] text-muted-foreground italic mt-0.5">
                                    {{ new Date(item.createdAt).toLocaleDateString() }} @ {{ new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
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
                        <!-- Main Description Section -->
                        <div class="space-y-2">
                            <label class="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70 ml-1">Expense Description</label>
                            <textarea :value="item.description" 
                                      :disabled="isRowLocked(item)"
                                      @input="(e: any) => updateItem(Number(rIdx), 'description', e.target.value)"
                                      class="w-full min-h-[100px] rounded-xl border-border/60 bg-background/50 px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground/50 focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20 disabled:cursor-not-allowed disabled:opacity-50 transition-all shadow-sm"
                                      placeholder="Describe the expense details..."></textarea>
                        </div>

                        <!-- Recipient Group -->
                        <div class="rounded-2xl bg-muted/30 p-4 space-y-5 border border-border/40">
                            <div class="flex items-center gap-2 mb-1">
                                <div class="p-1.5 rounded-lg bg-brand-primary/10 text-brand-primary">
                                    <Users class="size-4" />
                                </div>
                                <span class="text-[11px] font-black uppercase tracking-widest text-foreground/80">Recipient Information</span>
                            </div>
                            <div class="grid grid-cols-1 gap-5">
                                <div class="space-y-2">
                                    <label class="text-[10px] font-black uppercase text-muted-foreground/60 ml-1">Full Name</label>
                                    <input type="text" :value="item.recipientName" 
                                           :disabled="isRowLocked(item)"
                                           @input="(e: any) => updateItem(Number(rIdx), 'recipientName', e.target.value)"
                                           class="h-12 w-full rounded-xl border-border/60 bg-background px-4 text-sm focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 transition-all shadow-sm"
                                           placeholder="Name of recipient" />
                                </div>
                                <div class="space-y-2">
                                    <label class="text-[10px] font-black uppercase text-muted-foreground/60 ml-1">Contact Phone</label>
                                    <input type="text" :value="item.recipientPhone" 
                                           :disabled="isRowLocked(item)"
                                           @input="(e: any) => updateItem(Number(rIdx), 'recipientPhone', e.target.value)"
                                           class="h-12 w-full rounded-xl border-border/60 bg-background px-4 text-sm focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 transition-all shadow-sm"
                                           placeholder="Phone number" />
                                </div>
                            </div>
                        </div>

                        <!-- Finance & Method Group -->
                        <div class="grid grid-cols-2 gap-4">
                            <div class="space-y-2">
                                <label class="text-[10px] font-black uppercase text-muted-foreground/60 ml-1">Quantity</label>
                                <input type="number" :value="item.quantity" 
                                       :disabled="isRowLocked(item)"
                                       @input="(e: any) => updateItem(Number(rIdx), 'quantity', Number(e.target.value))"
                                       class="h-12 w-full rounded-xl border-border/60 bg-background px-4 text-sm font-bold focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 transition-all shadow-sm" />
                            </div>
                            <div class="space-y-2">
                                <label class="text-[10px] font-black uppercase text-muted-foreground/60 ml-1">Unit Price ($)</label>
                                <input type="number" step="0.01" :value="item.unitPrice" 
                                       :disabled="isRowLocked(item)"
                                       @input="(e: any) => updateItem(Number(rIdx), 'unitPrice', Number(e.target.value))"
                                       class="h-12 w-full rounded-xl border-border/60 bg-background px-4 text-sm font-bold text-orange-600 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 transition-all shadow-sm" />
                            </div>
                        </div>

                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div class="space-y-2">
                                <label class="text-[10px] font-black uppercase text-muted-foreground/60 ml-1">Payment Method</label>
                                <div class="relative">
                                    <select :value="item.paymentMethod" 
                                            :disabled="isRowLocked(item)"
                                            @change="(e: any) => updateItem(Number(rIdx), 'paymentMethod', e.target.value)"
                                            class="h-12 w-full rounded-xl border-border/60 bg-background px-4 text-sm focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 transition-all shadow-sm appearance-none pr-10">
                                        <option v-for="opt in PAYMENT_METHODS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                                    </select>
                                    <ChevronDown class="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                                </div>
                            </div>
                            <div class="space-y-2">
                                <label class="text-[10px] font-black uppercase text-muted-foreground/60 ml-1">Line Total</label>
                                <div class="h-12 w-full rounded-xl border border-orange-200 bg-orange-50/50 flex items-center px-4 text-base font-black text-orange-600 shadow-inner">
                                    {{ formatCurrency(calculateLineTotal(item)) }}
                                </div>
                            </div>
                        </div>

                        <!-- Attachments & Actions -->
                        <div class="pt-6 border-t border-border/50 space-y-4">
                            <div class="flex items-center justify-between mb-2">
                                <span class="text-[10px] font-black uppercase text-muted-foreground/60 tracking-widest ml-1">Evidence / Receipts</span>
                                <Button variant="outline" size="sm" 
                                    class="h-9 px-4 rounded-xl border-dashed border-brand-primary/40 text-brand-primary hover:bg-brand-primary/5 gap-2"
                                    @click.stop="triggerFileUpload(Number(rIdx), true)">
                                    <Plus class="size-4" />
                                    <span class="text-[10px] font-black uppercase">Add Document</span>
                                </Button>
                                <input type="file" :id="`file-input-mobile-${rIdx}`" class="hidden" accept="image/*,.pdf" multiple
                                    @change="(e) => handleFileUpload(Number(rIdx), e)" />
                            </div>

                            <div v-if="isUploading[Number(rIdx)]" class="flex items-center gap-3 text-xs font-medium text-brand-primary bg-brand-primary/5 p-3 rounded-xl border border-brand-primary/10">
                                <Loader2 class="size-4 animate-spin" /> 
                                <span>Uploading attachments...</span>
                            </div>

                             <div class="flex flex-wrap gap-3">
                                <template v-if="item.attachmentUrls && item.attachmentUrls.length > 0">
                                    <div v-for="(url, idx) in item.attachmentUrls" :key="url + '-' + idx" 
                                        class="flex items-center h-12 bg-muted/50 rounded-xl border border-border/60 pr-1 pl-3 shadow-sm hover:border-brand-primary/40 transition-colors">
                                        <button @click.stop="handleViewAttachment(url)" :title="getFileName(url)" class="flex items-center gap-2 text-[11px] font-bold text-foreground">
                                            <Paperclip class="size-3.5 text-brand-primary" /> 
                                            Receipt {{ item.attachmentUrls.length > 1 ? (Number(idx) + 1) : '' }}
                                        </button>
                                        <button @click.stop="removeAttachment(Number(rIdx), Number(idx))"
                                            class="ml-3 size-8 flex items-center justify-center rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors">
                                            <X class="size-3.5" />
                                        </button>
                                    </div>
                                </template>
                                <template v-else-if="item.attachmentUrl">
                                    <div class="flex items-center h-12 bg-muted/50 rounded-xl border border-border/60 pr-1 pl-3 shadow-sm hover:border-brand-primary/40 transition-colors">
                                        <button @click.stop="handleViewAttachment(item.attachmentUrl)" :title="getFileName(item.attachmentUrl)" class="flex items-center gap-2 text-[11px] font-bold text-foreground">
                                            <Eye class="size-3.5 text-brand-primary" /> 
                                            View Receipt
                                        </button>
                                        <button @click.stop="updateItem(rIdx, 'attachmentUrl', null)"
                                            class="ml-3 size-8 flex items-center justify-center rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors">
                                            <X class="size-3.5" />
                                        </button>
                                    </div>
                                </template>
                            </div>

                            <!-- Row Actions -->
                            <div v-if="!isRowLocked(item)" class="flex items-center pt-2">
                                <Button variant="ghost" size="sm" 
                                    class="h-11 w-full rounded-xl text-destructive hover:bg-destructive/10 gap-2 border border-destructive/10"
                                    @click="removeItem(Number(rIdx))">
                                    <Trash2 class="size-4" />
                                    <span class="text-[11px] font-black uppercase">Delete This Expense</span>
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>

                <div v-if="modelValue.length === 0" class="flex flex-col items-center justify-center py-20 px-4 text-center space-y-5">
                    <div class="size-20 rounded-3xl bg-muted/30 flex items-center justify-center shadow-inner">
                        <Receipt class="size-10 text-muted-foreground/20" />
                    </div>
                    <div class="space-y-2">
                        <h4 class="text-base font-black text-muted-foreground tracking-tight">Empty Expense List</h4>
                        <p class="text-sm text-muted-foreground/60 max-w-[200px] mx-auto">Start by adding an expense using the "Add Row" button below.</p>
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
