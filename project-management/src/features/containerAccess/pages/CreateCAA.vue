<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, Loader2, Search, X } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'vue-sonner'
import { useSession } from '@/composables/useSession'
import { useContainerAccessStore } from '../store/containerAccessStore'
import { useJobCardsStore } from '@/features/jobCards/store/jobCardsStore'
import type { JobCardRef } from '../types'

const router = useRouter()
const store = useContainerAccessStore()
const jobCardsStore = useJobCardsStore()
const { user, claims } = useSession()
const isSubmitting = ref(false)

onMounted(() => { jobCardsStore.fetchJobCards() })
onUnmounted(() => { jobCardsStore.cleanup() })

// ── Job card selector ─────────────────────────────────────────────────────
const jobSearch = ref('')
const selectedJobCard = ref<JobCardRef | null>(null)
const showJobDropdown = ref(false)

const filteredJobCards = computed(() => {
    const q = jobSearch.value.toLowerCase().trim()
    if (!q) return jobCardsStore.jobCards.slice(0, 20)
    return jobCardsStore.jobCards
        .filter((j: any) => {
            const num = (j.generalInfo?.jobNumber || '').toLowerCase()
            const name = (j.generalInfo?.recipientName || '').toLowerCase()
            const addr = (j.generalInfo?.recipientAddress || '').toLowerCase()
            return num.includes(q) || name.includes(q) || addr.includes(q)
        })
        .slice(0, 20)
})

function selectJobCard(job: any) {
    selectedJobCard.value = {
        id: job.id,
        jobNumber: job.generalInfo?.jobNumber || job.id.substring(0, 8),
        clientName: job.generalInfo?.recipientName || 'Unknown',
        location: job.generalInfo?.recipientAddress || '—',
    }
    jobSearch.value = selectedJobCard.value.jobNumber
    showJobDropdown.value = false
}

function clearJobCard() {
    selectedJobCard.value = null
    jobSearch.value = ''
}

// ── Form state ────────────────────────────────────────────────────────────
const form = ref({
    containerName: 'Main Container',
    containerLocation: '',
    purposeOfAccess: '',
    accessDate: '',
    accessTimeFrom: '',
    accessTimeTo: '',
})

const formErrors = ref<Record<string, string>>({})

function validate(): boolean {
    const errors: Record<string, string> = {}
    if (!form.value.containerName.trim()) errors.containerName = 'Container name is required'
    if (!form.value.containerLocation.trim()) errors.containerLocation = 'Container location is required'
    if (!form.value.purposeOfAccess.trim()) errors.purposeOfAccess = 'Purpose of access is required'
    if (!form.value.accessDate) {
        errors.accessDate = 'Access date is required'
    } else {
        const today = new Date().toISOString().substring(0, 10)
        if (form.value.accessDate < today) {
            errors.accessDate = 'Access date cannot be in the past'
        }
    }
    if (!form.value.accessTimeFrom) errors.accessTimeFrom = 'Start time is required'
    if (!form.value.accessTimeTo) errors.accessTimeTo = 'End time is required'
    if (form.value.accessTimeFrom && form.value.accessTimeTo && form.value.accessTimeTo <= form.value.accessTimeFrom) {
        errors.accessTimeTo = 'End time must be after start time'
    }
    formErrors.value = errors
    return Object.keys(errors).length === 0
}

async function handleSubmit() {
    if (!validate()) return
    if (!user.value) {
        toast.error('You must be logged in to submit a request')
        return
    }

    isSubmitting.value = true
    try {
        const rolesRaw = claims.value?.roles
        const role = Array.isArray(rolesRaw) ? rolesRaw[0] : String(rolesRaw || 'UNKNOWN')

        const id = await store.createRequest({
            containerName: form.value.containerName.trim(),
            containerLocation: form.value.containerLocation.trim(),
            purposeOfAccess: form.value.purposeOfAccess.trim(),
            accessDate: form.value.accessDate,
            accessTimeFrom: form.value.accessTimeFrom,
            accessTimeTo: form.value.accessTimeTo,
            requestedByUid: user.value.uid,
            requestedByName: user.value.displayName || user.value.email || 'Unknown',
            requestedByRole: role,
            requestedByEmail: user.value.email || '',
            ...(selectedJobCard.value ? { jobCardRef: selectedJobCard.value } : {}),
        })

        toast.success('Access request submitted successfully')
        router.push(`/container-access/${id}`)
    } catch (err: any) {
        toast.error('Failed to submit request', { description: err.message })
    } finally {
        isSubmitting.value = false
    }
}

function handleJobBlur() {
    setTimeout(() => { showJobDropdown.value = false }, 150)
}
</script>

<template>
    <div class="p-4 md:p-6 max-w-2xl mx-auto">
        <Button variant="ghost" size="sm" class="mb-4 gap-1" @click="router.push('/container-access')">
            <ArrowLeft class="h-4 w-4" />
            Back
        </Button>

        <Card>
            <CardHeader>
                <CardTitle>New Container Access Request</CardTitle>
                <CardDescription>
                    Submit a request to access a physical inventory container. A manager must approve before access is granted.
                </CardDescription>
            </CardHeader>

            <CardContent class="space-y-5">

                <!-- Job Card Reference (optional) -->
                <div class="space-y-1.5">
                    <Label>Job Card Reference <span class="text-muted-foreground text-xs font-normal">(optional)</span></Label>
                    <div class="relative">
                        <div class="relative flex items-center">
                            <Search class="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                            <Input
                                v-model="jobSearch"
                                placeholder="Search by job #, client name or location..."
                                class="pl-9 pr-8"
                                @focus="showJobDropdown = true"
                                @blur="handleJobBlur"
                            />
                            <button
                                v-if="selectedJobCard"
                                type="button"
                                class="absolute right-2 text-muted-foreground hover:text-foreground"
                                @click="clearJobCard"
                            >
                                <X class="h-4 w-4" />
                            </button>
                        </div>

                        <!-- Selected job card badge -->
                        <div v-if="selectedJobCard" class="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-1.5">
                            <span class="font-semibold text-foreground">{{ selectedJobCard.jobNumber }}</span>
                            <span>·</span>
                            <span>{{ selectedJobCard.clientName }}</span>
                            <span>·</span>
                            <span>{{ selectedJobCard.location }}</span>
                        </div>

                        <!-- Dropdown results -->
                        <div
                            v-if="showJobDropdown && filteredJobCards.length > 0"
                            class="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-md max-h-52 overflow-y-auto"
                        >
                            <button
                                v-for="job in filteredJobCards"
                                :key="job.id"
                                type="button"
                                class="w-full text-left px-3 py-2 text-sm hover:bg-accent flex flex-col gap-0.5"
                                @mousedown.prevent="selectJobCard(job)"
                            >
                                <span class="font-semibold">{{ job.generalInfo?.jobNumber || job.id.substring(0, 8) }}</span>
                                <span class="text-xs text-muted-foreground">
                                    {{ job.generalInfo?.recipientName || '—' }}
                                    <template v-if="job.generalInfo?.recipientAddress">
                                        · {{ job.generalInfo.recipientAddress }}
                                    </template>
                                </span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Container Name -->
                <div class="space-y-1.5">
                    <Label for="containerName">Container Name <span class="text-red-500">*</span></Label>
                    <Input
                        id="containerName"
                        v-model="form.containerName"
                        placeholder="e.g. Main Warehouse Container A"
                        :class="{ 'border-red-500': formErrors.containerName }"
                    />
                    <p v-if="formErrors.containerName" class="text-xs text-red-500">{{ formErrors.containerName }}</p>
                </div>

                <!-- Container Location -->
                <div class="space-y-1.5">
                    <Label for="containerLocation">Container Location <span class="text-red-500">*</span></Label>
                    <Input
                        id="containerLocation"
                        v-model="form.containerLocation"
                        placeholder="e.g. Warehouse Block B, Bay 3"
                        :class="{ 'border-red-500': formErrors.containerLocation }"
                    />
                    <p v-if="formErrors.containerLocation" class="text-xs text-red-500">{{ formErrors.containerLocation }}</p>
                </div>

                <!-- Purpose of Access -->
                <div class="space-y-1.5">
                    <Label for="purposeOfAccess">Purpose of Access <span class="text-red-500">*</span></Label>
                    <Textarea
                        id="purposeOfAccess"
                        v-model="form.purposeOfAccess"
                        placeholder="Describe why you need access to this container..."
                        rows="3"
                        :class="{ 'border-red-500': formErrors.purposeOfAccess }"
                    />
                    <p v-if="formErrors.purposeOfAccess" class="text-xs text-red-500">{{ formErrors.purposeOfAccess }}</p>
                </div>

                <!-- Access Date -->
                <div class="space-y-1.5">
                    <Label for="accessDate">Requested Access Date <span class="text-red-500">*</span></Label>
                    <Input
                        id="accessDate"
                        v-model="form.accessDate"
                        type="date"
                        :class="{ 'border-red-500': formErrors.accessDate }"
                    />
                    <p v-if="formErrors.accessDate" class="text-xs text-red-500">{{ formErrors.accessDate }}</p>
                </div>

                <!-- Time Window -->
                <div class="grid grid-cols-2 gap-4">
                    <div class="space-y-1.5">
                        <Label for="accessTimeFrom">From <span class="text-red-500">*</span></Label>
                        <Input
                            id="accessTimeFrom"
                            v-model="form.accessTimeFrom"
                            type="time"
                            :class="{ 'border-red-500': formErrors.accessTimeFrom }"
                        />
                        <p v-if="formErrors.accessTimeFrom" class="text-xs text-red-500">{{ formErrors.accessTimeFrom }}</p>
                    </div>
                    <div class="space-y-1.5">
                        <Label for="accessTimeTo">To <span class="text-red-500">*</span></Label>
                        <Input
                            id="accessTimeTo"
                            v-model="form.accessTimeTo"
                            type="time"
                            :class="{ 'border-red-500': formErrors.accessTimeTo }"
                        />
                        <p v-if="formErrors.accessTimeTo" class="text-xs text-red-500">{{ formErrors.accessTimeTo }}</p>
                    </div>
                </div>
            </CardContent>

            <CardFooter class="flex justify-end gap-2">
                <Button variant="outline" @click="router.push('/container-access')">Cancel</Button>
                <Button :disabled="isSubmitting" @click="handleSubmit">
                    <Loader2 v-if="isSubmitting" class="h-4 w-4 mr-2 animate-spin" />
                    Submit Request
                </Button>
            </CardFooter>
        </Card>
    </div>
</template>
