<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useSalariesAccountStore } from '../store/salariesAccountStore'
import { useFinanceStore } from '@/features/fundTransfers/store/financeStore'
import { useSession } from '@/composables/useSession'
import { storeToRefs } from 'pinia'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Landmark, ArrowUpRight, ArrowDownRight, History, Wallet, AlertCircle, DollarSign, PlusCircle } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import HRNav from '../components/HRNav.vue'
import { toast } from 'vue-sonner'

const salariesStore = useSalariesAccountStore()
const financeStore = useFinanceStore()
const { transactions, loading } = storeToRefs(salariesStore)
const { finalBalances } = storeToRefs(financeStore)
const { user } = useSession()

onMounted(() => {
    salariesStore.fetchTransactions()
    financeStore.fetchTransfers()
    financeStore.fetchExpenses()
    financeStore.fetchJobPayments()
    financeStore.fetchTopUps()
    financeStore.fetchSalariesTransactions()
})

const currentMonth = new Date().getMonth() + 1
const currentYear = new Date().getFullYear()

const totalAccumulated = computed(() => {
    return transactions.value
        .filter(t => t.type === 'ACCUMULATION' && t.month === currentMonth && t.year === currentYear)
        .reduce((sum, t) => sum + t.amount, 0)
})

const totalPaid = computed(() => {
    return transactions.value
        .filter(t => t.type === 'PAYMENT' && t.month === currentMonth && t.year === currentYear)
        .reduce((sum, t) => sum + t.amount, 0)
})

const fundsAvailable = computed(() => finalBalances.value['SALARIES'] || 0)
const fundsNeeded = computed(() => Math.max(0, totalAccumulated.value - totalPaid.value))
const fundingGap = computed(() => Math.max(0, fundsNeeded.value - fundsAvailable.value))

const showTransferDialog = ref(false)
const transferForm = ref({
    fromAccount: 'BANK',
    amount: 0,
    reference: `Salary Funding ${currentMonth}/${currentYear}`
})

const submittingTransfer = ref(false)

async function requestTransfer() {
    if (transferForm.value.amount <= 0) {
        toast.error('Please enter a valid amount')
        return
    }

    submittingTransfer.value = true
    try {
        await financeStore.initiateTransfer({
            fromAccount: transferForm.value.fromAccount,
            toAccount: 'SALARIES',
            amount: transferForm.value.amount,
            reference: transferForm.value.reference,
            type: 'SALARY_FUNDING'
        }, {
            name: user.value?.displayName || '',
            email: user.value?.email || ''
        })
        
        toast.success('Transfer request submitted successfully')
        showTransferDialog.value = false
        transferForm.value.amount = 0
    } catch (err: any) {
        toast.error(err.message || 'Failed to submit transfer request')
    } finally {
        submittingTransfer.value = false
    }
}

function fmt(n: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function getSourceColor(source: string) {
    switch (source) {
        case 'STAFF_RATE': return 'bg-amber-500/10 text-amber-600 border-amber-500/20'
        case 'PAYROLL_NET': return 'bg-blue-500/10 text-blue-600 border-blue-500/20'
        case 'FUND_TRANSFER': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
        default: return 'bg-gray-500/10 text-gray-600 border-gray-500/20'
    }
}
</script>

<template>
    <div class="space-y-6">
        <HRNav />

        <div class="flex items-center justify-between gap-4 flex-wrap">
            <div>
                <h1 class="text-3xl font-bold tracking-tight flex items-center gap-3">
                    <div class="p-2 rounded-xl bg-primary/10 text-primary">
                        <Landmark class="size-8" />
                    </div>
                    Salaries Account
                </h1>
                <p class="text-muted-foreground mt-1">Manage payroll funding and obligations</p>
            </div>
            <Button @click="showTransferDialog = true" class="gap-2 h-12 px-6 text-base shadow-lg shadow-primary/20">
                <PlusCircle class="size-5" /> Request Transfer
            </Button>
        </div>

        <!-- Main Stats Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <!-- Funds Available -->
            <Card class="relative overflow-hidden border-none bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-xl">
                <CardContent class="p-6">
                    <div class="flex justify-between items-start">
                        <div>
                            <p class="text-emerald-100 text-sm font-medium uppercase tracking-wider">Funds Available</p>
                            <h3 class="text-3xl font-bold mt-1">{{ fmt(fundsAvailable) }}</h3>
                        </div>
                        <div class="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                            <Wallet class="size-6 text-white" />
                        </div>
                    </div>
                    <div class="mt-4 flex items-center gap-2 text-emerald-100 text-sm">
                        <ArrowUpRight class="size-4" />
                        <span>Ready for disbursement</span>
                    </div>
                </CardContent>
                <div class="absolute -right-4 -bottom-4 opacity-10">
                    <Landmark class="size-32" />
                </div>
            </Card>

            <!-- Total Obligation -->
            <Card class="relative overflow-hidden border-none bg-gradient-to-br from-slate-800 to-slate-900 text-white shadow-xl">
                <CardContent class="p-6">
                    <div class="flex justify-between items-start">
                        <div>
                            <p class="text-slate-400 text-sm font-medium uppercase tracking-wider">Month Obligation</p>
                            <h3 class="text-3xl font-bold mt-1">{{ fmt(totalAccumulated) }}</h3>
                        </div>
                        <div class="p-2 bg-white/10 rounded-lg backdrop-blur-sm">
                            <History class="size-6 text-white" />
                        </div>
                    </div>
                    <div class="mt-4 flex items-center gap-2 text-slate-400 text-sm">
                        <span>For {{ new Date().toLocaleString('default', { month: 'long' }) }} {{ currentYear }}</span>
                    </div>
                </CardContent>
            </Card>

            <!-- Remaining Needed -->
            <Card class="relative overflow-hidden border-none bg-white dark:bg-slate-900 shadow-xl border border-border/50">
                <CardContent class="p-6">
                    <div class="flex justify-between items-start">
                        <div>
                            <p class="text-muted-foreground text-sm font-medium uppercase tracking-wider">Outstanding Net Pay</p>
                            <h3 class="text-3xl font-bold mt-1 text-slate-900 dark:text-white">{{ fmt(fundsNeeded) }}</h3>
                        </div>
                        <div class="p-2 bg-amber-500/10 rounded-lg">
                            <AlertCircle class="size-6 text-amber-500" />
                        </div>
                    </div>
                    <div class="mt-4 flex items-center gap-2 text-sm" :class="totalPaid > 0 ? 'text-emerald-500' : 'text-muted-foreground'">
                        <span>{{ fmt(totalPaid) }} already paid</span>
                    </div>
                </CardContent>
            </Card>

            <!-- Funding Gap -->
            <Card class="relative overflow-hidden border-none bg-gradient-to-br" 
                  :class="fundingGap > 0 ? 'from-rose-500 to-orange-600' : 'from-emerald-500 to-teal-600'">
                <CardContent class="p-6 text-white">
                    <div class="flex justify-between items-start">
                        <div>
                            <p class="text-white/70 text-sm font-medium uppercase tracking-wider">Funding Gap</p>
                            <h3 class="text-3xl font-bold mt-1">{{ fmt(fundingGap) }}</h3>
                        </div>
                        <div class="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                            <DollarSign class="size-6" />
                        </div>
                    </div>
                    <div class="mt-4 text-white/80 text-sm font-medium">
                        {{ fundingGap > 0 ? 'Action Required: Request Funds' : 'Fully Funded' }}
                    </div>
                </CardContent>
            </Card>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Transaction History -->
            <Card class="lg:col-span-2 shadow-xl border-border/40">
                <CardHeader class="flex flex-row items-center justify-between">
                    <CardTitle class="text-xl font-bold flex items-center gap-2">
                        <History class="size-5 text-primary" /> Recent Transactions
                    </CardTitle>
                </CardHeader>
                <CardContent class="p-0">
                    <div class="overflow-x-auto">
                        <table class="w-full">
                            <thead class="bg-muted/50 border-y">
                                <tr>
                                    <th class="text-left px-6 py-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Description</th>
                                    <th class="text-center px-4 py-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Source</th>
                                    <th class="text-right px-6 py-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Amount</th>
                                    <th class="text-center px-4 py-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Type</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-border/40">
                                <tr v-if="transactions.length === 0" class="hover:bg-muted/5">
                                    <td colspan="4" class="px-6 py-10 text-center text-muted-foreground italic">
                                        No transactions recorded yet.
                                    </td>
                                </tr>
                                <tr v-for="t in transactions" :key="t.id" class="group hover:bg-muted/30 transition-colors">
                                    <td class="px-6 py-4">
                                        <div class="font-medium text-slate-900 dark:text-slate-100">{{ t.description }}</div>
                                        <div class="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">
                                            {{ t.createdAt?.toDate?.()?.toLocaleString() || 'Pending...' }}
                                        </div>
                                    </td>
                                    <td class="px-4 py-4 text-center">
                                        <Badge variant="outline" :class="getSourceColor(t.source)" class="px-2 py-0.5 rounded-md text-[10px] font-bold">
                                            {{ t.source }}
                                        </Badge>
                                    </td>
                                    <td class="px-6 py-4 text-right">
                                        <span class="font-mono font-bold text-base" :class="t.type === 'PAYMENT' ? 'text-rose-500' : (t.type === 'TRANSFER' ? 'text-emerald-600' : 'text-slate-600 dark:text-slate-400')">
                                            {{ t.type === 'PAYMENT' ? '-' : (t.type === 'TRANSFER' ? '+' : '') }}{{ fmt(t.amount) }}
                                        </span>
                                    </td>
                                    <td class="px-4 py-4 text-center">
                                        <div v-if="t.type === 'ACCUMULATION'" class="flex justify-center">
                                            <div class="p-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500" title="Accumulation (Obligation)">
                                                <History class="size-4" />
                                            </div>
                                        </div>
                                        <div v-else-if="t.type === 'TRANSFER'" class="flex justify-center">
                                            <div class="p-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600" title="Transfer In">
                                                <ArrowDownRight class="size-4" />
                                            </div>
                                        </div>
                                        <div v-else-if="t.type === 'PAYMENT'" class="flex justify-center">
                                            <div class="p-1.5 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-600" title="Payment Out">
                                                <ArrowUpRight class="size-4" />
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            <!-- Funding Guide / Actions -->
            <div class="space-y-6">
                <Card class="shadow-xl border-border/40 bg-gradient-to-b from-white to-slate-50 dark:from-slate-900 dark:to-slate-950">
                    <CardHeader>
                        <CardTitle class="text-lg">Funding Status</CardTitle>
                    </CardHeader>
                    <CardContent class="space-y-4">
                        <div class="flex items-center gap-4 p-4 rounded-xl border border-border/60 bg-white/50 dark:bg-black/20">
                            <div class="p-3 rounded-full bg-amber-500/10">
                                <Landmark class="size-6 text-amber-500" />
                            </div>
                            <div class="flex-1">
                                <p class="text-xs text-muted-foreground uppercase font-bold tracking-wider">Needed</p>
                                <p class="text-xl font-bold">{{ fmt(fundsNeeded) }}</p>
                            </div>
                        </div>
                        <div class="flex items-center gap-4 p-4 rounded-xl border border-border/60 bg-white/50 dark:bg-black/20">
                            <div class="p-3 rounded-full bg-emerald-500/10">
                                <Wallet class="size-6 text-emerald-500" />
                            </div>
                            <div class="flex-1">
                                <p class="text-xs text-muted-foreground uppercase font-bold tracking-wider">Available</p>
                                <p class="text-xl font-bold">{{ fmt(fundsAvailable) }}</p>
                            </div>
                        </div>

                        <div v-if="fundingGap > 0" class="p-4 rounded-xl bg-rose-500/5 border border-rose-500/20 text-rose-600 text-sm font-medium animate-pulse">
                            <p class="flex items-center gap-2">
                                <AlertCircle class="size-4" /> 
                                Salaries account is underfunded by {{ fmt(fundingGap) }}
                            </p>
                        </div>
                        <div v-else class="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-emerald-600 text-sm font-medium">
                            <p class="flex items-center gap-2">
                                <PlusCircle class="size-4" /> 
                                All obligations are currently covered.
                            </p>
                        </div>
                    </CardContent>
                </Card>

                <Card class="bg-primary text-primary-foreground shadow-2xl shadow-primary/20 border-none">
                    <CardHeader>
                        <CardTitle class="text-lg">Proactive Funding</CardTitle>
                    </CardHeader>
                    <CardContent class="space-y-4">
                        <p class="text-sm opacity-90 leading-relaxed">
                            Ensure the Salaries Account is funded before payroll generation to avoid disbursement delays.
                        </p>
                        <Button variant="secondary" class="w-full font-bold h-12" @click="showTransferDialog = true">
                            Initiate Funding Now
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>

        <!-- Transfer Request Dialog -->
        <Dialog v-model:open="showTransferDialog">
            <DialogContent class="sm:max-w-[450px] p-0 overflow-hidden rounded-2xl border-none shadow-2xl">
                <div class="bg-primary p-6 text-primary-foreground">
                    <DialogTitle class="text-2xl font-bold flex items-center gap-3">
                        <ArrowDownRight class="size-6" /> Fund Salaries Account
                    </DialogTitle>
                    <p class="text-primary-foreground/80 mt-1">Request a transfer from operational accounts</p>
                </div>
                
                <div class="p-6 space-y-6 bg-white dark:bg-slate-950">
                    <div class="space-y-2">
                        <label class="text-xs font-bold uppercase tracking-widest text-muted-foreground">Source Account</label>
                        <Select v-model="transferForm.fromAccount">
                            <SelectTrigger class="h-12 text-base font-medium border-border/60">
                                <SelectValue placeholder="Select Source" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="BANK">Bank Account</SelectItem>
                                <SelectItem value="ECOCASH">EcoCash</SelectItem>
                                <SelectItem value="CASH">Cash</SelectItem>
                            </SelectContent>
                        </Select>
                        <p class="text-[10px] text-muted-foreground flex items-center gap-1 mt-1">
                            Current Balance: <span class="font-bold text-slate-900 dark:text-slate-100">{{ fmt(finalBalances[transferForm.fromAccount] || 0) }}</span>
                        </p>
                    </div>

                    <div class="space-y-2">
                        <label class="text-xs font-bold uppercase tracking-widest text-muted-foreground">Amount to Transfer ($)</label>
                        <div class="relative">
                            <DollarSign class="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
                            <Input v-model.number="transferForm.amount" type="number" step="0.01" 
                                   class="pl-12 h-14 text-2xl font-mono font-bold border-border/60 focus:ring-primary/20" 
                                   placeholder="0.00" />
                        </div>
                        <div class="flex justify-between mt-1">
                            <button @click="transferForm.amount = fundingGap" class="text-[10px] text-primary hover:underline font-bold uppercase tracking-tighter">
                                Fill funding gap ({{ fmt(fundingGap) }})
                            </button>
                        </div>
                    </div>

                    <div class="space-y-2">
                        <label class="text-xs font-bold uppercase tracking-widest text-muted-foreground">Reference / Notes</label>
                        <Input v-model="transferForm.reference" class="h-12 border-border/60" />
                    </div>
                </div>

                <DialogFooter class="p-6 pt-0 bg-white dark:bg-slate-950">
                    <Button variant="outline" @click="showTransferDialog = false" class="h-12 font-bold px-6">Cancel</Button>
                    <Button @click="requestTransfer" :disabled="submittingTransfer || transferForm.amount <= 0" 
                            class="h-12 font-bold px-8 shadow-lg shadow-primary/20 min-w-[140px]">
                        <span v-if="submittingTransfer" class="animate-spin mr-2">◌</span>
                        {{ submittingTransfer ? 'Submitting...' : 'Request Transfer' }}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>
