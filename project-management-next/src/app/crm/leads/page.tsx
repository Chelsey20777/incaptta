'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { db } from '@/lib/firebase'
import { collection, query, orderBy, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { useCrmStore } from '@/stores/crm-store'
import { useAuthStore } from '@/stores/auth-store'
import {
  ENQUIRY_CHANNELS,
  canAdvanceLeadStage,
  closedLeadStats,
  findCustomerMatches,
  normalizeLeadPriority,
  validateEnquiryCapture,
} from '@/lib/crm/enquiry'
import { classifyFollowUps, validateHandover, validateNextActionReplacement, validateReopenClosed } from '@/lib/crm/enquiry-activities'
import { enquiryTimerState } from '@/lib/ops/business-calendar'
import { useAdminStore } from '@/stores/admin-store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Plus, Search, Users, DollarSign, TrendingUp, Target, X, Loader2,
  FileText, Hammer, CreditCard, CheckCircle2, Circle
} from 'lucide-react'
import { toast } from 'sonner'
import LeadJourneyPanel from '@/features/crm/components/LeadJourneyPanel'
import ConvertLeadToCustomerDialog from '@/features/crm/components/ConvertLeadToCustomerDialog'
import { isLeadConvertedToCustomer } from '@/lib/customer-profile'

const LEAD_STAGES = ['New', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'] as const
const LEAD_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const

const stageColors: Record<string, string> = {
  New: 'border-slate-500/20 bg-slate-500/5 text-slate-200',
  Contacted: 'border-blue-500/20 bg-blue-500/5 text-blue-200',
  Qualified: 'border-indigo-500/20 bg-indigo-500/5 text-indigo-200',
  Proposal: 'border-purple-500/20 bg-purple-500/5 text-purple-200',
  Negotiation: 'border-amber-500/20 bg-amber-500/5 text-amber-200',
  Won: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-200',
  Lost: 'border-red-500/20 bg-red-500/5 text-red-200',
}

const stageIcons: Record<string, string> = {
  New: '🆕',
  Contacted: '📞',
  Qualified: '✅',
  Proposal: '📄',
  Negotiation: '🤝',
  Won: '🎉',
  Lost: '❌',
}

interface JourneyMiniProps {
  hasQuote: boolean
  hasAccepted: boolean
  hasJobCard: boolean
  hasPaid: boolean
  isComplete: boolean
}

function JourneyMini({ hasQuote, hasAccepted, hasJobCard, hasPaid, isComplete }: JourneyMiniProps) {
  const steps = [
    { done: hasQuote, icon: FileText, label: 'Quote', color: 'text-blue-400' },
    { done: hasAccepted, icon: CheckCircle2, label: 'Accepted', color: 'text-indigo-400' },
    { done: hasJobCard, icon: Hammer, label: 'Job', color: 'text-amber-400' },
    { done: hasPaid, icon: CreditCard, label: 'Paid', color: 'text-purple-400' },
    { done: isComplete, icon: CheckCircle2, label: 'Done', color: 'text-emerald-400' },
  ]
  return (
    <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border/30">
      {steps.map((s, i) => {
        const Icon = s.icon
        return (
          <React.Fragment key={s.label}>
            <div className="flex flex-col items-center gap-0.5" title={s.label}>
              <Icon className={`w-3 h-3 ${s.done ? s.color : 'text-muted-foreground/30'}`} />
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-px ${s.done ? 'bg-border/60' : 'bg-border/20'}`} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

export default function LeadsPage() {
  const router = useRouter()
  const { leads, customers, fetchLeads, fetchCustomers, updateLead, addLead, deleteLead, loading, recordLeadActivity, acceptLeadHandover, requestLeadHandover, reassignLeadOwner, convertLeadToCustomer } = useCrmStore()
  const { user, profile, hasAnyRole } = useAuthStore()
  const adminStore = useAdminStore()

  // Real-time cross-collection data for journey tracking
  const [allQuotes, setAllQuotes] = useState<any[]>([])
  const [allJobCards, setAllJobCards] = useState<any[]>([])
  const [allPayments, setAllPayments] = useState<any[]>([])

  const [searchQuery, setSearchQuery] = useState('')
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL')
  const [stageFilter, setStageFilter] = useState<string>('ALL')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingLead, setEditingLead] = useState<any>(null)
  const [saving, setSaving] = useState(false)

  // Journey panel state
  const [panelLead, setPanelLead] = useState<any>(null)
  const [panelOpen, setPanelOpen] = useState(false)

  // "Convert to Quote" redirect state
  const [convertLead, setConvertLead] = useState<any>(null)
  const [convertCustomerLead, setConvertCustomerLead] = useState<any>(null)
  const [convertingCustomer, setConvertingCustomer] = useState(false)

  const [formData, setFormData] = useState({
    companyName: '',
    contactName: '',
    email: '',
    phone: '',
    stage: 'New' as string,
    priority: 'MEDIUM' as string,
    value: 0,
    source: '',
    expectedCloseDate: '',
    assignedTo: '',
    notes: '',
    partyType: 'individual' as string,
    channel: '',
    requirementSummary: '',
    nextActionSummary: '',
    nextActionDueAt: '',
    receivedAt: '',
    lostReason: '',
    customerId: '',
  })
  const [customerMatches, setCustomerMatches] = useState<Array<{ id: string; name?: string; email?: string }>>([])

  useEffect(() => {
    const unsubLeads = fetchLeads()
    const unsubCustomers = fetchCustomers()
    const unsubAdmin = adminStore.fetchAll()
    return () => {
      if (unsubLeads) unsubLeads()
      if (unsubCustomers) unsubCustomers()
      if (typeof unsubAdmin === 'function') unsubAdmin()
    }
  }, [])

  // Subscribe to quotes, job cards and payments for journey tracking
  useEffect(() => {
    const unsubQuotes = onSnapshot(
      query(collection(db, 'crmQuotes'), orderBy('createdAt', 'desc')),
      (snap) => setAllQuotes(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
    const unsubJobs = onSnapshot(
      query(collection(db, 'jobCards'), orderBy('createdAt', 'desc')),
      (snap) => setAllJobCards(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
    const unsubPayments = onSnapshot(
      query(collection(db, 'jobPayments'), orderBy('createdAt', 'desc')),
      (snap) => setAllPayments(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
    return () => { unsubQuotes(); unsubJobs(); unsubPayments() }
  }, [])

  // Helper: find linked quotes for a lead (by leadId or customerName/email match)
  const getLeadQuotes = (lead: any) => {
    return allQuotes.filter(q =>
      (q.leadId && q.leadId === lead.id) ||
      (q.customerName && q.customerName === lead.companyName) ||
      (q.customerEmail && q.customerEmail === lead.email)
    )
  }

  const getLeadJobCards = (lead: any) => {
    return allJobCards.filter(j =>
      (j.leadId && j.leadId === lead.id) ||
      (j.customerName && j.customerName === lead.companyName)
    )
  }

  const getLeadPayments = (lead: any) => {
    const jobCardIds = getLeadJobCards(lead).map((j: any) => j.id)
    return allPayments.filter(p => jobCardIds.includes(p.jobCardId))
  }

  const filteredLeads = useMemo(() => {
    let result = leads
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(l =>
        l.companyName?.toLowerCase().includes(q) ||
        l.contactName?.toLowerCase().includes(q) ||
        l.email?.toLowerCase().includes(q) ||
        l.phone?.toLowerCase().includes(q) ||
        l.source?.toLowerCase().includes(q) ||
        l.assignedTo?.toLowerCase().includes(q)
      )
    }
    if (priorityFilter !== 'ALL') result = result.filter(l => normalizeLeadPriority(l.priority) === priorityFilter)
    if (stageFilter !== 'ALL') result = result.filter(l => l.stage === stageFilter)
    return result
  }, [leads, searchQuery, priorityFilter, stageFilter])

  const pipelineValue = leads.filter(l => l.stage !== 'Won' && l.stage !== 'Lost').reduce((s, l) => s + (Number(l.value) || 0), 0)
  const wonRevenue = leads.filter(l => l.stage === 'Won').reduce((s, l) => s + (Number(l.value) || 0), 0)
  const winRate = closedLeadStats(leads).winRate
  const followUps = classifyFollowUps(leads, user?.uid)
  const isManagerViewer = hasAnyRole(['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'DIRECTOR'] as any)
  const calendar = (adminStore.appSettings as any)?.businessCalendar
  const staffOptions = (adminStore.users || []).map((item: any) => ({
    uid: item.id || item.uid,
    name: item.name || item.email || item.id,
  })).filter((item: { uid?: string }) => item.uid)
  const timerFor = (lead: any) => enquiryTimerState({
    receivedAt: lead.receivedAt,
    capturedAt: lead.capturedAt,
    nextActionDueAt: lead.nextActionDueAt,
    firstRespondedAt: lead.firstRespondedAt,
    calendar,
  })

  const getLeadsByStage = (stage: string) => filteredLeads.filter(l => l.stage === stage)

  const openCreateDialog = () => {
    setEditingLead(null)
    setFormData({
      companyName: '', contactName: '', email: '', phone: '', stage: 'New', priority: 'MEDIUM', value: 0,
      source: '', expectedCloseDate: '', assignedTo: '', notes: '', partyType: 'individual', channel: '',
      requirementSummary: '', nextActionSummary: '', nextActionDueAt: '', receivedAt: '', lostReason: '', customerId: '',
    })
    setCustomerMatches([])
    setIsDialogOpen(true)
  }

  const openEditDialog = (lead: any) => {
    setEditingLead(lead)
    setFormData({
      companyName: lead.companyName || '',
      contactName: lead.contactName || '',
      email: lead.email || '',
      phone: lead.phone || '',
      stage: lead.stage || 'New',
      priority: lead.priority || 'MEDIUM',
      value: lead.value || 0,
      source: lead.source || '',
      expectedCloseDate: lead.expectedCloseDate || '',
      assignedTo: lead.assignedTo || lead.owner?.name || '',
      notes: lead.notes || '',
      partyType: lead.partyType || (lead.companyName ? 'business' : 'individual'),
      channel: lead.channel || lead.source || '',
      requirementSummary: lead.requirementSummary || lead.notes || '',
      nextActionSummary: lead.nextActionSummary || '',
      nextActionDueAt: lead.nextActionDueAt || '',
      receivedAt: lead.receivedAt ? String(lead.receivedAt).slice(0, 16) : '',
      lostReason: lead.lostReason || '',
      customerId: lead.customerId || '',
    })
    setCustomerMatches([])
    setIsDialogOpen(true)
    setPanelOpen(false)
  }

  const openPanel = (lead: any) => {
    setPanelLead(lead)
    setPanelOpen(true)
  }

  const handleSave = async () => {
    const errors = validateEnquiryCapture({
      contactName: formData.contactName,
      companyName: formData.companyName,
      partyType: formData.partyType,
      email: formData.email,
      phone: formData.phone,
      channel: formData.channel,
      requirementSummary: formData.requirementSummary,
      nextActionSummary: formData.nextActionSummary,
      nextActionDueAt: formData.nextActionDueAt,
    })
    if (errors.length) {
      toast.error(errors[0])
      return
    }
    const matches = findCustomerMatches(customers, formData)
    setCustomerMatches(matches)
    setSaving(true)
    try {
      const owner = {
        uid: user?.uid || '',
        name: profile?.name || user?.displayName || user?.email || 'Unknown',
      }
      const payload = {
        ...formData,
        priority: normalizeLeadPriority(formData.priority),
        source: formData.channel || formData.source,
        notes: formData.requirementSummary || formData.notes,
        owner,
        receivedBy: owner,
        createdBy: owner,
        assignedTo: owner.name,
        customerId: editingLead?.customerId || formData.customerId || '',
        identityStatus: isLeadConvertedToCustomer(editingLead) ? 'CUSTOMER' : 'PROSPECT',
        receivedAt: formData.receivedAt || new Date().toISOString(),
        capturedAt: editingLead?.capturedAt || new Date().toISOString(),
      }
      if (editingLead) {
        await updateLead(editingLead.id, payload as any)
        toast.success('Enquiry updated')
      } else {
        await addLead(payload as any)
        toast.success(matches.length ? 'Enquiry captured. Review possible customer matches before merging.' : 'Enquiry captured')
      }
      setIsDialogOpen(false)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this lead?')) return
    try {
      await deleteLead(id)
      toast.success('Lead deleted')
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const handleStageChange = async (id: string, newStage: string) => {
    const lead = leads.find(item => item.id === id)
    const evidence = {
      sentApprovedQuote: false,
      recordedNegotiation: newStage === 'Negotiation' && window.confirm('Record this as a negotiation of scope, price or terms?'),
      recordedAcceptance: false,
      lostReason: newStage === 'Lost' ? (window.prompt('Lost reason') || '') : '',
      contactAttempted: newStage === 'Contacted',
      qualified: newStage === 'Qualified',
    }
    const allowed = canAdvanceLeadStage(lead?.stage || 'New', newStage, evidence)
    if (!allowed.ok) {
      toast.error(allowed.reason)
      return
    }
    try {
      await updateLead(id, { stage: newStage, ...(evidence.lostReason ? { lostReason: evidence.lostReason } : {}) } as any)
      toast.success(`Moved to ${newStage}`)
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const handleConvertToQuote = async (lead: any) => {
    try {
      sessionStorage.setItem('convertLeadToQuote', JSON.stringify({
        leadId: lead.id,
        leadName: lead.companyName || lead.contactName,
        customerId: lead.customerId || '',
        customerName: lead.companyName || lead.contactName,
        customerEmail: lead.email,
        contactName: lead.contactName,
        value: lead.value,
      }))
      router.push('/crm/quotations?action=new&from=lead')
      toast.success('Opening quotation draft — enquiry stays in its current stage until a quote is sent')
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const finishCustomerConvert = (customerId: string, alreadyConverted?: boolean) => {
    setConvertCustomerLead(null)
    setPanelOpen(false)
    toast.success(alreadyConverted ? 'This enquiry is already a customer' : 'Customer record created from the enquiry')
    router.push(`/crm/customers/${customerId}`)
  }

  const handleCreateCustomerFromLead = async (profile: {
    customerType: 'COMPANY' | 'INDIVIDUAL'
    name: string
    primaryContactName: string
    email: string
    phone: string
    address: string
    siteAddress: string
    taxId: string
    registrationNumber: string
    creditLimit: number
    notes: string
  }) => {
    if (!convertCustomerLead?.id) return
    setConvertingCustomer(true)
    try {
      const result = await convertLeadToCustomer(convertCustomerLead.id, profile)
      finishCustomerConvert(result.id, result.alreadyConverted)
    } catch (err: any) {
      toast.error(err.message || 'Could not convert enquiry to customer')
    } finally {
      setConvertingCustomer(false)
    }
  }

  const handleLinkExistingCustomer = async (customerId: string) => {
    if (!convertCustomerLead?.id) return
    setConvertingCustomer(true)
    try {
      const result = await convertLeadToCustomer(convertCustomerLead.id, { existingCustomerId: customerId })
      finishCustomerConvert(result.id, result.alreadyConverted)
    } catch (err: any) {
      toast.error(err.message || 'Could not link existing customer')
    } finally {
      setConvertingCustomer(false)
    }
  }

  const handleCompleteAction = async (lead: any) => {
    const nextSummary = window.prompt('Next action (leave blank only if closing as Lost)')
    if (nextSummary === null) return
    const closing = !String(nextSummary).trim()
    const lostReason = closing ? (window.prompt('Lost reason') || '') : ''
    const nextDue = closing ? '' : (window.prompt('Next action due (YYYY-MM-DDTHH:MM)') || '')
    const error = validateNextActionReplacement({
      completing: true,
      closing,
      nextActionSummary: nextSummary,
      nextActionDueAt: nextDue,
      lostReason,
    })
    if (error) {
      toast.error(error)
      return
    }
    try {
      await recordLeadActivity(lead.id, {
        type: closing ? 'closure' : 'next-action',
        authorUid: user?.uid,
        authorName: profile?.name || user?.displayName || user?.email,
        summary: closing ? `Closed: ${lostReason}` : `Completed action; next: ${nextSummary}`,
        previousDueAt: lead.nextActionDueAt,
        nextDueAt: nextDue,
      }, closing ? undefined : { summary: nextSummary, dueAt: nextDue })
      if (closing) await updateLead(lead.id, { stage: 'Lost', lostReason } as any)
      toast.success(closing ? 'Enquiry closed' : 'Next action recorded')
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const handleAcceptHandover = async (lead: any) => {
    try {
      await acceptLeadHandover(lead.id, {
        uid: user?.uid || '',
        name: profile?.name || user?.displayName || user?.email || 'Unknown',
      })
      toast.success('Ownership accepted')
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const actor = {
    uid: user?.uid || '',
    name: profile?.name || user?.displayName || user?.email || 'Unknown',
  }

  const handleRequestHandover = async (lead: any, nextOwner: { uid: string; name: string }, reason: string) => {
    const error = validateHandover({ toUid: nextOwner.uid, reason })
    if (error) {
      toast.error(error)
      return
    }
    try {
      await requestLeadHandover(lead.id, { requestedTo: nextOwner, reason, requestedBy: actor })
      toast.success('Handover requested. Current owner stays accountable until acceptance.')
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const handleReassign = async (lead: any, nextOwner: { uid: string; name: string }, reason: string) => {
    const error = validateHandover({ toUid: nextOwner.uid, reason })
    if (error) {
      toast.error(error)
      return
    }
    try {
      await reassignLeadOwner(lead.id, nextOwner, reason, actor)
      toast.success('Ownership reassigned')
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const handleReopen = async (lead: any) => {
    const reason = window.prompt('Reopen reason (required)') || ''
    const error = validateReopenClosed({
      allow: Boolean((adminStore.appSettings as any)?.jobOps?.allowReopenClosedEnquiries),
      reason,
      stage: lead.stage,
    })
    if (error) {
      toast.error(error)
      return
    }
    try {
      await recordLeadActivity(lead.id, {
        type: 'stage',
        authorUid: actor.uid,
        authorName: actor.name,
        summary: `Reopened from ${lead.stage}`,
        outcome: reason,
      })
      await updateLead(lead.id, { stage: 'Qualified', lostReason: '' } as any)
      toast.success('Enquiry reopened to Qualified')
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            <span className="text-brand-primary">Leads Pipeline</span>
          </h2>
          <p className="text-muted-foreground">Track and manage sales leads through the pipeline</p>
        </div>
        <Button onClick={openCreateDialog} className="bg-brand-primary text-white hover:bg-brand-primary/90">
          <Plus className="mr-2 h-4 w-4" />
          Add Lead
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="relative overflow-hidden shadow-sm border-brand-primary/20 bg-brand-primary/5 dark:bg-brand-primary/10">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-lg bg-brand-primary/10">
                <DollarSign className="size-4 text-brand-primary" />
              </div>
              <Badge variant="outline" className="text-[10px] font-bold bg-transparent border-brand-primary/40 text-brand-primary">PIPELINE</Badge>
            </div>
            <div className="text-2xl sm:text-3xl font-black tabular-nums">
              {loading ? <Skeleton className="h-8 w-16" /> : `$${pipelineValue.toLocaleString()}`}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Pipeline Value</p>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden shadow-sm border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-500/10">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <TrendingUp className="size-4 text-emerald-500" />
              </div>
              <Badge variant="outline" className="text-[10px] font-bold bg-transparent border-emerald-400/40 text-emerald-600 dark:text-emerald-400">WON</Badge>
            </div>
            <div className="text-2xl sm:text-3xl font-black tabular-nums text-emerald-600 dark:text-emerald-400">
              {loading ? <Skeleton className="h-8 w-16" /> : `$${wonRevenue.toLocaleString()}`}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Won pipeline value (not receipts)</p>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden shadow-sm border-blue-500/20 bg-blue-500/5 dark:bg-blue-500/10">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Users className="size-4 text-blue-500" />
              </div>
              <Badge variant="outline" className="text-[10px] font-bold bg-transparent border-blue-400/40 text-blue-600 dark:text-blue-400">ALL</Badge>
            </div>
            <div className="text-2xl sm:text-3xl font-black tabular-nums text-blue-600 dark:text-blue-400">
              {loading ? <Skeleton className="h-8 w-16" /> : leads.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Total Leads</p>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden shadow-sm border-brand-secondary/20 bg-brand-secondary/5 dark:bg-brand-secondary/10">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-lg bg-brand-secondary/10">
                <Target className="size-4 text-brand-secondary" />
              </div>
              <Badge variant="outline" className="text-[10px] font-bold bg-transparent border-brand-secondary/40 text-brand-secondary">RATE</Badge>
            </div>
            <div className="text-2xl sm:text-3xl font-black tabular-nums text-brand-secondary">
              {loading ? <Skeleton className="h-8 w-16" /> : `${winRate}%`}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Win rate of closed enquiries</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      {(followUps.overdue.length > 0 || followUps.dueToday.length > 0 || (isManagerViewer && followUps.teamOverdue.length > 0) || leads.some(lead => timerFor(lead).escalate || timerFor(lead).firstResponseOpen || timerFor(lead).reminderDue)) && (
        <div className="grid gap-3 md:grid-cols-3">
          <Card className="border-red-500/30 bg-red-500/5">
            <CardContent className="p-4 text-sm">
              <p className="font-semibold">Overdue</p>
              <p className="text-2xl font-black">{followUps.overdue.length}</p>
              <p className="text-xs text-muted-foreground">Your open enquiries past their next-action time</p>
            </CardContent>
          </Card>
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="p-4 text-sm">
              <p className="font-semibold">Due today</p>
              <p className="text-2xl font-black">{followUps.dueToday.length}</p>
            </CardContent>
          </Card>
          {isManagerViewer && (
            <Card className="border-blue-500/30 bg-blue-500/5">
              <CardContent className="p-4 text-sm">
                <p className="font-semibold">Team overdue</p>
                <p className="text-2xl font-black">{followUps.teamOverdue.length}</p>
              </CardContent>
            </Card>
          )}
          <Card className="border-orange-500/30 bg-orange-500/5">
            <CardContent className="p-4 text-sm">
              <p className="font-semibold">Working-hour timers</p>
              <p className="text-xs text-muted-foreground">
                First response late: {leads.filter(lead => timerFor(lead).firstResponseOpen).length} ·
                Reminders: {leads.filter(lead => timerFor(lead).reminderDue).length} ·
                Escalate: {leads.filter(lead => timerFor(lead).escalate).length}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search leads..."
            className="pl-8 focus-visible:border-brand-primary focus-visible:ring-brand-primary/30"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={priorityFilter} onValueChange={(v) => v && setPriorityFilter(v)}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Priorities</SelectItem>
            <SelectItem value="HIGH">High</SelectItem>
            <SelectItem value="MEDIUM">Medium</SelectItem>
            <SelectItem value="LOW">Low</SelectItem>
          </SelectContent>
        </Select>
        <Select value={stageFilter} onValueChange={(v) => v && setStageFilter(v)}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Stage" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Stages</SelectItem>
            {LEAD_STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        {filteredLeads.length < leads.length && (
          <Badge variant="secondary" className="text-xs">
            {filteredLeads.length} of {leads.length}
          </Badge>
        )}
      </div>

      {/* Kanban Board */}
      {loading && leads.length === 0 ? (
        <div className="grid grid-cols-7 gap-4">
          {LEAD_STAGES.map(s => (
            <Card key={s} className="min-h-[300px]"><CardContent className="p-4 space-y-2"><Skeleton className="h-8 w-full" /><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {LEAD_STAGES.map(stage => {
            const stageLeads = getLeadsByStage(stage)
            return (
              <div key={stage} className={`flex-shrink-0 w-72 rounded-xl border-2 ${stageColors[stage]} p-3 backdrop-blur-md shadow-sm`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const leadId = e.dataTransfer.getData('leadId')
                  if (leadId) handleStageChange(leadId, stage)
                }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{stageIcons[stage]}</span>
                    <span className="font-semibold text-sm">{stage}</span>
                  </div>
                  <Badge variant="secondary" className="ml-2">{stageLeads.length}</Badge>
                </div>
                <div className="space-y-2 min-h-[100px]">
                  {stageLeads.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">No leads</p>
                  ) : (
                    stageLeads.map(lead => {
                      const lQuotes = getLeadQuotes(lead)
                      const lJobs = getLeadJobCards(lead)
                      const lPayments = getLeadPayments(lead)
                      const hasQuote = lQuotes.length > 0
                      const hasAccepted = lQuotes.some(q => q.status === 'ACCEPTED')
                      const hasJobCard = lJobs.length > 0
                      const totalPaid = lPayments.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0)
                      const hasPaid = totalPaid > 0
                      const isComplete = lJobs.some((j: any) => j.status === 'CLOSED')

                      return (
                        <Card key={lead.id}
                          className="cursor-pointer hover:shadow-md hover:border-primary/30 transition-all"
                          onClick={() => openPanel(lead)}
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData('leadId', lead.id)}
                        >
                          <CardContent className="p-3 space-y-1">
                            <div className="flex items-start justify-between">
                              <div className="min-w-0">
                                <p className="font-medium text-sm truncate">{lead.companyName || lead.contactName}</p>
                                <p className="text-xs text-muted-foreground">{lead.contactName}</p>
                              </div>
                              <div className="flex gap-1 flex-shrink-0">
                                <Badge variant={normalizeLeadPriority(lead.priority) === 'HIGH' ? 'destructive' : normalizeLeadPriority(lead.priority) === 'MEDIUM' ? 'secondary' : 'outline'} className="text-[10px]">
                                  {normalizeLeadPriority(lead.priority)}
                                </Badge>
                                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={(e) => { e.stopPropagation(); handleDelete(lead.id) }}>
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                            {lead.value > 0 && (
                              <p className="text-sm font-semibold">${Number(lead.value).toLocaleString()}</p>
                            )}
                            {(() => {
                              const timer = timerFor(lead)
                              if (timer.escalate) return <Badge variant="destructive" className="text-[10px]">Escalate</Badge>
                              if (timer.firstResponseOpen) return <Badge variant="secondary" className="text-[10px]">First response due</Badge>
                              if (timer.reminderDue) return <Badge variant="outline" className="text-[10px]">Reminder</Badge>
                              return null
                            })()}
                            {lead.email && <p className="text-xs text-muted-foreground truncate">{lead.email}</p>}

                            {isLeadConvertedToCustomer(lead) ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="w-full h-6 text-[10px] text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 mt-1"
                                onClick={(e) => { e.stopPropagation(); router.push(`/crm/customers/${lead.customerId}`) }}
                              >
                                <Users className="w-3 h-3 mr-1" /> View customer
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="w-full h-6 text-[10px] text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 mt-1"
                                onClick={(e) => { e.stopPropagation(); setConvertCustomerLead(lead) }}
                              >
                                <Users className="w-3 h-3 mr-1" /> Convert to customer
                              </Button>
                            )}

                            {/* Convert-to-Quote quick button */}
                            {!hasQuote && stage !== 'Won' && stage !== 'Lost' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="w-full h-6 text-[10px] text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 mt-1"
                                onClick={(e) => { e.stopPropagation(); handleConvertToQuote(lead) }}
                              >
                                <FileText className="w-3 h-3 mr-1" /> Create Quote
                              </Button>
                            )}

                            {/* Journey progress mini bar */}
                            <JourneyMini
                              hasQuote={hasQuote}
                              hasAccepted={hasAccepted}
                              hasJobCard={hasJobCard}
                              hasPaid={hasPaid}
                              isComplete={isComplete}
                            />
                          </CardContent>
                        </Card>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="flex max-h-[92vh] w-[min(96vw,72rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl lg:max-w-5xl">
          <DialogHeader className="shrink-0 border-b px-6 py-4 pr-12">
            <DialogTitle>{editingLead ? 'Edit Enquiry' : 'Capture Enquiry'}</DialogTitle>
          </DialogHeader>
          <div className="grid flex-1 gap-4 overflow-y-auto px-6 py-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label>Party type *</Label>
              <Select value={formData.partyType} onValueChange={(v) => v && setFormData(p => ({ ...p, partyType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">Individual</SelectItem>
                  <SelectItem value="business">Business</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Channel *</Label>
              <Select value={formData.channel} onValueChange={(v) => v && setFormData(p => ({ ...p, channel: v }))}>
                <SelectTrigger><SelectValue placeholder="Select channel" /></SelectTrigger>
                <SelectContent>
                  {ENQUIRY_CHANNELS.map(channel => <SelectItem key={channel} value={channel}>{channel}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Company {formData.partyType === 'business' ? '*' : '(optional)'}</Label>
              <Input value={formData.companyName} onChange={(e) => setFormData(p => ({ ...p, companyName: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Contact Name *</Label>
              <Input value={formData.contactName} onChange={(e) => setFormData(p => ({ ...p, contactName: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={formData.email} onChange={(e) => setFormData(p => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={formData.phone} onChange={(e) => setFormData(p => ({ ...p, phone: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Stage</Label>
              <Select value={formData.stage} onValueChange={(v) => v && setFormData(p => ({ ...p, stage: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAD_STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={formData.priority} onValueChange={(v) => v && setFormData(p => ({ ...p, priority: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAD_PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Value ($)</Label>
              <Input type="number" min="0" value={formData.value} onChange={(e) => setFormData(p => ({ ...p, value: Number(e.target.value) }))} />
            </div>
            <div className="space-y-2">
              <Label>Source</Label>
              <Select value={formData.source} onValueChange={(v) => v && setFormData(p => ({ ...p, source: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="WEBSITE">Website</SelectItem>
                  <SelectItem value="REFERRAL">Referral</SelectItem>
                  <SelectItem value="SOCIAL_MEDIA">Social Media</SelectItem>
                  <SelectItem value="COLD_CALL">Cold Call</SelectItem>
                  <SelectItem value="EXISTING">Existing Client</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Expected Close Date</Label>
              <Input type="date" value={formData.expectedCloseDate} onChange={(e) => setFormData(p => ({ ...p, expectedCloseDate: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Next action due *</Label>
              <Input type="datetime-local" value={formData.nextActionDueAt} onChange={(e) => setFormData(p => ({ ...p, nextActionDueAt: e.target.value }))} />
            </div>
            <div className="space-y-2 md:col-span-2 lg:col-span-1">
              <Label>Received at (leave blank if captured immediately)</Label>
              <Input type="datetime-local" value={formData.receivedAt} onChange={(e) => setFormData(p => ({ ...p, receivedAt: e.target.value }))} />
            </div>
            <div className="space-y-2 md:col-span-2 lg:col-span-3">
              <Label>Requirement summary *</Label>
              <Textarea
                className="min-h-24"
                value={formData.requirementSummary}
                onChange={(e) => setFormData(p => ({ ...p, requirementSummary: e.target.value, notes: e.target.value }))}
              />
            </div>
            <div className="space-y-2 md:col-span-2 lg:col-span-3">
              <Label>Next action *</Label>
              <Input value={formData.nextActionSummary} onChange={(e) => setFormData(p => ({ ...p, nextActionSummary: e.target.value }))} placeholder="Call back, send details, site visit..." />
            </div>
            {customerMatches.length > 0 && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs space-y-1 md:col-span-2 lg:col-span-3">
                <p className="font-semibold">Possible existing customers — review, do not auto-merge</p>
                {customerMatches.map(match => (
                  <p key={match.id}>{match.name || match.email || match.id}</p>
                ))}
              </div>
            )}
          </div>
          <DialogFooter className="shrink-0 m-0 rounded-none border-t">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingLead ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lead Journey Side Panel */}
      <LeadJourneyPanel
        lead={panelLead}
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        onEdit={openEditDialog}
        quotes={panelLead ? getLeadQuotes(panelLead) : []}
        jobCards={panelLead ? getLeadJobCards(panelLead) : []}
        payments={panelLead ? getLeadPayments(panelLead) : []}
        onConvertToQuote={handleConvertToQuote}
        onConvertToCustomer={(lead) => setConvertCustomerLead(lead)}
        onViewCustomer={(lead) => lead.customerId && router.push(`/crm/customers/${lead.customerId}`)}
        onCompleteAction={handleCompleteAction}
        onAcceptHandover={handleAcceptHandover}
        staff={staffOptions}
        canReassign={isManagerViewer}
        onRequestHandover={handleRequestHandover}
        onReassign={handleReassign}
        onReopen={handleReopen}
        timerLabel={panelLead ? (
          timerFor(panelLead).escalate ? 'Manager escalation due — ownership unchanged'
            : timerFor(panelLead).firstResponseOpen ? 'First response is late on the business calendar'
            : timerFor(panelLead).reminderDue ? 'Follow-up reminder is due'
            : timerFor(panelLead).lateCapture ? 'Captured after receipt; first-response clock uses received time'
            : undefined
        ) : undefined}
      />

      <ConvertLeadToCustomerDialog
        lead={convertCustomerLead}
        customers={customers}
        open={Boolean(convertCustomerLead)}
        saving={convertingCustomer}
        onOpenChange={(open) => { if (!open) setConvertCustomerLead(null) }}
        onCreate={handleCreateCustomerFromLead}
        onLinkExisting={handleLinkExistingCustomer}
      />
    </div>
  )
}
