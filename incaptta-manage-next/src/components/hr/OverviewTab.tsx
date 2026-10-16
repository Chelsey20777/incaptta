import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Users, User, Calendar, Wallet, ClipboardList, Briefcase, Landmark, AlertTriangle, Plus, Trash2, Check, X, FileText, Percent, DollarSign, Phone, Mail, Building2, ShieldCheck, ShieldAlert, Clock, CheckCircle2, XCircle, Edit3, Search } from 'lucide-react'
import { toast } from 'sonner'

// ─── OVERVIEW TAB ──────────────────────────────────────────────────────────
export function OverviewTab({ store, fmt, getEmpName }: any) {
  const totalPayroll = store.employees.reduce((s: number, e: any) => s + (e.salary || 0), 0)
  const activeCount = store.employees.filter((e: any) => e.isActive !== false).length
  const onLeave = store.employees.filter((e: any) => e.status === 'On Leave').length
  const pendingLeaves = store.leaveRequests.filter((l: any) => l.status === 'Pending')

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <Card className="border shadow-sm bg-card/60"><CardContent className="p-4 text-center space-y-1">
          <Users className="size-6 mx-auto text-blue-400" />
          <p className="text-2xl font-black">{store.employees.length}</p>
          <p className="text-[10px] font-bold uppercase text-muted-foreground">Total Employees</p>
        </CardContent></Card>
        <Card className="border shadow-sm bg-card/60"><CardContent className="p-4 text-center space-y-1">
          <CheckCircle2 className="size-6 mx-auto text-green-400" />
          <p className="text-2xl font-black text-green-500">{activeCount}</p>
          <p className="text-[10px] font-bold uppercase text-muted-foreground">Active</p>
        </CardContent></Card>
        <Card className="border shadow-sm bg-card/60"><CardContent className="p-4 text-center space-y-1">
          <Calendar className="size-6 mx-auto text-amber-400" />
          <p className="text-2xl font-black text-amber-500">{onLeave}</p>
          <p className="text-[10px] font-bold uppercase text-muted-foreground">On Leave</p>
        </CardContent></Card>
        <Card className="border shadow-sm bg-card/60"><CardContent className="p-4 text-center space-y-1">
          <DollarSign className="size-6 mx-auto text-[#ff8903]" />
          <p className="text-2xl font-black text-[#ff8903]">{fmt(totalPayroll)}</p>
          <p className="text-[10px] font-bold uppercase text-muted-foreground">Total Payroll</p>
        </CardContent></Card>
      </div>

      {pendingLeaves.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-black uppercase text-muted-foreground">Pending Leave Requests</h3>
          {pendingLeaves.slice(0, 5).map((l: any) => (
            <Card key={l.id} className="border shadow-sm"><CardContent className="p-3 flex items-center justify-between">
              <div><p className="text-sm font-bold">{l.employeeName}</p><p className="text-xs text-muted-foreground">{l.type} — {l.startDate} to {l.endDate}</p></div>
              <div className="flex gap-1">
                <Button size="sm" className="h-7 w-7 p-0 bg-green-500/20 text-green-600" onClick={() => store.updateLeaveStatus(l.id, 'Approved')}><Check className="size-3" /></Button>
                <Button size="sm" className="h-7 w-7 p-0 bg-red-500/20 text-red-600" onClick={() => store.updateLeaveStatus(l.id, 'Rejected')}><X className="size-3" /></Button>
              </div>
            </CardContent></Card>
          ))}
        </div>
      )}
    </div>
  )
}

