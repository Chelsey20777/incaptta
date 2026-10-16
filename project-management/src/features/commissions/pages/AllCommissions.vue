<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useCommissionsStore } from '../store/commissionsStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, Download, Loader2 } from 'lucide-vue-next'
import CommissionsTable from '../components/CommissionsTable.vue'

const store = useCommissionsStore()
const { commissions, loading } = storeToRefs(store)

onMounted(() => {
  store.fetchAllCommissions()
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
        <h2 class="text-3xl font-bold tracking-tight text-foreground">All Commissions</h2>
        <p class="text-muted-foreground">Manage and approve sales incentives.</p>
      </div>
      <Button variant="outline" size="sm" class="shadow-sm">
        <Download class="mr-2 size-4" />
        Export CSV
      </Button>
    </div>

    <div class="flex items-center gap-2">
      <div class="relative flex-1 max-w-sm">
        <Search class="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input placeholder="Search sales rep..." class="pl-8 bg-card shadow-sm border-none ring-1 ring-border" />
      </div>
    </div>

    <CommissionsTable :commissions="commissions" />
  </div>
</template>
