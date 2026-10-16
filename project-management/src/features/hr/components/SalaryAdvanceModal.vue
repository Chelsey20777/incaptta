<script setup lang="ts">
import { ref, computed } from 'vue'
import { useHrStore } from '../store/hrStore'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
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
import { Loader2, DollarSign, Calendar, User } from 'lucide-vue-next'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits(['update:open', 'success'])

const hrStore = useHrStore()
const loading = ref(false)

const initialState = {
  employeeId: '',
  amount: 0,
  date: new Date().toISOString().split('T')[0],
  reason: ''
}

const form = ref({ ...initialState })

const selectedEmployee = computed(() => 
  hrStore.employees.find(e => e.id === form.value.employeeId)
)

async function handleSubmit() {
  if (!form.value.employeeId || form.value.amount <= 0) return
  
  loading.value = true
  try {
    await hrStore.recordSalaryAdvance({
      employeeId: form.value.employeeId,
      employeeName: selectedEmployee.value?.fullName ?? 'Unknown',
      amount: form.value.amount,
      date: form.value.date!,
      reason: form.value.reason!
    })
    emit('update:open', false)
    emit('success')
    // Reset form
    form.value = { ...initialState }
  } catch (err) {
    console.error('Failed to record advance:', err)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="sm:max-w-[425px] border-brand-primary/10 shadow-2xl">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2 text-xl font-black">
          <DollarSign class="size-5 text-brand-primary" />
          Record Salary Advance
        </DialogTitle>
      </DialogHeader>

      <div class="grid gap-4 py-4">
        <div class="space-y-2">
          <Label class="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Employee</Label>
          <Select v-model="form.employeeId">
            <SelectTrigger class="bg-muted/30 border-brand-primary/10">
              <SelectValue placeholder="Select Employee" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="emp in hrStore.employees" :key="emp.id" :value="emp.id!">
                {{ emp.fullName }} ({{ emp.jobTitle }})
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <Label class="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Amount (USD)</Label>
            <div class="relative">
              <DollarSign class="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input 
                type="number" 
                v-model="form.amount" 
                class="pl-9 bg-muted/30 border-brand-primary/10 font-bold tabular-nums" 
              />
            </div>
          </div>
          <div class="space-y-2">
            <Label class="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Date</Label>
            <div class="relative">
              <Calendar class="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input 
                type="date" 
                v-model="form.date" 
                class="pl-9 bg-muted/30 border-brand-primary/10" 
              />
            </div>
          </div>
        </div>

        <div class="space-y-2">
          <Label class="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Reason / Reference</Label>
          <Input 
            v-model="form.reason" 
            placeholder="e.g. Family Emergency, School Fees" 
            class="bg-muted/30 border-brand-primary/10"
          />
        </div>

        <div v-if="selectedEmployee" class="p-3 rounded-lg bg-brand-primary/5 border border-brand-primary/10 text-[11px] space-y-1">
          <p class="font-bold flex items-center gap-2">
            <User class="size-3" /> Policy Check:
          </p>
          <p class="text-muted-foreground italic">
            This amount will be automatically deducted from {{ selectedEmployee.fullName }}'s next payslip.
          </p>
        </div>
      </div>

      <DialogFooter>
        <Button 
          variant="outline" 
          @click="$emit('update:open', false)"
          class="border-brand-primary/10"
        >
          Cancel
        </Button>
        <Button 
          @click="handleSubmit" 
          :disabled="loading || !form.employeeId || form.amount <= 0"
          class="bg-brand-primary hover:bg-brand-primary/90 text-white shadow-lg shadow-brand-primary/20 min-w-[120px]"
        >
          <Loader2 v-if="loading" class="size-4 animate-spin mr-2" />
          {{ loading ? 'Saving...' : 'Record Advance' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
