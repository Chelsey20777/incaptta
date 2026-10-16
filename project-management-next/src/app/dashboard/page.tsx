'use client';

import React, { useEffect, useMemo } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { GlassCard } from '@/components/ui/GlassCard';
import { useAuthStore } from '@/stores/auth-store';
import { DashboardCharts } from '@/features/dashboard/components/DashboardCharts';
import { useDashboardStore } from '@/stores/dashboard-store';
import { generateExcelReport, generatePdfInvoice } from '@/lib/document-services';
import { 
  TrendingUp, 
  DollarSign, 
  Activity, 
  ArrowUpRight, 
  ArrowDownRight,
  Loader2
} from 'lucide-react';

export default function DashboardPage() {
  const { user, claims } = useAuthStore();
  const { 
    revenueMetrics, 
    activeStructures, 
    mortalityMetrics, 
    loadingMetrics, 
    loadingStructures,
    fetchDashboardMetrics,
    subscribeToLiveStructures
  } = useDashboardStore();

  // Initialize listeners
  useEffect(() => {
    const unsubscribeStructures = subscribeToLiveStructures();
    fetchDashboardMetrics();

    return () => {
      unsubscribeStructures();
    };
  }, [subscribeToLiveStructures, fetchDashboardMetrics]);

  // Compute live mortality rates
  const averageMortality = useMemo(() => {
    if (mortalityMetrics.length === 0) return '0.00';
    const total = mortalityMetrics.reduce((sum, item) => sum + item.mortalityRate, 0);
    return (total / mortalityMetrics.length).toFixed(2);
  }, [mortalityMetrics]);

  // Get current and previous revenue for comparison
  const revenueData = useMemo(() => {
    const current = revenueMetrics[0]?.amount || 0;
    const previous = revenueMetrics[1]?.amount || 0;
    let changePercentage = '0.0';
    if (previous > 0) {
      changePercentage = (((current - previous) / previous) * 100).toFixed(1);
    }
    return {
      current,
      previous,
      changePercentage,
      isPositive: current >= previous
    };
  }, [revenueMetrics]);

  return (
    <div className="flex min-h-screen bg-[var(--bg-solid)]">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
        {/* Header */}
        <Header />

        {/* Dashboard Grid */}
        <main className="flex-1 p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">
              Operational Intelligence
            </h1>
            <div className="flex items-center gap-3">
              <button
                onClick={() => generateExcelReport(activeStructures)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-[var(--glass-border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[rgba(121,194,27,0.08)] transition-all duration-200 cursor-pointer"
              >
                Export Excel
              </button>
              <button
                onClick={() => generatePdfInvoice({
                  id: '8294719',
                  clientName: 'Tripple T Investments',
                  amount: revenueData.current,
                  date: new Date().toLocaleDateString()
                })}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-[var(--glass-border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[rgba(121,194,27,0.08)] transition-all duration-200 cursor-pointer"
              >
                Print Invoice
              </button>
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-[rgba(121,194,27,0.15)] text-[var(--brand-primary)]">
                Live updates active
              </span>
            </div>
          </div>

          {/* 3-Column GlassCard Layout */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Column 1: Financial Health */}
            <GlassCard glow className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[var(--muted-foreground)]">Monthly Revenue</span>
                {loadingMetrics ? (
                  <Loader2 className="h-4 w-4 animate-spin text-[var(--brand-primary)]" />
                ) : (
                  <span className={`flex items-center text-xs font-semibold px-2 py-0.5 rounded-full ${
                    revenueData.isPositive ? 'text-emerald-500 bg-emerald-500/10' : 'text-rose-500 bg-rose-500/10'
                  }`}>
                    {revenueData.isPositive ? (
                      <ArrowUpRight className="h-3 w-3 mr-0.5" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3 mr-0.5" />
                    )}
                    {revenueData.isPositive ? '+' : ''}{revenueData.changePercentage}%
                  </span>
                )}
              </div>
              <div className={`space-y-1 ${loadingMetrics ? 'animate-pulse opacity-50' : ''}`}>
                <h3 className="text-3xl font-extrabold text-[var(--foreground)] tracking-tight">
                  ${revenueData.current.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </h3>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Previous month: ${revenueData.previous.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <div className="pt-4 border-t border-[var(--border)] flex items-center justify-between">
                <span className="text-xs text-[var(--muted-foreground)]">Target projection status</span>
                <DollarSign className="h-5 w-5 text-[var(--brand-primary)]" />
              </div>
            </GlassCard>

            {/* Column 2: System Activity */}
            <GlassCard glow className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[var(--muted-foreground)]">Job Submissions</span>
                {loadingStructures ? (
                  <Loader2 className="h-4 w-4 animate-spin text-[var(--brand-primary)]" />
                ) : (
                  <span className="flex items-center text-xs font-semibold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                    Active projects
                  </span>
                )}
              </div>
              <div className={`space-y-3 ${loadingStructures ? 'animate-pulse opacity-50' : ''}`}>
                <h3 className="text-3xl font-extrabold text-[var(--foreground)] tracking-tight">
                  {activeStructures.length}
                </h3>
                <div className="space-y-2 pt-1">
                  {activeStructures.map((struct) => (
                    <div key={struct.id} className="space-y-1">
                      <div className="flex justify-between text-[10px] text-[var(--muted-foreground)]">
                        <span className="truncate max-w-[150px]">{struct.name}</span>
                        <span>{struct.progress}%</span>
                      </div>
                      <div className="h-1 w-full bg-[var(--border)] rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-[var(--brand-primary)] rounded-full transition-all duration-500" 
                          style={{ width: `${struct.progress}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="pt-4 border-t border-[var(--border)] flex items-center justify-between">
                <span className="text-xs text-[var(--muted-foreground)]">High dispatch availability</span>
                <Activity className="h-5 w-5 text-[var(--brand-secondary)]" />
              </div>
            </GlassCard>

            {/* Column 3: Performance Yield */}
            <GlassCard glow className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[var(--muted-foreground)]">Poultry Mortality</span>
                {loadingMetrics ? (
                  <Loader2 className="h-4 w-4 animate-spin text-[var(--brand-primary)]" />
                ) : (
                  <span className="flex items-center text-xs font-semibold text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-full">
                    <ArrowDownRight className="h-3 w-3 mr-0.5" /> Stable
                  </span>
                )}
              </div>
              <div className={`space-y-1 ${loadingMetrics ? 'animate-pulse opacity-50' : ''}`}>
                <h3 className="text-3xl font-extrabold text-[var(--foreground)] tracking-tight">
                  {averageMortality}%
                </h3>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Target threshold: &lt; 1.50%
                </p>
              </div>
              <div className="pt-4 border-t border-[var(--border)] flex items-center justify-between">
                <span className="text-xs text-[var(--muted-foreground)]">Optimal environment settings</span>
                <TrendingUp className="h-5 w-5 text-[var(--brand-primary)]" />
              </div>
            </GlassCard>

          </div>

          <DashboardCharts revenueData={revenueMetrics} mortalityData={mortalityMetrics} />
        </main>
      </div>
    </div>
  );
}
