'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { doc, getDoc, collection, onSnapshot } from 'firebase/firestore'
import { toast } from 'sonner'
import { db } from '@/lib/firebase'
import { useHrStore } from '@/stores/hr-store'
import { useAdminStore } from '@/stores/admin-store'
import {
  downloadPayslipPDF,
  loadPayrollPostingsForPayslip,
} from '@/features/hr/utils/generatePayslipPdf'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ChevronLeft, User, Mail, Phone, FileText, Calendar, Briefcase,
  DollarSign, Percent, ClipboardList, FileCheck, Download, Loader2, Link2, Link2Off
} from 'lucide-react'
import { emailsMatch } from '@/lib/user-employee-link'

type ProfileTab = 'personal' | 'performance' | 'tasks' | 'leave' | 'payroll'

const profileTabs: Array<{ id: ProfileTab; label: string; icon: any }> = [
  { id: 'personal', label: 'Personal', icon: User },
  { id: 'performance', label: 'Perf', icon: Percent },
  { id: 'tasks', label: 'Tasks', icon: ClipboardList },
  { id: 'leave', label: 'Leave', icon: Calendar },
  { id: 'payroll', label: 'Payroll', icon: DollarSign },
]

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

function statusBadgeClass(status: string) {
  const map: Record<string, string> = {
    Active: 'bg-green-100 text-green-700 border-green-300',
    Approved: 'bg-green-100 text-green-700 border-green-300',
    Completed: 'bg-green-100 text-green-700 border-green-300',
    Paid: 'bg-green-100 text-green-700 border-green-300',
    Probation: 'bg-amber-100 text-amber-700 border-amber-300',
    Pending: 'bg-amber-100 text-amber-700 border-amber-300',
    'In Progress': 'bg-amber-100 text-amber-700 border-amber-300',
    'On Leave': 'bg-amber-100 text-amber-700 border-amber-300',
    Unpaid: 'bg-amber-100 text-amber-700 border-amber-300',
    Terminated: 'bg-red-100 text-red-700 border-red-300',
    Rejected: 'bg-red-100 text-red-700 border-red-300',
    Overdue: 'bg-red-100 text-red-700 border-red-300',
  }
  return map[status] || 'bg-gray-100 text-gray-600 border-gray-300'
}

function getInitials(name: string) {
  if (!name) return '?'
  return name.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase()
}

function hashColor(str: string) {
  const colors = ['#ff8903', '#3b82f6', '#22c55e', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

export default function EmployeeProfilePage() {
  const params = useParams()
  const router = useRouter()
  const store = useHrStore()
  const adminStore = useAdminStore()
  const [currentTab, setCurrentTab] = useState<ProfileTab>('personal')
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [users, setUsers] = useState<any[]>([])
  const [unlinking, setUnlinking] = useState(false)

  useEffect(() => {
    store.startListeners()
    return () => store.cleanup()
  }, [])

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    return () => unsub()
  }, [])

  const empId = params?.id as string
  const employee = store.employees.find((e: any) => e.id === empId)

  const handleDownloadPayslip = async (p: any) => {
    if (!p?.id) return
    setDownloadingId(p.id)
    try {
      let companySettings = adminStore.appSettings
      if (!companySettings || Object.keys(companySettings).length === 0) {
        const snap = await getDoc(doc(db, 'appSettings', 'general'))
        if (snap.exists()) {
          companySettings = { id: snap.id, ...snap.data() } as any
        }
      }
      const postings = await loadPayrollPostingsForPayslip(p)
      await downloadPayslipPDF(
        p,
        employee || null,
        p.id || 'not-verified',
        companySettings as any,
        postings
      )
      toast.success('Payslip downloaded')
    } catch (err) {
      console.error(err)
      toast.error('Failed to download payslip')
    } finally {
      setDownloadingId(null)
    }
  }

  if (store.loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (!employee) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
        <User className="size-16 text-muted-foreground/30" />
        <h2 className="text-lg font-black">Employee Not Found</h2>
        <p className="text-sm text-muted-foreground">The employee you're looking for doesn't exist or has been removed.</p>
        <Button onClick={() => router.push('/hr')} className="bg-[#ff8903] text-white font-bold">
          <ChevronLeft className="size-4 mr-1" /> Back to HR
        </Button>
      </div>
    )
  }

  const empName = store.getEmpName(employee)
  const initials = getInitials(empName)
  const avatarColor = hashColor(empId)

  // Data collections
  const empPerformanceReviews = store.performanceReviews
    .filter((r: any) => r.employeeId === empId)
    .sort((a: any, b: any) => {
      if (!a.generatedAt || !b.generatedAt) return 0
      return new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime()
    })
  const latestReview = empPerformanceReviews[0]

  const empTasks = store.hrTasks.filter((t: any) => t.assignedTo === empId)
  const empLeave = store.leaveRequests.filter((l: any) => l.employeeId === empId)
  const empPayroll = store.payrolls.filter((p: any) => p.employeeId === empId)

  const renderTabContent = () => {
    switch (currentTab) {
      case 'personal': {
        const linkedUser = employee.userId
          ? users.find((u) => u.id === employee.userId)
          : null
        const linkMismatch =
          linkedUser &&
          employee.email &&
          linkedUser.email &&
          !emailsMatch(employee.email, linkedUser.email)

        return (
          <Card className="border shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-black">Personal Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Email</p>
                  <p className="text-sm flex items-center gap-1.5"><Mail className="size-3 text-muted-foreground" />{employee.email || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Phone</p>
                  <p className="text-sm flex items-center gap-1.5"><Phone className="size-3 text-muted-foreground" />{employee.phone || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">National ID</p>
                  <p className="text-sm">{employee.nationalId || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Start Date</p>
                  <p className="text-sm">{employee.startDate || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Contract Type</p>
                  <p className="text-sm">{employee.contractType || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Basic Salary</p>
                  <p className="text-sm font-bold text-[#ff8903]">{store.fmt(employee.salary || 0)}</p>
                </div>
              </div>
              {(employee.department || employee.jobTitle || employee.position) && (
                <div className="pt-2 border-t">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Position</p>
                  <p className="text-sm">
                    {employee.jobTitle || employee.position || '—'}
                    {employee.department && <span className="text-muted-foreground"> — {employee.department}</span>}
                  </p>
                </div>
              )}
              <div className="pt-2 border-t">
                <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">App Login</p>
                {linkedUser ? (
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm flex items-center gap-1.5">
                        <Link2 className="size-3 text-blue-600" />
                        {linkedUser.name || linkedUser.email || employee.userId}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{linkedUser.email}</p>
                      {linkMismatch && (
                        <Badge variant="outline" className="mt-1 text-[9px] border-amber-300 text-amber-700">
                          Email differs from HR record
                        </Badge>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={unlinking}
                      onClick={async () => {
                        setUnlinking(true)
                        try {
                          await store.unlinkEmployee(empId)
                        } finally {
                          setUnlinking(false)
                        }
                      }}
                    >
                      <Link2Off className="size-3.5 mr-1" />
                      Unlink
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No linked app user — this employee has no login.</p>
                )}
              </div>
            </CardContent>
          </Card>
        )
      }

      case 'performance':
        return (
          <div className="space-y-4">
            <Card className="border shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm font-black">Overall Performance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {latestReview ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-muted-foreground">Period: {latestReview.period}</span>
                      <Badge variant="outline" className={`text-[10px] h-5 px-2 font-bold ${statusBadgeClass(latestReview.rating === 'Excellent' ? 'Active' : latestReview.rating === 'Good' ? 'Active' : latestReview.rating === 'Satisfactory' ? 'Pending' : 'Overdue')}`}>
                        {latestReview.rating}
                      </Badge>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold uppercase text-muted-foreground">Score</span>
                        <span className="text-sm font-black text-[#ff8903]">{Math.round(latestReview.overallScore || 0)}%</span>
                      </div>
                      <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all bg-[#ff8903]"
                          style={{ width: `${Math.min(100, latestReview.overallScore || 0)}%` }}
                        />
                      </div>
                    </div>
                    {latestReview.kpiScores && latestReview.kpiScores.length > 0 && (
                      <div className="pt-2 border-t">
                        <p className="text-[10px] font-bold uppercase text-muted-foreground mb-2">KPI Ratings</p>
                        <div className="space-y-2">
                          {latestReview.kpiScores.map((kpi: any) => (
                            <div key={kpi.kpiId} className="flex items-center justify-between">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold truncate">{kpi.kpiName}</p>
                                <div className="h-1.5 bg-muted rounded-full mt-0.5">
                                  <div className="h-full bg-[#ff8903] rounded-full" style={{ width: `${Math.min(100, kpi.weightedScore || 0)}%` }} />
                                </div>
                              </div>
                              <span className="text-xs font-black ml-2">{kpi.weightedScore || 0}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">No performance reviews yet</p>
                )}
              </CardContent>
            </Card>
            {empPerformanceReviews.length > 1 && (
              <Card className="border shadow-sm">
                <CardHeader>
                  <CardTitle className="text-sm font-black">Review History</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {empPerformanceReviews.slice(1, 5).map((r: any) => (
                      <div key={r.id} className="flex items-center justify-between text-xs">
                        <span className="font-bold">{r.period}</span>
                        <div className="flex items-center gap-2">
                          <span>{Math.round(r.overallScore || 0)}%</span>
                          <Badge variant="outline" className={`text-[8px] h-4 px-1.5 font-bold ${statusBadgeClass(r.rating === 'Excellent' ? 'Active' : r.rating === 'Good' ? 'Active' : r.rating === 'Satisfactory' ? 'Pending' : 'Overdue')}`}>
                            {r.rating}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )

      case 'tasks':
        return (
          <Card className="border shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-black">Assigned Tasks</CardTitle>
            </CardHeader>
            <CardContent>
              {empTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No tasks assigned</p>
              ) : (
                <div className="space-y-3">
                  {empTasks.map((t: any) => (
                    <div key={t.id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold">{t.title}</p>
                          {t.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.description}</p>}
                        </div>
                        <Badge variant="outline" className={`text-[8px] h-4 px-1.5 font-bold shrink-0 ml-2 ${statusBadgeClass(t.status)}`}>
                          {t.status}
                        </Badge>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[9px] font-bold uppercase text-muted-foreground">Progress</span>
                          <span className="text-xs font-black">{t.completionPercent || 0}%</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-[#ff8903] rounded-full transition-all" style={{ width: `${t.completionPercent || 0}%` }} />
                        </div>
                      </div>
                      {t.dueDate && (
                        <p className="text-[10px] text-muted-foreground">Due: {t.dueDate}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )

      case 'leave':
        return (
          <Card className="border shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-black">Leave History</CardTitle>
            </CardHeader>
            <CardContent>
              {empLeave.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No leave requests</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-3 py-2 font-black uppercase text-muted-foreground">Type</th>
                        <th className="text-left px-3 py-2 font-black uppercase text-muted-foreground">Start</th>
                        <th className="text-left px-3 py-2 font-black uppercase text-muted-foreground">End</th>
                        <th className="text-left px-3 py-2 font-black uppercase text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {empLeave.map((l: any) => (
                        <tr key={l.id} className="border-t hover:bg-muted/30">
                          <td className="px-3 py-2 font-bold">{l.type}</td>
                          <td className="px-3 py-2 text-muted-foreground">{l.startDate}</td>
                          <td className="px-3 py-2 text-muted-foreground">{l.endDate}</td>
                          <td className="px-3 py-2">
                            <Badge variant="outline" className={`text-[8px] h-4 px-1.5 font-bold ${statusBadgeClass(l.status)}`}>
                              {l.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )

      case 'payroll':
        return (
          <Card className="border shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-black">Payroll History</CardTitle>
            </CardHeader>
            <CardContent>
              {empPayroll.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No payroll records</p>
              ) : (
                <div className="space-y-2">
                  {empPayroll.map((p: any) => {
                    const monthLabel = MONTH_NAMES[(p.month || 1) - 1]
                    const gross = (p.basicSalary || 0) + (p.allowances || 0)
                    return (
                      <div key={p.id} className="border rounded-lg p-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold">{monthLabel} {p.year}</p>
                          <p className="text-[10px] text-muted-foreground">
                            Gross: {store.fmt(gross)} • Deductions: {store.fmt(p.deductions || 0)} • Net: {store.fmt(p.netPay || 0)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={`text-[8px] h-4 px-1.5 font-bold ${statusBadgeClass(p.status)}`}>
                            {p.status}
                          </Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            title="Download Payslip"
                            disabled={downloadingId === p.id}
                            onClick={() => handleDownloadPayslip(p)}
                          >
                            {downloadingId === p.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Download className="size-3.5" />
                            )}
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )
    }
  }

  return (
    <div className="flex-1 flex flex-col pb-20 bg-background min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-card border-b px-4 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()} title="Back">
            <ChevronLeft className="size-5" />
          </Button>
          <div
            className="size-12 rounded-full flex items-center justify-center shrink-0 text-white font-black text-lg"
            style={{ backgroundColor: avatarColor }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-black truncate">{empName}</h1>
            <p className="text-xs text-muted-foreground">
              {employee.jobTitle || employee.position || ''}
              {employee.department ? ` • ${employee.department}` : ''}
            </p>
          </div>
          <Badge variant="outline" className={`text-[10px] h-5 px-2 font-bold ${statusBadgeClass(employee.status || (employee.isActive !== false ? 'Active' : 'Inactive'))}`}>
            {employee.status || (employee.isActive !== false ? 'Active' : 'Inactive')}
          </Badge>
        </div>
      </header>

      {/* Tab Bar */}
      <div className="sticky top-[76px] z-10 bg-card border-b px-2 py-1.5 overflow-x-auto flex gap-0.5 shadow-sm">
        {profileTabs.map(tab => (
          <Button
            key={tab.id}
            variant={currentTab === tab.id ? 'default' : 'ghost'}
            size="sm"
            className={`text-[10px] font-black px-2.5 h-8 rounded-lg whitespace-nowrap ${currentTab === tab.id ? 'bg-[#ff8903] text-white' : 'text-muted-foreground'}`}
            onClick={() => setCurrentTab(tab.id)}
          >
            <tab.icon className="size-3 mr-1" />{tab.label}
          </Button>
        ))}
      </div>

      {/* Tab Content */}
      <main className="flex-1 px-4 py-4">
        {renderTabContent()}
      </main>
    </div>
  )
}