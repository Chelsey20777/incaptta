'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/format'
import { jobCostBuckets } from '@/lib/jobs/cost-status'

interface CostStatusPanelProps {
  job: Parameters<typeof jobCostBuckets>[0]
}

function Row({ label, bucket }: { label: string; bucket: { budget: number; committed: number; actual: number; paid: number } }) {
  return (
    <tr className="border-b last:border-0">
      <td className="py-2 pr-3 text-sm">{label}</td>
      <td className="py-2 text-right font-mono text-sm">{formatCurrency(bucket.budget)}</td>
      <td className="py-2 text-right font-mono text-sm">{formatCurrency(bucket.committed)}</td>
      <td className="py-2 text-right font-mono text-sm">{formatCurrency(bucket.actual)}</td>
      <td className="py-2 text-right font-mono text-sm">{formatCurrency(bucket.paid)}</td>
    </tr>
  )
}

export default function CostStatusPanel({ job }: CostStatusPanelProps) {
  const buckets = jobCostBuckets(job)
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-black uppercase tracking-widest">Cost status</CardTitle>
        <p className="text-xs text-muted-foreground">
          Presentation only. Missing approval status is not counted as approved. This does not replace current posting.
        </p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b text-[10px] uppercase tracking-widest text-muted-foreground">
              <th className="py-2 text-left">Category</th>
              <th className="py-2 text-right">Budget</th>
              <th className="py-2 text-right">Committed</th>
              <th className="py-2 text-right">Actual</th>
              <th className="py-2 text-right">Paid</th>
            </tr>
          </thead>
          <tbody>
            <Row label="Materials" bucket={buckets.materials} />
            <Row label="Expenses" bucket={buckets.expenses} />
            <Row label="Subcontract" bucket={buckets.subcontract} />
            <Row label="Labour" bucket={buckets.labour} />
          </tbody>
        </table>
        {buckets.returns > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">Approved returns reducing cost: {formatCurrency(buckets.returns)}</p>
        )}
      </CardContent>
    </Card>
  )
}
