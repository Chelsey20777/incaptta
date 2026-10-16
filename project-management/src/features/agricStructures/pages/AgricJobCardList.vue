<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { 
  Building2, 
  Search, 
  Filter, 
  Plus, 
  ChevronRight, 
  Loader2, 
  Calendar,
  Construction,
  User,
  ArrowUpDown
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { useAgricJobCard } from '../composables/useAgricJobCard'
import { toast } from 'vue-sonner'

const router = useRouter()
const { subscribeJobCards, cleanup, jobCards, isProcessing: loading } = useAgricJobCard()

const search = ref('')
const statusFilter = ref('all')

const filteredJobs = computed(() => {
  return jobCards.value.filter(job => {
    const matchesSearch = job.clientName.toLowerCase().includes(search.value.toLowerCase()) || 
                          job.jobNumber.toLowerCase().includes(search.value.toLowerCase())
    const matchesStatus = statusFilter.value === 'all' || job.status === statusFilter.value
    return matchesSearch && matchesStatus
  })
})

onMounted(() => {
  subscribeJobCards()
})

onUnmounted(() => {
  cleanup()
})
</script>

<template>
  <div class="space-y-6 p-8 pt-6">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-3xl font-bold tracking-tight text-foreground">Agric Projects</h2>
        <p class="text-muted-foreground">List of all agricultural construction job cards.</p>
      </div>
      <Button @click="router.push('/agric-structures/fowlrun')">
        <Plus class="mr-2 h-4 w-4" /> New Project
      </Button>
    </div>

    <!-- Filters -->
    <div class="flex items-center gap-4 flex-wrap">
      <div class="relative w-full max-w-sm">
        <Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input v-model="search" placeholder="Search by Project or Client..." class="pl-9" />
      </div>
      
      <div class="flex items-center gap-2">
         <Badge 
           v-for="s in ['all', 'DRAFT', 'APPROVED', 'PAID', 'COMPLETED']" 
           :key="s"
           variant="outline"
           class="cursor-pointer transition-colors"
           :class="statusFilter === s ? 'bg-primary text-white border-primary' : 'hover:bg-muted'"
           @click="statusFilter = s"
         >
            {{ s }}
         </Badge>
      </div>
    </div>

    <!-- Grid List -->
    <div v-if="loading" class="flex flex-col items-center justify-center py-40 gap-4">
      <Loader2 class="size-8 animate-spin text-primary" />
      <p class="text-sm text-muted-foreground">Loading Job Cards...</p>
    </div>

    <div v-else-if="filteredJobs.length === 0" class="text-center py-40 border-2 border-dashed rounded-xl">
       <Construction class="size-12 text-muted-foreground/30 mx-auto mb-4" />
       <p class="text-muted-foreground font-medium">No projects found matching filters.</p>
       <Button variant="link" class="mt-2" @click="search = ''; statusFilter = 'all'">Clear Filters</Button>
    </div>

    <div v-else class="grid gap-4">
       <Card 
         v-for="job in filteredJobs" 
         :key="job.id" 
         class="group hover:border-primary/50 transition-all cursor-pointer overflow-hidden"
         @click="router.push(`/agric-structures/job-cards/${job.id}`)"
       >
          <CardContent class="p-0">
             <div class="flex flex-col md:flex-row items-stretch md:items-center">
                <!-- Color Bar -->
                <div class="w-1.5 self-stretch bg-primary/20 group-hover:bg-primary transition-colors"></div>
                
                <div class="flex-1 p-5 grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                   <!-- Main Info -->
                   <div class="col-span-1 md:col-span-1 space-y-1">
                      <div class="flex items-center gap-2">
                         <span class="text-xs font-bold text-primary">{{ job.jobNumber }}</span>
                         <Badge variant="outline" class="text-[10px] leading-none py-0 px-1">{{ job.status }}</Badge>
                      </div>
                      <h3 class="font-bold text-lg group-hover:text-primary transition-colors">{{ job.clientName }}</h3>
                   </div>

                   <!-- Specs -->
                   <div class="flex items-center gap-6 text-muted-foreground">
                      <div class="flex items-center gap-1.5">
                         <Building2 class="size-4" />
                         <span class="text-sm font-medium">{{ job.fowlrunMeta?.size?.label }}</span>
                      </div>
                      <div class="flex items-center gap-1.5">
                         <Calendar class="size-4" />
                         <span class="text-sm font-medium">{{ job.createdAt?.toDate?.()?.toLocaleDateString() || 'N/A' }}</span>
                      </div>
                   </div>

                   <!-- Financials -->
                   <div class="md:text-right space-y-0.5">
                      <p class="text-xs text-muted-foreground font-medium uppercase">Contract Value</p>
                      <p class="text-lg font-black">${{ job.totalAmount.toLocaleString() }}</p>
                   </div>

                   <!-- Payment Status -->
                   <div class="flex items-center justify-end gap-4">
                      <div class="text-right">
                         <p class="text-xs text-muted-foreground font-medium uppercase">Balance</p>
                         <p class="font-bold" :class="job.balance > 0 ? 'text-rose-600' : 'text-green-600'">
                            ${{ job.balance.toLocaleString() }}
                         </p>
                      </div>
                      <ChevronRight class="size-5 text-muted-foreground group-hover:text-primary transition-all group-hover:translate-x-1" />
                   </div>
                </div>
             </div>
          </CardContent>
       </Card>
    </div>
  </div>
</template>
