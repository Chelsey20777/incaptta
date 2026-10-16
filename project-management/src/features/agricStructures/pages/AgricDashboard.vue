<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { 
  Building2, 
  TrendingUp, 
  Users, 
  DollarSign, 
  Plus, 
  Settings2, 
  ArrowRight,
  PackageSearch,
  ChevronRight,
  Loader2,
  Construction,
  FileText
} from 'lucide-vue-next'
import { useSession } from '@/composables/useSession'
import { useAgricRates } from '../composables/useAgricRates'
import { useAgricJobCard } from '../composables/useAgricJobCard'
import { toast } from 'vue-sonner'

const router = useRouter()
const { hasAnyRole } = useSession()
const { rates, updateRates, loading: loadingRates } = useAgricRates()
const { subscribeJobCards, cleanup, jobCards, isProcessing: loadingJobs } = useAgricJobCard()

const canEditRates = computed(() => hasAnyRole(['ADMIN', 'MANAGER', 'SUPER_ADMIN']))

const stats = computed(() => {
  const totalValue = jobCards.value.reduce((s, j) => s + (j.totalAmount || 0), 0)
  const totalPaid = jobCards.value.reduce((s, j) => s + (j.paidAmount || 0), 0)
  const totalCapacity = jobCards.value.reduce((s, j) => s + (j.fowlrunMeta?.birdCapacityMax || 0), 0)
  
  return {
    count: jobCards.value.length,
    value: totalValue,
    paid: totalPaid,
    balance: totalValue - totalPaid,
    capacity: totalCapacity
  }
})

async function handleSaveRates() {
  try {
    await updateRates(rates.value)
  } catch (err) {
    // Error handled in composable
  }
}

onMounted(() => {
  subscribeJobCards()
})

onUnmounted(() => {
  cleanup()
})
</script>

<template>
  <div class="space-y-8 p-8 pt-6 pb-20">
    <!-- Header -->
    <div class="flex items-center justify-between space-y-2">
      <div>
        <h2 class="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <Building2 class="size-8 text-primary" />
          Agric Structures
        </h2>
        <p class="text-muted-foreground">
          Dedicated management for poultry houses and agricultural construction projects.
        </p>
      </div>
      <div class="flex items-center space-x-2">
        <Button @click="router.push('/agric-structures/fowlrun')">
          <Plus class="mr-2 h-4 w-4" /> New Calculation
        </Button>
      </div>
    </div>

    <!-- Stats Grid -->
    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card class="bg-primary/5 border-primary/10">
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle class="text-sm font-medium">Active Projects</CardTitle>
          <Construction class="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent>
          <div class="text-2xl font-bold">{{ stats.count }}</div>
          <p class="text-xs text-muted-foreground">Total records in system</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle class="text-sm font-medium">Total Contract Value</CardTitle>
          <DollarSign class="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div class="text-2xl font-bold">${{ stats.value.toLocaleString() }}</div>
          <p class="text-xs text-muted-foreground">Combined projects total</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle class="text-sm font-medium">Total Bird Capacity</CardTitle>
          <TrendingUp class="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div class="text-2xl font-bold">{{ stats.capacity.toLocaleString() }}</div>
          <p class="text-xs text-muted-foreground">Max cumulative bird space</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle class="text-sm font-medium">Outstanding Balances</CardTitle>
          <Users class="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div class="text-2xl font-bold text-destructive">${{ stats.balance.toLocaleString() }}</div>
          <p class="text-xs text-muted-foreground">${{ stats.paid.toLocaleString() }} collected</p>
        </CardContent>
      </Card>
    </div>

    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
      <!-- Rates Management (Left Col - 3) -->
      <Card class="col-span-3">
        <CardHeader>
          <div class="flex items-center justify-between">
            <div class="space-y-1">
              <CardTitle class="flex items-center gap-2">
                <Settings2 class="size-4 text-primary" />
                Construction Rates
              </CardTitle>
              <CardDescription>
                Base material prices used for all new calculations.
              </CardDescription>
            </div>
            <div v-if="loadingRates">
               <Loader2 class="size-4 animate-spin text-primary" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div v-if="!canEditRates" class="bg-muted/50 p-4 rounded-lg flex items-start gap-3">
            <Settings2 class="size-5 text-muted-foreground mt-0.5" />
            <div class="text-sm">
               <p class="font-medium">View Only Mode</p>
               <p class="text-muted-foreground mt-1">Rates are managed by Administrators and Managers only.</p>
            </div>
          </div>
          
          <div class="space-y-4 pt-2">
             <div class="grid grid-cols-2 gap-4">
                <div class="space-y-2">
                   <label class="text-xs font-semibold text-muted-foreground uppercase">Brick Unit Cost ($)</label>
                   <Input v-model.number="rates.brickUnitCost" type="number" step="0.01" :disabled="!canEditRates" />
                </div>
                <div class="space-y-2">
                   <label class="text-xs font-semibold text-muted-foreground uppercase">Cement/Bag ($)</label>
                   <Input v-model.number="rates.cementUnitCost" type="number" step="0.5" :disabled="!canEditRates" />
                </div>
             </div>
             
             <div class="flex items-center justify-between p-3 border rounded-lg">
                <div class="text-sm">
                   <p class="font-medium">Labour Surcharges</p>
                   <p class="text-xs text-muted-foreground">Default to inclusive in quotes</p>
                </div>
                <input type="checkbox" v-model="rates.includeLabour" :disabled="!canEditRates" class="size-4 accent-primary" />
             </div>

             <div class="flex items-center justify-between p-3 border rounded-lg">
                <div class="text-sm">
                   <p class="font-medium">Transport Estimates</p>
                   <p class="text-xs text-muted-foreground">Include logistic scaling</p>
                </div>
                <input type="checkbox" v-model="rates.includeTransport" :disabled="!canEditRates" class="size-4 accent-primary" />
             </div>

             <Button v-if="canEditRates" @click="handleSaveRates" class="w-full mt-4" :disabled="loadingRates">
                Save Rate Config
             </Button>
          </div>
        </CardContent>
      </Card>

      <!-- Recent Projects (Right Col - 4) -->
      <Card class="col-span-4 overflow-hidden">
        <CardHeader class="flex flex-row items-center">
          <div class="grid gap-2">
            <CardTitle>Recent Job Cards</CardTitle>
            <CardDescription>
              Latest agricultural construction projects.
            </CardDescription>
          </div>
          <Button as-child size="sm" class="ml-auto gap-1" variant="ghost">
            <router-link to="/agric-structures/job-cards">
              View All
              <ArrowRight class="h-4 w-4" />
            </router-link>
          </Button>
        </CardHeader>
        <CardContent class="p-0">
          <div class="divide-y divide-border min-h-[300px]">
            <div v-if="loadingJobs" class="flex flex-col items-center justify-center h-[300px] gap-3">
               <Loader2 class="size-6 animate-spin text-primary" />
               <p class="text-sm text-muted-foreground">Loading projects...</p>
            </div>
            
            <div v-else-if="jobCards.length === 0" class="flex flex-col items-center justify-center h-[300px] gap-3">
               <PackageSearch class="size-10 text-muted-foreground/30" />
               <p class="text-sm text-muted-foreground font-medium">No projects created yet</p>
               <Button variant="outline" size="sm" @click="router.push('/agric-structures/fowlrun')">Create First Calculation</Button>
            </div>

            <div 
              v-for="job in jobCards.slice(0, 6)" 
              :key="job.id" 
              class="flex items-center justify-between p-4 hover:bg-accent/50 cursor-pointer transition-colors"
              @click="router.push(`/agric-structures/job-cards/${job.id}`)"
            >
              <div class="flex items-center gap-4">
                <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <span class="text-xs font-bold text-primary">AG</span>
                </div>
                <div class="space-y-0.5">
                  <p class="text-sm font-semibold leading-none">{{ job.jobNumber }} · {{ job.clientName }}</p>
                  <p class="text-xs text-muted-foreground">{{ job.fowlrunMeta?.size?.label || 'Custom' }} Structure</p>
                </div>
              </div>
              <div class="flex items-center gap-4 text-right">
                <div class="space-y-0.5 hidden md:block">
                  <p class="text-sm font-bold">${{ job.totalAmount.toLocaleString() }}</p>
                  <p class="text-[10px] uppercase font-bold text-primary">{{ job.status }}</p>
                </div>
                <ChevronRight class="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Quick Links -->
    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
       <div 
         class="group relative overflow-hidden rounded-xl border p-6 hover:border-primary/50 transition-all cursor-pointer"
         @click="router.push('/agric-structures/inventory')"
       >
          <div class="flex items-center gap-4">
             <div class="rounded-lg bg-orange-100 p-2 text-orange-600 group-hover:bg-orange-600 group-hover:text-white transition-colors">
                <PackageSearch class="size-6" />
             </div>
             <div>
                <h3 class="font-bold">Agric Inventory</h3>
                <p class="text-sm text-muted-foreground">Manage structural steel, roofing, and materials.</p>
             </div>
          </div>
          <ArrowRight class="absolute bottom-4 right-4 size-4 opacity-0 group-hover:opacity-100 transition-opacity" />
       </div>

       <div 
         class="group relative overflow-hidden rounded-xl border p-6 hover:border-primary/50 transition-all cursor-pointer"
         @click="router.push('/agric-structures/quotations')"
       >
          <div class="flex items-center gap-4">
             <div class="rounded-lg bg-orange-100 p-2 text-orange-600 group-hover:bg-orange-600 group-hover:text-white transition-colors">
                <FileText class="size-6" />
             </div>
             <div>
                <h3 class="font-bold">Agric Quotations</h3>
                <p class="text-sm text-muted-foreground">Manage draft construction quotes.</p>
             </div>
          </div>
          <ArrowRight class="absolute bottom-4 right-4 size-4 opacity-0 group-hover:opacity-100 transition-opacity" />
       </div>

       <div 
         class="group relative overflow-hidden rounded-xl border p-6 hover:border-primary/50 transition-all cursor-pointer"
         @click="router.push('/agric-structures/job-cards')"
       >
          <div class="flex items-center gap-4">
             <div class="rounded-lg bg-green-100 p-2 text-green-600 group-hover:bg-green-600 group-hover:text-white transition-colors">
                <Building2 class="size-6" />
             </div>
             <div>
                <h3 class="font-bold">Agric Job Cards</h3>
                <p class="text-sm text-muted-foreground">Track construction progress and payments.</p>
             </div>
          </div>
          <ArrowRight class="absolute bottom-4 right-4 size-4 opacity-0 group-hover:opacity-100 transition-opacity" />
       </div>

       <div 
         class="group relative overflow-hidden rounded-xl border p-6 hover:border-primary/50 transition-all cursor-pointer"
         @click="router.push('/agric-structures/settings')"
       >
          <div class="flex items-center gap-4">
             <div class="rounded-lg bg-slate-100 p-2 text-slate-600 group-hover:bg-brand-primary group-hover:text-white transition-colors">
                <Settings2 class="size-6" />
             </div>
             <div>
                <h3 class="font-bold">Agric Settings</h3>
                <p class="text-sm text-muted-foreground">Configure BOQ templates and rates.</p>
             </div>
          </div>
          <ArrowRight class="absolute bottom-4 right-4 size-4 opacity-0 group-hover:opacity-100 transition-opacity" />
       </div>
    </div>
  </div>
</template>
