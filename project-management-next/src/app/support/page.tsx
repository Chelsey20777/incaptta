'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { db } from '@/lib/firebase'
import { collection, doc, addDoc, updateDoc, query, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Search, Loader2, MessageSquare, CheckCircle, Clock, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

interface SupportTicket {
  id: string
  title: string
  description: string
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  category: string
  createdBy: string
  assignedTo: string
  createdAt: any
  updatedAt: any
}

interface SupportReply {
  id: string
  ticketId: string
  message: string
  isInternal: boolean
  createdBy: string
  createdAt: any
}

export default function SupportPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [replies, setReplies] = useState<Record<string, SupportReply[]>>({})
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [priorityFilter, setPriorityFilter] = useState('ALL')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null)
  const [saving, setSaving] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [formData, setFormData] = useState({ title: '', description: '', priority: 'MEDIUM', category: 'General' })

  useEffect(() => {
    const q = query(collection(db, 'supportTickets'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, (snap) => {
      setTickets(snap.docs.map(d => ({ id: d.id, ...d.data() } as SupportTicket)))
      setLoading(false)
    })
    return () => unsub()
  }, [])

  const loadReplies = async (ticketId: string) => {
    const q = query(collection(db, 'supportReplies'), orderBy('createdAt', 'asc'))
    const unsub = onSnapshot(q, (snap) => {
      const allReplies = snap.docs.map(d => ({ id: d.id, ...d.data() } as SupportReply))
      setReplies(prev => ({ ...prev, [ticketId]: allReplies.filter(r => r.ticketId === ticketId) }))
    })
    return unsub
  }

  const openDetail = async (ticket: SupportTicket) => {
    setSelectedTicket(ticket)
    setReplyText('')
    setIsDetailOpen(true)
    loadReplies(ticket.id)
  }

  const filteredTickets = useMemo(() => {
    let result = tickets
    if (searchQuery) result = result.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()) || t.description?.toLowerCase().includes(searchQuery.toLowerCase()))
    if (statusFilter !== 'ALL') result = result.filter(t => t.status === statusFilter)
    if (priorityFilter !== 'ALL') result = result.filter(t => t.priority === priorityFilter)
    return result
  }, [tickets, searchQuery, statusFilter, priorityFilter])

  const stats = {
    total: tickets.length,
    open: tickets.filter(t => t.status === 'OPEN').length,
    inProgress: tickets.filter(t => t.status === 'IN_PROGRESS').length,
    resolved: tickets.filter(t => t.status === 'RESOLVED' || t.status === 'CLOSED').length,
  }

  const handleCreate = async () => {
    if (!formData.title) { toast.error('Title is required'); return }
    setSaving(true)
    try {
      await addDoc(collection(db, 'supportTickets'), { ...formData, status: 'OPEN', createdBy: 'User', createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
      toast.success('Ticket created')
      setIsCreateOpen(false)
      setFormData({ title: '', description: '', priority: 'MEDIUM', category: 'General' })
    } catch (err: any) { toast.error(err.message) } finally { setSaving(false) }
  }

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      await updateDoc(doc(db, 'supportTickets', id), { status, updatedAt: serverTimestamp() })
      toast.success(`Status updated to ${status}`)
    } catch (err: any) { toast.error(err.message) }
  }

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedTicket) return
    try {
      await addDoc(collection(db, 'supportReplies'), { ticketId: selectedTicket.id, message: replyText, isInternal: false, createdBy: 'Staff', createdAt: serverTimestamp() })
      if (selectedTicket.status === 'OPEN') {
        await updateDoc(doc(db, 'supportTickets', selectedTicket.id), { status: 'IN_PROGRESS', updatedAt: serverTimestamp() })
      }
      setReplyText('')
    } catch (err: any) { toast.error(err.message) }
  }

  const statusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = { OPEN: 'destructive', IN_PROGRESS: 'default', RESOLVED: 'outline', CLOSED: 'secondary' }
    return <Badge variant={variants[status] || 'secondary'}>{status}</Badge>
  }

  const priorityBadge = (priority: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = { URGENT: 'destructive', HIGH: 'default', MEDIUM: 'secondary', LOW: 'outline' }
    return <Badge variant={variants[priority] || 'secondary'}>{priority}</Badge>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Support</h2>
          <p className="text-muted-foreground">Track and manage support tickets</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}><Plus className="mr-2 h-4 w-4" /> New Ticket</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Total</CardTitle><MessageSquare className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{loading ? <Skeleton className="h-8 w-16" /> : stats.total}</div></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Open</CardTitle><AlertCircle className="h-4 w-4 text-red-500" /></CardHeader><CardContent><div className="text-2xl font-bold text-red-500">{stats.open}</div></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">In Progress</CardTitle><Clock className="h-4 w-4 text-amber-500" /></CardHeader><CardContent><div className="text-2xl font-bold text-amber-500">{stats.inProgress}</div></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Resolved</CardTitle><CheckCircle className="h-4 w-4 text-emerald-500" /></CardHeader><CardContent><div className="text-2xl font-bold text-emerald-500">{stats.resolved}</div></CardContent></Card>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search tickets..." className="pl-8" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} /></div>
        <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Status</SelectItem>
            <SelectItem value="OPEN">Open</SelectItem>
            <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
            <SelectItem value="RESOLVED">Resolved</SelectItem>
            <SelectItem value="CLOSED">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={(v) => v && setPriorityFilter(v)}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Priority</SelectItem>
            <SelectItem value="URGENT">Urgent</SelectItem>
            <SelectItem value="HIGH">High</SelectItem>
            <SelectItem value="MEDIUM">Medium</SelectItem>
            <SelectItem value="LOW">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full">
            <thead><tr className="border-b">
              <th className="text-left p-3 font-medium text-sm">Title</th>
              <th className="text-left p-3 font-medium text-sm">Category</th>
              <th className="text-center p-3 font-medium text-sm">Priority</th>
              <th className="text-center p-3 font-medium text-sm">Status</th>
              <th className="text-center p-3 font-medium text-sm">Created</th>
            </tr></thead>
            <tbody>
              {loading ? Array.from({ length: 3 }).map((_, i) => (<tr key={i} className="border-b">{Array.from({ length: 5 }).map((_, j) => (<td key={j} className="p-3"><Skeleton className="h-4 w-full" /></td>))}</tr>))
              : filteredTickets.length === 0 ? <tr><td colSpan={5} className="text-center p-8 text-muted-foreground">No tickets found</td></tr>
              : filteredTickets.map(ticket => (
                <tr key={ticket.id} className="border-b hover:bg-muted/50 cursor-pointer" onClick={() => openDetail(ticket)}>
                  <td className="p-3 text-sm font-medium">{ticket.title}</td>
                  <td className="p-3 text-sm">{ticket.category || '-'}</td>
                  <td className="p-3 text-center">{priorityBadge(ticket.priority)}</td>
                  <td className="p-3 text-center">{statusBadge(ticket.status)}</td>
                  <td className="p-3 text-center text-sm text-muted-foreground">{ticket.createdAt?.toDate?.()?.toLocaleDateString() || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Ticket</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Title *</Label><Input value={formData.title} onChange={(e) => setFormData(p => ({ ...p, title: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Description</Label><Textarea value={formData.description} onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Priority</Label>
                <Select value={formData.priority} onValueChange={(v) => v && setFormData(p => ({ ...p, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="URGENT">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Category</Label>
                <Select value={formData.category} onValueChange={(v) => v && setFormData(p => ({ ...p, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="General">General</SelectItem>
                    <SelectItem value="Technical">Technical</SelectItem>
                    <SelectItem value="Billing">Billing</SelectItem>
                    <SelectItem value="Feature Request">Feature Request</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">{selectedTicket?.title} {selectedTicket && priorityBadge(selectedTicket.priority)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            <p className="text-sm">{selectedTicket?.description}</p>
            <div className="flex gap-2">
              {selectedTicket?.status === 'OPEN' && <Button size="sm" onClick={() => selectedTicket && handleUpdateStatus(selectedTicket.id, 'IN_PROGRESS')}>Start Progress</Button>}
              {selectedTicket?.status === 'IN_PROGRESS' && <Button size="sm" onClick={() => selectedTicket && handleUpdateStatus(selectedTicket.id, 'RESOLVED')}>Mark Resolved</Button>}
              {selectedTicket?.status === 'RESOLVED' && <Button size="sm" onClick={() => selectedTicket && handleUpdateStatus(selectedTicket.id, 'CLOSED')}>Close</Button>}
              {(selectedTicket?.status === 'OPEN' || selectedTicket?.status === 'IN_PROGRESS') && <Button size="sm" variant="outline" onClick={() => selectedTicket && handleUpdateStatus(selectedTicket.id, 'CLOSED')}>Close Directly</Button>}
            </div>
            <div className="border-t pt-4 space-y-3">
              <h4 className="font-medium text-sm">Replies</h4>
              {(replies[selectedTicket?.id || ''] || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No replies yet</p>
              ) : (
                replies[selectedTicket?.id || '']?.map(reply => (
                  <div key={reply.id} className="bg-muted/50 rounded-lg p-3">
                    <p className="text-sm">{reply.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">{reply.createdBy} • {reply.createdAt?.toDate?.()?.toLocaleString() || ''}</p>
                  </div>
                ))
              )}
              <div className="flex gap-2">
                <Textarea placeholder="Type your reply..." value={replyText} onChange={(e) => setReplyText(e.target.value)} className="flex-1" />
                <Button onClick={handleSendReply} disabled={!replyText.trim()}>Send</Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}