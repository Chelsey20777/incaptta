'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { db } from '@/lib/firebase'
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  where,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp,
  Unsubscribe
} from 'firebase/firestore'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  ArrowLeftRight,
  Plus,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  History,
  Ban,
  ChevronLeft,
  Banknote,
  Smartphone,
  Wallet,
  Briefcase,
  Landmark
} from 'lucide-react'
import { toast } from 'sonner'

const fmt = (n: number) =>
  (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtDate = (ts: any) => {
  if (!ts) return '—'
  const date = ts.toDate ? ts.toDate() : new Date(ts)
  return date.toLocaleDateString()
}

const statusLabel = (status: string) => {
  const map: Record<string, string> = {
    PENDING_ACCOUNTANT: 'Awaiting Initial',
    PENDING_MANAGER: 'Awaiting Approval',
    PENDING: 'Awaiting Approval',
    PENDING_APPROVAL: 'Awaiting Approval',
    COMPLETED: 'Completed',
    REJECTED: 'Rejected',
    CANCELLED: 'Cancelled',
  }
  return map[status] || status
}

const statusBadgeClass = (status: string) => {
  switch (status) {
    case 'PENDING_ACCOUNTANT': return 'bg-orange-500/10 text-orange-600 border-orange-500/20'
    case 'PENDING_MANAGER':
    case 'PENDING':
    case 'PENDING_APPROVAL': return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'
    case 'COMPLETED': return 'bg-green-500/10 text-green-600 border-green-500/20'
    case 'REJECTED': return 'bg-red-500/10 text-red-600 border-red-500/20'
    case 'CANCELLED': return 'bg-gray-500/10 text-gray-600 border-gray-500/20'
    default: return 'bg-muted text-muted-foreground border-transparent'
  }
}

const accountConfig: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  BANK: { label: 'Bank', icon: <Landmark className="size-5" />, color: 'text-blue-500', bg: 'bg-blue-500/10 border-blue-500/20' },
  ECOCASH: { label: 'EcoCash', icon: <Smartphone className="size-5" />, color: 'text-green-500', bg: 'bg-green-500/10 border-green-500/20' },
  CASH: { label: 'Cash', icon: <Wallet className="size-5" />, color: 'text-yellow-500', bg: 'bg-yellow-500/10 border-yellow-500/20' },
  SALARIES: { label: 'Salaries', icon: <Briefcase className="size-5" />, color: 'text-emerald-500', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  IRD: { label: 'IRD', icon: <Landmark className="size-5" />, color: 'text-purple-500', bg: 'bg-purple-500/10 border-purple-500/20' },
}

const ACCOUNT_KEYS = ['BANK', 'ECOCASH', 'CASH', 'SALARIES', 'IRD'] as const

export default function FinancePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [balances, setBalances] = useState<Record<string, number>>({ BANK: 0, ECOCASH: 0, CASH: 0, SALARIES: 0, IRD: 0 })
  const [transfers, setTransfers] = useState<any[]>([])
  const [topUps, setTopUps] = useState<any[]>([])
  const [pendingTransfers, setPendingTransfers] = useState<any[]>([])
  const [pendingTopUps, setPendingTopUps] = useState<any[]>([])
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [showTopUpModal, setShowTopUpModal] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [processing, setProcessing] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'transfers' | 'topups'>('transfers')
  const [transfersPage, setTransfersPage] = useState(1)
  const [transfersPerPage, setTransfersPerPage] = useState(10)
  const [topUpsPage, setTopUpsPage] = useState(1)
  const [topUpsPerPage, setTopUpsPerPage] = useState(10)

  // Form state
  const [transferForm, setTransferForm] = useState({ fromAccount: '', toAccount: '', amount: 0, reference: '' })
  const [topUpForm, setTopUpForm] = useState({ account: '', amount: 0, description: '', reference: '' })

  useEffect(() => {
    setLoading(true)
    const unsubs: Unsubscribe[] = []

    // Balances from a config doc or computed from ledger
    const unsubBal = onSnapshot(doc(db, 'systemConfig', 'balances'), (snap) => {
      if (snap.exists()) {
        const data = snap.data()
        setBalances({
          BANK: data.bank || 0,
          ECOCASH: data.ecocash || 0,
          CASH: data.cash || 0,
          SALARIES: data.salaries || 0,
          IRD: data.ird || 0,
        })
      }
      setLoading(false)
    }, (err) => {
      console.error('Balances error:', err)
      setLoading(false)
    })
    unsubs.push(unsubBal)

    // Transfers
    const unsubTr = onSnapshot(
      query(collection(db, 'fundTransfers'), orderBy('createdAt', 'desc')),
      (snap) => {
        setTransfers(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      }
    )
    unsubs.push(unsubTr)

    // TopUps
    const unsubTp = onSnapshot(
      query(collection(db, 'ledgerTopUps'), orderBy('createdAt', 'desc')),
      (snap) => {
        setTopUps(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      }
    )
    unsubs.push(unsubTp)

    // Pending items
    const unsubPendingTr = onSnapshot(
      query(collection(db, 'fundTransfers'), where('status', 'in', ['PENDING_MANAGER', 'PENDING_APPROVAL', 'PENDING'])),
      (snap) => {
        setPendingTransfers(snap.docs.map(d => ({ id: d.id, _type: 'TRANSFER', ...d.data() })))
      }
    )
    unsubs.push(unsubPendingTr)

    const unsubPendingTp = onSnapshot(
      query(collection(db, 'ledgerTopUps'), where('status', 'in', ['PENDING_MANAGER', 'PENDING_APPROVAL', 'PENDING'])),
      (snap) => {
        setPendingTopUps(snap.docs.map(d => ({ id: d.id, _type: 'TOP_UP', ...d.data() })))
      }
    )
    unsubs.push(unsubPendingTp)

    return () => unsubs.forEach(u => u())
  }, [])

  const totalBalance = useMemo(() => {
    return (balances.BANK || 0) + (balances.ECOCASH || 0) + (balances.CASH || 0) + (balances.SALARIES || 0) + (balances.IRD || 0)
  }, [balances])

  const paginatedTransfers = useMemo(() => {
    const start = (transfersPage - 1) * transfersPerPage
    return transfers.slice(start, start + transfersPerPage)
  }, [transfers, transfersPage, transfersPerPage])

  const totalTransfersPages = Math.ceil(transfers.length / transfersPerPage) || 1

  const paginatedTopUps = useMemo(() => {
    const start = (topUpsPage - 1) * topUpsPerPage
    return topUps.slice(start, start + topUpsPerPage)
  }, [topUps, topUpsPage, topUpsPerPage])

  const totalTopUpsPages = Math.ceil(topUps.length / topUpsPerPage) || 1

  const fromBalance = useMemo(() => {
    if (!transferForm.fromAccount) return null
    return balances[transferForm.fromAccount.toUpperCase()] ?? 0
  }, [transferForm.fromAccount, balances])

  const isInsufficientFunds = useMemo(() =>
    fromBalance !== null && transferForm.amount > 0 && transferForm.amount > fromBalance,
    [fromBalance, transferForm.amount]
  )

  const initiateTransfer = async () => {
    if (!transferForm.fromAccount || !transferForm.toAccount) {
      toast.error('Select both accounts')
      return
    }
    if (transferForm.fromAccount === transferForm.toAccount) {
      toast.error('Accounts must be different')
      return
    }
    if (transferForm.amount <= 0) {
      toast.error('Amount must be positive')
      return
    }
    if (isInsufficientFunds) {
      toast.error('Insufficient funds')
      return
    }
    setIsSubmitting(true)
    try {
      await addDoc(collection(db, 'fundTransfers'), {
        fromAccount: transferForm.fromAccount.toLowerCase(),
        toAccount: transferForm.toAccount.toLowerCase(),
        amount: Number(transferForm.amount),
        reference: transferForm.reference,
        status: 'PENDING_ACCOUNTANT',
        initiatedBy: 'Manager',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
      toast.success('Transfer Initiated', { description: 'Submitted for accountant review.' })
      setShowTransferModal(false)
      setTransferForm({ fromAccount: '', toAccount: '', amount: 0, reference: '' })
    } catch (err: any) {
      console.error(err)
      toast.error('Failed to submit transfer')
    } finally {
      setIsSubmitting(false)
    }
  }

  const initiateTopUp = async () => {
    if (!topUpForm.account) {
      toast.error('Select destination account')
      return
    }
    if (topUpForm.amount <= 0) {
      toast.error('Amount must be positive')
      return
    }
    setIsSubmitting(true)
    try {
      await addDoc(collection(db, 'ledgerTopUps'), {
        account: topUpForm.account.toLowerCase(),
        amount: Number(topUpForm.amount),
        description: topUpForm.description,
        reference: topUpForm.reference,
        status: 'PENDING_ACCOUNTANT',
        requestedBy: 'Manager',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
      toast.success('Top-Up Requested', { description: 'Awaiting accountant initial.' })
      setShowTopUpModal(false)
      setTopUpForm({ account: '', amount: 0, description: '', reference: '' })
    } catch (err: any) {
      console.error(err)
      toast.error('Failed to request top-up')
    } finally {
      setIsSubmitting(false)
    }
  }

  const approveItem = async (item: any) => {
    setProcessing(item.id)
    try {
      if (item._type === 'TRANSFER') {
        await updateDoc(doc(db, 'fundTransfers', item.id), {
          status: 'COMPLETED',
          approvedAt: serverTimestamp(),
          approvedBy: 'Manager',
          updatedAt: serverTimestamp()
        })
      } else {
        await updateDoc(doc(db, 'ledgerTopUps', item.id), {
          status: 'COMPLETED',
          managerApprovedBy: 'Manager',
          managerApprovedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        })
      }
      toast.success('Approved Successfully')
    } catch (err) {
      console.error(err)
      toast.error('Approval failed')
    } finally {
      setProcessing(null)
    }
  }

  const rejectItem = async (item: any) => {
    const reason = prompt('Enter rejection reason:')
    if (!reason) return
    setProcessing(item.id)
    try {
      const col = item._type === 'TRANSFER' ? 'fundTransfers' : 'ledgerTopUps'
      await updateDoc(doc(db, col, item.id), {
        status: 'REJECTED',
        rejectionReason: reason,
        rejectedBy: 'Manager',
        rejectedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
      toast.success('Rejected Successfully')
    } catch (err) {
      console.error(err)
      toast.error('Rejection failed')
    } finally {
      setProcessing(null)
    }
  }

  const cancelItem = async (item: any) => {
    if (item._type !== 'TRANSFER') return
    if (!confirm('Are you sure you want to cancel this transfer?')) return
    setProcessing(item.id)
    try {
      await updateDoc(doc(db, 'fundTransfers', item.id), {
        status: 'CANCELLED',
        cancelledBy: 'Staff',
        cancelledAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
      toast.success('Transfer Cancelled')
    } catch (err) {
      console.error(err)
      toast.error('Cancellation failed')
    } finally {
      setProcessing(null)
    }
  }

  return (
    <div className="flex-1 flex flex-col pb-20 bg-background min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-card border-b px-4 py-4 flex items-center gap-4 shadow-sm">
        <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
          <ChevronLeft className="size-6" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-black tracking-tight">Finance Portal</h1>
          <p className="text-xs text-muted-foreground">Manage cash flow & fund transfers</p>
        </div>
        {(pendingTransfers.length + pendingTopUps.length) > 0 && (
          <Badge className="bg-orange-500 text-white animate-pulse text-[10px] font-black h-5 px-2">
            {pendingTransfers.length + pendingTopUps.length} AWAITING ACTION
          </Badge>
        )}
      </header>

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Synchronizing balances…</p>
        </div>
      ) : (
        <div className="p-4 space-y-6">
          {/* Business Total Card */}
          <div className="rounded-3xl bg-gradient-to-br from-[#79c21b] to-[#ff8903] text-white p-6 shadow-xl relative overflow-hidden group">
            <div className="absolute -right-6 -top-6 size-32 bg-white/10 rounded-full blur-2xl group-hover:scale-110 transition-all duration-700" />
            <div className="absolute -left-10 -bottom-10 size-40 bg-white/5 rounded-full blur-3xl" />
            <p className="text-[10px] font-black uppercase tracking-widest text-white/80">Liquidity Summary</p>
            <p className="text-4xl font-black mt-2 tracking-tight">{fmt(totalBalance)}</p>
            <p className="text-xs text-white/70 mt-1">Total business cash balances across accounts</p>
            <div className="grid grid-cols-2 gap-3 mt-6">
              <Button
                className="bg-white/20 hover:bg-white/30 text-white border border-white/10 rounded-xl h-10 font-bold text-xs gap-1.5"
                onClick={() => setShowTransferModal(true)}
              >
                <ArrowLeftRight className="size-4" /> Transfer Funds
              </Button>
              <Button
                className="bg-white/20 hover:bg-white/30 text-white border border-white/10 rounded-xl h-10 font-bold text-xs gap-1.5"
                onClick={() => setShowTopUpModal(true)}
              >
                <Plus className="size-4" /> Request Top-Up
              </Button>
            </div>
          </div>

          {/* Live Account Balances */}
          <section className="space-y-3">
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1">Ledger Balances</h2>
            <div className="grid grid-cols-2 gap-3">
              {ACCOUNT_KEYS.map((key) => (
                <div key={key} className={`rounded-2xl border p-4 space-y-2 ${accountConfig[key].bg}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-lg">{accountConfig[key].icon}</span>
                    <span className="text-[9px] font-black tracking-widest text-muted-foreground">{key}</span>
                  </div>
                  <p className={`text-xl font-black tracking-tight ${(balances[key] || 0) < 0 ? 'text-destructive' : accountConfig[key].color}`}>
                    {fmt(balances[key] || 0)}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Awaiting Authorizations */}
          {(pendingTransfers.length > 0 || pendingTopUps.length > 0) && (
            <section className="space-y-3">
              <h2 className="text-xs font-bold text-orange-500 uppercase tracking-widest px-1 flex items-center gap-1.5">
                <AlertTriangle className="size-4" /> Action Required ({pendingTransfers.length + pendingTopUps.length})
              </h2>
              <div className="space-y-3">
                {[...pendingTransfers, ...pendingTopUps].map((item) => (
                  <Card key={item.id} className="border-orange-500/20 bg-orange-500/5 overflow-hidden">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <Badge variant="outline" className="text-[9px] bg-orange-500/10 text-orange-600 border-transparent uppercase font-black px-1.5">
                            {item._type === 'TRANSFER' ? 'Fund Transfer' : 'Top-Up'}
                          </Badge>
                          <h3 className="font-bold text-sm mt-1">
                            {item._type === 'TRANSFER' ? `${item.fromAccount} → ${item.toAccount}` : (item.description || 'Ledger Top-Up')}
                          </h3>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Requested: {fmtDate(item.createdAt)} · By: {item.requestedBy || item.initiatedBy || 'Staff'}
                          </p>
                        </div>
                        <span className="font-black text-sm text-orange-600">{fmt(item.amount)}</span>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <Button
                          size="sm"
                          className="flex-1 bg-green-600 hover:bg-green-700 h-9 font-bold text-xs"
                          disabled={processing === item.id}
                          onClick={() => approveItem(item)}
                        >
                          <CheckCircle2 className="mr-1.5 size-3.5" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 text-red-600 border-red-200 hover:bg-red-50 h-9 font-bold text-xs"
                          disabled={processing === item.id}
                          onClick={() => rejectItem(item)}
                        >
                          <XCircle className="mr-1.5 size-3.5" /> Reject
                        </Button>
                        {item._type === 'TRANSFER' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 text-gray-600 border-gray-200 hover:bg-gray-50 h-9 font-bold text-xs"
                            disabled={processing === item.id}
                            onClick={() => cancelItem(item)}
                          >
                            <Ban className="mr-1.5 size-3.5" /> Cancel
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {/* History Log Section */}
          <section className="space-y-4 pt-4 border-t border-border/30">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <History className="size-4 text-primary" />
                <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">History Log</h2>
              </div>
              <div className="flex bg-muted/60 p-0.5 rounded-lg border border-border/40">
                <button
                  type="button"
                  className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${activeTab === 'transfers' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => setActiveTab('transfers')}
                >
                  Transfers
                </button>
                <button
                  type="button"
                  className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${activeTab === 'topups' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => setActiveTab('topups')}
                >
                  Top-Ups
                </button>
              </div>
            </div>

            {activeTab === 'transfers' && (
              <div className="space-y-3">
                {paginatedTransfers.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground text-sm">No completed or historical transfers found.</div>
                ) : (
                  paginatedTransfers.map((tr) => (
                    <Card key={tr.id} className="border-none shadow-sm relative overflow-hidden">
                      <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                        tr.status === 'PENDING_ACCOUNTANT' ? 'bg-orange-500' :
                        ['PENDING_MANAGER', 'PENDING', 'PENDING_APPROVAL'].includes(tr.status) ? 'bg-yellow-500' :
                        tr.status === 'COMPLETED' ? 'bg-green-500' :
                        tr.status === 'REJECTED' ? 'bg-red-500' : ''
                      }`} />
                      <CardContent className="p-4 space-y-3">
                        <div className="flex justify-between items-start">
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <Badge variant="outline" className={`text-[9px] uppercase font-bold px-1.5 ${statusBadgeClass(tr.status)}`}>
                                {statusLabel(tr.status)}
                              </Badge>
                              {tr.reference && <span className="text-[9px] font-mono text-muted-foreground bg-muted px-1 rounded">{tr.reference}</span>}
                            </div>
                            <h3 className="font-bold text-sm truncate mt-1">
                              {tr.fromAccount?.toUpperCase()} → {tr.toAccount?.toUpperCase()}
                            </h3>
                            <p className="text-[10px] text-muted-foreground">
                              {fmtDate(tr.createdAt)} · By: {tr.initiatedBy || 'Staff'}
                            </p>
                            {tr.rejectionReason && <p className="text-[10px] text-red-500 mt-1 italic">Reason: {tr.rejectionReason}</p>}
                          </div>
                          <span className="font-black text-sm text-foreground ml-2">{fmt(tr.amount)}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
                {transfers.length > 0 && (
                  <div className="flex items-center justify-between px-2 py-4 border-t border-border/30 flex-wrap gap-4 mt-4">
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      Showing <span className="font-bold text-foreground">{(transfersPage - 1) * transfersPerPage + 1}</span>
                      to <span className="font-bold text-foreground">{Math.min(transfersPage * transfersPerPage, transfers.length)}</span>
                      of <span className="font-bold text-foreground">{transfers.length}</span> entries
                    </div>
                    <div className="flex items-center gap-6 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">Show:</span>
                        <select
                          value={transfersPerPage}
                          onChange={(e) => { setTransfersPerPage(Number(e.target.value)); setTransfersPage(1) }}
                          className="bg-background border border-muted-foreground/30 rounded text-xs px-2 py-1.5 focus:ring-1 focus:ring-primary focus:outline-none cursor-pointer text-foreground"
                        >
                          {[10, 20, 50].map(v => <option key={v} value={v}>{v} per view</option>)}
                        </select>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="icon" className="h-8 w-8 text-foreground" disabled={transfersPage === 1} onClick={() => setTransfersPage(1)} title="First">&laquo;</Button>
                        <Button variant="outline" size="icon" className="h-8 w-8 text-foreground" disabled={transfersPage === 1} onClick={() => setTransfersPage(p => p - 1)} title="Previous">&lsaquo;</Button>
                        <span className="text-xs text-muted-foreground px-2 whitespace-nowrap">Page <span className="font-bold text-foreground">{transfersPage}</span> of <span className="font-bold text-foreground">{totalTransfersPages}</span></span>
                        <Button variant="outline" size="icon" className="h-8 w-8 text-foreground" disabled={transfersPage === totalTransfersPages} onClick={() => setTransfersPage(p => p + 1)} title="Next">&rsaquo;</Button>
                        <Button variant="outline" size="icon" className="h-8 w-8 text-foreground" disabled={transfersPage === totalTransfersPages} onClick={() => setTransfersPage(totalTransfersPages)} title="Last">&raquo;</Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'topups' && (
              <div className="space-y-3">
                {paginatedTopUps.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground text-sm">No completed or historical top-ups found.</div>
                ) : (
                  paginatedTopUps.map((tu) => (
                    <Card key={tu.id} className="border-none shadow-sm relative overflow-hidden">
                      <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                        tu.status === 'PENDING_ACCOUNTANT' ? 'bg-orange-500' :
                        ['PENDING_MANAGER', 'PENDING', 'PENDING_APPROVAL'].includes(tu.status) ? 'bg-yellow-500' :
                        tu.status === 'COMPLETED' ? 'bg-green-500' :
                        tu.status === 'REJECTED' ? 'bg-red-500' : ''
                      }`} />
                      <CardContent className="p-4 space-y-3">
                        <div className="flex justify-between items-start">
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <Badge variant="outline" className={`text-[9px] uppercase font-bold px-1.5 ${statusBadgeClass(tu.status)}`}>
                                {statusLabel(tu.status)}
                              </Badge>
                              {tu.reference && <span className="text-[9px] font-mono text-muted-foreground bg-muted px-1 rounded">{tu.reference}</span>}
                            </div>
                            <h3 className="font-bold text-sm truncate mt-1">{tu.account?.toUpperCase()} · {tu.description}</h3>
                            <p className="text-[10px] text-muted-foreground">{fmtDate(tu.createdAt)} · By: {tu.requestedBy || 'Staff'}</p>
                            {tu.rejectionReason && <p className="text-[10px] text-red-500 mt-1 italic">Reason: {tu.rejectionReason}</p>}
                          </div>
                          <span className="font-black text-sm text-green-500 ml-2">{fmt(tu.amount)}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
                {topUps.length > 0 && (
                  <div className="flex items-center justify-between px-2 py-4 border-t border-border/30 flex-wrap gap-4 mt-4">
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      Showing <span className="font-bold text-foreground">{(topUpsPage - 1) * topUpsPerPage + 1}</span>
                      to <span className="font-bold text-foreground">{Math.min(topUpsPage * topUpsPerPage, topUps.length)}</span>
                      of <span className="font-bold text-foreground">{topUps.length}</span> entries
                    </div>
                    <div className="flex items-center gap-6 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">Show:</span>
                        <select
                          value={topUpsPerPage}
                          onChange={(e) => { setTopUpsPerPage(Number(e.target.value)); setTopUpsPage(1) }}
                          className="bg-background border border-muted-foreground/30 rounded text-xs px-2 py-1.5 focus:ring-1 focus:ring-primary focus:outline-none cursor-pointer text-foreground"
                        >
                          {[10, 20, 50].map(v => <option key={v} value={v}>{v} per view</option>)}
                        </select>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="icon" className="h-8 w-8 text-foreground" disabled={topUpsPage === 1} onClick={() => setTopUpsPage(1)} title="First">&laquo;</Button>
                        <Button variant="outline" size="icon" className="h-8 w-8 text-foreground" disabled={topUpsPage === 1} onClick={() => setTopUpsPage(p => p - 1)} title="Previous">&lsaquo;</Button>
                        <span className="text-xs text-muted-foreground px-2 whitespace-nowrap">Page <span className="font-bold text-foreground">{topUpsPage}</span> of <span className="font-bold text-foreground">{totalTopUpsPages}</span></span>
                        <Button variant="outline" size="icon" className="h-8 w-8 text-foreground" disabled={topUpsPage === totalTopUpsPages} onClick={() => setTopUpsPage(p => p + 1)} title="Next">&rsaquo;</Button>
                        <Button variant="outline" size="icon" className="h-8 w-8 text-foreground" disabled={topUpsPage === totalTopUpsPages} onClick={() => setTopUpsPage(totalTopUpsPages)} title="Last">&raquo;</Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Transfer Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-sm bg-card border shadow-2xl rounded-3xl overflow-hidden animate-in zoom-in-95 duration-200">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-black tracking-tight">Initiate Fund Transfer</CardTitle>
              <CardDescription className="text-xs">Submit a transfer request between accounts.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-black uppercase text-muted-foreground">From Account</Label>
                <select
                  value={transferForm.fromAccount}
                  onChange={(e) => setTransferForm(f => ({ ...f, fromAccount: e.target.value }))}
                  className="w-full h-10 px-3 rounded-xl border bg-background text-sm"
                >
                  <option value="" disabled>Select source account</option>
                  <option value="cash">Cash</option>
                  <option value="bank">Bank</option>
                  <option value="ecocash">EcoCash</option>
                  <option value="ird">IRD</option>
                </select>
                {transferForm.fromAccount && fromBalance !== null && (
                  <p className={`text-[10px] font-bold px-1 ${isInsufficientFunds ? 'text-destructive' : 'text-green-500'}`}>
                    Available balance: {fmt(fromBalance)}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-black uppercase text-muted-foreground">To Account</Label>
                <select
                  value={transferForm.toAccount}
                  onChange={(e) => setTransferForm(f => ({ ...f, toAccount: e.target.value }))}
                  className="w-full h-10 px-3 rounded-xl border bg-background text-sm"
                >
                  <option value="" disabled>Select destination account</option>
                  <option value="cash">Cash</option>
                  <option value="bank">Bank</option>
                  <option value="ecocash">EcoCash</option>
                  <option value="ird">IRD</option>
                  <option value="salaries">Salaries</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-black uppercase text-muted-foreground">Transfer Amount ($)</Label>
                <Input
                  type="number"
                  value={transferForm.amount || ''}
                  onChange={(e) => setTransferForm(f => ({ ...f, amount: Number(e.target.value) }))}
                  min={0.01}
                  step={0.01}
                  className="h-10 text-sm font-bold"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-black uppercase text-muted-foreground">Reference / Batch ID</Label>
                <Input
                  value={transferForm.reference}
                  onChange={(e) => setTransferForm(f => ({ ...f, reference: e.target.value }))}
                  placeholder="e.g. EBK-9901"
                  className="h-10 text-sm"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1 rounded-xl h-10 font-bold" onClick={() => setShowTransferModal(false)}>Cancel</Button>
                <Button className="flex-1 rounded-xl h-10 font-bold" disabled={isSubmitting || isInsufficientFunds} onClick={initiateTransfer}>
                  {isSubmitting ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
                  {isSubmitting ? 'Posting...' : 'Submit'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Top-Up Modal */}
      {showTopUpModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-sm bg-card border shadow-2xl rounded-3xl overflow-hidden animate-in zoom-in-95 duration-200">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-black tracking-tight">Request Account Top-Up</CardTitle>
              <CardDescription className="text-xs">Request floating capital or external float injection.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-black uppercase text-muted-foreground">Target Account</Label>
                <select
                  value={topUpForm.account}
                  onChange={(e) => setTopUpForm(f => ({ ...f, account: e.target.value }))}
                  className="w-full h-10 px-3 rounded-xl border bg-background text-sm"
                >
                  <option value="" disabled>Select target account</option>
                  <option value="cash">Cash</option>
                  <option value="bank">Bank</option>
                  <option value="ecocash">EcoCash</option>
                  <option value="ird">IRD</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-black uppercase text-muted-foreground">Top-Up Amount ($)</Label>
                <Input
                  type="number"
                  value={topUpForm.amount || ''}
                  onChange={(e) => setTopUpForm(f => ({ ...f, amount: Number(e.target.value) }))}
                  min={0.01}
                  step={0.01}
                  className="h-10 text-sm font-bold text-green-500"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-black uppercase text-muted-foreground">Description / Source</Label>
                <Input
                  value={topUpForm.description}
                  onChange={(e) => setTopUpForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="e.g. Weekly Cash Float"
                  className="h-10 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-black uppercase text-muted-foreground">Receipt / Reference</Label>
                <Input
                  value={topUpForm.reference}
                  onChange={(e) => setTopUpForm(f => ({ ...f, reference: e.target.value }))}
                  placeholder="e.g. DEP-998"
                  className="h-10 text-sm"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1 rounded-xl h-10 font-bold" onClick={() => setShowTopUpModal(false)}>Cancel</Button>
                <Button
                  className="flex-1 rounded-xl h-10 font-bold bg-[#ff8903] hover:bg-[#ff8903]/90 text-white"
                  disabled={isSubmitting}
                  onClick={initiateTopUp}
                >
                  {isSubmitting ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
                  {isSubmitting ? 'Submitting...' : 'Submit'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}