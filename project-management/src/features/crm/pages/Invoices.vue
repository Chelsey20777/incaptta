<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useCrmStore } from '../store/crmStore'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Receipt, Loader2, DollarSign, Download, Trash2, FileText } from 'lucide-vue-next'
import { formatCurrency } from '@/features/inventory/utils/pricing'
import { toast } from 'vue-sonner'
import { generateCrmPdf } from '../utils/generateCrmPdf'
import AdminDeleteDialog from '@/components/AdminDeleteDialog.vue'
import { useAdminStore } from '@/features/admin/store/adminStore'
import { useSession } from '@/composables/useSession'
import { storeToRefs } from 'pinia'
import CrmDocumentWorkspace from '../components/CrmDocumentWorkspace.vue'
import { ArrowLeft } from 'lucide-vue-next'

const adminStore = useAdminStore()
const { appSettings } = storeToRefs(adminStore)
const store = useCrmStore()

const isPaymentModalOpen = ref(false)
const isSubmitting = ref(false)
const isDeleting = ref(false)
const isEditMode = ref(false)
const editingInvoice = ref<any>(null)

// Admin Deletion State
const { isSuperAdmin } = useSession()
const isAdminDeleteOpen = ref(false)
const selectedInvoiceForAdminDelete = ref<any>(null)

const activeInvoice = ref<any>(null)
const paymentForm = ref({
    amount: 0,
    method: 'ECOCASH' as 'CASH' | 'BANK' | 'ECOCASH',
    reference: ''
})

const currentPage = ref(1)
const paginatedInvoices = computed(() => {
    const start = (currentPage.value - 1) * 30
    return store.invoices.slice(start, start + 30)
})
const totalPages = computed(() => Math.ceil(store.invoices.length / 30) || 1)

onMounted(() => {
    store.fetchInvoices()
})

onUnmounted(() => {
    store.cleanup()
})

const openPaymentModal = (invoice: any) => {
    activeInvoice.value = invoice
    paymentForm.value = {
        amount: Math.max(0, invoice.grandTotal - (invoice.amountPaid || 0)), // Default to remaining balance
        method: 'ECOCASH',
        reference: ''
    }
    isPaymentModalOpen.value = true
}

const handleRecordPayment = async () => {
    if (!paymentForm.value.amount || paymentForm.value.amount <= 0) return toast.error('Please enter a valid amount')
    if (!paymentForm.value.reference) return toast.error('Please enter a reference note')
    if (!activeInvoice.value) return

    // Prevent overpaying
    const remaining = activeInvoice.value.grandTotal - (activeInvoice.value.amountPaid || 0)
    if (paymentForm.value.amount > remaining) {
        return toast.error(`Amount cannot exceed the remaining balance of ${formatCurrency(remaining)}`)
    }

    isSubmitting.value = true
    try {
        await store.recordInvoicePayment(
            activeInvoice.value.id,
            paymentForm.value.amount,
            paymentForm.value.method,
            paymentForm.value.reference
        )
        toast.success('Payment recorded to CRM and Finance Ledger!')
        isPaymentModalOpen.value = false
    } catch (err: any) {
        toast.error('Failed to record payment')
        console.error(err)
    } finally {
        isSubmitting.value = false
    }
}

const handleDownloadPdf = (invoice: any) => {
    try {
        const adminStore = useAdminStore()
        const { user: currentUser } = useSession()
        generateCrmPdf(
            invoice,
            'INVOICE',
            adminStore.appSettings,
            adminStore.appSettings,
            currentUser.value?.displayName || undefined,
            adminStore.jobCategories
        )
        toast.success('Downloading Invoice PDF...')
    } catch (err) {
        toast.error('Failed to generate PDF')
        console.error(err)
    }
}

const openAdminDelete = (inv: any) => {
    selectedInvoiceForAdminDelete.value = inv
    isAdminDeleteOpen.value = true
}

const handleUpdateInvoice = async (payload: any) => {
    if (!editingInvoice.value) return
    
    isSubmitting.value = true
    try {
        // Find customer name
        const customer = store.customers.find(c => c.id === payload.customerId)
        
        // When editing an invoice, we must preserve the amountPaid and status logic
        const amountPaid = editingInvoice.value.amountPaid || 0
        const newTotal = payload.grandTotal
        const newStatus = amountPaid >= newTotal ? 'PAID' : (amountPaid > 0 ? 'PARTIAL' : 'UNPAID')

        const finalPayload = {
            ...payload,
            customerName: customer?.name || 'Unknown Client',
            amountPaid,
            status: newStatus,
            updatedAt: new Date().toISOString()
        }

        await store.updateInvoice(editingInvoice.value.id, finalPayload)
        toast.success('Invoice updated successfully')
        isEditMode.value = false
        editingInvoice.value = null
    } catch (err: any) {
        toast.error('Failed to update invoice')
        console.error(err)
    } finally {
        isSubmitting.value = false
    }
}

const handleEditInvoice = (inv: any) => {
    editingInvoice.value = inv
    isEditMode.value = true
}

const closeEdit = () => {
    isEditMode.value = false
    editingInvoice.value = null
}

const handleAdminDeleteConfirm = async () => {
    if (!selectedInvoiceForAdminDelete.value) return
    const inv = selectedInvoiceForAdminDelete.value
    isAdminDeleteOpen.value = false
    isDeleting.value = true
    
    toast.loading('ADMIN: Force deleting invoice...', { id: 'admin-delete' })
    try {
        await store.deleteInvoice(inv.id)
        toast.success('Admin: Invoice Deleted Successfully', { id: 'admin-delete' })
    } catch (err: any) {
        toast.error('Admin Delete Failed', { id: 'admin-delete', description: err.message })
    } finally {
        selectedInvoiceForAdminDelete.value = null
        isDeleting.value = false
    }
}

</script>

<template>
    <div class="space-y-6">
        <div class="flex items-center justify-between">
            <div>
                <h1 class="text-3xl font-bold tracking-tight">{{ isEditMode ? 'Edit Invoice' : 'Invoices' }}</h1>
                <p class="text-muted-foreground">{{ isEditMode ? 'Modify invoice details and line items.' : 'Track binding invoices and incoming payments.' }}</p>
            </div>
            
            <Button v-if="isEditMode" variant="outline" @click="closeEdit">
                <ArrowLeft class="size-4 mr-2" /> Back to List
            </Button>
        </div>

        <CrmDocumentWorkspace 
            v-if="isEditMode"
            :initial-data="editingInvoice"
            :customers="store.customers"
            :job-categories="adminStore.jobCategories"
            :loading="isSubmitting"
            mode="INVOICE"
            @save="handleUpdateInvoice"
            @cancel="closeEdit"
        />

        <Dialog :open="isPaymentModalOpen" @update:open="isPaymentModalOpen = $event">
            <DialogContent class="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Record Payment</DialogTitle>
                    <DialogDescription>
                        Log a received deposit against <strong class="text-primary">INV-{{
                            activeInvoice?.id?.substring(0, 8).toUpperCase() }}</strong>. This immediately updates the
                        Global Finance Ledger.
                    </DialogDescription>
                </DialogHeader>
                <div class="grid gap-4 py-4" v-if="activeInvoice">
                    <div class="flex items-center justify-between p-3 bg-muted/20 border rounded-md">
                        <span class="text-sm font-medium">Remaining Balance:</span>
                        <span class="text-lg font-bold tabular-nums text-primary">{{
                            formatCurrency(activeInvoice.grandTotal - (activeInvoice.amountPaid || 0)) }}</span>
                    </div>

                    <div class="grid grid-cols-4 items-center gap-4">
                        <Label class="text-right">Amount</Label>
                        <Input type="number" v-model="paymentForm.amount" class="col-span-3" min="0" step="0.01" />
                    </div>
                    <div class="grid grid-cols-4 items-center gap-4">
                        <Label class="text-right">Method</Label>
                        <Select v-model="paymentForm.method">
                            <SelectTrigger class="col-span-3">
                                <SelectValue placeholder="Select Method" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ECOCASH">EcoCash</SelectItem>
                                <SelectItem value="CASH">Cash</SelectItem>
                                <SelectItem value="BANK">Bank Transfer</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div class="grid grid-cols-4 items-center gap-4">
                        <Label class="text-right">Reference</Label>
                        <Input v-model="paymentForm.reference" placeholder="POP# / Check# / Details"
                            class="col-span-3" />
                    </div>
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" @click="isPaymentModalOpen = false">Cancel</Button>
                    <Button type="submit" @click="handleRecordPayment" :disabled="isSubmitting">
                        <Loader2 v-if="isSubmitting" class="mr-2 h-4 w-4 animate-spin" />
                        {{ isSubmitting ? 'Recording...' : 'Settle Payment' }}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <Card v-if="!isEditMode"
            class="bg-brand-primary/5 dark:bg-brand-primary/10 backdrop-blur-md border-brand-primary/20 dark:border-brand-primary/30 shadow-lg text-foreground dark:text-white overflow-hidden">
            <CardHeader>
                <CardTitle class="flex items-center gap-2 text-foreground dark:text-white">
                    <Receipt class="size-5 text-brand-primary" />
                    Live Invoices
                </CardTitle>
                <CardDescription class="text-muted-foreground dark:text-white/60">Only approved quotations appear here
                    as binding invoices.</CardDescription>
            </CardHeader>
            <CardContent>
                <div v-if="store.loading && store.invoices.length === 0" class="flex justify-center py-8">
                    <Loader2 class="size-8 animate-spin text-muted-foreground" />
                </div>
                <div v-else-if="store.invoices.length === 0" class="text-center py-12 text-muted-foreground">
                    No active invoices found. Approve a quotation to generate an invoice.
                </div>
                <Table v-else>
                    <TableHeader>
                        <TableRow class="border-b hover:bg-transparent"
                            :style="{ borderColor: 'var(--crm-grid-border)' }">
                            <TableHead class="text-[11px] font-bold uppercase tracking-wider"
                                :style="{ color: 'var(--crm-grid-header-text)' }">Invoice No</TableHead>
                            <TableHead class="text-[11px] font-bold uppercase tracking-wider"
                                :style="{ color: 'var(--crm-grid-header-text)' }">Customer</TableHead>
                            <TableHead class="text-[11px] font-bold uppercase tracking-wider"
                                :style="{ color: 'var(--crm-grid-header-text)' }">Date Issued</TableHead>
                            <TableHead class="text-[11px] font-bold uppercase tracking-wider"
                                :style="{ color: 'var(--crm-grid-header-text)' }">Total Amount</TableHead>
                            <TableHead class="text-[11px] font-bold uppercase tracking-wider"
                                :style="{ color: 'var(--crm-grid-header-text)' }">Paid</TableHead>
                            <TableHead class="text-[11px] font-bold uppercase tracking-wider"
                                :style="{ color: 'var(--crm-grid-header-text)' }">Status</TableHead>
                            <TableHead class="text-right text-[11px] font-bold uppercase tracking-wider"
                                :style="{ color: 'var(--crm-grid-header-text)' }">Action</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <TableRow v-for="inv in paginatedInvoices" :key="inv.id"
                            class="border-b transition-colors duration-200"
                            :style="{ borderColor: 'var(--crm-grid-border)' }"
                            :class="'hover:bg-brand-primary/5 dark:hover:bg-brand-primary/10'">
                            <TableCell class="py-4">
                                <span
                                    class="px-3 py-1.5 rounded-md border text-brand-primary font-mono text-xs font-bold shadow-sm"
                                    :style="{ backgroundColor: (appSettings?.uiColors?.brandPrimaryColor || '#79c21b') + '15', borderColor: (appSettings?.uiColors?.brandPrimaryColor || '#79c21b') + '30' }">
                                    INV-{{ inv.id.substring(0, 8).toUpperCase() }}
                                </span>
                            </TableCell>
                            <TableCell class="font-medium text-foreground dark:text-white">{{ inv.customerName }}
                            </TableCell>
                            <TableCell class="text-muted-foreground dark:text-white/60 text-xs">{{
                                inv.createdAt?.toDate?.()?.toLocaleDateString()
                                }}</TableCell>
                            <TableCell class="font-bold tabular-nums text-foreground dark:text-white">{{
                                formatCurrency(inv.grandTotal || 0) }}
                            </TableCell>
                            <TableCell class="tabular-nums text-brand-primary font-bold text-base">{{
                                formatCurrency(inv.amountPaid || 0) }}
                            </TableCell>
                            <TableCell>
                                <Badge
                                    :style="{ backgroundColor: inv.status === 'PAID' ? (appSettings?.uiColors?.brandPrimaryColor || '#79c21b') : inv.status === 'PARTIAL' ? (appSettings?.uiColors?.brandSecondaryColor || '#ff8903') : '#ef4444' }"
                                    class="font-bold text-[10px] border-none shadow-sm shadow-black/20 text-white">
                                    {{ inv.status }}
                                </Badge>
                            </TableCell>
                            <TableCell class="text-right flex justify-end gap-2 py-4">
                                <Button variant="outline" size="sm"
                                    class="h-8 w-8 p-0 bg-transparent border-brand-primary/30 text-brand-primary hover:bg-brand-primary/10"
                                    title="Download PDF" @click="handleDownloadPdf(inv)">
                                    <Download class="size-4" />
                                </Button>
                                <Button variant="outline" size="sm"
                                    class="h-8 w-8 p-0 bg-transparent border-brand-primary/30 text-brand-primary hover:bg-brand-primary/10"
                                    title="Edit Invoice" @click="handleEditInvoice(inv)">
                                    <FileText class="size-4" />
                                </Button>
                                <Button v-if="inv.status !== 'PAID'" variant="outline" size="sm"
                                    class="h-8 text-xs bg-transparent border-brand-primary/30 text-brand-primary hover:bg-brand-primary/10"
                                    @click="openPaymentModal(inv)">
                                    <DollarSign class="size-3 mr-1" /> Pay
                                </Button>
                                <div v-else
                                    class="text-xs text-brand-primary font-bold italic pr-2 flex items-center h-8">
                                    Settled
                                </div>
                                <!-- Admin Force Delete -->
                                <Button v-if="isSuperAdmin" variant="outline" size="sm"
                                    class="h-8 w-8 p-0 border-destructive/30 text-destructive hover:bg-destructive/10"
                                    title="Force Delete (Admin)" @click="openAdminDelete(inv)">
                                    <Trash2 v-if="!isDeleting || selectedInvoiceForAdminDelete?.id !== inv.id" class="size-4" />
                                    <span v-else class="size-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                </Button>
                            </TableCell>
                        </TableRow>
                    </TableBody>
                </Table>

                <!-- Invoices Pagination Controls -->
                <div v-if="store.invoices.length > 0" class="flex items-center justify-between border-t border-brand-primary/20 pt-4 mt-4 px-4 bg-brand-primary/5 dark:bg-brand-primary/10 rounded-b-xl py-3">
                    <p class="text-xs text-muted-foreground dark:text-white/60">
                        Showing {{ Math.min((currentPage - 1) * 30 + 1, store.invoices.length) }}-{{ Math.min(currentPage * 30, store.invoices.length) }} of {{ store.invoices.length }}
                    </p>
                    <div class="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            class="h-8 border-brand-primary/30 text-brand-primary hover:bg-brand-primary/10 bg-transparent"
                            :disabled="currentPage === 1"
                            @click="currentPage--"
                        >
                            Previous
                        </Button>
                        <span class="text-xs font-bold text-foreground dark:text-white px-3 py-1 rounded bg-muted/20 border border-brand-primary/20">
                            {{ currentPage }} / {{ totalPages }}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            class="h-8 border-brand-primary/30 text-brand-primary hover:bg-brand-primary/10 bg-transparent"
                            :disabled="currentPage >= totalPages"
                            @click="currentPage++"
                        >
                            Next
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    </div>

    <!-- Admin Confirmation Dialog -->
    <AdminDeleteDialog
        v-if="selectedInvoiceForAdminDelete"
        v-model:open="isAdminDeleteOpen"
        title="Admin Force Delete"
        :description="`You are about to PERMANENTLY delete Invoice: INV-${selectedInvoiceForAdminDelete.id?.substring(0, 8).toUpperCase()}. This will not undo ledger entries automatically but will remove the record.`"
        :target-id="`INV-${selectedInvoiceForAdminDelete.id?.substring(0, 8).toUpperCase()}`"
        :loading="isDeleting"
        @confirm="handleAdminDeleteConfirm"
    />
</template>
