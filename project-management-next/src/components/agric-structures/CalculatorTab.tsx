'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Calculator, Ruler, Save, Loader2, User } from 'lucide-react'
import { toast } from 'sonner'
import { useAgricStructuresStore } from '@/stores/agric-structures-store'
import { useCrmStore } from '@/stores/crm-store'
import {
  PRESET_SIZES,
} from '@/features/agric-structures/constants/defaults'
import type {
  BOQLineItem,
  FowlrunCalculation,
  StructureSize,
} from '@/features/agric-structures/types'

const BASE = { L: 80, W: 10 }

interface CalculatorTabProps {
  onQuoteCreated: (jobCardId: string, jobNumber: string) => void
}

export function CalculatorTab({ onQuoteCreated }: CalculatorTabProps) {
  const {
    rates,
    templateItems,
    loadingRates,
    loadingTemplate,
    fetchRates,
    fetchTemplate,
    createJobCardFromCalculation,
    cleanup,
  } = useAgricStructuresStore()
  const { customers, fetchCustomers } = useCrmStore()

  const [selectedSize, setSelectedSize] = useState<StructureSize>(
    PRESET_SIZES.find((s) => s.label === '80x10m')!
  )
  const [customLength, setCustomLength] = useState<number | null>(null)
  const [customWidth, setCustomWidth] = useState<number | null>(null)
  const [useCustom, setUseCustom] = useState(false)
  const [selectedClientId, setSelectedClientId] = useState('')
  const [clientName, setClientName] = useState('')
  const [siteLocation, setSiteLocation] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchRates()
    fetchTemplate()
    fetchCustomers()
    return () => cleanup()
  }, [])

  const activeSize = useMemo<StructureSize>(() => {
    if (useCustom && customLength && customWidth) {
      return {
        label: `${customLength}x${customWidth}m`,
        length: customLength,
        width: customWidth,
      }
    }
    return selectedSize
  }, [selectedSize, customLength, customWidth, useCustom])

  const calculation = useMemo<FowlrunCalculation>(() => {
    const { length: L, width: W } = activeSize
    const area = L * W
    const perimeter = 2 * (L + W)
    const wallH = 1.8
    const wallArea = perimeter * wallH
    const scale = area / (BASE.L * BASE.W)
    const bays = Math.ceil(L / 5)

    const context: Record<string, number> = {
      area,
      perimeter,
      wallArea,
      scale,
      bays,
    }

    const allItems: BOQLineItem[] = templateItems
      .filter((item) => {
        if (item.category === 'labour' && !rates.includeLabour) return false
        if (item.category === 'transport' && !rates.includeTransport) return false
        return true
      })
      .map((item) => {
        const qty = Math.ceil(item.multiplier * (context[item.variable] || 0))
        let unitPrice = item.baseUnitPrice || 0
        if (item.id === 'bricks') unitPrice = rates.brickUnitCost
        if (item.id === 'cement') unitPrice = rates.cementUnitCost
        return {
          id: item.id,
          description: item.description,
          unit: item.unit,
          qty,
          unitPrice,
          category: item.category,
          total: parseFloat((qty * unitPrice).toFixed(2)),
        }
      })

    const materialsTotal = allItems
      .filter((i) => i.category === 'material')
      .reduce((s, i) => s + i.total, 0)
    const labourTotal = allItems
      .filter((i) => i.category === 'labour')
      .reduce((s, i) => s + i.total, 0)
    const transportTotal = allItems
      .filter((i) => i.category === 'transport')
      .reduce((s, i) => s + i.total, 0)

    return {
      size: activeSize,
      area,
      perimeter,
      wallArea,
      scale,
      bays,
      birdCapacityMin: area * 10,
      birdCapacityMax: area * 15,
      items: allItems,
      materialsTotal,
      labourTotal,
      transportTotal,
      grandTotal: materialsTotal + labourTotal + transportTotal,
    }
  }, [activeSize, templateItems, rates])

  const handleClientSelect = (customerId: string | null) => {
    if (!customerId) return
    setSelectedClientId(customerId)
    if (customerId === 'new') {
      setClientName('')
      return
    }
    const customer = customers.find((c: any) => c.id === customerId)
    if (customer) {
      setClientName(customer.name || customer.displayName || '')
      setSiteLocation(customer.address || customer.location || '')
    }
  }

  const handleSubmitQuote = async () => {
    if (!clientName.trim()) {
      toast.error('Please enter a client name')
      return
    }
    if (!siteLocation.trim()) {
      toast.error('Please enter site location')
      return
    }
    setSaving(true)
    try {
      const result = await createJobCardFromCalculation(calculation, {
        clientName: clientName.trim(),
        siteLocation: siteLocation.trim(),
      })
      toast.success(`Quote ${result.jobNumber} created successfully`)
      
      // Reset fields
      setClientName('')
      setSiteLocation('')
      setSelectedClientId('')
      
      // Notify parent to switch tab or route
      onQuoteCreated(result.jobCardId, result.jobNumber)
    } catch (err: any) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const isLoading = loadingRates || loadingTemplate

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold tracking-tight">Fowlrun Structure Calculator</h3>
          <p className="text-muted-foreground text-xs">
            Calculate BOQ from template items with real-time dimensions
          </p>
        </div>
        <Button 
          onClick={handleSubmitQuote} 
          disabled={saving || isLoading}
          className="bg-brand-primary hover:bg-brand-primary/95 text-white font-bold h-9 shadow"
        >
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Submit Quote Card
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Dimensions */}
        <Card className="bg-card/50 backdrop-blur-sm border shadow rounded-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Ruler className="h-5 w-5 text-brand-primary" />
              Structure Dimensions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Preset Sizes */}
            <div>
              <Label className="mb-2 block font-semibold text-xs text-muted-foreground uppercase">Preset Sizes</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_SIZES.map((size) => (
                  <Button
                    key={size.label}
                    variant={
                      !useCustom && selectedSize.label === size.label
                        ? 'default'
                        : 'outline'
                    }
                    size="sm"
                    onClick={() => {
                      setUseCustom(false)
                      setSelectedSize(size)
                    }}
                    className={!useCustom && selectedSize.label === size.label ? 'bg-brand-primary text-white hover:bg-brand-primary/90 font-semibold' : ''}
                  >
                    {size.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Custom Size */}
            <div className="border-t pt-4">
              <Label className="mb-2 block font-semibold text-xs text-muted-foreground uppercase">Custom Size Override</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="font-semibold text-xs text-muted-foreground uppercase">Length (m)</Label>
                  <Input
                    type="number"
                    value={customLength ?? ''}
                    onChange={(e) => {
                      const v = e.target.value ? Number(e.target.value) : null
                      setCustomLength(v)
                      if (v && customWidth) setUseCustom(true)
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-semibold text-xs text-muted-foreground uppercase">Width (m)</Label>
                  <Input
                    type="number"
                    value={customWidth ?? ''}
                    onChange={(e) => {
                      const v = e.target.value ? Number(e.target.value) : null
                      setCustomWidth(v)
                      if (customLength && v) setUseCustom(true)
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Computed Dimensions */}
            <div className="grid grid-cols-2 gap-3 pt-4 border-t">
              <div className="bg-muted/50 rounded-lg p-2.5">
                <p className="text-[10px] text-muted-foreground font-semibold uppercase">Area</p>
                <p className="text-base font-bold text-foreground">{calculation.area} m²</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-2.5">
                <p className="text-[10px] text-muted-foreground font-semibold uppercase">Perimeter</p>
                <p className="text-base font-bold text-foreground">{calculation.perimeter} m</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-2.5">
                <p className="text-[10px] text-muted-foreground font-semibold uppercase">Wall Area (1.8m h)</p>
                <p className="text-base font-bold text-foreground">{calculation.wallArea} m²</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-2.5">
                <p className="text-[10px] text-muted-foreground font-semibold uppercase">Scale Factor</p>
                <p className="text-base font-bold text-foreground">{calculation.scale.toFixed(2)}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-2.5">
                <p className="text-[10px] text-muted-foreground font-semibold uppercase">Bays</p>
                <p className="text-base font-bold text-foreground">{calculation.bays}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-2.5 col-span-1">
                <p className="text-[10px] text-muted-foreground font-semibold uppercase">Bird Capacity</p>
                <p className="text-base font-bold text-foreground">
                  {calculation.birdCapacityMin} – {calculation.birdCapacityMax}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Client Info */}
        <Card className="bg-card/50 backdrop-blur-sm border shadow rounded-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-5 w-5 text-brand-primary" />
              Client & Site Assignment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="font-semibold text-xs text-muted-foreground uppercase">Select CRM Client Account</Label>
              <Select
                value={selectedClientId}
                onValueChange={handleClientSelect}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a client..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">+ Enter New Client</SelectItem>
                  {customers
                    .filter((c: any) => c.name || c.displayName)
                    .map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name || c.displayName}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="font-semibold text-xs text-muted-foreground uppercase">Client Name *</Label>
              <Input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Enter client name"
              />
            </div>
            <div className="space-y-2">
              <Label className="font-semibold text-xs text-muted-foreground uppercase">Site Installation Location *</Label>
              <Input
                value={siteLocation}
                onChange={(e) => setSiteLocation(e.target.value)}
                placeholder="e.g. 45 Farm Road, Marondera"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* BOQ Table */}
      <Card className="bg-card/50 backdrop-blur-sm border shadow rounded-xl overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calculator className="h-5 w-5 text-brand-primary" />
            Generated Bill of Quantities ({calculation.items.length} items)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left divide-y border-t">
              <thead className="bg-muted/30 uppercase text-[10px] text-muted-foreground font-bold">
                <tr>
                  <th className="p-3">Description</th>
                  <th className="p-3 text-center">Qty</th>
                  <th className="p-3 text-center">Unit</th>
                  <th className="p-3 text-right">Unit Price</th>
                  <th className="p-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y font-semibold">
                {isLoading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b">
                        <td className="p-3"><Skeleton className="h-4 w-48" /></td>
                        <td className="p-3"><Skeleton className="h-4 w-12 mx-auto" /></td>
                        <td className="p-3"><Skeleton className="h-4 w-12 mx-auto" /></td>
                        <td className="p-3"><Skeleton className="h-4 w-16 ml-auto" /></td>
                        <td className="p-3"><Skeleton className="h-4 w-20 ml-auto" /></td>
                      </tr>
                    ))
                  : calculation.items.map((item, i) => (
                      <tr
                        key={`${item.id}-${i}`}
                        className="hover:bg-muted/10 transition-colors"
                      >
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[9px] uppercase px-1 py-0">
                              {item.category}
                            </Badge>
                            <span>{item.description}</span>
                          </div>
                        </td>
                        <td className="p-3 text-center font-mono">
                          {item.qty.toLocaleString()}
                        </td>
                        <td className="p-3 text-center text-muted-foreground">
                          {item.unit}
                        </td>
                        <td className="p-3 text-right font-mono">
                          ${item.unitPrice.toFixed(2)}
                        </td>
                        <td className="p-3 text-right font-mono font-bold">
                          ${item.total.toFixed(2)}
                        </td>
                      </tr>
                    ))}
              </tbody>
              {!isLoading && (
                <tfoot className="bg-muted/10 divide-y font-semibold text-xs border-t">
                  <tr className="bg-muted/20">
                    <td colSpan={4} className="p-3 text-right text-muted-foreground uppercase text-[10px]">
                      Materials Total
                    </td>
                    <td className="p-3 font-mono font-bold text-right">
                      ${calculation.materialsTotal.toFixed(2)}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="p-3 text-right text-muted-foreground uppercase text-[10px]">
                      Labour Total
                    </td>
                    <td className="p-3 font-mono text-right text-muted-foreground">
                      ${calculation.labourTotal.toFixed(2)}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="p-3 text-right text-muted-foreground uppercase text-[10px]">
                      Transport Total
                    </td>
                    <td className="p-3 font-mono text-right text-muted-foreground">
                      ${calculation.transportTotal.toFixed(2)}
                    </td>
                  </tr>
                  <tr className="bg-primary/5 text-sm font-bold">
                    <td colSpan={4} className="p-3 text-right text-brand-primary uppercase">
                      Grand Total Quote
                    </td>
                    <td className="p-3 font-mono text-right text-brand-primary">
                      ${calculation.grandTotal.toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
