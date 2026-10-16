'use client'

import React, { useState, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Trash2 } from 'lucide-react'
import type { OtherService } from '../types'

interface OtherServicesGridProps {
  modelValue: OtherService[]
  onUpdate: (services: OtherService[]) => void
}

export default function OtherServicesGrid({
  modelValue,
  onUpdate,
}: OtherServicesGridProps) {
  const [activeRowIndex, setActiveRowIndex] = useState(-1)
  const [activeColIndex, setActiveColIndex] = useState(-1)

  const columns = useMemo(() => [
    { key: 'description', label: 'Description', width: 'w-[50%]', align: 'left' as const },
    { key: 'qty', label: 'Qty', width: 'w-[10%]', align: 'right' as const },
    { key: 'price', label: 'Unit Price', width: 'w-[20%]', align: 'right' as const },
    { key: 'total', label: 'Total', width: 'w-[20%]', align: 'right' as const, readOnly: true },
  ], [])

  const updateRow = useCallback((index: number, field: keyof OtherService, value: any) => {
    const updated = [...modelValue]
    const item = { ...updated[index], [field]: value }
    if (field === 'qty' || field === 'price') {
      item.total = (item.qty || 0) * (item.price || 0)
    }
    updated[index] = item
    onUpdate(updated)
  }, [modelValue, onUpdate])

  const addRow = useCallback(() => {
    const newService: OtherService = {
      id: crypto.randomUUID(),
      description: '',
      qty: 1,
      price: 0,
      total: 0,
    }
    onUpdate([...modelValue, newService])
  }, [modelValue, onUpdate])

  const removeRow = useCallback((index: number) => {
    onUpdate(modelValue.filter((_, i) => i !== index))
  }, [modelValue, onUpdate])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (activeRowIndex === -1) return
    const maxRows = modelValue.length - 1
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault()
        if (activeRowIndex > 0) setActiveRowIndex(activeRowIndex - 1)
        break
      case 'ArrowDown':
        e.preventDefault()
        if (activeRowIndex < maxRows) setActiveRowIndex(activeRowIndex + 1)
        break
      case 'ArrowLeft':
        e.preventDefault()
        if (activeColIndex > 0) setActiveColIndex(activeColIndex - 1)
        break
      case 'ArrowRight':
        e.preventDefault()
        if (activeColIndex < columns.length - 2) setActiveColIndex(activeColIndex + 1) // skip readonly total
        break
      case 'Tab': {
        e.preventDefault()
        const next = e.shiftKey ? activeColIndex - 1 : activeColIndex + 1
        if (next >= 0 && next < columns.length - 1) {
          setActiveColIndex(next)
        }
        break
      }
    }
  }, [activeRowIndex, activeColIndex, modelValue.length, columns.length])

  const totalServices = useMemo(
    () => modelValue.reduce((sum, s) => sum + (s.total || 0), 0),
    [modelValue],
  )

  return (
    <div
      className="border rounded-md overflow-hidden bg-background font-sans"
      onKeyDown={handleKeyDown}
    >
      <div className="overflow-x-auto max-h-[400px] overflow-y-auto custom-scrollbar">
        <table className="w-full min-w-[600px] table-fixed border-collapse">
          <thead className="sticky top-0 bg-muted/60 z-10 border-b">
            <tr className="h-10">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`${col.width} ${col.align === 'right' ? 'text-right' : 'text-left'} px-4 text-[12px] font-bold uppercase tracking-wider text-muted-foreground border-r last:border-r-0`}
                >
                  {col.label}
                </th>
              ))}
              <th className="w-[50px]" />
            </tr>
          </thead>
          <tbody>
            {modelValue.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-10 text-sm text-muted-foreground">
                  No additional services added yet. Click "Add Service" to begin.
                </td>
              </tr>
            ) : (
              modelValue.map((row, idx) => (
                <tr
                  key={row.id}
                  className={`h-10 border-b hover:bg-muted/30 transition-colors ${
                    activeRowIndex === idx ? 'bg-primary/5 ring-1 ring-primary/20' : ''
                  }`}
                  onClick={() => setActiveRowIndex(idx)}
                >
                  <td className="p-0 border-r">
                    <Input
                      value={row.description}
                      onChange={(e) => updateRow(idx, 'description', e.target.value)}
                      onFocus={() => { setActiveRowIndex(idx); setActiveColIndex(0) }}
                      placeholder="Service description..."
                      className="h-full w-full border-0 rounded-none bg-transparent px-3 text-sm focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary"
                    />
                  </td>
                  <td className="p-0 border-r">
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      value={row.qty || ''}
                      onChange={(e) => updateRow(idx, 'qty', Number(e.target.value))}
                      onFocus={() => { setActiveRowIndex(idx); setActiveColIndex(1) }}
                      className="h-full w-full border-0 rounded-none bg-transparent px-3 text-sm text-right focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary"
                    />
                  </td>
                  <td className="p-0 border-r">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={row.price || ''}
                      onChange={(e) => updateRow(idx, 'price', Number(e.target.value))}
                      onFocus={() => { setActiveRowIndex(idx); setActiveColIndex(2) }}
                      className="h-full w-full border-0 rounded-none bg-transparent px-3 text-sm text-right focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary"
                    />
                  </td>
                  <td className="p-0 border-r text-right">
                    <div className="px-3 py-1 text-sm font-mono font-bold tabular-nums">
                      ${(row.total || 0).toFixed(2)}
                    </div>
                  </td>
                  <td className="p-0 text-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 hover:opacity-100"
                      onClick={(e) => { e.stopPropagation(); removeRow(idx) }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer with Add button and total */}
      <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/10">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs font-bold text-muted-foreground hover:text-foreground"
          onClick={addRow}
        >
          <Plus className="size-3.5 mr-1" /> Add Service
        </Button>
        <div className="flex items-center gap-4">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            Services Total
          </span>
          <span className="text-sm font-mono font-black text-foreground tabular-nums">
            ${totalServices.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  )
}