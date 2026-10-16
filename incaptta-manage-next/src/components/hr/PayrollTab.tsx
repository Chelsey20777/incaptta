import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Users, User, Calendar, Wallet, ClipboardList, Briefcase, Landmark, AlertTriangle, Plus, Trash2, Check, X, FileText, Percent, DollarSign, Phone, Mail, Building2, ShieldCheck, ShieldAlert, Clock, CheckCircle2, XCircle, Edit3, Search } from 'lucide-react'
import { toast } from 'sonner'

// ─── PAYROLL TAB ────────────────────────────────────────────────────────────
export function PayrollTab({ store, fmt, getEmpName }: any) {
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1)
  const [filterYear, setFilterYear] = useState(new Date().getFullYear())
  const [filterStatus, setFilterStatus] = useState('all')
  const [showGen, setShowGen] = useState(false)
  const [showPay, setShowPay] = useState<any>(null)
  const [genForm, setGenForm] = useState({ employeeId: '', month: filterMonth, year: filterYear, basicSalary: 0, allowances: 0, paye: 0, nssa: 0, aidsLevy: 0, zimdef: 0, wcif: 0, damagesDeduction: 0, uniformDeduction: 0 })
  const [payForm, setPayForm] = useState({ payrollId: '', netPay: 0, paymentMethod: 'BANK' })

  const filteredPayrolls = store.payrolls.filter((p: any) => {
    if (filterStatus !== 'all' && p.status !== filterStatus) return false
    return p.month === filterMonth && p.year === filterYear
  })

  const onEmpChange = (empId: string) => {
    const emp = store.employees.find((e: any) => e.id === empId)
    if (emp) {
      const stats = store.calculateTaxDeductions(emp.salary || 0)
      setGenForm({
        ...genForm, employeeId: empId, basicSalary: emp.salary || 0, paye: stats.paye, nssa: stats.nssa,
        aidsLevy: stats.aidsLevy, zimdef: stats.zimdef, wcif: stats.wcif
      })
    }
  }

  const genNetPay = genForm.basicSalary + genForm.allowances - genForm.paye - genForm.nssa - genForm.aidsLevy - store.activeAdvancesTotalForEmp(genForm.employeeId) - genForm.damagesDeduction - genForm.uniformDeduction

  const handleGen = async () => {
    if (!genForm.employeeId) return
    const emp = store.employees.find((e: any) => e.id === genForm.employeeId)
    await store.generatePayroll({ ...genForm, employeeName: getEmpName(emp), netPay: genNetPay, deductions: genForm.paye + genForm.nssa + genForm.aidsLevy + store.activeAdvancesTotalForEmp(genForm.employeeId) + genForm.damagesDeduction + genForm.uniformDeduction })
    setShowGen(false)
  }

  const handlePay = async () => {
    await store.payPayroll(payForm.payrollId, payForm.paymentMethod)
    setShowPay(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <select value={filterMonth} onChange={e => setFilterMonth(Number(e.target.value))} className="h-9 px-2 rounded-xl border bg-background text-xs font-bold">
          {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{new Date(0, i).toLocaleString('default', { month: 'short' })}</option>)}
        </select>
        <select value={filterYear} onChange={e => setFilterYear(Number(e.target.value))} className="h-9 px-2 rounded-xl border bg-background text-xs font-bold">
          {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="h-9 px-2 rounded-xl border bg-background text-xs font-bold">
          <option value="all">All</option><option value="Unpaid">Unpaid</option><option value="Paid">Paid</option>
        </select>
        <Button size="sm" className="bg-[#ff8903] text-white font-bold text-xs ml-auto" onClick={() => { setGenForm({ employeeId: '', month: filterMonth, year: filterYear, basicSalary: 0, allowances: 0, paye: 0, nssa: 0, aidsLevy: 0, zimdef: 0, wcif: 0, damagesDeduction: 0, uniformDeduction: 0 }); setShowGen(true) }}>
          <Plus className="size-3" /> Generate
        </Button>
      </div>

      {filteredPayrolls.map((p: any) => (
        <Card key={p.id} className="border shadow-sm"><CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold">{p.employeeName}</p>
              <p className="text-[10px] text-muted-foreground">Basic: {fmt(p.basicSalary)} | Net: <span className="font-bold text-foreground">{fmt(p.netPay)}</span></p>
            </div>
            <div className="flex items-center gap-1">
              <Badge variant="outline" className={`text-[9px] font-bold ${p.status === 'Paid' ? 'text-green-600 border-green-500/30' : 'text-amber-600 border-amber-500/30'}`}>{p.status}</Badge>
              {p.status === 'Unpaid' && (
                <Button size="sm" className="h-7 text-[10px] bg-emerald-600 text-white font-bold" onClick={() => { setPayForm({ payrollId: p.id, netPay: p.netPay, paymentMethod: 'BANK' }); setShowPay(p) }}>Pay</Button>
              )}
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" onClick={() => { if (confirm('Delete payroll?')) store.deletePayrollRecord(p) }}><Trash2 className="size-3" /></Button>
            </div>
          </div>
        </CardContent></Card>
      ))}

      {showGen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-card border shadow-2xl rounded-3xl max-h-[85vh] overflow-y-auto">
            <CardHeader className="pb-3"><CardTitle className="text-lg font-black">Generate Payroll</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1"><Label className="text-xs font-black uppercase text-muted-foreground">Employee</Label>
                <select value={genForm.employeeId} onChange={e => onEmpChange(e.target.value)} className="w-full h-10 px-3 rounded-xl border bg-background text-sm">
                  <option value="">Select</option>
                  {store.employees.map((e: any) => <option key={e.id} value={e.id}>{getEmpName(e)}</option>)}
                </select></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs font-black uppercase text-muted-foreground">Basic Salary</Label><Input type="number" value={genForm.basicSalary} onChange={e => setGenForm({...genForm, basicSalary: Number(e.target.value)})} className="h-9 text-xs" /></div>
                <div><Label className="text-xs font-black uppercase text-muted-foreground">Allowances</Label><Input type="number" value={genForm.allowances} onChange={e => setGenForm({...genForm, allowances: Number(e.target.value)})} className="h-9 text-xs" /></div>
              </div>
              <div className="grid grid-cols-3 gap-1 text-[10px]">
                <div className="p-2 bg-muted/30 rounded-lg"><span className="text-muted-foreground">PAYE</span><p className="font-bold">{fmt(genForm.paye)}</p></div>
                <div className="p-2 bg-muted/30 rounded-lg"><span className="text-muted-foreground">NSSA</span><p className="font-bold">{fmt(genForm.nssa)}</p></div>
                <div className="p-2 bg-muted/30 rounded-lg"><span className="text-muted-foreground">AIDS Levy</span><p className="font-bold">{fmt(genForm.aidsLevy)}</p></div>
              </div>
              <div className="flex justify-between text-sm font-black text-[#ff8903] pt-2 border-t">
                <span>Net Pay</span><span>{fmt(genNetPay)}</span>
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1 rounded-xl font-bold" onClick={() => setShowGen(false)}>Cancel</Button>
                <Button className="flex-1 rounded-xl font-bold bg-[#ff8903] text-white" onClick={handleGen}>Generate</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {showPay && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-sm bg-card border shadow-2xl rounded-3xl">
            <CardContent className="p-6 space-y-4">
              <h3 className="text-lg font-black">Pay {showPay.employeeName}</h3>
              <p className="text-sm">Net Pay: <span className="font-black">{fmt(showPay.netPay)}</span></p>
              <div className="space-y-1"><Label className="text-xs font-black uppercase text-muted-foreground">Payment Method</Label>
                <select value={payForm.paymentMethod} onChange={e => setPayForm({...payForm, paymentMethod: e.target.value})} className="w-full h-10 px-3 rounded-xl border bg-background text-sm">
                  <option value="BANK">Bank Transfer</option><option value="CASH">Cash</option><option value="ECOCASH">EcoCash</option><option value="SALARIES">Salaries Account</option>
                </select></div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 rounded-xl font-bold" onClick={() => setShowPay(null)}>Cancel</Button>
                <Button className="flex-1 rounded-xl font-bold bg-emerald-600 text-white" onClick={handlePay}>Confirm Payment</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

