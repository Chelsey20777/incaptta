'use client'

import React, { useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { HireContract } from '@/types/equipment-hire'
import { useEquipmentHireStore } from '@/stores/equipment-hire-store'
import { db } from '@/lib/firebase'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { toast } from 'sonner'
import { CloudRain, CheckSquare } from 'lucide-react'

interface StandbyDayManagerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contract: HireContract | null
}

export function StandbyDayManager({ open, onOpenChange, contract }: StandbyDayManagerProps) {
  const [saving, setSaving] = useState(false)

  // Generate list of all dates in the contract range
  const datesInRange = useMemo(() => {
    if (!contract) return []
    const list = []
    const start = new Date(contract.startDate)
    const end = new Date(contract.endDate)
    const current = new Date(start)

    while (current <= end) {
      list.push(current.toISOString().split('T')[0])
      current.setDate(current.getDate() + 1)
    }
    return list
  }, [contract])

  // Track checked state locally
  const [selectedDates, setSelectedDates] = useState<string[]>([])

  // Initialize selected dates based on contract
  React.useEffect(() => {
    if (contract) {
      setSelectedDates(contract.standbyDays || [])
    }
  }, [contract, open])

  const handleToggleDate = (dateStr: string) => {
    setSelectedDates(prev => {
      if (prev.includes(dateStr)) {
        return prev.filter(d => d !== dateStr)
      } else {
        return [...prev, dateStr]
      }
    })
  }

  const handleSave = async () => {
    if (!contract) return
    setSaving(true)
    try {
      await updateDoc(doc(db, 'hireContracts', contract.id), {
        standbyDays: selectedDates,
        updatedAt: serverTimestamp()
      })
      toast.success('Standby / Rain-out days updated successfully')
      onOpenChange(false)
    } catch (err) {
      console.error(err)
      toast.error('Failed to update standby days')
    } finally {
      setSaving(false)
    }
  }

  if (!contract) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px] border shadow-lg bg-card rounded-xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <CloudRain className="size-5 text-blue-500" />
            <DialogTitle>Standby & Rain-out Days</DialogTitle>
          </div>
          <DialogDescription>
            Approve specific dates within the contract range where standby rates apply and engine hours allowance is paused.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="border border-border/50 rounded-lg p-3 bg-muted/20 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="font-semibold text-muted-foreground">Contract Range:</span>
              <span className="font-bold">{contract.startDate} to {contract.endDate}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold text-muted-foreground">Standby Rate:</span>
              <span className="font-bold text-blue-500">{(contract.standbyRatePercentage * 100).toFixed(0)}% of daily rate</span>
            </div>
          </div>

          <Label className="font-semibold text-xs text-muted-foreground uppercase">Select Standby Dates</Label>
          <div className="max-h-[220px] overflow-y-auto border border-border/60 rounded-lg divide-y divide-border/40 p-1">
            {datesInRange.length === 0 ? (
              <p className="text-xs text-muted-foreground italic p-4 text-center">No dates in range</p>
            ) : (
              datesInRange.map(dateStr => {
                const date = new Date(dateStr)
                const isSelected = selectedDates.includes(dateStr)
                return (
                  <div 
                    key={dateStr}
                    onClick={() => handleToggleDate(dateStr)}
                    className="flex items-center justify-between p-2.5 hover:bg-muted/10 cursor-pointer rounded transition-colors"
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold">{date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">{dateStr}</span>
                    </div>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => handleToggleDate(dateStr)}
                      onClick={(e) => e.stopPropagation()} // Prevent double trigger
                    />
                  </div>
                )
              })
            )}
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-brand-primary hover:bg-brand-primary/95 text-white"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Apply Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
