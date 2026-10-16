<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Loader2, RefreshCw, Link2, FileText, Receipt } from 'lucide-vue-next'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useAdminStore } from '@/features/admin/store/adminStore'
import { useCrmStore } from '@/features/crm/store/crmStore'
import { STRUCTURE_SIZES } from '@/features/jobCards/data/bomTemplates'
import { formatCurrency } from '@/features/inventory/utils/pricing'

const props = defineProps<{
  modelValue: {
    jobCardTitle: string
    projectDescription: string
    requestingDepartmentId: string
    jobCategoryId: string
    jobNumber: string
    projectLocation: string
    dimensionsOfStructure: string
    startDate: string
    recipientName: string
    recipientAddress: string
    recipientPhone: string
    // CRM Link Fields
    linkedCrmId?: string
    linkedCrmType?: 'QUOTE' | 'INVOICE' | ''
    linkedCrmNumber?: string
    linkedCrmTotal?: number
  }
  isGenerating?: boolean
  generationFailed?: boolean
}>()

const emit = defineEmits(['update:modelValue', 'retry-job-number'])

const adminStore = useAdminStore()
const crmStore = useCrmStore()

onMounted(() => {
  adminStore.fetchAll()
  crmStore.fetchCustomers()
  crmStore.fetchQuotes()
  crmStore.fetchInvoices()
})

const updateField = (field: string, value: any) => {
  emit('update:modelValue', { ...props.modelValue, [field]: value })
}

const handleCustomerSelect = (customerName: string) => {
  const customer = crmStore.customers.find(c => c.name === customerName)
  if (customer) {
    emit('update:modelValue', {
      ...props.modelValue,
      recipientName: customer.name,
      recipientAddress: customer.address || 'N/A',
      recipientPhone: customer.phone || 'N/A'
    })
  } else {
    updateField('recipientName', customerName)
  }
}

// Combined list for CRM selection
const crmDocuments = computed(() => {
  const quotes = crmStore.quotes.map(q => ({
    id: q.id,
    type: 'QUOTE' as const,
    ref: q.quoteRef || q.id.substring(0, 8),
    customer: q.customerName,
    total: q.grandTotal || 0,
    customerId: q.customerId
  }))
  
  const invoices = crmStore.invoices.map(i => ({
    id: i.id,
    type: 'INVOICE' as const,
    ref: `INV-${i.id.substring(0, 8).toUpperCase()}`,
    customer: i.customerName,
    total: i.grandTotal || 0,
    customerId: i.customerId
  }))
  
  return [...quotes, ...invoices]
})

const handleCrmSelect = (docId: string) => {
  const selectedDoc = crmDocuments.value.find(d => d.id === docId)
  if (selectedDoc) {
    // Find customer for address/phone
    const customer = crmStore.customers.find(c => c.id === selectedDoc.customerId)
    
    emit('update:modelValue', {
      ...props.modelValue,
      linkedCrmId: selectedDoc.id,
      linkedCrmType: selectedDoc.type,
      linkedCrmNumber: selectedDoc.ref,
      linkedCrmTotal: selectedDoc.total,
      recipientName: selectedDoc.customer,
      recipientAddress: customer?.address || 'N/A',
      recipientPhone: customer?.phone || 'N/A'
    })
  }
}

const currentCrmLink = computed(() => {
  if (!props.modelValue.linkedCrmId) return null
  return crmDocuments.value.find(d => d.id === props.modelValue.linkedCrmId)
})
</script>

<template>
  <Card
    class="bg-brand-primary/5 dark:bg-brand-primary/10 backdrop-blur-md border-brand-primary/20 dark:border-brand-primary/30 shadow-lg text-foreground dark:text-white overflow-hidden">
    <CardHeader class="bg-brand-primary/5 border-b border-brand-primary/10 py-6">
      <CardTitle class="text-2xl font-bold text-brand-primary dark:text-white">Job Information</CardTitle>
      <CardDescription class="text-foreground/60 dark:text-white/60">Enter the primary details for this job card
        assignment.</CardDescription>
    </CardHeader>
    <CardContent class="p-6">
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <!-- Full Width Title -->
        <div class="md:col-span-2 lg:col-span-3 space-y-2">
          <Label for="jobCardTitle"
            class="text-xs font-bold uppercase tracking-wider text-brand-primary dark:text-brand-primary/80">Job Card Title
            <span class="text-destructive">*</span></Label>
          <Input id="jobCardTitle" :model-value="modelValue.jobCardTitle"
            @update:model-value="v => updateField('jobCardTitle', v)" placeholder="e.g. Server Room Aircon Installation"
            class="text-sm bg-background/50 border-brand-primary/20 focus:border-brand-primary focus:ring-brand-primary/20" />
        </div>

        <!-- CRM Link Selector -->
        <div class="md:col-span-2 lg:col-span-1 space-y-2">
          <Label for="crmLink"
            class="text-xs font-bold uppercase tracking-wider text-brand-primary dark:text-brand-primary/80 flex items-center gap-2">
            <Link2 class="size-3" />
            Link CRM Document (Optional)
          </Label>
          <Select :model-value="modelValue.linkedCrmId" @update:model-value="v => handleCrmSelect(String(v))">
            <SelectTrigger id="crmLink" class="text-sm bg-background/50 border-brand-primary/20">
              <SelectValue placeholder="Select Quote or Invoice..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="doc in crmDocuments" :key="doc.id" :value="doc.id">
                <div class="flex items-center gap-2">
                  <FileText v-if="doc.type === 'QUOTE'" class="size-3 text-orange-500" />
                  <Receipt v-else class="size-3 text-emerald-500" />
                  <span class="font-bold">{{ doc.ref }}</span>
                  <span class="text-muted-foreground ml-1">{{ doc.customer }}</span>
                  <span class="text-brand-primary font-bold ml-auto">{{ formatCurrency(doc.total) }}</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          <div v-if="currentCrmLink" class="flex items-center gap-2 px-1">
             <Badge variant="outline" class="text-[9px] uppercase font-bold bg-brand-primary/5 border-brand-primary/20 text-brand-primary">
                {{ currentCrmLink.type }}: {{ currentCrmLink.ref }}
             </Badge>
             <span class="text-[10px] font-bold tabular-nums text-muted-foreground">{{ formatCurrency(currentCrmLink.total) }}</span>
          </div>
        </div>

        <!-- Row 1 -->
        <div class="space-y-2">
          <Label for="department"
            class="text-xs font-bold uppercase tracking-wider text-brand-primary dark:text-brand-primary/80">Requesting
            Department <span class="text-destructive">*</span></Label>
          <Select :model-value="modelValue.requestingDepartmentId"
            @update:model-value="v => updateField('requestingDepartmentId', v)">
            <SelectTrigger id="department" class="text-sm bg-background/50 border-brand-primary/20">
              <SelectValue placeholder="Select Department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="dept in adminStore.departments" :key="dept.id" :value="dept.id">
                {{ dept.name }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="space-y-2">
          <Label for="jobCategory"
            class="text-xs font-bold uppercase tracking-wider text-brand-primary dark:text-brand-primary/80">Job Category <span
              class="text-destructive">*</span></Label>
          <Select :model-value="modelValue.jobCategoryId" @update:model-value="v => updateField('jobCategoryId', v)">
            <SelectTrigger id="jobCategory" class="text-sm bg-background/50 border-brand-primary/20">
              <SelectValue placeholder="Select Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="cat in adminStore.jobCategories" :key="cat.id" :value="cat.id">
                {{ cat.name }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="space-y-2">
          <Label for="jobNumber"
            class="text-xs font-bold uppercase tracking-wider text-brand-primary dark:text-brand-primary/80">Job Number
            (Reference) <span class="text-destructive">*</span></Label>
          <div class="relative">
            <Input id="jobNumber" :model-value="modelValue.jobNumber"
              @update:model-value="v => updateField('jobNumber', v)"
              :placeholder="isGenerating ? 'Generating...' : 'Auto-generated or Manual Ref'"
              :class="['text-sm pr-10 bg-background/50 border-brand-primary/20', generationFailed && !modelValue.jobNumber ? 'border-destructive ring-1 ring-destructive/40' : '']"
              :disabled="isGenerating" />
            <div v-if="isGenerating" class="absolute right-3 top-1/2 -translate-y-1/2">
              <Loader2 class="size-4 animate-spin text-brand-primary" />
            </div>
            <button v-else-if="generationFailed && !modelValue.jobNumber"
              class="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] font-bold text-destructive hover:text-destructive/80"
              type="button" @click="emit('retry-job-number')">
              <RefreshCw class="size-3" /> Retry
            </button>
          </div>
          <p v-if="generationFailed && !modelValue.jobNumber" class="text-[10px] text-destructive">
            Auto-generation failed. Click Retry or type a reference manually.
          </p>
        </div>

        <!-- Row 2 -->
        <div class="space-y-2">
          <Label for="startDate"
            class="text-xs font-bold uppercase tracking-wider text-brand-primary dark:text-brand-primary/80">Start Date</Label>
          <Input id="startDate" type="date" :model-value="modelValue.startDate"
            @update:model-value="v => updateField('startDate', v)"
            class="text-sm bg-background/50 border-brand-primary/20" />
        </div>

        <div class="space-y-2">
          <Label for="projectLocation"
            class="text-xs font-bold uppercase tracking-wider text-brand-primary dark:text-brand-primary/80">Project
            Location</Label>
          <Input id="projectLocation" :model-value="modelValue.projectLocation"
            @update:model-value="v => updateField('projectLocation', v)" placeholder="e.g. Site Name or Address"
            class="text-sm bg-background/50 border-brand-primary/20" />
        </div>

        <!-- Row 3 -->
        <div class="space-y-2">
          <Label for="dimensions"
            class="text-xs font-bold uppercase tracking-wider text-brand-primary dark:text-brand-primary/80">Dimensions of
            Structure</Label>
          <Select :model-value="modelValue.dimensionsOfStructure" @update:model-value="v => updateField('dimensionsOfStructure', v)">
            <SelectTrigger id="dimensions" class="text-sm bg-background/50 border-brand-primary/20">
              <SelectValue placeholder="Select structure size" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="size in STRUCTURE_SIZES" :key="size" :value="size">
                {{ size }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="space-y-2">
          <Label for="recipientName"
            class="text-xs font-bold uppercase tracking-wider text-brand-primary dark:text-brand-primary/80">Recipient
            Name</Label>
          <Select :model-value="modelValue.recipientName" @update:model-value="v => handleCustomerSelect(String(v))">
            <SelectTrigger id="recipientName" class="text-sm bg-background/50 border-brand-primary/20">
              <SelectValue placeholder="Select Recipient (Customer)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="customer in crmStore.customers" :key="customer.id" :value="customer.name">
                {{ customer.name }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="space-y-2">
          <Label for="recipientPhone"
            class="text-xs font-bold uppercase tracking-wider text-brand-primary dark:text-brand-primary/80">Recipient
            Phone</Label>
          <Input id="recipientPhone" :model-value="modelValue.recipientPhone" readonly
            placeholder="Auto-populated from CRM" class="text-sm bg-muted/20 border-dashed border-brand-primary/20" />
        </div>

        <!-- Row 4 -->
        <div class="md:col-span-2 lg:col-span-3 space-y-2">
          <Label for="recipientAddress"
            class="text-xs font-bold uppercase tracking-wider text-brand-primary dark:text-brand-primary/80">Recipient
            Address</Label>
          <Input id="recipientAddress" :model-value="modelValue.recipientAddress" readonly
            placeholder="Auto-populated from CRM" class="text-sm bg-muted/20 border-dashed border-brand-primary/20" />
        </div>

        <!-- Row 6 -->
        <div class="md:col-span-2 lg:col-span-3 space-y-2">
          <Label for="projectDescription"
            class="text-xs font-bold uppercase tracking-wider text-brand-primary dark:text-brand-primary/80">Detailed Project
            Description</Label>
          <Textarea id="projectDescription" :model-value="modelValue.projectDescription"
            @update:model-value="v => updateField('projectDescription', v)"
            placeholder="Provide a comprehensive overview of the job, requirements, or scope..."
            class="text-sm min-h-[120px] resize-y bg-background/50 border-brand-primary/20 focus:border-brand-primary" />
        </div>
      </div>
    </CardContent>
  </Card>
</template>
