import React from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardHeader, CardContent } from '@/components/ui/card'

export default function AnalyticsSkeleton() {
  return (
    <div className="space-y-8 pb-12">
      {/* Header row skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-52" />
          <Skeleton className="h-4 w-36" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-12 rounded-md" />
          <Skeleton className="h-9 w-12 rounded-md" />
          <Skeleton className="h-9 w-12 rounded-md" />
        </div>
      </div>

      {/* KPI cards row */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map(i => (
          <Card key={i} className="border bg-card/50">
            <CardHeader className="pb-2">
              <Skeleton className="h-3 w-28" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-20 mb-2" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Trend chart (2/3) */}
        <Card className="lg:col-span-2 border bg-card/50">
          <CardHeader className="pb-3 border-b">
            <Skeleton className="h-4 w-40" />
          </CardHeader>
          <CardContent className="pt-6">
            <Skeleton className="h-[220px] w-full rounded-md" />
          </CardContent>
        </Card>

        {/* Status chart (1/3) */}
        <Card className="border bg-card/50">
          <CardHeader className="pb-3 border-b">
            <Skeleton className="h-4 w-36" />
          </CardHeader>
          <CardContent className="pt-6 space-y-3">
            {[1, 2, 3, 4, 5].map(i => {
              const widths = ['w-4/5', 'w-3/5', 'w-2/5', 'w-1/2', 'w-1/3']
              return (
                <div key={i} className="space-y-1.5">
                  <div className="flex justify-between">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-3 w-8" />
                  </div>
                  <Skeleton className={`h-2 ${widths[i - 1]} rounded-full`} />
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>

      {/* Department chart */}
      <Card className="border bg-card/50">
        <CardHeader className="pb-3 border-b">
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent className="pt-6">
          <Skeleton className="h-[200px] w-full rounded-md" />
        </CardContent>
      </Card>

      {/* Account balances */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map(i => (
          <Card key={i} className="border bg-card/50">
            <CardHeader className="pb-2">
              <Skeleton className="h-3 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-7 w-24 mb-1" />
              <Skeleton className="h-3 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
