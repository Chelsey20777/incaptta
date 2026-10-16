'use client'

import React, { useEffect, useState } from 'react'
import { useHrStore } from '@/stores/hr-store'
import { OverviewTab } from '@/components/hr/OverviewTab'
import { RosterTab } from '@/components/hr/RosterTab'
import { LeaveTab } from '@/components/hr/LeaveTab'
import { AccrualPayrollTab } from '@/components/hr/AccrualPayrollTab'
import { accrualPayrollEnabled } from '@/lib/payroll/client'
import { PayrollTab } from '@/components/hr/PayrollTab'
import { AdvancesTab } from '@/components/hr/AdvancesTab'
import { TasksTab } from '@/components/hr/TasksTab'
import { PerformanceTab } from '@/components/hr/PerformanceTab'
import { RecruitmentTab } from '@/components/hr/RecruitmentTab'
import { SalariesTab } from '@/components/hr/SalariesTab'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Users, User, Calendar, Wallet, ClipboardList, Briefcase, Landmark, Percent } from 'lucide-react'

type Tab = 'overview' | 'roster' | 'leave' | 'payroll' | 'advances' | 'tasks' | 'performance' | 'recruitment' | 'salaries'

const tabs: Array<{ id: Tab; label: string; icon: any }> = [
  { id: 'overview', label: 'Overview', icon: Users },
  { id: 'roster', label: 'Roster', icon: User },
  { id: 'leave', label: 'Leave', icon: Calendar },
  { id: 'payroll', label: 'Payroll', icon: Wallet },
  { id: 'advances', label: 'Advances', icon: Wallet },
  { id: 'tasks', label: 'Tasks', icon: ClipboardList },
  { id: 'performance', label: 'Perf', icon: Percent },
  { id: 'recruitment', label: 'Recruit', icon: Briefcase },
  { id: 'salaries', label: 'Salaries', icon: Landmark },
]

export default function HrPage() {
  const store = useHrStore()
  const [currentTab, setCurrentTab] = useState<Tab>('overview')
  useEffect(() => { store.startListeners(); return () => store.cleanup() }, [])

  const fmt = store.fmt
  const getName = store.getEmpName

  const renderTab = () => {
    switch (currentTab) {
      case 'overview': return <OverviewTab store={store} fmt={fmt} getEmpName={getName} />
      case 'roster': return <RosterTab store={store} fmt={fmt} getEmpName={getName} />
      case 'leave': return <LeaveTab store={store} fmt={fmt} getEmpName={getName} />
      case 'payroll': return accrualPayrollEnabled ? <AccrualPayrollTab /> : <PayrollTab store={store} fmt={fmt} getEmpName={getName} />
      case 'advances': return <AdvancesTab store={store} fmt={fmt} getEmpName={getName} />
      case 'tasks': return <TasksTab store={store} fmt={fmt} getEmpName={getName} />
      case 'performance': return <PerformanceTab store={store} fmt={fmt} getEmpName={getName} />
      case 'recruitment': return <RecruitmentTab store={store} fmt={fmt} getEmpName={getName} />
      case 'salaries': return <SalariesTab store={store} fmt={fmt} getEmpName={getName} />
    }
  }


  return (
    <div className="flex-1 flex flex-col pb-20 bg-background min-h-screen">
      <div className="sticky top-0 z-20 bg-background border-b shadow-sm">
        <header className="shrink-0 px-4 py-4 flex items-center gap-4">
          <div className="flex-1"><h1 className="text-xl font-black tracking-tight">HR & Payroll</h1><p className="text-xs text-muted-foreground">Human Resources Management</p></div>
          <Badge className="bg-[#ff8903] text-white text-[10px] font-black h-5 px-2">{store.employees.length}</Badge>
        </header>
        <div className="shrink-0 px-2 py-1.5 overflow-x-auto scrollbar-thin flex gap-0.5 border-t border-border/40">
          {tabs.map(tab => (
            <Button key={tab.id} variant={currentTab === tab.id ? 'default' : 'ghost'} size="sm"
              className={`text-[10px] font-black px-2.5 h-8 rounded-lg whitespace-nowrap ${currentTab === tab.id ? 'bg-[#ff8903] text-white' : 'text-muted-foreground'}`}
              onClick={() => setCurrentTab(tab.id)}><tab.icon className="size-3 mr-1" />{tab.label}</Button>
          ))}
        </div>
      </div>
      <main className="flex-1 px-4 py-4">{renderTab()}</main>
    </div>
  )
}