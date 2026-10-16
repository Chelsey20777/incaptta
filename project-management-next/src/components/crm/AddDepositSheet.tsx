'use client'

import React, { useState, useEffect, useMemo } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, DollarSign } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { useCrmStore } from '@/stores/crm-store'
import { toast } from 'sonner'

interface AddDepositSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientId: string
  clientName: string
  currentBalance: number
  onDeposited: () => void
}

export default function AddDepositSheet({
  open,
  onOpenChange,
  clientId,
  clientName,
  currentBalance,
  onDeposited,
}: AddDepositSheetProps) {
  const { user, hasAnyRole } = useAuthStore()
  const crmStore = useCrmStore()

  const [amount, setAmount] = useState<string>('')
  const [paymentMethod, setPaymentMethod] = useState<'BANK' | 'ECOCASH' | 'CASH'>('BANK')
  const [reference, setReference] = useState('')
  const [currency, setCurrency] = useState<'USD' | 'ZWL' | 'ZAR'>('USD')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Reset form when sheet opens
  useEffect(() => {
    if (open) {
      setAmount('')
      setPaymentMethod('BANK')
      setReference('')
      setCurrency('USD')
      setNotes('')
      setIsSubmitting(false)
    }
  }, [open])

  const newBalance = useMemo(() => {
    const current = currentBalance || 0
    const deposit = Number(amount) || 0
    return current + deposit
  }, [currentBalance, amount])

  const canSubmit = useMemo(() => {
    const amt = Number(amount)
    return (
      hasAnyRole(['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT']) &&
      amt > 0 &&
      paymentMethod &&
      reference.trim()
    )
  }, [amount, paymentMethod, reference, hasAnyRole])

  async function handleDeposit() {
    if (!hasAnyRole(['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'])) {
      toast.error('Insufficient permissions')
      return
    }

    const amt = Number(amount)
    if (!amt || amt <= 0) {
      toast.error('Enter a valid deposit amount')
      return
    }

    if (!paymentMethod) {
      toast.error('Select a payment method')
      return
    }

    const refTrimmed = reference.trim()
    if (!refTrimmed) {
      toast.error('Reference number is required')
      return
    }

    setIsSubmitting(true)
    try {
      await crmStore.recordDeposit({
        clientId,
        clientName,
        amount: amt,
        paymentMethod,
        reference: refTrimmed,
        notes: notes.trim(),
        currency,
        createdBy: user?.uid ?? '',
        createdByName: user?.displayName ?? '',
      })

      toast.success('Deposit recorded', {
        description: `$${amt.toFixed(2)} credited to ${clientName}'s account`,
      })

      onDeposited()
      onOpenChange(false)
    } catch (e: any) {
      console.error('Deposit error:', e)
      toast.error('Failed to record deposit', {
        description: e?.message ?? 'Please try again',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md flex flex-col h-full">
        <SheetHeader>
          <SheetTitle>Record Client Deposit</SheetTitle>
          <SheetDescription>
            {clientName} — Current Credit: ${currentBalance.toFixed(2)}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-6">
          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount" className="font-medium">
              Deposit Amount *
            </Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                id="amount"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                className="pl-9 text-lg font-semibold h-12"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Payment Method */}
          <div className="space-y-2">
            <Label htmlFor="paymentMethod" className="font-medium">
              Payment Method *
            </Label>
            <Select
              value={paymentMethod}
              onValueChange={(v) => setPaymentMethod(v as 'BANK' | 'ECOCASH' | 'CASH')}
              disabled={isSubmitting}
            >
              <SelectTrigger id="paymentMethod" className="w-full">
                <SelectValue placeholder="Select method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BANK">Bank</SelectItem>
                <SelectItem value="ECOCASH">EcoCash</SelectItem>
                <SelectItem value="CASH">Cash</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Reference */}
          <div className="space-y-2">
            <Label htmlFor="reference" className="font-medium">
              Reference / Receipt Number *
            </Label>
            <Input
              id="reference"
              placeholder="Bank reference, EcoCash transaction ID, or cash receipt number"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              disabled={isSubmitting}
            />
            <p className="text-xs text-muted-foreground">
              Bank reference, EcoCash transaction ID, or cash receipt number
            </p>
          </div>

          {/* Currency */}
          <div className="space-y-2">
            <Label htmlFor="currency" className="font-medium">
              Currency
            </Label>
            <Select
              value={currency}
              onValueChange={(v) => setCurrency(v as 'USD' | 'ZWL' | 'ZAR')}
              disabled={isSubmitting}
            >
              <SelectTrigger id="currency" className="w-full">
                <SelectValue placeholder="Select currency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="ZWL">ZWL</SelectItem>
                <SelectItem value="ZAR">ZAR</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes" className="font-medium">
              Notes
            </Label>
            <Textarea
              id="notes"
              placeholder="Optional notes about this deposit"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isSubmitting}
              className="resize-none"
            />
          </div>

          {/* Preview Card */}
          <div className="bg-muted/50 rounded-md p-4 space-y-2 text-sm">
            <p className="font-medium">After this deposit:</p>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Current balance:</span>
              <span>${currentBalance.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Deposit amount:</span>
              <span className="text-green-600 font-medium">
                + ${(Number(amount) || 0).toFixed(2)}
              </span>
            </div>
            <div className="border-t pt-2 flex justify-between font-bold">
              <span>New balance:</span>
              <span className="text-green-700">${newBalance.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <SheetFooter className="gap-2">
          <Button
            variant="outline"
            disabled={isSubmitting}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            variant="default"
            disabled={!canSubmit || isSubmitting}
            onClick={handleDeposit}
          >
            {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            {isSubmitting ? 'Recording...' : 'Record Deposit'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}