'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { useReportStore, type InventorySaleItem } from '@/stores/report-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Search, Package, CheckCircle2, AlertCircle, Download, RefreshCw, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val)

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(date))
}
function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(date))
}

export default function InventorySalesReportPage() {
  const store = useReportStore()
  const { inventorySalesReport, loading } = store
  const [searchQuery, setSearchQuery] = useState('')
  const [isSyncing, setIsSyncing] = useState(false)

  useEffect(() => { store.generateInventoryReport() }, [])

  const filteredReport = useMemo(() => {
    const q = searchQuery.toLowerCase()
    return inventorySalesReport.filter(
      (item) =>
        item.itemName.toLowerCase().includes(q) ||
        item.jobNumber.toLowerCase().includes(q) ||
        item.clientName.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q)
    )
  }, [inventorySalesReport, searchQuery])

  const handleExport = () => {
    const headers = ['Date', 'Job Number', 'Client', 'Item', 'Qty', 'Unit Cost', 'Total Value', 'Status']
    const rows = filteredReport.map((r) => [
      formatDate(r.date),
      r.jobNumber,
      r.clientName,
      r.itemName,
      r.qty,
      r.unitCost,
      r.totalCost,
      r.isDeducted ? 'SYNCED' : 'PENDING',
    ])
    const csvContent = [headers, ...rows].map((e) => e.join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `inventory_sales_report_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    toast.success('Report exported')
  }

  const handleSyncBacklog = async () => {
    setIsSyncing(true)
    try { toast.info('Inventory sync not yet implemented in Next.js') }
    finally { setIsSyncing(false) }
  }

  const totalConsumption = filteredReport.reduce((s, r) => s + r.totalCost, 0)
  const deductedValue = filteredReport.filter((r) => r.isDeducted).reduce((s, r) => s + r.totalCost, 0)
  const pendingValue = filteredReport.filter((r) => !r.isDeducted).reduce((s, r) => s + r.totalCost, 0)

  return (
    <div className="p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-3"><Package className="size-8 text-brand-primary" />Inventory Sales Report</h1>
          <p className="text-muted-foreground">Track inventory consumption from job cards &amp; returns.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={handleExport}><Download className="size-3" />Export CSV</Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={handleSyncBacklog} disabled={isSyncing}><RefreshCw className={`size-3 ${isSyncing ? 'animate-spin' : ''}`} />Sync Backlog</Button>
        </div>
      </div>

      <Card className="shadow-lg border-brand-primary/10">
        <CardHeader className="border-b bg-muted/20">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-bold uppercase tracking-widest">Item-Level Inventory Sales</CardTitle>
            <div className="relative w-[260px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input placeholder="Search items..." className="pl-8 h-9 text-xs" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto scrollbar-thin">
            <Table>
              <TableHeader className="bg-muted/30 sticky top-0 z-10">
                <TableRow>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider">Date &amp; Time</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider">Job # / Client</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider">Item</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider text-right">Qty</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider text-right">Unit Cost</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider text-right">Total</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReport.map((row, idx) => (
                  <TableRow key={`${row.jobNumber}-${row.itemName}-${idx}`} className="hover:bg-muted/20 transition-colors">
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-xs">{formatDate(row.date)}</span>
                        <span className="text-[10px] text-muted-foreground">{formatTime(row.date)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold">{row.jobNumber}</span>
                        <span className="text-[10px] text-muted-foreground truncate max-w-[150px]">{row.clientName}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{row.itemName}</span>
                          {row.isReturn && <Badge variant="outline" className="text-[8px] h-4 bg-orange-500/10 text-orange-600 border-orange-500/20 px-1 py-0 font-black">RETURN</Badge>}
                        </div>
                        {row.sku && row.sku !== 'N/A' && <span className="text-[10px] font-mono text-muted-foreground">{row.sku}</span>}
                      </div>
                    </TableCell>
                    <TableCell className={`text-right font-bold tabular-nums ${row.isReturn ? 'text-orange-600' : ''}`}>
                      {row.qty > 0 ? '+' : ''}{row.qty}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(row.unitCost)}</TableCell>
                    <TableCell className={`text-right font-black tabular-nums ${row.isReturn ? 'text-orange-600' : ''}`}>
                      {formatCurrency(row.totalCost)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={`text-[10px] px-2 py-0 h-5 ${row.isDeducted ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-orange-500/10 text-orange-600 border-orange-500/20'}`}>
                        {row.isDeducted ? 'SYNCED' : 'PENDING'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
        <div className="p-4 rounded-xl border border-brand-primary/10 bg-brand-primary/5 space-y-1">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Net Inventory Consumption</p>
          <p className="text-2xl font-black tabular-nums">{formatCurrency(totalConsumption)}</p>
        </div>
        <div className="p-4 rounded-xl border border-emerald-500/10 bg-emerald-500/5 space-y-1">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Deducted (Synced) Value</p>
          <p className="text-2xl font-black tabular-nums text-emerald-600">{formatCurrency(deductedValue)}</p>
        </div>
        <div className="p-4 rounded-xl border border-orange-500/10 bg-orange-500/5 space-y-1">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Pending Reconciliation</p>
          <p className="text-2xl font-black tabular-nums text-orange-600">{formatCurrency(pendingValue)}</p>
        </div>
      </div>
    </div>
  )
}
