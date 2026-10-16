'use client'

import { accrualPayrollEnabled } from '@/lib/payroll/client'
import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, Lock, Users, Wallet, RefreshCw, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import EditableCell from './EditableCell'
import EarningMonthPicker from './EarningMonthPicker'
import { useHrStore } from '@/stores/hr-store'
import { getEmpName } from '@/stores/hr-utils'
import type { StaffRate } from '../types'

/** Staff rates always accumulate and fulfill via the Salaries wallet. */
const STAFF_RATE_ACCOUNT = 'SALARIES'
const STAFF_EARNING_PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/

function hasValidEarningMonth(item: StaffRate) {
  if (!accrualPayrollEnabled) return true
  return STAFF_EARNING_PERIOD_RE.test(item.earningPeriod || '')
}

function currentEarningPeriod() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

const looksLikeIdentifier = (value?: string) => {
  const v = (value || '').trim()
  if (!v) return false
  const noSpaces = !/\s/.test(v)
  const hasBothCases = /[a-z]/.test(v) && /[A-Z]/.test(v)
  const hasDigits = /\d/.test(v)
  return noSpaces && v.length >= 12 && (hasBothCases || hasDigits)
}

interface StaffRatesGridProps {
  modelValue: StaffRate[]
  generalInfo?: any
  isAdmin?: boolean
  isAccountant?: boolean
  isManager?: boolean
  isJobApproved?: boolean
  onUpdate: (rates: StaffRate[]) => void
  onApproveItem?: (itemId: string, status: string) => void | Promise<void>
  onApproveAll?: (status: string) => void | Promise<void>
  /** Reconcile approved rates onto HR payroll (repairs missed postings). */
  onSyncPayroll?: () => void | Promise<void>
}

export default function StaffRatesGrid({
  modelValue,
  generalInfo,
  isAdmin = false,
  isAccountant = false,
  isManager = false,
  isJobApproved = false,
  onUpdate,
  onApproveItem,
  onApproveAll,
  onSyncPayroll,
}: StaffRatesGridProps) {
  const hrStore = useHrStore()
  const [isMobile, setIsMobile] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const autoSyncedRef = useRef(false)

  const approvedPayableRates = useMemo(
    () =>
      modelValue.filter(
        (r) =>
          r.approvalStatus === 'APPROVED_MANAGER' &&
          !!r.employeeId &&
          Number(r.jobRateAmount) > 0
      ),
    [modelValue]
  )

  useEffect(() => {
    hrStore.fetchEmployees()
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Auto-reconcile once when the grid opens with manager-approved rates that
  // may be missing from payroll (stale logs / failed posts).
  useEffect(() => {
    if (accrualPayrollEnabled || autoSyncedRef.current || !onSyncPayroll) return
    if (approvedPayableRates.length === 0) return
    if (!(isManager || isAdmin || isAccountant)) return
    autoSyncedRef.current = true
    void (async () => {
      setSyncing(true)
      try {
        await onSyncPayroll()
      } finally {
        setSyncing(false)
      }
    })()
  }, [approvedPayableRates.length, onSyncPayroll, isManager, isAdmin, isAccountant])

  const handleSyncPayroll = async () => {
    if (!onSyncPayroll || syncing) return
    setSyncing(true)
    try {
      await onSyncPayroll()
    } finally {
      setSyncing(false)
    }
  }

  // Rates that reached manager approval (or were posted to payroll) are locked
  // for everyone, admins included — editing or deleting them would leave the
  // amounts already posted to payroll out of sync with the job card.
  // Accountant approval does not lock; rows stay editable until manager approval.
  const isRowLocked = (item: StaffRate) => {
    return !!(item.payrollPosted || item.approvalStatus === 'APPROVED_MANAGER')
  }

  const columns = [
    { key: 'index', label: '#', width: 'w-[40px]', editable: false, align: 'center' as const },
    { key: 'employeeId', label: 'Name', editable: true },
    { key: 'employmentCode', label: 'Emp. Code', width: 'w-[12%]', editable: false },
    { key: 'nationalId', label: 'ID. Number', width: 'w-[12%]', editable: false },
    { key: 'jobRateAmount', label: 'Job Rate Amount', width: 'w-[12%]', editable: true, align: 'right' as const },
    ...(accrualPayrollEnabled
      ? [{ key: 'earningPeriod', label: 'Earning Month', width: 'w-[14%] min-w-[140px]', editable: true, align: 'left' as const }]
      : []),
    { key: 'paymentMethod', label: 'Funding Account', width: 'w-[12%] min-w-[100px]', editable: false },
    { key: 'approvalStatus', label: 'Status', width: 'w-[16%]', editable: false },
  ]

  const employeeOptions = useMemo(() => {
    const byId = new Map<string, { value: string; label: string }>()

    for (const e of hrStore.employees || []) {
      if (!e?.id) continue
      byId.set(e.id, {
        value: e.id,
        label: getEmpName(e),
      })
    }

    // Preserve readable labels for existing rows even when HR profile shape
    // changed or the employee list is still syncing. Reject stored labels that
    // look like machine identifiers so legacy polluted rows can't overwrite a
    // valid HR-derived name.
    for (const row of modelValue || []) {
      if (!row?.employeeId) continue
      const existing = byId.get(row.employeeId)
      const rowLabel = (row.employeeName || '').trim()
      if (
        rowLabel &&
        !looksLikeIdentifier(rowLabel) &&
        (!existing || existing.label === 'Unnamed Employee' || looksLikeIdentifier(existing.label))
      ) {
        byId.set(row.employeeId, { value: row.employeeId, label: rowLabel })
      }
    }

    return Array.from(byId.values())
  }, [hrStore.employees, modelValue])

  const getEmployee = (employeeId: string) => hrStore.employees.find((e: any) => e.id === employeeId)

  const getEmploymentCode = (employeeId: string) => {
    const emp = getEmployee(employeeId)
    return emp?.id?.slice(-6).toUpperCase() || 'N/A'
  }

  const getNationalId = (employeeId: string) => {
    const emp = getEmployee(employeeId)
    return emp?.nationalId || 'N/A'
  }

  const getEmployeeDisplayName = (item: StaffRate) => {
    const rowName = (item.employeeName || '').trim()
    if (rowName && rowName !== item.employeeId && !looksLikeIdentifier(rowName)) {
      return rowName
    }

    const emp = getEmployee(item.employeeId)
    if (emp) {
      const hrName = (getEmpName(emp) || '').trim()
      if (hrName && hrName !== 'Unnamed Employee') return hrName
    }

    const code = getEmploymentCode(item.employeeId)
    if (code && code !== 'N/A') return `Employee ${code}`
    return 'Unnamed Employee'
  }

  const filteredRates = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const indexed = (modelValue || []).map((item, originalIdx) => ({ item, originalIdx }))
    if (!q) return indexed
    return indexed.filter(({ item }) => {
      // Keep incomplete/new staff rows visible while assigning an employee
      if (!(item.employeeId || '').trim()) return true
      const name = getEmployeeDisplayName(item).toLowerCase()
      return (
        name.includes(q) ||
        (item.employeeName || '').toLowerCase().includes(q) ||
        'salaries'.includes(q)
      )
    })
  }, [modelValue, searchQuery, hrStore.employees])

  const getStatusBadgeClass = (status?: string) => {
    switch (status) {
      case 'APPROVED_MANAGER':
        return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
      case 'APPROVED_ACCOUNTANT':
        return 'bg-blue-500/10 text-blue-600 border-blue-500/20'
      case 'REJECTED':
        return 'bg-red-500/10 text-red-600 border-red-500/20'
      default:
        return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'
    }
  }

  const updateItem = (index: number, field: keyof StaffRate, value: any) => {
    const item = modelValue[index]
    if (!item || isRowLocked(item)) return
    const newItems = [...modelValue]
    if (field === 'employeeId') {
      const nextId = String(value || '')
      const emp = getEmployee(nextId)
      const hrName = emp ? (getEmpName(emp) || '').trim() : ''
      const safeName =
        hrName && hrName !== 'Unnamed Employee' && !looksLikeIdentifier(hrName) ? hrName : ''
      newItems[index] = {
        ...item,
        employeeId: nextId,
        employeeName: safeName,
        paymentMethod: STAFF_RATE_ACCOUNT,
      }
    } else {
      newItems[index] = { ...item, [field]: value, paymentMethod: STAFF_RATE_ACCOUNT }
    }
    // Existing rows created before accrual UI often lack a month — default once.
    if (
      accrualPayrollEnabled &&
      !STAFF_EARNING_PERIOD_RE.test(newItems[index].earningPeriod || '')
    ) {
      newItems[index] = { ...newItems[index], earningPeriod: currentEarningPeriod() }
    }
    onUpdate(newItems)
  }

  const requestApproveItem = (item: StaffRate, status: string) => {
    if (status !== 'REJECTED' && !hasValidEarningMonth(item)) {
      toast.error('Set the staff rate earning month before approving it')
      return
    }
    void onApproveItem?.(item.id!, status)
  }

  const requestApproveAll = (status: string) => {
    if (accrualPayrollEnabled && status !== 'REJECTED') {
      const missing = modelValue.find(
        (r) =>
          !!r.employeeId &&
          Number(r.jobRateAmount) > 0 &&
          !r.payrollPosted &&
          !hasValidEarningMonth(r)
      )
      if (missing) {
        toast.error('Set the staff rate earning month before approving it')
        return
      }
    }
    void onApproveAll?.(status)
  }

  const removeItem = (index: number) => {
    const item = modelValue[index]
    if (!item || isRowLocked(item)) return
    const newItems = modelValue.filter((_, i) => i !== index)
    onUpdate(newItems)
  }

  const addNewRow = () => {
    setSearchQuery('')
    const newItem: StaffRate = {
      id: crypto.randomUUID(),
      employeeId: '',
      jobRateAmount: 0,
      paymentMethod: STAFF_RATE_ACCOUNT,
      createdAt: new Date().toISOString(),
      ...(accrualPayrollEnabled ? { earningPeriod: currentEarningPeriod() } : {}),
    }
    onUpdate([...modelValue, newItem])
  }

  const pendingRates = useMemo(
    () => modelValue.filter((r) => !r.approvalStatus || r.approvalStatus === 'PENDING'),
    [modelValue]
  )
  const accountantOkRates = useMemo(
    () => modelValue.filter((r) => r.approvalStatus === 'APPROVED_ACCOUNTANT'),
    [modelValue]
  )
  // Managers may perform the accountant step (store allows it). Prefer that when
  // PENDING rows remain so "Approve All (Manager)" is not a no-op on PENDING.
  const approveAllTarget =
    (isAccountant || isManager) && pendingRates.length > 0
      ? 'APPROVED_ACCOUNTANT'
      : isManager
        ? 'APPROVED_MANAGER'
        : 'APPROVED_ACCOUNTANT'
  const approveAllLabel =
    approveAllTarget === 'APPROVED_MANAGER' ? '(Manager)' : '(Accountant)'
  const canApprovePending = isAccountant || isManager

  return (
    <div className="border rounded-md overflow-hidden bg-background font-sans">
      {/* General Info Header */}
      {generalInfo && (
        <div className="bg-muted/30 border-b px-4 py-2 flex flex-wrap items-center gap-x-8 gap-y-2 text-[11px] w-full">
          <div className="flex items-center gap-2">
            <span className="font-bold text-muted-foreground uppercase tracking-tight">Job #:</span>
            <span className="font-mono text-primary font-bold">{generalInfo.jobNumber || 'N/A'}</span>
          </div>
          {generalInfo.projectLocation && (
            <div className="flex items-center gap-2">
              <span className="font-bold text-muted-foreground uppercase tracking-tight">Location:</span>
              <span className="font-medium truncate max-w-[200px]">{generalInfo.projectLocation}</span>
            </div>
          )}
          {generalInfo.recipientName && (
            <div className="flex items-center gap-2 border-l pl-8">
              <span className="font-bold text-muted-foreground uppercase tracking-tight">Customer:</span>
              <span className="font-bold text-foreground">{generalInfo.recipientName}</span>
            </div>
          )}
          {(isAccountant || isManager || isAdmin) && (
            <div className="ml-auto flex items-center gap-2">
              {!accrualPayrollEnabled && approvedPayableRates.length > 0 && onSyncPayroll && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={syncing}
                  className="h-6 text-[10px] font-bold border-amber-500/40 text-amber-700 hover:bg-amber-50"
                  onClick={() => void handleSyncPayroll()}
                >
                  <RefreshCw className={`size-3 mr-1 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Syncing…' : 'Sync to Payroll'}
                </Button>
              )}
              {isJobApproved && (isAccountant || isManager) && onApproveAll && (pendingRates.length > 0 || accountantOkRates.length > 0) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] font-bold border-green-500/40 text-green-600 hover:bg-green-50"
                  onClick={() => requestApproveAll(approveAllTarget)}
                >
                  Approve All {approveAllLabel}
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="relative max-w-sm px-4 py-2 border-b">
        <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search staff…"
          className="pl-8 h-8"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto max-h-[400px] overflow-y-auto relative">
        {!isMobile ? (
          <Table className={`border-collapse table-fixed w-full border-t border-l border-white/80 ${accrualPayrollEnabled ? 'min-w-[900px]' : 'min-w-[700px]'}`}>
            <TableHeader className="sticky top-0 bg-background z-40 border-b border-white/80 shadow-sm">
              <TableRow className="h-10 hover:bg-transparent">
                {columns.map((col) => (
                  <TableHead
                    key={col.key}
                    className={`${col.width || ''} ${col.align === 'right' ? 'text-right' : ''} text-[12px] font-bold px-2 border-r border-b border-white/80`}
                  >
                    {col.label}
                  </TableHead>
                ))}
                <TableHead className="w-[50px] border-b border-r border-white/80"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRates.length === 0 && searchQuery.trim() && (
                <TableRow>
                  <TableCell colSpan={columns.length + 1} className="text-center py-10 text-sm text-muted-foreground">
                    No matching staff rates
                  </TableCell>
                </TableRow>
              )}
              {filteredRates.map(({ item, originalIdx }, displayIdx) => (
                <TableRow
                  key={item.id}
                  className={`group h-10 border-b border-white/80 ${isRowLocked(item) ? 'bg-muted/20 opacity-70' : 'hover:bg-muted/30'}`}
                >
                  <TableCell className="text-center tabular-nums font-bold text-[11px] opacity-50 border-r border-b border-white/80">
                    {displayIdx + 1}
                  </TableCell>
                  <TableCell className="p-0 border-r border-b border-white/80">
                    {isRowLocked(item) ? (
                      <div className="px-2 py-1 text-sm truncate font-medium">
                        {getEmployeeDisplayName(item)}
                      </div>
                    ) : (
                      <EditableCell
                        value={item.employeeId}
                        type="select"
                        options={employeeOptions}
                        onUpdate={(v) => updateItem(originalIdx, 'employeeId', v)}
                        placeholder="Select employee..."
                      />
                    )}
                  </TableCell>
                  <TableCell className="p-0 border-r border-b border-white/80 bg-muted/10">
                    <div className="px-2 py-1 text-[12px] text-muted-foreground">
                      {getEmploymentCode(item.employeeId)}
                    </div>
                  </TableCell>
                  <TableCell className="p-0 border-r border-b border-white/80 bg-muted/10">
                    <div className="px-2 py-1 text-[12px] text-muted-foreground">
                      {getNationalId(item.employeeId)}
                    </div>
                  </TableCell>
                  <TableCell className="p-0 border-r border-b border-white/80">
                    <EditableCell
                      value={item.jobRateAmount}
                      type="currency"
                      readOnly={isRowLocked(item)}
                      onUpdate={(v) => updateItem(originalIdx, 'jobRateAmount', Number(v) || 0)}
                    />
                  </TableCell>
                  {accrualPayrollEnabled && (
                    <TableCell className="p-0 border-r border-b border-white/80 overflow-hidden min-w-[140px]">
                      <div className="px-1.5 py-1">
                        <EarningMonthPicker
                          value={item.earningPeriod || ''}
                          disabled={isRowLocked(item)}
                          onChange={(period) => updateItem(originalIdx, 'earningPeriod', period)}
                        />
                      </div>
                    </TableCell>
                  )}
                  <TableCell className="p-0 border-r border-b border-white/80 text-xs min-w-[100px] bg-muted/10">
                    <div className="px-2 py-1.5 text-[12px] font-medium text-muted-foreground">
                      Salaries
                    </div>
                  </TableCell>
                  <TableCell className="p-0 border-r border-b border-white/80 text-center overflow-hidden">
                    <div className="flex items-center justify-center gap-1 py-1 px-1">
                      <Badge
                        className={`h-5 text-[10px] font-black uppercase tracking-wider ${getStatusBadgeClass(item.approvalStatus)}`}
                      >
                        {item.approvalStatus?.replace('_', ' ') || 'PENDING'}
                      </Badge>
                      {isJobApproved && (
                        <>
                          {(!item.approvalStatus || item.approvalStatus === 'PENDING') && canApprovePending && (
                            <div className="flex items-center gap-0.5 shrink-0">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className={cn(
                                  'h-5 w-5 text-emerald-500 hover:bg-emerald-50',
                                  !hasValidEarningMonth(item) && 'opacity-40'
                                )}
                                title={!hasValidEarningMonth(item) ? 'Set earning month first' : 'Approve'}
                                onClick={() => requestApproveItem(item, 'APPROVED_ACCOUNTANT')}
                              >
                                <svg className="size-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 text-red-500 hover:bg-red-50"
                                onClick={() => requestApproveItem(item, 'REJECTED')}
                              >
                                <svg className="size-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                              </Button>
                            </div>
                          )}
                          {item.approvalStatus === 'APPROVED_ACCOUNTANT' && isManager && (
                            <div className="flex items-center gap-0.5 shrink-0">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className={cn(
                                  'h-5 w-5 text-emerald-500 hover:bg-emerald-50',
                                  !hasValidEarningMonth(item) && 'opacity-40'
                                )}
                                title={!hasValidEarningMonth(item) ? 'Set earning month first' : 'Approve'}
                                onClick={() => requestApproveItem(item, 'APPROVED_MANAGER')}
                              >
                                <svg className="size-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 text-red-500 hover:bg-red-50"
                                onClick={() => requestApproveItem(item, 'REJECTED')}
                              >
                                <svg className="size-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                              </Button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="p-0 text-center border-r border-b border-white/80">
                    {isRowLocked(item) ? (
                      <Lock className="size-3 mx-auto text-muted-foreground/50" />
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100"
                        onClick={() => removeItem(originalIdx)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          /* Mobile View */
          <div className="space-y-6 px-2 py-4">
            {filteredRates.length === 0 && searchQuery.trim() && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <h4 className="text-sm font-bold text-muted-foreground">No matching staff rates</h4>
              </div>
            )}
            {filteredRates.map(({ item, originalIdx }, displayIdx) => (
              <div
                key={item.id}
                className="relative overflow-hidden rounded-2xl border bg-card shadow-lg p-4 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <span className="flex size-7 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-black text-white">
                    {displayIdx + 1}
                  </span>
                  <Badge
                    className={`h-5 text-[8px] font-black uppercase ${getStatusBadgeClass(item.approvalStatus)}`}
                  >
                    {item.approvalStatus?.replace('_', ' ') || 'PENDING'}
                  </Badge>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-muted-foreground/70 ml-1">
                    Staff Member
                  </label>
                  {isRowLocked(item) ? (
                    <div className="h-12 w-full rounded-xl border border-border/60 bg-background/50 flex items-center px-4 text-sm font-medium">
                      {getEmployeeDisplayName(item)}
                    </div>
                  ) : (
                    <select
                      value={item.employeeId}
                      onChange={(e) => updateItem(originalIdx, 'employeeId', e.target.value)}
                      className="h-12 w-full rounded-xl border-border/60 bg-background px-4 text-sm"
                    >
                      <option value="">Select Employee...</option>
                      {employeeOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-muted-foreground/60 ml-1">
                      Emp. Code
                    </label>
                    <div className="h-11 w-full rounded-xl border border-border/60 bg-background/50 flex items-center px-4 text-xs font-bold text-muted-foreground">
                      {getEmploymentCode(item.employeeId) || '—'}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-muted-foreground/60 ml-1">
                      National ID
                    </label>
                    <div className="h-11 w-full rounded-xl border border-border/60 bg-background/50 flex items-center px-4 text-xs font-bold text-muted-foreground">
                      {getNationalId(item.employeeId) || '—'}
                    </div>
                  </div>
                </div>

                <div className={`grid gap-4 ${accrualPayrollEnabled ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2'}`}>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-muted-foreground/60 ml-1">
                      Job Rate ($)
                    </label>
                    <input
                      type="number"
                      value={item.jobRateAmount}
                      onChange={(e) => updateItem(originalIdx, 'jobRateAmount', Number(e.target.value))}
                      className="h-12 w-full rounded-xl border-border/60 bg-background px-4 text-base font-black text-emerald-600"
                    />
                  </div>
                  {accrualPayrollEnabled && (
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-muted-foreground/60 ml-1">
                        Earning Month
                      </label>
                      <EarningMonthPicker
                        size="lg"
                        value={item.earningPeriod || ''}
                        disabled={isRowLocked(item)}
                        onChange={(period) => updateItem(originalIdx, 'earningPeriod', period)}
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-muted-foreground/60 ml-1 flex items-center gap-1">
                      <Wallet className="size-3" /> Funding Account
                    </label>
                    <div className="h-12 w-full rounded-xl border border-border/60 bg-background/50 flex items-center px-4 text-sm font-bold text-muted-foreground">
                      Salaries
                    </div>
                  </div>
                </div>

                {isJobApproved && (
                  <div className="pt-2 flex items-center justify-between border-t border-dashed">
                    <span className="text-[9px] font-black uppercase text-muted-foreground/60">Approvals</span>
                    <div className="flex items-center gap-1.5">
                      {(!item.approvalStatus || item.approvalStatus === 'PENDING') && canApprovePending && (
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className={cn(
                              'h-6 px-2 text-[9px] font-black text-emerald-600 border-emerald-500/30 hover:bg-emerald-50 bg-emerald-50/50',
                              !hasValidEarningMonth(item) && 'opacity-40'
                            )}
                            title={!hasValidEarningMonth(item) ? 'Set earning month first' : 'Approve'}
                            onClick={() => requestApproveItem(item, 'APPROVED_ACCOUNTANT')}
                          >
                            Approve
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 text-[9px] font-black text-red-600 border-red-500/30 hover:bg-red-50 bg-red-50/50"
                            onClick={() => requestApproveItem(item, 'REJECTED')}
                          >
                            Reject
                          </Button>
                        </div>
                      )}
                      {item.approvalStatus === 'APPROVED_ACCOUNTANT' && isManager && (
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className={cn(
                              'h-6 px-2 text-[9px] font-black text-emerald-600 border-emerald-500/30 hover:bg-emerald-50 bg-emerald-50/50',
                              !hasValidEarningMonth(item) && 'opacity-40'
                            )}
                            title={!hasValidEarningMonth(item) ? 'Set earning month first' : 'Approve'}
                            onClick={() => requestApproveItem(item, 'APPROVED_MANAGER')}
                          >
                            Approve
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 text-[9px] font-black text-red-600 border-red-500/30 hover:bg-red-50 bg-red-50/50"
                            onClick={() => requestApproveItem(item, 'REJECTED')}
                          >
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {!isRowLocked(item) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full text-destructive border border-destructive/10"
                    onClick={() => removeItem(originalIdx)}
                  >
                    <Trash2 className="size-4 mr-1" /> Remove
                  </Button>
                )}
              </div>
            ))}

            {modelValue.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Users className="size-10 text-muted-foreground/30 mb-2" />
                <h4 className="text-base font-black text-muted-foreground">No Staff Assigned</h4>
                <p className="text-sm text-muted-foreground/60">Add staff members to this job card.</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="p-2 border-t bg-muted/5">
        <Button type="button" variant="outline" size="sm" className="h-8 border-dashed" onClick={addNewRow}>
          <Plus className="size-4 mr-1" /> Add Row
        </Button>
      </div>
    </div>
  )
}