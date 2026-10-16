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
import { TrendingUp, PlusCircle, Trash2, RefreshCw, MessageSquare } from 'lucide-vue-next'
import { getRating, getRatingColor } from '../types'
import type { KPI } from '../types'
import HRNav from '../components/HRNav.vue'

const hrStore = useHrStore()
const { hasAnyRole, user } = useSession()
const { employees, kpis, performanceReviews, tasks, loading } = storeToRefs(hrStore)

onMounted(() => { hrStore.fetchAll() })
onUnmounted(() => hrStore.cleanup())

const canManage = computed(() => hasAnyRole(['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'ACCOUNTANT', 'TECHNICAL']))

const selectedEmpId = ref('')
const selectedPeriod = ref('Monthly')
const showKpiDialog = ref(false)
const showReviewDialog = ref(false)
const saving = ref(false)
const editingKpiId = ref<string | null>(null)
const commentText = ref('')

const kpiForm = ref({
    name: '', targetValue: 100, weight: 0, period: 'Monthly' as KPI['period']
})

const empKpis = computed(() => kpis.value.filter(k => k.employeeId === selectedEmpId.value))
const totalWeight = computed(() => empKpis.value.reduce((s, k) => s + k.weight, 0))
const weightOk = computed(() => totalWeight.value === 100)

const empReviews = computed(() =>
    performanceReviews.value.filter(r => r.employeeId === selectedEmpId.value)
)
const latestReview = computed(() => empReviews.value[0])

// Calculate live KPI score from tasks
function liveScore(kpiId: string) {
    const verified = tasks.value.filter(
        t => t.kpiCategory === kpiId && t.status === 'Completed' && t.verifiedBy
    )
    if (!verified.length) return 0
    return Math.round(verified.reduce((s, t) => s + (t.completionPercent || 0), 0) / verified.length)
}

function openAddKpi() {
    editingKpiId.value = null
    kpiForm.value = { name: '', targetValue: 100, weight: 0, period: 'Monthly' }
    showKpiDialog.value = true
}

function openEditKpi(kpi: KPI) {
    editingKpiId.value = kpi.id!
    kpiForm.value = { name: kpi.name, targetValue: kpi.targetValue, weight: kpi.weight, period: kpi.period }
    showKpiDialog.value = true
}

async function saveKpi() {
    if (!kpiForm.value.name || !selectedEmpId.value) return
    saving.value = true
    try {
        await hrStore.saveKpi({
            ...kpiForm.value,
            employeeId: selectedEmpId.value,
            linkedTaskIds: []
        }, editingKpiId.value || undefined)
        showKpiDialog.value = false
    } finally {
        saving.value = false
    }
}

async function generateReview() {
    if (!selectedEmpId.value) return
    saving.value = true
    try {
        await hrStore.generateReview(selectedEmpId.value, selectedPeriod.value)
    } finally {
        saving.value = false
    }
}

async function saveComment(reviewId: string) {
    await hrStore.updateReviewComments(reviewId, commentText.value)
}

function ratingBg(rating: string) {
    return {
        Excellent: 'bg-emerald-500/10 border-emerald-500/20',
        Good: 'bg-blue-500/10 border-blue-500/20',
        Satisfactory: 'bg-yellow-500/10 border-yellow-500/20',
        'Needs Improvement': 'bg-orange-500/10 border-orange-500/20',
        Unsatisfactory: 'bg-red-500/10 border-red-500/20'
    }[rating] || 'bg-muted/10'
}

function scoreBar(score: number) {
    if (score >= 90) return 'bg-emerald-500'
    if (score >= 75) return 'bg-blue-500'
    if (score >= 60) return 'bg-yellow-500'
    if (score >= 40) return 'bg-orange-500'
    return 'bg-red-500'
}
</script>

<template>
    <div class="space-y-5">
        <HRNav />
        <div class="flex items-center justify-between gap-4 flex-wrap">
            <div>
                <h1 class="text-2xl font-bold tracking-tight flex items-center gap-2">
                    <TrendingUp class="size-6" /> Performance & KPIs
                </h1>
                <p class="text-muted-foreground text-sm mt-1">KPI-driven performance management</p>
            </div>
        </div>

        <!-- Employee + Period Selector -->
        <div class="flex gap-3 flex-wrap">
            <Select v-model="selectedEmpId" class="w-56">
                <SelectTrigger class="w-56"><SelectValue placeholder="Select employee…" /></SelectTrigger>
                <SelectContent>
                    <SelectItem v-for="e in employees" :key="e.id" :value="e.id!">{{ e.fullName }}</SelectItem>
                </SelectContent>
            </Select>
            <Select v-model="selectedPeriod" class="w-36">
                <SelectTrigger class="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                    <SelectItem value="Monthly">Monthly</SelectItem>
                    <SelectItem value="Quarterly">Quarterly</SelectItem>
                    <SelectItem value="Annual">Annual</SelectItem>
                </SelectContent>
            </Select>
        </div>

        <div v-if="!selectedEmpId" class="flex items-center justify-center h-40 text-muted-foreground italic text-sm">
            Select an employee to view their KPIs and performance
        </div>

        <div v-else class="space-y-5">
            <!-- KPIs Section -->
            <div class="flex items-center justify-between">
                <div>
                    <h2 class="font-semibold">KPI Definitions</h2>
                    <p class="text-xs text-muted-foreground">
                        Total weight: <span :class="weightOk ? 'text-emerald-500' : 'text-red-500'">{{ totalWeight }}%</span>
                        <span v-if="!weightOk" class="text-red-500"> (must equal 100%)</span>
                    </p>
                </div>
                <Button v-if="canManage" size="sm" class="gap-2" @click="openAddKpi">
                    <PlusCircle class="size-4" /> Add KPI
                </Button>
            </div>

            <div v-if="empKpis.length === 0" class="text-sm text-muted-foreground italic py-4">
                No KPIs defined for this employee.
            </div>

            <div class="grid md:grid-cols-2 gap-4">
                <Card v-for="kpi in empKpis" :key="kpi.id" class="group">
                    <CardContent class="p-4 space-y-3">
                        <div class="flex items-start justify-between gap-2">
                            <div class="flex-1 min-w-0">
                                <p class="font-semibold truncate">{{ kpi.name }}</p>
                                <p class="text-xs text-muted-foreground">{{ kpi.period }} · Weight: {{ kpi.weight }}%</p>
                            </div>
                            <div v-if="canManage" class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button variant="ghost" size="icon" class="h-6 w-6" @click="openEditKpi(kpi)">
                                    <svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                    </svg>
                                </Button>
                                <Button variant="ghost" size="icon" class="h-6 w-6 hover:text-destructive"
                                    @click="hrStore.deleteKpi(kpi.id!)">
                                    <Trash2 class="size-3" />
                                </Button>
                            </div>
                        </div>

                        <!-- Live Score -->
                        <div>
                            <div class="flex justify-between text-xs mb-1">
                                <span class="text-muted-foreground">Live Score</span>
                                <span class="font-bold">{{ liveScore(kpi.id!) }}% / {{ kpi.targetValue }}%</span>
                            </div>
                            <div class="w-full bg-muted rounded-full h-2">
                                <div class="h-2 rounded-full transition-all" :class="scoreBar(liveScore(kpi.id!))"
                                    :style="{ width: Math.min(100, liveScore(kpi.id!)) + '%' }" />
                            </div>
                        </div>

                        <!-- Manager Comment -->
                        <div v-if="kpi.managerComment" class="text-xs text-muted-foreground italic border-t pt-2">
                            "{{ kpi.managerComment }}"
                        </div>
                    </CardContent>
                </Card>
            </div>

            <!-- Generate Review -->
            <div v-if="canManage" class="flex gap-3 items-center">
                <Button @click="generateReview" :disabled="saving || !weightOk" class="gap-2">
                    <RefreshCw class="size-4" :class="{ 'animate-spin': saving }" />
                    Generate Performance Review
                </Button>
                <p v-if="!weightOk" class="text-xs text-red-500">KPI weights must total 100% first</p>
            </div>

            <!-- Performance Reviews -->
            <div v-if="empReviews.length" class="space-y-4">
                <h2 class="font-semibold">Performance Reviews</h2>
                <div v-for="review in empReviews" :key="review.id"
                    class="border rounded-xl p-4 space-y-4">
                    <!-- Overall Score -->
                    <div class="flex items-center gap-4">
                        <div class="text-center">
                            <p class="text-4xl font-black">{{ review.overallScore }}%</p>
                            <p class="text-xs text-muted-foreground">{{ review.period }}</p>
                        </div>
                        <div class="flex-1">
                            <div class="flex items-center justify-between mb-1">
                                <span class="font-semibold" :class="getRatingColor(review.rating)">{{ review.rating }}</span>
                                <span class="text-xs text-muted-foreground">
                                    {{ review.generatedAt?.toDate?.()?.toLocaleDateString() || '' }}
                                </span>
                            </div>
                            <div class="w-full bg-muted rounded-full h-3">
                                <div class="h-3 rounded-full transition-all" :class="scoreBar(review.overallScore)"
                                    :style="{ width: review.overallScore + '%' }" />
                            </div>
                        </div>
                    </div>

                    <!-- KPI Breakdown Table -->
                    <table class="w-full text-xs border rounded-lg overflow-hidden">
                        <thead class="bg-muted/30 border-b">
                            <tr>
                                <th class="text-left px-3 py-2 font-semibold">KPI</th>
                                <th class="text-center px-3 py-2 font-semibold">Weight</th>
                                <th class="text-center px-3 py-2 font-semibold">Target</th>
                                <th class="text-center px-3 py-2 font-semibold">Score</th>
                                <th class="text-center px-3 py-2 font-semibold">Weighted</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="ks in review.kpiScores" :key="ks.kpiId" class="border-b last:border-0">
                                <td class="px-3 py-2 font-medium">{{ ks.kpiName }}</td>
                                <td class="px-3 py-2 text-center">{{ ks.weight }}%</td>
                                <td class="px-3 py-2 text-center">{{ ks.targetValue }}%</td>
                                <td class="px-3 py-2 text-center font-bold">{{ ks.actualScore }}%</td>
                                <td class="px-3 py-2 text-center">{{ ks.weightedScore.toFixed(2) }}</td>
                            </tr>
                        </tbody>
                    </table>

                    <!-- Manager Comments -->
                    <div v-if="canManage" class="space-y-2 border-t pt-3">
                        <p class="text-xs font-semibold">Manager Comments</p>
                        <Textarea
                            :modelValue="review.managerComments || ''"
                            @update:modelValue="(v: string | number) => commentText = String(v)"
                            :placeholder="review.managerComments || 'Add comments…'"
                            class="min-h-[60px] text-xs" />
                        <Button size="sm" variant="outline" class="text-xs h-7"
                            @click="saveComment(review.id!)">Save Comment</Button>
                    </div>
                    <div v-else-if="review.managerComments" class="text-xs text-muted-foreground italic border-t pt-2">
                        Manager: "{{ review.managerComments }}"
                    </div>
                </div>
            </div>
        </div>

        <!-- KPI Dialog -->
        <Dialog v-model:open="showKpiDialog">
            <DialogContent class="w-[95vw] max-w-none">
                <DialogHeader>
                    <DialogTitle>{{ editingKpiId ? 'Edit KPI' : 'Add KPI' }}</DialogTitle>
                </DialogHeader>
                <div class="space-y-4 py-2">
                    <div class="space-y-1">
                        <label class="text-xs font-medium">KPI Name *</label>
                        <Input v-model="kpiForm.name" placeholder="e.g. On-Time Delivery" />
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div class="space-y-1">
                            <label class="text-xs font-medium">Target Value (%)</label>
                            <Input v-model.number="kpiForm.targetValue" type="number" min="0" max="100" />
                        </div>
                        <div class="space-y-1">
                            <label class="text-xs font-medium">Weight (%)</label>
                            <Input v-model.number="kpiForm.weight" type="number" min="0" max="100" />
                        </div>
                    </div>
                    <div class="space-y-1">
                        <label class="text-xs font-medium">Period</label>
                        <Select v-model="kpiForm.period">
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Monthly">Monthly</SelectItem>
                                <SelectItem value="Quarterly">Quarterly</SelectItem>
                                <SelectItem value="Annual">Annual</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" @click="showKpiDialog = false">Cancel</Button>
                    <Button @click="saveKpi" :disabled="saving || !kpiForm.name">
                        {{ saving ? 'Saving…' : 'Save KPI' }}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
</template>
