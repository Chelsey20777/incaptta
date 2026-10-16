'use client'

import React, { useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useHrStore } from '@/stores/hr-store'
import { useAuthStore } from '@/stores/auth-store'
import { effectivePayrollApproval, fmt } from '@/stores/hr-utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Check, Wallet } from 'lucide-react'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

export default function PaymentSubmissionsPage() {
  const store = useHrStore()
  const authStore = useAuthStore()
  const isAdmin = authStore.isSuperAdmin() || authStore.hasRole('ADMIN' as any)
  const isManager = authStore.hasRole('MANAGER' as any) || authStore.hasRole('DIRECTOR' as any) || isAdmin
  const userName = authStore.user?.displayName || authStore.user?.email || 'Manager'

  useEffect(() => {
    store.startListeners()
    return () => store.cleanup()
  }, [])

  const pending = useMemo(
    () =>
      store.payrolls
        .filter(
          (p) =>
            p.status === 'Unpaid' &&
            p.generated !== false &&
            effectivePayrollApproval(p) === 'PENDING_MANAGER'
        )
        .sort((a, b) => (b.year - a.year) || (b.month - a.month)),
    [store.payrolls]
  )

  return (
    <div className="space-y-4 p-4 max-w-4xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight">Pay Review</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manager approval for basic-salary payroll before accountants can pay.
            Job-card staff rates skip this step — they were already approved on the job card.
          </p>
        </div>
        <Badge className="bg-amber-500 text-white font-black h-6 px-2.5">
          {pending.length} pending
        </Badge>
      </div>

      {!isManager && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-4 text-sm text-amber-800 dark:text-amber-300">
            Only managers can approve payroll here. Accountants pay approved items from{' '}
            <Link href="/hr" className="underline font-bold">HR → Payroll</Link>.
          </CardContent>
        </Card>
      )}

      {pending.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Wallet className="size-10 mx-auto mb-3 opacity-30" />
            <p className="font-bold">No payroll awaiting manager approval</p>
            <p className="text-xs mt-1">Generated basic-salary records will appear here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {pending.map((p) => (
            <Card key={p.id} className="border">
              <CardHeader className="py-3 px-4 flex flex-row items-center justify-between gap-3 space-y-0">
                <div>
                  <CardTitle className="text-base font-black">{p.employeeName}</CardTitle>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {MONTH_NAMES[p.month - 1]} {p.year}
                    {Number(p.basicSalary || 0) > 0 && (
                      <span className="ml-2">· Basic {fmt(p.basicSalary)}</span>
                    )}
                    {Number(p.jobCardEarnings || 0) > 0 && (
                      <span className="ml-2">· Job {fmt(p.jobCardEarnings)}</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono font-black text-sm">{fmt(p.netPay)}</span>
                  {isManager && (
                    <Button
                      size="sm"
                      className="h-8 bg-amber-500 hover:bg-amber-600 text-white font-black text-xs"
                      onClick={() => store.approvePayroll(p.id!, userName)}
                    >
                      <Check className="size-3.5 mr-1" /> Approve
                    </Button>
                  )}
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
