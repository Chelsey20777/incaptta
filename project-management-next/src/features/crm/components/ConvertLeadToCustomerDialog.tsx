'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import { findCustomerMatches } from '@/lib/crm/enquiry'
import { mapLeadToCustomerInput } from '@/lib/customer-profile'

type LeadLike = {
  id: string
  companyName?: string
  contactName?: string
  email?: string
  phone?: string
  partyType?: string
  requirementSummary?: string
  notes?: string
}

type CustomerLike = {
  id: string
  name?: string
  email?: string
  phone?: string
  company?: string
  companyName?: string
}

const emptyForm = {
  customerType: 'INDIVIDUAL' as 'COMPANY' | 'INDIVIDUAL',
  name: '',
  primaryContactName: '',
  email: '',
  phone: '',
  address: '',
  siteAddress: '',
  taxId: '',
  registrationNumber: '',
  creditLimit: 0,
  notes: '',
}

export default function ConvertLeadToCustomerDialog({
  lead,
  customers,
  open,
  saving,
  onOpenChange,
  onCreate,
  onLinkExisting,
}: {
  lead: LeadLike | null
  customers: CustomerLike[]
  open: boolean
  saving: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (profile: typeof emptyForm) => Promise<void>
  onLinkExisting: (customerId: string) => Promise<void>
}) {
  const [formData, setFormData] = useState(emptyForm)

  const matches = useMemo(() => {
    if (!lead) return []
    return findCustomerMatches(customers, {
      contactName: lead.contactName,
      companyName: lead.companyName,
      email: lead.email,
      phone: lead.phone,
    })
  }, [customers, lead])

  useEffect(() => {
    if (!lead || !open) return
    const mapped = mapLeadToCustomerInput({
      partyType: lead.partyType,
      companyName: lead.companyName,
      contactName: lead.contactName,
      email: lead.email,
      phone: lead.phone,
      requirementSummary: lead.requirementSummary,
      notes: lead.notes,
    })
    setFormData({
      customerType: (mapped.customerType as 'COMPANY' | 'INDIVIDUAL') || 'INDIVIDUAL',
      name: String(mapped.name || ''),
      primaryContactName: String(mapped.primaryContactName || ''),
      email: String(mapped.email || ''),
      phone: String(mapped.phone || ''),
      address: '',
      siteAddress: '',
      taxId: '',
      registrationNumber: '',
      creditLimit: 0,
      notes: String(mapped.notes || ''),
    })
  }, [lead, open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Convert to customer</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <p className="text-sm text-muted-foreground">
            Enquiry details are copied across. Add billing and tax details here, or link an existing customer instead of creating a duplicate.
          </p>
          {matches.length > 0 && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
              <p className="text-xs font-semibold">Possible existing customers</p>
              {matches.map((match) => (
                <div key={match.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{match.name || match.email || match.id}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={saving}
                    onClick={() => onLinkExisting(match.id)}
                  >
                    Link existing
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-2">
            <Label>Customer type *</Label>
            <Select
              value={formData.customerType}
              onValueChange={(value) => value && setFormData((prev) => ({ ...prev, customerType: value as 'COMPANY' | 'INDIVIDUAL' }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="COMPANY">Company</SelectItem>
                <SelectItem value="INDIVIDUAL">Individual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{formData.customerType === 'COMPANY' ? 'Company name *' : 'Customer name *'}</Label>
            <Input value={formData.name} onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))} />
          </div>
          {formData.customerType === 'COMPANY' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Primary contact</Label>
                <Input value={formData.primaryContactName} onChange={(e) => setFormData((prev) => ({ ...prev, primaryContactName: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Registration number</Label>
                <Input value={formData.registrationNumber} onChange={(e) => setFormData((prev) => ({ ...prev, registrationNumber: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Tax ID</Label>
                <Input value={formData.taxId} onChange={(e) => setFormData((prev) => ({ ...prev, taxId: e.target.value }))} />
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={formData.email} onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={formData.phone} onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Billing address</Label>
            <Input value={formData.address} onChange={(e) => setFormData((prev) => ({ ...prev, address: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Site address</Label>
            <Input value={formData.siteAddress} onChange={(e) => setFormData((prev) => ({ ...prev, siteAddress: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Credit limit ($)</Label>
            <Input
              type="number"
              min="0"
              value={formData.creditLimit}
              onChange={(e) => setFormData((prev) => ({ ...prev, creditLimit: Math.max(0, Number(e.target.value)) }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={formData.notes} onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={saving || !formData.name.trim()} onClick={() => onCreate(formData)}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create customer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
