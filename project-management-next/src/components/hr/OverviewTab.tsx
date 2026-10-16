import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Users, AlertTriangle, Briefcase, DollarSign, CheckCircle2, Clock, Loader2, Check, X } from 'lucide-react'

function statusBadge(status: string) {
  const map: Record<string, string> = {
    Active: 'bg-green-100 text-green-700 border-green-300',
    Approved: 'bg-green-100 text-green-700 border-green-300',
    Completed: 'bg-green-100 text-green-700 border-green-300',
    Open: 'bg-green-100 text-green-700 border-green-300',
    Probation: 'bg-amber-100 text-amber-700 border-amber-300',
    Pending: 'bg-amber-100 text-amber-700 border-amber-300',
    'In Progress': 'bg-amber-100 text-amber-700 border-amber-300',
    'On Leave': 'bg-amber-100 text-amber-700 border-amber-300',
    Terminated: 'bg-red-100 text-red-700 border-red-300',
    Rejected: 'bg-red-100 text-red-700 border-red-300',
    Overdue: 'bg-red-100 text-red-700 border-red-300',
    Closed: 'bg-red-100 text-red-700 border-red-300',
  }
  return map[status] || 'bg-gray-100 text-gray-600 border-gray-300'
}

function priorityBadge(priority: string) {
  const map: Record<string, string> = {
    Critical: 'bg-red-100 text-red-700 border-red-300',
    High: 'bg-amber-100 text-amber-700 border-amber-300',
    Medium: 'bg-blue-100 text-blue-700 border-blue-300',
    Low: 'bg-gray-100 text-gray-600 border-gray-300',
  }
  return map[priority] || map.Low
}

export function OverviewTab({ store, fmt, getEmpName }: any) {
  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const currentYear = now.getFullYear()

  // KPI calculations
  const totalEmployees = store.employees.filter((e: any) => e.status !== 'Terminated').length
  const monthlyPayrollTotal = store.payrolls
    .filter((p: any) => p.month === currentMonth && p.year === currentYear)
    .reduce((s: number, p: any) => s + (p.netPay || 0), 0)
  const openPositions = store.jobPostings.filter((j: any) => j.status === 'Open').length
  const overdueTasks = store.hrTasks.filter((t: any) => t.status === 'Overdue').length

  // Task summary
  const pendingTasks = store.hrTasks.filter((t: any) => t.status === 'Pending').length
  const inProgressTasks = store.hrTasks.filter((t: any) => t.status === 'In Progress').length
  const completedTasks = store.hrTasks.filter((t: any) => t.status === 'Completed').length

  // Recent tasks (non-completed, sorted by due date ascending)
  const recentTasks = store.hrTasks
    .filter((t: any) => t.status !== 'Completed')
    .sort((a: any, b: any) => {
      if (!a.dueDate) return 1
      if (!b.dueDate) return -1
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    })
    .slice(0, 8)

  // Pending leave requests
  const pendingLeaves = store.leaveRequests.filter((l: any) => l.status === 'Pending')

  return (
    <div className="space-y-5">
      {/* KPI Cards - 2x2 Grid */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border shadow-sm bg-card/60">
          <CardContent className="p-4 text-center space-y-1">
            <Users className="size-6 mx-auto text-blue-400" />
            <p className="text-2xl font-black">{totalEmployees}</p>
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Total Employees</p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm bg-card/60">
          <CardContent className="p-4 text-center space-y-1">
            <DollarSign className="size-6 mx-auto text-[#ff8903]" />
            <p className="text-2xl font-black text-[#ff8903]">{fmt(monthlyPayrollTotal)}</p>
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Monthly Payroll</p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm bg-card/60">
          <CardContent className="p-4 text-center space-y-1">
            <Briefcase className="size-6 mx-auto text-green-400" />
            <p className="text-2xl font-black text-green-500">{openPositions}</p>
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Open Positions</p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm bg-card/60">
          <CardContent className="p-4 text-center space-y-1">
            <AlertTriangle className="size-6 mx-auto text-red-400" />
            <p className="text-2xl font-black text-red-500">{overdueTasks}</p>
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Overdue Tasks</p>
          </CardContent>
        </Card>
      </div>

      {/* Task Summary Status Grid */}
      <div>
        <h3 className="text-xs font-black uppercase text-muted-foreground mb-2">Task Summary</h3>
        <div className="grid grid-cols-3 gap-3">
          <Card className="border shadow-sm bg-card/60">
            <CardContent className="p-3 text-center space-y-0.5">
              <Clock className="size-5 mx-auto text-amber-400" />
              <p className="text-xl font-black">{pendingTasks}</p>
              <p className="text-[9px] font-bold uppercase text-muted-foreground">Pending</p>
            </CardContent>
          </Card>
          <Card className="border shadow-sm bg-card/60">
            <CardContent className="p-3 text-center space-y-0.5">
              <Loader2 className="size-5 mx-auto text-blue-400 animate-spin" />
              <p className="text-xl font-black">{inProgressTasks}</p>
              <p className="text-[9px] font-bold uppercase text-muted-foreground">In Progress</p>
            </CardContent>
          </Card>
          <Card className="border shadow-sm bg-card/60">
            <CardContent className="p-3 text-center space-y-0.5">
              <CheckCircle2 className="size-5 mx-auto text-green-400" />
              <p className="text-xl font-black">{completedTasks}</p>
              <p className="text-[9px] font-bold uppercase text-muted-foreground">Completed</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Recent Tasks Table */}
      {recentTasks.length > 0 && (
        <div>
          <h3 className="text-xs font-black uppercase text-muted-foreground mb-2">Recent Tasks</h3>
          <Card className="border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-black uppercase text-muted-foreground">Task</th>
                    <th className="text-left px-3 py-2 font-black uppercase text-muted-foreground">Assignee</th>
                    <th className="text-left px-3 py-2 font-black uppercase text-muted-foreground">Due</th>
                    <th className="text-left px-3 py-2 font-black uppercase text-muted-foreground">Priority</th>
                    <th className="text-left px-3 py-2 font-black uppercase text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTasks.map((t: any) => (
                    <tr key={t.id} className="border-t hover:bg-muted/30">
                      <td className="px-3 py-2 font-bold">{t.title}</td>
                      <td className="px-3 py-2 text-muted-foreground">{t.assignedToName || '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{t.dueDate || '—'}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={`text-[8px] h-4 px-1.5 font-bold ${priorityBadge(t.priority)}`}>{t.priority}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={`text-[8px] h-4 px-1.5 font-bold ${statusBadge(t.status)}`}>{t.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Pending Leave Requests */}
      {pendingLeaves.length > 0 && (
        <div>
          <h3 className="text-xs font-black uppercase text-muted-foreground mb-2">Pending Leave Requests</h3>
          <div className="space-y-2">
            {pendingLeaves.slice(0, 5).map((l: any) => (
              <Card key={l.id} className="border shadow-sm">
                <CardContent className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold">{l.employeeName}</p>
                    <p className="text-xs text-muted-foreground">{l.type} — {l.startDate} to {l.endDate}</p>
                    {l.reason && <p className="text-[10px] text-muted-foreground mt-0.5 italic">{l.reason}</p>}
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 bg-green-500/10 text-green-600 hover:bg-green-500/20" onClick={() => store.updateLeaveStatus(l.id, 'Approved')}>
                      <Check className="size-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 bg-red-500/10 text-red-600 hover:bg-red-500/20" onClick={() => store.updateLeaveStatus(l.id, 'Rejected')}>
                      <X className="size-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}