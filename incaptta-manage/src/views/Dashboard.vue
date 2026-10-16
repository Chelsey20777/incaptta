<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSession } from '@/composables/useSession'
import BrandLogo from '@/components/BrandLogo.vue'
import { useFinanceStore } from '@/stores/financeStore'
import { storeToRefs } from 'pinia'
import { 
  Briefcase, 
  Wallet, 
  Users, 
  Package, 
  UserCircle, 
  Calculator,
  Landmark,
  Coins,
  Smartphone,
  ClipboardList,
  ShieldCheck
} from 'lucide-vue-next'

const router = useRouter()
const { user } = useSession()
const finStore = useFinanceStore()

const { finalBalances: balances } = storeToRefs(finStore)

const fmt = (n?: number | null) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(n || 0)
}

onMounted(() => {
  finStore.fetchExpenses()
  finStore.fetchTransfers()
  finStore.fetchJobPayments()
  finStore.fetchTopUps()
  finStore.fetchSalariesTransactions()
  finStore.fetchHistoricalInventoryConsumption()
})

onUnmounted(() => {
  finStore.cleanup()
})

const tiles = [
  { name: 'Job Cards', route: '/job-cards', icon: Briefcase, color: 'text-[#ff8903]', bg: 'bg-[#ff8903]/10' },
  { name: 'Finance', route: '/finance', icon: Wallet, color: 'text-[#79c21b]', bg: 'bg-[#79c21b]/10' },
  { name: 'CRM', route: '/crm', icon: Users, color: 'text-[#ff8903]', bg: 'bg-[#ff8903]/10' },
  { name: 'Inventory', route: '/inventory', icon: Package, color: 'text-[#79c21b]', bg: 'bg-[#79c21b]/10' },
  { name: 'HR', route: '/hr', icon: UserCircle, color: 'text-[#ff8903]', bg: 'bg-[#ff8903]/10' },
  { name: 'Accounting', route: '/accounting', icon: Calculator, color: 'text-[#79c21b]', bg: 'bg-[#79c21b]/10' },
  { name: 'OpEx', route: '/opex', icon: Landmark, color: 'text-[#79c21b]', bg: 'bg-[#79c21b]/10' },
  { name: 'Auto Approvals', route: '/auto-approvals', icon: ShieldCheck, color: 'text-[#ff8903]', bg: 'bg-[#ff8903]/10' },
]
</script>

<template>
  <div class="flex-1 flex flex-col min-h-screen bg-background">
    <!-- Header -->
    <header class="p-6 pb-2 border-b-0 bg-transparent flex items-center justify-between z-10">
      <div class="flex items-center gap-3">
        <div class="size-10 rounded-xl bg-primary/10 flex items-center justify-center p-2 shadow-sm">
          <BrandLogo />
        </div>
        <div>
          <h1 class="text-2xl font-black tracking-tight">
            <span class="text-[#79c21b]">INCAPTTA</span><span class="text-[#ff8903]">PRO</span>
          </h1>
          <p class="text-[10px] font-black text-muted-foreground uppercase tracking-widest mt-0.5">Manager Portal</p>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <div class="size-10 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20 shadow-sm">
          <span class="text-primary font-bold text-lg">{{ user?.displayName?.charAt(0) || 'M' }}</span>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="flex-1 p-6 flex flex-col items-center justify-start overflow-y-auto pt-4 pb-12">
      <!-- Treasure Balances (Account Balances) -->
      <div class="w-full max-w-md mb-6">
        <div class="flex items-center justify-between mb-3 px-1">
          <h2 class="text-xs font-black uppercase tracking-wider text-muted-foreground">Treasure Balances</h2>
          <span class="text-[9px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full uppercase tracking-wider">Live</span>
        </div>
        
        <div class="flex gap-3 overflow-x-auto pb-3 snap-x no-scrollbar">
          <!-- BANK CARD -->
          <div class="min-w-[150px] flex-1 snap-start p-4 rounded-3xl bg-card border border-border/40 shadow-sm flex flex-col justify-between hover:border-amber-500/35 transition-colors">
            <div class="flex justify-between items-start">
              <span class="text-[9px] font-black uppercase text-amber-500 tracking-wider">Bank</span>
              <Landmark class="size-4 text-amber-500" />
            </div>
            <div class="mt-4">
              <p class="text-lg font-black tracking-tight text-foreground">{{ fmt(balances.BANK) }}</p>
              <p class="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Current Balance</p>
            </div>
          </div>

          <!-- CASH CARD -->
          <div class="min-w-[150px] flex-1 snap-start p-4 rounded-3xl bg-card border border-border/40 shadow-sm flex flex-col justify-between hover:border-[#79c21b]/35 transition-colors">
            <div class="flex justify-between items-start">
              <span class="text-[9px] font-black uppercase text-[#79c21b] tracking-wider">Cash</span>
              <Coins class="size-4 text-[#79c21b]" />
            </div>
            <div class="mt-4">
              <p class="text-lg font-black tracking-tight text-foreground">{{ fmt(balances.CASH) }}</p>
              <p class="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Current Balance</p>
            </div>
          </div>

          <!-- ECOCASH CARD -->
          <div class="min-w-[150px] flex-1 snap-start p-4 rounded-3xl bg-card border border-border/40 shadow-sm flex flex-col justify-between hover:border-[#ff8903]/35 transition-colors">
            <div class="flex justify-between items-start">
              <span class="text-[9px] font-black uppercase text-[#ff8903] tracking-wider">Ecocash</span>
              <Smartphone class="size-4 text-[#ff8903]" />
            </div>
            <div class="mt-4">
              <p class="text-lg font-black tracking-tight text-foreground">{{ fmt(balances.ECOCASH) }}</p>
              <p class="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Current Balance</p>
            </div>
          </div>

          <!-- IRD CARD -->
          <div class="min-w-[150px] flex-1 snap-start p-4 rounded-3xl bg-card border border-border/40 shadow-sm flex flex-col justify-between hover:border-red-500/35 transition-colors">
            <div class="flex justify-between items-start">
              <span class="text-[9px] font-black uppercase text-red-500 tracking-wider">IRD Account</span>
              <ClipboardList class="size-4 text-red-500" />
            </div>
            <div class="mt-4">
              <p class="text-lg font-black tracking-tight text-foreground">{{ fmt(balances.IRD) }}</p>
              <p class="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Current Balance</p>
            </div>
          </div>

          <!-- SALARIES CARD -->
          <div class="min-w-[150px] flex-1 snap-start p-4 rounded-3xl bg-card border border-border/40 shadow-sm flex flex-col justify-between hover:border-emerald-500/35 transition-colors">
            <div class="flex justify-between items-start">
              <span class="text-[9px] font-black uppercase text-emerald-500 tracking-wider">Salaries Account</span>
              <Landmark class="size-4 text-emerald-500" />
            </div>
            <div class="mt-4">
              <p class="text-lg font-black tracking-tight text-foreground">{{ fmt(balances.SALARIES) }}</p>
              <p class="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Current Balance</p>
            </div>
          </div>

          <!-- CREDIT CARD -->
          <div class="min-w-[150px] flex-1 snap-start p-4 rounded-3xl bg-card border border-border/40 shadow-sm flex flex-col justify-between hover:border-blue-500/35 transition-colors">
            <div class="flex justify-between items-start">
              <span class="text-[9px] font-black uppercase text-blue-500 tracking-wider">Customer Credit</span>
              <Wallet class="size-4 text-blue-500" />
            </div>
            <div class="mt-4">
              <p class="text-lg font-black tracking-tight text-foreground">{{ fmt(balances.CREDIT) }}</p>
              <p class="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Current Balance</p>
            </div>
          </div>

          <!-- INVENTORY CARD -->
          <div class="min-w-[150px] flex-1 snap-start p-4 rounded-3xl bg-card border border-border/40 shadow-sm flex flex-col justify-between hover:border-purple-500/35 transition-colors">
            <div class="flex justify-between items-start">
              <span class="text-[9px] font-black uppercase text-purple-500 tracking-wider">Inventory Consumption</span>
              <Package class="size-4 text-purple-500" />
            </div>
            <div class="mt-4">
              <p class="text-lg font-black tracking-tight text-foreground">{{ fmt(Math.abs(balances.INVENTORY || 0)) }}</p>
              <p class="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Current Balance</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Navigation Grid Tiles -->
      <div class="w-full max-w-md grid grid-cols-2 gap-4">
        <button
          v-for="tile in tiles"
          :key="tile.name"
          @click="router.push(tile.route)"
          class="flex flex-col items-center justify-center p-6 rounded-3xl bg-card border border-border/40 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 active:scale-95 group"
        >
          <div :class="['size-14 rounded-2xl flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110 shadow-inner', tile.bg, tile.color]">
            <component :is="tile.icon" class="size-7" />
          </div>
          <span class="text-sm font-black tracking-tight text-foreground">{{ tile.name }}</span>
        </button>
      </div>
    </main>
  </div>
</template>

<style scoped>
/* Mobile specific smooth active state */
button {
  -webkit-tap-highlight-color: transparent;
}
</style>
