<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { 
  Building2, 
  Search, 
  Plus, 
  ChevronRight, 
  Loader2, 
  Calendar,
  Construction,
  FileText
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { useAgricJobCard } from '../composables/useAgricJobCard'

const router = useRouter()
const { subscribeJobCards, cleanup, jobCards, isProcessing: loading } = useAgricJobCard()

const search = ref('')

const filteredQuotes = computed(() => {
  return jobCards.value.filter(job => {
    if (job.status !== 'DRAFT') return false;
    const matchesSearch = job.clientName.toLowerCase().includes(search.value.toLowerCase()) || 
                          job.jobNumber.toLowerCase().includes(search.value.toLowerCase())
    return matchesSearch
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
        <h2 class="text-3xl font-bold tracking-tight text-foreground">Agric Quotations</h2>
        <p class="text-muted-foreground">List of all unapproved agricultural construction quotes.</p>
      </div>
      <Button @click="router.push('/agric-structures/fowlrun')">
        <Plus class="mr-2 h-4 w-4" /> New Quote
      </Button>
    </div>

    <!-- Filters -->
    <div class="flex items-center gap-4 flex-wrap">
      <div class="relative w-full max-w-sm">
        <Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input v-model="search" placeholder="Search by Quote or Client..." class="pl-9" />
      </div>
    </div>

    <!-- Grid List -->
    <div v-if="loading" class="flex flex-col items-center justify-center py-40 gap-4">
      <Loader2 class="size-8 animate-spin text-primary" />
      <p class="text-sm text-muted-foreground">Loading Quotations...</p>
    </div>

    <div v-else-if="filteredQuotes.length === 0" class="text-center py-40 border-2 border-dashed rounded-xl">
       <FileText class="size-12 text-muted-foreground/30 mx-auto mb-4" />
       <p class="text-muted-foreground font-medium">No draft quotations found.</p>
       <Button variant="link" class="mt-2" @click="search = ''">Clear Search</Button>
    </div>

    <div v-else class="grid gap-4">
       <Card 
         v-for="quote in filteredQuotes" 
         :key="quote.id" 
         class="group hover:border-primary/50 transition-all cursor-pointer overflow-hidden"
         @click="router.push(`/agric-structures/job-cards/${quote.id}`)"
       >
          <CardContent class="p-0">
             <div class="flex flex-col md:flex-row items-stretch md:items-center">
                <!-- Color Bar -->
                <div class="w-1.5 self-stretch bg-orange-500/20 group-hover:bg-orange-500 transition-colors"></div>
                
                <div class="flex-1 p-5 grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                   <!-- Main Info -->
                   <div class="col-span-1 md:col-span-1 space-y-1">
                      <div class="flex items-center gap-2">
                         <span class="text-xs font-bold text-orange-600">{{ quote.jobNumber }}</span>
                         <Badge variant="outline" class="text-[10px] leading-none py-0 px-1">{{ quote.status }}</Badge>
                      </div>
                      <h3 class="font-bold text-lg group-hover:text-primary transition-colors">{{ quote.clientName }}</h3>
                   </div>

                   <!-- Specs -->
                   <div class="flex items-center gap-6 text-muted-foreground">
                      <div class="flex items-center gap-1.5">
                         <Building2 class="size-4" />
                         <span class="text-sm font-medium">{{ quote.fowlrunMeta?.size?.label }}</span>
                      </div>
                      <div class="flex items-center gap-1.5">
                         <Calendar class="size-4" />
                         <span class="text-sm font-medium">{{ quote.createdAt?.toDate?.()?.toLocaleDateString() || 'N/A' }}</span>
                      </div>
                   </div>

                   <!-- Financials -->
                   <div class="md:text-right space-y-0.5">
                      <p class="text-xs text-muted-foreground font-medium uppercase">Quotation Value</p>
                      <p class="text-lg font-black">${{ quote.totalAmount.toLocaleString() }}</p>
                   </div>

                   <!-- Payment Status -->
                   <div class="flex items-center justify-end gap-4">
                      <ChevronRight class="size-5 text-muted-foreground group-hover:text-primary transition-all group-hover:translate-x-1" />
                   </div>
                </div>
             </div>
          </CardContent>
       </Card>
    </div>
  </div>
</template>
