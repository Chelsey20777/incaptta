'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useFinanceStore } from '@/stores/finance-store'
import { useAdminStore } from '@/stores/admin-store'
import { useAuthStore } from '@/stores/auth-store'
import { ArrowLeft, UploadCloud, FileIcon, X, Plus, Trash2, Loader2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { uploadExpenseAttachment } from '@/lib/storage-helpers'
import { toast } from 'sonner'
import { canAutoApproveOpex } from '@/lib/subcontractor-approval-policy'

export default function CreateOpexPage() {
  const router = useRouter()
  const financeStore = useFinanceStore()
  const adminStore = useAdminStore()
  const authStore = useAuthStore()

  const departments = useAdminStore((state) => state.departments)
  const expenseCategories = useAdminStore((state) => state.expenseCategories)
  const adminLoading = useAdminStore((state) => state.loading)

  const finalBalances = useFinanceStore((state) => state.finalBalances)
  const balancesLoading = useFinanceStore((state) => state.loading)
  const recordExpense = useFinanceStore((state) => state.recordExpense)

  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    const unsubAdmin = adminStore.fetchOpexLookups()
    const unsubscribeLedger = financeStore.subscribeLedger()

    return () => {
      unsubAdmin()
      unsubscribeLedger()
      adminStore.cleanup()
    }
  }, [])

  const fmt = (n: number) =>
    Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const [form, setForm] = useState({
    title: '',
    description: '',
    project: '',
    department: '',
    requestType: '',
    beneficiary: '',
    accountNo: '',
    dueDate: '',
    pettyCashAccount: '',
    category: 'operational', // Default for opex
    taxCategory: 'DEDUCTIBLE', // Default for ZIMRA compliance
    currency: 'USD',
    paymentMethod: '' // Synced from pettyCashAccount
  })

  const handlePettyCashChange = (val: string | null) => {
    setForm(p => ({ ...p, pettyCashAccount: val || '', paymentMethod: val || '' }))
  }

  const [items, setItems] = useState<Array<{ description: string; quantity: number; estCost: number }>>([
    { description: '', quantity: 1, estCost: 0 }
  ])

  const addItem = () => {
    setItems([...items, { description: '', quantity: 1, estCost: 0 }])
  }

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, idx) => idx !== index))
    }
  }

  const updateItem = (index: number, field: string, value: any) => {
    setItems(items.map((item, idx) => {
      if (idx === index) {
        return { ...item, [field]: value }
      }
      return item
    }))
  }

  const totalAmount = useMemo(() => {
    return items.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.estCost || 0)), 0)
  }, [items])

  const paymentBalance = useMemo(() => {
    if (!form.pettyCashAccount) return null
    return finalBalances[form.pettyCashAccount.toUpperCase()] ?? 0
  }, [form.pettyCashAccount, finalBalances])

  const isInsufficientFunds = useMemo(() => {
    return paymentBalance !== null && totalAmount > 0 && totalAmount > paymentBalance
  }, [paymentBalance, totalAmount])

  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles([...selectedFiles, ...Array.from(e.target.files)])
    }
  }

  const triggerFileUpload = () => {
    fileInputRef.current?.click()
  }

  const removeFile = (index: number) => {
    const updated = selectedFiles.filter((_, idx) => idx !== index)
    setSelectedFiles(updated)
    if (updated.length === 0 && fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const refreshAuthClaims = async () => {
    const firebaseUser = authStore.user
    if (!firebaseUser) return null
    const { getIdTokenResult } = await import('firebase/auth')
    const tokenResult = await getIdTokenResult(firebaseUser, true)
    authStore.setClaims(tokenResult.claims as Record<string, unknown>)
    if (tokenResult.token) {
      document.cookie = `__session=${tokenResult.token}; path=/; max-age=3600; SameSite=Strict; Secure`
    }
    return tokenResult.claims
  }

  const handleSubmit = async () => {
    if (!form.title || !form.department || !form.requestType) {
      toast.error('Required Fields', { description: 'Please fill in title, department and request type.' })
      return
    }

    if (!form.pettyCashAccount) {
      toast.error('Payment Account Required', { description: 'Please select which account this expense will be deducted from.' })
      return
    }

    if (items.some(i => !i.description || Number(i.estCost) <= 0)) {
      toast.error('Item Details', { description: 'Please ensure all items have a description and cost.' })
      return
    }

    if (isInsufficientFunds) {
      const account = form.pettyCashAccount.toUpperCase()
      const shortfall = totalAmount - (paymentBalance ?? 0)
      toast.error(`Insufficient Funds in ${account}`, {
        description: `Available: $${fmt(paymentBalance ?? 0)} — Required: $${fmt(totalAmount)} — Shortfall: $${fmt(shortfall)}. Please select a different payment account or reduce the amount.`,
      })
      return
    }

    setIsSubmitting(true)
    try {
      // Firestore create requires token.isActive === true. Stale sessions may
      // still show the UI while claims lack isActive — force-refresh first.
      if (!authStore.isActiveUser()) {
        const claims = await refreshAuthClaims()
        if (claims?.isActive !== true) {
          toast.error('Session Inactive', {
            description: 'Your account is missing an active session claim. Sign out, sign back in, or ask an admin to re-activate your user.',
          })
          return
        }
      }

      let attachmentUrls: string[] = []
      let attachmentUrl = ''
      if (selectedFiles.length > 0) {
        toast.loading(`Uploading ${selectedFiles.length} attachment(s)...`, { id: 'opex-upload' })
        attachmentUrls = await Promise.all(
          selectedFiles.map(file => uploadExpenseAttachment(file, 'opex'))
        )
        attachmentUrl = attachmentUrls[0] || ''
      }

      const isAdmin = authStore.isSuperAdmin() || authStore.hasRole('ADMIN' as any)
      const isAccountant = authStore.hasRole('ACCOUNTANT' as any) || isAdmin
      const isManager = authStore.hasRole('MANAGER' as any) || isAdmin
      const isAccountantOrAbove = isAccountant || isManager || isAdmin
      const authUser = authStore.user

      const isAutoApproved = canAutoApproveOpex(totalAmount, form)
      const initialStatus = isAccountantOrAbove
        ? (isAutoApproved ? 'APPROVED_FOR_PAYMENT' : 'APPROVED_ACCOUNTANT')
        : 'PENDING_ACCOUNTANT'

      const userEmail = authUser?.email || ''
      const userName = authUser?.displayName || authUser?.email || 'Unknown'

      await recordExpense({
        ...form,
        items,
        amount: totalAmount,
        attachmentUrl,
        attachmentUrls,
        taxCategory: form.taxCategory,
        type: 'INTERNAL_REQUISITION',
        status: initialStatus,
        createdByEmail: userEmail,
        createdByName: userName,
        ...(isAccountantOrAbove && {
          accountantApprovedBy: userName,
          accountantApprovedAt: new Date().toISOString(),
        }),
        ...(isAccountantOrAbove && isAutoApproved && {
          managerApprovedBy: 'System (Auto-approved < $300)',
          managerApprovedAt: new Date().toISOString(),
        })
      })

      const approvalMsg = isAccountantOrAbove
        ? (isAutoApproved ? 'Expense auto-approved & posted to ledger (< $300).' : 'Forwarded for manager final approval.')
        : 'Pending accountant review before manager approval.'
      toast.success('Expense Request Submitted', { id: 'opex-upload', description: approvalMsg })
      router.push('/opex')
    } catch (err: any) {
      console.error('Failed to record requisition:', err)
      const isPermission = err?.code === 'permission-denied' || /insufficient permissions|missing or insufficient/i.test(err?.message || '')
      toast.error('Submission Failed', {
        id: 'opex-upload',
        description: isPermission
          ? 'Missing Firestore permission. Confirm your user has an active ACCOUNTANT (or finance) role, then sign out and back in to refresh claims.'
          : (err.message || 'Unexpected error'),
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="w-full space-y-8 py-8 px-6 text-foreground">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}
          className="hover:bg-primary/10 hover:text-primary transition-colors">
          <ArrowLeft className="size-5" />
        </Button>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-muted-foreground uppercase tracking-widest">
            Internal Requisitions &gt; Create
          </span>
          <h2 className="text-4xl font-extrabold tracking-tight">Create Internal Requisition</h2>
        </div>
      </div>

      {/* Main Form Container */}
      <div className="space-y-6">

        {/* General Information Section */}
        <Card className="backdrop-blur-md bg-card/40 border-muted/20 shadow-2xl overflow-hidden">
          <div className="bg-[#2a0808] px-6 py-3 border-b border-[#3d0c0c]">
            <h3 className="text-lg font-bold text-brand-secondary tracking-wide">General Information</h3>
          </div>
          <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-6 p-8">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="title" className="text-xs font-bold uppercase opacity-60">Expense Title*</Label>
              <Input id="title" value={form.title} onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Office Supplies for March"
                className="bg-background/50 border-muted/30 h-10" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="project" className="text-xs font-bold uppercase opacity-60">Project (if applicable)</Label>
              <Input id="project" value={form.project} onChange={(e) => setForm(p => ({ ...p, project: e.target.value }))} placeholder="e.g. Building Renovation Phase 2"
                className="bg-background/50 border-muted/30 h-10" />
            </div>
            <div className="space-y-2 md:col-span-4">
              <Label htmlFor="desc" className="text-xs font-bold uppercase opacity-60">Description</Label>
              <Textarea id="desc" value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Describe the purpose and business justification for this expense..."
                className="bg-background/50 border-muted/30 min-h-[80px]" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dept" className="text-xs font-bold uppercase opacity-60">Requesting Department*</Label>
              <Select value={form.department} onValueChange={(val) => setForm(p => ({ ...p, department: val || '' }))}>
                <SelectTrigger id="dept" className="bg-background/50 border-muted/30 h-10">
                  <SelectValue placeholder="Select Department" />
                </SelectTrigger>
                <SelectContent>
                  {adminLoading ? (
                    <SelectItem value="loading" disabled>
                      <div className="flex items-center gap-2">
                        <Loader2 className="size-3 animate-spin" />
                        Loading...
                      </div>
                    </SelectItem>
                  ) : (
                    departments.map((dept: any) => (
                      <SelectItem key={dept.id} value={dept.name}>
                        {dept.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="category" className="text-xs font-bold uppercase opacity-60">Expense Category*</Label>
              <Select value={form.category} onValueChange={(val) => setForm(p => ({ ...p, category: val || '' }))}>
                <SelectTrigger id="category" className="bg-background/50 border-muted/30 h-10">
                  <SelectValue placeholder="Select Category" />
                </SelectTrigger>
                <SelectContent>
                  {adminLoading ? (
                    <SelectItem value="loading" disabled>
                      <div className="flex items-center gap-2">
                        <Loader2 className="size-3 animate-spin" />
                        Loading...
                      </div>
                    </SelectItem>
                  ) : (
                    expenseCategories.map((cat: any) => (
                      <SelectItem key={cat.id} value={cat.name}>
                        {cat.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="taxCategory" className="text-xs font-bold uppercase opacity-60">Tax Compliance (ITF12C)*</Label>
                <span className="text-[10px] text-brand-secondary font-bold uppercase tracking-tighter">ZIMRA</span>
              </div>
              <Select value={form.taxCategory} onValueChange={(val) => setForm(p => ({ ...p, taxCategory: val || '' }))}>
                <SelectTrigger id="taxCategory" className="bg-background/50 border-brand-secondary/20 h-10 ring-1 ring-brand-secondary/10">
                  <SelectValue placeholder="Tax Treatment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DEDUCTIBLE">Deductible (Standard)</SelectItem>
                  <SelectItem value="NON_DEDUCTIBLE_DEPRECIATION">Non-Deductible: Depreciation</SelectItem>
                  <SelectItem value="NON_DEDUCTIBLE_FINES">Non-Deductible: Fines & Penalties</SelectItem>
                  <SelectItem value="NON_DEDUCTIBLE_ENTERTAINMENT">Non-Deductible: Entertainment</SelectItem>
                  <SelectItem value="NON_DEDUCTIBLE_OTHER">Non-Deductible: Other</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground italic">Affects annual tax reconciliation.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="type" className="text-xs font-bold uppercase opacity-60">Request Type*</Label>
              <Select value={form.requestType} onValueChange={(val) => setForm(p => ({ ...p, requestType: val || '' }))}>
                <SelectTrigger id="type" className="bg-background/50 border-muted/30 h-10">
                  <SelectValue placeholder="Select an option" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="purchase">Purchase Request</SelectItem>
                  <SelectItem value="service">Service/Maintenance</SelectItem>
                  <SelectItem value="reimbursement">Reimbursement</SelectItem>
                  <SelectItem value="advance">Cash Advance</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Details Section */}
        <Card className="backdrop-blur-md bg-card/40 border-muted/20 shadow-2xl overflow-hidden">
          <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-6 p-8">
            <div className="space-y-2">
              <Label htmlFor="beneficiary" className="text-xs font-bold uppercase opacity-60">Beneficiary</Label>
              <Input id="beneficiary" value={form.beneficiary} onChange={(e) => setForm(p => ({ ...p, beneficiary: e.target.value }))} placeholder="Person/Company"
                className="bg-background/50 border-muted/30 h-10" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account" className="text-xs font-bold uppercase opacity-60">EcoCash No./Bank A/C No.</Label>
              <Input id="account" value={form.accountNo} onChange={(e) => setForm(p => ({ ...p, accountNo: e.target.value }))} placeholder="Account Details"
                className="bg-background/50 border-muted/30 h-10" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueDate" className="text-xs font-bold uppercase opacity-60">Due Date</Label>
              <Input id="dueDate" type="date" value={form.dueDate} onChange={(e) => setForm(p => ({ ...p, dueDate: e.target.value }))} className="bg-background/50 border-muted/30 h-10" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase opacity-60">Currency</Label>
              <Select value={form.currency} onValueChange={(val) => setForm(p => ({ ...p, currency: val || '' }))}>
                <SelectTrigger className="bg-background/50 border-muted/30 h-10">
                  <SelectValue placeholder="Select Currency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD — US Dollar</SelectItem>
                  <SelectItem value="ZWL">ZWL — Zimbabwe Dollar</SelectItem>
                  <SelectItem value="ZAR">ZAR — South African Rand</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase opacity-60">Total Amount</Label>
              <div className="h-10 flex items-center px-4 bg-muted/20 rounded-md border border-muted/20 font-mono font-bold text-brand-secondary">
                {form.currency} {fmt(totalAmount)}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pettyCash" className="text-xs font-bold uppercase opacity-60">
                Payment Account* <span className="normal-case font-normal opacity-70">(account to deduct from)</span>
              </Label>
              <Select value={form.pettyCashAccount} onValueChange={handlePettyCashChange}>
                <SelectTrigger id="pettyCash" className={`bg-background/50 border-muted/30 h-10 ${isInsufficientFunds ? 'border-destructive/60' : ''}`}>
                  <SelectValue placeholder="Select account to debit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ecocash">EcoCash</SelectItem>
                  <SelectItem value="bank">Bank Transfer</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="ird">IRD</SelectItem>
                  <SelectItem value="reserve">Reserve Account</SelectItem>
                </SelectContent>
              </Select>
              {/* Live balance indicator */}
              {form.pettyCashAccount && (
                <div className="flex items-center gap-1.5 text-xs px-1">
                  {balancesLoading ? (
                    <span className="text-muted-foreground italic">Loading balance…</span>
                  ) : isInsufficientFunds ? (
                    <>
                      <AlertTriangle className="size-3.5 text-destructive shrink-0" />
                      <span className="text-destructive font-semibold">
                        Insufficient — Available: ${fmt(paymentBalance ?? 0)}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-muted-foreground">Available:</span>
                      <span className="font-bold text-emerald-600">${fmt(paymentBalance ?? 0)}</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Items Section */}
        <Card className="backdrop-blur-md bg-card/40 border-muted/20 shadow-2xl overflow-hidden">
          <div className="bg-[#2a0808] px-6 py-3 border-b border-[#3d0c0c] flex items-center justify-between">
            <div className="space-y-0.5">
              <h3 className="text-lg font-bold text-brand-secondary tracking-wide">Internal Requisition Items</h3>
              <p className="text-xs text-brand-secondary/60 font-medium">Add items to your internal requisition</p>
            </div>
            <Button variant="outline" size="sm" onClick={addItem}
              className="bg-brand-secondary/10 border-brand-secondary/20 text-brand-secondary hover:bg-brand-secondary/20 gap-2">
              <Plus className="size-4" />
              Add Line
            </Button>
          </div>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/10 border-b border-muted/20">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-center font-bold text-brand-secondary uppercase tracking-tighter text-xs py-4">
                    Description
                  </TableHead>
                  <TableHead className="w-32 text-center font-bold text-brand-secondary uppercase tracking-tighter text-xs py-4 border-l border-muted/20">
                    Quantity
                  </TableHead>
                  <TableHead className="w-48 text-center font-bold text-brand-secondary uppercase tracking-tighter text-xs py-4 border-l border-muted/20">
                    Est. Cost
                  </TableHead>
                  <TableHead className="w-40 text-center font-bold text-brand-secondary uppercase tracking-tighter text-xs py-4 border-l border-muted/20">
                    Total
                  </TableHead>
                  <TableHead className="w-16 text-center py-4 border-l border-muted/20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, index) => (
                  <TableRow key={index} className="hover:bg-muted/5 border-b border-muted/10">
                    <TableCell className="p-2">
                      <Input value={item.description} onChange={(e) => updateItem(index, 'description', e.target.value)} placeholder="Description of the item/service"
                        className="bg-transparent border-none focus-visible:ring-1 focus-visible:ring-brand-secondary/30 h-10" />
                    </TableCell>
                    <TableCell className="p-2 border-l border-muted/10">
                      <Input type="number" value={item.quantity} onChange={(e) => updateItem(index, 'quantity', Number(e.target.value))}
                        className="bg-transparent border-none text-center focus-visible:ring-1 focus-visible:ring-brand-secondary/30 h-10" />
                    </TableCell>
                    <TableCell className="p-2 border-l border-muted/10">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                        <Input type="number" value={item.estCost} step="0.01" onChange={(e) => updateItem(index, 'estCost', Number(e.target.value))}
                          className="bg-transparent border-none pl-7 focus-visible:ring-1 focus-visible:ring-brand-secondary/30 h-10" />
                      </div>
                    </TableCell>
                    <TableCell className="p-2 border-l border-muted/10 text-center font-mono font-bold text-brand-secondary italic">
                      $ {fmt(item.quantity * item.estCost)}
                    </TableCell>
                    <TableCell className="p-2 border-l border-muted/10 text-center">
                      <Button variant="ghost" size="icon" onClick={() => removeItem(index)}
                        className="text-destructive hover:bg-destructive/10" disabled={items.length <= 1}>
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Attachment Support */}
        <Card className="backdrop-blur-md bg-card/40 border-muted/20 shadow-2xl">
          <CardContent className="p-8 space-y-4">
            <Label className="text-xs font-bold uppercase opacity-60">Supporting Documents (Optional)</Label>
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*,.pdf" multiple onChange={handleFileSelect} />

            <div onClick={triggerFileUpload}
              className="group border-2 border-dashed rounded-xl p-6 flex items-center justify-center gap-4 hover:bg-primary/5 hover:border-primary/30 cursor-pointer transition-all border-muted/20">
              <UploadCloud className="size-6 text-muted-foreground group-hover:text-primary" />
              <span className="text-sm font-medium">Click to upload receipts, invoices, or quotes (multiple allowed)</span>
            </div>

            {selectedFiles.length > 0 && (
              <div className="space-y-2">
                {selectedFiles.map((file, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 border rounded-lg bg-primary/5 border-primary/20">
                    <div className="flex items-center gap-3">
                      <FileIcon className="size-5 text-primary" />
                      <span className="text-sm font-bold truncate max-w-[400px]">{file.name}</span>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removeFile(idx)} className="h-8 w-8 text-destructive">
                      <X className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

      </div>

      {/* Actions */}
      <div className="flex justify-end gap-4 pb-12">
        <Button variant="outline" onClick={() => router.back()} className="h-12 px-8">Cancel</Button>
        <Button disabled={isSubmitting || isInsufficientFunds} onClick={handleSubmit}
          className={`h-12 px-12 text-base font-bold bg-brand-secondary hover:bg-[#e67a02] text-white shadow-lg shadow-[#ff8903]/20 transition-all active:scale-95 ${isInsufficientFunds ? 'opacity-50 cursor-not-allowed' : ''}`}>
          {isSubmitting ? 'Submitting...' : 'Submit Requisition'}
        </Button>
      </div>
    </div>
  )
}
