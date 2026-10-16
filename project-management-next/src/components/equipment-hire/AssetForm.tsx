'use client'

import React, { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EquipmentAsset } from '@/types/equipment-hire'

interface AssetFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (asset: Omit<EquipmentAsset, 'id'>) => Promise<void>
}

export function AssetForm({ open, onOpenChange, onSubmit }: AssetFormProps) {
  const [name, setName] = useState('')
  const [serialNumber, setSerialNumber] = useState('')
  const [category, setCategory] = useState<EquipmentAsset['category']>('Tractor')
  const [currentEngineHours, setCurrentEngineHours] = useState('0')
  const [currentOdometer, setCurrentOdometer] = useState('0')
  const [tagsInput, setTagsInput] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !serialNumber) return

    setLoading(true)
    try {
      const tags = tagsInput
        .split(',')
        .map(t => t.trim().toLowerCase())
        .filter(t => t !== '')

      await onSubmit({
        name,
        serialNumber,
        category,
        currentEngineHours: Number(currentEngineHours) || 0,
        currentOdometer: Number(currentOdometer) || 0,
        compatibilityTags: tags,
        status: 'Available'
      })

      // Reset
      setName('')
      setSerialNumber('')
      setCategory('Tractor')
      setCurrentEngineHours('0')
      setCurrentOdometer('0')
      setTagsInput('')
      onOpenChange(false)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] border shadow-lg bg-card rounded-xl">
        <DialogHeader>
          <DialogTitle>Register Equipment Asset</DialogTitle>
          <DialogDescription>
            Add a new high-value machinery or implement for B2B hiring.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 col-span-2">
              <Label htmlFor="name" className="font-semibold text-xs text-muted-foreground uppercase">Asset Name</Label>
              <Input
                id="name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. John Deere 6155M Tractor"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="serial" className="font-semibold text-xs text-muted-foreground uppercase">Serial Number</Label>
              <Input
                id="serial"
                value={serialNumber}
                onChange={e => setSerialNumber(e.target.value)}
                placeholder="e.g. 1JD6155M-XYZ789"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category" className="font-semibold text-xs text-muted-foreground uppercase">Category</Label>
              <Select
                value={category}
                onValueChange={(val) => { if (val) setCategory(val as any) }}
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder="Select Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Tractor">Tractor</SelectItem>
                  <SelectItem value="Harvester">Harvester</SelectItem>
                  <SelectItem value="Implement">Implement</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="hours" className="font-semibold text-xs text-muted-foreground uppercase">Initial Engine Hours</Label>
              <Input
                id="hours"
                type="number"
                step="any"
                value={currentEngineHours}
                onChange={e => setCurrentEngineHours(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="odometer" className="font-semibold text-xs text-muted-foreground uppercase">Initial Odometer (km)</Label>
              <Input
                id="odometer"
                type="number"
                step="any"
                value={currentOdometer}
                onChange={e => setCurrentOdometer(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2 col-span-2">
              <Label htmlFor="tags" className="font-semibold text-xs text-muted-foreground uppercase">Compatibility Tags (Comma-separated)</Label>
              <Input
                id="tags"
                value={tagsInput}
                onChange={e => setTagsInput(e.target.value)}
                placeholder="e.g. hp:155, hitch:three-point, cat:2"
              />
              <span className="text-[10px] text-muted-foreground italic">
                * Note: Enter HP (e.g. `hp:150`) or hitch types (e.g. `hitch:three-point`) to match implements with tractors.
              </span>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-brand-primary hover:bg-brand-primary/95 text-white"
              disabled={loading}
            >
              {loading ? 'Creating...' : 'Register Asset'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
