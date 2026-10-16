<script setup lang="ts">
import { ref, watch, reactive } from 'vue'
import { useProcurementStore } from '../store/procurementStore'
import { useSession } from '@/composables/useSession'
import type { Supplier, SupplierStatus, PaymentTerms } from '../types'
import { toast } from 'vue-sonner'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TagsInput, TagsInputInput } from '@/components/ui/tags-input'
import { Loader2, X } from 'lucide-vue-next'

const props = defineProps<{
  open: boolean
  supplier: Supplier | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  saved: []
}>()

const procurementStore = useProcurementStore()
const { user: currentUser } = useSession()
const submitting = ref(false)
const errors = reactive<Record<string, string>>({})

const form = reactive({
  name: '',
  contactPerson: '',
  email: '',
  phone: '',
  address: '',
  paymentTerms: 'NET30' as PaymentTerms,
  categories: [] as string[],
  status: 'ACTIVE' as SupplierStatus,
  notes: '',
})

const paymentTermOptions: PaymentTerms[] = ['COD', 'NET30', 'NET60', 'NET90']

// Watch for supplier prop changes to populate form
watch(
  () => props.supplier,
  (supplier) => {
    if (supplier) {
      form.name = supplier.name
      form.contactPerson = supplier.contactPerson
      form.email = supplier.email
      form.phone = supplier.phone
      form.address = supplier.address || ''
      form.paymentTerms = supplier.paymentTerms
      form.categories = supplier.categories || []
      form.status = supplier.status
      form.notes = supplier.notes || ''
    } else {
      // Reset form
      form.name = ''
      form.contactPerson = ''
      form.email = ''
      form.phone = ''
      form.address = ''
      form.paymentTerms = 'NET30'
      form.categories = []
      form.status = 'ACTIVE'
      form.notes = ''
    }
    errors.name = ''
    errors.contactPerson = ''
    errors.email = ''
    errors.phone = ''
    errors.paymentTerms = ''
  },
  { immediate: true }
)

function validateForm(): boolean {
  let isValid = true
  errors.name = ''
  errors.contactPerson = ''
  errors.email = ''
  errors.phone = ''
  errors.paymentTerms = ''

  if (!form.name.trim()) {
    errors.name = 'Name is required'
    isValid = false
  }

  if (!form.contactPerson.trim()) {
    errors.contactPerson = 'Contact person is required'
    isValid = false
  }

  if (!form.email.trim()) {
    errors.email = 'Email is required'
    isValid = false
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    errors.email = 'Invalid email format'
    isValid = false
  }

  if (!form.phone.trim()) {
    errors.phone = 'Phone is required'
    isValid = false
  }

  if (!form.paymentTerms) {
    errors.paymentTerms = 'Payment terms are required'
    isValid = false
  }

  return isValid
}

async function onSubmit() {
  if (!validateForm()) {
    return
  }

  submitting.value = true
  try {
    const baseFormData = {
      name: form.name,
      contactPerson: form.contactPerson,
      email: form.email,
      phone: form.phone,
      address: form.address,
      paymentTerms: form.paymentTerms,
      categories: form.categories,
      notes: form.notes,
    }

    if (props.supplier) {
      // Edit mode - do NOT include status or createdBy; status is changed via the list toggle only
      await procurementStore.updateSupplier(props.supplier.id, baseFormData)
    } else {
      // Create mode - include status (always ACTIVE for new) and createdBy
      const formData = {
        ...baseFormData,
        status: 'ACTIVE' as SupplierStatus,
        createdBy: currentUser.value?.uid || '',
      }
      await procurementStore.addSupplier(formData)
    }

    toast.success('Supplier saved successfully')
    emit('saved')
    emit('update:open', false)
  } catch (error: any) {
    console.error('Error saving supplier:', error)
    toast.error('Failed to save supplier', {
      description: error.message || 'Please try again',
    })
  } finally {
    submitting.value = false
  }
}

const handleCancel = () => {
  emit('update:open', false)
}
</script>

<template>
  <Sheet :open="open" @update:open="emit('update:open', $event)">
    <SheetContent side="right" class="w-full sm:max-w-lg overflow-y-auto">
      <SheetHeader>
        <SheetTitle>{{ supplier ? 'Edit Supplier' : 'Add New Supplier' }}</SheetTitle>
        <SheetDescription>
          {{ supplier ? 'Update supplier details' : 'Add a new supplier to your master list' }}
        </SheetDescription>
      </SheetHeader>

      <div class="space-y-6 py-4">
        <!-- Name -->
        <div class="space-y-2">
          <label class="text-sm font-medium">Supplier Name *</label>
          <Input v-model="form.name" placeholder="Enter supplier name" />
          <div v-if="errors.name" class="text-sm text-destructive">{{ errors.name }}</div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <!-- Contact Person -->
          <div class="space-y-2">
            <label class="text-sm font-medium">Contact Person *</label>
            <Input v-model="form.contactPerson" placeholder="Enter contact name" />
            <div v-if="errors.contactPerson" class="text-sm text-destructive">{{ errors.contactPerson }}</div>
          </div>

          <!-- Phone -->
          <div class="space-y-2">
            <label class="text-sm font-medium">Phone *</label>
            <Input v-model="form.phone" placeholder="Enter phone number" />
            <div v-if="errors.phone" class="text-sm text-destructive">{{ errors.phone }}</div>
          </div>
        </div>

        <!-- Email -->
        <div class="space-y-2">
          <label class="text-sm font-medium">Email *</label>
          <Input v-model="form.email" type="email" placeholder="Enter email address" />
          <div v-if="errors.email" class="text-sm text-destructive">{{ errors.email }}</div>
        </div>

        <!-- Address -->
        <div class="space-y-2">
          <label class="text-sm font-medium">Address</label>
          <Textarea v-model="form.address" placeholder="Enter full address" rows="2" />
        </div>

        <!-- Payment Terms -->
        <div class="space-y-2">
          <label class="text-sm font-medium">Payment Terms *</label>
          <Select v-model="form.paymentTerms">
            <SelectTrigger>
              <SelectValue placeholder="Select payment terms" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="term in paymentTermOptions" :key="term" :value="term">
                {{ term }}
              </SelectItem>
            </SelectContent>
          </Select>
          <div v-if="errors.paymentTerms" class="text-sm text-destructive">{{ errors.paymentTerms }}</div>
        </div>

        <!-- Categories -->
        <div class="space-y-2">
          <label class="text-sm font-medium">Categories</label>
          <TagsInput v-model="form.categories">
            <template v-slot="{ modelValue }">
              <div class="flex flex-wrap gap-1 p-1 min-h-10 border rounded-md">
                <template v-if="modelValue.length > 0">
                  <Badge
                    v-for="(tag, index) in modelValue"
                    :key="index"
                    variant="secondary"
                    class="flex items-center gap-1"
                  >
                    {{ tag }}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      class="h-4 w-4 p-0 hover:bg-transparent"
                      @click="form.categories = form.categories.filter((_, i) => i !== index)"
                    >
                      <X class="h-3 w-3" />
                    </Button>
                  </Badge>
                </template>
                <TagsInputInput placeholder="Type and press Enter to add..." />
              </div>
            </template>
          </TagsInput>
        </div>

        <!-- Notes -->
        <div class="space-y-2">
          <label class="text-sm font-medium">Notes</label>
          <Textarea v-model="form.notes" placeholder="Additional notes..." rows="3" />
        </div>
      </div>

      <SheetFooter class="mt-6">
        <Button variant="outline" @click="handleCancel" :disabled="submitting">
          Cancel
        </Button>
        <Button @click="onSubmit" :disabled="submitting">
          <Loader2 v-if="submitting" class="mr-2 h-4 w-4 animate-spin" />
          {{ supplier ? 'Update Supplier' : 'Create Supplier' }}
        </Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
</template>
