<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useCrmStore } from '../store/crmStore'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { FileText, Plus, Loader2, ArrowRight, ArrowLeft, Download, Trash2, Copy } from 'lucide-vue-next'
import { formatCurrency } from '@/features/inventory/utils/pricing'
import { toast } from 'vue-sonner'
import { inventoryApi } from '@/features/inventory/api/inventoryApi'
import CrmDocumentWorkspace from '../components/CrmDocumentWorkspace.vue'
import { useAdminStore } from '@/features/admin/store/adminStore'
import { useSession } from '@/composables/useSession'
import { storeToRefs } from 'pinia'
import { generateCrmPdf } from '../utils/generateCrmPdf'
const adminStore = useAdminStore()
const { appSettings } = storeToRefs(adminStore)
const store = useCrmStore()

const isCreateMode = ref(false)
const isSubmitting = ref(false)
const isDeleting = ref(false)
const editingQuote = ref<any>(null)
const inventoryItemsForTemplate = ref<any[]>([])

const currentPage = ref(1)
const paginatedQuotes = computed(() => {
    const start = (currentPage.value - 1) * 30
    return store.quotes.slice(start, start + 30)
})
const totalPages = computed(() => Math.ceil(store.quotes.length / 30) || 1)
// Admin Deletion State
const { isSuperAdmin } = useSession()
const isAdminDeleteOpen = ref(false)
const selectedQuoteForAdminDelete = ref<any>(null)

const headerSubtitle = computed(() =>
    isCreateMode.value
        ? (editingQuote.value ? 'Modify the existing quotation details.' : 'Compile a formal price quote using active catalog formulas.')
        : 'Draft and manage customer price quotes.'
)

onMounted(() => {
    store.fetchQuotes()
    if (store.customers.length === 0) store.fetchCustomers()
    adminStore.fetchAll()
    inventoryApi.listInventory({ isActive: true }).then(items => {
        inventoryItemsForTemplate.value = items
    }).catch(err => console.error('Failed to load inventory for templates:', err))
})

onUnmounted(() => {
    store.cleanup()
})

const resetForm = () => {
    isCreateMode.value = false
    editingQuote.value = null
}

const handleSaveQuote = async (payload: any) => {
    try {
        isSubmitting.value = true

        // Find customer name
        const customer = store.customers.find(c => c.id === payload.customerId)
        
        const finalPayload = {
            ...payload,
            customerName: customer?.name || 'Unknown Client',
            updatedAt: new Date().toISOString()
        }

        if (editingQuote.value) {
            await store.updateQuote(editingQuote.value.id, finalPayload)
            toast.success('Quotation updated successfully')
        } else {
            const enrichedPayload = {
                ...finalPayload,
                status: 'DRAFT',
                quoteRef: `QT-${Date.now().toString().slice(-6)}`
            }
            await store.createQuote(enrichedPayload)
            toast.success('Quotation draft saved successfully')
        }
        resetForm()
    } catch (err: any) {
        toast.error('Failed to save quotation')
        console.error(err)
    } finally {
        isSubmitting.value = false
    }
}

const handleEditQuote = (quote: any) => {
    editingQuote.value = quote
    isCreateMode.value = true
}

const handleApproveQuote = async (quoteId: string) => {
    try {
        const promise = store.approveQuoteToInvoice(quoteId)
        toast.promise(promise, {
            loading: 'Converting to Invoice...',
            success: 'Quote Approved & Invoice Generated!',
            error: 'Failed to convert quote.'
        })
    } catch (e) {
        console.error("Quote Conversion Error:", e)
    }
}

const handleDuplicateQuote = async (quoteId: string) => {
    try {
        const promise = store.duplicateQuote(quoteId)
        toast.promise(promise, {
            loading: 'Duplicating quotation...',
            success: 'Quotation duplicated successfully!',
            error: 'Failed to duplicate quotation.'
        })
    } catch (e) {
        console.error("Quote Duplication Error:", e)
    }
}

const handleDownloadPdf = (quote: any) => {
    try {
        const adminStore = useAdminStore()
        const { user: currentUser } = useSession()
        generateCrmPdf(
            quote,
            'QUOTATION',
            adminStore.appSettings,
            adminStore.appSettings,
            currentUser.value?.displayName || undefined,
            adminStore.jobCategories
        )
        toast.success('Downloading Quotation PDF...')
    } catch (err) {
        toast.error('Failed to generate PDF')
        console.error(err)
    }
}

const openAdminDelete = (quote: any) => {
    selectedQuoteForAdminDelete.value = quote
    isAdminDeleteOpen.value = true
}

const handleAdminDeleteConfirm = async () => {
    if (!selectedQuoteForAdminDelete.value) return
    const quote = selectedQuoteForAdminDelete.value
    isAdminDeleteOpen.value = false
    isDeleting.value = true
    
    toast.loading('ADMIN: Force deleting quotation...', { id: 'admin-delete' })
    try {
        await store.deleteQuote(quote.id)
        toast.success('Admin: Quotation Deleted Successfully', { id: 'admin-delete' })
    } catch (err: any) {
        toast.error('Admin Delete Failed', { id: 'admin-delete', description: err.message })
    } finally {
        isDeleting.value = false
        selectedQuoteForAdminDelete.value = null
    }
}
</script>

<template>
    <div class="space-y-6">

        <!-- Header -->
        <div class="flex items-center justify-between">
            <div>
                <h1 class="text-3xl font-bold tracking-tight">{{ isCreateMode ? 'Build Quotation' : 'Quotations' }}</h1>
                <p class="text-muted-foreground">{{ headerSubtitle }}</p>
            </div>

            <Button v-if="!isCreateMode"
                :style="{ backgroundColor: appSettings?.uiColors?.brandSecondaryColor || '#ff8903', borderColor: appSettings?.uiColors?.brandSecondaryColor || '#ff8903' }"
                class="hover:opacity-90 text-white" @click="isCreateMode = true">
                <Plus class="size-4 mr-2" /> Create Quote
            </Button>
            <Button v-else variant="outline" @click="resetForm">
                <ArrowLeft class="size-4 mr-2" /> Back to List
            </Button>
        </div>

        <!-- Create/Edit Mode Workspace -->
        <CrmDocumentWorkspace 
            v-if="isCreateMode"
            :initial-data="editingQuote"
            :customers="store.customers"
            :job-categories="adminStore.jobCategories"
            :loading="isSubmitting"
            mode="QUOTE"
            @save="handleSaveQuote"
            @cancel="resetForm"
        />

        <!-- Standard List Mode -->
        <Card v-else
            class="bg-brand-primary/5 dark:bg-brand-primary/10 backdrop-blur-md border-brand-primary/20 dark:border-brand-primary/30 shadow-lg text-foreground dark:text-white overflow-hidden">
            <CardHeader>
                <CardTitle class="flex items-center gap-2 text-foreground dark:text-white">
                    <FileText class="size-5 text-brand-primary" /> Draft Quotes
                </CardTitle>
                <CardDescription class="text-muted-foreground dark:text-white/60">Quotes are non-binding until
                    explicitly approved and converted into an Invoice.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div v-if="store.loading && store.quotes.length === 0" class="flex justify-center py-8">
                    <Loader2 class="size-8 animate-spin text-muted-foreground" />
                </div>
                <div v-else-if="store.quotes.length === 0" class="text-center py-12 text-muted-foreground">
                    No quotations found. Click "Create Quote" to begin drafting your first client offer.
                </div>
                <Table v-else>
                    <TableHeader>
                        <TableRow class="border-b hover:bg-transparent"
                            :style="{ borderColor: 'var(--crm-grid-border)' }">
                            <TableHead class="text-[11px] font-bold uppercase tracking-wider"
                                :style="{ color: 'var(--crm-grid-header-text)' }">Ref</TableHead>
                            <TableHead class="text-[11px] font-bold uppercase tracking-wider"
                                :style="{ color: 'var(--crm-grid-header-text)' }">Customer</TableHead>
                            <TableHead class="text-[11px] font-bold uppercase tracking-wider"
                                :style="{ color: 'var(--crm-grid-header-text)' }">Date</TableHead>
                            <TableHead class="text-[11px] font-bold uppercase tracking-wider"
                                :style="{ color: 'var(--crm-grid-header-text)' }">Total Value</TableHead>
                            <TableHead class="text-[11px] font-bold uppercase tracking-wider"
                                :style="{ color: 'var(--crm-grid-header-text)' }">Status</TableHead>
                            <TableHead class="text-right text-[11px] font-bold uppercase tracking-wider"
                                :style="{ color: 'var(--crm-grid-header-text)' }">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <TableRow v-for="quote in paginatedQuotes" :key="quote.id"
                            class="border-b transition-colors duration-200"
                            :style="{ borderColor: 'var(--crm-grid-border)' }"
                            :class="'hover:bg-brand-primary/5 dark:hover:bg-brand-primary/10'">
                            <TableCell class="py-4">
                                <span
                                    class="px-3 py-1.5 rounded-md border text-brand-primary font-mono text-xs font-bold shadow-sm"
                                    :style="{ backgroundColor: (appSettings?.uiColors?.brandPrimaryColor || '#79c21b') + '15', borderColor: (appSettings?.uiColors?.brandPrimaryColor || '#79c21b') + '30' }">
                                    {{ quote.quoteRef || quote.id.substring(0, 8) }}
                                </span>
                            </TableCell>
                            <TableCell class="font-medium text-foreground dark:text-white">{{ quote.customerName }}
                            </TableCell>
                            <TableCell class="text-muted-foreground dark:text-white/60 text-xs">{{
                                quote.createdAt?.toDate?.()?.toLocaleDateString() }}</TableCell>
                            <TableCell class="font-bold tabular-nums text-foreground dark:text-white">{{
                                formatCurrency(quote.grandTotal || 0) }}
                            </TableCell>
                            <TableCell>
                                <Badge
                                    :style="{ backgroundColor: quote.status === 'APPROVED' ? (appSettings?.uiColors?.brandPrimaryColor || '#79c21b') : (appSettings?.uiColors?.brandSecondaryColor || '#ff8903') }"
                                    class="font-bold text-[10px] uppercase border-none shadow-sm text-white">
                                    {{ quote.status }}
                                </Badge>
                            </TableCell>
                            <TableCell class="text-right flex justify-end gap-2 py-4">
                                <Button variant="outline" size="sm"
                                    class="h-8 w-8 p-0 bg-transparent border-brand-primary/30 text-brand-primary hover:bg-brand-primary/10"
                                    title="Download PDF" @click="handleDownloadPdf(quote)">
                                    <Download class="size-4" />
                                </Button>
                                <Button variant="outline" size="sm"
                                    class="h-8 w-8 p-0 bg-transparent border-brand-primary/30 text-brand-primary hover:bg-brand-primary/10"
                                    title="Duplicate" @click="handleDuplicateQuote(quote.id)">
                                    <Copy class="size-4" />
                                </Button>
                                <Button variant="outline" size="sm"
                                    class="h-8 text-xs bg-transparent border-brand-primary/30 text-brand-primary hover:bg-brand-primary/10"
                                    @click="handleEditQuote(quote)">
                                    Edit
                                </Button>
                                <Button v-if="quote.status === 'DRAFT'" variant="outline" size="sm"
                                    class="h-8 text-xs bg-transparent border-brand-primary/30 text-brand-primary hover:bg-brand-primary/10"
                                    @click="handleApproveQuote(quote.id)">
                                    Approve & Invoice
                                </Button>
                                <!-- Admin Force Delete -->
                                <Button v-if="isSuperAdmin" variant="outline" size="sm"
                                    class="h-8 w-8 p-0 border-destructive/30 text-destructive hover:bg-destructive/10"
                                    title="Force Delete (Admin)" @click="openAdminDelete(quote)">
                                    <Trash2 v-if="!isDeleting || selectedQuoteForAdminDelete?.id !== quote.id" class="size-4" />
                                    <span v-else class="size-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                </Button>
                            </TableCell>
                        </TableRow>
                    </TableBody>
                </Table>

                <!-- Quotations Pagination Controls -->
                <div v-if="store.quotes.length > 0" class="flex items-center justify-between border-t border-brand-primary/20 pt-4 mt-4 px-4 bg-brand-primary/5 dark:bg-brand-primary/10 rounded-b-xl py-3">
                    <p class="text-xs text-muted-foreground dark:text-white/60">
                        Showing {{ Math.min((currentPage - 1) * 30 + 1, store.quotes.length) }}-{{ Math.min(currentPage * 30, store.quotes.length) }} of {{ store.quotes.length }}
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
        v-if="selectedQuoteForAdminDelete"
        v-model:open="isAdminDeleteOpen"
        title="Admin Force Delete"
        :description="`You are about to PERMANENTLY delete Quotation: ${selectedQuoteForAdminDelete.quoteRef || selectedQuoteForAdminDelete.id}. This action is irreversible.`"
        :target-id="String(selectedQuoteForAdminDelete.quoteRef || selectedQuoteForAdminDelete.id)"
        :loading="isDeleting"
        @confirm="handleAdminDeleteConfirm"
    />
</template>
