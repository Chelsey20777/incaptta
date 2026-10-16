<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useFinanceStore } from '../store/financeStore'
import { useSession } from '@/composables/useSession'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, ArrowRightLeft, AlertTriangle } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

const router = useRouter()
const store = useFinanceStore()
const { user } = useSession()
const { finalBalances, loading: balancesLoading } = storeToRefs(store)
const isSubmitting = ref(false)

onMounted(() => {
  store.fetchExpenses()
  store.fetchTransfers()
  store.fetchJobPayments()
  store.fetchTopUps()
})
onUnmounted(() => store.cleanup())

const form = ref({
  fromAccount: '',
  toAccount: '',
  amount: 0,
  reference: ''
})

const fmt = (n: number) =>
  Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Live balance of the selected source account
const fromBalance = computed(() => {
  if (!form.value.fromAccount) return null
  return finalBalances.value[form.value.fromAccount.toUpperCase()] ?? 0
})

const isInsufficientFunds = computed(() =>
  fromBalance.value !== null &&
  form.value.amount > 0 &&
  form.value.amount > fromBalance.value
)

const handleSubmit = async () => {
  if (!form.value.fromAccount || !form.value.toAccount) {
    toast.error('Please select both source and destination accounts.')
    return
  }
  if (form.value.fromAccount === form.value.toAccount) {
    toast.error('Source and destination accounts cannot be the same.')
    return
  }
  if (!form.value.amount || form.value.amount <= 0) {
    toast.error('Please enter a valid transfer amount.')
    return
  }
  if (isInsufficientFunds.value) {
    const shortfall = form.value.amount - (fromBalance.value ?? 0)
    toast.error(`Insufficient Funds in ${form.value.fromAccount.toUpperCase()}`, {
      description: `Available: $${fmt(fromBalance.value ?? 0)} — Required: $${fmt(form.value.amount)} — Shortfall: $${fmt(shortfall)}. Please select a different source account or reduce the amount.`,
      duration: 6000
    })
    return
  }
  isSubmitting.value = true
  try {
    await store.initiateTransfer(form.value, {
      name: user.value?.displayName || '',
      email: user.value?.email || ''
    })
    toast.success('Transfer submitted', { description: 'Awaiting accountant initial.' })
    router.push('/transfers')
  } catch (err) {
    console.error('Failed to initiate transfer:', err)
    toast.error('Failed to submit transfer.')
  } finally {
    isSubmitting.value = false
  }
}

</script>

<template>
  <div class="max-w-4xl mx-auto space-y-8 py-8">
    <div class="flex items-center gap-4">
      <Button variant="ghost" size="icon" @click="router.back()"
        class="hover:bg-primary/10 hover:text-primary transition-colors">
        <ArrowLeft class="size-5" />
      </Button>
      <h2 class="text-4xl font-extrabold tracking-tight">Post Fund Transfer</h2>
    </div>

    <Card class="backdrop-blur-md bg-card/60 border-muted/20 shadow-2xl relative overflow-hidden">
      <!-- Decorative grid element -->
      <div
        class="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none opacity-20">
      </div>

      <CardHeader class="relative pb-8">
        <CardTitle class="text-2xl font-bold">Transfer Details</CardTitle>
        <CardDescription class="text-base">Move funds between cash, bank, or mobile accounts.</CardDescription>
      </CardHeader>

      <CardContent class="space-y-8 relative">
        <div class="flex flex-col md:flex-row items-center gap-8">
          <div class="w-full space-y-3">
            <Label for="from" class="text-sm font-semibold tracking-wide uppercase opacity-70">From Account</Label>
            <Select v-model="form.fromAccount">
              <SelectTrigger id="from" class="h-12 bg-background/50 border-muted/20 text-lg"
                :class="isInsufficientFunds ? 'border-destructive/60' : ''">
                <SelectValue placeholder="Select source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="bank">Bank</SelectItem>
                <SelectItem value="ecocash">EcoCash</SelectItem>
                <SelectItem value="ird">IRD</SelectItem>
              </SelectContent>
            </Select>
            <!-- Live balance indicator -->
            <div v-if="form.fromAccount" class="flex items-center gap-2 text-sm px-1">
              <template v-if="balancesLoading">
                <span class="text-muted-foreground text-xs italic">Loading balance…</span>
              </template>
              <template v-else-if="isInsufficientFunds">
                <AlertTriangle class="size-4 text-destructive shrink-0" />
                <span class="text-destructive font-semibold">
                  Insufficient funds — Available: ${{ fmt(fromBalance ?? 0) }}
                </span>
              </template>
              <template v-else>
                <span class="text-muted-foreground">Available:</span>
                <span class="font-bold text-emerald-600">${{ fmt(fromBalance ?? 0) }}</span>
              </template>
            </div>
          </div>

          <div class="p-3 bg-primary/10 rounded-full border border-primary/20 mt-6 shadow-inner shrink-0">
            <ArrowRightLeft class="size-6 text-primary" />
          </div>

          <div class="w-full space-y-3">
            <Label for="to" class="text-sm font-semibold tracking-wide uppercase opacity-70">To Account</Label>
            <Select v-model="form.toAccount">
              <SelectTrigger id="to" class="h-12 bg-background/50 border-muted/20 text-lg">
                <SelectValue placeholder="Select destination" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="bank">Bank</SelectItem>
                <SelectItem value="ecocash">EcoCash</SelectItem>
                <SelectItem value="ird">IRD</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div class="space-y-3">
          <Label for="amount" class="text-sm font-semibold tracking-wide uppercase opacity-70">Transfer Amount
            ($)</Label>
          <Input id="amount" type="number" v-model="form.amount" step="0.01"
            class="h-12 bg-background/50 border-muted/20 text-xl font-bold" />
        </div>

        <div class="space-y-3">
          <Label for="ref" class="text-sm font-semibold tracking-wide uppercase opacity-70">External Reference / Batch
            ID</Label>
          <Input id="ref" v-model="form.reference" placeholder="e.g. EBK-9901"
            class="h-12 bg-background/50 border-muted/20 text-base" />
        </div>
      </CardContent>

      <CardFooter class="flex justify-end gap-3 border-t bg-muted/5 p-8 relative">
        <Button variant="outline" @click="router.back()" class="h-12 px-8 text-base">Cancel</Button>
        <Button :disabled="isSubmitting || isInsufficientFunds" @click="handleSubmit"
          class="h-12 px-10 text-base font-bold shadow-lg shadow-primary/20"
          :class="isInsufficientFunds ? 'opacity-50 cursor-not-allowed' : ''">
          {{ isSubmitting ? 'Posting...' : 'Post Transfer' }}
        </Button>
      </CardFooter>
    </Card>
  </div>
</template>
