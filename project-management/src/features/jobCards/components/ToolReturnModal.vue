<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Download, Loader2, Wrench } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { useJobCardsStore } from '../store/jobCardsStore'
import { generateToolChecklistPdf } from '../utils/generateToolChecklistPdf'
import { toast } from 'vue-sonner'
import { useReferenceResolver } from '@/composables/useReferenceResolver'

import { filterReturnableTools } from '../utils/toolFilters'

const props = defineProps<{ job: any, open: boolean, isManager: boolean, isAccountant: boolean }>()
const emit = defineEmits(['update:open', 'verified'])
const store = useJobCardsStore()
const { resolveJobCategoryName } = useReferenceResolver()
const localChecklist = ref<any[]>([])
const saving = ref(false)

const initChecklist = () => {
  if (localChecklist.value.length > 0) return
  const toolItems = filterReturnableTools(props.job.requisitionSections, resolveJobCategoryName)
  localChecklist.value = toolItems.map((i: any) => ({ 
    id: i.id, 
    itemName: i.itemName, 
    qty: i.qtyRequired || i.qty, 
    returned: false, 
    verifiedBy: null, 
    verifiedAt: null 
  }))
}

onMounted(() => {
  if (props.job.toolReturnChecklist) localChecklist.value = JSON.parse(JSON.stringify(props.job.toolReturnChecklist))
  else {
    initChecklist()
  }
})

const canVerify = computed(() => props.isManager || props.isAccountant)
const toggleReturn = (idx: number) => {
  if (!canVerify.value) return
  const i = localChecklist.value[idx]
  i.returned = !i.returned
  i.verifiedBy = i.returned ? 'Manager' : null
  i.verifiedAt = i.returned ? new Date().toISOString() : null
}
const handleSave = async () => {
  saving.value = true
  try {
    await store.updateToolReturnChecklist(props.job.id, localChecklist.value)
    toast.success('Checklist updated')
    emit('verified', localChecklist.value)
    emit('update:open', false)
  } catch (err: any) { toast.error('Failed to save') }
  finally { saving.value = false }
}
</script>
<template>
  <Dialog :open="open" @update:open="v => emit('update:open', v)">
    <DialogContent class="max-w-2xl">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2"><Wrench class="size-5 text-brand-primary" /> Tool Return Checklist</DialogTitle>
        <DialogDescription>Verify all tools are returned before closing.</DialogDescription>
      </DialogHeader>
      <ScrollArea class="max-h-[400px] pr-4">
        <div class="space-y-2 py-4">
          <div v-for="(item, idx) in localChecklist" :key="item.id" class="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
            <div class="flex items-center gap-3">
              <Checkbox :checked="item.returned" :disabled="!canVerify" @update:checked="() => toggleReturn(idx)" />
              <div><p class="text-sm font-medium">{{ item.itemName }}</p><p class="text-xs text-muted-foreground">Qty: {{ item.qty }}</p></div>
            </div>
            <Badge variant="outline" :class="item.returned ? 'bg-green-500/10 text-green-600 border-green-200' : 'bg-amber-500/10 text-amber-600 border-amber-200'">{{ item.returned ? 'Returned' : 'Outstanding' }}</Badge>
          </div>
        </div>
      </ScrollArea>
      <DialogFooter class="gap-2">
        <Button variant="outline" size="sm" @click="generateToolChecklistPdf(job, localChecklist)"><Download class="mr-2 size-4" /> PDF</Button>
        <Button :disabled="saving || !canVerify" size="sm" @click="handleSave"><Loader2 v-if="saving" class="mr-2 size-4 animate-spin" /> Save</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
