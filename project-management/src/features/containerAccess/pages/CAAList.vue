<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, Eye, Loader2, ShieldCheck } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { useSession } from '@/composables/useSession'
import { useContainerAccessStore } from '../store/containerAccessStore'
import type { CAAStatus } from '../types'

const router = useRouter()
const store = useContainerAccessStore()
const { user, hasAnyRole } = useSession()

const searchQuery = ref('')
const statusFilter = ref<CAAStatus | 'ALL'>('ALL')

onMounted(() => {
    store.fetchRequests()
    store.fetchLogs()
})

onUnmounted(() => {
    store.cleanup()
})

// ── Filtered requests ─────────────────────────────────────────────────────

const filteredRequests = computed(() => {
    let list = store.requests

    // Non-managers only see their own requests
    if (!hasAnyRole(['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'DIRECTOR'])) {
        list = list.filter((r) => r.requestedByUid === user.value?.uid)
    }

    if (statusFilter.value !== 'ALL') {
        list = list.filter((r) => r.status === statusFilter.value)
    }

    if (searchQuery.value.trim()) {
        const q = searchQuery.value.toLowerCase()
        list = list.filter(
            (r) =>
                r.requestNumber.toLowerCase().includes(q) ||
                r.containerName.toLowerCase().includes(q) ||
                r.requestedByName.toLowerCase().includes(q)
        )
    }

    return list
})

// ── Status helpers ────────────────────────────────────────────────────────

function statusClass(status: string) {
    switch (status) {
        case 'PENDING':    return 'bg-yellow-100 text-yellow-800 border border-yellow-200'
        case 'APPROVED':   return 'bg-green-100 text-green-800 border border-green-200'
        case 'REJECTED':   return 'bg-red-100 text-red-800 border border-red-200'
        case 'CANCELLED':  return 'bg-gray-100 text-gray-600 border border-gray-200'
        default:           return 'bg-gray-100 text-gray-600 border border-gray-200'
    }
}

function actionClass(action: string) {
    switch (action) {
        case 'REQUEST_SUBMITTED':  return 'bg-blue-100 text-blue-800'
        case 'APPROVED':           return 'bg-green-100 text-green-800'
        case 'REJECTED':           return 'bg-red-100 text-red-800'
        case 'CANCELLED':          return 'bg-gray-100 text-gray-600'
        case 'CONTAINER_ACCESSED': return 'bg-purple-100 text-purple-800'
        default:                   return 'bg-gray-100 text-gray-600'
    }
}

function formatTs(ts: any): string {
    if (!ts) return '—'
    const d = ts?.toDate ? ts.toDate() : new Date(ts)
    return d.toLocaleString()
}
</script>

<template>
    <div class="p-4 md:p-6">
        <!-- Page header -->
        <div class="flex items-center justify-between mb-6">
            <div class="flex items-center gap-2">
                <ShieldCheck class="h-6 w-6 text-primary" />
                <div>
                    <h1 class="text-xl font-semibold">Container Access Authorization</h1>
                    <p class="text-sm text-muted-foreground">Request and manage physical container access</p>
                </div>
            </div>
            <Button class="gap-1.5" @click="router.push('/container-access/new')">
                <Plus class="h-4 w-4" />
                New Request
            </Button>
        </div>

        <Tabs default-value="requests">
            <TabsList class="mb-4">
                <TabsTrigger value="requests">Access Requests</TabsTrigger>
                <TabsTrigger value="logs">Access Logs</TabsTrigger>
            </TabsList>

            <!-- ── Tab 1: Requests ─────────────────────────────────────────── -->
            <TabsContent value="requests">
                <Card>
                    <CardHeader>
                        <div class="flex flex-col sm:flex-row gap-3">
                            <Input
                                v-model="searchQuery"
                                placeholder="Search by request #, container, or requestor..."
                                class="max-w-xs"
                            />
                            <Select v-model="statusFilter">
                                <SelectTrigger class="w-40">
                                    <SelectValue placeholder="All Statuses" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">All Statuses</SelectItem>
                                    <SelectItem value="PENDING">Pending</SelectItem>
                                    <SelectItem value="APPROVED">Approved</SelectItem>
                                    <SelectItem value="REJECTED">Rejected</SelectItem>
                                    <SelectItem value="CANCELLED">Cancelled</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </CardHeader>

                    <CardContent>
                        <div v-if="store.loading" class="flex justify-center py-12">
                            <Loader2 class="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>

                        <div v-else-if="filteredRequests.length === 0" class="text-center py-12 text-muted-foreground text-sm">
                            No access requests found.
                        </div>

                        <div v-else class="overflow-x-auto">
                            <table class="w-full text-sm">
                                <thead>
                                    <tr class="border-b text-xs text-muted-foreground">
                                        <th class="text-left py-2 pr-4 font-medium">Request #</th>
                                        <th class="text-left py-2 pr-4 font-medium">Container</th>
                                        <th class="text-left py-2 pr-4 font-medium">Requestor</th>
                                        <th class="text-left py-2 pr-4 font-medium">Access Date</th>
                                        <th class="text-left py-2 pr-4 font-medium">Status</th>
                                        <th class="text-left py-2 font-medium">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr
                                        v-for="req in filteredRequests"
                                        :key="req.id"
                                        class="border-b last:border-0 hover:bg-muted/30"
                                    >
                                        <td class="py-2.5 pr-4 font-mono text-xs font-medium">{{ req.requestNumber }}</td>
                                        <td class="py-2.5 pr-4">
                                            <p class="font-medium">{{ req.containerName }}</p>
                                            <p class="text-xs text-muted-foreground">{{ req.containerLocation }}</p>
                                        </td>
                                        <td class="py-2.5 pr-4">
                                            <p>{{ req.requestedByName }}</p>
                                            <p class="text-xs text-muted-foreground">{{ req.requestedByRole }}</p>
                                        </td>
                                        <td class="py-2.5 pr-4 whitespace-nowrap">{{ req.accessDate }}</td>
                                        <td class="py-2.5 pr-4">
                                            <span class="text-xs font-semibold px-2 py-0.5 rounded-full" :class="statusClass(req.status)">
                                                {{ req.status }}
                                            </span>
                                        </td>
                                        <td class="py-2.5">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                class="h-7 w-7 p-0"
                                                @click="router.push(`/container-access/${req.id}`)"
                                            >
                                                <Eye class="h-4 w-4" />
                                            </Button>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            </TabsContent>

            <!-- ── Tab 2: Access Logs ──────────────────────────────────────── -->
            <TabsContent value="logs">
                <Card>
                    <CardHeader>
                        <CardTitle class="text-base">All Container Access Logs</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div v-if="store.logsLoading" class="flex justify-center py-12">
                            <Loader2 class="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>

                        <div v-else-if="store.logs.length === 0" class="text-center py-12 text-muted-foreground text-sm">
                            No access log entries yet.
                        </div>

                        <div v-else class="overflow-x-auto">
                            <table class="w-full text-sm">
                                <thead>
                                    <tr class="border-b text-xs text-muted-foreground">
                                        <th class="text-left py-2 pr-4 font-medium">Date / Time</th>
                                        <th class="text-left py-2 pr-4 font-medium">Request #</th>
                                        <th class="text-left py-2 pr-4 font-medium">Container</th>
                                        <th class="text-left py-2 pr-4 font-medium">User</th>
                                        <th class="text-left py-2 pr-4 font-medium">Role</th>
                                        <th class="text-left py-2 pr-4 font-medium">Action</th>
                                        <th class="text-left py-2 font-medium">Notes</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr
                                        v-for="log in store.logs"
                                        :key="log.id"
                                        class="border-b last:border-0 hover:bg-muted/30"
                                    >
                                        <td class="py-2.5 pr-4 whitespace-nowrap">{{ formatTs(log.loggedAt) }}</td>
                                        <td class="py-2.5 pr-4 font-mono text-xs">{{ log.requestNumber }}</td>
                                        <td class="py-2.5 pr-4">{{ log.containerName }}</td>
                                        <td class="py-2.5 pr-4">{{ log.loggedByName }}</td>
                                        <td class="py-2.5 pr-4">{{ log.loggedByRole }}</td>
                                        <td class="py-2.5 pr-4">
                                            <span class="text-xs font-semibold px-2 py-0.5 rounded-full" :class="actionClass(log.action)">
                                                {{ log.action.replace(/_/g, ' ') }}
                                            </span>
                                        </td>
                                        <td class="py-2.5 text-muted-foreground">{{ log.notes || '—' }}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>
    </div>
</template>
