'use client'

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Plus, Trash2, Paperclip, Loader2, Eye, X, Lock, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import EditableCell from './EditableCell'
import { uploadExpenseAttachment, deleteStorageUrls } from '../utils/financeUtils'
import { FileViewerModal } from '@/components/ui/file-viewer-modal'
import { useAdminStore } from '@/stores/admin-store'
import { normalizeAccountKey } from '@/lib/account-keys'
import { blockIfUnderfunded, toastIfUnderfunded } from '@/lib/finance/funds-check-ui'
import { isJobCardAdHocAutoEligible } from '@/lib/job-card-expense-approval'
import type { AdHocExpense } from '../types'

const PAYMENT_METHODS = [
  { value: '__SELECT_ACCOUNT__', label: 'Select account' },
  { value: 'CASH', label: 'Cash' },
  { value: 'ECOCASH', label: 'EcoCash' },
  { value: 'BANK', label: 'Bank' },
  { value: 'RESERVE', label: 'Reserve' },
]

const PAGE_SIZE = 50

interface JobCardExpensesGridProps {
  modelValue: AdHocExpense[]
  generalInfo?: any
  isAdmin?: boolean
  isAccountant?: boolean
  isManager?: boolean
  isJobApproved?: boolean
  /** Accountant / manager / admin may add proof after approval */
  canManageProof?: boolean
  onUpdate: (expenses: AdHocExpense[]) => void
  /** Persist expenses to Firestore (used after proof upload on approved rows) */
  onPersistExpenses?: (expenses: AdHocExpense[]) => Promise<void>
  /** Immediate cascade delete (OPEX + files + audit) for trash */
  onDeleteExpense?: (expense: AdHocExpense) => Promise<void>
  onApproveItem?: (itemId: string, status: string) => void | Promise<void>
  onApproveAll?: (status: string) => void | Promise<void>
  accountBalances?: Record<string, number>
  balancesLoaded?: boolean
}

const APPROVED_FOR_PROOF = ['APPROVED_ACCOUNTANT', 'APPROVED_MANAGER']
const isUnderAutoThreshold = (item: AdHocExpense) =>
  isJobCardAdHocAutoEligible(Number(item.totalAmount || Number(item.quantity || 0) * Number(item.unitPrice || 0)))

export default function JobCardExpensesGrid({
  modelValue,
  generalInfo,
  isAdmin = false,
  isAccountant = false,
  isManager = false,
  isJobApproved = false,
  canManageProof = false,
  onUpdate,
  onPersistExpenses,
  onDeleteExpense,
  onApproveItem,
  onApproveAll,
  accountBalances,
  balancesLoaded = false,
}: JobCardExpensesGridProps) {
  const adminStore = useAdminStore()
  const [isMobile, setIsMobile] = useState(false)
  const [isUploading, setIsUploading] = useState<Record<number, boolean>>({})
  const [uploadProgress, setUploadProgress] = useState<Record<number, number>>({})
  const [viewerFile, setViewerFile] = useState<{ url: string; title: string } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [approvingIds, setApprovingIds] = useState<Record<string, boolean>>({})
  const [approvingAll, setApprovingAll] = useState(false)
  const [deletingIds, setDeletingIds] = useState<Record<string, boolean>>({})

  const confirmManagerApproval = useCallback((items: AdHocExpense[]) => {
    if (!items.length) return true
    if (!balancesLoaded) {
      toast.error('Balances are still loading. Wait for finance data and try again.')
      return false
    }
    const totalsByAccount = new Map<string, number>()
    for (const item of items) {
      const account = normalizeAccountKey(item.paymentMethod)
      const amount = Math.abs(Number(item.totalAmount || Number(item.quantity || 0) * Number(item.unitPrice || 0)))
      totalsByAccount.set(account, (totalsByAccount.get(account) || 0) + amount)
    }
    for (const [account, total] of totalsByAccount.entries()) {
      if (blockIfUnderfunded({ accountRaw: account, amount: total, balances: accountBalances, balancesLoaded })) {
        return false
      }
    }
    const lines = [...totalsByAccount.entries()].map(([account, total]) => {
      const available = Number(accountBalances?.[account] || 0)
      return `${account}: debit $${total.toFixed(2)}; available $${available.toFixed(2)}`
    })
    return window.confirm(`Confirm final approval and ledger posting?\n\n${lines.join('\n')}`)
  }, [accountBalances, balancesLoaded])

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const isRowLocked = (item: any) => !isAdmin && item.approvalStatus === 'APPROVED_MANAGER'

  const canAddProof = (item: any) => !isRowLocked(item) || canManageProof

  const handleApproveItem = useCallback(
    async (itemId: string, status: string) => {
      if (!onApproveItem || approvingIds[itemId] || approvingAll) return
      const item = modelValue.find((row) => row.id === itemId)
      if (status === 'APPROVED_MANAGER' && item && !confirmManagerApproval([item])) return
      setApprovingIds((prev) => ({ ...prev, [itemId]: true }))
      try {
        await onApproveItem(itemId, status)
      } finally {
        setApprovingIds((prev) => {
          const next = { ...prev }
          delete next[itemId]
          return next
        })
      }
    },
    [onApproveItem, approvingIds, approvingAll, modelValue, confirmManagerApproval]
  )

  const handleApproveAll = useCallback(
    async (status: string) => {
      if (!onApproveAll || approvingAll || Object.keys(approvingIds).length > 0) return
      if (status === 'APPROVED_MANAGER') {
        const pending = modelValue.filter((item) => item.approvalStatus === 'APPROVED_ACCOUNTANT' && !isUnderAutoThreshold(item))
        if (!confirmManagerApproval(pending)) return
      }
      setApprovingAll(true)
      try {
        await onApproveAll(status)
      } finally {
        setApprovingAll(false)
      }
    },
    [onApproveAll, approvingAll, approvingIds, modelValue, confirmManagerApproval]
  )

  const isApprovedRow = (item: any) => APPROVED_FOR_PROOF.includes(item?.approvalStatus)

  const persistIfApproved = async (item: AdHocExpense | undefined, nextExpenses: AdHocExpense[]) => {
    if (!canManageProof || !onPersistExpenses || !item || !isApprovedRow(item)) return
    try {
      await onPersistExpenses(nextExpenses)
      toast.success('Proof of payment saved')
    } catch (err: any) {
      toast.error('Failed to save proof', { description: err?.message || 'Firestore write failed' })
    }
  }

  const getSortedItems = useCallback((items: any[]) => {
    return (items || [])
      .map((item, originalIdx) => ({ item, originalIdx }))
      .sort((a, b) => {
        const aApproved = a.item.approvalStatus === 'APPROVED_MANAGER'
        const bApproved = b.item.approvalStatus === 'APPROVED_MANAGER'
        if (aApproved && !bApproved) return 1
        if (!aApproved && bApproved) return -1
        return 0
      })
  }, [])

  const filteredItems = useMemo(() => {
    const sorted = getSortedItems(modelValue)
    const q = searchQuery.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter(({ item }) => {
      // Keep incomplete/new expense rows visible while user fills them in
      const incomplete =
        !(item.description || '').trim() &&
        !(item.recipientName || '').trim() &&
        !(item.recipientPhone || '').trim()
      if (incomplete) return true
      const methodLabel =
        PAYMENT_METHODS.find((pm) => pm.value === item.paymentMethod)?.label || item.paymentMethod || ''
      return (
        (item.description || '').toLowerCase().includes(q) ||
        (item.recipientName || '').toLowerCase().includes(q) ||
        (item.recipientPhone || '').toLowerCase().includes(q) ||
        (item.paymentMethod || '').toLowerCase().includes(q) ||
        methodLabel.toLowerCase().includes(q) ||
        (item.paymentRef || '').toLowerCase().includes(q)
      )
    })
  }, [modelValue, searchQuery, getSortedItems])

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE))

  const paginatedItems = useMemo(() => {
    const page = Math.min(currentPage, totalPages)
    const start = (page - 1) * PAGE_SIZE
    return filteredItems.slice(start, start + PAGE_SIZE)
  }, [filteredItems, currentPage, totalPages])

  const showingFrom = filteredItems.length === 0 ? 0 : (Math.min(currentPage, totalPages) - 1) * PAGE_SIZE + 1
  const showingTo = Math.min(Math.min(currentPage, totalPages) * PAGE_SIZE, filteredItems.length)

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    setCurrentPage(1)
  }

  const columns = useMemo(() => {
    const cols = [
      { key: 'index', label: '#', width: 'w-[30px]', editable: false, align: 'center' as const },
      { key: 'description', label: 'Description', editable: true },
      { key: 'recipientName', label: 'Recipient', width: 'w-[12%]', editable: true },
      { key: 'recipientPhone', label: 'Phone', width: 'w-[11%]', editable: true },
      { key: 'quantity', label: 'Qty', width: 'w-[7%]', editable: true, align: 'right' as const },
      { key: 'unitPrice', label: 'Unit Price', width: 'w-[10%]', editable: true, align: 'right' as const },
      { key: 'paymentMethod', label: 'Payment Method', width: 'w-[10%]', editable: true },
      { key: 'totalAmount', label: 'Total', width: 'w-[10%]', editable: false, align: 'right' as const },
      { key: 'attachmentUrl', label: 'Receipt', width: 'w-[10%]', editable: false, align: 'center' as const },
    ]
    if (isJobApproved) {
      cols.push({ key: 'approval', label: 'Status/Approval', width: 'w-[160px]', editable: false, align: 'center' as const })
    }
    return cols
  }, [isJobApproved])

  const updateItem = (index: number, fieldOrUpdates: string | Record<string, any>, value?: any) => {
    const current = modelValue[index]
    if (!current) return

    let updates: Record<string, any> = {}
    if (typeof fieldOrUpdates === 'string') {
      updates[fieldOrUpdates] = value
    } else {
      updates = fieldOrUpdates
    }

    const isAttachmentField = 'attachmentUrls' in updates || 'attachmentUrl' in updates
    if (isRowLocked(current) && !isAttachmentField) return

    const merged = { ...current, ...updates }
    if ('quantity' in updates || 'unitPrice' in updates) {
      merged.totalAmount = Number(merged.quantity || 0) * Number(merged.unitPrice || 0)
    }

    const newItems = [...modelValue]
    newItems[index] = merged
    onUpdate(newItems)

    // Persist funding account for unposted ACCT OK rows so snapshot/Post use the new method.
    const paymentMethodChanged = 'paymentMethod' in updates
    const canPersistAccount =
      paymentMethodChanged &&
      onPersistExpenses &&
      current.approvalStatus === 'APPROVED_ACCOUNTANT' &&
      !current.opexId
    if (canPersistAccount) {
      void onPersistExpenses(newItems).catch((err: any) => {
        toast.error('Failed to save payment method', { description: err?.message || 'Firestore write failed' })
      })
    }

    // Soft warn when selecting an underfunded liquid account (does not block the edit).
    if (paymentMethodChanged && merged.paymentMethod) {
      toastIfUnderfunded({
        accountRaw: merged.paymentMethod,
        amount: Number(merged.totalAmount || Number(merged.quantity || 0) * Number(merged.unitPrice || 0)),
        balances: accountBalances,
        balancesLoaded,
      })
    }
  }

  const removeItem = async (index: number) => {
    const item = modelValue[index]
    if (!item || isRowLocked(item)) return
    if (item.id && deletingIds[item.id]) return

    const newItems = modelValue.filter((_, i) => i !== index)

    if (onDeleteExpense && item.id) {
      setDeletingIds((prev) => ({ ...prev, [item.id]: true }))
      try {
        await onDeleteExpense(item)
        onUpdate(newItems)
        toast.success('Expense deleted')
      } catch (err: any) {
        console.error('Failed to delete expense:', err)
        toast.error('Failed to delete expense', { description: err?.message || 'Please try again.' })
      } finally {
        setDeletingIds((prev) => {
          const next = { ...prev }
          delete next[item.id]
          return next
        })
      }
      return
    }

    // Draft / local-only rows: still remove uploaded files from Storage
    const urls = [
      ...(item.attachmentUrls || []),
      ...(item.attachmentUrl ? [item.attachmentUrl] : []),
    ]
    if (urls.length > 0) {
      deleteStorageUrls(urls).catch((err) => {
        console.warn('Failed to clean draft expense attachments:', err)
      })
    }
    onUpdate(newItems)
  }

  const addNewRow = () => {
    const newItem: AdHocExpense = {
      id: crypto.randomUUID(),
      description: '',
      recipientName: '',
      recipientPhone: '',
      quantity: 1,
      unitPrice: 0,
      paymentMethod: '',
      paymentRef: '',
      totalAmount: 0,
      attachmentUrl: null,
      attachmentUrls: [],
      createdAt: new Date().toISOString(),
    }
    setSearchQuery('')
    const nextLength = (modelValue?.length || 0) + 1
    setCurrentPage(Math.max(1, Math.ceil(nextLength / PAGE_SIZE)))
    onUpdate([...modelValue, newItem])
  }

  const handleFileUpload = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const target = e.target
    if (!target.files || target.files.length === 0) return

    const item = modelValue[index]
    if (!item || !canAddProof(item)) {
      toast.error('You do not have permission to add proof of payment')
      target.value = ''
      return
    }

    setIsUploading((prev) => ({ ...prev, [index]: true }))
    setUploadProgress((prev) => ({ ...prev, [index]: 0 }))

    try {
      const currentUrls = [...(item.attachmentUrls || (item.attachmentUrl ? [item.attachmentUrl] : []))]

      for (let i = 0; i < target.files.length; i++) {
        const file = target.files[i]!
        const url = await uploadExpenseAttachment(file, 'job-expenses', (progress) => {
          setUploadProgress((prev) => ({ ...prev, [index]: progress }))
        })
        currentUrls.push(url)
        toast.success(`Uploaded ${file.name}`)
      }

      const updatedItem = {
        ...item,
        attachmentUrls: currentUrls,
        attachmentUrl: currentUrls.length > 0 ? currentUrls[0]! : null,
      }
      const newItems = modelValue.map((exp, i) => (i === index ? updatedItem : exp))
      onUpdate(newItems)
      await persistIfApproved(item, newItems)
    } catch (err: any) {
      toast.error('Upload failed', { description: err.message })
    } finally {
      setIsUploading((prev) => ({ ...prev, [index]: false }))
      target.value = ''
    }
  }

  const removeAttachment = async (index: number, attachmentIdx: number) => {
    const item = modelValue[index]
    if (!item || !canAddProof(item)) return
    const urls = [...(item.attachmentUrls || (item.attachmentUrl ? [item.attachmentUrl] : []))]
    urls.splice(attachmentIdx, 1)
    const updatedItem = {
      ...item,
      attachmentUrls: urls,
      attachmentUrl: urls.length > 0 ? urls[0]! : null,
    }
    const newItems = modelValue.map((exp, i) => (i === index ? updatedItem : exp))
    onUpdate(newItems)
    await persistIfApproved(item, newItems)
  }

  const triggerFileUpload = (index: number) => {
    document.getElementById(`exp-file-input-${index}`)?.click()
  }

  const getFileName = (url: string) => {
    if (!url) return 'Document'
    try {
      const decoded = decodeURIComponent(url)
      const pathPart = decoded.split('?')[0] || ''
      const parts = pathPart.split('/')
      const fullName = parts[parts.length - 1] || ''
      return fullName.replace(/^\d+_/g, '')
    } catch {
      return 'Document'
    }
  }

  const handleViewAttachment = (url: string) => {
    if (url) setViewerFile({ url, title: 'Expense Attachment/Receipt' })
  }

  const calculateLineTotal = (item: any) => (item.quantity || 0) * (item.unitPrice || 0)

  const resolveDepartmentName = (id: string) => {
    const dept = adminStore.departments.find((d: any) => d.id === id)
    return dept?.name || 'Unknown'
  }

  return (
    <div className="border rounded-md overflow-hidden bg-background font-sans">
      {/* General Info Header */}
      {generalInfo && (
        <div className="bg-muted/30 border-b px-4 py-2 flex flex-wrap items-center gap-x-8 gap-y-2 text-[11px] w-full">
          <div className="flex items-center gap-2">
            <span className="font-bold text-muted-foreground uppercase tracking-tight">Job #:</span>
            <span className="font-mono text-primary font-bold">{generalInfo.jobNumber || 'N/A'}</span>
          </div>
          {generalInfo.projectLocation && (
            <div className="flex items-center gap-2">
              <span className="font-bold text-muted-foreground uppercase tracking-tight">Location:</span>
              <span className="font-medium truncate max-w-[200px]">{generalInfo.projectLocation}</span>
            </div>
          )}
          {generalInfo.recipientName && (
            <div className="flex items-center gap-2 border-l pl-8">
              <span className="font-bold text-muted-foreground uppercase tracking-tight">Customer:</span>
              <span className="font-bold text-foreground">{generalInfo.recipientName}</span>
            </div>
          )}
          {isJobApproved && (isAccountant || isManager) && onApproveAll && (
            <div className="ml-auto">
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[10px] font-bold border-green-500/40 text-green-600 hover:bg-green-50"
                disabled={approvingAll || Object.keys(approvingIds).length > 0}
                onClick={() => handleApproveAll(isAccountant ? 'APPROVED_ACCOUNTANT' : 'APPROVED_MANAGER')}
              >
                {approvingAll ? (
                  <Loader2 className="size-3 mr-1 animate-spin" />
                ) : null}
                Approve All {isAccountant ? '(Accountant)' : '(Manager)'}
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 border-b bg-muted/20">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search description, recipient, phone…"
            className="pl-9 h-10 bg-background"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>
        <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
          Showing {showingFrom}-{showingTo} of {filteredItems.length}
        </span>
      </div>

      <div className="overflow-x-auto max-h-[400px] overflow-y-auto relative">
        {!isMobile ? (
          <Table className="border-collapse table-fixed w-full min-w-[900px] border-t border-l border-white/80">
            <TableHeader className="sticky top-0 bg-background z-40 border-b border-white/80 shadow-sm">
              <TableRow className="h-10 hover:bg-transparent">
                {columns.map((col) => (
                  <TableHead
                    key={col.key}
                    className={`${col.width || ''} ${col.align === 'right' ? 'text-right' : ''} text-[12px] font-bold px-2 border-r border-b border-white/80`}
                  >
                    {col.label}
                  </TableHead>
                ))}
                <TableHead className="w-[50px] border-b border-r border-white/80"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.length === 0 && searchQuery.trim() && (
                <TableRow>
                  <TableCell
                    colSpan={isJobApproved ? 11 : 10}
                    className="text-center py-10 text-sm text-muted-foreground"
                  >
                    No matching expenses
                  </TableCell>
                </TableRow>
              )}
              {paginatedItems.map(({ item, originalIdx }, displayIdx) => (
                <TableRow
                  key={item.id}
                  className={`group h-10 border-b border-white/80 ${isRowLocked(item) ? 'bg-muted/20 opacity-70' : 'hover:bg-muted/30'}`}
                >
                  <TableCell className="text-center tabular-nums font-bold text-[11px] opacity-50 border-r border-b border-white/80">
                    {(Math.min(currentPage, totalPages) - 1) * PAGE_SIZE + displayIdx + 1}
                  </TableCell>
                  <TableCell className="p-0 border-r border-b border-white/80">
                    <EditableCell
                      value={item.description}
                      type="text"
                      readOnly={isRowLocked(item)}
                      onUpdate={(v) => updateItem(originalIdx, 'description', v)}
                      placeholder="Expense description..."
                    />
                  </TableCell>
                  <TableCell className="p-0 border-r border-b border-white/80">
                    <EditableCell
                      value={item.recipientName}
                      type="text"
                      readOnly={isRowLocked(item)}
                      onUpdate={(v) => updateItem(originalIdx, 'recipientName', v)}
                      placeholder="Name..."
                    />
                  </TableCell>
                  <TableCell className="p-0 border-r border-b border-white/80">
                    <EditableCell
                      value={item.recipientPhone}
                      type="text"
                      readOnly={isRowLocked(item)}
                      onUpdate={(v) => updateItem(originalIdx, 'recipientPhone', v)}
                      placeholder="Phone..."
                    />
                  </TableCell>
                  <TableCell className="p-0 border-r border-b border-white/80">
                    <EditableCell
                      value={item.quantity}
                      type="number"
                      readOnly={isRowLocked(item)}
                      onUpdate={(v) => updateItem(originalIdx, 'quantity', v)}
                    />
                  </TableCell>
                  <TableCell className="p-0 border-r border-b border-white/80">
                    <EditableCell
                      value={item.unitPrice}
                      type="currency"
                      readOnly={isRowLocked(item)}
                      onUpdate={(v) => updateItem(originalIdx, 'unitPrice', v)}
                    />
                  </TableCell>
                  <TableCell className="p-0 border-r border-b border-white/80 text-xs">
                    <EditableCell
                      value={item.paymentMethod || '__SELECT_ACCOUNT__'}
                      type="select"
                      options={PAYMENT_METHODS}
                      readOnly={isRowLocked(item)}
                      onUpdate={(v) => updateItem(originalIdx, 'paymentMethod', v === '__SELECT_ACCOUNT__' ? '' : v)}
                    />
                  </TableCell>
                  <TableCell className="p-0 border-r border-b border-white/80 text-right bg-accent/5">
                    <div className="px-2 py-1 text-[12px] font-medium">
                      ${calculateLineTotal(item).toFixed(2)}
                    </div>
                  </TableCell>
                  <TableCell className="p-0 border-r border-b border-white/80 text-center">
                    <div className="flex items-center justify-center gap-1 min-h-10 p-1">
                      <input
                        type="file"
                        id={`exp-file-input-${originalIdx}`}
                        className="hidden"
                        accept="image/*,.pdf"
                        multiple
                        onChange={(e) => handleFileUpload(originalIdx, e)}
                      />
                      {isUploading[originalIdx] && (
                        <span className="text-[10px] font-bold text-muted-foreground animate-pulse">
                          {Math.round(uploadProgress[originalIdx] || 0)}%
                        </span>
                      )}
                      {(item.attachmentUrls?.length > 0 || item.attachmentUrl) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() =>
                            handleViewAttachment(
                              item.attachmentUrls?.[0] || item.attachmentUrl || ''
                            )
                          }
                        >
                          <Eye className="size-3.5" />
                        </Button>
                      )}
                      {canAddProof(item) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-primary"
                          onClick={() => triggerFileUpload(originalIdx)}
                          title="Add proof of payment"
                        >
                          <Plus className="size-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                  {isJobApproved && (
                    <TableCell className="p-1 text-center border-r border-b border-white/80">
                      <div className="flex items-center justify-center gap-1">
                        <Badge variant={item.approvalStatus === 'APPROVED_MANAGER' ? 'default' : item.approvalStatus === 'APPROVED_ACCOUNTANT' ? 'secondary' : 'outline'} className="text-[9px] px-1 py-0 uppercase">
                          {item.approvalStatus === 'APPROVED_MANAGER' ? (item.autoApproved ? 'AUTO OK' : 'MGR OK') : item.approvalStatus === 'APPROVED_ACCOUNTANT' ? 'ACCT OK' : 'PENDING'}
                        </Badge>
                        {(!item.approvalStatus || item.approvalStatus === 'PENDING') && isAccountant && (
                          <div className="flex items-center gap-0.5">
                            <Button
                               variant="ghost"
                               size="icon"
                               className="h-5 w-5 text-emerald-500 hover:bg-emerald-50"
                               disabled={!!approvingIds[item.id] || approvingAll}
                               onClick={() => handleApproveItem(item.id, 'APPROVED_ACCOUNTANT')}
                            >
                              {approvingIds[item.id] ? (
                                <Loader2 className="size-3 animate-spin" />
                              ) : (
                                <svg className="size-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 text-red-500 hover:bg-red-50"
                              disabled={!!approvingIds[item.id] || approvingAll}
                              onClick={() => handleApproveItem(item.id, 'REJECTED')}
                            >
                              <svg className="size-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                            </Button>
                          </div>
                        )}
                        {item.approvalStatus === 'APPROVED_ACCOUNTANT' && isUnderAutoThreshold(item) && isAccountant && (
                          <Button variant="ghost" size="sm" className="h-5 text-[9px] text-emerald-600" disabled={!!approvingIds[item.id] || approvingAll} onClick={() => handleApproveItem(item.id, 'APPROVED_ACCOUNTANT')}>
                            {approvingIds[item.id] ? <Loader2 className="size-3 animate-spin" /> : 'Post'}
                          </Button>
                        )}
                        {item.approvalStatus === 'APPROVED_ACCOUNTANT' && !isUnderAutoThreshold(item) && isManager && (
                          <div className="flex items-center gap-0.5">
                            <Button
                               variant="ghost"
                               size="icon"
                               className="h-5 w-5 text-emerald-500 hover:bg-emerald-50"
                               disabled={!!approvingIds[item.id] || approvingAll}
                               onClick={() => handleApproveItem(item.id, 'APPROVED_MANAGER')}
                            >
                              {approvingIds[item.id] ? (
                                <Loader2 className="size-3 animate-spin" />
                              ) : (
                                <svg className="size-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 text-red-500 hover:bg-red-50"
                              disabled={!!approvingIds[item.id] || approvingAll}
                              onClick={() => handleApproveItem(item.id, 'REJECTED')}
                            >
                              <svg className="size-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                            </Button>
                          </div>
                        )}
                      </div>
                    </TableCell>
                  )}
                  <TableCell className="p-0 text-center border-r border-b border-white/80">
                    {isRowLocked(item) ? (
                      <Lock className="size-3 mx-auto text-muted-foreground/50" />
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100"
                        disabled={!!deletingIds[item.id]}
                        onClick={() => removeItem(originalIdx)}
                      >
                        {deletingIds[item.id] ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Trash2 className="size-4" />
                        )}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          /* Mobile View */
          <div className="space-y-6 px-2 py-4">
            {filteredItems.length === 0 && searchQuery.trim() && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <h4 className="text-sm font-bold text-muted-foreground">No matching expenses</h4>
              </div>
            )}
            {paginatedItems.map(({ item, originalIdx }, displayIdx) => (
              <div
                key={item.id}
                className="relative overflow-hidden rounded-2xl border bg-card shadow-lg p-4 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <span className="flex size-7 items-center justify-center rounded-full bg-brand-primary text-[11px] font-black text-white">
                    {(Math.min(currentPage, totalPages) - 1) * PAGE_SIZE + displayIdx + 1}
                  </span>
                  {!isRowLocked(item) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      disabled={!!deletingIds[item.id]}
                      onClick={() => removeItem(originalIdx)}
                    >
                      {deletingIds[item.id] ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </Button>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-muted-foreground/70 ml-1">
                    Description
                  </label>
                  <textarea
                    value={item.description}
                    onChange={(e) => updateItem(originalIdx, 'description', e.target.value)}
                    className="w-full min-h-[60px] rounded-xl border-border/60 bg-background/50 px-4 py-2 text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-muted-foreground/60 ml-1">
                    Recipient Name
                  </label>
                  <input
                    value={item.recipientName}
                    onChange={(e) => updateItem(originalIdx, 'recipientName', e.target.value)}
                    disabled={isRowLocked(item)}
                    className="h-10 w-full rounded-xl border-border/60 bg-background px-4 text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-muted-foreground/60 ml-1">
                    Contact Phone
                  </label>
                  <input
                    value={item.recipientPhone || ''}
                    onChange={(e) => updateItem(originalIdx, 'recipientPhone', e.target.value)}
                    disabled={isRowLocked(item)}
                    placeholder="Phone number"
                    className="h-10 w-full rounded-xl border-border/60 bg-background px-4 text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-muted-foreground/60 ml-1">
                      Qty
                    </label>
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateItem(originalIdx, 'quantity', Number(e.target.value))}
                      disabled={isRowLocked(item)}
                      className="h-10 w-full rounded-xl border-border/60 bg-background px-4 text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-muted-foreground/60 ml-1">
                      Unit Price ($)
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={item.unitPrice}
                      onChange={(e) => updateItem(originalIdx, 'unitPrice', Number(e.target.value))}
                      className="h-10 w-full rounded-xl border-border/60 bg-background px-4 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-muted-foreground/60 ml-1">
                      Payment Method
                    </label>
                    <select
                      value={item.paymentMethod || '__SELECT_ACCOUNT__'}
                      onChange={(e) => updateItem(originalIdx, 'paymentMethod', e.target.value === '__SELECT_ACCOUNT__' ? '' : e.target.value)}
                      className="h-10 w-full rounded-xl border-border/60 bg-background px-4 text-sm"
                    >
                      {PAYMENT_METHODS.map((pm) => (
                        <option key={pm.value} value={pm.value}>
                          {pm.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-muted-foreground/60 ml-1">
                      Total
                    </label>
                    <div className="h-10 w-full rounded-xl border border-orange-200 bg-orange-50/50 flex items-center px-4 text-base font-black text-orange-600">
                      ${calculateLineTotal(item).toFixed(2)}
                    </div>
                  </div>
                </div>

                {isJobApproved && (
                  <div className="pt-2 flex items-center justify-between border-t border-dashed">
                    <span className="text-[9px] font-black uppercase text-muted-foreground/60">Status</span>
                    <div className="flex items-center gap-1.5">
                      <Badge variant={item.approvalStatus === 'APPROVED_MANAGER' ? 'default' : item.approvalStatus === 'APPROVED_ACCOUNTANT' ? 'secondary' : 'outline'} className="text-[9px] px-1.5 py-0 uppercase">
                        {item.approvalStatus === 'APPROVED_MANAGER' ? (item.autoApproved ? 'AUTO OK' : 'MGR OK') : item.approvalStatus === 'APPROVED_ACCOUNTANT' ? 'ACCT OK' : 'PENDING'}
                      </Badge>
                      {(!item.approvalStatus || item.approvalStatus === 'PENDING') && isAccountant && (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 text-[9px] font-black text-emerald-600 border-emerald-500/30 hover:bg-emerald-50 bg-emerald-50/50"
                            disabled={!!approvingIds[item.id] || approvingAll}
                            onClick={() => handleApproveItem(item.id, 'APPROVED_ACCOUNTANT')}
                          >
                            {approvingIds[item.id] ? <Loader2 className="size-3 animate-spin" /> : 'Approve'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 text-[9px] font-black text-red-600 border-red-500/30 hover:bg-red-50 bg-red-50/50"
                            disabled={!!approvingIds[item.id] || approvingAll}
                            onClick={() => handleApproveItem(item.id, 'REJECTED')}
                          >
                            Reject
                          </Button>
                        </div>
                      )}
                      {item.approvalStatus === 'APPROVED_ACCOUNTANT' && isUnderAutoThreshold(item) && isAccountant && (
                        <Button variant="outline" size="sm" className="h-6 px-2 text-[9px] text-emerald-600" disabled={!!approvingIds[item.id] || approvingAll} onClick={() => handleApproveItem(item.id, 'APPROVED_ACCOUNTANT')}>
                          {approvingIds[item.id] ? <Loader2 className="size-3 animate-spin" /> : 'Post'}
                        </Button>
                      )}
                      {item.approvalStatus === 'APPROVED_ACCOUNTANT' && !isUnderAutoThreshold(item) && isManager && (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 text-[9px] font-black text-emerald-600 border-emerald-500/30 hover:bg-emerald-50 bg-emerald-50/50"
                            disabled={!!approvingIds[item.id] || approvingAll}
                            onClick={() => handleApproveItem(item.id, 'APPROVED_MANAGER')}
                          >
                            {approvingIds[item.id] ? <Loader2 className="size-3 animate-spin" /> : 'Approve'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 text-[9px] font-black text-red-600 border-red-500/30 hover:bg-red-50 bg-red-50/50"
                            disabled={!!approvingIds[item.id] || approvingAll}
                            onClick={() => handleApproveItem(item.id, 'REJECTED')}
                          >
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="pt-2 border-t">
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      id={`exp-file-input-${originalIdx}`}
                      className="hidden"
                      accept="image/*,.pdf"
                      multiple
                      onChange={(e) => handleFileUpload(originalIdx, e)}
                    />
                    {canAddProof(item) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => triggerFileUpload(originalIdx)}
                      >
                        <Plus className="size-4 mr-1" /> Add Receipt
                      </Button>
                    )}
                    {isUploading[originalIdx] && (
                      <div className="flex items-center gap-2 flex-1 max-w-[200px] ml-2">
                        <div className="flex-1 h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-[var(--brand-primary)] rounded-full transition-all duration-300"
                            style={{ width: `${uploadProgress[originalIdx] || 0}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-muted-foreground">
                          {Math.round(uploadProgress[originalIdx] || 0)}%
                        </span>
                      </div>
                    )}
                  </div>
                  {(item.attachmentUrls?.length > 0 || item.attachmentUrl) && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(item.attachmentUrls || [item.attachmentUrl].filter(Boolean)).map(
                        (url: string, idx: number) => (
                          <div
                            key={idx}
                            className="flex items-center bg-muted/50 rounded-md px-2 py-1"
                          >
                            <button
                              onClick={() => handleViewAttachment(url)}
                              className="text-[11px] font-bold text-foreground mr-2"
                            >
                              <Eye className="size-3.5 inline mr-1" />
                              Receipt {idx + 1}
                            </button>
                            {canAddProof(item) && (
                              <button
                                onClick={() => removeAttachment(originalIdx, idx)}
                                className="text-destructive"
                              >
                                <X className="size-3" />
                              </button>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {modelValue.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <h4 className="text-base font-black text-muted-foreground">No Expenses</h4>
                <p className="text-sm text-muted-foreground/60">Add ad-hoc expenses to this job card.</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="p-2 border-t bg-muted/5 flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
        <Button variant="outline" size="sm" className="h-8 border-dashed" onClick={addNewRow}>
          <Plus className="size-4 mr-1" /> Add Row
        </Button>
        {filteredItems.length > PAGE_SIZE && (
          <div className="flex items-center gap-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="size-4 mr-1" /> Prev
            </Button>
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground tabular-nums px-1">
              Page {Math.min(currentPage, totalPages)} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              Next <ChevronRight className="size-4 ml-1" />
            </Button>
          </div>
        )}
      </div>

      <FileViewerModal 
        isOpen={!!viewerFile} 
        onClose={() => setViewerFile(null)} 
        url={viewerFile?.url || ''} 
        title={viewerFile?.title} 
      />
    </div>
  )
}
