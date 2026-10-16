'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { Search, Maximize2, Minimize2 } from 'lucide-react'
import { formatCurrency, formatUnitPrice } from '@/lib/format'
import { cn } from '@/lib/utils'

interface SelectOption {
  value: string
  label: string
  description?: string
  price?: number
  cost?: number
  stockCount?: number
  uom?: string
}

interface EditableCellProps {
  value: string | number
  type?: 'text' | 'number' | 'currency' | 'unit-price' | 'select' | 'textarea' | 'searchable-select'
  options?: SelectOption[]
  placeholder?: string
  readOnly?: boolean
  isActive?: boolean
  isEditing?: boolean
  /** Push number edits immediately so line totals follow the quantity on screen. */
  commitOnChange?: boolean
  className?: string
  onUpdate: (value: any) => void
  onClick?: () => void
  children?: React.ReactNode
}

export default function EditableCell({
  value,
  type = 'text',
  options = [],
  placeholder = '',
  readOnly = false,
  isActive = false,
  isEditing = false,
  commitOnChange = false,
  className,
  onUpdate,
  onClick,
  children,
}: EditableCellProps) {
  const [editingValue, setEditingValue] = useState<string | number>(value)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [descExpanded, setDescExpanded] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const expandedTextareaRef = useRef<HTMLTextAreaElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setEditingValue(value)
  }, [value])

  useEffect(() => {
    if (isEditing) {
      if (type === 'textarea' && textareaRef.current) {
        textareaRef.current.focus()
      } else if (inputRef.current && type !== 'textarea') {
        inputRef.current.focus()
      }
    }
  }, [isEditing, type])

  useEffect(() => {
    if (descExpanded) {
      requestAnimationFrame(() => {
        expandedTextareaRef.current?.focus()
        const el = expandedTextareaRef.current
        if (el) {
          const len = el.value.length
          el.setSelectionRange(len, len)
        }
      })
    }
  }, [descExpanded])

  // Auto-focus the search input when the popover opens
  useEffect(() => {
    if (showSearch) {
      requestAnimationFrame(() => {
        searchInputRef.current?.focus()
      })
    }
  }, [showSearch])

  const commitDescription = useCallback(() => {
    onUpdate(editingValue)
  }, [editingValue, onUpdate])

  const collapseDescription = useCallback(() => {
    commitDescription()
    setDescExpanded(false)
  }, [commitDescription])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && type !== 'textarea') {
      e.preventDefault()
      onUpdate(editingValue)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setEditingValue(value)
      if (type === 'textarea') setDescExpanded(false)
    }
  }, [editingValue, onUpdate, value, type])

  if (readOnly) {
    if (type === 'currency') {
      return (
        <div className={cn('px-2 py-1 text-sm', className)} onClick={onClick}>
          {formatCurrency(Number(value) || 0)}
        </div>
      )
    }
    if (type === 'unit-price') {
      return (
        <div className={cn('px-2 py-1 text-sm', className)} onClick={onClick}>
          {formatUnitPrice(Number(value) || 0)}
        </div>
      )
    }
    if (type === 'select' || type === 'searchable-select') {
      const selectedLabel = options.find(o => o.value === value)?.label
      return (
        <div className={cn('px-2 py-1 text-sm truncate', className)} onClick={onClick}>
          {selectedLabel || value || placeholder || '---'}
        </div>
      )
    }
    return (
      <div className={cn('px-2 py-1 text-sm truncate', className)} onClick={onClick}>
        {value || placeholder || '---'}
      </div>
    )
  }

  // Select type — portal-based so table overflow / adjacent Status controls don't steal clicks.
  // Base UI needs `items` (or explicit SelectValue children) so the closed trigger shows
  // option labels instead of falling back to the raw value (e.g. employeeId / ECOCASH).
  if (type === 'select') {
    const selectValue = value === '' || value == null ? null : String(value)
    const selectedLabel = options.find((o) => o.value === selectValue)?.label
    const items = Object.fromEntries(options.map((o) => [o.value, o.label]))
    return (
      <div
        className={cn('relative w-full', className)}
        onClick={onClick}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Select
          value={selectValue}
          items={items}
          onValueChange={(v) => {
            if (v != null) onUpdate(v)
          }}
        >
          <SelectTrigger
            size="sm"
            className="h-8 w-full border-none shadow-none bg-transparent rounded-none px-2 text-sm focus-visible:ring-0 hover:bg-transparent dark:bg-transparent dark:hover:bg-transparent"
          >
            <SelectValue placeholder={placeholder || 'Select...'}>
              {selectedLabel}
            </SelectValue>
          </SelectTrigger>
          <SelectContent align="start" alignItemWithTrigger={false} className="min-w-[10rem]">
            {options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }

  // Searchable select type - uses Popover for proper portal-based positioning
  if (type === 'searchable-select') {
    const filteredOptions = searchQuery
      ? options.filter(o =>
          o.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          o.value.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : options

    return (
      <Popover open={showSearch} onOpenChange={(open) => { setShowSearch(open); if (!open) setSearchQuery('') }}>
        <PopoverTrigger
          render={children
            ? <div>{children}</div>
            : <div className={cn('px-2 py-1 text-sm cursor-pointer hover:bg-muted', className)}>
                {options.find(o => o.value === value)?.label || placeholder || 'Select...'}
              </div>
          }
        />
        <PopoverContent
          className="p-0 overflow-hidden"
          side="bottom"
          align="start"
          sideOffset={5}
          style={{ width: 'clamp(300px, 40vw, 500px)' }}
        >
          {/* Search Input */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-muted/20">
            <Search className="size-4 text-muted-foreground shrink-0" />
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search inventory..."
              className="flex-1 text-[13px] bg-transparent outline-none placeholder:text-muted-foreground font-medium"
              onKeyDown={(e) => {
                if (e.key === 'Escape') { setShowSearch(false); setSearchQuery('') }
                if (e.key === 'Enter' && filteredOptions.length === 1) {
                  e.preventDefault()
                  onUpdate(filteredOptions[0].value)
                  setShowSearch(false)
                  setSearchQuery('')
                }
              }}
            />
          </div>
          {/* Options List */}
          <div className="max-h-[300px] overflow-y-auto">
            {filteredOptions.length === 0 && (
              <div className="px-4 py-6 text-[13px] text-muted-foreground text-center italic">
                No items found matching &ldquo;{searchQuery}&rdquo;
              </div>
            )}
            {filteredOptions.map((opt) => (
              <div
                key={opt.value}
                className="flex items-center justify-between gap-3 px-4 py-2 text-[13px] cursor-pointer hover:bg-accent transition-colors border-b border-border/10 last:border-0"
                onMouseDown={(e) => {
                  e.preventDefault()
                  onUpdate(opt.value)
                  setShowSearch(false)
                  setSearchQuery('')
                }}
              >
                <div className="flex flex-col min-w-0">
                  <span className="font-medium truncate">{opt.label}</span>
                  {opt.description && (
                    <span className="text-[10px] text-muted-foreground truncate mt-0.5">
                      {opt.description}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {opt.price != null && (
                    <span className="text-xs font-bold tabular-nums">
                      ${Number(opt.price).toFixed(2)}
                    </span>
                  )}
                  {opt.stockCount != null && (
                    <span
                      className={cn(
                        'text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap border',
                        opt.stockCount > 0
                          ? 'bg-green-500/10 text-green-500 border-green-500/20'
                          : 'bg-red-500/10 text-red-500 border-red-500/20'
                      )}
                    >
                      {opt.stockCount} {opt.uom || 'units'}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    )
  }

  // Textarea type — compact in-table cell with expand popover for longer input
  if (type === 'textarea') {
    return (
      <div className={cn('relative flex items-start gap-0.5 group/desc', className)} onClick={onClick}>
        <textarea
          ref={textareaRef}
          value={String(editingValue)}
          onChange={(e) => {
            setEditingValue(e.target.value)
            onUpdate(e.target.value)
          }}
          onBlur={() => {
            if (!descExpanded) onUpdate(editingValue)
          }}
          onKeyDown={handleKeyDown}
          onDoubleClick={() => setDescExpanded(true)}
          placeholder={placeholder}
          rows={1}
          className={cn(
            'flex-1 min-w-0 bg-transparent px-2 py-1 text-sm outline-none resize-none',
            'min-h-[32px] max-h-[48px] overflow-hidden leading-snug'
          )}
          title="Double-click or use expand to write more"
        />
        <Popover
          open={descExpanded}
          onOpenChange={(open) => {
            if (!open) collapseDescription()
            else setDescExpanded(true)
          }}
        >
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  'h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground',
                  'opacity-70 group-hover/desc:opacity-100',
                  descExpanded && 'opacity-100 text-primary'
                )}
                title={descExpanded ? 'Collapse description' : 'Expand description'}
                aria-label={descExpanded ? 'Collapse description' : 'Expand description'}
              />
            }
          >
            {descExpanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </PopoverTrigger>
          <PopoverContent
            className="p-3 w-[min(520px,92vw)]"
            side="bottom"
            align="start"
            sideOffset={6}
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Description
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-7 text-xs"
                  onClick={collapseDescription}
                >
                  <Minimize2 className="size-3 mr-1.5" />
                  Done
                </Button>
              </div>
              <textarea
                ref={expandedTextareaRef}
                value={String(editingValue)}
                onChange={(e) => {
                  setEditingValue(e.target.value)
                  onUpdate(e.target.value)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    collapseDescription()
                  }
                }}
                placeholder={placeholder || 'Enter a detailed description...'}
                rows={8}
                className={cn(
                  'w-full min-h-[160px] rounded-md border border-border bg-background',
                  'px-3 py-2 text-sm outline-none resize-y',
                  'focus-visible:ring-2 focus-visible:ring-ring'
                )}
              />
              <p className="text-[10px] text-muted-foreground">
                Press Esc or Done to collapse back to the table.
              </p>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    )
  }

  // Currency type
  if (type === 'currency') {
    return (
      <div className="relative" onClick={onClick}>
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
        <input
          ref={inputRef}
          type="number"
          step="any"
          value={editingValue}
          onChange={(e) => setEditingValue(e.target.value)}
          onBlur={() => onUpdate(editingValue)}
          onKeyDown={handleKeyDown}
          placeholder="0.00"
          className={cn(
            'w-full bg-transparent px-2 pl-5 py-1 text-sm text-right outline-none',
            className
          )}
        />
      </div>
    )
  }

  // Unit Price type
  if (type === 'unit-price') {
    return (
      <div className="relative" onClick={onClick}>
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
        <input
          ref={inputRef}
          type="number"
          step="any"
          value={editingValue}
          onChange={(e) => setEditingValue(e.target.value)}
          onBlur={() => onUpdate(editingValue)}
          onKeyDown={handleKeyDown}
          placeholder="0.0000"
          className={cn(
            'w-full bg-transparent px-2 pl-5 py-1 text-sm text-right outline-none',
            className
          )}
        />
      </div>
    )
  }

  // Number type
  if (type === 'number') {
    return (
      <input
        ref={inputRef}
        type="number"
        step="any"
        value={editingValue}
        onChange={(e) => {
          setEditingValue(e.target.value)
          if (commitOnChange) onUpdate(e.target.value)
        }}
        onBlur={() => onUpdate(editingValue)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || '0'}
        className={cn(
          'w-full bg-transparent px-2 py-1 text-sm text-right outline-none',
          className
        )}
      />
    )
  }

  // Default text type
  return (
    <input
      ref={inputRef}
      type="text"
      value={String(editingValue)}
      onChange={(e) => {
        setEditingValue(e.target.value)
        onUpdate(e.target.value)
      }}
      onBlur={() => onUpdate(editingValue)}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      className={cn(
        'w-full bg-transparent px-2 py-1 text-sm outline-none',
        className
      )}
    />
  )
}
