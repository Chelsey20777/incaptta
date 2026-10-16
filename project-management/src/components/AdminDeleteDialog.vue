<script setup lang="ts">
import { ref, computed } from 'vue'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, Trash2 } from 'lucide-vue-next'

const props = defineProps<{
    open: boolean
    title: string
    description: string
    targetId: string // The ID the user must type to confirm
    loading?: boolean
}>()

const emit = defineEmits(['update:open', 'confirm'])

const confirmValue = ref('')
const isMatch = computed(() => confirmValue.value.trim() === props.targetId)

function handleConfirm() {
    if (isMatch.value) {
        emit('confirm')
        confirmValue.value = ''
    }
}

function handleClose() {
    emit('update:open', false)
    confirmValue.value = ''
}
</script>

<template>
    <Dialog :open="open" @update:open="emit('update:open', $event)">
        <DialogContent class="sm:max-w-[425px]">
            <DialogHeader>
                <DialogTitle class="flex items-center gap-2 text-destructive">
                    <AlertCircle class="size-5" />
                    {{ title }}
                </DialogTitle>
                <DialogDescription class="pt-2">
                    {{ description }}
                    <p class="mt-2 font-bold text-foreground">
                        This action cannot be undone. Are you absolutely sure?
                    </p>
                </DialogDescription>
            </DialogHeader>

            <div class="grid gap-4 py-4">
                <div class="space-y-2 text-sm">
                    <Label for="confirm-id" class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        To confirm, type <span class="text-foreground font-mono font-bold select-all">{{ targetId }}</span> below:
                    </Label>
                    <Input
                        id="confirm-id"
                        v-model="confirmValue"
                        placeholder="Enter ID here..."
                        class="h-9 font-mono"
                        @keyup.enter="handleConfirm"
                    />
                </div>
            </div>

            <DialogFooter>
                <Button variant="outline" @click="handleClose" :disabled="loading">
                    Cancel
                </Button>
                <Button
                    variant="destructive"
                    :disabled="!isMatch || loading"
                    class="gap-2"
                    @click="handleConfirm"
                >
                    <Trash2 v-if="!loading" class="size-4" />
                    <span v-else class="size-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Delete Permanently
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>
