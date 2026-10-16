'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useHrStore } from '@/stores/hr-store'
import { OverviewTab } from '@/components/hr/OverviewTab'
import { RosterTab } from '@/components/hr/RosterTab'
import { LeaveTab } from '@/components/hr/LeaveTab'
import { PayrollTab } from '@/components/hr/PayrollTab'
import { AdvancesTab } from '@/components/hr/AdvancesTab'
import { TasksTab } from '@/components/hr/TasksTab'
import { PerformanceTab } from '@/components/hr/PerformanceTab'
import { RecruitmentTab } from '@/components/hr/RecruitmentTab'
import { SalariesTab } from '@/components/hr/SalariesTab'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ChevronLeft, Users, Search, Loader2, User, Calendar, Wallet, ClipboardList, Briefcase,
  Landmark, AlertTriangle, Plus, Trash2, Check, X, FileText, Percent, DollarSign, Phone,
  Mail, Building2, ShieldCheck, ShieldAlert, Clock, CheckCircle2, XCircle, Edit3
} from 'lucide-react'
import { toast } from 'sonner'

type Tab = 'overview' | 'roster' | 'leave' | 'payroll' | 'advances' | 'tasks' | 'performance' | 'recruitment' | 'salaries'

const tabs: Array<{ id: Tab; label: string; icon: any }> = [
  { id: 'overview', label: 'Overview', icon: Users },
  { id: 'roster', label: 'Roster', icon: User },
  { id: 'leave', label: 'Leave & Attendance', icon: Calendar },
  { id: 'payroll', label: 'Payroll & Salary', icon: Wallet },
  { id: 'advances', label: 'Advances', icon: Wallet },
  { id: 'tasks', label: 'HR Tasks', icon: ClipboardList },
  { id: 'performance', label: 'Performance', icon: Percent },
  { id: 'recruitment', label: 'Recruitment', icon: Briefcase },
  { id: 'salaries', label: 'Salaries Account', icon: Landmark },
]

export default function HrPage() {
  const router = useRouter()
  const store = useHrStore()
  const [currentTab, setCurrentTab] = useState<Tab>('overview')
  const [search, setSearch] = useState('')

  useEffect(() => {
    store.startListeners()
    return () => store.cleanup()
  }, [])

  const fmt = store.fmt
  const getEmpName = store.getEmpName

  // Tab content renders
  const renderTab = () => {
    switch (currentTab) {
      case 'overview': return <OverviewTab store={store} fmt={fmt} getEmpName={getEmpName} />
      case 'roster': return <RosterTab store={store} fmt={fmt} getEmpName={getEmpName} />
      case 'leave': return <LeaveTab store={store} fmt={fmt} getEmpName={getEmpName} />
      case 'payroll': return <PayrollTab store={store} fmt={fmt} getEmpName={getEmpName} />
      case 'advances': return <AdvancesTab store={store} fmt={fmt} getEmpName={getEmpName} />
      case 'tasks': return <TasksTab store={store} fmt={fmt} getEmpName={getEmpName} />
      case 'performance': return <PerformanceTab store={store} fmt={fmt} getEmpName={getEmpName} />
      case 'recruitment': return <RecruitmentTab store={store} fmt={fmt} getEmpName={getEmpName} />
      case 'salaries': return <SalariesTab store={store} fmt={fmt} getEmpName={getEmpName} />
    }
  }

  return (
    <div className="flex-1 flex flex-col pb-20 bg-background min-h-screen">
      <header className="sticky top-0 z-10 bg-card border-b px-4 py-4 flex items-center gap-4 shadow-sm">
        <Button variant="ghost" size="icon" onClick={() => router.push('/')}><ChevronLeft className="size-6" /></Button>
        <div className="flex-1">
          <h1 className="text-xl font-black tracking-tight">HR</h1>
          <p className="text-xs text-muted-foreground">Human Resources Management</p>
        </div>
        <Badge className="bg-[#ff8903] text-white text-[10px] font-black h-5 px-2">{store.employees.length}</Badge>
      </header>

      {/* Tab Bar */}
      <div className="sticky top-[60px] z-10 bg-card border-b px-2 py-1.5 overflow-x-auto flex gap-0.5 shadow-sm">
        {tabs.map(tab => (
          <Button key={tab.id} variant={currentTab === tab.id ? 'default' : 'ghost'} size="sm"
            className={`text-[10px] font-black px-2.5 h-8 rounded-lg whitespace-nowrap ${currentTab === tab.id ? 'bg-[#ff8903] text-white' : 'text-muted-foreground'}`}
            onClick={() => setCurrentTab(tab.id)}>
            <tab.icon className="size-3 mr-1" />{tab.label}
          </Button>
        ))}
      </div>

      <main className="flex-1 px-4 py-4">{renderTab()}</main>
    </div>
  )
}

