<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { storeToRefs } from 'pinia'
import { useAdminStore } from '@/features/admin/store/adminStore'
import { useCrmStore } from '@/features/crm/store/crmStore'
import { useSession } from '@/composables/useSession'
import { db } from '@/lib/firebase'

import { useFowlrunCalculator } from '../composables/useFowlrunCalculator'
import { useAgricJobCard } from '../composables/useAgricJobCard'
import { PRESET_SIZES } from '../types/fowlrun.types'

import SizeButton from './SizeButton.vue'
import MetricCard from './MetricCard.vue'
import BOQTable from './BOQTable.vue'
import CostSummary from './CostSummary.vue'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Loader2 } from 'lucide-vue-next'

const props = defineProps<{
  savedCalculationId?: string
}>()

const router = useRouter()
const {
  config,
  activeSize,
  customLength,
  customWidth,
  useCustom,
  calculation,
  selectSize,
  applyCustomSize,
} = useFowlrunCalculator()

const { isProcessing: isCreating, createFromCalculation } = useAgricJobCard()

const adminStore = useAdminStore()
const { departments, jobCategories } = storeToRefs(adminStore)

const crmStore = useCrmStore()
const { customers } = storeToRefs(crmStore)

const { user: sessionUser } = useSession()

const form = ref({
  customerId: '',
  clientName: '',
  siteLocation: '',
  departmentId: '',
  departmentName: '',
  jobCategoryId: '',
  jobCategoryName: '',
})

const errors = ref<Record<string, string>>({})

watch(departments, (depts) => {
  if (form.value.departmentId || !depts.length) return
  const agric = depts.find((d: any) =>
    d.name?.toLowerCase().includes('agric')
  )
  if (agric) {
    form.value.departmentId = agric.id
    form.value.departmentName = agric.name
    autoSelectCategory()
  }
}, { immediate: true })

watch(jobCategories, () => {
  if (form.value.departmentId && !form.value.jobCategoryId) {
    autoSelectCategory()
  }
}, { immediate: true })

function autoSelectCategory() {
  const fowlrun = jobCategories.value.find((c: any) =>
    c.name?.toLowerCase().includes('fowlrun') ||
    c.name?.toLowerCase().includes('fowl')
  )
  if (fowlrun) {
    form.value.jobCategoryId = fowlrun.id
    form.value.jobCategoryName = fowlrun.name
  }
}

function onCustomerChange(value: unknown) {
  const customerId = value as string | null
  if (!customerId) return
  const customer = customers.value.find((c: any) => c.id === customerId)
  if (customer) form.value.clientName = (customer as any).name
}

const isSaving = ref(false)

function validate(): boolean {
  errors.value = {}
  if (!form.value.customerId) errors.value.clientName = 'Please select a client'
  if (!form.value.siteLocation.trim()) errors.value.siteLocation = 'Site location is required'
  return Object.keys(errors.value).length === 0
}

async function handleSaveQuotation() {
  if (!validate()) {
     toast.error('Please fill in required fields (Client and Site Location)')
     return
  }

  isSaving.value = true
  try {
    const clientNameStr = form.value.clientName.trim() || customers.value.find((c: any) => c.id === form.value.customerId)?.name || 'Unknown Client'

    const result = await createFromCalculation(calculation.value, {
      clientName: clientNameStr,
      siteLocation: form.value.siteLocation.trim(),
      departmentId: form.value.departmentId,
      departmentName: form.value.departmentName,
      jobCategoryId: form.value.jobCategoryId,
      jobCategoryName: form.value.jobCategoryName,
      linkedCalculationId: props.savedCalculationId,
    })

    toast.success(`Quotation ${result.jobNumber} created`)

    await router.push(`/agric-structures/quotations`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create quotation'
    toast.error(msg)
  } finally {
    isSaving.value = false
  }
}

onMounted(() => {
  adminStore.fetchAll()
  crmStore.fetchCustomers()
})
</script>

<template>
  <div class="bg-card border border-border rounded-xl p-6 max-w-4xl">

    <!-- Header -->
    <div class="flex justify-between items-start mb-6 pb-4 border-b border-border">
      <div>
        <h2 class="text-lg font-semibold text-foreground">Fowlrun Material Calculator</h2>
        <p class="text-sm text-muted-foreground mt-0.5">Agric-Structures · Brickwork & Flooring BOQ</p>
      </div>
      <span class="text-sm font-semibold text-white px-3.5 py-1.5 rounded-full" style="background:#CC5500">
        {{ activeSize.label }}
      </span>
    </div>

    <!-- Size Selector -->
    <div class="mb-5">
      <label class="block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Select Structure Size</label>
      <div class="flex flex-wrap gap-2">
        <SizeButton
          v-for="size in PRESET_SIZES"
          :key="size.label"
          :size="size"
          :active="!useCustom && activeSize.label === size.label"
          @select="selectSize"
        />
      </div>
    </div>

    <!-- Custom Size -->
    <div class="mb-5">
      <label class="block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Custom Size</label>
      <div class="flex items-center gap-2.5 flex-wrap">
        <input
          v-model.number="customLength"
          type="number"
          placeholder="Length (m)"
          min="1" max="500"
          class="w-28 px-3 py-1.5 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10"
        />
        <span class="text-muted-foreground font-medium">×</span>
        <input
          v-model.number="customWidth"
          type="number"
          placeholder="Width (m)"
          min="1" max="50"
          class="w-28 px-3 py-1.5 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10"
        />
        <button
          class="px-4 py-1.5 text-sm font-semibold text-white rounded-lg transition-colors"
          style="background:#CC5500"
          @click="applyCustomSize"
        >
          Calculate
        </button>
      </div>
    </div>

    <!-- Config Row -->
    <div class="flex gap-6 items-end flex-wrap mb-6">
      <div class="flex flex-col gap-1">
        <label class="text-xs text-muted-foreground">Brick cost ($/unit)</label>
        <input v-model.number="config.brickUnitCost" type="number" step="0.01" min="0.01"
          class="w-28 px-3 py-1.5 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10" />
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-xs text-muted-foreground">Cement ($/bag)</label>
        <input v-model.number="config.cementUnitCost" type="number" step="0.5" min="1"
          class="w-28 px-3 py-1.5 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10" />
      </div>
      <div class="flex flex-col gap-1 items-start">
        <label class="text-xs text-muted-foreground">Include Labour</label>
        <input v-model="config.includeLabour" type="checkbox" class="w-4 h-4 cursor-pointer accent-orange-600" />
      </div>
      <div class="flex flex-col gap-1 items-start">
        <label class="text-xs text-muted-foreground">Include Transport</label>
        <input v-model="config.includeTransport" type="checkbox" class="w-4 h-4 cursor-pointer accent-orange-600" />
      </div>
    </div>

    <!-- Metrics -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-6">
      <MetricCard label="Floor Area"      :value="`${calculation.area.toLocaleString()}m²`"  :sub="`${calculation.size.length}m × ${calculation.size.width}m`" />
      <MetricCard label="Bird Capacity"   :value="`${calculation.birdCapacityMin.toLocaleString()}–${calculation.birdCapacityMax.toLocaleString()}`" sub="broiler density" />
      <MetricCard label="Structural Bays" :value="calculation.bays.toString()" sub="@ 5m spacing" />
      <MetricCard label="Grand Total"     :value="`$${calculation.grandTotal.toFixed(2)}`" sub="current config" highlight />
    </div>

    <!-- BOQ Table -->
    <div class="mb-5">
      <label class="block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Bill of Quantities</label>
      <BOQTable :items="calculation.items" />
    </div>

    <!-- Cost Summary -->
    <CostSummary :calculation="calculation" :config="config" />

    <!-- Client Quotation Section -->
    <div class="mt-6 pt-6 border-t border-border">
      <h3 class="text-sm font-semibold text-foreground mb-4">Save Quotation Details</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <div class="space-y-1.5">
          <label class="text-xs text-muted-foreground font-semibold">Client <span class="text-destructive">*</span></label>
          <Select v-model="form.customerId" @update:modelValue="onCustomerChange">
            <SelectTrigger :class="{ 'border-destructive': errors.clientName }" class="bg-background">
              <SelectValue placeholder="Select client from CRM..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="customer in customers" :key="customer.id" :value="customer.id">
                {{ customer.name }}
              </SelectItem>
            </SelectContent>
          </Select>
          <p v-if="errors.clientName" class="text-[10px] text-destructive mt-1">{{ errors.clientName }}</p>
        </div>
        <div class="space-y-1.5">
          <label class="text-xs text-muted-foreground font-semibold">Site Location <span class="text-destructive">*</span></label>
          <Input
            v-model="form.siteLocation"
            placeholder="e.g. Beitbridge, Zimbabwe"
            :class="{ 'border-destructive': errors.siteLocation }"
            class="bg-background"
          />
          <p v-if="errors.siteLocation" class="text-[10px] text-destructive mt-1">{{ errors.siteLocation }}</p>
        </div>
      </div>
      
      <div class="flex gap-2">
        <button
          class="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg text-white transition-colors disabled:opacity-50 hover:opacity-90"
          style="background:#CC5500"
          :disabled="isSaving || isCreating"
          @click="handleSaveQuotation"
        >
          <Loader2 v-if="isSaving || isCreating" class="w-4 h-4 mr-2 animate-spin" />
          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mr-1">
             <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
             <polyline points="14,2 14,8 20,8"/>
             <line x1="12" y1="18" x2="12" y2="12"/>
             <line x1="9" y1="15" x2="15" y2="15"/>
          </svg>
          {{ (isSaving || isCreating) ? 'Saving...' : 'Save Quotation' }}
        </button>
      </div>
    </div>

  </div>
</template>
