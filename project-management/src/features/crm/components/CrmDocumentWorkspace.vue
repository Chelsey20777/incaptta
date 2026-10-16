<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Loader2, Plus } from 'lucide-vue-next'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { formatCurrency } from '@/features/inventory/utils/pricing'
import OtherServicesGrid from './OtherServicesGrid.vue'
import InventoryRequisitionGrid from '@/features/jobCards/components/InventoryRequisitionGrid.vue'
import BomTemplateSelector from '@/features/jobCards/components/BomTemplateSelector.vue'
import { STRUCTURE_SIZES } from '@/features/jobCards/data/bomTemplates.ts'
import { inventoryApi } from '@/features/inventory/api/inventoryApi'
import type { UnmatchedBomItem, BomRequisitionSection } from '@/features/jobCards/composables/useBomTemplate'
import { toast } from 'vue-sonner'
import { useAdminStore } from '@/features/admin/store/adminStore'
import { storeToRefs } from 'pinia'

const props = defineProps<{
    initialData?: any
    customers: any[]
    jobCategories: any[]
    loading?: boolean
    mode: 'QUOTE' | 'INVOICE'
}>()

const emit = defineEmits(['save', 'cancel'])

const isNewCustomerDialogOpen = ref(false)
const isCreatingCustomer = ref(false)
const newCustomerForm = ref({
    name: '',
    email: '',
    phone: '',
    company: ''
})

const draftCustomer = ref('')
const dimensionsOfStructure = ref('')
const inventoryItemsForTemplate = ref<any[]>([])
const unmatchedBomItems = ref<UnmatchedBomItem[]>([])
const draftSections = ref<any[]>([
    { id: crypto.randomUUID(), jobCategoryId: '', description: '', unit: 'Unit', qty: 1, items: [] }
])
const draftServices = ref<any[]>([])

const adminStore = useAdminStore()
const { appSettings } = storeToRefs(adminStore)

const vatEnabled = computed(() => Boolean(appSettings.value?.vatEnabled))
const vatRate = computed(() => vatEnabled.value ? Number(appSettings.value?.vatRate || 0) : 0)

const totals = computed(() => {
    const invTotals = draftSections.value.reduce((acc, section) => {
        const sectionSummary = (section.items || []).reduce((sAcc: any, item: any) => {
            const qty = item.qtyRequired || 0
            const price = item.irdSellingPrice || 0
            const markup = item.markupPercent || 0

            const baseIRD = qty * price
            const twidMU = baseIRD * (markup / 100)

            return {
                totalIrdCost: sAcc.totalIrdCost + baseIRD,
                totalMarkup: sAcc.totalMarkup + twidMU,
                grandTotal: sAcc.grandTotal + (baseIRD + twidMU)
            }
        }, { totalIrdCost: 0, totalMarkup: 0, grandTotal: 0 })

        return {
            totalIrdCost: acc.totalIrdCost + sectionSummary.totalIrdCost,
            totalMarkup: acc.totalMarkup + sectionSummary.totalMarkup,
            grandTotal: acc.grandTotal + sectionSummary.grandTotal
        }
    }, { totalIrdCost: 0, totalMarkup: 0, grandTotal: 0 })

    const serviceTotal = draftServices.value.reduce((sum, item) => sum + (item.total || 0), 0)
    const subtotal = invTotals.grandTotal + serviceTotal
    const vatAmount = vatEnabled.value ? (subtotal * vatRate.value / 100) : 0
    const grandTotal = subtotal + vatAmount

    return {
        ...invTotals,
        serviceTotal,
        subtotal,
        vatAmount,
        grandTotal
    }
})

onMounted(async () => {
    try {
        inventoryItemsForTemplate.value = await inventoryApi.listInventory({ isActive: true })
    } catch (err) {
        console.error('Failed to load inventory for templates:', err)
    }

    if (props.initialData) {
        loadInitialData()
    }
})

const loadInitialData = () => {
    const data = props.initialData
    draftCustomer.value = data.customerId || ''
    dimensionsOfStructure.value = data.dimensionsOfStructure || ''
    
    // Map items into sections (backward compatibility or fresh load)
    if (data.requisitionSections) {
        draftSections.value = data.requisitionSections
    } else if (data.items) {
        draftSections.value = [{
            id: crypto.randomUUID(),
            jobCategoryId: '',
            description: 'Standard Requisition',
            items: data.items.map((item: any) => ({
                id: crypto.randomUUID(),
                inventoryItemId: item.inventoryItemId,
                itemName: item.description,
                qtyRequired: item.qty,
                irdSellingPrice: item.price,
                markupPercent: item.markupPercent || 0
            }))
        }]
    }

    // Map services
    if (data.otherServices) {
        draftServices.value = data.otherServices.map((s: any) => ({
            description: s.description,
            qty: s.qty,
            unitPrice: s.price,
            total: s.total
        }))
    }
}

const handleTemplateApply = ({ sections, mode }: { sections: BomRequisitionSection[], mode: 'replace' | 'append' }) => {
    if (mode === 'replace') {
        draftSections.value = sections
    } else {
        draftSections.value = [...draftSections.value, ...sections]
    }
}

const handleUnmatched = (items: UnmatchedBomItem[]) => {
    unmatchedBomItems.value = items
}

const handleSave = () => {
    const payload = {
        customerId: draftCustomer.value,
        dimensionsOfStructure: dimensionsOfStructure.value,
        requisitionSections: draftSections.value,
        // Also keep a flattened items array for PDF/Report compatibility if needed
        items: draftSections.value.flatMap((section: any) => 
            (section.items || []).map((item: any) => ({
                inventoryItemId: item.inventoryItemId,
                description: item.itemName,
                qty: item.qtyRequired,
                price: item.irdSellingPrice,
                markupPercent: item.markupPercent,
                total: (item.qtyRequired * item.irdSellingPrice) * (1 + (item.markupPercent / 100))
            }))
        ),
        otherServices: draftServices.value.map((s: any) => ({
            description: s.description,
            qty: s.qty,
            price: s.unitPrice,
            total: s.total
        })),
        summary: {
            totalIrdCost: totals.value.totalIrdCost,
            totalMarkup: totals.value.totalMarkup,
            totalOtherServices: totals.value.serviceTotal,
            vatRate: vatRate.value,
            vatAmount: totals.value.vatAmount,
            subtotal: totals.value.subtotal
        },
        vatRate: vatRate.value,
        vatAmount: totals.value.vatAmount,
        grandTotal: totals.value.grandTotal
    }
    emit('save', payload)
}

const handleCreateCustomer = async () => {
    if (!newCustomerForm.value.name) return
    
    isCreatingCustomer.value = true
    try {
        const { useCrmStore } = await import('../store/crmStore')
        const store = useCrmStore()
        
        // We need to get the ID of the newly created doc.
        // The store.createCustomer doesn't return the ID currently.
        // Let's modify the store to return the doc ref or ID.
        // Or we can just use the name to find it after, but better to fix store.
        
        // The list will update via onSnapshot in the store.
        const newId = await store.createCustomer({
            ...newCustomerForm.value,
            type: 'INDIVIDUAL' // Default
        })
        
        draftCustomer.value = newId
        toast.success('Customer created successfully and selected')
        isNewCustomerDialogOpen.value = false
        // Reset form
        newCustomerForm.value = { name: '', email: '', phone: '', company: '' }
    } catch (err) {
        console.error(err)
        toast.error('Failed to create customer')
    } finally {
        isCreatingCustomer.value = false
    }
}
</script>

<template>
    <div class="space-y-6">
        <Card>
            <CardHeader>
                <CardTitle>Target Customer</CardTitle>
                <CardDescription>Select the client requesting this {{ mode.toLowerCase() }}.</CardDescription>
            </CardHeader>
            <CardContent>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div class="w-full">
                        <div class="flex items-end gap-2">
                            <div class="w-full max-w-md">
                                <Label class="mb-2 block">Customer Profile</Label>
                                <Select v-model="draftCustomer">
                                    <SelectTrigger class="w-full">
                                        <SelectValue placeholder="Search or choose a client..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem v-for="client in customers" :key="client.id" :value="client.id">
                                            {{ client.name }}
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <Button variant="outline" size="icon" class="h-10 w-10 shrink-0" @click="isNewCustomerDialogOpen = true" title="Add New Client">
                                <Plus class="size-4" />
                            </Button>
                        </div>
                    </div>
                    <div class="w-full">
                        <Label class="mb-2 block">Dimensions of Structure (Optional)</Label>
                        <div class="flex gap-2">
                            <Input v-model="dimensionsOfStructure" placeholder="e.g. 200x30m or select..." class="flex-1" />
                            <Select @update:modelValue="(v: any) => dimensionsOfStructure = v || ''">
                                <SelectTrigger class="w-[140px] shrink-0">
                                    <SelectValue placeholder="Quick Pick" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem v-for="size in STRUCTURE_SIZES" :key="size" :value="size">
                                        {{ size }}
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>

        <!-- BOM Template Selector -->
        <BomTemplateSelector
            :structure-size="dimensionsOfStructure"
            :inventory-items="inventoryItemsForTemplate"
            :job-categories="jobCategories"
            @apply="handleTemplateApply"
            @unmatched="handleUnmatched"
        />

        <!-- Unmatched Items Warning -->
        <div v-if="unmatchedBomItems.length > 0" class="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
            <p class="text-sm font-semibold text-amber-700 dark:text-amber-400">
                {{ unmatchedBomItems.length }} template item(s) could not be matched to inventory and have been added without pricing.
            </p>
            <ul class="mt-2 list-disc list-inside text-xs text-amber-600 dark:text-amber-300 space-y-0.5">
                <li v-for="item in unmatchedBomItems" :key="item.templateName">
                    {{ item.templateName }} — Qty: {{ item.qty }}
                </li>
            </ul>
        </div>

        <Card class="overflow-hidden">
            <CardHeader class="pb-4">
                <CardTitle>Line Items</CardTitle>
                <CardDescription>Build the {{ mode.toLowerCase() }} using standardized inventory catalog pricing.</CardDescription>
            </CardHeader>

            <InventoryRequisitionGrid v-model="draftSections" class="border-x-0 border-b-0 rounded-none" />

            <CardHeader class="pb-4 pt-8 border-t">
                <CardTitle>Other Services / Costs</CardTitle>
                <CardDescription>Add manual service fees, labor, or non-inventory items.</CardDescription>
            </CardHeader>

            <OtherServicesGrid v-model="draftServices" class="border-x-0 border-b-0 rounded-none" />

            <div class="bg-muted/10 p-6 flex flex-col md:flex-row justify-between items-end gap-6 border-t">
                <div class="text-sm text-muted-foreground w-full md:w-auto">
                    <div class="grid grid-cols-2 gap-x-8 gap-y-1">
                        <span>Total Inventory IRD:</span>
                        <span class="text-right tabular-nums">{{ formatCurrency(totals.totalIrdCost) }}</span>
                        <span>Total Custom Markup:</span>
                        <span class="text-right tabular-nums text-green-600 font-medium">+ {{
                            formatCurrency(totals.totalMarkup) }}</span>
                        <template v-if="totals.serviceTotal > 0">
                            <span class="pt-1 border-t">Other Services:</span>
                            <span class="text-right tabular-nums font-medium pt-1 border-t">{{ formatCurrency(totals.serviceTotal) }}</span>
                        </template>
                        <template v-if="vatEnabled">
                            <span class="pt-1 border-t">Subtotal:</span>
                            <span class="text-right tabular-nums font-medium pt-1 border-t">{{ formatCurrency(totals.subtotal) }}</span>
                            <span>VAT ({{ vatRate }}%):</span>
                            <span class="text-right tabular-nums">{{ formatCurrency(totals.vatAmount) }}</span>
                        </template>
                    </div>
                </div>

                <div
                    class="flex flex-col items-end gap-4 w-full md:w-auto mt-4 md:mt-0 pt-4 md:pt-0 border-t md:border-t-0 border-border">
                    <div class="flex items-center gap-4 text-sm font-bold">
                        <span class="text-muted-foreground">Grand Total:</span>
                        <span class="text-2xl tabular-nums underline decoration-primary/30 underline-offset-4">
                            {{ formatCurrency(totals.grandTotal) }}
                        </span>
                    </div>

                    <div class="flex gap-2 w-full md:w-auto">
                        <Button type="button" variant="outline" class="w-full md:w-auto"
                            @click="emit('cancel')">Discard / Back</Button>
                        <Button type="submit" class="w-full md:w-auto" @click="handleSave"
                            :disabled="loading || draftCustomer === ''">
                            <Loader2 v-if="loading" class="mr-2 h-4 w-4 animate-spin" />
                            {{ loading ? 'Saving...' : (initialData ? 'Update ' : 'Save ') + (mode === 'QUOTE' ? 'Quotation' : 'Invoice') }}
                        </Button>
                    </div>
                </div>
            </div>
        </Card>

        <!-- New Customer Dialog -->
        <Dialog :open="isNewCustomerDialogOpen" @update:open="isNewCustomerDialogOpen = $event">
            <DialogContent class="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Add New Client</DialogTitle>
                    <DialogDescription>
                        Create a new customer profile directly from the workspace.
                    </DialogDescription>
                </DialogHeader>
                <div class="grid gap-4 py-4">
                    <div class="space-y-2">
                        <Label>Full Name / Display Name</Label>
                        <Input v-model="newCustomerForm.name" placeholder="e.g. John Doe" />
                    </div>
                    <div class="space-y-2">
                        <Label>Company (Optional)</Label>
                        <Input v-model="newCustomerForm.company" placeholder="e.g. Incaptta Ltd" />
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-2">
                            <Label>Email</Label>
                            <Input v-model="newCustomerForm.email" type="email" placeholder="john@example.com" />
                        </div>
                        <div class="space-y-2">
                            <Label>Phone</Label>
                            <Input v-model="newCustomerForm.phone" placeholder="+263..." />
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" @click="isNewCustomerDialogOpen = false">Cancel</Button>
                    <Button @click="handleCreateCustomer" :disabled="isCreatingCustomer || !newCustomerForm.name">
                        <Loader2 v-if="isCreatingCustomer" class="mr-2 h-4 w-4 animate-spin" />
                        Create Customer
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
</template>
