'use client'

import React, { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Settings2,
  Save,
  Plus,
  Trash2,
  Loader2,
  Calculator,
  Info,
} from 'lucide-react'
import { useAgricStructuresStore } from '@/stores/agric-structures-store'
import type { TemplateItem, FormulaVariable } from '@/features/agric-structures/types'
import { toast } from 'sonner'

const VARIABLES: { value: FormulaVariable; label: string }[] = [
  { value: 'area', label: 'Floor Area (m²)' },
  { value: 'perimeter', label: 'Perimeter (m)' },
  { value: 'wallArea', label: 'Wall Area (m²)' },
  { value: 'scale', label: 'Size Ratio (vs 80x10)' },
  { value: 'bays', label: 'Number of Bays' },
]

export function SettingsTab() {
  const {
    rates,
    templateItems,
    loadingRates,
    loadingTemplate,
    isProcessing,
    fetchRates,
    fetchTemplate,
    updateRates,
    saveTemplate,
    cleanup,
  } = useAgricStructuresStore()

  // Base Rates editable state
  const [editRates, setEditRates] = useState({
    brickUnitCost: 0,
    cementUnitCost: 0,
  })
  const [includeLabour, setIncludeLabour] = useState(true)
  const [includeTransport, setIncludeTransport] = useState(true)

  // Master Template local editable state
  const [localItems, setLocalItems] = useState<TemplateItem[]>([])

  useEffect(() => {
    fetchRates()
    fetchTemplate()
    return () => cleanup()
  }, [])

  useEffect(() => {
    setEditRates({
      brickUnitCost: rates.brickUnitCost,
      cementUnitCost: rates.cementUnitCost,
    })
    setIncludeLabour(rates.includeLabour)
    setIncludeTransport(rates.includeTransport)
  }, [rates])

  useEffect(() => {
    setLocalItems(templateItems.map((item) => ({ ...item })))
  }, [templateItems])

  const handleSaveRates = async () => {
    try {
      await updateRates({
        brickUnitCost: editRates.brickUnitCost,
        cementUnitCost: editRates.cementUnitCost,
        includeLabour,
        includeTransport,
      })
    } catch (err) {
      console.error(err)
    }
  }

  const handleSaveTemplate = async () => {
    // Validate template items
    const invalidItem = localItems.find((item) => !item.description.trim())
    if (invalidItem) {
      toast.error('All BOQ items must have a description')
      return
    }

    try {
      await saveTemplate(localItems)
    } catch (err) {
      console.error(err)
    }
  }

  const handleAddTemplateItem = () => {
    const newItem: TemplateItem = {
      id: crypto.randomUUID(),
      description: '',
      unit: 'pcs',
      category: 'material',
      multiplier: 1,
      variable: 'scale',
      baseUnitPrice: 0,
    }
    setLocalItems((prev) => [...prev, newItem])
  }

  const handleRemoveTemplateItem = (index: number) => {
    setLocalItems((prev) => prev.filter((_, idx) => idx !== index))
  }

  const handleUpdateTemplateItem = (
    index: number,
    field: keyof TemplateItem,
    value: any
  ) => {
    setLocalItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item
        return { ...item, [field]: value }
      })
    )
  }

  const isSaving = isProcessing

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">
      <div>
        <h3 className="text-xl font-bold tracking-tight">Agric Settings</h3>
        <p className="text-muted-foreground text-xs">
          Configure default rates and customize the Master BOQ calculation rules.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Left Column: Base Rates Customizer & Help */}
        <div className="space-y-6">
          <Card className="bg-card/50 backdrop-blur-sm border shadow rounded-xl">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Calculator className="h-5 w-5 text-brand-primary" />
                Base Rates
              </CardTitle>
              <CardDescription className="text-xs">
                Global rates applied across the poultry calculators.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingRates ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="animate-spin text-brand-primary" />
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label className="font-semibold text-xs text-muted-foreground uppercase">
                      Brick Unit Cost ($)
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={editRates.brickUnitCost}
                      onChange={(e) =>
                        setEditRates((p) => ({
                          ...p,
                          brickUnitCost: Number(e.target.value) || 0,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-semibold text-xs text-muted-foreground uppercase">
                      Cement Bag Cost ($/bag)
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={editRates.cementUnitCost}
                      onChange={(e) =>
                        setEditRates((p) => ({
                          ...p,
                          cementUnitCost: Number(e.target.value) || 0,
                        }))
                      }
                    />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="font-bold text-xs uppercase text-muted-foreground">
                        Include Labour
                      </Label>
                      <p className="text-[10px] text-muted-foreground">
                        Defaults to enabled for calculations
                      </p>
                    </div>
                    <Switch
                      checked={includeLabour}
                      onCheckedChange={setIncludeLabour}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="font-bold text-xs uppercase text-muted-foreground">
                        Include Transport
                      </Label>
                      <p className="text-[10px] text-muted-foreground">
                        Defaults to enabled for calculations
                      </p>
                    </div>
                    <Switch
                      checked={includeTransport}
                      onCheckedChange={setIncludeTransport}
                    />
                  </div>

                  <Button
                    onClick={handleSaveRates}
                    disabled={isSaving}
                    className="w-full bg-brand-primary hover:bg-brand-primary/95 text-white font-bold"
                  >
                    {isSaving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Save Base Rates
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Info className="h-5 w-5 text-blue-500" />
              <h4 className="font-bold text-blue-900 text-xs uppercase">
                Formula Variables
              </h4>
            </div>
            <div className="space-y-1.5">
              {VARIABLES.map((v) => (
                <p key={v.value} className="text-xs text-blue-800">
                  <span className="font-mono bg-blue-500/20 px-1 py-0.5 rounded text-[10px] font-bold">
                    {v.value}
                  </span>
                  :{' '}
                  <span className="font-semibold text-blue-900/80">
                    {v.label}
                  </span>
                </p>
              ))}
            </div>
            <Separator className="bg-blue-500/10" />
            <p className="text-[10px] text-blue-800 leading-relaxed italic">
              Estimated volumes are evaluated dynamically as:{' '}
              <code>ceil(Multiplier × Variable)</code>
            </p>
          </div>
        </div>

        {/* Right Column: Master BOQ Template Table */}
        <div className="md:col-span-2">
          <Card className="bg-card/50 backdrop-blur-sm border shadow rounded-xl overflow-hidden h-full flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base">Master BOQ Template</CardTitle>
                <CardDescription className="text-xs">
                  Configure default multipliers and variable targets for automated quotes.
                </CardDescription>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleAddTemplateItem}
                className="h-8 font-bold text-xs"
              >
                <Plus className="size-4 mr-1" /> Add Item
              </Button>
            </CardHeader>
            <CardContent className="p-0 flex-1 flex flex-col justify-between">
              <div className="overflow-x-auto overflow-y-auto max-h-[500px]">
                <table className="w-full text-xs text-left divide-y border-t">
                  <thead className="bg-muted/30 uppercase text-[10px] text-muted-foreground font-bold">
                    <tr className="sticky top-0 bg-background border-b z-10">
                      <th className="p-3 min-w-[200px]">Description</th>
                      <th className="p-3 w-16 text-center">Unit</th>
                      <th className="p-3 w-32">Variable</th>
                      <th className="p-3 w-20 text-center">Category</th>
                      <th className="p-3 w-16 text-center">Multiplier</th>
                      <th className="p-3 w-20 text-right">Base $</th>
                      <th className="p-3 w-12 text-center">Del</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y font-semibold">
                    {loadingTemplate ? (
                      Array.from({ length: 5 }).map((_, idx) => (
                        <tr key={idx} className="border-b">
                          {Array.from({ length: 7 }).map((_, cIdx) => (
                            <td key={cIdx} className="p-3">
                              <div className="h-4 bg-muted animate-pulse rounded" />
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : localItems.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="text-center p-8 text-muted-foreground italic"
                        >
                          No BOQ template items defined.
                        </td>
                      </tr>
                    ) : (
                      localItems.map((item, index) => (
                        <tr
                          key={item.id}
                          className="hover:bg-muted/5 transition-colors"
                        >
                          <td className="p-2">
                            <Input
                              value={item.description}
                              onChange={(e) =>
                                handleUpdateTemplateItem(
                                  index,
                                  'description',
                                  e.target.value
                                )
                              }
                              placeholder="Item description..."
                              className="h-8 text-xs font-semibold"
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              value={item.unit}
                              onChange={(e) =>
                                handleUpdateTemplateItem(
                                  index,
                                  'unit',
                                  e.target.value
                                )
                              }
                              className="h-8 text-xs text-center font-mono font-bold uppercase"
                            />
                          </td>
                          <td className="p-2">
                            <Select
                              value={item.variable}
                              onValueChange={(v) =>
                                handleUpdateTemplateItem(
                                  index,
                                  'variable',
                                  v as FormulaVariable
                                )
                              }
                            >
                              <SelectTrigger className="h-8 text-xs font-semibold">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {VARIABLES.map((v) => (
                                  <SelectItem key={v.value} value={v.value}>
                                    {v.value}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="p-2">
                            <Select
                              value={item.category}
                              onValueChange={(v) =>
                                handleUpdateTemplateItem(
                                  index,
                                  'category',
                                  v as any
                                )
                              }
                            >
                              <SelectTrigger className="h-8 text-xs font-semibold capitalize">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {['material', 'labour', 'transport'].map(
                                  (cat) => (
                                    <SelectItem key={cat} value={cat}>
                                      {cat}
                                    </SelectItem>
                                  )
                                )}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="p-2">
                            <Input
                              type="number"
                              value={item.multiplier}
                              onChange={(e) =>
                                handleUpdateTemplateItem(
                                  index,
                                  'multiplier',
                                  Number(e.target.value) || 0
                                )
                              }
                              className="h-8 text-xs text-center font-mono font-bold"
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              type="number"
                              step="0.01"
                              value={item.baseUnitPrice ?? 0}
                              onChange={(e) =>
                                handleUpdateTemplateItem(
                                  index,
                                  'baseUnitPrice',
                                  Number(e.target.value) || 0
                                )
                              }
                              className="h-8 text-xs text-right font-mono font-bold"
                            />
                          </td>
                          <td className="p-2 text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-red-500 hover:bg-red-500/10"
                              onClick={() => handleRemoveTemplateItem(index)}
                              title="Delete Item"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="p-4 border-t bg-muted/10 rounded-b-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <p className="text-[10px] text-muted-foreground italic max-w-sm">
                  * Note: Template modifications only alter NEW calculator items. Previously saved quotes and active project structures are unaffected.
                </p>
                <Button
                  onClick={handleSaveTemplate}
                  disabled={isSaving || loadingTemplate}
                  className="bg-brand-primary hover:bg-brand-primary/95 text-white font-bold shadow-md shadow-brand-primary/10 shrink-0"
                >
                  {isSaving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save BOQ Template
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
