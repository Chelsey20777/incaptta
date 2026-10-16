'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { db } from '@/lib/firebase'
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  where,
  doc,
  updateDoc,
  serverTimestamp,
  Unsubscribe
} from 'firebase/firestore'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ChevronLeft,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Ban,
  Landmark,
  Smartphone,
  Wallet,
  Briefcase,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  ArrowLeftRight,
  RefreshCcw
} from 'lucide-react'
import { toast } from 'sonner'

const fmt = (n: number) =>
  (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtDate = (ts: any) => {
  if (!ts) return '—'
  const date = ts.toDate ? ts.toDate() : new Date(ts)
  return date.toLocaleDateString()
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

export default function BalancesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [balances, setBalances] = useState<Record<string, number>>({ BANK: 0, ECOCASH: 0, CASH: 0, SALARIES: 0, IRD: 0 })
  const [transfers, setTransfers] = useState<any[]>([])
  const [topUps, setTopUps] = useState<any[]>([])
  const [pendingTransfers, setPendingTransfers] = useState<any[]>([])
  const [pendingTopUps, setPendingTopUps] = useState<any[]>([])
  const [processing, setProcessing] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // Combine all transactions for recent view
  const allTransactions = useMemo(() => {
    const trTx = transfers.map(t => ({
      ...t,
      _type: 'transfer',
      _account: t.fromAccount,
      _amount: t.amount,
      _direction: t.fromAccount ? 'out' : 'in',
      _date: t.createdAt,
      _desc: `${t.fromAccount?.toUpperCase()} → ${t.toAccount?.toUpperCase()}`
    }))
    const tpTx = topUps.map(t => ({
      ...t,
      _type: 'topup',
      _account: t.account,
      _amount: t.amount,
      _direction: 'in',
      _date: t.createdAt,
      _desc: `Top-Up: ${t.account?.toUpperCase()}`
    }))
    const combined = [...trTx, ...tpTx]
    combined.sort((a, b) => {
      const da = a._date?.toDate?.() || new Date(0)
      const db = b._date?.toDate?.() || new Date(0)
      return db.getTime() - da.getTime()
    })
    return combined
  }, [transfers, topUps])

  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return allTransactions.slice(start, start + pageSize)
  }, [allTransactions, currentPage, pageSize])

  const totalPages = Math.ceil(allTransactions.length / pageSize) || 1

  useEffect(() => {
    setLoading(true)
    const unsubs: Unsubscribe[] = []

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
    }, () => setLoading(false))
    unsubs.push(unsubBal)

    const unsubTr = onSnapshot(query(collection(db, 'fundTransfers'), orderBy('createdAt', 'desc')), (snap) => {
      setTransfers(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    unsubs.push(unsubTr)

    const unsubTp = onSnapshot(query(collection(db, 'ledgerTopUps'), orderBy('createdAt', 'desc')), (snap) => {
      setTopUps(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    unsubs.push(unsubTp)

    const unsubPendingTr = onSnapshot(
      query(collection(db, 'fundTransfers'), where('status', 'in', ['PENDING_MANAGER', 'PENDING_APPROVAL', 'PENDING'])),
      (snap) => { setPendingTransfers(snap.docs.map(d => ({ id: d.id, _type: 'TRANSFER', ...d.data() }))) }
    )
    unsubs.push(unsubPendingTr)

    const unsubPendingTp = onSnapshot(
      query(collection(db, 'ledgerTopUps'), where('status', 'in', ['PENDING_MANAGER', 'PENDING_APPROVAL', 'PENDING'])),
      (snap) => { setPendingTopUps(snap.docs.map(d => ({ id: d.id, _type: 'TOP_UP', ...d.data() }))) }
    )
    unsubs.push(unsubPendingTp)

    return () => unsubs.forEach(u => u())
  }, [])

  const totalBalance = useMemo(
    () => (balances.BANK || 0) + (balances.ECOCASH || 0) + (balances.CASH || 0) + (balances.SALARIES || 0) + (balances.IRD || 0),
    [balances]
  )

  const approveItem = async (item: any) => {
    setProcessing(item.id)
    try {
      if (item._type === 'TRANSFER') {
        await updateDoc(doc(db, 'fundTransfers', item.id), { status: 'COMPLETED', approvedAt: serverTimestamp(), approvedBy: 'Manager', updatedAt: serverTimestamp() })
      } else {
        await updateDoc(doc(db, 'ledgerTopUps', item.id), { status: 'COMPLETED', managerApprovedBy: 'Manager', managerApprovedAt: serverTimestamp(), updatedAt: serverTimestamp() })
      }
      toast.success('Approved Successfully')
    } catch { toast.error('Approval failed') }
    finally { setProcessing(null) }
  }

  const rejectItem = async (item: any) => {
    const reason = prompt('Enter rejection reason:')
    if (!reason) return
    setProcessing(item.id)
    try {
      const col = item._type === 'TRANSFER' ? 'fundTransfers' : 'ledgerTopUps'
      await updateDoc(doc(db, col, item.id), { status: 'REJECTED', rejectionReason: reason, rejectedBy: 'Manager', rejectedAt: serverTimestamp(), updatedAt: serverTimestamp() })
      toast.success('Rejected')
    } catch { toast.error('Rejection failed') }
    finally { setProcessing(null) }
  }

  const cancelItem = async (item: any) => {
    if (item._type !== 'TRANSFER' || !confirm('Cancel this transfer?')) return
    setProcessing(item.id)
    try {
      await updateDoc(doc(db, 'fundTransfers', item.id), { status: 'CANCELLED', cancelledBy: 'Staff', cancelledAt: serverTimestamp(), updatedAt: serverTimestamp() })
      toast.success('Cancelled')
    } catch { toast.error('Cancellation failed') }
    finally { setProcessing(null) }
  }

  return (
    <div className="flex-1 flex flex-col pb-20 bg-background min-h-screen">
      <header className="sticky top-0 z-10 bg-card border-b px-4 py-4 flex items-center gap-4 shadow-sm">
        <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
          <ChevronLeft className="size-6" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-black tracking-tight">Running Balances</h1>
          <p className="text-xs text-muted-foreground">Real-time ledger & account overview</p>
        </div>
        {(pendingTransfers.length + pendingTopUps.length) > 0 && (
          <Badge className="bg-orange-500 text-white animate-pulse text-[10px] font-black h-5 px-2">
            {pendingTransfers.length + pendingTopUps.length} PENDING
          </Badge>
        )}
      </header>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <RefreshCcw className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="p-4 space-y-6">
          {/* Pending */}
          {(pendingTransfers.length > 0 || pendingTopUps.length > 0) && (
            <section className="space-y-3">
              <h2 className="text-xs font-bold text-orange-500 uppercase tracking-widest flex items-center gap-1.5">
                <AlertTriangle className="size-4" /> Action Required ({pendingTransfers.length + pendingTopUps.length})
              </h2>
              <div className="space-y-3">
                {[...pendingTransfers, ...pendingTopUps].map(item => (
                  <Card key={item.id} className="border-orange-500/20 bg-orange-500/5 overflow-hidden">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <Badge variant="outline" className="text-[9px] bg-orange-500/10 text-orange-600 border-transparent uppercase font-black px-1.5">
                            {item._type === 'TRANSFER' ? 'Fund Transfer' : 'Top-Up'}
                          </Badge>
                          <h3 className="font-bold text-sm mt-1">{item._type === 'TRANSFER' ? `${item.fromAccount} → ${item.toAccount}` : item.description || 'Top-Up'}</h3>
                          <p className="text-[10px] text-muted-foreground mt-0.5">Requested: {fmtDate(item.createdAt)}</p>
                        </div>
                        <span className="font-black text-sm text-orange-600">{fmt(item.amount)}</span>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" className="flex-1 bg-green-600 hover:bg-green-700 h-9 font-bold text-xs" disabled={processing === item.id} onClick={() => approveItem(item)}>
                          <CheckCircle2 className="mr-1.5 size-3.5" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1 text-red-600 border-red-200 hover:bg-red-50 h-9 font-bold text-xs" disabled={processing === item.id} onClick={() => rejectItem(item)}>
                          <XCircle className="mr-1.5 size-3.5" /> Reject
                        </Button>
                        {item._type === 'TRANSFER' && (
                          <Button size="sm" variant="outline" className="flex-1 text-gray-600 border-gray-200 hover:bg-gray-50 h-9 font-bold text-xs" disabled={processing === item.id} onClick={() => cancelItem(item)}>
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

          {/* Total Balance */}
          <div className="rounded-3xl bg-gradient-to-br from-[#79c21b] to-[#ff8903] text-white p-6 shadow-xl relative overflow-hidden">
            <div className="absolute -right-6 -top-6 size-32 bg-white/10 rounded-full blur-2xl" />
            <div className="absolute -left-10 -bottom-10 size-40 bg-white/5 rounded-full blur-3xl" />
            <p className="text-[10px] font-black uppercase tracking-widest text-white/80">Total Business Balance</p>
            <p className="text-4xl font-black mt-2 tracking-tight">{fmt(totalBalance)}</p>
            <p className="text-xs text-white/70 mt-1">Sum of all liquid accounts</p>
          </div>

          {/* Account Tiles */}
          <section className="space-y-3">
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1">Account Breakdown</h2>
            <div className="grid grid-cols-2 gap-3">
              {ACCOUNT_KEYS.map(key => (
                <div key={key} className={`rounded-2xl border p-4 space-y-2 ${accountConfig[key].bg}`}>
                  <div className="flex items-center justify-between">
                    <span>{accountConfig[key].icon}</span>
                    <span className="text-[9px] font-black tracking-widest text-muted-foreground">{key}</span>
                  </div>
                  <p className={`text-xl font-black tracking-tight ${(balances[key] || 0) < 0 ? 'text-destructive' : accountConfig[key].color}`}>
                    {fmt(balances[key] || 0)}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Recent Transactions */}
          <section className="space-y-3">
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1">Recent Transactions</h2>
            {paginatedTransactions.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">No recent transactions.</div>
            ) : (
              <div className="space-y-2">
                {paginatedTransactions.map((tx: any) => {
                  const isIncome = tx._direction === 'in' || tx._type === 'topup'
                  const isExpense = tx._direction === 'out'
                  return (
                    <Card key={tx.id} className="border shadow-sm">
                      <CardContent className="p-3 flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`size-9 rounded-full flex items-center justify-center shrink-0 ${
                            isIncome ? 'bg-green-500/10' : isExpense ? 'bg-red-500/10' : 'bg-blue-500/10'
                          }`}>
                            {isIncome ? <ArrowDownRight className={`size-4 ${isIncome ? 'text-green-500' : ''}`} /> :
                             isExpense ? <ArrowUpRight className="size-4 text-red-500" /> :
                             <ArrowLeftRight className="size-4 text-blue-500" />}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-xs truncate">{tx._desc || tx.description || 'Transaction'}</p>
                            <p className="text-[10px] text-muted-foreground">{tx._account?.toUpperCase() || ''} · {fmtDate(tx._date)}</p>
                          </div>
                        </div>
                        <span className={`font-black text-sm shrink-0 ml-2 ${isIncome ? 'text-green-500' : 'text-red-500'}`}>
                          {isIncome ? '+' : '-'}{fmt(tx._amount || tx.amount || 0)}
                        </span>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}

            {/* Pagination */}
            {allTransactions.length > 0 && (
              <div className="flex items-center justify-between px-2 py-4 border-t border-border/30 flex-wrap gap-4 mt-4">
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  Showing <span className="font-bold text-foreground">{(currentPage - 1) * pageSize + 1}</span>
                  to <span className="font-bold text-foreground">{Math.min(currentPage * pageSize, allTransactions.length)}</span>
                  of <span className="font-bold text-foreground">{allTransactions.length}</span> entries
                </div>
                <div className="flex items-center gap-6 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">Show:</span>
                    <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1) }}
                      className="bg-background border border-muted-foreground/30 rounded text-xs px-2 py-1.5 focus:ring-1 focus:ring-primary focus:outline-none cursor-pointer text-foreground"
                    >
                      {[10, 20, 50, 100].map(v => <option key={v} value={v}>{v} per view</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-8 w-8 text-foreground" disabled={currentPage === 1} onClick={() => setCurrentPage(1)}>&laquo;</Button>
                    <Button variant="outline" size="icon" className="h-8 w-8 text-foreground" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>&lsaquo;</Button>
                    <span className="text-xs text-muted-foreground px-2">Page <span className="font-bold text-foreground">{currentPage}</span> of <span className="font-bold text-foreground">{totalPages}</span></span>
                    <Button variant="outline" size="icon" className="h-8 w-8 text-foreground" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>&rsaquo;</Button>
                    <Button variant="outline" size="icon" className="h-8 w-8 text-foreground" disabled={currentPage === totalPages} onClick={() => setCurrentPage(totalPages)}>&raquo;</Button>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}