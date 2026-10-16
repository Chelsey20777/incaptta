<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useHrStore } from '../store/hrStore'
import { useSession } from '@/composables/useSession'
import { storeToRefs } from 'pinia'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
    PlusCircle, ClipboardList, Eye, Pencil, Trash2,
    CheckCircle2, MessageSquare, Send
} from 'lucide-vue-next'
import HRNav from '../components/HRNav.vue'
import type { Task } from '../types'

const hrStore = useHrStore()
const { user, hasAnyRole } = useSession()
const { employees, tasks, kpis, loading } = storeToRefs(hrStore)

onMounted(() => { hrStore.fetchEmployees(); hrStore.fetchTasks(); hrStore.fetchKpis() })
onUnmounted(() => hrStore.cleanup())

const canManage = computed(() => hasAnyRole(['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'ACCOUNTANT', 'TECHNICAL']))
const myUserId = computed(() => user.value?.uid || '')

// Tabs: all (admin) or my tasks (employee)
const viewMode = ref<'board' | 'mine' | 'assigned'>('board')

const allTasks = computed(() => tasks.value)

const columns: { status: Task['status']; label: string; color: string }[] = [
    { status: 'Pending', label: 'Pending', color: 'border-yellow-500/30 bg-yellow-500/5' },
    { status: 'In Progress', label: 'In Progress', color: 'border-blue-500/30 bg-blue-500/5' },
    { status: 'Completed', label: 'Completed', color: 'border-emerald-500/30 bg-emerald-500/5' },
    { status: 'Overdue', label: 'Overdue', color: 'border-red-500/30 bg-red-500/5' },
]

function columnTasks(status: string) {
    let list = viewMode.value === 'mine'
        ? allTasks.value.filter(t => t.assignedTo === currentEmployeeId.value)
        : viewMode.value === 'assigned'
            ? allTasks.value.filter(t => t.assignedBy === myUserId.value)
            : allTasks.value
    return list.filter(t => t.status === status)
}

// Current employee (for self-service)
const currentEmployeeId = computed(() =>
    employees.value.find(e => e.email === user.value?.email)?.id || ''
)

// Dialogs
const showDialog = ref(false)
const showDetailDialog = ref(false)
const editingId = ref<string | null>(null)
const selectedTask = ref<Task | null>(null)
const saving = ref(false)
const newNote = ref('')

const blank = (): any => ({
    title: '', description: '', assignedTo: '', department: '',
    priority: 'Medium' as Task['priority'], dueDate: '',
    status: 'Pending' as Task['status'], kpiCategory: ''
})
const form = ref(blank())

function openAdd() {
    editingId.value = null
    form.value = blank()
    showDialog.value = true
}

function openEdit(task: Task) {
    editingId.value = task.id!
    form.value = { ...task }
    showDialog.value = true
}

function openDetail(task: Task) {
    selectedTask.value = task
    newNote.value = ''
    showDetailDialog.value = true
}

async function save() {
    if (!form.value.title || !form.value.assignedTo) return
    saving.value = true
    try {
        const emp = employees.value.find(e => e.id === form.value.assignedTo)
        await hrStore.saveTask({
            ...form.value,
            assignedToName: emp?.fullName || '',
            assignedBy: myUserId.value,
            assignedByName: user.value?.displayName || user.value?.email || '',
            notes: form.value.notes || []
        }, editingId.value || undefined)
        showDialog.value = false
    } finally {
        saving.value = false
    }
}

async function updateProgress(task: Task, pct: number) {
    const status = pct >= 100 ? 'Completed' : pct > 0 ? 'In Progress' : 'Pending'
    await hrStore.updateTaskProgress(task.id!, pct, status)
}

async function verify(task: Task) {
    await hrStore.verifyTask(task.id!, myUserId.value, user.value?.displayName || '')
}

async function sendNote() {
    if (!selectedTask.value || !newNote.value.trim()) return
    await hrStore.addTaskNote(
        selectedTask.value.id!,
        myUserId.value,
        user.value?.displayName || user.value?.email || '',
        newNote.value
    )
    newNote.value = ''
    // refresh selectedTask from store
    selectedTask.value = tasks.value.find(t => t.id === selectedTask.value?.id) || selectedTask.value
}

function priorityColor(p: string) {
    return {
        Low: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
        Medium: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
        High: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
        Critical: 'bg-red-500/10 text-red-600 border-red-500/20'
    }[p] || ''
}

function statusHeaderColor(s: string) {
    return {
        Pending: 'text-yellow-600',
        'In Progress': 'text-blue-600',
        Completed: 'text-emerald-600',
        Overdue: 'text-red-600'
    }[s] || ''
}

function formatNote(ts: any) {
    if (!ts) return ''
    const d = ts.toDate ? ts.toDate() : new Date(ts)
    return d.toLocaleString()
}
</script>

<template>
    <div class="space-y-5">
        <HRNav />
        <div class="flex items-center justify-between gap-4 flex-wrap">
            <div>
                <h1 class="text-2xl font-bold tracking-tight flex items-center gap-2">
                    <ClipboardList class="size-6" /> Task Management
                </h1>
                <p class="text-muted-foreground text-sm mt-1">{{ allTasks.length }} tasks total · {{ allTasks.filter(t => t.status === 'Overdue').length }} overdue</p>
            </div>
            <div class="flex gap-2 flex-wrap">
                <div class="flex gap-1 p-1 bg-muted rounded-lg">
                    <Button :variant="viewMode === 'board' ? 'default' : 'ghost'" size="sm" class="h-7 text-xs"
                        @click="viewMode = 'board'">All Tasks</Button>
                    <Button :variant="viewMode === 'mine' ? 'default' : 'ghost'" size="sm" class="h-7 text-xs"
                        @click="viewMode = 'mine'">Assigned to Me</Button>
                    <Button v-if="canManage" :variant="viewMode === 'assigned' ? 'default' : 'ghost'" size="sm" class="h-7 text-xs"
                        @click="viewMode = 'assigned'">I Assigned</Button>
                </div>
                <Button v-if="canManage" @click="openAdd" class="gap-2 h-9">
                    <PlusCircle class="size-4" /> New Task
                </Button>
            </div>
        </div>

        <!-- Kanban Board -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div v-for="col in columns" :key="col.status"
                class="border rounded-xl p-3 space-y-3 min-h-[300px]" :class="col.color">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-xs font-bold uppercase tracking-wider" :class="statusHeaderColor(col.status)">
                        {{ col.label }}
                    </span>
                    <span class="text-xs font-semibold bg-background border rounded-full px-2 py-0.5">
                        {{ columnTasks(col.status).length }}
                    </span>
                </div>

                <div v-if="columnTasks(col.status).length === 0"
                    class="text-center py-8 text-xs text-muted-foreground/60 italic">
                    No tasks
                </div>

                <div v-for="task in columnTasks(col.status)" :key="task.id"
                    class="bg-background border rounded-lg p-3 space-y-2 cursor-pointer hover:border-primary/50 transition-colors group shadow-sm"
                    @click="openDetail(task)">
                    <div class="flex items-start justify-between gap-1">
                        <p class="text-sm font-semibold leading-snug flex-1">{{ task.title }}</p>
                        <span class="text-[10px] px-1.5 py-0.5 rounded border shrink-0" :class="priorityColor(task.priority)">
                            {{ task.priority }}
                        </span>
                    </div>
                    <p class="text-xs text-muted-foreground line-clamp-2">{{ task.description }}</p>
                    <div class="space-y-1">
                        <div class="flex justify-between text-[10px] text-muted-foreground">
                            <span>{{ task.assignedToName }}</span>
                            <span>{{ task.completionPercent }}%</span>
                        </div>
                        <div class="w-full bg-muted rounded-full h-1">
                            <div class="h-1 rounded-full bg-primary transition-all"
                                :style="{ width: task.completionPercent + '%' }" />
                        </div>
                    </div>
                    <div class="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>Due {{ task.dueDate }}</span>
                        <span v-if="task.notes?.length">
                            <MessageSquare class="size-3 inline mr-0.5" />{{ task.notes.length }}
                        </span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Create/Edit Dialog -->
        <Dialog v-model:open="showDialog">
            <DialogContent class="w-[95vw] max-w-none max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{{ editingId ? 'Edit Task' : 'New Task' }}</DialogTitle>
                </DialogHeader>
                <div class="space-y-3 py-2">
                    <div class="space-y-1">
                        <label class="text-xs font-medium">Title *</label>
                        <Input v-model="form.title" placeholder="Task title" />
                    </div>
                    <div class="space-y-1">
                        <label class="text-xs font-medium">Description</label>
                        <Textarea v-model="form.description" placeholder="Describe the task…" class="min-h-[80px]" />
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div class="space-y-1">
                            <label class="text-xs font-medium">Assign To *</label>
                            <Select v-model="form.assignedTo">
                                <SelectTrigger><SelectValue placeholder="Employee" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem v-for="e in employees" :key="e.id" :value="e.id!">{{ e.fullName }}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div class="space-y-1">
                            <label class="text-xs font-medium">Department</label>
                            <Input v-model="form.department" placeholder="Dept" />
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div class="space-y-1">
                            <label class="text-xs font-medium">Priority</label>
                            <Select v-model="form.priority">
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Low">Low</SelectItem>
                                    <SelectItem value="Medium">Medium</SelectItem>
                                    <SelectItem value="High">High</SelectItem>
                                    <SelectItem value="Critical">Critical</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div class="space-y-1">
                            <label class="text-xs font-medium">Due Date</label>
                            <Input v-model="form.dueDate" type="date" />
                        </div>
                    </div>
                    <div class="space-y-1">
                        <label class="text-xs font-medium">KPI Category (optional)</label>
                        <Select v-model="form.kpiCategory">
                            <SelectTrigger><SelectValue placeholder="Link to KPI" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="">— None —</SelectItem>
                                <SelectItem v-for="k in kpis" :key="k.id" :value="k.id!">{{ k.name }}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" @click="showDialog = false">Cancel</Button>
                    <Button @click="save" :disabled="saving || !form.title || !form.assignedTo">
                        {{ saving ? 'Saving…' : (editingId ? 'Save' : 'Create Task') }}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <!-- Task Detail Dialog -->
        <Dialog v-model:open="showDetailDialog">
            <DialogContent class="w-[95vw] max-w-none max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle class="text-base">{{ selectedTask?.title }}</DialogTitle>
                </DialogHeader>
                <div class="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
                    <div class="grid grid-cols-2 gap-2 text-xs">
                        <div>
                            <p class="text-muted-foreground">Assigned To</p>
                            <p class="font-medium">{{ selectedTask?.assignedToName }}</p>
                        </div>
                        <div>
                            <p class="text-muted-foreground">Due Date</p>
                            <p class="font-medium">{{ selectedTask?.dueDate }}</p>
                        </div>
                        <div>
                            <p class="text-muted-foreground">Priority</p>
                            <span class="px-1.5 py-0.5 rounded border text-[10px]" :class="priorityColor(selectedTask?.priority || '')">
                                {{ selectedTask?.priority }}
                            </span>
                        </div>
                        <div>
                            <p class="text-muted-foreground">Status</p>
                            <p class="font-medium">{{ selectedTask?.status }}</p>
                        </div>
                    </div>

                    <p class="text-sm text-muted-foreground">{{ selectedTask?.description }}</p>

                    <!-- Progress Update (assignee or admin) -->
                    <div v-if="selectedTask?.status !== 'Completed'" class="space-y-2">
                        <label class="text-xs font-medium">Update Progress</label>
                        <div class="flex items-center gap-3">
                            <input type="range" min="0" max="100" step="5"
                                :value="selectedTask?.completionPercent || 0"
                                @change="(e: any) => selectedTask && updateProgress(selectedTask, +e.target.value)"
                                class="flex-1 accent-primary" />
                            <span class="text-sm font-bold w-10 text-right">{{ selectedTask?.completionPercent }}%</span>
                        </div>
                    </div>

                    <!-- Verify button for managers -->
                    <div v-if="canManage && selectedTask?.status === 'Completed' && !selectedTask?.verifiedBy">
                        <Button class="w-full gap-2 bg-emerald-600 hover:bg-emerald-700" @click="verify(selectedTask!)">
                            <CheckCircle2 class="size-4" /> Verify & Approve Task
                        </Button>
                    </div>

                    <!-- Edit button -->
                    <div v-if="canManage" class="flex gap-2">
                        <Button variant="outline" size="sm" class="gap-1 text-xs"
                            @click="showDetailDialog = false; openEdit(selectedTask!)">
                            <Pencil class="size-3" /> Edit
                        </Button>
                        <Button variant="outline" size="sm" class="gap-1 text-xs hover:text-destructive"
                            @click="hrStore.deleteTask(selectedTask!.id!); showDetailDialog = false">
                            <Trash2 class="size-3" /> Delete
                        </Button>
                    </div>

                    <!-- Notes/Comments -->
                    <div class="border-t pt-3 space-y-3">
                        <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Comments ({{ selectedTask?.notes?.length || 0 }})
                        </p>
                        <div v-if="!selectedTask?.notes?.length" class="text-xs text-muted-foreground italic">No comments yet</div>
                        <div v-for="note in selectedTask?.notes" :key="note.id"
                            class="flex gap-2 text-xs">
                            <div class="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold shrink-0">
                                {{ note.userName?.charAt(0) }}
                            </div>
                            <div class="flex-1 min-w-0">
                                <p class="font-semibold">{{ note.userName }}
                                    <span class="text-muted-foreground font-normal ml-1">{{ formatNote(note.createdAt) }}</span>
                                </p>
                                <p class="text-muted-foreground mt-0.5">{{ note.text }}</p>
                            </div>
                        </div>
                        <div class="flex gap-2">
                            <Input v-model="newNote" placeholder="Add a comment…" class="flex-1 h-8 text-xs"
                                @keydown.enter.prevent="sendNote" />
                            <Button size="icon" class="h-8 w-8 shrink-0" @click="sendNote" :disabled="!newNote.trim()">
                                <Send class="size-3.5" />
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    </div>
</template>
