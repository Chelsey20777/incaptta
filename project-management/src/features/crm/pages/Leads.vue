<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { db } from '@/lib/firebase'
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, deleteDoc } from 'firebase/firestore'
import { useSession } from '@/composables/useSession'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
    TrendingUp, Plus, Search, Loader2, Trash2, Phone, Mail,
    Building2, DollarSign, Calendar, ChevronRight, User
} from 'lucide-vue-next'

type LeadStage = 'New' | 'Contacted' | 'Qualified' | 'Proposal' | 'Negotiation' | 'Won' | 'Lost'
type LeadPriority = 'Low' | 'Medium' | 'High'

interface Lead {
    id: string
    companyName: string
    contactName: string
    email: string
    phone: string
    stage: LeadStage
    priority: LeadPriority
    value: number
    source: string
    notes: string
    assignedTo: string
    expectedCloseDate: string
    createdBy: { uid: string; name: string }
    createdAt: any
    updatedAt: any
}

const { user, hasAnyRole } = useSession()
const isAdmin = computed(() => hasAnyRole(['ADMIN', 'SUPER_ADMIN', 'MANAGER']))
const currentUser = computed(() => ({
    uid: user.value?.uid || '',
    name: user.value?.displayName || user.value?.email || 'Unknown'
}))

const leads = ref<Lead[]>([])
const loading = ref(false)
let unsub: (() => void) | null = null

onMounted(() => {
    loading.value = true
    const q = query(collection(db, 'leads'), orderBy('createdAt', 'desc'))
    unsub = onSnapshot(q, (snap) => {
        leads.value = snap.docs.map(d => ({ id: d.id, ...d.data() } as Lead))
        loading.value = false
    }, () => { loading.value = false })
})
onUnmounted(() => unsub?.())

const STAGES: LeadStage[] = ['New', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost']
const PRIORITIES: LeadPriority[] = ['Low', 'Medium', 'High']
const SOURCES = ['Website', 'Referral', 'Cold Call', 'Email Campaign', 'Social Media', 'Exhibition', 'Other']

// ── Filters ─────────────────────────────────────────────────────────────────
const searchQuery = ref('')
const stageFilter = ref<'all' | LeadStage>('all')
const viewMode = ref<'pipeline' | 'list'>('pipeline')

const filteredLeads = computed(() => {
    let list = [...leads.value]
    if (searchQuery.value) {
        const q = searchQuery.value.toLowerCase()
        list = list.filter(l =>
            l.companyName?.toLowerCase().includes(q) ||
            l.contactName?.toLowerCase().includes(q) ||
            l.email?.toLowerCase().includes(q)
        )
    }
    if (stageFilter.value !== 'all') list = list.filter(l => l.stage === stageFilter.value)
    return list
})

const currentPage = ref(1)
const paginatedLeads = computed(() => {
    const start = (currentPage.value - 1) * 30
    return filteredLeads.value.slice(start, start + 30)
})
const totalPages = computed(() => Math.ceil(filteredLeads.value.length / 30) || 1)

// Reset page on filter or search change
watch([searchQuery, stageFilter], () => {
    currentPage.value = 1
})

const leadsByStage = computed(() => {
    const map: Record<LeadStage, Lead[]> = { New: [], Contacted: [], Qualified: [], Proposal: [], Negotiation: [], Won: [], Lost: [] }
    filteredLeads.value.forEach(l => { if (map[l.stage]) map[l.stage].push(l) })
    return map
})

const stats = computed(() => ({
    total: leads.value.length,
    active: leads.value.filter(l => !['Won', 'Lost'].includes(l.stage)).length,
    won: leads.value.filter(l => l.stage === 'Won').length,
    totalValue: leads.value.filter(l => l.stage !== 'Lost').reduce((s, l) => s + (l.value || 0), 0),
}))

// ── Form Dialog ──────────────────────────────────────────────────────────────
const showDialog = ref(false)
const editingLead = ref<Lead | null>(null)
const submitting = ref(false)

const blankForm = () => ({
    companyName: '', contactName: '', email: '', phone: '',
    stage: 'New' as LeadStage, priority: 'Medium' as LeadPriority,
    value: 0, source: 'Website', notes: '', assignedTo: '', expectedCloseDate: ''
})
const form = ref(blankForm())

function openCreate() { editingLead.value = null; form.value = blankForm(); showDialog.value = true }
function openEdit(lead: Lead) {
    editingLead.value = lead
    form.value = { companyName: lead.companyName, contactName: lead.contactName, email: lead.email,
        phone: lead.phone, stage: lead.stage, priority: lead.priority, value: lead.value,
        source: lead.source, notes: lead.notes, assignedTo: lead.assignedTo, expectedCloseDate: lead.expectedCloseDate }
    showDialog.value = true
}

async function handleSave() {
    if (!form.value.companyName.trim()) { toast.error('Company name is required'); return }
    submitting.value = true
    try {
        if (editingLead.value) {
            await updateDoc(doc(db, 'leads', editingLead.value.id), { ...form.value, updatedAt: serverTimestamp() })
            toast.success('Lead updated')
        } else {
            await addDoc(collection(db, 'leads'), { ...form.value, createdBy: currentUser.value, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
            toast.success('Lead added')
        }
        showDialog.value = false
    } catch (err: any) { toast.error('Failed', { description: err.message })
    } finally { submitting.value = false }
}

async function handleDelete(id: string) {
    if (!confirm('Delete this lead?')) return
    try { await deleteDoc(doc(db, 'leads', id)); toast.success('Lead deleted') }
    catch (err: any) { toast.error('Failed', { description: err.message }) }
}

async function moveStage(lead: Lead, stage: LeadStage) {
    try { await updateDoc(doc(db, 'leads', lead.id), { stage, updatedAt: serverTimestamp() }) }
    catch (err: any) { toast.error('Failed', { description: err.message }) }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function stageColor(s: LeadStage) {
    return { New: 'bg-blue-500/10 text-blue-600 border-blue-200', Contacted: 'bg-cyan-500/10 text-cyan-600 border-cyan-200',
             Qualified: 'bg-violet-500/10 text-violet-600 border-violet-200', Proposal: 'bg-amber-500/10 text-amber-600 border-amber-200',
             Negotiation: 'bg-orange-500/10 text-orange-600 border-orange-200', Won: 'bg-green-500/10 text-green-600 border-green-200',
             Lost: 'bg-red-500/10 text-red-500 border-red-200' }[s] || ''
}
function stageColumnBorder(s: LeadStage) {
    return { New: 'border-t-blue-400', Contacted: 'border-t-cyan-400', Qualified: 'border-t-violet-500',
             Proposal: 'border-t-amber-500', Negotiation: 'border-t-orange-500', Won: 'border-t-green-500', Lost: 'border-t-red-400' }[s] || ''
}
const formatCurrency = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v || 0)
const formatDate = (d: string) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
</script>

<template>
    <div class="min-h-screen bg-background p-4 md:p-6 space-y-6">

        <!-- Header -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div class="flex items-center gap-3">
                <div class="p-2 rounded-lg bg-brand-primary/10">
                    <TrendingUp class="size-6 text-brand-primary" />
                </div>
                <div>
                    <h1 class="text-2xl font-bold">Leads</h1>
                    <p class="text-sm text-muted-foreground">Manage your sales pipeline</p>
                </div>
            </div>
            <div class="flex items-center gap-2">
                <div class="flex border rounded-lg overflow-hidden">
                    <Button :variant="viewMode === 'pipeline' ? 'default' : 'ghost'" size="sm" class="rounded-none h-9" @click="viewMode = 'pipeline'">Pipeline</Button>
                    <Button :variant="viewMode === 'list' ? 'default' : 'ghost'" size="sm" class="rounded-none h-9" @click="viewMode = 'list'">List</Button>
                </div>
                <Button @click="openCreate" class="gap-2"><Plus class="size-4" /> Add Lead</Button>
            </div>
        </div>

        <!-- Stats -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card class="border-border/50"><CardContent class="p-4 flex items-center gap-3">
                <div class="p-2 rounded-lg bg-primary/10"><TrendingUp class="size-4 text-primary" /></div>
                <div><p class="text-2xl font-bold">{{ stats.total }}</p><p class="text-[11px] text-muted-foreground uppercase font-bold">Total</p></div>
            </CardContent></Card>
            <Card class="border-blue-200"><CardContent class="p-4 flex items-center gap-3">
                <div class="p-2 rounded-lg bg-blue-500/10"><User class="size-4 text-blue-500" /></div>
                <div><p class="text-2xl font-bold text-blue-600">{{ stats.active }}</p><p class="text-[11px] text-muted-foreground uppercase font-bold">Active</p></div>
            </CardContent></Card>
            <Card class="border-green-200"><CardContent class="p-4 flex items-center gap-3">
                <div class="p-2 rounded-lg bg-green-500/10"><TrendingUp class="size-4 text-green-500" /></div>
                <div><p class="text-2xl font-bold text-green-600">{{ stats.won }}</p><p class="text-[11px] text-muted-foreground uppercase font-bold">Won</p></div>
            </CardContent></Card>
            <Card class="border-amber-200"><CardContent class="p-4 flex items-center gap-3">
                <div class="p-2 rounded-lg bg-amber-500/10"><DollarSign class="size-4 text-amber-500" /></div>
                <div><p class="text-xl font-bold text-amber-600">{{ formatCurrency(stats.totalValue) }}</p><p class="text-[11px] text-muted-foreground uppercase font-bold">Pipeline</p></div>
            </CardContent></Card>
        </div>

        <!-- Filters -->
        <div class="flex flex-wrap gap-3 items-center">
            <div class="relative flex-1 min-w-[200px]">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input v-model="searchQuery" placeholder="Search leads..." class="pl-9 h-9" />
            </div>
            <Select v-model="stageFilter">
                <SelectTrigger class="w-40 h-9"><SelectValue placeholder="Stage" /></SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Stages</SelectItem>
                    <SelectItem v-for="s in STAGES" :key="s" :value="s">{{ s }}</SelectItem>
                </SelectContent>
            </Select>
        </div>

        <div v-if="loading" class="flex justify-center py-16"><Loader2 class="size-8 animate-spin text-muted-foreground" /></div>

        <!-- Pipeline View -->
        <div v-else-if="viewMode === 'pipeline'" class="overflow-x-auto pb-4">
            <div class="flex gap-3 min-w-[900px]">
                <div v-for="stage in STAGES" :key="stage"
                    class="flex-1 min-w-[160px] rounded-xl border border-t-4 bg-muted/20 flex flex-col gap-2 p-3"
                    :class="stageColumnBorder(stage)">
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-xs font-bold">{{ stage }}</span>
                        <Badge variant="secondary" class="text-[10px] h-5">{{ leadsByStage[stage].length }}</Badge>
                    </div>
                    <div v-if="leadsByStage[stage].length === 0" class="text-[11px] text-muted-foreground italic text-center py-4">Empty</div>
                    <Card v-for="lead in leadsByStage[stage]" :key="lead.id"
                        class="border-border/50 shadow-sm hover:shadow-md transition-all cursor-pointer bg-card"
                        @click="openEdit(lead)">
                        <CardContent class="p-3 space-y-1.5">
                            <p class="text-[12px] font-bold leading-tight truncate">{{ lead.companyName }}</p>
                            <p class="text-[11px] text-muted-foreground truncate">{{ lead.contactName }}</p>
                            <div v-if="lead.value" class="text-[11px] font-bold text-green-600">{{ formatCurrency(lead.value) }}</div>
                            <div v-if="lead.expectedCloseDate" class="text-[10px] text-muted-foreground flex items-center gap-1">
                                <Calendar class="size-3" />{{ formatDate(lead.expectedCloseDate) }}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>

        <!-- List View -->
        <div v-else class="space-y-4">
            <div v-if="filteredLeads.length === 0" class="text-center py-16 text-muted-foreground">
                <TrendingUp class="size-12 mx-auto mb-3 opacity-20" />
                <p class="font-medium">No leads found</p>
            </div>
            <template v-else>
                <div class="space-y-2">
                    <Card v-for="lead in paginatedLeads" :key="lead.id"
                        class="border-border/60 hover:shadow-md transition-all cursor-pointer bg-card" @click="openEdit(lead)">
                        <CardContent class="p-4 flex items-center gap-4">
                            <div class="flex-1 min-w-0 space-y-1">
                                <div class="flex items-center gap-2 flex-wrap">
                                    <span class="font-semibold text-sm">{{ lead.companyName }}</span>
                                    <Badge class="text-[10px] px-1.5 py-0 border" :class="stageColor(lead.stage)">{{ lead.stage }}</Badge>
                                </div>
                                <div class="flex items-center gap-4 text-[11px] text-muted-foreground">
                                    <span v-if="lead.contactName" class="flex items-center gap-1"><User class="size-3" />{{ lead.contactName }}</span>
                                    <span v-if="lead.email" class="flex items-center gap-1"><Mail class="size-3" />{{ lead.email }}</span>
                                    <span v-if="lead.phone" class="flex items-center gap-1"><Phone class="size-3" />{{ lead.phone }}</span>
                                    <span v-if="lead.value" class="flex items-center gap-1 font-bold text-green-600"><DollarSign class="size-3" />{{ formatCurrency(lead.value) }}</span>
                                </div>
                            </div>
                            <div class="flex items-center gap-1 shrink-0">
                                <Button v-if="isAdmin" variant="ghost" size="icon" class="h-7 w-7 text-destructive"
                                    @click.stop="handleDelete(lead.id)"><Trash2 class="size-3.5" /></Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <!-- Leads Pagination Controls -->
                <div class="flex items-center justify-between border-t border-brand-primary/20 pt-4 mt-4 px-4 bg-brand-primary/5 dark:bg-brand-primary/10 rounded-b-xl py-3">
                    <p class="text-xs text-muted-foreground dark:text-white/60">
                        Showing {{ Math.min((currentPage - 1) * 30 + 1, filteredLeads.length) }}-{{ Math.min(currentPage * 30, filteredLeads.length) }} of {{ filteredLeads.length }}
                    </p>
                    <div class="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            class="h-8 border-brand-primary/30 text-brand-primary hover:bg-brand-primary/10 bg-transparent"
                            :disabled="currentPage === 1"
                            @click="currentPage--"
                        >
                            Previous
                        </Button>
                        <span class="text-xs font-bold text-foreground dark:text-white px-3 py-1 rounded bg-muted/20 border border-brand-primary/20">
                            {{ currentPage }} / {{ totalPages }}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            class="h-8 border-brand-primary/30 text-brand-primary hover:bg-brand-primary/10 bg-transparent"
                            :disabled="currentPage >= totalPages"
                            @click="currentPage++"
                        >
                            Next
                        </Button>
                    </div>
                </div>
            </template>
        </div>

        <!-- Lead Form Dialog -->
        <Dialog v-model:open="showDialog">
            <DialogContent class="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{{ editingLead ? 'Edit Lead' : 'New Lead' }}</DialogTitle>
                </DialogHeader>
                <div class="space-y-4 py-2">
                    <div class="grid grid-cols-2 gap-3">
                        <div class="space-y-1.5 col-span-2">
                            <Label>Company Name <span class="text-destructive">*</span></Label>
                            <Input v-model="form.companyName" placeholder="Company..." />
                        </div>
                        <div class="space-y-1.5">
                            <Label>Contact Name</Label>
                            <Input v-model="form.contactName" placeholder="Full name..." />
                        </div>
                        <div class="space-y-1.5">
                            <Label>Phone</Label>
                            <Input v-model="form.phone" placeholder="+263..." />
                        </div>
                        <div class="space-y-1.5 col-span-2">
                            <Label>Email</Label>
                            <Input v-model="form.email" type="email" placeholder="email@company.com" />
                        </div>
                        <div class="space-y-1.5">
                            <Label>Stage</Label>
                            <Select v-model="form.stage">
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem v-for="s in STAGES" :key="s" :value="s">{{ s }}</SelectItem>
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
                        <div class="space-y-1.5">
                            <Label>Estimated Value ($)</Label>
                            <Input v-model.number="form.value" type="number" min="0" placeholder="0" />
                        </div>
                        <div class="space-y-1.5">
                            <Label>Expected Close</Label>
                            <Input v-model="form.expectedCloseDate" type="date" />
                        </div>
                        <div class="space-y-1.5">
                            <Label>Source</Label>
                            <Select v-model="form.source">
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem v-for="s in SOURCES" :key="s" :value="s">{{ s }}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div class="space-y-1.5">
                            <Label>Assigned To</Label>
                            <Input v-model="form.assignedTo" placeholder="Sales rep name..." />
                        </div>
                        <div class="space-y-1.5 col-span-2">
                            <Label>Notes</Label>
                            <Textarea v-model="form.notes" rows="3" placeholder="Any additional notes..." />
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" @click="showDialog = false">Cancel</Button>
                    <Button @click="handleSave" :disabled="submitting" class="gap-2">
                        <Loader2 v-if="submitting" class="size-4 animate-spin" />
                        {{ editingLead ? 'Save Changes' : 'Add Lead' }}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

    </div>
</template>
