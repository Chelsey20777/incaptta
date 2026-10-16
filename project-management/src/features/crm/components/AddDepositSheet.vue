<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
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
import { Textarea } from '@/components/ui/textarea'
import { Loader2, DollarSign } from 'lucide-vue-next'
import { useSession } from '@/composables/useSession'
import { useCrmStore } from '../store/crmStore'
import { useFinanceStore } from '@/features/fundTransfers/store/financeStore'
import { toast } from 'vue-sonner'

interface Props {
  open: boolean
  clientId: string
  clientName: string
  currentBalance: number
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  deposited: []
}>()

const { user, hasAnyRole } = useSession()
const crmStore = useCrmStore()
const financeStore = useFinanceStore()

// Form fields
const amount = ref<number | ''>('')
const paymentMethod = ref<'BANK' | 'ECOCASH' | 'CASH'>('BANK')
const reference = ref('')
const currency = ref<'USD' | 'ZWL' | 'ZAR'>('USD')
const notes = ref('')
const isSubmitting = ref(false)

// Reactive preview
const newBalance = computed(() => {
  const current = props.currentBalance || 0
  const deposit = Number(amount.value) || 0
  return current + deposit
})

// Reset form when sheet opens
watch(() => props.open, (open) => {
  if (open) {
    amount.value = ''
    paymentMethod.value = 'BANK'
    reference.value = ''
    currency.value = 'USD'
    notes.value = ''
    isSubmitting.value = false
  }
})

// Validation
const canSubmit = computed(() => {
  const amt = Number(amount.value)
  return (
    hasAnyRole(['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT']) &&
    amt > 0 &&
    paymentMethod.value &&
    reference.value.trim()
  )
})

async function handleDeposit() {
  if (!hasAnyRole(['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'])) {
    toast.error('Insufficient permissions')
    return
  }

  const amt = Number(amount.value)
  if (!amt || amt <= 0) {
    toast.error('Enter a valid deposit amount')
    return
  }

  if (!paymentMethod.value) {
    toast.error('Select a payment method')
    return
  }

  const refTrimmed = reference.value.trim()
  if (!refTrimmed) {
    toast.error('Reference number is required')
    return
  }

  isSubmitting.value = true
  try {
    // Step 1 — Credit the client account
    await crmStore.recordDeposit({
      clientId: props.clientId,
      clientName: props.clientName,
      amount: amt,
      paymentMethod: paymentMethod.value,
      reference: refTrimmed,
      notes: notes.value.trim(),
      currency: currency.value,
      createdBy: user.value?.uid ?? '',
      createdByName: user.value?.displayName ?? ''
    })

    // Step 2 — Record income in finance module (real account)
    await financeStore.recordIncome({
      description: `Client Deposit — ${props.clientName}`,
      amount: amt,
      paymentMethod: paymentMethod.value.toLowerCase(),
      pettyCashAccount: paymentMethod.value.toLowerCase(),
      currency: currency.value,
      reference: refTrimmed,
      notes: notes.value.trim() ? `Credit deposit: ${notes.value.trim()}` : `Ref: ${refTrimmed}`,
      clientId: props.clientId,
      clientName: props.clientName,
      type: 'CLIENT_DEPOSIT',
      createdByEmail: user.value?.email ?? '',
      createdByName: user.value?.displayName ?? '',
      recordedBy: user.value?.uid ?? '',
      recordedByName: user.value?.displayName ?? ''
    })

    toast.success('Deposit recorded', {
      description: `$${amt.toFixed(2)} credited to ${props.clientName}'s account`
    })

    emit('deposited')
    emit('update:open', false)

    // Reset form
    amount.value = ''
    paymentMethod.value = 'BANK'
    reference.value = ''
    notes.value = ''
    currency.value = 'USD'

  } catch (e: any) {
    console.error('Deposit error:', e)
    toast.error('Failed to record deposit', {
      description: e?.message ?? 'Please try again'
    })
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <Sheet :open="open" @update:open="emit('update:open', $event)">
    <SheetContent class="sm:max-w-md flex flex-col h-full">
      <SheetHeader>
        <SheetTitle>Record Client Deposit</SheetTitle>
        <SheetDescription>
          {{ clientName }} — Current Credit: ${{ currentBalance.toFixed(2) }}
        </SheetDescription>
      </SheetHeader>

      <div class="flex-1 overflow-y-auto space-y-6 py-6">
        <!-- Amount -->
        <div class="space-y-2">
          <Label for="amount" class="font-medium">Deposit Amount *</Label>
          <div class="relative">
            <DollarSign class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              id="amount"
              v-model.number="amount"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              class="pl-9 text-lg font-semibold h-12"
              :disabled="isSubmitting"
            />
          </div>
        </div>

        <!-- Payment Method -->
        <div class="space-y-2">
          <Label for="paymentMethod" class="font-medium">Payment Method *</Label>
          <Select v-model="paymentMethod" :disabled="isSubmitting">
            <SelectTrigger id="paymentMethod" class="w-full">
              <SelectValue placeholder="Select method" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="BANK">Bank</SelectItem>
              <SelectItem value="ECOCASH">EcoCash</SelectItem>
              <SelectItem value="CASH">Cash</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- Reference -->
        <div class="space-y-2">
          <Label for="reference" class="font-medium">Reference / Receipt Number *</Label>
          <Input
            id="reference"
            v-model="reference"
            placeholder="Bank reference, EcoCash transaction ID, or cash receipt number"
            :disabled="isSubmitting"
          />
          <p class="text-xs text-muted-foreground">
            Bank reference, EcoCash transaction ID, or cash receipt number
          </p>
        </div>

        <!-- Currency -->
        <div class="space-y-2">
          <Label for="currency" class="font-medium">Currency</Label>
          <Select v-model="currency" :disabled="isSubmitting">
            <SelectTrigger id="currency" class="w-full">
              <SelectValue placeholder="Select currency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="ZWL">ZWL</SelectItem>
              <SelectItem value="ZAR">ZAR</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- Notes -->
        <div class="space-y-2">
          <Label for="notes" class="font-medium">Notes</Label>
          <Textarea
            id="notes"
            v-model="notes"
            placeholder="Optional notes about this deposit"
            :disabled="isSubmitting"
            class="resize-none"
          />
        </div>

        <!-- Preview Card -->
        <div class="bg-muted/50 rounded-md p-4 space-y-2 text-sm">
          <p class="font-medium">After this deposit:</p>
          <div class="flex justify-between">
            <span class="text-muted-foreground">Current balance:</span>
            <span>${{ currentBalance.toFixed(2) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">Deposit amount:</span>
            <span class="text-green-600 font-medium">+ ${{ (Number(amount) || 0).toFixed(2) }}</span>
          </div>
          <div class="border-t pt-2 flex justify-between font-bold">
            <span>New balance:</span>
            <span class="text-green-700">${{ newBalance.toFixed(2) }}</span>
          </div>
        </div>
      </div>

      <SheetFooter class="gap-2">
        <Button
          variant="outline"
          :disabled="isSubmitting"
          @click="emit('update:open', false)"
        >
          Cancel
        </Button>
        <Button
          variant="default"
          :disabled="!canSubmit || isSubmitting"
          @click="handleDeposit"
        >
          <Loader2 v-if="isSubmitting" class="mr-2 size-4 animate-spin" />
          {{ isSubmitting ? 'Recording...' : 'Record Deposit' }}
        </Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
</template>