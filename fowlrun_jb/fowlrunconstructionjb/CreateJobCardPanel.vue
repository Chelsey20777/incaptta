<template>
  <!-- shadcn-vue Sheet slide-over — matches existing RaisePrPanel pattern -->
  <Sheet v-model:open="isOpen">
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
          <Label for="clientName" class="text-sm">
            Client Name <span class="text-destructive">*</span>
          </Label>
          <Input
            id="clientName"
            v-model="form.clientName"
            placeholder="e.g. Tripple T Investments"
            :class="{ 'border-destructive': errors.clientName }"
          />
          <p v-if="errors.clientName" class="text-xs text-destructive">
            {{ errors.clientName }}
          </p>
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
          <p v-if="errors.siteLocation" class="text-xs text-destructive">
            {{ errors.siteLocation }}
          </p>
        </div>

        <!-- Department -->
        <div class="space-y-1.5">
          <Label class="text-sm">Department</Label>
          <Select v-model="form.departmentId" @update:modelValue="onDepartmentChange">
            <SelectTrigger>
              <SelectValue placeholder="Select department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="dept in departments"
                :key="dept.id"
                :value="dept.id"
              >
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
              <SelectItem
                v-for="cat in categories"
                :key="cat.id"
                :value="cat.id"
              >
                {{ cat.name }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- Linked Quote (optional) -->
        <div class="space-y-1.5">
          <Label class="text-sm">
            Linked Quote
            <span class="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Select v-model="form.linkedQuoteId">
            <SelectTrigger>
              <SelectValue placeholder="Select quote..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">None</SelectItem>
              <SelectItem
                v-for="quote in quotes"
                :key="quote.id"
                :value="quote.id"
              >
                {{ quote.quoteNo }} — {{ quote.clientName }}
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
            @click="isOpen = false"
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
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
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
import { useCreateJobCardFromCalculator } from '@/features/jobCards/composables/useCreateJobCardFromCalculator'
import type { FowlrunCalculation } from '@/types/fowlrun.types'

// ── Props & Emits ──────────────────────────────────────────────────────────────
const props = defineProps<{
  calc: FowlrunCalculation
  calculationId?: string   // Firestore ID if calc was saved
}>()

const emit = defineEmits<{
  created: [jobCardId: string, jobCardNumber: string]
}>()

// ── Composable ─────────────────────────────────────────────────────────────────
const { isCreating, createJobCardFromCalculation } = useCreateJobCardFromCalculator()
const router = useRouter()

// ── Sheet open state (controlled by parent via v-model on trigger button) ──────
const isOpen = defineModel<boolean>('open', { default: false })

// ── Form state ─────────────────────────────────────────────────────────────────
const form = ref({
  clientName: '',
  siteLocation: '',
  departmentId: '',
  departmentName: '',
  jobCategoryId: '',
  jobCategoryName: '',
  linkedQuoteId: '',
})

const errors = ref<Record<string, string>>({})

// ── Dropdown data ──────────────────────────────────────────────────────────────
interface Department { id: string; name: string }
interface Category { id: string; name: string }
interface Quote { id: string; quoteNo: string; clientName: string }

const departments = ref<Department[]>([])
const categories = ref<Category[]>([])
const quotes = ref<Quote[]>([])

// ── Computed ───────────────────────────────────────────────────────────────────
const structureLabel = computed(
  () => `${props.calc.size.L}x${props.calc.size.W}m`
)

const materialCount = computed(
  () => props.calc.items.filter(i => i.category === 'material').length
)

const labourCount = computed(
  () => props.calc.items.filter(i => i.category === 'labour').length
)

const transportCount = computed(
  () => props.calc.items.filter(i => i.category === 'transport').length
)

// ── Load dropdown data ─────────────────────────────────────────────────────────
async function loadDropdowns() {
  // Load departments
  try {
    const deptSnap = await getDocs(
      query(collection(db, 'departments'), where('isActive', '==', true))
    )
    departments.value = deptSnap.docs.map(d => ({
      id: d.id,
      name: d.data().name,
    }))

    // Pre-select Agric-Structures if found
    const agric = departments.value.find(d =>
      d.name.toLowerCase().includes('agric')
    )
    if (agric) {
      form.value.departmentId = agric.id
      form.value.departmentName = agric.name
      await loadCategories(agric.id)
    }
  } catch (err) {
    console.warn('[CreateJobCardPanel] Failed to load departments:', err)
  }

  // Load recent quotes for agric-structures
  try {
    const quoteSnap = await getDocs(
      query(
        collection(db, 'quotes'),
        where('department', '==', 'agric-structures'),
        orderBy('createdAt', 'desc'),
        limit(20)
      )
    )
    quotes.value = quoteSnap.docs.map(d => ({
      id: d.id,
      quoteNo: d.data().quoteNo ?? d.id,
      clientName: d.data().clientName ?? 'Unknown',
    }))
  } catch {
    // Quotes are optional — silently ignore
  }
}

async function loadCategories(departmentId: string) {
  try {
    const catSnap = await getDocs(
      query(
        collection(db, 'jobCategories'),
        where('departmentId', '==', departmentId),
        where('isActive', '==', true)
      )
    )
    categories.value = catSnap.docs.map(d => ({
      id: d.id,
      name: d.data().name,
    }))

    // Pre-select Fowlrun category if found
    const fowlrun = categories.value.find(c =>
      c.name.toLowerCase().includes('fowlrun') ||
      c.name.toLowerCase().includes('fowl')
    )
    if (fowlrun) {
      form.value.jobCategoryId = fowlrun.id
      form.value.jobCategoryName = fowlrun.name
    }
  } catch (err) {
    console.warn('[CreateJobCardPanel] Failed to load categories:', err)
  }
}

function onDepartmentChange(deptId: string) {
  const dept = departments.value.find(d => d.id === deptId)
  if (dept) form.value.departmentName = dept.name
  form.value.jobCategoryId = ''
  form.value.jobCategoryName = ''
  loadCategories(deptId)
}

function onCategoryChange(catId: string) {
  const cat = categories.value.find(c => c.id === catId)
  if (cat) form.value.jobCategoryName = cat.name
}

// ── Validation ─────────────────────────────────────────────────────────────────
function validate(): boolean {
  errors.value = {}
  if (!form.value.clientName.trim()) {
    errors.value.clientName = 'Client name is required'
  }
  if (!form.value.siteLocation.trim()) {
    errors.value.siteLocation = 'Site location is required'
  }
  return Object.keys(errors.value).length === 0
}

// ── Submit ─────────────────────────────────────────────────────────────────────
async function handleSubmit() {
  if (!validate()) return

  try {
    const result = await createJobCardFromCalculation(props.calc, {
      clientName: form.value.clientName.trim(),
      siteLocation: form.value.siteLocation.trim(),
      departmentId: form.value.departmentId,
      departmentName: form.value.departmentName,
      jobCategoryId: form.value.jobCategoryId,
      jobCategoryName: form.value.jobCategoryName,
      linkedQuoteId: form.value.linkedQuoteId || undefined,
      linkedCalculationId: props.calculationId,
    })

    // Success feedback
    const matchMsg = result.unmatchedCount > 0
      ? ` · ${result.unmatchedCount} item${result.unmatchedCount > 1 ? 's' : ''} need inventory mapping`
      : ` · All ${result.matchedCount} materials matched`

    toast.success(`${result.jobCardNumber} created${matchMsg}`)

    isOpen.value = false
    emit('created', result.jobCardId, result.jobCardNumber)

    // Navigate to job card detail
    await router.push({
      name: 'JobCardDetail',
      params: { id: result.jobCardId },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create job card'
    toast.error(msg)
  }
}

// ── Init ───────────────────────────────────────────────────────────────────────
onMounted(() => {
  loadDropdowns()
})
</script>
