'use client'

import React, { useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useProcurementStore } from '@/stores/procurement-store'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ShoppingCart,
  Package,
  ClipboardList,
  FileText,
  Truck,
  Receipt,
  Building2,
  Plus,
  ArrowRight,
  Loader2,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Clock
} from 'lucide-react'

export default function ProcurementDashboard() {
  const router = useRouter()
  const {
    suppliers, requisitions, purchaseOrders, grns, supplierInvoices,
    loadingSuppliers, loadingRequisitions, loadingPurchaseOrders, loadingGrns, loadingInvoices,
    fetchSuppliers, fetchRequisitions, fetchPurchaseOrders, fetchGrns, fetchSupplierInvoices,
    cleanupListeners
  } = useProcurementStore()

  useEffect(() => {
    fetchSuppliers()
    fetchRequisitions()
    fetchPurchaseOrders()
    fetchGrns()
    fetchSupplierInvoices()
    return () => cleanupListeners()
  }, [])

  const isLoading = loadingSuppliers || loadingRequisitions || loadingPurchaseOrders || loadingGrns || loadingInvoices

  const stats = useMemo(() => {
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)

    return {
      totalSuppliers: suppliers.length,
      pendingRequisitions: requisitions.filter(r => r.status === 'DRAFT' || r.status === 'SUBMITTED').length,
      approvedRequisitions: requisitions.filter(r => r.status === 'APPROVED').length,
      pendingPOs: purchaseOrders.filter(po => po.status === 'DRAFT' || po.status === 'SENT').length,
      approvedPOs: purchaseOrders.filter(po => po.status === 'ACKNOWLEDGED' || po.status === 'PARTIALLY_FULFILLED').length,
      grnsThisMonth: grns.filter(g => {
        const d = g.createdAt?.toDate ? g.createdAt.toDate() : new Date(g.createdAt)
        return d >= monthStart
      }).length,
      matchedInvoices: supplierInvoices.filter(i => i.matchStatus === 'MATCHED').length,
      pendingInvoices: supplierInvoices.filter(i => i.status === 'PENDING_MATCH' || i.status === 'DRAFT').length,
    }
  }, [suppliers, requisitions, purchaseOrders, grns, supplierInvoices])

  const quickActions = [
    { label: 'New Requisition', href: '/procurement/requisitions/new', icon: ClipboardList, desc: 'Request goods or services' },
    { label: 'New Purchase Order', href: '/procurement/purchase-orders/new', icon: ShoppingCart, desc: 'Convert PR to PO' },
    { label: 'New GRN', href: '/procurement/grns/new', icon: Truck, desc: 'Receive goods into stock' },
    { label: 'New Invoice', href: '/procurement/invoices/new', icon: Receipt, desc: 'Record supplier bill' },
  ]

  if (isLoading && suppliers.length === 0) {
    return (
      <div className="flex-1 flex flex-col pb-20 bg-background min-h-screen">
        <header className="sticky top-0 z-10 bg-card border-b px-4 py-4 shadow-sm">
          <h1 className="text-xl font-black tracking-tight">Procurement</h1>
          <p className="text-xs text-muted-foreground">Supply chain & vendor management</p>
        </header>
        <div className="flex flex-col items-center justify-center py-32">
          <Loader2 className="size-10 animate-spin text-[#ff8903]" />
          <p className="text-xs text-muted-foreground mt-3 font-bold uppercase tracking-wider">Loading procurement data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col pb-20 bg-background min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-card border-b px-4 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black tracking-tight">Procurement</h1>
            <p className="text-xs text-muted-foreground">Supply chain & vendor management</p>
          </div>
          <Badge className="bg-[#ff8903] text-white text-[10px] font-black h-5 px-2">LIVE</Badge>
        </div>
      </header>

      <main className="px-4 py-4 space-y-5 flex-1">
        {/* Stats Grid */}
        <section className="grid grid-cols-2 gap-3">
          <Card className="border shadow-sm bg-card/60 backdrop-blur-md">
            <CardContent className="p-3 space-y-1">
              <div className="flex items-center justify-between">
                <Building2 className="size-4 text-blue-400" />
                <Badge variant="outline" className="text-[9px] h-4 px-1.5 font-bold">{stats.totalSuppliers}</Badge>
              </div>
              <p className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">Suppliers</p>
              <Button variant="link" size="sm" className="h-auto p-0 text-[10px] text-[#ff8903] font-bold" onClick={() => router.push('/procurement/suppliers')}>
                Manage &rarr;
              </Button>
            </CardContent>
          </Card>

          <Card className="border shadow-sm bg-card/60 backdrop-blur-md">
            <CardContent className="p-3 space-y-1">
              <div className="flex items-center justify-between">
                <ClipboardList className="size-4 text-purple-400" />
                <Badge className="bg-purple-500/10 text-purple-500 border-purple-500/20 text-[9px] h-4 px-1.5 font-bold">{stats.pendingRequisitions}</Badge>
              </div>
              <p className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">Pending PRs</p>
              <p className="text-[9px] text-muted-foreground">{stats.approvedRequisitions} approved</p>
            </CardContent>
          </Card>

          <Card className="border shadow-sm bg-card/60 backdrop-blur-md">
            <CardContent className="p-3 space-y-1">
              <div className="flex items-center justify-between">
                <ShoppingCart className="size-4 text-amber-400" />
                <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[9px] h-4 px-1.5 font-bold">{stats.pendingPOs}</Badge>
              </div>
              <p className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">Active POs</p>
              <p className="text-[9px] text-muted-foreground">{stats.approvedPOs} fulfilled</p>
            </CardContent>
          </Card>

          <Card className="border shadow-sm bg-card/60 backdrop-blur-md">
            <CardContent className="p-3 space-y-1">
              <div className="flex items-center justify-between">
                <Truck className="size-4 text-emerald-400" />
                <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[9px] h-4 px-1.5 font-bold">{stats.grnsThisMonth}</Badge>
              </div>
              <p className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">GRNs (MTD)</p>
              <p className="text-[9px] text-muted-foreground">Goods received</p>
            </CardContent>
          </Card>
        </section>

        {/* Quick Actions */}
        <section className="space-y-3">
          <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground px-1 flex items-center gap-1.5">
            <Plus className="size-3.5 text-[#ff8903]" /> Quick Actions
          </h3>
          <div className="grid grid-cols-2 gap-2.5">
            {quickActions.map((action) => (
              <Button
                key={action.href}
                variant="outline"
                className="h-auto flex-col items-start p-3 gap-1.5 rounded-2xl border bg-card/60 hover:bg-card hover:border-[#ff8903]/30 transition-all text-left"
                onClick={() => router.push(action.href)}
              >
                <div className="size-8 rounded-full bg-[#ff8903]/10 flex items-center justify-center">
                  <action.icon className="size-4 text-[#ff8903]" />
                </div>
                <span className="text-xs font-black text-foreground">{action.label}</span>
                <span className="text-[9px] text-muted-foreground leading-tight">{action.desc}</span>
              </Button>
            ))}
          </div>
        </section>

        {/* Invoice Match Status */}
        <section className="space-y-3">
          <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground px-1 flex items-center gap-1.5">
            <Receipt className="size-3.5 text-blue-400" /> Invoice Matching Status
          </h3>
          <div className="grid grid-cols-3 gap-2">
            <Card className="border shadow-sm bg-card/40">
              <CardContent className="p-3 text-center space-y-1">
                <CheckCircle2 className="size-5 mx-auto text-emerald-500" />
                <p className="text-lg font-black text-emerald-500">{stats.matchedInvoices}</p>
                <p className="text-[8px] font-bold uppercase text-muted-foreground">Matched</p>
              </CardContent>
            </Card>
            <Card className="border shadow-sm bg-card/40">
              <CardContent className="p-3 text-center space-y-1">
                <AlertCircle className="size-5 mx-auto text-amber-500" />
                <p className="text-lg font-black text-amber-500">{stats.pendingInvoices}</p>
                <p className="text-[8px] font-bold uppercase text-muted-foreground">Pending</p>
              </CardContent>
            </Card>
            <Card className="border shadow-sm bg-card/40">
              <CardContent className="p-3 text-center space-y-1">
                <Clock className="size-5 mx-auto text-muted-foreground" />
                <p className="text-lg font-black text-muted-foreground">{supplierInvoices.length}</p>
                <p className="text-[8px] font-bold uppercase text-muted-foreground">Total</p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Navigation Links */}
        <section className="space-y-2">
          <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground px-1">All Sections</h3>
          <div className="space-y-2">
            {[
              { label: 'Requisitions', href: '/procurement/requisitions', icon: ClipboardList, color: 'text-purple-500' },
              { label: 'Purchase Orders', href: '/procurement/purchase-orders', icon: ShoppingCart, color: 'text-amber-500' },
              { label: 'Goods Received Notes', href: '/procurement/grns', icon: Truck, color: 'text-emerald-500' },
              { label: 'Supplier Invoices', href: '/procurement/invoices', icon: Receipt, color: 'text-blue-500' },
              { label: 'Suppliers', href: '/procurement/suppliers', icon: Building2, color: 'text-orange-500' },
            ].map((section) => (
              <Button
                key={section.href}
                variant="ghost"
                className="w-full justify-between h-12 px-4 rounded-2xl hover:bg-muted/40"
                onClick={() => router.push(section.href)}
              >
                <div className="flex items-center gap-3">
                  <section.icon className={`size-5 ${section.color}`} />
                  <span className="text-sm font-bold">{section.label}</span>
                </div>
                <ArrowRight className="size-4 text-muted-foreground" />
              </Button>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}