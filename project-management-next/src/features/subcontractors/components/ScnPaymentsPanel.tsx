'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/format'
import { toastIfUnderfunded } from '@/lib/finance/funds-check-ui'
import { useSubcontractorsStore } from '@/stores/subcontractors-store'
import { SubcontractorPaymentApprovalsTable } from '@/features/subcontractors/components/SubcontractorPaymentApprovalsTable'
import type { SubcontractorJob, SubcontractorJobPayment } from '@/features/subcontractors/types'

interface ScnPaymentsPanelProps {
  job: SubcontractorJob
  payments: SubcontractorJobPayment[]
  loading?: boolean
  canWrite?: boolean
  isAccountant?: boolean
  isManager?: boolean
  userName?: string
  createdBy?: string
  accountBalances?: Record<string, number>
  balancesLoaded?: boolean
}

export function ScnPaymentsPanel({
  job,
  payments,
  loading,
  canWrite,
  isAccountant,
  isManager,
  userName,
  createdBy,
  accountBalances,
  balancesLoaded = false,
}: ScnPaymentsPanelProps) {
  const { recordJobPayment } = useSubcontractorsStore()
  const [showPayModal, setShowPayModal] = useState(false)
  const [paying, setPaying] = useState(false)
  const [payForm, setPayForm] = useState({
    amount: '',
    paymentMethod: 'BANK',
    paymentRef: '',
    description: '',
  })

  const paid = Number(job.paidApprovedTotal) || 0
  const contractValue = Number(job.contractValue) || 0
  const remaining = Math.max(0, contractValue - paid)

  const handleRecordPayment = async () => {
    if (!canWrite) {
      toast.error('You do not have permission to record payments')
      return
    }
    const amount = Number(payForm.amount)
    if (!amount || amount <= 0) {
      toast.error('Enter a valid payment amount')
      return
    }
    setPaying(true)
    try {
      await recordJobPayment({
        subcontractorJobId: job.id,
        amount,
        paymentMethod: payForm.paymentMethod,
        paymentRef: payForm.paymentRef,
        description: payForm.description || `Payment on ${job.contractNumber}`,
        createdBy: createdBy || '',
        createdByName: userName || '',
      })
      toast.success('Payment recorded — awaiting approval')
      setShowPayModal(false)
      setPayForm({ amount: '', paymentMethod: 'BANK', paymentRef: '', description: '' })
    } catch (err: any) {
      toast.error(err?.message || 'Failed to record payment')
    } finally {
      setPaying(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-4 text-sm">
          <div>
            <span className="text-muted-foreground text-xs uppercase font-bold">Contract</span>
            <p className="font-semibold tabular-nums">{formatCurrency(contractValue)}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs uppercase font-bold">Paid (approved)</span>
            <p className="font-semibold tabular-nums text-green-600">{formatCurrency(paid)}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs uppercase font-bold">Remaining</span>
            <p className="font-semibold tabular-nums">{formatCurrency(remaining)}</p>
          </div>
        </div>
        {canWrite && job.status !== 'COMPLETED' && job.status !== 'CANCELLED' && (
          <Button
            size="sm"
            className="bg-[#ff8903] hover:bg-[#ff8903]/90 text-white h-10 min-h-10 w-full sm:w-auto"
            onClick={() => setShowPayModal(true)}
          >
            <Plus className="size-4 mr-1" /> Record Payment
          </Button>
        )}
      </div>

      <SubcontractorPaymentApprovalsTable
        payments={payments}
        loading={loading}
        isAccountant={isAccountant}
        isManager={isManager}
        accountBalances={accountBalances}
        balancesLoaded={balancesLoaded}
      />

      {showPayModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
          <div className="bg-background w-full sm:max-w-lg rounded-t-2xl sm:rounded-xl border shadow-xl p-5 space-y-4">
            <div>
              <h3 className="text-lg font-bold">Record Payment</h3>
              <p className="text-xs text-muted-foreground">
                {job.contractNumber} · Remaining {formatCurrency(remaining)}
              </p>
            </div>
            <div className="space-y-3">
              <div>
                <Label>Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={payForm.amount}
                  onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>Payment Method</Label>
                <select
                  className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                  value={payForm.paymentMethod}
                  onChange={(e) => {
                    const paymentMethod = e.target.value
                    setPayForm((f) => ({ ...f, paymentMethod }))
                    toastIfUnderfunded({
                      accountRaw: paymentMethod,
                      amount: Number(payForm.amount) || 0,
                      balances: accountBalances,
                      balancesLoaded,
                      context: 'Manager post will be blocked until the account is funded.',
                    })
                  }}
                >
                  <option value="BANK">Bank</option>
                  <option value="CASH">Cash</option>
                  <option value="ECOCASH">EcoCash</option>
                  <option value="RESERVE">Reserve</option>
                </select>
              </div>
              <div>
                <Label>Reference</Label>
                <Input
                  value={payForm.paymentRef}
                  onChange={(e) => setPayForm((f) => ({ ...f, paymentRef: e.target.value }))}
                  placeholder="Transfer ref / receipt #"
                />
              </div>
              <div>
                <Label>Description</Label>
                <Input
                  value={payForm.description}
                  onChange={(e) => setPayForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Optional note"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowPayModal(false)} disabled={paying}>
                Cancel
              </Button>
              <Button
                className="bg-[#ff8903] hover:bg-[#ff8903]/90 text-white"
                onClick={handleRecordPayment}
                disabled={paying}
              >
                {paying ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                Submit for Approval
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
