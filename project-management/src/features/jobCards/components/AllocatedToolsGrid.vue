<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAdminStore } from '@/features/admin/store/adminStore'
import { storeToRefs } from 'pinia'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Wrench, Plus, Trash2, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { useJobCardsStore } from '../store/jobCardsStore'

const props = defineProps<{
    modelValue: any[]
    jobId: string
    isEditing: boolean
}>()

const emit = defineEmits<{
    'update:modelValue': [value: any[]]
}>()

const adminStore = useAdminStore()
const jobStore = useJobCardsStore()
const { toolsRegistry } = storeToRefs(adminStore)

onMounted(() => {
    adminStore.fetchAll()
})

const selectedToolId = ref('')

const availableTools = computed(() => {
    const allocatedToolIds = (props.modelValue || []).map(t => t.toolId)
    return (toolsRegistry.value || []).filter(t => !allocatedToolIds.includes(t.id))
})

async function addTool() {
    if (!selectedToolId.value) return
    const tool = toolsRegistry.value.find(t => t.id === selectedToolId.value)
    if (!tool) return

    const newAllocation = {
        id: crypto.randomUUID(),
        toolId: tool.id,
        name: tool.name,
        serialNumber: tool.serialNumber || 'N/A',
        state: 'Allocated',
        allocatedAt: new Date().toISOString(),
        returnedAt: null
    }

    const updated = [...(props.modelValue || []), newAllocation]
    emit('update:modelValue', updated)

    if (!props.isEditing) {
        try {
            await jobStore.updateJobCardArray(props.jobId, 'allocatedTools', updated)
            toast.success(`${tool.name} allocated successfully`)
        } catch (err: any) {
            toast.error('Failed to allocate tool', { description: err.message })
        }
    }
    selectedToolId.value = ''
}

async function removeTool(id: string) {
    const updated = (props.modelValue || []).filter(t => t.id !== id)
    emit('update:modelValue', updated)

    if (!props.isEditing) {
        try {
            await jobStore.updateJobCardArray(props.jobId, 'allocatedTools', updated)
            toast.success('Tool allocation removed')
        } catch (err: any) {
            toast.error('Failed to remove allocation', { description: err.message })
        }
    }
}

async function updateToolState(id: string, newState: 'Allocated' | 'Returned' | 'Damaged') {
    const updated = (props.modelValue || []).map(t => {
        if (t.id === id) {
            return {
                ...t,
                state: newState,
                returnedAt: newState !== 'Allocated' ? new Date().toISOString() : null
            }
        }
        return t
    })

    emit('update:modelValue', updated)

    if (!props.isEditing) {
        try {
            await jobStore.updateJobCardArray(props.jobId, 'allocatedTools', updated)
            toast.success(`Tool marked as ${newState}`)
        } catch (err: any) {
            toast.error('Failed to update tool state', { description: err.message })
        }
    }
}
</script>

<template>
    <Card class="bg-card backdrop-blur-md border border-border shadow-lg overflow-hidden">
        <CardHeader class="flex flex-row items-center justify-between border-b border-border py-4">
            <div class="flex items-center gap-2">
                <Wrench class="size-5 text-primary" />
                <CardTitle class="text-lg font-bold">Allocated Tools Tracker</CardTitle>
            </div>
            
            <!-- Quick Add Tool Form (Allows fast allocation in both View & Edit Mode) -->
            <div class="flex items-center gap-2 max-w-sm">
                <Select v-model="selectedToolId">
                    <SelectTrigger class="w-[200px] h-8 text-xs">
                        <SelectValue placeholder="Select tool to allocate..." />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem v-for="tool in availableTools" :key="tool.id" :value="tool.id" class="text-xs">
                            {{ tool.name }} ({{ tool.serialNumber || 'No SN' }})
                        </SelectItem>
                        <SelectItem v-if="availableTools.length === 0" disabled value="none" class="text-xs">
                            No available tools
                        </SelectItem>
                    </SelectContent>
                </Select>
                <Button size="sm" class="h-8 px-3 gap-1 text-xs" :disabled="!selectedToolId" @click="addTool">
                    <Plus class="size-3.5" /> Allocate
                </Button>
            </div>
        </CardHeader>
        <CardContent class="p-0">
            <Table class="w-full">
                <TableHeader>
                    <TableRow class="bg-muted/10 border-b border-border">
                        <TableHead class="text-xs font-bold text-foreground py-3">Tool Name</TableHead>
                        <TableHead class="text-xs font-bold text-foreground py-3">Serial / Tag No.</TableHead>
                        <TableHead class="text-xs font-bold text-foreground py-3">Allocated At</TableHead>
                        <TableHead class="text-xs font-bold text-foreground py-3">Tracking State</TableHead>
                        <TableHead class="text-xs font-bold text-foreground py-3 text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    <TableRow v-for="tool in (modelValue || [])" :key="tool.id" class="border-b border-border hover:bg-muted/5">
                        <TableCell class="font-medium text-sm py-3.5">{{ tool.name }}</TableCell>
                        <TableCell class="text-sm py-3.5 text-muted-foreground">{{ tool.serialNumber }}</TableCell>
                        <TableCell class="text-xs py-3.5 text-muted-foreground">
                            {{ tool.allocatedAt ? new Date(tool.allocatedAt).toLocaleString() : 'N/A' }}
                        </TableCell>
                        <TableCell class="py-3.5">
                            <div class="flex items-center gap-1.5">
                                <!-- Interactive state switchers -->
                                <button @click="updateToolState(tool.id, 'Allocated')" 
                                        :class="tool.state === 'Allocated' || !tool.state ? 'bg-primary/20 text-primary border-primary' : 'bg-muted/40 text-muted-foreground hover:bg-muted'"
                                        class="text-[10px] font-bold px-2 py-0.5 rounded border transition-colors">
                                    Allocated
                                </button>
                                <button @click="updateToolState(tool.id, 'Returned')" 
                                        :class="tool.state === 'Returned' ? 'bg-green-500/20 text-green-500 border-green-500' : 'bg-muted/40 text-muted-foreground hover:bg-muted'"
                                        class="text-[10px] font-bold px-2 py-0.5 rounded border transition-colors flex items-center gap-1">
                                    <CheckCircle2 class="size-3" v-if="tool.state === 'Returned'" /> Returned
                                </button>
                                <button @click="updateToolState(tool.id, 'Damaged')" 
                                        :class="tool.state === 'Damaged' ? 'bg-destructive/20 text-destructive border-destructive' : 'bg-muted/40 text-muted-foreground hover:bg-muted'"
                                        class="text-[10px] font-bold px-2 py-0.5 rounded border transition-colors flex items-center gap-1">
                                    <AlertTriangle class="size-3" v-if="tool.state === 'Damaged'" /> Damaged
                                </button>
                            </div>
                        </TableCell>
                        <TableCell class="py-3.5 text-right">
                            <Button variant="ghost" size="icon" class="text-destructive h-8 w-8 hover:bg-destructive/10" @click="removeTool(tool.id)">
                                <Trash2 class="size-4" />
                            </Button>
                        </TableCell>
                    </TableRow>
                    <TableRow v-if="(!modelValue || modelValue.length === 0)">
                        <TableCell colspan="5" class="h-24 text-center text-muted-foreground italic text-xs">
                            No tools currently allocated to this job card. Use the quick-add selector above.
                        </TableCell>
                    </TableRow>
                </TableBody>
            </Table>
        </CardContent>
    </Card>
</template>
