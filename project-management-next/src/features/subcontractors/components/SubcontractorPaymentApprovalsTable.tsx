'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Loader2, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/format'
import { normalizeAccountKey } from '@/lib/account-keys'
import { blockIfUnderfunded } from '@/lib/finance/funds-check-ui'
import { useSubcontractorsStore } from '@/stores/subcontractors-store'
import type { SubcontractorJobPayment } from '@/features/subcontractors/types'

function fmtDate(val: any): string {
  if (!val) return '—'
  if (val?.toDate) return val.toDate().toLocaleDateString('en-GB')
  if (typeof val === 'string') return new Date(val).toLocaleDateString('en-GB')
  if (val instanceof Date) return val.toLocaleDateString('en-GB')
  return String(val)
}

function statusBadge(status?: string) {
  if (status === 'APPROVED_MANAGER') return <Badge className="bg-green-600 text-white text-[10px]">Manager ✓</Badge>
  if (status === 'APPROVED_ACCOUNTANT') return <Badge className="bg-blue-600 text-white text-[10px]">Accountant ✓</Badge>
  if (status === 'REJECTED') return <Badge variant="destructive" className="text-[10px]">Rejected</Badge>
  return <Badge variant="outline" className="text-[10px]">Pending</Badge>
}

interface SubcontractorPaymentApprovalsTableProps {
  payments: SubcontractorJobPayment[]
  loading?: boolean
  isAccountant?: boolean
  isManager?: boolean
  accountBalances?: Record<string, number>
  balancesLoaded?: boolean
  emptyMessage?: string
}

export function SubcontractorPaymentApprovalsTable({
  payments,
  loading,
  isAccountant,
  isManager,
  accountBalances,
  balancesLoaded = false,
  emptyMessage = 'No payments recorded yet.',
}: SubcontractorPaymentApprovalsTableProps) {
  const { approveJobPayment } = useSubcontractorsStore()
  const [approvingId, setApprovingId] = useState<string | null>(null)

  const handleApprove = async (
    paymentId: string,
    target: 'APPROVED_ACCOUNTANT' | 'APPROVED_MANAGER' | 'REJECTED'
  ) => {
    const selected = payments.find((payment) => payment.id === paymentId)
    if (target === 'APPROVED_MANAGER' && selected) {
      const account = normalizeAccountKey(selected.paymentMethod)
      const amount = Number(selected.amount) || 0
      if (blockIfUnderfunded({
        accountRaw: account,
        amount,
        balances: accountBalances,
        balancesLoaded,
      })) return
      const available = Number(accountBalances?.[account] || 0)
      if (!window.confirm(
        `Approve and post ${formatCurrency(amount)} from ${account}?\n\nAvailable: ${formatCurrency(available)}`
      )) return
    }
    setApprovingId(paymentId)
    try {
      await approveJobPayment(paymentId, target)
      if (target === 'REJECTED') toast.success('Payment rejected')
      else if (target === 'APPROVED_MANAGER') toast.success('Payment approved — posted to OPEX')
      else toast.success('Payment approved by accountant')
    } catch (err: any) {
      toast.error(err?.message || 'Approval failed')
    } finally {
      setApprovingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="size-6 animate-spin text-[#ff8903]" />
      </div>
    )
  }

  if (payments.length === 0) {
    return <p className="text-sm text-muted-foreground py-6 text-center">{emptyMessage}</p>
  }

  return (
    <div className="border rounded-md overflow-x-auto">
      <Table className="min-w-[640px]">
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Method</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-center">Status</TableHead>
            <TableHead className="text-center w-[160px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {payments.map((p) => {
            const busy = approvingId === p.id
            const canAcct = !!isAccountant && p.approvalStatus === 'PENDING'
            const canMgr = !!isManager && p.approvalStatus === 'APPROVED_ACCOUNTANT'
            return (
              <TableRow key={p.id}>
                <TableCell className="text-xs whitespace-nowrap">{fmtDate(p.createdAt)}</TableCell>
                <TableCell className="text-xs">
                  <div>{p.description || '—'}</div>
                  {p.contractNumber && (
                    <div className="text-[10px] text-muted-foreground">{p.contractNumber}</div>
                  )}
                  {p.paymentRef && (
                    <div className="text-[10px] text-muted-foreground">Ref: {p.paymentRef}</div>
                  )}
                </TableCell>
                <TableCell className="text-xs uppercase">{p.paymentMethod}</TableCell>
                <TableCell className="text-right text-xs font-semibold tabular-nums">
                  {formatCurrency(Number(p.amount) || 0)}
                </TableCell>
                <TableCell className="text-center">{statusBadge(p.approvalStatus)}</TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    {busy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <>
                        {canAcct && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px] border-blue-500/40 text-blue-600"
                            onClick={() => handleApprove(p.id, 'APPROVED_ACCOUNTANT')}
                          >
                            <Check className="size-3 mr-1" /> Acct
                          </Button>
                        )}
                        {canMgr && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px] border-green-500/40 text-green-600"
                            onClick={() => handleApprove(p.id, 'APPROVED_MANAGER')}
                          >
                            <Check className="size-3 mr-1" /> Mgr
                          </Button>
                        )}
                        {(canAcct || canMgr) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-red-500"
                            onClick={() => handleApprove(p.id, 'REJECTED')}
                          >
                            <X className="size-3" />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
