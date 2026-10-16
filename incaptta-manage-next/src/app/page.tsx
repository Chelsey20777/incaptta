'use client'

import React, { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { useFinanceStore } from '@/stores/finance-store'
import { BrandLogo } from '@/components/layout/brand-logo'

// Lucide React Icons
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
  ShieldCheck,
  Loader2
} from 'lucide-react'

export default function Home() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuthStore()
  const finStore = useFinanceStore()
  const balances = finStore.finalBalances

  const fmt = (n?: number | null) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(n || 0)
  }

  // Hydration and cleanup
  useEffect(() => {
    if (authLoading || !user) return

    finStore.fetchExpenses()
    finStore.fetchTransfers()
    finStore.fetchJobPayments()
    finStore.fetchTopUps()
    finStore.fetchSalariesTransactions()
    finStore.fetchHistoricalInventoryConsumption()

    return () => {
      finStore.cleanup()
    }
  }, [user, authLoading])

  // Routing guard redirect
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
    }
  }, [user, authLoading, router])

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!user) return null

  const tiles = [
    { name: 'Job Cards',      route: '/job-cards',      icon: Briefcase,     color: 'text-[#ff8903]', bg: 'bg-[#ff8903]/10' },
    { name: 'Finance',        route: '/finance',        icon: Wallet,        color: 'text-[#79c21b]', bg: 'bg-[#79c21b]/10' },
    { name: 'CRM',            route: '/crm',            icon: Users,         color: 'text-[#ff8903]', bg: 'bg-[#ff8903]/10' },
    { name: 'Inventory',      route: '/inventory',      icon: Package,       color: 'text-[#79c21b]', bg: 'bg-[#79c21b]/10' },
    { name: 'HR',             route: '/hr',             icon: UserCircle,    color: 'text-[#ff8903]', bg: 'bg-[#ff8903]/10' },
    { name: 'Accounting',     route: '/accounting',     icon: Calculator,    color: 'text-[#79c21b]', bg: 'bg-[#79c21b]/10' },
    { name: 'OpEx',           route: '/opex',           icon: Landmark,      color: 'text-[#79c21b]', bg: 'bg-[#79c21b]/10' },
    { name: 'Auto Approvals', route: '/auto-approvals', icon: ShieldCheck,   color: 'text-[#ff8903]', bg: 'bg-[#ff8903]/10' },
  ]

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-background">
      {/* Header */}
      <header className="p-6 pb-2 border-b-0 bg-transparent flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center p-2 shadow-sm">
            <BrandLogo />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight">
              <span className="text-[#79c21b]">INCAPTTA</span><span className="text-[#ff8903]">PRO</span>
            </h1>
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mt-0.5">Manager Portal</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20 shadow-sm">
            <span className="text-primary font-bold text-lg">
              {user?.displayName?.charAt(0) || user?.email?.charAt(0).toUpperCase() || 'M'}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 flex flex-col items-center justify-start overflow-y-auto pt-4 pb-12">
        {/* Treasure Balances */}
        <div className="w-full max-w-md mb-6">
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-xs font-black uppercase tracking-wider text-muted-foreground">Treasure Balances</h2>
            <span className="text-[9px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full uppercase tracking-wider">Live</span>
          </div>

          <div className="flex gap-3 overflow-x-auto pb-3 snap-x no-scrollbar">
            {/* BANK CARD */}
            <div className="min-w-[150px] flex-1 snap-start p-4 rounded-3xl bg-card border border-border/40 shadow-sm flex flex-col justify-between hover:border-amber-500/35 transition-colors cursor-pointer" onClick={() => router.push('/ledger')}>
              <div className="flex justify-between items-start">
                <span className="text-[9px] font-black uppercase text-amber-500 tracking-wider">Bank</span>
                <Landmark className="size-4 text-amber-500" />
              </div>
              <div className="mt-4">
                <p className="text-lg font-black tracking-tight text-foreground">{fmt(balances?.BANK)}</p>
                <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Current Balance</p>
              </div>
            </div>

            {/* CASH CARD */}
            <div className="min-w-[150px] flex-1 snap-start p-4 rounded-3xl bg-card border border-border/40 shadow-sm flex flex-col justify-between hover:border-[#79c21b]/35 transition-colors cursor-pointer" onClick={() => router.push('/ledger')}>
              <div className="flex justify-between items-start">
                <span className="text-[9px] font-black uppercase text-[#79c21b] tracking-wider">Cash</span>
                <Coins className="size-4 text-[#79c21b]" />
              </div>
              <div className="mt-4">
                <p className="text-lg font-black tracking-tight text-foreground">{fmt(balances?.CASH)}</p>
                <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Current Balance</p>
              </div>
            </div>

            {/* ECOCASH CARD */}
            <div className="min-w-[150px] flex-1 snap-start p-4 rounded-3xl bg-card border border-border/40 shadow-sm flex flex-col justify-between hover:border-[#ff8903]/35 transition-colors cursor-pointer" onClick={() => router.push('/ledger')}>
              <div className="flex justify-between items-start">
                <span className="text-[9px] font-black uppercase text-[#ff8903] tracking-wider">Ecocash</span>
                <Smartphone className="size-4 text-[#ff8903]" />
              </div>
              <div className="mt-4">
                <p className="text-lg font-black tracking-tight text-foreground">{fmt(balances?.ECOCASH)}</p>
                <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Current Balance</p>
              </div>
            </div>

            {/* IRD CARD */}
            <div className="min-w-[150px] flex-1 snap-start p-4 rounded-3xl bg-card border border-border/40 shadow-sm flex flex-col justify-between hover:border-red-500/35 transition-colors cursor-pointer" onClick={() => router.push('/ledger')}>
              <div className="flex justify-between items-start">
                <span className="text-[9px] font-black uppercase text-red-500 tracking-wider">IRD Account</span>
                <ClipboardList className="size-4 text-red-500" />
              </div>
              <div className="mt-4">
                <p className="text-lg font-black tracking-tight text-foreground">{fmt(balances?.IRD)}</p>
                <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Current Balance</p>
              </div>
            </div>

            {/* SALARIES CARD */}
            <div className="min-w-[150px] flex-1 snap-start p-4 rounded-3xl bg-card border border-border/40 shadow-sm flex flex-col justify-between hover:border-emerald-500/35 transition-colors cursor-pointer" onClick={() => router.push('/hr')}>
              <div className="flex justify-between items-start">
                <span className="text-[9px] font-black uppercase text-emerald-500 tracking-wider">Salaries Account</span>
                <Landmark className="size-4 text-emerald-500" />
              </div>
              <div className="mt-4">
                <p className="text-lg font-black tracking-tight text-foreground">{fmt(balances?.SALARIES)}</p>
                <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Current Balance</p>
              </div>
            </div>

            {/* CREDIT CARD */}
            <div className="min-w-[150px] flex-1 snap-start p-4 rounded-3xl bg-card border border-border/40 shadow-sm flex flex-col justify-between hover:border-blue-500/35 transition-colors cursor-pointer" onClick={() => router.push('/crm')}>
              <div className="flex justify-between items-start">
                <span className="text-[9px] font-black uppercase text-blue-500 tracking-wider">Customer Credit</span>
                <Wallet className="size-4 text-blue-500" />
              </div>
              <div className="mt-4">
                <p className="text-lg font-black tracking-tight text-foreground">{fmt(balances?.CREDIT)}</p>
                <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Current Balance</p>
              </div>
            </div>

            {/* INVENTORY CARD */}
            <div className="min-w-[150px] flex-1 snap-start p-4 rounded-3xl bg-card border border-border/40 shadow-sm flex flex-col justify-between hover:border-purple-500/35 transition-colors cursor-pointer" onClick={() => router.push('/inventory')}>
              <div className="flex justify-between items-start">
                <span className="text-[9px] font-black uppercase text-purple-500 tracking-wider">Inventory Consumption</span>
                <Package className="size-4 text-purple-500" />
              </div>
              <div className="mt-4">
                <p className="text-lg font-black tracking-tight text-foreground">{fmt(Math.abs(balances?.INVENTORY || 0))}</p>
                <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Current Balance</p>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Grid Tiles */}
        <div className="w-full max-w-md grid grid-cols-2 gap-4">
          {tiles.map((tile) => (
            <button
              key={tile.name}
              onClick={() => router.push(tile.route)}
              className="flex flex-col items-center justify-center p-6 rounded-3xl bg-card border border-border/40 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 active:scale-95 group cursor-pointer"
            >
              <div className={`size-14 rounded-2xl flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110 shadow-inner ${tile.bg} ${tile.color}`}>
                <tile.icon className="size-7" />
              </div>
              <span className="text-sm font-black tracking-tight text-foreground">{tile.name}</span>
            </button>
          ))}
        </div>
      </main>
    </div>
  )
}
