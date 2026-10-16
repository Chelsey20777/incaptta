<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useTasksStore } from '../store/tasksStore'
import type { TaskStatus, TaskPriority, ProjectTask } from '../store/tasksStore'
import { useSession } from '@/composables/useSession'
import { useAdminStore } from '@/features/admin/store/adminStore'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
    ClipboardList, Plus, Search, Loader2, Pencil, Trash2,
    CheckCircle2, Clock, Circle, Eye, Calendar, User, Flag
} from 'lucide-vue-next'

const store = useTasksStore()
const adminStore = useAdminStore()
const { tasks, loading } = storeToRefs(store)
const { user, claims, hasAnyRole } = useSession()

const isAdmin = computed(() => hasAnyRole(['ADMIN', 'SUPER_ADMIN', 'MANAGER']))
const currentUser = computed(() => ({
    uid: user.value?.uid || '',
    name: user.value?.displayName || user.value?.email || 'Unknown'
}))

onMounted(() => { store.fetchTasks(); adminStore.fetchAll() })
onUnmounted(() => store.cleanup())

// ── Filters ─────────────────────────────────────────────────────────────────
const searchQuery = ref('')
const statusFilter = ref<'all' | TaskStatus>('all')
const priorityFilter = ref<'all' | TaskPriority>('all')
const viewMode = ref<'board' | 'list'>('board')

const STATUSES: TaskStatus[] = ['Todo', 'In Progress', 'Review', 'Done']
const PRIORITIES: TaskPriority[] = ['Low', 'Medium', 'High', 'Urgent']

const filteredTasks = computed(() => {
    let list = [...tasks.value]
    if (searchQuery.value) {
        const q = searchQuery.value.toLowerCase()
        list = list.filter(t => t.title.toLowerCase().includes(q) || t.assignedTo?.toLowerCase().includes(q))
    }
    if (statusFilter.value !== 'all') list = list.filter(t => t.status === statusFilter.value)
    if (priorityFilter.value !== 'all') list = list.filter(t => t.priority === priorityFilter.value)
    return list
})

const tasksByStatus = computed(() => {
    const map: Record<TaskStatus, ProjectTask[]> = { 'Todo': [], 'In Progress': [], 'Review': [], 'Done': [] }
    filteredTasks.value.forEach(t => { if (map[t.status]) map[t.status].push(t) })
    return map
})

// ── Form Dialog ──────────────────────────────────────────────────────────────
const showDialog = ref(false)
const editingTask = ref<ProjectTask | null>(null)
const submitting = ref(false)

const blankForm = () => ({
    title: '', description: '', status: 'Todo' as TaskStatus,
    priority: 'Medium' as TaskPriority, assignedTo: '', assignedToUid: '',
    dueDate: '', tags: [] as string[]
})
const form = ref(blankForm())

function openCreate() { editingTask.value = null; form.value = blankForm(); showDialog.value = true }
function openEdit(task: ProjectTask) {
    editingTask.value = task
    form.value = { title: task.title, description: task.description, status: task.status,
        priority: task.priority, assignedTo: task.assignedTo, assignedToUid: task.assignedToUid,
        dueDate: task.dueDate, tags: [...(task.tags || [])] }
    showDialog.value = true
}

async function handleSave() {
    if (!form.value.title.trim()) { toast.error('Title is required'); return }
    submitting.value = true
    try {
        if (editingTask.value) {
            await store.updateTask(editingTask.value.id, { ...form.value })
            toast.success('Task updated')
        } else {
            await store.createTask({ ...form.value, createdBy: currentUser.value })
            toast.success('Task created')
        }
        showDialog.value = false
    } catch (err: any) { toast.error('Failed', { description: err.message })
    } finally { submitting.value = false }
}

async function handleDelete(id: string) {
    if (!confirm('Delete this task?')) return
    try { await store.deleteTask(id); toast.success('Task deleted') }
    catch (err: any) { toast.error('Failed', { description: err.message }) }
}

async function quickStatus(task: ProjectTask, status: TaskStatus) {
    try { await store.updateTask(task.id, { status }) }
    catch (err: any) { toast.error('Failed', { description: err.message }) }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function priorityColor(p: TaskPriority) {
    return { Low: 'bg-blue-500/10 text-blue-600 border-blue-200', Medium: 'bg-amber-500/10 text-amber-600 border-amber-200',
             High: 'bg-orange-500/10 text-orange-600 border-orange-200', Urgent: 'bg-red-500/10 text-red-600 border-red-200' }[p] || ''
}
function statusColor(s: TaskStatus) {
    return { Todo: 'bg-muted text-muted-foreground', 'In Progress': 'bg-blue-500/10 text-blue-600',
             Review: 'bg-purple-500/10 text-purple-600', Done: 'bg-green-500/10 text-green-600' }[s] || ''
}
function columnColor(s: TaskStatus) {
    return { Todo: 'border-t-muted-foreground/30', 'In Progress': 'border-t-blue-500', Review: 'border-t-purple-500', Done: 'border-t-green-500' }[s] || ''
}
function columnIcon(s: TaskStatus) {
    return { Todo: Circle, 'In Progress': Clock, Review: Eye, Done: CheckCircle2 }[s] || Circle
}
function formatDate(d: string) {
    if (!d) return ''
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
function isOverdue(d: string) { return d && new Date(d) < new Date() }
</script>

<template>
    <div class="min-h-screen bg-background p-4 md:p-6 space-y-6">

        <!-- Header -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div class="flex items-center gap-3">
                <div class="p-2 rounded-lg bg-brand-primary/10">
                    <ClipboardList class="size-6 text-brand-primary" />
                </div>
                <div>
                    <h1 class="text-2xl font-bold">Tasks</h1>
                    <p class="text-sm text-muted-foreground">Track and manage project tasks</p>
                </div>
            </div>
            <div class="flex items-center gap-2">
                <div class="flex border rounded-lg overflow-hidden">
                    <Button :variant="viewMode === 'board' ? 'default' : 'ghost'" size="sm" class="rounded-none h-9"
                        @click="viewMode = 'board'">Board</Button>
                    <Button :variant="viewMode === 'list' ? 'default' : 'ghost'" size="sm" class="rounded-none h-9"
                        @click="viewMode = 'list'">List</Button>
                </div>
                <Button @click="openCreate" class="gap-2"><Plus class="size-4" /> New Task</Button>
            </div>
        </div>

        <!-- Filters -->
        <div class="flex flex-wrap gap-3 items-center">
            <div class="relative flex-1 min-w-[200px]">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input v-model="searchQuery" placeholder="Search tasks..." class="pl-9 h-9" />
            </div>
            <Select v-model="statusFilter">
                <SelectTrigger class="w-36 h-9"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem v-for="s in STATUSES" :key="s" :value="s">{{ s }}</SelectItem>
                </SelectContent>
            </Select>
            <Select v-model="priorityFilter">
                <SelectTrigger class="w-36 h-9"><SelectValue placeholder="Priority" /></SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Priorities</SelectItem>
                    <SelectItem v-for="p in PRIORITIES" :key="p" :value="p">{{ p }}</SelectItem>
                </SelectContent>
            </Select>
        </div>

        <div v-if="loading" class="flex justify-center py-16">
            <Loader2 class="size-8 animate-spin text-muted-foreground" />
        </div>

        <!-- Board View -->
        <div v-else-if="viewMode === 'board'" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div v-for="status in STATUSES" :key="status"
                class="rounded-xl border border-t-4 bg-muted/20 flex flex-col gap-2 p-3 min-h-[200px]"
                :class="columnColor(status)">
                <div class="flex items-center justify-between mb-1">
                    <div class="flex items-center gap-2">
                        <component :is="columnIcon(status)" class="size-4"
                            :class="{ 'text-muted-foreground': status === 'Todo', 'text-blue-500': status === 'In Progress', 'text-purple-500': status === 'Review', 'text-green-500': status === 'Done' }" />
                        <span class="text-sm font-bold">{{ status }}</span>
                    </div>
                    <Badge variant="secondary" class="text-[10px] h-5">{{ tasksByStatus[status].length }}</Badge>
                </div>

                <div v-if="tasksByStatus[status].length === 0"
                    class="flex-1 flex items-center justify-center text-[12px] text-muted-foreground italic py-6">
                    No tasks
                </div>

                <Card v-for="task in tasksByStatus[status]" :key="task.id"
                    class="border-border/50 shadow-sm hover:shadow-md transition-all cursor-pointer bg-card"
                    @click="openEdit(task)">
                    <CardContent class="p-3 space-y-2">
                        <div class="flex items-start justify-between gap-2">
                            <p class="text-[13px] font-semibold leading-tight">{{ task.title }}</p>
                            <Badge class="text-[9px] px-1.5 py-0 border shrink-0" :class="priorityColor(task.priority)">
                                {{ task.priority }}
                            </Badge>
                        </div>
                        <p v-if="task.description" class="text-[11px] text-muted-foreground line-clamp-2">{{ task.description }}</p>
                        <div class="flex items-center justify-between pt-1">
                            <div v-if="task.assignedTo" class="flex items-center gap-1 text-[11px] text-muted-foreground">
                                <User class="size-3" /><span class="truncate max-w-[90px]">{{ task.assignedTo }}</span>
                            </div>
                            <div v-if="task.dueDate" class="flex items-center gap-1 text-[11px]"
                                :class="isOverdue(task.dueDate) && task.status !== 'Done' ? 'text-red-500 font-bold' : 'text-muted-foreground'">
                                <Calendar class="size-3" />{{ formatDate(task.dueDate) }}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>

        <!-- List View -->
        <div v-else class="space-y-2">
            <div v-if="filteredTasks.length === 0" class="text-center py-16 text-muted-foreground">
                <ClipboardList class="size-12 mx-auto mb-3 opacity-20" />
                <p class="font-medium">No tasks found</p>
            </div>
            <Card v-for="task in filteredTasks" :key="task.id"
                class="border-border/60 hover:shadow-md transition-all cursor-pointer" @click="openEdit(task)">
                <CardContent class="p-4 flex items-center gap-4">
                    <div class="flex-1 min-w-0 space-y-1">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="font-semibold text-sm">{{ task.title }}</span>
                            <Badge class="text-[10px] px-1.5 py-0" :class="statusColor(task.status)">{{ task.status }}</Badge>
                            <Badge class="text-[10px] px-1.5 py-0 border" :class="priorityColor(task.priority)">{{ task.priority }}</Badge>
                        </div>
                        <p v-if="task.description" class="text-[12px] text-muted-foreground line-clamp-1">{{ task.description }}</p>
                        <div class="flex items-center gap-4 text-[11px] text-muted-foreground">
                            <span v-if="task.assignedTo" class="flex items-center gap-1"><User class="size-3" />{{ task.assignedTo }}</span>
                            <span v-if="task.dueDate" class="flex items-center gap-1"
                                :class="isOverdue(task.dueDate) && task.status !== 'Done' ? 'text-red-500 font-bold' : ''">
                                <Calendar class="size-3" />{{ formatDate(task.dueDate) }}
                            </span>
                        </div>
                    </div>
                    <div class="flex items-center gap-1 shrink-0">
                        <Button v-if="isAdmin" variant="ghost" size="icon" class="h-7 w-7 text-destructive"
                            @click.stop="handleDelete(task.id)"><Trash2 class="size-3.5" /></Button>
                    </div>
                </CardContent>
            </Card>
        </div>

        <!-- Task Form Dialog -->
        <Dialog v-model:open="showDialog">
            <DialogContent class="max-w-lg">
                <DialogHeader>
                    <DialogTitle>{{ editingTask ? 'Edit Task' : 'New Task' }}</DialogTitle>
                </DialogHeader>
                <div class="space-y-4 py-2">
                    <div class="space-y-1.5">
                        <Label>Title <span class="text-destructive">*</span></Label>
                        <Input v-model="form.title" placeholder="Task title..." />
                    </div>
                    <div class="space-y-1.5">
                        <Label>Description</Label>
                        <Textarea v-model="form.description" rows="3" placeholder="What needs to be done..." />
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div class="space-y-1.5">
                            <Label>Status</Label>
                            <Select v-model="form.status">
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem v-for="s in STATUSES" :key="s" :value="s">{{ s }}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div class="space-y-1.5">
                            <Label>Priority</Label>
                            <Select v-model="form.priority">
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem v-for="p in PRIORITIES" :key="p" :value="p">{{ p }}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div class="space-y-1.5">
                            <Label>Assigned To</Label>
                            <Input v-model="form.assignedTo" placeholder="Name..." />
                        </div>
                        <div class="space-y-1.5">
                            <Label>Due Date</Label>
                            <Input v-model="form.dueDate" type="date" />
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" @click="showDialog = false">Cancel</Button>
                    <Button @click="handleSave" :disabled="submitting" class="gap-2">
                        <Loader2 v-if="submitting" class="size-4 animate-spin" />
                        {{ editingTask ? 'Save Changes' : 'Create Task' }}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

    </div>
</template>
