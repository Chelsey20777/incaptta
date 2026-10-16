'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { db } from '@/lib/firebase'
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
  Unsubscribe
} from 'firebase/firestore'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Banknote,
  ChevronLeft,
  Filter,
  Search,
  Clock,
  BarChart3,
  Fuel,
  Utensils,
  Settings,
  FileText,
  CircleEllipsis,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2
} from 'lucide-react'
import { toast } from 'sonner'

const formatDate = (val: any) => {
  if (!val) return 'N/A'
  if (val.toDate) return val.toDate().toLocaleDateString()
  return new Date(val).toLocaleDateString()
}

const getFileName = (url: string) => {
  if (!url) return 'Document'
  try {
    const decoded = decodeURIComponent(url)
    const pathPart = decoded.split('?')[0] || ''
    const parts = pathPart.split('/')
    const fullName = parts[parts.length - 1] || ''
    return fullName.replace(/^\d+_/g, '')
  } catch { return 'Document' }
}

interface ExpenseItem {
  id: string
  description?: string
  amount?: number
  category?: string
  status?: string
  expenseNumber?: string
  createdAt?: any
  attachmentUrls?: string[]
  attachmentUrl?: string
  receiptUrl?: string
  rejectionReason?: string
  [key: string]: any
}

export default function OpexPage() {
  const router = useRouter()
  const [expenses, setExpenses] = useState<ExpenseItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [timeframe, setTimeframe] = useState('month')
  const [showFilters, setShowFilters] = useState(false)
  const [processing, setProcessing] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const pendingCount = useMemo(() =>
    expenses.filter(e => e.status === 'APPROVED_ACCOUNTANT').length,
    [expenses]
  )

  useEffect(() => {
    setLoading(true)
    const q = query(collection(db, 'operationalExpenses'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, (snap) => {
      setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() }) as ExpenseItem))
      setLoading(false)
    }, (err) => {
      console.error('OPEX listener error:', err)
      setLoading(false)
    })
    return () => unsub()
  }, [])

  const approveExpense = async (exp: ExpenseItem) => {
    setProcessing(exp.id)
    try {
      await updateDoc(doc(db, 'operationalExpenses', exp.id), {
        status: 'APPROVED',
        approvedByManager: 'Manager',
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
      toast.success('Expense Approved')
    } catch (err) {
      console.error(err)
      toast.error('Failed to approve expense')
    } finally {
      setProcessing(null)
    }
  }

  const rejectExpense = async (exp: ExpenseItem) => {
    const reason = prompt('Reason for rejection:')
    if (!reason) return
    setProcessing(exp.id)
    try {
      await updateDoc(doc(db, 'operationalExpenses', exp.id), {
        status: 'REJECTED',
        rejectionReason: reason,
        rejectedBy: 'Manager',
        rejectedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
      toast.success('Expense Rejected')
    } catch (err) {
      console.error(err)
      toast.error('Failed to reject expense')
    } finally {
      setProcessing(null)
    }
  }

  const filteredExpenses = useMemo(() => {
    return expenses.filter(exp => {
      const searchMatch = !searchQuery ||
        exp.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        exp.category?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        exp.expenseNumber?.toLowerCase().includes(searchQuery.toLowerCase())

      let timeMatch = true
      const now = new Date()
      const expDate = exp.createdAt?.toDate?.() || new Date(0)

      if (timeframe === 'today') {
        timeMatch = expDate.toDateString() === now.toDateString()
      } else if (timeframe === 'week') {
        const weekAgo = new Date()
        weekAgo.setDate(now.getDate() - 7)
        timeMatch = expDate >= weekAgo
      } else if (timeframe === 'month') {
        timeMatch = expDate.getMonth() === now.getMonth() && expDate.getFullYear() === now.getFullYear()
      }

      return searchMatch && timeMatch
    })
  }, [expenses, searchQuery, timeframe])

  const paginatedExpenses = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredExpenses.slice(start, start + pageSize)
  }, [filteredExpenses, currentPage, pageSize])

  const totalPages = Math.ceil(filteredExpenses.length / pageSize) || 1

  const totalAmount = useMemo(() =>
    filteredExpenses
      .filter(e => e.status === 'APPROVED' || e.status === 'PAYMENT_PROCESSED')
      .reduce((sum, exp) => sum + Number(exp.amount || 0), 0),
    [filteredExpenses]
  )

  const getCategoryStyle = (exp: ExpenseItem) => {
    const cat = (exp.category || '').toLowerCase()
    const desc = (exp.description || '').toLowerCase()
    const text = `${cat} ${desc}`

    if (text.includes('fuel') || text.includes('petrol') || text.includes('diesel')) {
      return { color: 'text-[#8dc63f]', bg: 'bg-[#8dc63f]/10', icon: Fuel, label: 'Fuel' }
    }
    if (text.includes('food') || text.includes('meal')) {
      return { color: 'text-[#8dc63f]', bg: 'bg-[#8dc63f]/10', icon: Utensils, label: 'Food & Meals' }
    }
    if (text.includes('maintenance') || text.includes('repair') || text.includes('service')) {
      return { color: 'text-[#f58220]', bg: 'bg-[#f58220]/10', icon: Settings, label: 'Maintenance' }
    }
    if (text.includes('job card') || text.includes('work order')) {
      return { color: 'text-[#f58220]', bg: 'bg-[#f58220]/10', icon: FileText, label: 'Job Card' }
    }
    if (text.includes('salary') || text.includes('wage') || text.includes('payroll')) {
      return { color: 'text-[#8dc63f]', bg: 'bg-[#8dc63f]/10', icon: Banknote, label: 'Salary/Wages' }
    }
    return { color: 'text-primary', bg: 'bg-primary/10', icon: CircleEllipsis, label: exp.category || 'General' }
  }

  const IconComponent = ({ icon }: { icon: React.ElementType }) => {
    const Icon = icon
    return <Icon className="size-5" />
  }

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, timeframe])

  return (
    <div className="flex-1 flex flex-col pb-20 bg-muted/20 min-h-screen">
      {/* Header */}
      <header className="p-4 border-b bg-card sticky top-0 z-10 space-y-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
            <ChevronLeft className="size-6" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">OPEX Summary</h1>
              {pendingCount > 0 && (
                <Badge className="bg-orange-500 text-white animate-pulse text-[10px] font-black h-5 px-2">
                  {pendingCount} AWAITING ACTION
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">Total Approved: ${totalAmount.toLocaleString()}</p>
          </div>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search EXP# or details..."
              className="pl-8 bg-muted/40 h-10 border-none"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            className={showFilters ? 'bg-primary text-white' : ''}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="size-4" />
          </Button>
        </div>

        {showFilters && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 pt-1">
            {['today', 'week', 'month', 'all'].map(t => (
              <Button
                key={t}
                variant="secondary"
                size="sm"
                className={`capitalize text-xs font-bold ${timeframe === t ? 'bg-primary text-white' : ''}`}
                onClick={() => setTimeframe(t)}
              >
                {t}
              </Button>
            ))}
          </div>
        )}
      </header>

      {/* Summary Card */}
      <div className="p-4">
        <Card className="bg-gradient-to-br from-[#f58220] to-[#8dc63f] text-white shadow-2xl shadow-orange-500/20 border-none relative overflow-hidden group">
          <div className="absolute -right-6 -top-6 size-32 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-all duration-700" />
          <div className="absolute -left-10 -bottom-10 size-40 bg-white/10 rounded-full blur-3xl" />
          <CardContent className="p-6 relative z-10 flex justify-between items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-md border border-white/20 mb-3">
                <BarChart3 className="size-3" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Operational Overview</span>
              </div>
              <p className="text-xs font-medium text-white/90 uppercase tracking-tighter">Approved for Period</p>
              <h2 className="text-4xl font-black tracking-tight mt-1 flex items-baseline gap-1">
                <span className="text-xl font-medium opacity-80">$</span>{totalAmount.toLocaleString()}
              </h2>
              <div className="flex items-center gap-2 mt-4">
                <div className="px-2 py-1 rounded-lg bg-black/20 text-[10px] font-bold backdrop-blur-md">
                  {filteredExpenses.filter(e => e.status === 'APPROVED' || e.status === 'PAYMENT_PROCESSED').length} Approved
                </div>
                {pendingCount > 0 && (
                  <div className="px-2 py-1 rounded-lg bg-white/20 text-white text-[10px] font-bold backdrop-blur-md flex items-center gap-1">
                    <AlertCircle className="size-3" />
                    {pendingCount} Pending
                  </div>
                )}
              </div>
            </div>
            <div className="size-16 rounded-2xl bg-white/10 backdrop-blur-xl flex items-center justify-center border border-white/20 shadow-inner">
              <Banknote className="size-8 text-white" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Expense List */}
      <main className="px-4 space-y-3 pb-4 flex-1">
        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <Clock className="size-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && paginatedExpenses.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-sm">No expenses found for this period.</p>
          </div>
        )}

        {!loading && paginatedExpenses.map((exp) => {
          const catStyle = getCategoryStyle(exp)
          const CatIcon = catStyle.icon
          return (
            <Card key={exp.id} className="border-none shadow-sm relative overflow-hidden">
              <div className={`absolute left-0 top-0 bottom-0 w-1 ${catStyle.bg.replace('/10', '')}`} />
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`size-10 rounded-full flex items-center justify-center shrink-0 ${catStyle.bg}`}>
                      <CatIcon className={`size-5 ${catStyle.color}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-bold text-sm truncate">{exp.description || 'General Expense'}</p>
                        {exp.expenseNumber && (
                          <span className="text-[9px] font-mono text-muted-foreground bg-muted px-1 rounded">{exp.expenseNumber}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-[10px] text-muted-foreground">{formatDate(exp.createdAt)}</p>
                        <Badge
                          variant="outline"
                          className={`text-[9px] px-1.5 py-0 h-4 uppercase border-transparent ${catStyle.bg} ${catStyle.color}`}
                        >
                          {catStyle.label}
                        </Badge>
                      </div>
                      {(exp.attachmentUrls && exp.attachmentUrls.length > 0) || exp.attachmentUrl || exp.receiptUrl ? (
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          {exp.attachmentUrls && exp.attachmentUrls.length > 0 ? (
                            exp.attachmentUrls.map((url: string, idx: number) => (
                              <a key={idx} href={url} target="_blank" rel="noreferrer"
                                title={getFileName(url)}
                                className="text-[10px] font-bold text-[#ff8903] hover:underline flex items-center gap-1 bg-[#ff8903]/10 px-2 py-0.5 rounded border border-[#ff8903]/20"
                              >
                                <FileText className="size-3" />
                                Doc {idx + 1}
                              </a>
                            ))
                          ) : (
                            <a href={exp.attachmentUrl || exp.receiptUrl} target="_blank" rel="noreferrer"
                              className="text-[10px] font-bold text-[#ff8903] hover:underline flex items-center gap-1 bg-[#ff8903]/10 px-2 py-0.5 rounded border border-[#ff8903]/20"
                            >
                              <FileText className="size-3" />
                              View Receipt
                            </a>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className="font-bold text-sm">${Number(exp.amount || 0).toLocaleString()}</p>
                    {exp.status && (
                      <Badge
                        variant={exp.status === 'APPROVED' || exp.status === 'PAYMENT_PROCESSED' ? 'secondary' : 'default'}
                        className={`text-[9px] h-4 mt-1 uppercase font-black ${
                          exp.status === 'APPROVED_ACCOUNTANT'
                            ? 'bg-orange-500/10 text-orange-600 border-orange-500/20'
                            : exp.status === 'APPROVED' || exp.status === 'PAYMENT_PROCESSED'
                            ? 'bg-green-500/10 text-green-600 border-green-500/20'
                            : exp.status === 'REJECTED'
                            ? 'bg-red-500/10 text-red-600 border-red-500/20'
                            : ''
                        }`}
                      >
                        {exp.status === 'APPROVED_ACCOUNTANT' ? 'Needs Manager' : exp.status.replace('_', ' ')}
                      </Badge>
                    )}
                  </div>
                </div>

                {exp.status === 'APPROVED_ACCOUNTANT' && (
                  <div className="flex gap-2 pt-1">
                    <Button
                      className="flex-1 bg-green-600 hover:bg-green-700 h-9 text-xs font-bold"
                      disabled={processing === exp.id}
                      onClick={() => approveExpense(exp)}
                    >
                      <CheckCircle2 className="mr-2 size-4" /> Approve
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 text-red-600 border-red-200 hover:bg-red-50 h-9 text-xs font-bold"
                      disabled={processing === exp.id}
                      onClick={() => rejectExpense(exp)}
                    >
                      <XCircle className="mr-2 size-4" /> Reject
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}

        {/* Pagination */}
        {filteredExpenses.length > 0 && (
          <div className="flex items-center justify-between px-2 py-4 border-t border-border/30 flex-wrap gap-4 mt-6">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              Showing <span className="font-bold text-foreground">{(currentPage - 1) * pageSize + 1}</span>
              to <span className="font-bold text-foreground">{Math.min(currentPage * pageSize, filteredExpenses.length)}</span>
              of <span className="font-bold text-foreground">{filteredExpenses.length}</span> entries
            </div>
            <div className="flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">Show:</span>
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1) }}
                  className="bg-background border border-muted-foreground/30 rounded text-xs px-2 py-1.5 focus:ring-1 focus:ring-primary focus:outline-none cursor-pointer text-foreground"
                >
                  {[10, 20, 50, 100].map(v => <option key={v} value={v}>{v} per view</option>)}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-8 w-8 text-foreground" disabled={currentPage === 1} onClick={() => setCurrentPage(1)} title="First">&laquo;</Button>
                <Button variant="outline" size="icon" className="h-8 w-8 text-foreground" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} title="Previous">&lsaquo;</Button>
                <span className="text-xs text-muted-foreground px-2 whitespace-nowrap">
                  Page <span className="font-bold text-foreground">{currentPage}</span> of <span className="font-bold text-foreground">{totalPages}</span>
                </span>
                <Button variant="outline" size="icon" className="h-8 w-8 text-foreground" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} title="Next">&rsaquo;</Button>
                <Button variant="outline" size="icon" className="h-8 w-8 text-foreground" disabled={currentPage === totalPages} onClick={() => setCurrentPage(totalPages)} title="Last">&raquo;</Button>
              </div>
            </div>
          </div>
        )}
      </main>

      <style jsx>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  )
}