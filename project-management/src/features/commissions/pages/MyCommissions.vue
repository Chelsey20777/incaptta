<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useCommissionsStore } from '../store/commissionsStore'
import { useSession } from '@/composables/useSession'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { TrendingUp, Clock, Wallet, Loader2 } from 'lucide-vue-next'
import MyCommissionsTable from '../components/MyCommissionsTable.vue'

const { user } = useSession()
const store = useCommissionsStore()
const { commissions, loading } = storeToRefs(store)

const earnings = computed(() => {
  const total = commissions.value.reduce((acc, c) => acc + (c.amount || 0), 0)
  const pending = commissions.value.filter(c => c.status === 'PENDING').reduce((acc, c) => acc + (c.amount || 0), 0)
  const paid = commissions.value.filter(c => c.status === 'PAID').reduce((acc, c) => acc + (c.amount || 0), 0)
  return { total, pending, paid }
})

onMounted(() => {
  if (user.value) {
    store.fetchMyCommissions(user.value.uid)
  }
})

onUnmounted(() => {
  store.cleanup()
})

</script>

<template>
  <div v-if="loading" class="h-[400px] flex items-center justify-center">
    <Loader2 class="size-8 animate-spin text-primary" />
  </div>
  <div v-else class="space-y-8 p-8 pt-6">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-3xl font-bold tracking-tight text-foreground">My Commissions</h2>
        <p class="text-muted-foreground">Track your performance and earned incentives.</p>
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-3">
      <Card class="bg-card shadow-sm border-none ring-1 ring-border">
        <CardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle class="text-sm font-medium">Total Earned</CardTitle>
          <TrendingUp class="size-4 text-emerald-500" />
        </CardHeader>
        <CardContent>
          <div class="text-2xl font-bold font-mono">${{ earnings.total.toLocaleString() }}</div>
        </CardContent>
      </Card>
      <Card class="bg-card shadow-sm border-none ring-1 ring-border">
        <CardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle class="text-sm font-medium">Pending Payout</CardTitle>
          <Clock class="size-4 text-amber-500" />
        </CardHeader>
        <CardContent>
          <div class="text-2xl font-bold font-mono text-amber-600">${{ earnings.pending.toLocaleString() }}</div>
        </CardContent>
      </Card>
      <Card class="bg-card shadow-sm border-none ring-1 ring-border">
        <CardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle class="text-sm font-medium">Paid to Date</CardTitle>
          <Wallet class="size-4 text-blue-500" />
        </CardHeader>
        <CardContent>
          <div class="text-2xl font-bold font-mono text-emerald-600">${{ earnings.paid.toLocaleString() }}</div>
        </CardContent>
      </Card>
    </div>

    <MyCommissionsTable :commissions="commissions" />
  </div>
</template>
