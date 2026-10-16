'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Input } from '@/components/ui/input'
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
  value: string | number | boolean
  type?: 'text' | 'number' | 'currency' | 'percent' | 'select' | 'boolean' | 'textarea' | 'searchable-select'
  options?: SelectOption[]
  placeholder?: string
  readOnly?: boolean
  isActive?: boolean
  isEditing?: boolean
  className?: string
  onUpdate: (value: any) => void | Promise<void>
  onCancel?: () => void
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
  className,
  onUpdate,
  onCancel,
  onClick,
  children,
}: EditableCellProps) {
  const [editingValue, setEditingValue] = useState<string | number | boolean>(value)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const searchRef = useRef<HTMLDivElement>(null)
  const finishedRef = useRef(false)

  useEffect(() => {
    setEditingValue(value)
  }, [value])

  useEffect(() => {
    if (isEditing) {
      finishedRef.current = false
      if (type === 'textarea' && textareaRef.current) {
        textareaRef.current.focus()
      } else if (inputRef.current && type !== 'textarea') {
        inputRef.current.focus()
      }
    }
  }, [isEditing, type])

  const commit = useCallback(() => {
    if (finishedRef.current) return
    finishedRef.current = true
    void onUpdate(editingValue)
  }, [editingValue, onUpdate])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && type !== 'textarea') {
      e.preventDefault()
      e.stopPropagation()
      commit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      finishedRef.current = true
      setEditingValue(value)
      onCancel?.()
    }
  }, [commit, onCancel, value, type])

  const formatCurrency = (val: number) => {
    return `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  if (readOnly) {
    if (type === 'currency') {
      return (
        <div className={cn('px-2 py-1 text-sm', className)} onClick={onClick}>
          {formatCurrency(Number(value) || 0)}
        </div>
      )
    }
    if (type === 'percent') {
      return (
        <div className={cn('px-2 py-1 text-sm', className)} onClick={onClick}>
          {value}%
        </div>
      )
    }
    if (type === 'select') {
      const selectedOption = options.find(o => o.value === String(value))
      const displayLabel = selectedOption?.label ?? (value !== '' ? String(value) : null)
      return (
        <div className={cn('px-2 py-1 text-sm truncate', className)} onClick={onClick}>
          {displayLabel || placeholder || '---'}
        </div>
      )
    }
    if (type === 'boolean') {
      return (
        <div className={cn('px-2 py-1 text-sm', className)} onClick={onClick}>
          {Boolean(value) ? 'Active' : 'Inactive'}
        </div>
      )
    }
    return (
      <div className={cn('px-2 py-1 text-sm truncate', className)} onClick={onClick}>
        {value !== undefined && value !== null && value !== '' ? value : placeholder || '---'}
      </div>
    )
  }

  // Select type
  if (type === 'select') {
    const selectedOption = options.find(o => o.value === value)
    return (
      <div className={cn('relative w-full h-full', className)} onClick={onClick}>
        <select
          value={String(value)}
          onChange={(e) => {
            finishedRef.current = true
            void onUpdate(e.target.value)
          }}
          onKeyDown={handleKeyDown}
          className="w-full h-full bg-transparent px-2 py-1 text-sm border-none focus:outline-none focus:ring-1 focus:ring-primary rounded"
        >
          <option value="" disabled>Select...</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    )
  }

  if (type === 'boolean') {
    return (
      <div className={cn('relative w-full h-full', className)} onClick={onClick}>
        <select
          value={Boolean(value) ? 'true' : 'false'}
          onChange={(e) => {
            finishedRef.current = true
            void onUpdate(e.target.value === 'true')
          }}
          onKeyDown={handleKeyDown}
          className="w-full h-full bg-transparent px-2 py-1 text-sm border-none focus:outline-none focus:ring-1 focus:ring-primary rounded"
        >
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>
    )
  }

  // Textarea type
  if (type === 'textarea') {
    return (
      <div className={cn('p-0.5 w-full h-full', className)}>
        <textarea
          ref={textareaRef}
          value={String(editingValue)}
          onChange={(e) => setEditingValue(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full min-h-[60px] p-1 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-primary resize-y bg-background"
        />
      </div>
    )
  }

  // Default input type (text, number, currency, percent)
  const inputType = (type === 'number' || type === 'currency' || type === 'percent') ? 'number' : 'text'

  return (
    <div className={cn('p-0.5 w-full h-full', className)}>
      <Input
        ref={inputRef}
        type={inputType}
        value={typeof editingValue === 'boolean' ? String(editingValue) : editingValue}
        step={inputType === 'number' ? 'any' : undefined}
        onChange={(e) => {
          const val = e.target.value
          setEditingValue(inputType === 'number' ? (val === '' ? '' : Number(val)) : val)
        }}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="h-7 text-xs px-2 border rounded focus:outline-none focus:ring-1 focus:ring-primary bg-background w-full"
      />
    </div>
  )
}
