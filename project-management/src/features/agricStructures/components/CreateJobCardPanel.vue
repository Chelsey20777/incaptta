<template>
  <Sheet :open="open" @update:open="emit('update:open', $event)">
    <SheetContent class="w-full sm:max-w-lg overflow-y-auto">

      <SheetHeader class="mb-6">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-lg bg-orange-50 flex items-center justify-center flex-shrink-0">
            <ClipboardList class="w-4 h-4 text-orange-600" />
          </div>
          <div>
            <SheetTitle class="text-base font-medium">Create Job Card</SheetTitle>
            <SheetDescription class="text-xs text-muted-foreground mt-0.5">
              {{ structureLabel }} · {{ calc.area.toLocaleString() }}m²
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <!-- BOQ Preview Summary -->
      <div class="grid grid-cols-3 gap-2 mb-6 p-3 rounded-lg bg-muted/40 border border-border/50">
        <div class="text-center">
          <p class="text-lg font-medium text-foreground">{{ materialCount }}</p>
          <p class="text-[11px] text-muted-foreground">Materials</p>
        </div>
        <div class="text-center border-x border-border/50">
          <p class="text-lg font-medium text-foreground">{{ labourCount }}</p>
          <p class="text-[11px] text-muted-foreground">Labour</p>
        </div>
        <div class="text-center">
          <p class="text-lg font-medium text-foreground">{{ transportCount }}</p>
          <p class="text-[11px] text-muted-foreground">Transport</p>
        </div>
      </div>

      <!-- Grand Total -->
      <div class="flex items-center justify-between mb-6 px-3 py-2.5 rounded-lg border border-orange-200 bg-orange-50/50">
        <span class="text-sm text-muted-foreground">Estimated total</span>
        <span class="text-base font-medium text-orange-700">
          ${{ calc.grandTotal.toFixed(2) }}
        </span>
      </div>

      <!-- Form -->
      <form class="space-y-4" @submit.prevent="handleSubmit">

        <!-- Client Name -->
        <div class="space-y-1.5">
          <Label class="text-sm">
            Client Name <span class="text-destructive">*</span>
          </Label>
          <Select v-model="form.customerId" @update:modelValue="onCustomerChange">
            <SelectTrigger :class="{ 'border-destructive': errors.clientName }">
              <SelectValue placeholder="Select client..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="customer in customers" :key="customer.id" :value="customer.id">
                {{ customer.name }}
              </SelectItem>
            </SelectContent>
          </Select>
          <p v-if="errors.clientName" class="text-xs text-destructive">{{ errors.clientName }}</p>
        </div>

        <!-- Site Location -->
        <div class="space-y-1.5">
          <Label for="siteLocation" class="text-sm">
            Site Location <span class="text-destructive">*</span>
          </Label>
          <Input
            id="siteLocation"
            v-model="form.siteLocation"
            placeholder="e.g. Beitbridge, Zimbabwe"
            :class="{ 'border-destructive': errors.siteLocation }"
          />
          <p v-if="errors.siteLocation" class="text-xs text-destructive">{{ errors.siteLocation }}</p>
        </div>

        <!-- Department -->
        <div class="space-y-1.5">
          <Label class="text-sm">Department</Label>
          <Select v-model="form.departmentId" @update:modelValue="onDepartmentChange">
            <SelectTrigger>
              <SelectValue placeholder="Select department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="dept in departments" :key="dept.id" :value="dept.id">
                {{ dept.name }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- Job Category -->
        <div class="space-y-1.5">
          <Label class="text-sm">Job Category</Label>
          <Select v-model="form.jobCategoryId" @update:modelValue="onCategoryChange">
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="cat in jobCategories" :key="cat.id" :value="cat.id">
                {{ cat.name }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- Inventory Match Notice -->
        <div class="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
          <div class="flex items-start gap-2">
            <AlertCircle class="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <p class="text-xs font-medium text-amber-800">Inventory matching</p>
              <p class="text-xs text-amber-700 mt-0.5 leading-relaxed">
                {{ materialCount }} materials will be matched against your inventory.
                Unmatched items can be mapped after the job card is created.
              </p>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            class="flex-1"
            :disabled="isCreating"
            @click="emit('update:open', false)"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            class="flex-1 bg-orange-600 hover:bg-orange-700 text-white"
            :disabled="isCreating"
          >
            <Loader2 v-if="isCreating" class="w-4 h-4 mr-2 animate-spin" />
            <ClipboardList v-else class="w-4 h-4 mr-2" />
            {{ isCreating ? 'Creating...' : 'Create Job Card' }}
          </Button>
        </div>

      </form>

    </SheetContent>
  </Sheet>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { storeToRefs } from 'pinia'
import { useAdminStore } from '@/features/admin/store/adminStore'
import { useCrmStore } from '@/features/crm/store/crmStore'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ClipboardList, Loader2, AlertCircle } from 'lucide-vue-next'
import { useAgricJobCard } from '../composables/useAgricJobCard'
import type { FowlrunCalculation } from '@/features/agricStructures/types/fowlrun.types'

// ── Props & Emits ──────────────────────────────────────────────────────────────
const props = defineProps<{
  open: boolean
  calc: FowlrunCalculation
  calculationId?: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'created': [jobCardId: string, jobCardNumber: string]
}>()

// ── Store ──────────────────────────────────────────────────────────────────────
const adminStore = useAdminStore()
const { departments, jobCategories } = storeToRefs(adminStore)

const crmStore = useCrmStore()
const { customers } = storeToRefs(crmStore)

// ── Composable ─────────────────────────────────────────────────────────────────
// ── Composable ─────────────────────────────────────────────────────────────────
const { isProcessing: isCreating, createFromCalculation } = useAgricJobCard()
const router = useRouter()

// ── Form state ─────────────────────────────────────────────────────────────────
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

// ── Computed ───────────────────────────────────────────────────────────────────
const structureLabel = computed(() => `${props.calc.size.length}x${props.calc.size.width}m`)

const materialCount = computed(() => props.calc.items.filter(i => i.category === 'material').length)
const labourCount = computed(() => props.calc.items.filter(i => i.category === 'labour').length)
const transportCount = computed(() => props.calc.items.filter(i => i.category === 'transport').length)

// ── Auto-select Agric department when departments load ─────────────────────────
watch(departments, (depts) => {
  if (form.value.departmentId || !depts.length) return
  const agric = depts.find((d: any) =>
    d.name?.toLowerCase().includes('agric')
  )
  if (agric) {
    form.value.departmentId = agric.id
    form.value.departmentName = agric.name
    // Auto-select fowlrun category
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

// ── Dropdown handlers ──────────────────────────────────────────────────────────
function onCustomerChange(value: unknown) {
  const customerId = value as string | null
  if (!customerId) return
  const customer = customers.value.find((c: any) => c.id === customerId)
  if (customer) form.value.clientName = (customer as any).name
}

function onDepartmentChange(value: unknown) {
  const deptId = value as string | null
  if (!deptId) return
  const dept = departments.value.find((d: any) => d.id === deptId)
  if (dept) form.value.departmentName = (dept as any).name
  form.value.jobCategoryId = ''
  form.value.jobCategoryName = ''
}

function onCategoryChange(value: unknown) {
  const catId = value as string | null
  if (!catId) return
  const cat = jobCategories.value.find((c: any) => c.id === catId)
  if (cat) form.value.jobCategoryName = (cat as any).name
}

// ── Validation ─────────────────────────────────────────────────────────────────
function validate(): boolean {
  errors.value = {}
  if (!form.value.customerId) errors.value.clientName = 'Please select a client'
  if (!form.value.siteLocation.trim()) errors.value.siteLocation = 'Site location is required'
  return Object.keys(errors.value).length === 0
}

// ── Submit ─────────────────────────────────────────────────────────────────────
async function handleSubmit() {
  if (!validate()) return

  try {
    const result = await createFromCalculation(props.calc, {
      clientName: form.value.clientName.trim(),
      siteLocation: form.value.siteLocation.trim(),
      departmentId: form.value.departmentId,
      departmentName: form.value.departmentName,
      jobCategoryId: form.value.jobCategoryId,
      jobCategoryName: form.value.jobCategoryName,
      linkedCalculationId: props.calculationId,
    })

    const matchMsg = result.unmatchedCount > 0
      ? ` · ${result.unmatchedCount} item${result.unmatchedCount > 1 ? 's' : ''} need inventory mapping`
      : ` · All ${result.matchedCount} materials matched`

    toast.success(`${result.jobNumber} created${matchMsg}`)

    emit('update:open', false)
    emit('created', result.jobCardId, result.jobNumber)

    await router.push(`/agric-structures/job-cards/${result.jobCardId}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create job card'
    toast.error(msg)
  }
}

// ── Init ───────────────────────────────────────────────────────────────────────
onMounted(() => {
  adminStore.fetchAll()
  crmStore.fetchCustomers()
})
</script>
