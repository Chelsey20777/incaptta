'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { EquipmentAsset, HireContract, InspectionLog } from '@/types/equipment-hire'
import { useEquipmentHireStore } from '@/stores/equipment-hire-store'
import { useAuthStore } from '@/stores/auth-store'
import { useCrmStore } from '@/stores/crm-store'
import { calculateFinalRentalInvoice } from '@/lib/billing-engine'
import { db } from '@/lib/firebase'
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore'
import { toast } from 'sonner'
import { Wrench, ShieldAlert, CheckCircle, ArrowRight, ClipboardCheck, Sparkles, ChevronRight } from 'lucide-react'

interface RentalWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contractToProgress: HireContract | null // If non-null, we resume the lifecycle at Gate-Out or Gate-In
}

export function RentalWizard({ open, onOpenChange, contractToProgress }: RentalWizardProps) {
  const { assets, contracts, inspections, createContract, updateContractStatus, saveInspection, updateAssetStatus } = useEquipmentHireStore()
  const { user } = useAuthStore()
  const { customers, fetchCustomers, createInvoice } = useCrmStore()

  // Step state: 1 = Draft Setup, 2 = Gate-Out Pre-Hire, 3 = Gate-In Post-Hire, 4 = Invoice Summary
  const [step, setStep] = useState(1)

  // Step 1: Draft setup state
  const [selectedCustomerId, setSelectedCustomerId] = useState('manual')
  const [customerId, setCustomerId] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [assetId, setAssetId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [hireType, setHireType] = useState<'WET' | 'DRY'>('DRY')
  const [baseDailyRate, setBaseDailyRate] = useState('150')
  const [includedDailyHours, setIncludedDailyHours] = useState('8')
  const [excessHourRate, setExcessHourRate] = useState('25')
  const [standbyRatePercentage, setStandbyRatePercentage] = useState('0.5')

  // Step 2: Gate-Out Pre-Hire Inspection state
  const [preHours, setPreHours] = useState('')
  const [preFuel, setPreFuel] = useState(100)
  const [preWashdown, setPreWashdown] = useState(false)
  const [preNotes, setPreNotes] = useState('')

  // Step 3: Gate-In Post-Hire Inspection state
  const [postHours, setPostHours] = useState('')
  const [postFuel, setPostFuel] = useState(100)
  const [postNotes, setPostNotes] = useState('')

  // Local active contract pointer
  const [activeContract, setActiveContract] = useState<HireContract | null>(null)

  // Determine starting step based on contractToProgress
  // Fetch CRM customers when dialog opens
  useEffect(() => {
    let unsubCustomers: (() => void) | undefined
    if (open) {
      unsubCustomers = fetchCustomers()
    }
    return () => {
      if (unsubCustomers) unsubCustomers()
    }
  }, [open, fetchCustomers])

  // Determine starting step based on contractToProgress
  useEffect(() => {
    if (contractToProgress) {
      setActiveContract(contractToProgress)
      setAssetId(contractToProgress.assetId)
      setSelectedCustomerId(contractToProgress.customerId || 'manual')
      if (contractToProgress.status === 'Draft') {
        setStep(2)
        // Default pre-hours to asset's current engine hours
        const asset = assets.find(a => a.id === contractToProgress.assetId)
        setPreHours(asset ? asset.currentEngineHours.toString() : '0')
      } else if (contractToProgress.status === 'Active') {
        setStep(3)
        // Default post-hours to pre-hire inspection recorded hours
        const preInsp = inspections.find(i => i.contractId === contractToProgress.id && i.type === 'PRE_HIRE')
        setPostHours(preInsp ? preInsp.engineHoursRecorded.toString() : '0')
      } else if (contractToProgress.status === 'Pending_Return') {
        setStep(4)
      }
    } else {
      // Reset for new creation
      setStep(1)
      setSelectedCustomerId('manual')
      setCustomerId('')
      setCustomerName('')
      setAssetId('')
      setStartDate('')
      setEndDate('')
      setHireType('DRY')
      setBaseDailyRate('150')
      setIncludedDailyHours('8')
      setExcessHourRate('25')
      setStandbyRatePercentage('0.5')
      setActiveContract(null)
    }
  }, [contractToProgress, open, assets, inspections])

  // Get selected asset metadata
  const selectedAsset = useMemo(() => {
    return assets.find(a => a.id === assetId)
  }, [assetId, assets])

  // Tractor-Implement Compatibility Warning
  const compatibilityWarning = useMemo(() => {
    if (!selectedAsset || selectedAsset.category !== 'Implement') return null
    
    const hpTag = selectedAsset.compatibilityTags.find(t => t.startsWith('hp:'))
    const hitchTag = selectedAsset.compatibilityTags.find(t => t.startsWith('hitch:'))
    
    if (!hpTag && !hitchTag) return null
    
    const requiredHp = hpTag ? parseInt(hpTag.split(':')[1]) : 0
    const requiredHitch = hitchTag ? hitchTag.split(':')[1] : ''
    
    const tractors = assets.filter(a => a.category === 'Tractor')
    if (tractors.length === 0) {
      return `Warning: No tractors are registered in the fleet to power this implement.`
    }
    
    const compatibleTractors = tractors.filter(t => {
      const tHpTag = t.compatibilityTags.find(tag => tag.startsWith('hp:'))
      const tHitchTag = t.compatibilityTags.find(tag => tag.startsWith('hitch:'))
      
      const tHp = tHpTag ? parseInt(tHpTag.split(':')[1]) : 0
      const tHitch = tHitchTag ? tHitchTag.split(':')[1] : ''
      
      const hpMatch = requiredHp ? tHp >= requiredHp : true
      const hitchMatch = requiredHitch ? tHitch === requiredHitch : true
      
      return hpMatch && hitchMatch
    })
    
    if (compatibleTractors.length === 0) {
      return `Warning: Tractor-Implement Compatibility Mismatch! This implement requires ${requiredHp ? `${requiredHp} HP` : ''} ${requiredHitch ? `with a ${requiredHitch} hitch` : ''}. No tractors in the fleet match these specifications.`
    }
    
    return null
  }, [selectedAsset, assets])

  const handleCustomerSelect = (val: string) => {
    setSelectedCustomerId(val)
    if (val === 'manual') {
      setCustomerId('')
      setCustomerName('')
    } else {
      const cust = customers.find((c: any) => c.id === val)
      if (cust) {
        setCustomerId(cust.id)
        setCustomerName(cust.name || '')
      }
    }
  }

  // Submissions
  const handleDraftSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!customerId || !customerName || !assetId || !startDate || !endDate) {
      toast.error('Please complete all required fields')
      return
    }

    try {
      const asset = assets.find(a => a.id === assetId)
      const contractPayload = {
        customerId,
        customerName,
        assetId,
        assetName: asset ? asset.name : '',
        status: 'Draft' as const,
        startDate,
        endDate,
        hireType,
        baseDailyRate: Number(baseDailyRate) || 0,
        includedDailyHours: Number(includedDailyHours) || 8.0,
        excessHourRate: Number(excessHourRate) || 0,
        standbyRatePercentage: Number(standbyRatePercentage) || 0.5
      }

      const newId = await createContract(contractPayload)
      const newContract = { id: newId, ...contractPayload, standbyDays: [] }
      setActiveContract(newContract)
      
      // Default pre-hours to asset's current engine hours
      setPreHours(asset ? asset.currentEngineHours.toString() : '0')
      
      setStep(2)
    } catch (err) {
      console.error(err)
      toast.error('Failed to create contract draft')
    }
  }

  const handlePreInspectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!preWashdown) {
      toast.error('Biosecurity Washdown must be certified complete before Gate-Out.')
      return
    }
    if (!activeContract) return

    try {
      const recordedHours = Number(preHours) || 0

      // 1. Save Pre-Hire Inspection Log
      await saveInspection({
        contractId: activeContract.id,
        type: 'PRE_HIRE',
        engineHoursRecorded: recordedHours,
        fuelLevelPercentage: preFuel,
        biosecurityWashdownCertified: preWashdown,
        damageNotes: preNotes,
        signedOffByUserId: user?.uid || 'tech-001',
        signedOffByUserName: user?.email || 'Technician Sign-off'
      })

      // 2. Update Contract status to Active
      await updateContractStatus(activeContract.id, 'Active')

      // 3. Update Equipment status to On_Hire & write departure hours
      await updateAssetStatus(activeContract.assetId, 'On_Hire', recordedHours)

      toast.success('Gate-Out Complete! Contract is now Active.')
      
      // Setup returning steps default values
      setPostHours(recordedHours.toString())
      setStep(3)
    } catch (err) {
      console.error(err)
      toast.error('Failed to complete Pre-Hire inspection')
    }
  }

  const handlePostInspectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeContract) return

    const preInsp = inspections.find(i => i.contractId === activeContract.id && i.type === 'PRE_HIRE')
    const departureHours = preInsp ? preInsp.engineHoursRecorded : 0
    const returnedHours = Number(postHours) || 0

    if (returnedHours < departureHours) {
      toast.error(`Invalid engine hours! Returning hours (${returnedHours}) cannot be less than departure hours (${departureHours}).`)
      return
    }

    try {
      // 1. Save Post-Hire Inspection Log
      await saveInspection({
        contractId: activeContract.id,
        type: 'POST_HIRE',
        engineHoursRecorded: returnedHours,
        fuelLevelPercentage: postFuel,
        biosecurityWashdownCertified: true, // Auto certified upon return wash
        damageNotes: postNotes,
        signedOffByUserId: user?.uid || 'tech-001',
        signedOffByUserName: user?.email || 'Technician Sign-off'
      })

      // 2. Update Contract status to Pending_Return (awaiting invoice review)
      await updateContractStatus(activeContract.id, 'Pending_Return')

      // 3. Keep asset status as Standby temporarily until contract is fully Closed
      await updateAssetStatus(activeContract.assetId, 'Standby', returnedHours)

      toast.success('Gate-In Complete! Billing invoice ready for audit.')
      setStep(4)
    } catch (err) {
      console.error(err)
      toast.error('Failed to complete Post-Hire inspection')
    }
  }

  // Pre-calculate final invoice
  const finalInvoice = useMemo(() => {
    if (!activeContract) return null
    const pre = inspections.find(i => i.contractId === activeContract.id && i.type === 'PRE_HIRE')
    const post = inspections.find(i => i.contractId === activeContract.id && i.type === 'POST_HIRE')
    return calculateFinalRentalInvoice(activeContract, pre, post)
  }, [activeContract, inspections])

  const handleCloseContract = async () => {
    if (!activeContract || !finalInvoice) return

    try {
      // 1. Close contract
      await updateContractStatus(activeContract.id, 'Closed')

      // 2. Set asset status back to Available
      const postInsp = inspections.find(i => i.contractId === activeContract.id && i.type === 'POST_HIRE')
      const finalHours = postInsp ? postInsp.engineHoursRecorded : undefined
      await updateAssetStatus(activeContract.assetId, 'Available', finalHours)

      // 3. Post to CRM invoices if it is linked to a customer
      if (activeContract.customerId && activeContract.customerId !== 'manual') {
        const custObj = customers.find((c: any) => c.id === activeContract.customerId)
        const customerEmail = custObj?.email || ''

        const newInvoice = {
          invoiceNumber: `INV-HIRE-${activeContract.id.substring(0, 5).toUpperCase()}`,
          customerId: activeContract.customerId,
          customerName: activeContract.customerName,
          customerEmail: customerEmail,
          status: 'SENT',
          grandTotal: finalInvoice.totalInvoiceCost,
          amount: finalInvoice.totalInvoiceCost,
          amountPaid: 0,
          balance: finalInvoice.totalInvoiceCost,
          dueDate: new Date().toISOString().split('T')[0],
          notes: `Equipment Hire Invoice for ${activeContract.assetName}. Period: ${activeContract.startDate} to ${activeContract.endDate}.`
        }

        await createInvoice(newInvoice)
      }

      toast.success('Contract closed and posted to ledger successfully!')
      onOpenChange(false)
    } catch (err) {
      console.error(err)
      toast.error('Failed to close contract')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] border shadow-lg bg-card rounded-xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ClipboardCheck className="size-5 text-brand-primary" />
            <DialogTitle>Rental Lifecycle Wizard</DialogTitle>
          </div>
          <DialogDescription>
            Execute equipment contract draft, gate-out inspections, gate-in inspections, and invoicing calculations.
          </DialogDescription>
        </DialogHeader>

        {/* Wizard Steps indicator */}
        <div className="flex items-center justify-between border-b pb-4 mb-2 text-xs font-semibold text-muted-foreground select-none">
          <div className={`flex items-center gap-1 ${step === 1 ? 'text-brand-primary font-bold' : ''}`}>
            <span className="flex size-5 items-center justify-center rounded-full border border-current text-[10px]">1</span>
            <span>Draft</span>
          </div>
          <ChevronRight className="size-3 text-muted-foreground/50" />
          <div className={`flex items-center gap-1 ${step === 2 ? 'text-brand-primary font-bold' : ''}`}>
            <span className="flex size-5 items-center justify-center rounded-full border border-current text-[10px]">2</span>
            <span>Gate-Out</span>
          </div>
          <ChevronRight className="size-3 text-muted-foreground/50" />
          <div className={`flex items-center gap-1 ${step === 3 ? 'text-brand-primary font-bold' : ''}`}>
            <span className="flex size-5 items-center justify-center rounded-full border border-current text-[10px]">3</span>
            <span>Gate-In</span>
          </div>
          <ChevronRight className="size-3 text-muted-foreground/50" />
          <div className={`flex items-center gap-1 ${step === 4 ? 'text-brand-primary font-bold' : ''}`}>
            <span className="flex size-5 items-center justify-center rounded-full border border-current text-[10px]">4</span>
            <span>Invoice</span>
          </div>
        </div>

        {/* STEP 1: DRAFT SETUP */}
        {step === 1 && (
          <form onSubmit={handleDraftSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1 col-span-2">
                <Label htmlFor="link_customer" className="font-semibold text-xs text-muted-foreground uppercase">Link to Customer (CRM)</Label>
                <Select
                  value={selectedCustomerId}
                  onValueChange={val => handleCustomerSelect(val || 'manual')}
                >
                  <SelectTrigger id="link_customer">
                    <SelectValue placeholder="Select customer from database...">
                      {selectedCustomerId === 'manual'
                        ? undefined
                        : (customers.find((c: any) => c.id === selectedCustomerId)?.name || customerName || selectedCustomerId)
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">-- Enter Manually / One-off --</SelectItem>
                    {customers.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} {c.status ? `(${c.status})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="customer_id" className="font-semibold text-xs text-muted-foreground uppercase">Customer ID / Account</Label>
                <Input
                  id="customer_id"
                  value={customerId}
                  onChange={e => setCustomerId(e.target.value)}
                  placeholder="e.g. CUST-4402"
                  required
                  disabled={selectedCustomerId !== 'manual'}
                  className={selectedCustomerId !== 'manual' ? 'bg-muted/50 cursor-not-allowed' : ''}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="customer_name" className="font-semibold text-xs text-muted-foreground uppercase">Customer Name</Label>
                <Input
                  id="customer_name"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder="e.g. Delta Corp Farms"
                  required
                  disabled={selectedCustomerId !== 'manual'}
                  className={selectedCustomerId !== 'manual' ? 'bg-muted/50 cursor-not-allowed' : ''}
                />
              </div>

              <div className="space-y-1 col-span-2">
                <Label htmlFor="asset" className="font-semibold text-xs text-muted-foreground uppercase">Equipment Asset Selector</Label>
                <Select
                  value={assetId}
                  onValueChange={val => setAssetId(val || '')}
                >
                  <SelectTrigger id="asset">
                    <SelectValue placeholder="Select Machinery" />
                  </SelectTrigger>
                  <SelectContent>
                    {assets
                      .filter(a => a.status === 'Available')
                      .map(a => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name} ({a.category}) - {a.currentEngineHours} hrs
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {compatibilityWarning && (
                  <div className="mt-2 py-2 px-3 border border-red-500/30 bg-red-500/5 text-red-600 dark:text-red-400 rounded-lg flex items-start gap-2">
                    <ShieldAlert className="size-4 shrink-0 mt-0.5" />
                    <span className="text-[11px] font-semibold">
                      {compatibilityWarning}
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="start_date" className="font-semibold text-xs text-muted-foreground uppercase">Start Date</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="end_date" className="font-semibold text-xs text-muted-foreground uppercase">End Date</Label>
                <Input
                  id="end_date"
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="hire_type" className="font-semibold text-xs text-muted-foreground uppercase">Hire Type</Label>
                <Select
                  value={hireType}
                  onValueChange={(val) => { if (val) setHireType(val as any) }}
                >
                  <SelectTrigger id="hire_type">
                    <SelectValue placeholder="WET / DRY" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DRY">DRY (Asset Only)</SelectItem>
                    <SelectItem value="WET">WET (Includes Operator)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="daily_rate" className="font-semibold text-xs text-muted-foreground uppercase">Base Daily Rate ($)</Label>
                <Input
                  id="daily_rate"
                  type="number"
                  value={baseDailyRate}
                  onChange={e => setBaseDailyRate(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="inc_hours" className="font-semibold text-xs text-muted-foreground uppercase">Included Daily Hours</Label>
                <Input
                  id="inc_hours"
                  type="number"
                  value={includedDailyHours}
                  onChange={e => setIncludedDailyHours(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="excess_rate" className="font-semibold text-xs text-muted-foreground uppercase">Excess Hour Rate ($)</Label>
                <Input
                  id="excess_rate"
                  type="number"
                  value={excessHourRate}
                  onChange={e => setExcessHourRate(e.target.value)}
                  required
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-brand-primary hover:bg-brand-primary/95 text-white flex items-center gap-1">
                <span>Save Draft & Inspect</span>
                <ArrowRight className="size-3" />
              </Button>
            </DialogFooter>
          </form>
        )}

        {/* STEP 2: GATE-OUT PRE-HIRE INSPECTION */}
        {step === 2 && activeContract && (
          <form onSubmit={handlePreInspectionSubmit} className="space-y-4">
            <div className="border border-border/50 rounded-lg p-3 bg-muted/20 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="font-semibold text-muted-foreground">Contract ID:</span>
                <span className="font-mono font-bold">{activeContract.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-muted-foreground">Equipment:</span>
                <span className="font-bold">{activeContract.assetName}</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="pre_hours" className="font-semibold text-xs text-muted-foreground uppercase">Gate-Out Engine Hours</Label>
                <Input
                  id="pre_hours"
                  type="number"
                  step="any"
                  value={preHours}
                  onChange={e => setPreHours(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center mb-1">
                  <Label className="font-semibold text-xs text-muted-foreground uppercase">Gate-Out Fuel Level</Label>
                  <span className="text-xs font-bold text-brand-primary">{preFuel}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={preFuel}
                  onChange={e => setPreFuel(Number(e.target.value))}
                  className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-brand-primary"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="pre_notes" className="font-semibold text-xs text-muted-foreground uppercase">Initial Damage / Check Notes</Label>
                <Textarea
                  id="pre_notes"
                  value={preNotes}
                  onChange={e => setPreNotes(e.target.value)}
                  placeholder="Record any cosmetic damage, scratches, tire wear..."
                />
              </div>

              <div className="flex items-start gap-2 border border-brand-primary/20 bg-brand-primary/5 rounded-lg p-3.5 mt-2">
                <Checkbox
                  id="washdown"
                  checked={preWashdown}
                  onCheckedChange={checked => setPreWashdown(!!checked)}
                  className="mt-0.5"
                />
                <div className="space-y-1">
                  <Label htmlFor="washdown" className="text-xs font-bold text-foreground cursor-pointer">
                    Biosecurity Washdown Certified Complete
                  </Label>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Verify that the machine has undergone detailed washdown cleaning to remove all soil, mud, and organic matter to satisfy biosecurity standards before dispatch.
                  </p>
                </div>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                className="bg-brand-primary hover:bg-brand-primary/95 text-white flex items-center gap-1"
                disabled={!preWashdown}
              >
                <span>Authorize Gate-Out Dispatch</span>
                <CheckCircle className="size-3" />
              </Button>
            </DialogFooter>
          </form>
        )}

        {/* STEP 3: GATE-IN POST-HIRE INSPECTION */}
        {step === 3 && activeContract && (
          <form onSubmit={handlePostInspectionSubmit} className="space-y-4">
            <div className="border border-border/50 rounded-lg p-3 bg-muted/20 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="font-semibold text-muted-foreground">Contract ID:</span>
                <span className="font-mono font-bold">{activeContract.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-muted-foreground">Equipment:</span>
                <span className="font-bold">{activeContract.assetName}</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="post_hours" className="font-semibold text-xs text-muted-foreground uppercase">Gate-In (Return) Engine Hours</Label>
                <Input
                  id="post_hours"
                  type="number"
                  step="any"
                  value={postHours}
                  onChange={e => setPostHours(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center mb-1">
                  <Label className="font-semibold text-xs text-muted-foreground uppercase">Return Fuel Level</Label>
                  <span className="text-xs font-bold text-brand-primary">{postFuel}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={postFuel}
                  onChange={e => setPostFuel(Number(e.target.value))}
                  className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-brand-primary"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="post_notes" className="font-semibold text-xs text-muted-foreground uppercase">Return Damage / Wear Report</Label>
                <Textarea
                  id="post_notes"
                  value={postNotes}
                  onChange={e => setPostNotes(e.target.value)}
                  placeholder="Record any new damage, mechanical alerts, or comments during recovery..."
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-brand-primary hover:bg-brand-primary/95 text-white flex items-center gap-1">
                <span>Process Return Return</span>
                <ArrowRight className="size-3" />
              </Button>
            </DialogFooter>
          </form>
        )}

        {/* STEP 4: INVOICE SUMMARY */}
        {step === 4 && activeContract && finalInvoice && (
          <div className="space-y-4">
            <div className="border border-border/50 rounded-lg p-3 bg-muted/20 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="font-semibold text-muted-foreground">Contract Reference:</span>
                <span className="font-mono font-bold">{activeContract.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-muted-foreground">Customer Account:</span>
                <span className="font-bold">{activeContract.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-muted-foreground">Hire Range:</span>
                <span className="font-bold">{activeContract.startDate} to {activeContract.endDate} ({finalInvoice.totalDays} Days)</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-semibold text-xs text-muted-foreground uppercase">Itemized Invoice Breakdown</Label>
              <div className="border rounded-lg overflow-hidden divide-y text-xs">
                {/* Headers */}
                <div className="grid grid-cols-[1fr_120px] p-2.5 font-bold bg-muted/30 uppercase text-[10px] text-muted-foreground">
                  <span>Charge Description</span>
                  <span className="text-right">Total (USD)</span>
                </div>
                {/* Normal Days */}
                <div className="grid grid-cols-[1fr_120px] p-2.5">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold">Base Billable Time</span>
                    <span className="text-[10px] text-muted-foreground">
                      {finalInvoice.billableDaysCount} Billable Days @ ${activeContract.baseDailyRate}/day
                    </span>
                  </div>
                  <span className="text-right font-semibold">
                    ${(finalInvoice.billableDaysCount * activeContract.baseDailyRate).toFixed(2)}
                  </span>
                </div>
                {/* Standby Days */}
                {finalInvoice.standbyDaysCount > 0 && (
                  <div className="grid grid-cols-[1fr_120px] p-2.5 text-blue-500">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-semibold">Standby Day Credits (Approved)</span>
                      <span className="text-[10px] text-blue-400">
                        {finalInvoice.standbyDaysCount} Standby Days @ ${(activeContract.baseDailyRate * activeContract.standbyRatePercentage).toFixed(2)}/day ({(activeContract.standbyRatePercentage * 100).toFixed(0)}%)
                      </span>
                    </div>
                    <span className="text-right font-semibold">
                      ${(finalInvoice.standbyDaysCount * activeContract.baseDailyRate * activeContract.standbyRatePercentage).toFixed(2)}
                    </span>
                  </div>
                )}
                {/* Utilization */}
                <div className="grid grid-cols-[1fr_120px] p-2.5">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold">Excess Engine Hours Utilization</span>
                    <span className="text-[10px] text-muted-foreground">
                      Actual Hours: {finalInvoice.actualHours.toFixed(1)} hrs | Allowed: {finalInvoice.allowedHours.toFixed(1)} hrs
                      {finalInvoice.excessHours > 0 && ` (${finalInvoice.excessHours.toFixed(1)} Excess @ $${activeContract.excessHourRate}/hr)`}
                    </span>
                  </div>
                  <span className="text-right font-semibold">
                    ${finalInvoice.excessCost.toFixed(2)}
                  </span>
                </div>
                {/* Total */}
                <div className="grid grid-cols-[1fr_120px] p-3 font-bold bg-green-500/5 text-sm">
                  <span>Grand Total Bill</span>
                  <span className="text-right text-brand-primary">
                    ${finalInvoice.totalInvoiceCost.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button 
                type="button" 
                className="bg-brand-primary hover:bg-brand-primary/95 text-white flex items-center gap-1 font-bold"
                onClick={handleCloseContract}
              >
                <span>Post Ledger & Close Contract</span>
                <CheckCircle className="size-4" />
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
