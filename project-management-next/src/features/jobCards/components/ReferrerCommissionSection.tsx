'use client'

import React, { useState, useMemo } from 'react'
import { UserCheck, Plus, Trash2, Paperclip, Upload, X, Loader2, Lock, Search } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import EditableCell from './EditableCell'
import { formatCurrency } from '@/lib/format'
import { blockIfUnderfunded, toastIfUnderfunded } from '@/lib/finance/funds-check-ui'
import { normalizeAccountKey } from '@/lib/account-keys'
import type { Referrer } from '../types'
import { uploadProofOfPayment } from '@/lib/storage-helpers'
import { toast } from 'sonner'

interface ReferrerCommissionSectionProps {
  referrers: Referrer[]
  onUpdate: (referrers: Referrer[]) => void
  totalCommission: number
  jobId?: string
  isAdmin?: boolean
  isAccountant?: boolean
  isManager?: boolean
  isJobApproved?: boolean
  onApproveItem?: (itemId: string, status: string) => void
  onApproveAll?: (status: string) => void
  accountBalances?: Record<string, number>
  balancesLoaded?: boolean
}

const PAYMENT_OPTIONS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'ECOCASH', label: 'EcoCash' },
  { value: 'BANK', label: 'Bank' },
  { value: 'RESERVE', label: 'Reserve Account' },
]

export default function ReferrerCommissionSection({
  referrers = [],
  onUpdate,
  totalCommission,
  jobId,
  isAccountant = false,
  isManager = false,
  isJobApproved = false,
  onApproveItem,
  onApproveAll,
  accountBalances,
  balancesLoaded = false,
}: ReferrerCommissionSectionProps) {
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const isRowLocked = (item: Referrer) => item.approvalStatus === 'APPROVED_MANAGER'

  const filteredReferrers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const indexed = (referrers || []).map((referrer, originalIdx) => ({ referrer, originalIdx }))
    if (!q) return indexed
    return indexed.filter(({ referrer }) => {
      const methodLabel =
        PAYMENT_OPTIONS.find((pm) => pm.value === referrer.paymentMethod)?.label ||
        referrer.paymentMethod ||
        ''
      return (
        (referrer.name || '').toLowerCase().includes(q) ||
        (referrer.paymentMethod || '').toLowerCase().includes(q) ||
        methodLabel.toLowerCase().includes(q)
      )
    })
  }, [referrers, searchQuery])

  const addReferrer = () => {
    onUpdate([
      ...(referrers || []),
      {
        id: `ref_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: '',
        amount: 0,
        paymentMethod: 'CASH',
        approvalStatus: 'PENDING',
        createdAt: new Date().toISOString(),
        attachments: [],
      },
    ])
  }

  const removeReferrer = (index: number) => {
    if (isRowLocked(referrers[index])) return
    onUpdate((referrers || []).filter((_, i) => i !== index))
  }

  const updateReferrer = (index: number, field: keyof Referrer | Partial<Referrer>, value?: unknown) => {
    if (isRowLocked(referrers[index]) && typeof field === 'string' && field !== 'attachments' && field !== 'proofUrl' && field !== 'proofName') {
      return
    }
    const updated = [...(referrers || [])]
    if (typeof field === 'object') {
      updated[index] = { ...updated[index], ...field }
    } else {
      updated[index] = { ...updated[index], [field]: value } as Referrer
    }
    onUpdate(updated)

    const next = updated[index]
    const methodChanged =
      (typeof field === 'string' && field === 'paymentMethod') ||
      (typeof field === 'object' && field !== null && 'paymentMethod' in field)
    if (methodChanged && next?.paymentMethod) {
      toastIfUnderfunded({
        accountRaw: next.paymentMethod,
        amount: Number(next.amount || 0),
        balances: accountBalances,
        balancesLoaded,
        context: normalizeAccountKey(next.paymentMethod) === 'RESERVE'
          ? 'Manager Reserve post will be blocked until funded.'
          : 'Ensure the account is funded before paying this commission.',
      })
    }
  }

  const handleApproveItem = (itemId: string, status: string) => {
    if (!onApproveItem) return
    if (status === 'APPROVED_MANAGER') {
      const item = referrers.find((row) => row.id === itemId)
      if (item && normalizeAccountKey(item.paymentMethod) === 'RESERVE') {
        if (blockIfUnderfunded({
          accountRaw: 'RESERVE',
          amount: Number(item.amount || 0),
          balances: accountBalances,
          balancesLoaded,
        })) return
      }
    }
    onApproveItem(itemId, status)
  }

  const handleApproveAll = (status: string) => {
    if (!onApproveAll) return
    if (status === 'APPROVED_MANAGER') {
      const reserveTotal = (referrers || [])
        .filter((row) =>
          row.approvalStatus === 'APPROVED_ACCOUNTANT' &&
          normalizeAccountKey(row.paymentMethod) === 'RESERVE'
        )
        .reduce((sum, row) => sum + Math.abs(Number(row.amount || 0)), 0)
      if (reserveTotal > 0 && blockIfUnderfunded({
        accountRaw: 'RESERVE',
        amount: reserveTotal,
        balances: accountBalances,
        balancesLoaded,
      })) return
    }
    onApproveAll(status)
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, idx: number, referrerId: string) => {
    const file = e.target.files?.[0]
    if (!file || !jobId) return

    setUploadingId(referrerId)
    const toastId = toast.loading('Uploading file...')
    try {
      const downloadUrl = await uploadProofOfPayment(file, jobId, `commission_${referrerId}`)
      
      const referrer = referrers[idx]
      const currentAttachments = [...(referrer.attachments || [])]
      currentAttachments.push({
        name: file.name,
        url: downloadUrl,
        uploadedAt: new Date().toISOString()
      })

      updateReferrer(idx, {
        attachments: currentAttachments,
        proofUrl: downloadUrl,
        proofName: file.name
      })
      toast.success('File uploaded successfully!', { id: toastId })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload file', { id: toastId })
    } finally {
      setUploadingId(null)
      e.target.value = ''
    }
  }

  return (
    <Card className="bg-card border border-border shadow-lg overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between gap-2 bg-muted/10 border-b border-border py-4 px-6">
        <div className="flex items-center gap-2">
          <UserCheck className="size-5 text-emerald-600" />
          <CardTitle className="text-sm font-black uppercase tracking-widest text-foreground">
            Job Referral & Commission
          </CardTitle>
        </div>
        <div className="flex items-center gap-2">
          {isJobApproved && (isAccountant || isManager) && onApproveAll && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 text-[10px] font-bold border-green-500/40 text-green-600 hover:bg-green-50"
              onClick={() => handleApproveAll(isManager ? 'APPROVED_MANAGER' : 'APPROVED_ACCOUNTANT')}
            >
              Approve All {isManager ? '(Manager)' : '(Accountant)'}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            className="h-9 px-4 gap-1 text-xs whitespace-nowrap shrink-0"
            onClick={addReferrer}
          >
            <Plus className="size-3.5" /> Add Recipient
          </Button>
        </div>
      </CardHeader>
      <div className="relative max-w-sm px-6 py-2 border-b">
        <Search className="absolute left-8 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search recipient, payment method…"
          className="pl-8 h-8"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>
      <CardContent className="p-0 overflow-x-auto">
        <Table className="border-collapse table-fixed w-full min-w-[700px] border-t border-l border-white/80">
          <TableHeader className="bg-muted/10 border-b border-white/80">
            <TableRow className="h-10 hover:bg-transparent">
              <TableHead className="text-[10px] uppercase font-black tracking-widest text-muted-foreground border-r border-b border-white/80 px-4 py-3">
                Recipient Name
              </TableHead>
              <TableHead className="text-[10px] uppercase font-black tracking-widest text-muted-foreground border-r border-b border-white/80 px-4 py-3 w-[20%]">
                Commission Amount ($)
              </TableHead>
              <TableHead className="text-[10px] uppercase font-black tracking-widest text-muted-foreground border-r border-b border-white/80 px-4 py-3 w-[14%]">
                Payment Method
              </TableHead>
              <TableHead className="text-[10px] uppercase font-black tracking-widest text-muted-foreground border-r border-b border-white/80 px-4 py-3 w-[22%]">
                Attachments
              </TableHead>
              {isJobApproved && (
                <TableHead className="text-[10px] uppercase font-black tracking-widest text-muted-foreground border-r border-b border-white/80 px-4 py-3 w-[14%]">
                  Status
                </TableHead>
              )}
              <TableHead className="w-[60px] border-b border-r border-white/80"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredReferrers.length === 0 && searchQuery.trim() && (
              <TableRow>
                <TableCell
                  colSpan={isJobApproved ? 6 : 5}
                  className="text-center py-10 text-sm text-muted-foreground"
                >
                  No matching commissions
                </TableCell>
              </TableRow>
            )}
            {filteredReferrers.map(({ referrer, originalIdx }) => (
              <TableRow
                key={referrer.id}
                className={`group border-b border-white/80 ${isRowLocked(referrer) ? 'bg-muted/20 opacity-70' : 'hover:bg-muted/5'}`}
              >
                <TableCell className="p-0 border-r border-b border-white/80">
                  <EditableCell
                    value={referrer.name}
                    type="text"
                    readOnly={isRowLocked(referrer)}
                    onUpdate={(v) => updateReferrer(originalIdx, 'name', v)}
                    placeholder="Recipient name..."
                    isEditing={true}
                  />
                </TableCell>
                <TableCell className="p-0 border-r border-b border-white/80">
                  <EditableCell
                    value={referrer.amount}
                    type="number"
                    readOnly={isRowLocked(referrer)}
                    onUpdate={(v) => updateReferrer(originalIdx, 'amount', Number(v))}
                    placeholder="0.00"
                    isEditing={true}
                  />
                </TableCell>
                <TableCell className="p-0 border-r border-b border-white/80">
                  <EditableCell
                    value={referrer.paymentMethod}
                    type="select"
                    options={PAYMENT_OPTIONS}
                    readOnly={isRowLocked(referrer)}
                    onUpdate={(v) => updateReferrer(originalIdx, 'paymentMethod', v)}
                    isEditing={true}
                  />
                </TableCell>
                <TableCell className="p-2 border-r border-b border-white/80 text-left">
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap gap-1">
                      {referrer.attachments && referrer.attachments.map((file, fIdx) => (
                        <div key={fIdx} className="flex items-center gap-1.5 bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/20 dark:border-emerald-500/30 rounded px-2 py-0.5 text-[10px] text-emerald-800 dark:text-emerald-300">
                          <Paperclip className="size-3 shrink-0 text-emerald-600" />
                          <a href={file.url} target="_blank" rel="noopener noreferrer" className="hover:underline font-bold truncate max-w-[100px]" title={file.name}>
                            {file.name}
                          </a>
                          {!isRowLocked(referrer) && (
                            <button
                              type="button"
                              className="text-rose-500 hover:text-rose-700 ml-1 cursor-pointer"
                              onClick={() => {
                                const updatedAttachments = [...(referrer.attachments || [])]
                                updatedAttachments.splice(fIdx, 1)
                                updateReferrer(originalIdx, {
                                  attachments: updatedAttachments,
                                  proofUrl: updatedAttachments.length > 0 ? updatedAttachments[0].url : null,
                                  proofName: updatedAttachments.length > 0 ? updatedAttachments[0].name : null
                                })
                              }}
                            >
                              <X className="size-3" />
                            </button>
                          )}
                        </div>
                      ))}
                      
                      {!referrer.attachments && referrer.proofUrl && (
                        <div className="flex items-center gap-1.5 bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/20 dark:border-emerald-500/30 rounded px-2 py-0.5 text-[10px] text-emerald-800 dark:text-emerald-300">
                          <Paperclip className="size-3 shrink-0 text-emerald-600" />
                          <a href={referrer.proofUrl} target="_blank" rel="noopener noreferrer" className="hover:underline font-bold truncate max-w-[100px]">
                            {referrer.proofName || 'Proof of Payment'}
                          </a>
                          {!isRowLocked(referrer) && (
                            <button
                              type="button"
                              className="text-rose-500 hover:text-rose-700 ml-1 cursor-pointer"
                              onClick={() => {
                                updateReferrer(originalIdx, {
                                  proofUrl: null,
                                  proofName: null,
                                  attachments: []
                                })
                              }}
                            >
                              <X className="size-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {jobId && !isRowLocked(referrer) ? (
                      <div className="flex items-center gap-1.5">
                        {uploadingId === referrer.id ? (
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Loader2 className="size-3 animate-spin text-emerald-600" />
                            <span>Uploading...</span>
                          </div>
                        ) : (
                          <>
                            <label
                              htmlFor={`file-upload-${referrer.id}`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold uppercase rounded border border-emerald-300 hover:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 dark:border-emerald-700/50 dark:hover:bg-emerald-500/20 cursor-pointer transition-colors"
                            >
                              <Upload className="size-2.5" /> Attach File
                            </label>
                            <input
                              type="file"
                              id={`file-upload-${referrer.id}`}
                              className="hidden"
                              onChange={(e) => handleFileUpload(e, originalIdx, referrer.id)}
                            />
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>
                </TableCell>
                {isJobApproved && (
                  <TableCell className="p-1 text-center border-r border-b border-white/80">
                    <div className="flex items-center justify-center gap-1">
                      <Badge
                        variant={referrer.approvalStatus === 'APPROVED_MANAGER' ? 'default' : referrer.approvalStatus === 'APPROVED_ACCOUNTANT' ? 'secondary' : 'outline'}
                        className="text-[9px] px-1 py-0 uppercase"
                      >
                        {referrer.approvalStatus === 'APPROVED_MANAGER' ? 'MGR OK' : referrer.approvalStatus === 'APPROVED_ACCOUNTANT' ? 'ACCT OK' : 'PENDING'}
                      </Badge>
                      {(!referrer.approvalStatus || referrer.approvalStatus === 'PENDING') && isAccountant && (
                        <div className="flex items-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 text-emerald-500 hover:bg-emerald-50"
                            onClick={() => handleApproveItem(referrer.id, 'APPROVED_ACCOUNTANT')}
                          >
                            <svg className="size-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 text-red-500 hover:bg-red-50"
                            onClick={() => handleApproveItem(referrer.id, 'REJECTED')}
                          >
                            <svg className="size-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                          </Button>
                        </div>
                      )}
                      {referrer.approvalStatus === 'APPROVED_ACCOUNTANT' && isManager && (
                        <div className="flex items-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 text-emerald-500 hover:bg-emerald-50"
                            onClick={() => handleApproveItem(referrer.id, 'APPROVED_MANAGER')}
                          >
                            <svg className="size-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 text-red-500 hover:bg-red-50"
                            onClick={() => handleApproveItem(referrer.id, 'REJECTED')}
                          >
                            <svg className="size-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                          </Button>
                        </div>
                      )}
                    </div>
                  </TableCell>
                )}
                <TableCell className="p-0 border-r border-b border-white/80 text-center">
                  <div className="flex items-center justify-center min-h-10">
                    {isRowLocked(referrer) ? (
                      <Lock className="size-3 mx-auto text-muted-foreground/50" />
                    ) : (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="text-destructive h-8 w-8 hover:bg-destructive/10"
                        onClick={() => removeReferrer(originalIdx)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {(!referrers || referrers.length === 0) && (
              <TableRow>
                <TableCell colSpan={isJobApproved ? 6 : 5} className="h-24 text-center text-muted-foreground italic text-xs">
                  No commission recipients added. Click &quot;Add Recipient&quot; to start.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div className="p-4 bg-muted/10 flex justify-between items-center border-t border-border">
          <span className="text-sm font-bold text-emerald-700">Total Fixed Commission</span>
          <span className="text-xl font-black text-emerald-600">
            {formatCurrency(totalCommission)}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
