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
import { Briefcase, PlusCircle, Trash2, UserPlus, ChevronRight } from 'lucide-vue-next'
import type { JobPosting } from '../types'
import HRNav from '../components/HRNav.vue'

const hrStore = useHrStore()
const { hasAnyRole } = useSession()
const { employees, jobPostings, loading } = storeToRefs(hrStore)

onMounted(() => { hrStore.fetchEmployees(); hrStore.fetchJobPostings() })
onUnmounted(() => hrStore.cleanup())

const canManage = computed(() => hasAnyRole(['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'ACCOUNTANT', 'TECHNICAL']))

const showJobDialog = ref(false)
const showApplicantDialog = ref(false)
const showApplicantsPanel = ref(false)
const saving = ref(false)
const editingId = ref<string | null>(null)
const selectedJob = ref<JobPosting | null>(null)

const jobForm = ref({
    jobTitle: '', department: '', description: '', status: 'Open' as JobPosting['status'],
    postedDate: new Date().toISOString().split('T')[0], applicants: [] as JobPosting['applicants']
})

const applicantForm = ref({
    name: '', email: '', phone: '', notes: '', status: 'Applied' as import('../types').Applicant['status']
})

const openCounts = computed(() => jobPostings.value.filter(j => j.status === 'Open').length)
const totalApplicants = computed(() =>
    jobPostings.value.reduce((s, j) => s + (j.applicants?.length || 0), 0)
)

function openAddJob() {
    editingId.value = null
    jobForm.value = { jobTitle: '', department: '', description: '', status: 'Open', postedDate: new Date().toISOString().split('T')[0], applicants: [] }
    showJobDialog.value = true
}

function openEditJob(job: JobPosting) {
    editingId.value = job.id!
    jobForm.value = { ...job } as any
    showJobDialog.value = true
}

async function saveJob() {
    if (!jobForm.value.jobTitle) return
    saving.value = true
    try {
        const payload: import('../types').JobPosting = {
            ...jobForm.value,
            postedDate: (jobForm.value.postedDate || new Date().toISOString().split('T')[0]) as string
        }
        await hrStore.saveJobPosting(payload, editingId.value || undefined)
        showJobDialog.value = false
    } finally {
        saving.value = false
    }
}

function openApplicants(job: JobPosting) {
    selectedJob.value = job
    showApplicantsPanel.value = true
}

function openAddApplicant(job: JobPosting) {
    selectedJob.value = job
    applicantForm.value = { name: '', email: '', phone: '', notes: '', status: 'Applied' as import('../types').Applicant['status'] }
    showApplicantDialog.value = true
}

async function addApplicant() {
    if (!selectedJob.value || !applicantForm.value.name || !applicantForm.value.email) return
    saving.value = true
    try {
        await hrStore.addApplicant(selectedJob.value.id!, applicantForm.value)
        showApplicantDialog.value = false
    } finally {
        saving.value = false
    }
}

async function updateStatus(jobId: string, applicantId: string, status: any) {
    await hrStore.updateApplicantStatus(jobId, applicantId, status)
    // refresh local view
    const job = jobPostings.value.find(j => j.id === jobId)
    if (job) selectedJob.value = job
}

function statusColor(s: string) {
    return {
        Open: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
        Closed: 'bg-red-500/10 text-red-600 border-red-500/20',
        'On Hold': 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'
    }[s] || ''
}

function applicantStatusColor(s: string) {
    return {
        Applied: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
        Interviewed: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
        Offered: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
        Hired: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
        Rejected: 'bg-red-500/10 text-red-600 border-red-500/20'
    }[s] || ''
}
</script>

<template>
    <div class="space-y-5">
        <HRNav />
        <div class="flex items-center justify-between gap-4 flex-wrap">
            <div>
                <h1 class="text-2xl font-bold tracking-tight flex items-center gap-2">
                    <Briefcase class="size-6" /> Recruitment
                </h1>
                <p class="text-muted-foreground text-sm mt-1">{{ openCounts }} open positions · {{ totalApplicants }} total applicants</p>
            </div>
            <Button v-if="canManage" @click="openAddJob" class="gap-2">
                <PlusCircle class="size-4" /> Post Job
            </Button>
        </div>

        <!-- Summary -->
        <div class="grid grid-cols-3 gap-4">
            <Card>
                <CardContent class="p-4">
                    <p class="text-2xl font-bold text-emerald-500">{{ openCounts }}</p>
                    <p class="text-xs text-muted-foreground">Open Positions</p>
                </CardContent>
            </Card>
            <Card>
                <CardContent class="p-4">
                    <p class="text-2xl font-bold">{{ totalApplicants }}</p>
                    <p class="text-xs text-muted-foreground">Total Applicants</p>
                </CardContent>
            </Card>
            <Card>
                <CardContent class="p-4">
                    <p class="text-2xl font-bold text-blue-500">
                        {{ jobPostings.reduce((s,j) => s + j.applicants.filter(a => a.status === 'Hired').length, 0) }}
                    </p>
                    <p class="text-xs text-muted-foreground">Hired</p>
                </CardContent>
            </Card>
        </div>

        <div class="grid md:grid-cols-2 gap-6">
            <!-- Job Postings -->
            <div class="space-y-3">
                <h2 class="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Job Postings</h2>
                <div v-if="jobPostings.length === 0" class="text-sm text-muted-foreground italic py-8 text-center border rounded-xl">
                    No job postings yet
                </div>
                <div v-for="job in jobPostings" :key="job.id"
                    class="border rounded-xl p-4 hover:border-primary/50 transition-colors group cursor-pointer"
                    @click="openApplicants(job)">
                    <div class="flex items-start justify-between gap-2">
                        <div class="flex-1 min-w-0">
                            <p class="font-semibold">{{ job.jobTitle }}</p>
                            <p class="text-xs text-muted-foreground">{{ job.department }} · Posted {{ job.postedDate }}</p>
                        </div>
                        <span class="text-xs px-2 py-0.5 rounded-full border shrink-0" :class="statusColor(job.status)">
                            {{ job.status }}
                        </span>
                    </div>
                    <p v-if="job.description" class="text-xs text-muted-foreground mt-2 line-clamp-2">{{ job.description }}</p>
                    <div class="flex items-center justify-between mt-3">
                        <span class="text-xs text-muted-foreground">{{ job.applicants?.length || 0 }} applicants</span>
                        <div class="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity" @click.stop>
                            <Button variant="ghost" size="sm" class="h-7 text-xs gap-1" @click="openAddApplicant(job)">
                                <UserPlus class="size-3" /> Add
                            </Button>
                            <Button v-if="canManage" variant="ghost" size="sm" class="h-7 text-xs gap-1" @click="openEditJob(job)">
                                Edit
                            </Button>
                            <Button v-if="canManage" variant="ghost" size="sm" class="h-7 text-xs hover:text-destructive"
                                @click="hrStore.deleteJobPosting(job.id!)">
                                <Trash2 class="size-3" />
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Applicants Panel -->
            <div class="space-y-3">
                <h2 class="font-semibold text-sm uppercase tracking-wider text-muted-foreground">
                    {{ selectedJob ? `Applicants — ${selectedJob.jobTitle}` : 'Select a job to view applicants' }}
                </h2>
                <div v-if="!selectedJob" class="text-sm text-muted-foreground italic py-8 text-center border rounded-xl">
                    Click a job posting to view applicants
                </div>
                <template v-else>
                    <div v-if="!selectedJob.applicants?.length" class="text-sm text-muted-foreground italic py-8 text-center border rounded-xl">
                        No applicants yet
                    </div>
                    <div v-for="app in (jobPostings.find(j => j.id === selectedJob!.id) || selectedJob).applicants" :key="app.id"
                        class="border rounded-xl p-3 space-y-2">
                        <div class="flex items-start justify-between gap-2">
                            <div>
                                <p class="font-semibold text-sm">{{ app.name }}</p>
                                <p class="text-xs text-muted-foreground">{{ app.email }}</p>
                                <p v-if="app.phone" class="text-xs text-muted-foreground">{{ app.phone }}</p>
                            </div>
                            <span class="text-xs px-2 py-0.5 rounded-full border shrink-0" :class="applicantStatusColor(app.status)">
                                {{ app.status }}
                            </span>
                        </div>
                        <p v-if="app.notes" class="text-xs text-muted-foreground italic">{{ app.notes }}</p>
                        <Select v-if="canManage" :modelValue="app.status"
                            @update:modelValue="(v) => updateStatus(selectedJob!.id!, app.id, v)">
                            <SelectTrigger class="h-7 text-xs w-full">
                                <SelectValue placeholder="Update status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Applied">Applied</SelectItem>
                                <SelectItem value="Interviewed">Interviewed</SelectItem>
                                <SelectItem value="Offered">Offered</SelectItem>
                                <SelectItem value="Hired">Hired</SelectItem>
                                <SelectItem value="Rejected">Rejected</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </template>
            </div>
        </div>

        <!-- Job Dialog -->
        <Dialog v-model:open="showJobDialog">
            <DialogContent class="w-[95vw] max-w-none">
                <DialogHeader>
                    <DialogTitle>{{ editingId ? 'Edit Job Posting' : 'Post New Job' }}</DialogTitle>
                </DialogHeader>
                <div class="space-y-4 py-2">
                    <div class="space-y-1">
                        <label class="text-xs font-medium">Job Title *</label>
                        <Input v-model="jobForm.jobTitle" placeholder="e.g. Software Engineer" />
                    </div>
                    <div class="space-y-1">
                        <label class="text-xs font-medium">Department</label>
                        <Input v-model="jobForm.department" placeholder="Engineering" />
                    </div>
                    <div class="space-y-1">
                        <label class="text-xs font-medium">Description</label>
                        <Textarea v-model="jobForm.description" placeholder="Job description…" class="min-h-[80px]" />
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div class="space-y-1">
                            <label class="text-xs font-medium">Status</label>
                            <Select v-model="jobForm.status">
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Open">Open</SelectItem>
                                    <SelectItem value="On Hold">On Hold</SelectItem>
                                    <SelectItem value="Closed">Closed</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div class="space-y-1">
                            <label class="text-xs font-medium">Posted Date</label>
                            <Input v-model="jobForm.postedDate" type="date" />
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" @click="showJobDialog = false">Cancel</Button>
                    <Button @click="saveJob" :disabled="saving || !jobForm.jobTitle">
                        {{ saving ? 'Saving…' : (editingId ? 'Save' : 'Post Job') }}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <!-- Applicant Dialog -->
        <Dialog v-model:open="showApplicantDialog">
            <DialogContent class="w-[95vw] max-w-none">
                <DialogHeader>
                    <DialogTitle>Add Applicant</DialogTitle>
                </DialogHeader>
                <div class="space-y-4 py-2">
                    <div class="space-y-1">
                        <label class="text-xs font-medium">Full Name *</label>
                        <Input v-model="applicantForm.name" placeholder="John Doe" />
                    </div>
                    <div class="space-y-1">
                        <label class="text-xs font-medium">Email *</label>
                        <Input v-model="applicantForm.email" type="email" placeholder="john@email.com" />
                    </div>
                    <div class="space-y-1">
                        <label class="text-xs font-medium">Phone</label>
                        <Input v-model="applicantForm.phone" placeholder="+263 77..." />
                    </div>
                    <div class="space-y-1">
                        <label class="text-xs font-medium">Notes</label>
                        <Textarea v-model="applicantForm.notes" placeholder="Notes…" class="min-h-[60px]" />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" @click="showApplicantDialog = false">Cancel</Button>
                    <Button @click="addApplicant" :disabled="saving || !applicantForm.name || !applicantForm.email">
                        {{ saving ? 'Saving…' : 'Add Applicant' }}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
</template>
