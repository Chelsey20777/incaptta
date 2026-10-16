'use client'

import React, { useState, useMemo } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Search,
  Building2,
  DollarSign,
  ClipboardList,
  Banknote,
  Plus,
} from 'lucide-react'

const STATUS_TABS = ['all', 'DRAFT', 'APPROVED', 'PAID', 'COMPLETED', 'CANCELLED'] as const

interface QuotesTabProps {
  jobCards: any[]
  loadingJobCards: boolean
  onSwitchTab: (tab: string) => void
}

export function QuotesTab({ jobCards, loadingJobCards, onSwitchTab }: QuotesTabProps) {
  const [activeStatusTab, setActiveStatusTab] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  const filtered = useMemo(() => {
    let result = jobCards
    if (activeStatusTab !== 'all') {
      result = result.filter((j) => j.status === activeStatusTab)
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (j) =>
          j.jobNumber?.toLowerCase().includes(q) ||
          j.clientName?.toLowerCase().includes(q) ||
          j.siteLocation?.toLowerCase().includes(q)
      )
    }
    return result
  }, [jobCards, activeStatusTab, searchQuery])

  const stats = useMemo(() => {
    const totalValue = jobCards.reduce((s, j) => s + (j.totalAmount || 0), 0)
    const totalPaid = jobCards.reduce((s, j) => s + (j.paidAmount || 0), 0)
    return {
      total: jobCards.length,
      totalValue,
      totalPaid,
      outstanding: totalValue - totalPaid,
    }
  }, [jobCards])

  const statusBadge = (status: string) => {
    const v: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
      DRAFT: 'secondary',
      APPROVED: 'default',
      PAID: 'outline',
      COMPLETED: 'outline',
      CANCELLED: 'destructive',
    }
    return <Badge variant={v[status] || 'secondary'}>{status}</Badge>
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card className="bg-card/50 backdrop-blur-sm border shadow rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase">Total Quotes</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loadingJobCards ? <Skeleton className="h-8 w-16" /> : stats.total}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur-sm border shadow rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase">Total Value</CardTitle>
            <DollarSign className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-500">
              ${stats.totalValue.toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur-sm border shadow rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase">Total Paid</CardTitle>
            <Banknote className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">
              ${stats.totalPaid.toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur-sm border shadow rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase">Outstanding</CardTitle>
            <DollarSign className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">
              ${stats.outstanding.toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Search by job number, client, or location..."
            className="pl-9 h-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Call to Action */}
        <Button 
          onClick={() => onSwitchTab('calculator')}
          className="bg-brand-primary hover:bg-brand-primary/95 text-white font-bold h-9 shrink-0 shadow"
        >
          <Plus className="size-4 mr-1" />
          New Fowlrun Quote
        </Button>
      </div>

      {/* Status Tabs & Table Card */}
      <Card className="bg-card/50 backdrop-blur-sm border shadow rounded-xl overflow-hidden">
        <CardHeader className="pb-3 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle>Quotes & Job Cards Ledger</CardTitle>
            <CardDescription>Select statuses below to filter quotes database.</CardDescription>
          </div>
          <Tabs value={activeStatusTab} onValueChange={setActiveStatusTab} className="shrink-0">
            <TabsList className="grid grid-cols-3 md:flex md:w-auto">
              {STATUS_TABS.map((tab) => (
                <TabsTrigger key={tab} value={tab} className="capitalize">
                  {tab === 'all' ? 'All' : tab}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="p-0">
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-xs text-left divide-y border-t">
              <thead className="bg-muted/30 uppercase text-[10px] text-muted-foreground font-bold">
                <tr>
                  <th className="p-3">Job Number</th>
                  <th className="p-3">Client</th>
                  <th className="p-3">Location</th>
                  <th className="p-3 text-center">Size</th>
                  <th className="p-3 text-right">Total</th>
                  <th className="p-3 text-right">Paid</th>
                  <th className="p-3 text-right">Balance</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-center">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y font-semibold">
                {loadingJobCards
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b">
                        {Array.from({ length: 9 }).map((_, j) => (
                          <td key={j} className="p-3">
                            <Skeleton className="h-4 w-full" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : filtered.length === 0
                  ? (
                    <tr>
                      <td colSpan={9} className="text-center p-8 text-muted-foreground italic">
                        No quotes found matching filters
                      </td>
                    </tr>
                  )
                  : filtered.map((jc) => (
                      <tr
                        key={jc.id}
                        className="hover:bg-muted/10 transition-colors cursor-pointer"
                        onClick={() =>
                          window.location.assign(
                            `/agric-structures/job-cards/${jc.id}`
                          )
                        }
                      >
                        <td className="p-3 font-mono font-bold text-foreground">
                          {jc.jobNumber}
                        </td>
                        <td className="p-3">{jc.clientName || '—'}</td>
                        <td className="p-3 text-muted-foreground truncate max-w-[200px]">
                          {jc.siteLocation || '—'}
                        </td>
                        <td className="p-3 text-center">
                          {jc.fowlrunMeta?.size?.label ||
                            jc.generalInfo?.dimensionsOfStructure ||
                            '—'}
                        </td>
                        <td className="p-3 text-right font-mono font-bold">
                          ${(jc.totalAmount || 0).toLocaleString()}
                        </td>
                        <td className="p-3 text-right font-mono text-emerald-600">
                          ${(jc.paidAmount || 0).toLocaleString()}
                        </td>
                        <td className="p-3 text-right font-mono text-orange-600 font-bold">
                          ${(jc.balance || 0).toLocaleString()}
                        </td>
                        <td className="p-3 text-center">
                          {statusBadge(jc.status)}
                        </td>
                        <td className="p-3 text-center text-muted-foreground">
                          {jc.createdAt
                            ? new Date(
                                jc.createdAt.seconds
                                  ? jc.createdAt.seconds * 1000
                                  : jc.createdAt
                              ).toLocaleDateString()
                            : '—'}
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List View */}
          <div className="md:hidden divide-y border-t">
            {loadingJobCards ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="p-4 space-y-3">
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                  <Skeleton className="h-3 w-40" />
                  <div className="grid grid-cols-3 gap-2">
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                  </div>
                </div>
              ))
            ) : filtered.length === 0 ? (
              <div className="text-center p-8 text-muted-foreground italic text-xs">
                No quotes found matching filters
              </div>
            ) : (
              filtered.map((jc) => (
                <div
                  key={jc.id}
                  className="p-4 hover:bg-muted/10 transition-colors cursor-pointer space-y-2.5 active:bg-muted/20"
                  onClick={() => window.location.assign(`/agric-structures/job-cards/${jc.id}`)}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-sm text-foreground">{jc.jobNumber}</span>
                    {statusBadge(jc.status)}
                  </div>
                  <div className="text-xs space-y-1">
                    <div>
                      <span className="font-semibold text-muted-foreground uppercase text-[10px]">Client:</span>{' '}
                      <span className="text-foreground font-bold">{jc.clientName || '—'}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-muted-foreground uppercase text-[10px]">Location:</span>{' '}
                      <span className="text-foreground">{jc.siteLocation || '—'}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-muted-foreground uppercase text-[10px]">Size:</span>{' '}
                      <span className="text-foreground">{jc.fowlrunMeta?.size?.label || jc.generalInfo?.dimensionsOfStructure || '—'}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-1 border-t text-center font-mono">
                    <div className="bg-muted/10 p-1.5 rounded border border-border/40">
                      <p className="text-[9px] text-muted-foreground font-semibold uppercase">Total</p>
                      <p className="text-xs font-bold text-foreground">${(jc.totalAmount || 0).toLocaleString()}</p>
                    </div>
                    <div className="bg-emerald-500/5 p-1.5 rounded border border-emerald-500/10">
                      <p className="text-[9px] text-emerald-600/80 font-semibold uppercase">Paid</p>
                      <p className="text-xs font-bold text-emerald-600">${(jc.paidAmount || 0).toLocaleString()}</p>
                    </div>
                    <div className="bg-orange-500/5 p-1.5 rounded border border-orange-500/10">
                      <p className="text-[9px] text-orange-600/80 font-semibold uppercase">Bal</p>
                      <p className="text-xs font-bold text-orange-600">${(jc.balance || 0).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-muted-foreground pt-1.5">
                    <span>Created: {jc.createdAt ? new Date(jc.createdAt.seconds ? jc.createdAt.seconds * 1000 : jc.createdAt).toLocaleDateString() : '—'}</span>
                    <span className="text-brand-primary font-bold hover:underline">Edit Details →</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
