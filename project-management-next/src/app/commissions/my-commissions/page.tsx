'use client'

import React, { useEffect, useState } from 'react'
import { useCommissionsStore } from '@/stores/commissions-store'
import { useAuthStore } from '@/stores/auth-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { DollarSign, Users, Banknote, Clock, CheckCircle, TrendingUp } from 'lucide-react'

export default function MyCommissionsPage() {
  const { user: authUser } = useAuthStore()
  const { commissions, payouts, fetchCommissions, fetchPayouts, cleanup } = useCommissionsStore()
  const [activeTab, setActiveTab] = useState('overview')
  const uid = authUser?.uid || ''

  useEffect(() => {
    if (!uid) return
    const unsub = fetchCommissions(uid)
    fetchPayouts(uid)
    return () => { unsub(); cleanup() }
  }, [uid])

  const myCommissions = commissions.filter(c => c.referrerId === uid)
  const myPayouts = payouts.filter(p => p.referrerId === uid)

  const pendingTotal = myCommissions.filter(c => c.status === 'PENDING').reduce((s, c) => s + c.commissionAmount, 0)
  const approvedTotal = myCommissions.filter(c => c.status === 'APPROVED').reduce((s, c) => s + c.commissionAmount, 0)
  const paidTotal = myCommissions.filter(c => c.status === 'PAID').reduce((s, c) => s + c.commissionAmount, 0)
  const totalEarned = myCommissions.reduce((s, c) => s + c.commissionAmount, 0)

  const statusBadge = (status: string) => {
    const v: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = { PENDING: 'secondary', APPROVED: 'default', PAID: 'outline', CANCELLED: 'destructive' }
    return <Badge variant={v[status] || 'secondary'}>{status}</Badge>
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">My Commissions</h2>
        <p className="text-muted-foreground">Your referral commissions, payouts, and earnings</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Earned</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-blue-500">${totalEarned.toLocaleString()}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-amber-500">${pendingTotal.toLocaleString()}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approved</CardTitle>
            <CheckCircle className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-blue-500">${approvedTotal.toLocaleString()}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Paid Out</CardTitle>
            <Banknote className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-emerald-500">${paidTotal.toLocaleString()}</div></CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="referrals">My Referrals</TabsTrigger>
          <TabsTrigger value="payouts">Payout History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <div className="grid gap-4 md:grid-cols-2">
            <Card><CardHeader><CardTitle>Earnings Summary</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Total Referrals</span><span className="font-bold">{myCommissions.length}</span></div>
                  <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Pending</span><span className="font-bold text-amber-500">${pendingTotal.toLocaleString()}</span></div>
                  <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Approved</span><span className="font-bold text-blue-500">${approvedTotal.toLocaleString()}</span></div>
                  <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Paid</span><span className="font-bold text-emerald-500">${paidTotal.toLocaleString()}</span></div>
                  <div className="border-t pt-2 flex items-center justify-between"><span className="text-sm font-semibold">Total Earned</span><span className="font-bold text-lg text-brand-primary">${totalEarned.toLocaleString()}</span></div>
                </div>
              </CardContent>
            </Card>
            <Card><CardHeader><CardTitle>Recent Payouts</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {myPayouts.slice(0, 5).map(p => (
                  <div key={p.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                    <div><p className="text-sm font-medium">${p.amount.toLocaleString()}</p><p className="text-xs text-muted-foreground">{p.paymentMethod} · {p.payoutDate ? new Date(p.payoutDate).toLocaleDateString() : '-'}</p></div>
                    {p.reference && <Badge variant="outline">{p.reference}</Badge>}
                  </div>
                ))}
                {myPayouts.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No payouts yet</p>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="referrals" className="mt-6">
          <Card><CardContent className="p-0">
            <table className="w-full">
              <thead><tr className="border-b">
                <th className="text-left p-3 text-sm font-medium">Client</th>
                <th className="text-left p-3 text-sm font-medium">Project</th>
                <th className="text-right p-3 text-sm font-medium">Amount</th>
                <th className="text-center p-3 text-sm font-medium">Rate</th>
                <th className="text-right p-3 text-sm font-medium">Commission</th>
                <th className="text-center p-3 text-sm font-medium">Status</th>
                <th className="text-center p-3 text-sm font-medium">Date</th>
              </tr></thead>
              <tbody>
                {myCommissions.length === 0 ? <tr><td colSpan={7} className="text-center p-8 text-muted-foreground">No referrals yet</td></tr>
                : myCommissions.map(c => (
                  <tr key={c.id} className="border-b hover:bg-muted/50">
                    <td className="p-3 text-sm font-medium">{c.referredClient}</td>
                    <td className="p-3 text-sm">{c.projectType || '-'}</td>
                    <td className="p-3 text-sm text-right">${c.commissionAmount.toLocaleString()}</td>
                    <td className="p-3 text-sm text-center">{c.commissionRate}%</td>
                    <td className="p-3 text-sm text-right font-mono">${(c.commissionAmount * c.commissionRate / 100).toFixed(2)}</td>
                    <td className="p-3 text-center">{statusBadge(c.status)}</td>
                    <td className="p-3 text-sm text-center text-muted-foreground">{c.createdAt?.toDate?.()?.toLocaleDateString() || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="payouts" className="mt-6">
          <Card><CardContent className="p-0">
            <table className="w-full">
              <thead><tr className="border-b">
                <th className="text-left p-3 text-sm font-medium">Date</th>
                <th className="text-right p-3 text-sm font-medium">Amount</th>
                <th className="text-left p-3 text-sm font-medium">Method</th>
                <th className="text-left p-3 text-sm font-medium">Reference</th>
                <th className="text-left p-3 text-sm font-medium">Notes</th>
              </tr></thead>
              <tbody>
                {myPayouts.length === 0 ? <tr><td colSpan={5} className="text-center p-8 text-muted-foreground">No payout history</td></tr>
                : myPayouts.map(p => (
                  <tr key={p.id} className="border-b hover:bg-muted/50">
                    <td className="p-3 text-sm">{p.payoutDate ? new Date(p.payoutDate).toLocaleDateString() : '-'}</td>
                    <td className="p-3 text-sm text-right font-mono font-medium text-emerald-500">${p.amount.toLocaleString()}</td>
                    <td className="p-3 text-sm">{p.paymentMethod}</td>
                    <td className="p-3 text-sm font-mono">{p.reference || '-'}</td>
                    <td className="p-3 text-sm text-muted-foreground">{p.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}