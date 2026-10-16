<script setup lang="ts">
import { CircleAlert, Receipt, PackagePlus } from 'lucide-vue-next'
import { onMounted, onUnmounted } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const props = defineProps<{
  open: boolean
  searchQuery: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'selectAdhoc': []
  'selectNewPending': []
  'cancel': []
}>()

function handleSelectAdhoc() {
  emit('selectAdhoc')
  emit('update:open', false)
}

function handleSelectNewPending() {
  emit('selectNewPending')
  emit('update:open', false)
}

function handleCancel() {
  emit('cancel')
  emit('update:open', false)
}

function handleKeydown(e: KeyboardEvent) {
  if (!props.open) return
  if (e.key === 'Escape') {
    e.preventDefault()
    handleCancel()
  }
  // Explicitly block Enter from triggering default action
  if (e.key === 'Enter') {
    e.preventDefault()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Dialog
    :open="open"
    @update:open="emit('update:open', $event)"
    :modal="true"
  >
    <DialogContent
      class="max-w-2xl"
      @pointer-down-outside.prevent
      @interact-outside.prevent
    >
      <DialogHeader class="flex flex-row items-start gap-3">
        <CircleAlert class="text-amber-500 mt-0.5 shrink-0" :size="24" />
        <div class="flex flex-col">
          <DialogTitle>Item Not Found in Inventory</DialogTitle>
          <DialogDescription>
            '{{ searchQuery }}' does not match any existing inventory item. How would you like to proceed?
          </DialogDescription>
        </div>
      </DialogHeader>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
        <!-- CARD A: One-Off Expense -->
        <div class="rounded-lg border border-amber-200 bg-amber-50 p-4 flex flex-col gap-3">
          <div class="flex items-center gap-2">
            <Receipt :size="20" class="text-amber-600" />
            <span class="font-semibold text-sm">One-Off Expense</span>
          </div>
          <Badge
            class="bg-amber-100 text-amber-700 text-xs rounded-full px-2 py-0.5 w-fit"
          >
            Ad-hoc
          </Badge>
          <p class="text-xs text-muted-foreground">
            Procure this item for this requisition only.
            No inventory record will be created. Cost posts
            directly to the job or project.
          </p>
          <Button
            variant="outline"
            class="w-full border-amber-400 text-amber-700 hover:bg-amber-100 mt-auto"
            @click="handleSelectAdhoc"
          >
            Use One-Off
          </Button>
        </div>

        <!-- CARD B: Register New Inventory Item -->
        <div class="rounded-lg border border-blue-200 bg-blue-50 p-4 flex flex-col gap-3">
          <div class="flex items-center gap-2">
            <PackagePlus :size="20" class="text-blue-600" />
            <span class="font-semibold text-sm">Register New Inventory Item</span>
          </div>
          <Badge
            class="bg-blue-100 text-blue-700 text-xs rounded-full px-2 py-0.5 w-fit"
          >
            Recommended
          </Badge>
          <p class="text-xs text-muted-foreground">
            Add this as a new inventory item. A record will
            be created in inventory when the GRN is confirmed.
            Use for items you will stock regularly.
          </p>
          <Button
            variant="default"
            class="w-full mt-auto"
            @click="handleSelectNewPending"
          >
            Register Item
          </Button>
        </div>
      </div>

      <div class="flex justify-center pt-2">
        <span 
          class="text-sm text-muted-foreground cursor-pointer hover:underline"
          @click="handleCancel"
        >
          ← Cancel — go back to search
        </span>
      </div>
    </DialogContent>
  </Dialog>
</template>