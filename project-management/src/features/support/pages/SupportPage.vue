<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useSupportStore } from '../store/supportStore'
import type { TicketStatus, TicketPriority, TicketCategory, SupportTicket } from '../store/supportStore'
import { useSession } from '@/composables/useSession'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog'
import {
    LifeBuoy, Plus, Search, MessageSquare, Clock, CheckCircle2,
    AlertCircle, Loader2, ChevronRight, Send, X, Filter
} from 'lucide-vue-next'

const store = useSupportStore()
const { tickets, loading } = storeToRefs(store)
const { user, claims, hasAnyRole } = useSession()

const isAdmin = computed(() => hasAnyRole(['ADMIN', 'SUPER_ADMIN']))

const currentUser = computed(() => ({
    uid: user.value?.uid || '',
    name: user.value?.displayName || user.value?.email || 'Unknown',
    email: user.value?.email || '',
    role: (claims.value?.roles?.[0] as string) || 'USER'
}))

onMounted(() => {
    if (currentUser.value.uid) {
        store.fetchTickets(currentUser.value.uid, isAdmin.value)
    }
})
onUnmounted(() => store.cleanup())

// ── Filters ────────────────────────────────────────────────────────────────
const searchQuery = ref('')
const statusFilter = ref<'all' | TicketStatus>('all')
const priorityFilter = ref<'all' | TicketPriority>('all')

const filteredTickets = computed(() => {
    let list = [...tickets.value]
    if (searchQuery.value) {
        const q = searchQuery.value.toLowerCase()
        list = list.filter(t =>
            t.title.toLowerCase().includes(q) ||
            t.description.toLowerCase().includes(q) ||
            t.createdBy?.name?.toLowerCase().includes(q)
        )
    }
    if (statusFilter.value !== 'all') list = list.filter(t => t.status === statusFilter.value)
    if (priorityFilter.value !== 'all') list = list.filter(t => t.priority === priorityFilter.value)
    return list
})

const stats = computed(() => ({
    total: tickets.value.length,
    open: tickets.value.filter(t => t.status === 'Open').length,
    inProgress: tickets.value.filter(t => t.status === 'In Progress').length,
    resolved: tickets.value.filter(t => t.status === 'Resolved' || t.status === 'Closed').length,
}))

// ── New Ticket Dialog ───────────────────────────────────────────────────────
const showNewTicket = ref(false)
const submitting = ref(false)
const newTicket = ref({
    title: '',
    description: '',
    category: 'General Enquiry' as TicketCategory,
    priority: 'Medium' as TicketPriority,
})

const CATEGORIES: TicketCategory[] = ['Technical Issue', 'Billing', 'Feature Request', 'General Enquiry', 'Bug Report']
const PRIORITIES: TicketPriority[] = ['Low', 'Medium', 'High', 'Urgent']
const STATUSES: TicketStatus[] = ['Open', 'In Progress', 'Resolved', 'Closed']

async function handleCreateTicket() {
    if (!newTicket.value.title.trim() || !newTicket.value.description.trim()) {
        toast.error('Missing Fields', { description: 'Please fill in a title and description.' })
        return
    }
    submitting.value = true
    try {
        await store.createTicket({ ...newTicket.value, createdBy: currentUser.value })
        toast.success('Ticket Submitted', { description: 'Your support ticket has been opened.' })
        showNewTicket.value = false
        newTicket.value = { title: '', description: '', category: 'General Enquiry', priority: 'Medium' }
    } catch (err: any) {
        toast.error('Failed', { description: err.message })
    } finally {
        submitting.value = false
    }
}

// ── Ticket Detail Dialog ────────────────────────────────────────────────────
const selectedTicket = ref<SupportTicket | null>(null)
const replyMessage = ref('')
const sendingReply = ref(false)
const updatingStatus = ref(false)

function openTicket(ticket: SupportTicket) {
    selectedTicket.value = ticket
    replyMessage.value = ''
}

async function handleSendReply() {
    if (!replyMessage.value.trim() || !selectedTicket.value) return
    sendingReply.value = true
    try {
        await store.addResponse(selectedTicket.value.id, {
            message: replyMessage.value.trim(),
            authorName: currentUser.value.name,
            authorUid: currentUser.value.uid,
            isStaff: isAdmin.value,
            createdAt: new Date().toISOString()
        })
        replyMessage.value = ''
        toast.success('Reply sent')
    } catch (err: any) {
        toast.error('Failed', { description: err.message })
    } finally {
        sendingReply.value = false
    }
}

async function handleStatusChange(status: TicketStatus) {
    if (!selectedTicket.value) return
    updatingStatus.value = true
    try {
        await store.updateStatus(selectedTicket.value.id, status)
        toast.success('Status updated')
    } catch (err: any) {
        toast.error('Failed', { description: err.message })
    } finally {
        updatingStatus.value = false
    }
}

// ── Helpers ────────────────────────────────────────────────────────────────
function statusVariant(status: TicketStatus) {
    return { Open: 'destructive', 'In Progress': 'warning', Resolved: 'success', Closed: 'secondary' }[status] as any
}

function statusColor(status: TicketStatus): string {
    return {
        Open: 'bg-red-500/10 text-red-600 border-red-200',
        'In Progress': 'bg-amber-500/10 text-amber-600 border-amber-200',
        Resolved: 'bg-green-500/10 text-green-600 border-green-200',
        Closed: 'bg-muted text-muted-foreground border-muted'
    }[status] || ''
}

function priorityColor(priority: TicketPriority): string {
    return {
        Low: 'bg-blue-500/10 text-blue-600 border-blue-200',
        Medium: 'bg-amber-500/10 text-amber-600 border-amber-200',
        High: 'bg-orange-500/10 text-orange-600 border-orange-200',
        Urgent: 'bg-red-500/10 text-red-600 border-red-200'
    }[priority] || ''
}

function formatDate(val: any): string {
    if (!val) return '—'
    const d = val?.toDate?.() || new Date(val)
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Keep selectedTicket in sync with live data
import { watch } from 'vue'
watch(tickets, (updated) => {
    if (selectedTicket.value) {
        const fresh = updated.find(t => t.id === selectedTicket.value!.id)
        if (fresh) selectedTicket.value = fresh
    }
})
</script>

<template>
    <div class="min-h-screen bg-background p-4 md:p-6 space-y-6">

        <!-- Header -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div class="flex items-center gap-3">
                <div class="p-2 rounded-lg bg-brand-primary/10">
                    <LifeBuoy class="size-6 text-brand-primary" />
                </div>
                <div>
                    <h1 class="text-2xl font-bold">Support Center</h1>
                    <p class="text-sm text-muted-foreground">
                        {{ isAdmin ? 'Manage all support tickets' : 'Get help with any issues or questions' }}
                    </p>
                </div>
            </div>
            <Button @click="showNewTicket = true" class="gap-2">
                <Plus class="size-4" /> Open New Ticket
            </Button>
        </div>

        <!-- Stats -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card class="border-border/50">
                <CardContent class="p-4 flex items-center gap-3">
                    <div class="p-2 rounded-lg bg-primary/10"><MessageSquare class="size-4 text-primary" /></div>
                    <div>
                        <p class="text-2xl font-bold">{{ stats.total }}</p>
                        <p class="text-[11px] text-muted-foreground uppercase font-bold tracking-wide">Total</p>
                    </div>
                </CardContent>
            </Card>
            <Card class="border-red-200 dark:border-red-800/40">
                <CardContent class="p-4 flex items-center gap-3">
                    <div class="p-2 rounded-lg bg-red-500/10"><AlertCircle class="size-4 text-red-500" /></div>
                    <div>
                        <p class="text-2xl font-bold text-red-600">{{ stats.open }}</p>
                        <p class="text-[11px] text-muted-foreground uppercase font-bold tracking-wide">Open</p>
                    </div>
                </CardContent>
            </Card>
            <Card class="border-amber-200 dark:border-amber-800/40">
                <CardContent class="p-4 flex items-center gap-3">
                    <div class="p-2 rounded-lg bg-amber-500/10"><Clock class="size-4 text-amber-500" /></div>
                    <div>
                        <p class="text-2xl font-bold text-amber-600">{{ stats.inProgress }}</p>
                        <p class="text-[11px] text-muted-foreground uppercase font-bold tracking-wide">In Progress</p>
                    </div>
                </CardContent>
            </Card>
            <Card class="border-green-200 dark:border-green-800/40">
                <CardContent class="p-4 flex items-center gap-3">
                    <div class="p-2 rounded-lg bg-green-500/10"><CheckCircle2 class="size-4 text-green-500" /></div>
                    <div>
                        <p class="text-2xl font-bold text-green-600">{{ stats.resolved }}</p>
                        <p class="text-[11px] text-muted-foreground uppercase font-bold tracking-wide">Resolved</p>
                    </div>
                </CardContent>
            </Card>
        </div>

        <!-- Filters -->
        <div class="flex flex-wrap gap-3 items-center">
            <div class="relative flex-1 min-w-[200px]">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input v-model="searchQuery" placeholder="Search tickets..." class="pl-9 h-9" />
            </div>
            <Select v-model="statusFilter">
                <SelectTrigger class="w-36 h-9">
                    <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem v-for="s in STATUSES" :key="s" :value="s">{{ s }}</SelectItem>
                </SelectContent>
            </Select>
            <Select v-model="priorityFilter">
                <SelectTrigger class="w-36 h-9">
                    <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Priorities</SelectItem>
                    <SelectItem v-for="p in PRIORITIES" :key="p" :value="p">{{ p }}</SelectItem>
                </SelectContent>
            </Select>
        </div>

        <!-- Ticket List -->
        <div v-if="loading" class="flex justify-center py-16">
            <Loader2 class="size-8 animate-spin text-muted-foreground" />
        </div>

        <div v-else-if="filteredTickets.length === 0" class="text-center py-16 text-muted-foreground">
            <LifeBuoy class="size-12 mx-auto mb-3 opacity-20" />
            <p class="font-medium">No tickets found</p>
            <p class="text-sm mt-1">{{ tickets.length === 0 ? 'Open your first ticket to get started.' : 'Try adjusting your filters.' }}</p>
        </div>

        <div v-else class="space-y-2">
            <Card v-for="ticket in filteredTickets" :key="ticket.id"
                class="cursor-pointer hover:shadow-md transition-all border-border/60 hover:border-brand-primary/30"
                @click="openTicket(ticket)">
                <CardContent class="p-4">
                    <div class="flex items-start justify-between gap-4">
                        <div class="flex-1 min-w-0 space-y-1.5">
                            <div class="flex items-center gap-2 flex-wrap">
                                <span class="font-semibold text-sm truncate">{{ ticket.title }}</span>
                                <Badge class="text-[10px] px-1.5 py-0 border" :class="statusColor(ticket.status)">
                                    {{ ticket.status }}
                                </Badge>
                                <Badge class="text-[10px] px-1.5 py-0 border" :class="priorityColor(ticket.priority)">
                                    {{ ticket.priority }}
                                </Badge>
                                <Badge variant="outline" class="text-[10px] px-1.5 py-0">{{ ticket.category }}</Badge>
                            </div>
                            <p class="text-[12px] text-muted-foreground line-clamp-1">{{ ticket.description }}</p>
                            <div class="flex items-center gap-4 text-[11px] text-muted-foreground">
                                <span v-if="isAdmin">by <strong>{{ ticket.createdBy?.name }}</strong></span>
                                <span>{{ formatDate(ticket.createdAt) }}</span>
                                <span v-if="ticket.responses?.length" class="flex items-center gap-1">
                                    <MessageSquare class="size-3" />
                                    {{ ticket.responses.length }} response{{ ticket.responses.length !== 1 ? 's' : '' }}
                                </span>
                            </div>
                        </div>
                        <ChevronRight class="size-4 text-muted-foreground shrink-0 mt-1" />
                    </div>
                </CardContent>
            </Card>
        </div>

        <!-- ── New Ticket Dialog ─────────────────────────────────────────── -->
        <Dialog v-model:open="showNewTicket">
            <DialogContent class="max-w-lg">
                <DialogHeader>
                    <DialogTitle class="flex items-center gap-2">
                        <LifeBuoy class="size-5 text-brand-primary" /> Open Support Ticket
                    </DialogTitle>
                </DialogHeader>
                <div class="space-y-4 py-2">
                    <div class="space-y-1.5">
                        <Label>Title <span class="text-destructive">*</span></Label>
                        <Input v-model="newTicket.title" placeholder="Brief summary of your issue..." />
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div class="space-y-1.5">
                            <Label>Category</Label>
                            <Select v-model="newTicket.category">
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem v-for="c in CATEGORIES" :key="c" :value="c">{{ c }}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div class="space-y-1.5">
                            <Label>Priority</Label>
                            <Select v-model="newTicket.priority">
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem v-for="p in PRIORITIES" :key="p" :value="p">{{ p }}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div class="space-y-1.5">
                        <Label>Description <span class="text-destructive">*</span></Label>
                        <Textarea v-model="newTicket.description" rows="4"
                            placeholder="Describe your issue in detail — include any error messages, steps to reproduce, etc." />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" @click="showNewTicket = false">Cancel</Button>
                    <Button @click="handleCreateTicket" :disabled="submitting" class="gap-2">
                        <Loader2 v-if="submitting" class="size-4 animate-spin" />
                        <Send v-else class="size-4" />
                        Submit Ticket
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <!-- ── Ticket Detail Dialog ─────────────────────────────────────── -->
        <Dialog :open="!!selectedTicket" @update:open="(v) => { if (!v) selectedTicket = null }">
            <DialogContent class="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
                <template v-if="selectedTicket">
                    <!-- Header -->
                    <div class="p-5 border-b flex items-start justify-between gap-4">
                        <div class="space-y-1.5 flex-1 min-w-0">
                            <h2 class="text-base font-bold leading-tight">{{ selectedTicket.title }}</h2>
                            <div class="flex flex-wrap gap-2">
                                <Badge class="text-[10px] px-1.5 py-0 border" :class="statusColor(selectedTicket.status)">
                                    {{ selectedTicket.status }}
                                </Badge>
                                <Badge class="text-[10px] px-1.5 py-0 border" :class="priorityColor(selectedTicket.priority)">
                                    {{ selectedTicket.priority }}
                                </Badge>
                                <Badge variant="outline" class="text-[10px] px-1.5 py-0">{{ selectedTicket.category }}</Badge>
                            </div>
                            <p class="text-[11px] text-muted-foreground">
                                Opened by <strong>{{ selectedTicket.createdBy?.name }}</strong>
                                · {{ formatDate(selectedTicket.createdAt) }}
                            </p>
                        </div>
                        <!-- Status changer (admin only) -->
                        <div v-if="isAdmin" class="shrink-0">
                            <Select :model-value="selectedTicket.status"
                                @update:model-value="(v) => handleStatusChange(v as TicketStatus)">
                                <SelectTrigger class="w-36 h-8 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem v-for="s in STATUSES" :key="s" :value="s">{{ s }}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <!-- Thread -->
                    <div class="flex-1 overflow-y-auto p-5 space-y-4 min-h-0">
                        <!-- Original message -->
                        <div class="flex gap-3">
                            <div class="size-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-[11px] font-bold text-primary">
                                {{ selectedTicket.createdBy?.name?.charAt(0)?.toUpperCase() || '?' }}
                            </div>
                            <div class="flex-1 space-y-1">
                                <div class="flex items-center gap-2">
                                    <span class="text-[12px] font-bold">{{ selectedTicket.createdBy?.name }}</span>
                                    <span class="text-[10px] text-muted-foreground">{{ formatDate(selectedTicket.createdAt) }}</span>
                                </div>
                                <div class="bg-muted/40 rounded-lg p-3 text-sm whitespace-pre-wrap">{{ selectedTicket.description }}</div>
                            </div>
                        </div>

                        <!-- Responses -->
                        <div v-for="resp in selectedTicket.responses" :key="resp.id" class="flex gap-3"
                            :class="resp.isStaff ? 'flex-row-reverse' : ''">
                            <div class="size-8 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold"
                                :class="resp.isStaff ? 'bg-brand-primary/10 text-brand-primary' : 'bg-primary/10 text-primary'">
                                {{ resp.authorName?.charAt(0)?.toUpperCase() || '?' }}
                            </div>
                            <div class="flex-1 space-y-1" :class="resp.isStaff ? 'items-end flex flex-col' : ''">
                                <div class="flex items-center gap-2" :class="resp.isStaff ? 'flex-row-reverse' : ''">
                                    <span class="text-[12px] font-bold">{{ resp.authorName }}</span>
                                    <span v-if="resp.isStaff"
                                        class="text-[9px] font-black bg-brand-primary/10 text-brand-primary px-1.5 py-0.5 rounded uppercase tracking-wide">
                                        Staff
                                    </span>
                                    <span class="text-[10px] text-muted-foreground">{{ formatDate(resp.createdAt) }}</span>
                                </div>
                                <div class="rounded-lg p-3 text-sm whitespace-pre-wrap max-w-[85%]"
                                    :class="resp.isStaff ? 'bg-brand-primary/10 text-foreground' : 'bg-muted/40'">
                                    {{ resp.message }}
                                </div>
                            </div>
                        </div>

                        <div v-if="!selectedTicket.responses?.length" class="text-center py-4 text-muted-foreground text-sm italic">
                            No responses yet.
                        </div>
                    </div>

                    <!-- Reply box (hidden if closed) -->
                    <div v-if="selectedTicket.status !== 'Closed'" class="p-4 border-t bg-muted/5">
                        <div class="flex gap-2">
                            <Textarea v-model="replyMessage" rows="2" placeholder="Write a reply..."
                                class="flex-1 resize-none text-sm"
                                @keydown.ctrl.enter="handleSendReply" />
                            <Button @click="handleSendReply" :disabled="sendingReply || !replyMessage.trim()"
                                class="self-end gap-1 shrink-0">
                                <Loader2 v-if="sendingReply" class="size-4 animate-spin" />
                                <Send v-else class="size-4" />
                            </Button>
                        </div>
                        <p class="text-[10px] text-muted-foreground mt-1">Ctrl+Enter to send</p>
                    </div>
                    <div v-else class="p-3 border-t bg-muted/5 text-center text-sm text-muted-foreground italic">
                        This ticket is closed. Open a new ticket if you need further assistance.
                    </div>
                </template>
            </DialogContent>
        </Dialog>

    </div>
</template>
