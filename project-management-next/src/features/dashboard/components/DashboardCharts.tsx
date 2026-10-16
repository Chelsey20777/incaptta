'use client';

import React from 'react';
import { VisXYContainer, VisLine, VisArea, VisAxis, VisCrosshair } from '@unovis/react';
import { RevenueMetric, MortalityMetric } from '@/stores/dashboard-store';

interface DashboardChartsProps {
  revenueData: RevenueMetric[];
  mortalityData: MortalityMetric[];
}

export function DashboardCharts({ revenueData, mortalityData }: DashboardChartsProps) {
  // Sort data chronologically for charts
  const sortedRevenue = React.useMemo(() => {
    return [...revenueData].reverse();
  }, [revenueData]);

  const sortedMortality = React.useMemo(() => {
    return [...mortalityData].reverse();
  }, [mortalityData]);

  // Accessors for Unovis
  const xRevenue = React.useCallback((d: RevenueMetric) => sortedRevenue.indexOf(d), [sortedRevenue]);
  const yRevenue = React.useCallback((d: RevenueMetric) => d.amount, []);
  const xRevenueLabel = React.useCallback((tick: number | Date) => {
    const idx = typeof tick === 'number' ? tick : 0;
    return sortedRevenue[idx]?.label || '';
  }, [sortedRevenue]);

  const xMortality = React.useCallback((d: MortalityMetric) => sortedMortality.indexOf(d), [sortedMortality]);
  const yMortality = React.useCallback((d: MortalityMetric) => d.mortalityRate, []);
  const xMortalityLabel = React.useCallback((tick: number | Date) => {
    const idx = typeof tick === 'number' ? tick : 0;
    return sortedMortality[idx]?.date || '';
  }, [sortedMortality]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
      {/* Revenue Area Chart */}
      <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--card)] p-6 shadow-[var(--glass-shadow)] backdrop-blur-[var(--glass-blur)]">
        <h3 className="text-sm font-semibold text-[var(--foreground)] mb-4">Revenue Trend</h3>
        <div className="h-64 w-full">
          {sortedRevenue.length > 0 ? (
            <VisXYContainer data={sortedRevenue} height={240}>
              <VisArea 
                x={xRevenue} 
                y={yRevenue} 
                color="rgba(121, 194, 27, 0.15)"
              />
              <VisLine 
                x={xRevenue} 
                y={yRevenue} 
                color="var(--brand-primary)"
              />
              <VisAxis 
                type="x" 
                tickFormat={xRevenueLabel}
                labelColor="var(--muted-foreground)"
                gridLine={false}
              />
              <VisAxis 
                type="y"
                labelColor="var(--muted-foreground)"
                gridLine={true}
              />
              <VisCrosshair />
            </VisXYContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-[var(--muted-foreground)]">
              No revenue metrics available
            </div>
          )}
        </div>
      </div>

      {/* Mortality Rate Line Chart */}
      <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--card)] p-6 shadow-[var(--glass-shadow)] backdrop-blur-[var(--glass-blur)]">
        <h3 className="text-sm font-semibold text-[var(--foreground)] mb-4">Poultry Mortality Trend</h3>
        <div className="h-64 w-full">
          {sortedMortality.length > 0 ? (
            <VisXYContainer data={sortedMortality} height={240}>
              <VisLine 
                x={xMortality} 
                y={yMortality} 
                color="var(--brand-secondary)"
              />
              <VisAxis 
                type="x" 
                tickFormat={xMortalityLabel}
                labelColor="var(--muted-foreground)"
                gridLine={false}
              />
              <VisAxis 
                type="y"
                labelColor="var(--muted-foreground)"
                gridLine={true}
              />
              <VisCrosshair />
            </VisXYContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-[var(--muted-foreground)]">
              No mortality metrics available
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
