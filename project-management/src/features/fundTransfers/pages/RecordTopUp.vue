<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useFinanceStore } from '../store/financeStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Wallet } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

import { useSession } from '@/composables/useSession'

const router = useRouter()
const store = useFinanceStore()
const { user } = useSession()
const isSubmitting = ref(false)

const form = ref({
  account: '',
  amount: 0,
  description: '',
  reference: ''
})

const handleSubmit = async () => {
  if (!form.value.account || form.value.amount <= 0 || !form.value.description) {
    toast.error('Missing Information', { description: 'Please fill in all required fields.' })
    return
  }

  isSubmitting.value = true
  try {
    const payload = {
      ...form.value,
      requestedBy: user.value?.displayName || user.value?.email || 'Unknown',
      requestedByEmail: user.value?.email || 'Unknown',
      requestedAt: new Date().toISOString()
    }
    await store.recordTopUp(payload)
    toast.success('Top-Up Request Submitted', { description: 'A manager will review your request.' })
    router.push('/ledger')
  } catch (err: any) {
    console.error('Failed to record top-up:', err)
    toast.error('Submission Failed', { description: err.message })
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="w-full space-y-8 py-8 px-4">
    <div class="flex items-center gap-4">
      <Button variant="ghost" size="icon" @click="router.back()"
        class="hover:bg-primary/10 hover:text-primary transition-colors">
        <ArrowLeft class="size-5" />
      </Button>
      <h2 class="text-4xl font-extrabold tracking-tight">Post Account Top-Up Request</h2>
    </div>

    <Card class="backdrop-blur-md bg-card/60 border-muted/20 shadow-2xl relative overflow-hidden">
      <!-- Decorative grid element -->
      <div
        class="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none opacity-20">
      </div>

      <CardHeader class="relative pb-8">
        <div class="flex items-center gap-3">
            <div class="p-2 bg-emerald-500/10 rounded-lg">
                <Wallet class="size-6 text-emerald-500" />
            </div>
            <div>
                <CardTitle class="text-2xl font-bold">Request Details</CardTitle>
                <CardDescription class="text-base text-muted-foreground">Request an external capital or float injection into a business account.</CardDescription>
            </div>
        </div>
      </CardHeader>

      <CardContent class="space-y-8 relative">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div class="space-y-3">
            <Label for="account" class="text-sm font-semibold tracking-wide uppercase opacity-70">Destination Account</Label>
            <Select v-model="form.account">
              <SelectTrigger id="account" class="h-12 bg-background/50 border-muted/20 text-lg">
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="bank">Bank</SelectItem>
                <SelectItem value="ecocash">EcoCash</SelectItem>
                <SelectItem value="ird">IRD</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="space-y-3">
            <Label for="amount" class="text-sm font-semibold tracking-wide uppercase opacity-70">Amount ($)</Label>
            <Input id="amount" type="number" v-model="form.amount" step="0.01"
              class="h-12 bg-background/50 border-muted/20 text-xl font-bold text-emerald-500" />
          </div>
        </div>

        <div class="space-y-3">
          <Label for="description" class="text-sm font-semibold tracking-wide uppercase opacity-70">Description / Source of Funds</Label>
          <Input id="description" v-model="form.description" placeholder="e.g. Weekly Float Top-up, External Capital Injection"
            class="h-12 bg-background/50 border-muted/20 text-base" />
        </div>

        <div class="space-y-3">
          <Label for="ref" class="text-sm font-semibold tracking-wide uppercase opacity-70">External Reference / Receipt ID</Label>
          <Input id="ref" v-model="form.reference" placeholder="e.g. DEP-12345"
            class="h-12 bg-background/50 border-muted/20 text-base" />
        </div>
      </CardContent>

      <CardFooter class="flex justify-end gap-3 border-t bg-muted/5 p-8 relative">
        <Button variant="outline" @click="router.back()" class="h-12 px-8 text-base">Cancel</Button>
        <Button :disabled="isSubmitting" @click="handleSubmit"
          class="h-12 px-10 text-base font-bold bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-500/20">
          {{ isSubmitting ? 'Submitting...' : 'Submit Top-Up' }}
        </Button>
      </CardFooter>
    </Card>
  </div>
</template>
