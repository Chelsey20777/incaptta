'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  FileText, Hammer, CreditCard, CheckCircle2, Circle,
  ArrowRight, ExternalLink, Clock, User, Mail, Phone, Building2, Users
} from 'lucide-react'
import { isLeadConvertedToCustomer } from '@/lib/customer-profile'

interface JourneyQuote {
  id: string
  quoteNumber: string
  status: string
  grandTotal: number
  createdAt: any
}

interface JourneyJobCard {
  id: string
  jobNumber?: string
  status: string
  createdAt: any
}

interface JourneyPayment {
  id: string
  amount: number
  createdAt: any
  paymentMethod?: string
}

interface Lead {
  id: string
  companyName: string
  contactName: string
  email: string
  phone: string
  stage: string
  value: number
  source?: string
  notes?: string
  partyType?: string
  requirementSummary?: string
  assignedTo?: string
  expectedCloseDate?: string
  nextActionSummary?: string
  nextActionDueAt?: string
  owner?: { uid?: string; name?: string }
  activities?: Array<{ id?: string; at?: string; summary?: string; type?: string }>
  pendingHandover?: { requestedTo?: { name?: string }; reason?: string } | null
  customerId?: string
  identityStatus?: 'PROSPECT' | 'CUSTOMER'
}

interface StaffOption {
  uid: string
  name: string
}

interface LeadJourneyPanelProps {
  lead: Lead | null
  open: boolean
  onClose: () => void
  onEdit: (lead: Lead) => void
  quotes: JourneyQuote[]
  jobCards: JourneyJobCard[]
  payments: JourneyPayment[]
  onConvertToQuote: (lead: Lead) => void
  onConvertToCustomer?: (lead: Lead) => void
  onViewCustomer?: (lead: Lead) => void
  onCompleteAction?: (lead: Lead) => void
  onAcceptHandover?: (lead: Lead) => void
  staff?: StaffOption[]
  canReassign?: boolean
  onRequestHandover?: (lead: Lead, nextOwner: StaffOption, reason: string) => void
  onReassign?: (lead: Lead, nextOwner: StaffOption, reason: string) => void
  onReopen?: (lead: Lead) => void
  timerLabel?: string
}

const stageOrder = ['New', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost']

const statusColor: Record<string, string> = {
  DRAFT: 'text-slate-400',
  SENT: 'text-blue-400',
  ACCEPTED: 'text-emerald-400',
  REJECTED: 'text-red-400',
  APPROVED_ACCOUNTANT: 'text-amber-400',
  APPROVED_MANAGER: 'text-emerald-400',
  CLOSED: 'text-purple-400',
}

function MilestoneStep({ done, label, sublabel, icon: Icon, color }: {
  done: boolean; label: string; sublabel?: string; icon: any; color: string
}) {
  return (
    <div className={`flex items-start gap-3 ${done ? 'opacity-100' : 'opacity-40'}`}>
      <div className={`mt-0.5 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center border-2 ${done ? `border-${color}-500 bg-${color}-500/10` : 'border-muted bg-muted/10'}`}>
        {done
          ? <Icon className={`w-4 h-4 text-${color}-400`} />
          : <Circle className="w-3 h-3 text-muted-foreground" />}
      </div>
      <div className="pt-1">
        <p className={`text-sm font-semibold ${done ? `text-${color}-300` : 'text-muted-foreground'}`}>{label}</p>
        {sublabel && <p className="text-xs text-muted-foreground mt-0.5">{sublabel}</p>}
      </div>
    </div>
  )
}

export default function LeadJourneyPanel({
  lead, open, onClose, onEdit, quotes, jobCards, payments, onConvertToQuote, onConvertToCustomer, onViewCustomer, onCompleteAction, onAcceptHandover,
  staff = [], canReassign, onRequestHandover, onReassign, onReopen, timerLabel,
}: LeadJourneyPanelProps) {
  const router = useRouter()
  const [handoverUid, setHandoverUid] = useState('')
  const [handoverReason, setHandoverReason] = useState('')

  if (!lead) return null
  const selectedStaff = staff.find(item => item.uid === handoverUid)

  const linkedQuote = quotes.find(q => q.id && lead)
  const linkedJob = jobCards.find(j => j.id && lead)
  const totalPaid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
  const totalValue = linkedJob ? (linkedJob as any).grandTotal || lead.value : lead.value
  const isJobComplete = linkedJob?.status === 'CLOSED'

  const hasQuote = quotes.length > 0
  const hasAcceptedQuote = quotes.some(q => q.status === 'ACCEPTED')
  const hasJobCard = jobCards.length > 0
  const hasPaid = totalPaid > 0
  const isComplete = isJobComplete

  const latestQuote = quotes[0]
  const latestJob = jobCards[0]

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-border">
          <div className="flex items-start justify-between">
            <div>
              <SheetTitle className="text-xl">{lead.companyName}</SheetTitle>
              <p className="text-sm text-muted-foreground mt-0.5">{lead.contactName}</p>
            </div>
            <div className="flex gap-2 mt-1">
              <Button variant="outline" size="sm" onClick={() => onEdit(lead)}>Edit</Button>
            </div>
          </div>
        </SheetHeader>

        <div className="py-6 space-y-6">
          {/* Contact Details */}
          <div className="grid grid-cols-2 gap-3">
            {lead.email && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{lead.email}</span>
              </div>
            )}
            {lead.phone && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{lead.phone}</span>
              </div>
            )}
            {lead.assignedTo && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <User className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{lead.assignedTo}</span>
              </div>
            )}
            {lead.source && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{lead.source.replace(/_/g, ' ')}</span>
              </div>
            )}
          </div>

          {(lead.nextActionSummary || lead.pendingHandover) && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-1">
              {lead.nextActionSummary && (
                <p className="text-sm"><span className="font-semibold">Next action:</span> {lead.nextActionSummary}</p>
              )}
              {lead.nextActionDueAt && (
                <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Due {lead.nextActionDueAt}</p>
              )}
              {lead.owner?.name && <p className="text-xs text-muted-foreground">Owner: {lead.owner.name}</p>}
              {lead.pendingHandover && (
                <p className="text-xs">Handover pending for {lead.pendingHandover.requestedTo?.name}: {lead.pendingHandover.reason}</p>
              )}
              {timerLabel && <p className="text-xs font-medium">{timerLabel}</p>}
            </div>
          )}

          {(lead.activities || []).length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Activities</p>
              {(lead.activities || []).slice(-5).reverse().map(activity => (
                <p key={activity.id} className="text-xs text-muted-foreground">
                  {activity.at ? new Date(activity.at).toLocaleString() : ''} · {activity.summary}
                </p>
              ))}
            </div>
          )}

          {/* Value */}
          <div className="bg-muted/20 border border-border rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Lead Value</p>
              <p className="text-2xl font-bold mt-1">${Number(lead.value || 0).toLocaleString()}</p>
            </div>
            <Badge className="text-xs" variant="outline">{lead.stage}</Badge>
          </div>

          {/* Journey Progress */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">Client Journey</p>

            <div className="space-y-4 relative">
              {/* Vertical connector line */}
              <div className="absolute left-4 top-8 bottom-0 w-px bg-border" />

              <MilestoneStep
                done={true}
                icon={CheckCircle2}
                label="Lead Created"
                sublabel={lead.stage !== 'New' ? `Currently: ${lead.stage}` : 'Active in pipeline'}
                color="slate"
              />

              <MilestoneStep
                done={hasQuote}
                icon={FileText}
                label="Quote Created"
                sublabel={latestQuote ? `${latestQuote.quoteNumber} · $${Number(latestQuote.grandTotal || 0).toLocaleString()} · ${latestQuote.status}` : undefined}
                color="blue"
              />

              <MilestoneStep
                done={hasAcceptedQuote}
                icon={CheckCircle2}
                label="Quote Accepted"
                sublabel={hasAcceptedQuote ? 'Client has accepted the quote' : undefined}
                color="indigo"
              />

              <MilestoneStep
                done={hasJobCard}
                icon={Hammer}
                label="Job Card Created"
                sublabel={latestJob ? `${latestJob.jobNumber || latestJob.id?.slice(0, 8)} · ${latestJob.status}` : undefined}
                color="amber"
              />

              <MilestoneStep
                done={hasPaid}
                icon={CreditCard}
                label="Payment Received"
                sublabel={hasPaid ? `$${totalPaid.toLocaleString()} paid${totalValue ? ` / $${Number(totalValue).toLocaleString()} total` : ''}` : undefined}
                color="purple"
              />

              <MilestoneStep
                done={isComplete}
                icon={CheckCircle2}
                label="Job Complete"
                sublabel={isComplete ? 'Job card closed — client won!' : undefined}
                color="emerald"
              />
            </div>
          </div>

          {/* Linked Documents */}
          {(quotes.length > 0 || jobCards.length > 0) && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Linked Documents</p>
              <div className="space-y-2">
                {quotes.map(q => (
                  <div key={q.id} className="flex items-center justify-between bg-muted/20 border border-border rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-400" />
                      <div>
                        <p className="text-sm font-medium">{q.quoteNumber}</p>
                        <p className={`text-xs ${statusColor[q.status] || 'text-muted-foreground'}`}>{q.status} · ${Number(q.grandTotal || 0).toLocaleString()}</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => router.push('/crm/quotations')}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
                {jobCards.map(j => (
                  <div key={j.id} className="flex items-center justify-between bg-muted/20 border border-border rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Hammer className="w-4 h-4 text-amber-400" />
                      <div>
                        <p className="text-sm font-medium">{(j as any).jobNumber || j.id?.slice(0, 8)}</p>
                        <p className={`text-xs ${statusColor[j.status] || 'text-muted-foreground'}`}>{j.status}</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => router.push('/job-cards')}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 space-y-2">
            {lead.nextActionSummary && onCompleteAction && (
              <Button variant="outline" className="w-full" onClick={() => onCompleteAction(lead)}>
                Complete current action
              </Button>
            )}
            {(lead.stage === 'Won' || lead.stage === 'Lost') && onReopen && (
              <Button variant="outline" className="w-full" onClick={() => onReopen(lead)}>
                Reopen closed enquiry
              </Button>
            )}
            {lead.pendingHandover && onAcceptHandover && (
              <Button variant="outline" className="w-full" onClick={() => onAcceptHandover(lead)}>
                Accept ownership handover
              </Button>
            )}
            <div className="rounded-xl border p-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Ownership</p>
              <Select value={handoverUid} onValueChange={(value) => value && setHandoverUid(value)}>
                <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                <SelectContent>
                  {staff.map(item => (
                    <SelectItem key={item.uid} value={item.uid}>{item.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input value={handoverReason} onChange={e => setHandoverReason(e.target.value)} placeholder="Reason required" />
              {onRequestHandover && (
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={!selectedStaff}
                  onClick={() => {
                    if (!selectedStaff) return
                    onRequestHandover(lead, selectedStaff, handoverReason)
                    setHandoverReason('')
                  }}
                >
                  Request handover
                </Button>
              )}
              {canReassign && onReassign && (
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={!selectedStaff}
                  onClick={() => {
                    if (!selectedStaff) return
                    onReassign(lead, selectedStaff, handoverReason)
                    setHandoverReason('')
                  }}
                >
                  Manager reassign
                </Button>
              )}
            </div>
            {isLeadConvertedToCustomer(lead) ? (
              onViewCustomer && (
                <Button variant="outline" className="w-full" onClick={() => { onClose(); onViewCustomer(lead) }}>
                  <Users className="w-4 h-4 mr-2" /> View customer
                </Button>
              )
            ) : (
              onConvertToCustomer && (
                <Button className="w-full" onClick={() => { onClose(); onConvertToCustomer(lead) }}>
                  <Users className="w-4 h-4 mr-2" /> Convert to customer
                </Button>
              )
            )}
            {!hasQuote && lead.stage !== 'Won' && lead.stage !== 'Lost' && (
              <Button variant={isLeadConvertedToCustomer(lead) ? 'default' : 'outline'} className="w-full" onClick={() => { onClose(); onConvertToQuote(lead) }}>
                <FileText className="w-4 h-4 mr-2" /> Convert to Quote
              </Button>
            )}
            {hasQuote && (
              <Button variant="outline" className="w-full" onClick={() => router.push('/crm/quotations')}>
                <ArrowRight className="w-4 h-4 mr-2" /> View Quotations
              </Button>
            )}
            {hasJobCard && (
              <Button variant="outline" className="w-full" onClick={() => router.push('/job-cards')}>
                <ArrowRight className="w-4 h-4 mr-2" /> View Job Cards
              </Button>
            )}
          </div>

          {/* Notes */}
          {lead.notes && (
            <div className="bg-muted/10 border border-border rounded-xl p-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">Notes</p>
              <p className="text-sm text-muted-foreground leading-relaxed">{lead.notes}</p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
