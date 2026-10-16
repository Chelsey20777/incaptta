<script setup lang="ts">
import { computed, ref } from 'vue'
import { useHrStore } from '../store/hrStore'
import { useSession } from '@/composables/useSession'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Trash2, DollarSign, CheckCircle, Info, Loader2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { Badge } from '@/components/ui/badge'

const props = defineProps<{
  open: boolean
}>()

defineEmits(['update:open'])

const hrStore = useHrStore()
const { hasAnyRole } = useSession()
const approvingId = ref<string | null>(null)

const canApprove = computed(() => hasAnyRole(['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'DIRECTOR']))

const allActive = computed(() => 
  hrStore.salaryAdvances.filter(a => a.status !== 'Processed')
)

const approvedTotal = computed(() => 
  allActive.value
    .filter(a => a.status === 'Unprocessed')
    .reduce((s, a) => s + a.amount, 0)
)

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

async function handleApprove(id: string) {
  approvingId.value = id
  try {
    await hrStore.approveSalaryAdvance(id)
    toast.success('Salary advance approved and posted to ledger')
  } catch (err: any) {
    toast.error('Approval failed', { description: err.message })
  } finally {
    approvingId.value = null
  }
}

async function handleDelete(id: string) {
  if (!confirm('Are you sure you want to delete this salary advance? This will also remove the linked ledger entry if already approved.')) return
  
  try {
    await hrStore.deleteSalaryAdvance(id)
    toast.success('Salary advance deleted successfully')
  } catch (err: any) {
    toast.error('Failed to delete advance', { description: err.message })
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="sm:max-w-[800px] border-brand-primary/10 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
      <DialogHeader class="px-6 pt-6">
        <DialogTitle class="flex items-center gap-2 text-xl font-black">
          <DollarSign class="size-5 text-brand-primary" />
          Salary Advances Management
        </DialogTitle>
        <p class="text-xs text-muted-foreground mt-1">
          Advances must be approved by a manager before they affect the ledger and can be recovered in payroll.
        </p>
      </DialogHeader>

      <div class="flex-1 overflow-y-auto px-6 py-4">
        <div v-if="allActive.length === 0" class="flex flex-col items-center justify-center py-12 text-center">
          <div class="bg-muted/30 p-4 rounded-full mb-4">
            <Info class="size-8 text-muted-foreground/50" />
          </div>
          <p class="text-sm font-medium text-muted-foreground">No active salary advances found.</p>
        </div>

        <div v-else class="rounded-lg border border-border/40 overflow-hidden bg-muted/5">
          <table class="w-full text-sm">
            <thead class="bg-muted/40 border-b border-border/40">
              <tr>
                <th class="text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Employee</th>
                <th class="text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Date</th>
                <th class="text-center px-4 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Status</th>
                <th class="text-right px-4 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Amount</th>
                <th class="text-right px-4 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border/40">
              <tr v-for="adv in allActive" :key="adv.id" class="hover:bg-muted/20 transition-colors">
                <td class="px-4 py-3">
                  <div class="flex flex-col">
                    <span class="font-bold text-foreground">{{ adv.employeeName }}</span>
                    <span class="text-[10px] text-muted-foreground italic truncate max-w-[200px]" :title="adv.reason">
                      {{ adv.reason || 'No reason provided' }}
                    </span>
                  </div>
                </td>
                <td class="px-4 py-3 text-muted-foreground font-mono text-xs">
                  {{ adv.date }}
                </td>
                <td class="px-4 py-3 text-center">
                  <Badge 
                    v-if="adv.status === 'Pending Approval'"
                    variant="outline" 
                    class="bg-yellow-500/10 text-yellow-600 border-yellow-500/20 text-[9px] uppercase font-bold"
                  >
                    Pending Approval
                  </Badge>
                  <Badge 
                    v-else
                    variant="outline" 
                    class="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[9px] uppercase font-bold"
                  >
                    Approved
                  </Badge>
                </td>
                <td class="px-4 py-3 text-right font-black text-brand-primary font-mono">
                  ${{ fmt(adv.amount) }}
                </td>
                <td class="px-4 py-3 text-right">
                  <div class="flex justify-end gap-1">
                    <Button 
                      v-if="adv.status === 'Pending Approval' && canApprove"
                      variant="ghost" 
                      size="icon" 
                      class="h-8 w-8 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700"
                      title="Approve Advance"
                      @click="handleApprove(adv.id!)"
                      :disabled="approvingId === adv.id"
                    >
                      <Loader2 v-if="approvingId === adv.id" class="size-4 animate-spin" />
                      <CheckCircle v-else class="size-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      class="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      @click="handleDelete(adv.id!)"
                    >
                      <Trash2 class="size-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="px-6 pb-6 pt-3 border-t border-border/40 bg-muted/5 flex items-center justify-between">
        <div class="space-y-1">
          <p class="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Recovery Summary</p>
          <p class="text-[9px] text-muted-foreground italic">Only approved advances are recovered in payroll.</p>
        </div>
        <div class="text-right">
          <div class="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Total Approved & Pending Recovery
          </div>
          <div class="text-xl font-black text-brand-primary font-mono">
            ${{ fmt(approvedTotal) }}
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
