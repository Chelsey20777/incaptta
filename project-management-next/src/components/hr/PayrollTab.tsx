import React, { useState } from 'react'
import Link from 'next/link'
import { db } from '@/lib/firebase'
import { collection, doc, getDoc, getDocs } from 'firebase/firestore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Calculator, Download, Trash2, X, Loader2, Check, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { useAdminStore } from '@/stores/admin-store'
import { effectivePayrollApproval, manualPayrollAllowances, payrollGrossEarnings } from '@/stores/hr-utils'
import type { Payroll } from '@/stores/hr-types'
import {
  downloadPayslipPDF,
  loadPayrollPostingsForPayslip,
} from '@/features/hr/utils/generatePayslipPdf'

function payrollStatusLabel(p: any): { label: string; className: string } {
  if (p.status === 'Paid') {
    return { label: 'Paid', className: 'bg-green-500/10 text-green-600 border-green-500/20' }
  }
  const approval = effectivePayrollApproval(p)
  if (approval === 'PENDING_MANAGER') {
    return { label: 'Pending Approval', className: 'bg-amber-500/10 text-amber-600 border-amber-500/20' }
  }
  return { label: 'Ready to Pay', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' }
}

export function PayrollTab({ store, fmt, getEmpName }: any) {
  const authStore = useAuthStore()
  const adminStore = useAdminStore()
  const isAdmin = authStore.isSuperAdmin() || authStore.hasRole('ADMIN' as any)
  const isManager = authStore.hasRole('MANAGER' as any) || authStore.hasRole('DIRECTOR' as any) || isAdmin
  const isAccountant = authStore.hasRole('ACCOUNTANT' as any) || isAdmin
  const userName = authStore.user?.displayName || authStore.user?.email || 'Manager'

  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1)
  const [filterYear, setFilterYear] = useState(new Date().getFullYear())
  const [filterStatus, setFilterStatus] = useState('all')
  const [showGen, setShowGen] = useState(false)
  const [editingPayroll, setEditingPayroll] = useState<Payroll | null>(null)
  const [showPay, setShowPay] = useState<any>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  
  // Job Earnings breakdown popover state
  const [showBreakdown, setShowBreakdown] = useState(false)
  const [selectedBreakdown, setSelectedBreakdown] = useState<any>(null)
  const [breakdownPostings, setBreakdownPostings] = useState<any[]>([])
  const [loadingBreakdown, setLoadingBreakdown] = useState(false)

  const [genForm, setGenForm] = useState({
    employeeId: '',
    month: filterMonth,
    year: filterYear,
    basicSalary: 0,
    allowances: 0,
    paye: 0,
    nssa: 0,
    aidsLevy: 0,
    zimdef: 0,
    wcif: 0,
    damagesDeduction: 0,
    uniformDeduction: 0,
    advanceInstallments: {} as Record<string, number>
  })
  const [payForm, setPayForm] = useState({ payrollId: '', netPay: 0, paymentMethod: 'SALARIES' })
  const isJobCardOnlyPayroll = (p: any) =>
    Number(p?.jobCardEarnings || 0) > 0 && Number(p?.basicSalary || 0) === 0

  const filtered = store.payrolls.filter((p: any) => {
    if (p.month !== filterMonth || p.year !== filterYear) return false
    if (filterStatus === 'all') return true
    if (filterStatus === 'Paid' || filterStatus === 'Unpaid') return p.status === filterStatus
    if (filterStatus === 'Pending Approval') {
      return p.status === 'Unpaid' && effectivePayrollApproval(p) === 'PENDING_MANAGER'
    }
    if (filterStatus === 'Ready to Pay') {
      return p.status === 'Unpaid' && effectivePayrollApproval(p) === 'APPROVED_MANAGER'
    }
    return true
  })

  const totalNetPay = filtered.reduce((s: number, p: any) => s + (p.netPay || 0), 0)
  const totalPaid = filtered.filter((p: any) => p.status === 'Paid').reduce((s: number, p: any) => s + (p.netPay || 0), 0)
  const totalUnpaid = filtered.filter((p: any) => p.status === 'Unpaid').reduce((s: number, p: any) => s + (p.netPay || 0), 0)
  const pendingApprovalCount = store.payrolls.filter(
    (p: any) =>
      p.month === filterMonth &&
      p.year === filterYear &&
      p.status === 'Unpaid' &&
      effectivePayrollApproval(p) === 'PENDING_MANAGER'
  ).length

  const onEmpChange = (empId: string) => {
    const emp = store.employees.find((e: any) => e.id === empId)
    if (emp) {
      const basicSalary = emp.salary || 0
      const st = store.calculateTaxDeductions(basicSalary)
      setGenForm({
        ...genForm,
        employeeId: empId,
        basicSalary,
        allowances: 0,
        paye: st.paye,
        nssa: st.nssa,
        aidsLevy: st.aidsLevy,
        zimdef: st.zimdef,
        wcif: st.wcif,
        damagesDeduction: 0,
        uniformDeduction: 0,
        advanceInstallments: {}
      })
    }
  }

  const handleAutoCalc = () => {
    const gross = payrollGrossEarnings({
      basicSalary: genForm.basicSalary,
      manualAllowances: genForm.allowances,
      jobCardEarnings: editingPayroll?.jobCardEarnings || 0
    })
    const st = store.calculateTaxDeductions(gross)
    setGenForm({
      ...genForm,
      paye: st.paye,
      nssa: st.nssa,
      aidsLevy: st.aidsLevy,
      zimdef: st.zimdef,
      wcif: st.wcif
    })
  }

  const activeAdvances = store.activeAdvancesForEmp(genForm.employeeId)
  const pendingAdvanceAmount = Object.values(genForm.advanceInstallments).reduce((sum, amount) => sum + Number(amount || 0), 0)
  const totalDeductions = genForm.paye + genForm.nssa + genForm.aidsLevy + genForm.zimdef + genForm.wcif + pendingAdvanceAmount + genForm.damagesDeduction + genForm.uniformDeduction
  const jobCardEarnings = Number(editingPayroll?.jobCardEarnings || 0)
  const grossEarnings = payrollGrossEarnings({
    basicSalary: genForm.basicSalary,
    manualAllowances: genForm.allowances,
    jobCardEarnings
  })
  const netPay = grossEarnings - totalDeductions

  const openGenerate = () => {
    setEditingPayroll(null)
    setGenForm({
      employeeId: '', month: filterMonth, year: filterYear, basicSalary: 0,
      allowances: 0, paye: 0, nssa: 0, aidsLevy: 0, zimdef: 0, wcif: 0,
      damagesDeduction: 0, uniformDeduction: 0, advanceInstallments: {}
    })
    setShowGen(true)
  }

  const openEdit = (p: Payroll) => {
    if (p.status === 'Paid') return
    setEditingPayroll(p)
    setGenForm({
      employeeId: p.employeeId,
      month: p.month,
      year: p.year,
      basicSalary: Number(p.basicSalary || 0),
      allowances: manualPayrollAllowances(p),
      paye: Number(p.paye || 0),
      nssa: Number(p.nssa || 0),
      aidsLevy: Number(p.aidsLevy || 0),
      zimdef: Number(p.zimdef || 0),
      wcif: Number(p.wcif || 0),
      damagesDeduction: Number(p.damagesDeduction || 0),
      uniformDeduction: Number(p.uniformDeduction || 0),
      advanceInstallments: p.advanceInstallments || {}
    })
    setShowGen(true)
  }

  const handleGen = async () => {
    if (!genForm.employeeId) return
    const amounts = [
      genForm.basicSalary, genForm.allowances, genForm.paye, genForm.nssa,
      genForm.aidsLevy, genForm.zimdef, genForm.wcif,
      genForm.damagesDeduction, genForm.uniformDeduction
    ]
    if (amounts.some(value => !Number.isFinite(value) || value < 0)) {
      toast.error('Payroll amounts must be valid non-negative numbers')
      return
    }
    if (genForm.month < 1 || genForm.month > 12 || genForm.year < 2000) {
      toast.error('Select a valid payroll period')
      return
    }
    if (netPay < 0) {
      toast.error('Deductions cannot exceed gross earnings')
      return
    }
    const emp = store.employees.find((e: any) => e.id === genForm.employeeId)
    await store.generatePayroll({
      ...genForm,
      employeeName: getEmpName(emp),
      netPay,
      actor: { uid: authStore.user?.uid || 'unknown', name: userName, email: authStore.user?.email || '' }
    })
    setShowGen(false)
    setEditingPayroll(null)
  }

  const handlePay = async () => { await store.payPayroll(payForm.payrollId, payForm.paymentMethod); setShowPay(null) }

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
      const employee =
        store.employees.find((e: any) => e.id === p.employeeId) || null
      const postings = await loadPayrollPostingsForPayslip(p)
      await downloadPayslipPDF(
        p,
        employee,
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

  const handleOpenBreakdown = async (p: any) => {
    setSelectedBreakdown(p)
    setShowBreakdown(true)
    setLoadingBreakdown(true)
    setBreakdownPostings([])
    try {
      const snap = await getDocs(collection(db, 'jobCards'))
      const list: any[] = []
      snap.docs.forEach((doc) => {
        const jc = doc.data()
        const rates = jc.staffRates || []
        rates.forEach((r: any) => {
          if (r.employeeId === p.employeeId && r.approvalStatus === 'APPROVED_MANAGER') {
            const rateDate = r.approvedAt ? new Date(r.approvedAt) : null
            if (rateDate) {
              const m = rateDate.getMonth() + 1
              const y = rateDate.getFullYear()
              if (m === p.month && y === p.year) {
                list.push({
                  id: `${doc.id}-${r.id || Math.random()}`,
                  jobNumber: jc.generalInfo?.jobNumber || 'JC',
                  description: r.employeeName && r.employeeName !== r.employeeId
                    ? r.employeeName
                    : (r.description || r.role || 'Labor Rate'),
                  amount: r.jobRateAmount || 0
                })
              }
            }
          }
        })
      })
      setBreakdownPostings(list)
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingBreakdown(false)
    }
  }

  return (<div className="space-y-4">
    <div className="flex items-center gap-2">
      <select value={filterMonth} onChange={e => setFilterMonth(Number(e.target.value))} className="h-9 px-2 rounded-xl border bg-background text-xs font-bold">{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{new Date(0,i).toLocaleString('default',{month:'short'})}</option>)}</select>
      <select value={filterYear} onChange={e => setFilterYear(Number(e.target.value))} className="h-9 px-2 rounded-xl border bg-background text-xs font-bold">{[2024,2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}</select>
      <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="h-9 px-2 rounded-xl border bg-background text-xs font-bold">
        <option value="all">All</option>
        <option value="Pending Approval">Pending Approval{pendingApprovalCount > 0 ? ` (${pendingApprovalCount})` : ''}</option>
        <option value="Ready to Pay">Ready to Pay</option>
        <option value="Unpaid">Unpaid</option>
        <option value="Paid">Paid</option>
      </select>
      <Button size="sm" className="bg-[#ff8903] text-white font-bold h-9" onClick={openGenerate}><Plus className="size-3"/> Generate</Button>
    </div>

    <div className="grid grid-cols-3 gap-2 text-center text-xs">
      <div className="p-2.5 bg-muted/30 rounded-xl border">
        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Total Net Pay</span>
        <p className="font-black text-sm text-slate-800 dark:text-slate-200 mt-0.5">{fmt(totalNetPay)}</p>
      </div>
      <div className="p-2.5 bg-muted/30 rounded-xl border">
        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Total Paid</span>
        <p className="font-black text-sm text-green-500 mt-0.5">{fmt(totalPaid)}</p>
      </div>
      <div className="p-2.5 bg-muted/30 rounded-xl border">
        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Total Unpaid</span>
        <p className="font-black text-sm text-amber-500 mt-0.5">{fmt(totalUnpaid)}</p>
      </div>
    </div>
    <div className="border rounded-2xl overflow-hidden bg-card border-border shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-black uppercase text-muted-foreground">Employee</th>
              <th className="text-right px-4 py-3 font-black uppercase text-muted-foreground">Basic</th>
              <th className="text-right px-4 py-3 font-black uppercase text-muted-foreground">Allowances</th>
              <th className="text-right px-4 py-3 font-black uppercase text-muted-foreground">Job Earnings</th>
              <th className="text-right px-4 py-3 font-black uppercase text-muted-foreground">Deductions</th>
              <th className="text-right px-4 py-3 font-black uppercase text-muted-foreground">Net Pay</th>
              <th className="text-center px-4 py-3 font-black uppercase text-muted-foreground">Status</th>
              <th className="text-right px-4 py-3 font-black uppercase text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-muted-foreground italic">
                  No payroll records for this period.
                </td>
              </tr>
            ) : (
              filtered.map((p: any) => (
                <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-black text-green-600 dark:text-green-500">
                    <Link href={`/hr/${p.employeeId}`} className="hover:underline">
                      {p.employeeName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-medium">
                    {fmt(p.basicSalary)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-green-600 dark:text-green-500">
                    +{fmt(manualPayrollAllowances(p))}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {p.jobCardEarnings && p.jobCardEarnings > 0 ? (
                      <Badge
                        variant="outline"
                        className="cursor-pointer font-mono text-amber-600 border-amber-400/40 bg-amber-50 dark:bg-amber-950/20 hover:bg-amber-100 transition-colors text-[10px] font-black h-5 px-1.5"
                        onClick={() => handleOpenBreakdown(p)}
                      >
                        +{fmt(p.jobCardEarnings)}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-red-500">
                    -{fmt(p.deductions)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-black text-sm">
                    {fmt(p.netPay)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {(() => {
                      const st = payrollStatusLabel(p)
                      return (
                        <Badge variant="outline" className={`text-[9px] font-black uppercase h-5 px-2 ${st.className}`}>
                          {st.label}
                        </Badge>
                      )
                    })()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      {p.status === 'Unpaid' && effectivePayrollApproval(p) === 'PENDING_MANAGER' && isManager && (
                        <Button
                          size="sm"
                          className="h-7 px-2.5 bg-amber-500/20 text-amber-700 dark:text-amber-400 text-[10px] font-black border border-amber-500/20 hover:bg-amber-500/30"
                          onClick={() => store.approvePayroll(p.id!, userName)}
                        >
                          <Check className="size-3 mr-1" /> Approve
                        </Button>
                      )}
                      {p.status === 'Unpaid' && (isAccountant || isManager) && (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-blue-600 hover:bg-blue-500/15" title="Edit payroll" onClick={() => openEdit(p)}>
                          <Pencil className="size-3.5" />
                        </Button>
                      )}
                      {p.status === 'Unpaid' && effectivePayrollApproval(p) === 'APPROVED_MANAGER' && (isAccountant || isManager) && (
                        <Button size="sm" className="h-7 px-2.5 bg-emerald-500/20 text-emerald-600 dark:text-emerald-500 text-[10px] font-black border border-emerald-500/10 hover:bg-emerald-500/30" onClick={() => {
                          const defaultMethod =
                            isJobCardOnlyPayroll(p) || Number(p.jobCardEarnings || 0) > 0
                              ? 'SALARIES'
                              : 'BANK'
                          setPayForm({ payrollId: p.id!, netPay: p.netPay, paymentMethod: defaultMethod })
                          setShowPay(p)
                        }}>
                          Pay
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
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
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:bg-red-500/15" onClick={() => { if (confirm('Delete?')) store.deletePayrollRecord(p) }}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>

    {showBreakdown && (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-card border shadow-2xl rounded-3xl overflow-hidden">
          <CardHeader className="pb-2 border-b flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-black">Job Earnings Breakdown</CardTitle>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Staff rates for {selectedBreakdown?.employeeName} in {new Date(2020, selectedBreakdown?.month - 1).toLocaleString('default', { month: 'long' })} {selectedBreakdown?.year}
              </p>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setShowBreakdown(false)}>
              <X className="size-4" />
            </Button>
          </CardHeader>
          <CardContent className="p-4 max-h-[50vh] overflow-y-auto space-y-2">
            {loadingBreakdown ? (
              <div className="flex flex-col items-center justify-center py-8 space-y-2">
                <Loader2 className="size-6 text-[#ff8903] animate-spin" />
                <p className="text-[10px] font-bold text-muted-foreground uppercase">Loading breakdown...</p>
              </div>
            ) : breakdownPostings.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6 italic">No staff rates found for this period.</p>
            ) : (
              breakdownPostings.map((rate) => (
                <div key={rate.id} className="p-3 rounded-xl border bg-muted/10 flex items-center justify-between text-xs">
                  <div>
                    <p className="font-black text-slate-800 dark:text-slate-200">{rate.jobNumber}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{rate.description}</p>
                  </div>
                  <span className="font-mono font-bold text-amber-600">+{fmt(rate.amount)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    )}
    
    {showGen && (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <Card className="w-full max-w-3xl bg-card border shadow-2xl rounded-3xl max-h-[90vh] overflow-y-auto">
          <CardHeader className="pb-2 border-b">
            <CardTitle className="text-lg font-black">{editingPayroll ? 'Edit Payroll Entry' : 'Generate Payroll Entry'}</CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Left Column: Earnings & Employee */}
              <div className="space-y-3">
                <h3 className="text-xs font-black uppercase text-muted-foreground tracking-wider">Earnings & Period</h3>
                <div className="space-y-2 p-3 rounded-2xl border bg-muted/10">
                  <div className="space-y-1">
                    <Label className="text-xs font-black uppercase text-muted-foreground">Employee</Label>
                    <select disabled={!!editingPayroll} value={genForm.employeeId} onChange={e => onEmpChange(e.target.value)} className="w-full h-10 px-3 rounded-xl border bg-background text-sm disabled:opacity-60"><option value="">Select Employee</option>{store.employees.map((e: any) => <option key={e.id} value={e.id}>{getEmpName(e)}</option>)}</select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs font-black uppercase text-muted-foreground">Month</Label>
                      <select disabled={!!editingPayroll} value={genForm.month} onChange={e => setGenForm({...genForm, month: Number(e.target.value)})} className="w-full h-10 px-3 rounded-xl border bg-background text-sm disabled:opacity-60">{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{new Date(0,i).toLocaleString('default',{month:'short'})}</option>)}</select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-black uppercase text-muted-foreground">Year</Label>
                      <Input disabled={!!editingPayroll} type="number" value={genForm.year} onChange={e => setGenForm({...genForm, year: Number(e.target.value)})} className="h-10" />
                    </div>
                  </div>
                </div>

                <div className="space-y-2 p-3 rounded-2xl border bg-muted/10">
                  <div className="space-y-1">
                    <Label className="text-xs font-black uppercase text-muted-foreground">Basic Salary ($)</Label>
                    <Input type="number" value={genForm.basicSalary} onChange={e => setGenForm({...genForm, basicSalary: Number(e.target.value)})} className="h-10 font-mono" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <Label className="text-xs font-black uppercase text-muted-foreground">Allowances ($)</Label>
                      <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 text-emerald-600 px-1.5 hover:bg-emerald-500/10" onClick={handleAutoCalc}>
                        <Calculator className="size-3" /> Auto-Calc
                      </Button>
                    </div>
                    <Input type="number" value={genForm.allowances} onChange={e => setGenForm({...genForm, allowances: Number(e.target.value)})} className="h-10 font-mono" />
                  </div>
                  {jobCardEarnings > 0 && (
                    <div className="flex items-center justify-between rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs">
                      <span className="font-black uppercase text-amber-700 dark:text-amber-400">Job-card earnings (locked)</span>
                      <span className="font-mono font-black text-amber-600">+{fmt(jobCardEarnings)}</span>
                    </div>
                  )}
                </div>

                {activeAdvances.length > 0 && <div className="p-3 rounded-xl border border-blue-500/20 bg-blue-500/5 space-y-2">
                  <div><p className="font-bold text-blue-600 uppercase text-[10px]">Salary advance instalments</p><p className="text-[9px] text-muted-foreground">Enter the recovery amount for this payroll; zero defers recovery.</p></div>
                  {activeAdvances.map((advance: any) => {
                    const existing = Number(editingPayroll?.advanceInstallments?.[advance.id] || 0)
                    const available = Number(advance.outstandingBalance || 0) - Number(advance.reservedBalance || 0) + existing
                    return <div key={advance.id} className="grid grid-cols-[1fr_120px] gap-2 items-center"><div><p className="text-[10px] font-bold">{advance.employeeName}</p><p className="text-[9px] text-muted-foreground">Available {fmt(available)}</p></div><Input type="number" min="0" max={available} step="0.01" className="h-8 text-xs" value={genForm.advanceInstallments[advance.id] || 0} onChange={e => setGenForm({...genForm, advanceInstallments: {...genForm.advanceInstallments, [advance.id]: Number(e.target.value)}})} /></div>
                  })}
                  <div className="flex justify-between text-[10px] font-black text-red-500"><span>Selected recovery</span><span>-{fmt(pendingAdvanceAmount)}</span></div>
                </div>}
              </div>

              {/* Right Column: Deductions */}
              <div className="space-y-3">
                <h3 className="text-xs font-black uppercase text-muted-foreground tracking-wider">Deductions</h3>
                <div className="p-3 rounded-2xl border bg-muted/10 space-y-3">
                  <div>
                    <h4 className="text-[10px] font-black uppercase text-muted-foreground mb-1">Statutory</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold uppercase text-muted-foreground">AIDS Levy ($)</Label>
                        <Input type="number" value={genForm.aidsLevy} onChange={e => setGenForm({...genForm, aidsLevy: Number(e.target.value)})} className="h-8 text-xs font-mono" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold uppercase text-muted-foreground">NSSA ($)</Label>
                        <Input type="number" value={genForm.nssa} onChange={e => setGenForm({...genForm, nssa: Number(e.target.value)})} className="h-8 text-xs font-mono" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold uppercase text-muted-foreground">ZIMDEF ($)</Label>
                        <Input type="number" value={genForm.zimdef} onChange={e => setGenForm({...genForm, zimdef: Number(e.target.value)})} className="h-8 text-xs font-mono" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold uppercase text-muted-foreground">WCIF ($)</Label>
                        <Input type="number" value={genForm.wcif} onChange={e => setGenForm({...genForm, wcif: Number(e.target.value)})} className="h-8 text-xs font-mono" />
                      </div>
                      <div className="space-y-1 col-span-2">
                        <Label className="text-[10px] font-bold uppercase text-muted-foreground">P.A.Y.E ($)</Label>
                        <Input type="number" value={genForm.paye} onChange={e => setGenForm({...genForm, paye: Number(e.target.value)})} className="h-8 text-xs font-mono" />
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-dashed">
                    <h4 className="text-[10px] font-black uppercase text-muted-foreground mb-1">Non-Statutory</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold uppercase text-muted-foreground">Damages ($)</Label>
                        <Input type="number" value={genForm.damagesDeduction} onChange={e => setGenForm({...genForm, damagesDeduction: Number(e.target.value)})} className="h-8 text-xs font-mono" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold uppercase text-muted-foreground">Uniform ($)</Label>
                        <Input type="number" value={genForm.uniformDeduction} onChange={e => setGenForm({...genForm, uniformDeduction: Number(e.target.value)})} className="h-8 text-xs font-mono" />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-2 border-t text-xs font-bold text-red-500">
                    <span className="uppercase text-[9px] text-muted-foreground">Total Deductions</span>
                    <span>-${fmt(totalDeductions)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/10 flex justify-between items-center mt-2">
              <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">Net Pay</span>
              <span className="text-2xl font-black text-[#ff8903] font-mono">{fmt(netPay)}</span>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1 rounded-xl font-bold" onClick={() => { setShowGen(false); setEditingPayroll(null) }}>Cancel</Button>
              <Button className="flex-1 rounded-xl font-bold bg-[#ff8903] text-white" disabled={!genForm.employeeId || store.isSubmitting} onClick={handleGen}>{store.isSubmitting ? 'Saving...' : editingPayroll ? 'Save Changes' : 'Generate'}</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )}
    {showPay&&(<div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"><Card className="w-full max-w-sm bg-card border shadow-2xl rounded-3xl"><CardContent className="p-6 space-y-4"><h3 className="text-lg font-black">Pay {showPay.employeeName}</h3><p className="text-sm">Net Pay: <span className="font-black">{fmt(showPay.netPay)}</span></p><div className="space-y-1"><Label className="text-xs font-black uppercase text-muted-foreground">Payment Method</Label>{isJobCardOnlyPayroll(showPay) ? (<select value="SALARIES" disabled className="w-full h-10 px-3 rounded-xl border bg-muted text-sm"><option value="SALARIES">Salaries Account</option></select>) : (<select value={payForm.paymentMethod} onChange={e=>setPayForm({...payForm,paymentMethod:e.target.value})} className="w-full h-10 px-3 rounded-xl border bg-background text-sm"><option value="SALARIES">Salaries Account</option><option value="BANK">Bank Transfer</option><option value="CASH">Cash</option><option value="ECOCASH">EcoCash</option></select>)}{isJobCardOnlyPayroll(showPay) && <p className="text-[11px] text-muted-foreground">Job-card staff rates fulfill from the Salaries account.</p>}</div><div className="flex gap-3"><Button variant="outline" className="flex-1 rounded-xl font-bold" onClick={()=>setShowPay(null)}>Cancel</Button><Button className="flex-1 rounded-xl font-bold bg-emerald-600 text-white" onClick={handlePay}>Confirm Payment</Button></div></CardContent></Card></div>)}
  </div>)
}
