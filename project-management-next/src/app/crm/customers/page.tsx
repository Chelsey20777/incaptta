'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { db } from '@/lib/firebase'
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Search, Loader2, Pencil, Trash, Users, User, Mail, Phone, MapPin, CreditCard, LayoutGrid, Table2, FileCode, FileText, AlertTriangle, Copy, Check, Download } from 'lucide-react'
import { toast } from 'sonner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useCrmStore } from '@/stores/crm-store'
import { useAuthStore } from '@/stores/auth-store'

interface Customer {
  id: string
  name: string
  email: string
  phone: string
  address: string
  creditLimit: number
  currentBalance?: number
  status: 'ACTIVE' | 'INACTIVE' | 'BLACKLISTED'
  notes: string
  customerType?: 'COMPANY' | 'INDIVIDUAL'
  primaryContactName?: string
  siteAddress?: string
  taxId?: string
  registrationNumber?: string
  createdAt: any
  updatedAt: any
}

export default function CustomersPage() {
  const router = useRouter()
  const { invoices, fetchInvoices, quotes, fetchQuotes, createCustomer, updateCustomer } = useCrmStore()
  const authStore = useAuthStore()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [saving, setSaving] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'table' | 'raw'>('grid')
  const [copied, setCopied] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(20)

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery])

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(filteredCustomers, null, 2))
    setCopied(true)
    toast.success('JSON copied to clipboard')
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(filteredCustomers, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `customers_export_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    toast.success('JSON file download started')
  }
  const [formData, setFormData] = useState({
    name: '',
    customerType: '',
    email: '',
    phone: '',
    address: '',
    siteAddress: '',
    primaryContactName: '',
    taxId: '',
    registrationNumber: '',
    creditLimit: 0,
    status: 'ACTIVE' as string,
    notes: '',
  })

  useEffect(() => {
    const q = query(collection(db, 'customers'), orderBy('name', 'asc'))
    const unsub = onSnapshot(q, (snap) => {
      setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Customer)))
      setLoading(false)
    })
    const unsubInvoices = fetchInvoices()
    const unsubQuotes = fetchQuotes()
    return () => {
      unsub()
      if (unsubInvoices) unsubInvoices()
      if (unsubQuotes) unsubQuotes()
    }
  }, [fetchInvoices, fetchQuotes])

  const filteredCustomers = useMemo(() => {
    if (!searchQuery) return customers
    const q = searchQuery.toLowerCase()
    return customers.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q)
    )
  }, [customers, searchQuery])

  const paginatedCustomers = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    return filteredCustomers.slice(startIndex, startIndex + itemsPerPage)
  }, [filteredCustomers, currentPage, itemsPerPage])

  const totalPages = Math.max(Math.ceil(filteredCustomers.length / itemsPerPage), 1)

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val)
  }

  const accumulativeInvoices = useMemo(() => {
    return invoices.reduce((sum: number, inv: any) => sum + (inv.amount || inv.grandTotal || 0), 0)
  }, [invoices])

  const accumulativeQuotes = useMemo(() => {
    return quotes.reduce((sum: number, q: any) => sum + (q.grandTotal || q.total || 0), 0)
  }, [quotes])

  const totalOutstanding = useMemo(() => {
    return invoices.reduce((sum: number, inv: any) => {
      if (['DRAFT', 'CANCELLED'].includes(String(inv.status || 'DRAFT').toUpperCase())) return sum
      return sum + Math.max(0, (inv.amount || inv.grandTotal || 0) - (inv.amountPaid || 0))
    }, 0)
  }, [invoices])

  const getCustomerOutstanding = useMemo(() => {
    return (customerName: string, customerId: string) => {
      const clientInvoices = invoices.filter((inv: any) => 
        !['DRAFT', 'CANCELLED'].includes(String(inv.status || 'DRAFT').toUpperCase()) && (
          inv.customerId === customerId ||
          (!inv.customerId && inv.customerName && inv.customerName.toLowerCase() === customerName.toLowerCase())
        )
      )
      return clientInvoices.reduce((sum: number, inv: any) => sum + Math.max(0, (inv.amount || inv.grandTotal || 0) - (inv.amountPaid || 0)), 0)
    }
  }, [invoices])

  const activeCount = customers.filter(c => !c.status || c.status === 'ACTIVE').length

  const openCreateDialog = () => {
    setEditingCustomer(null)
    setFormData({ name: '', customerType: '', email: '', phone: '', address: '', siteAddress: '', primaryContactName: '', taxId: '', registrationNumber: '', creditLimit: 0, status: 'ACTIVE', notes: '' })
    setIsDialogOpen(true)
  }

  const openEditDialog = (e: React.MouseEvent, customer: Customer) => {
    e.stopPropagation()
    setEditingCustomer(customer)
    setFormData({
      name: customer.name,
      customerType: customer.customerType || '',
      email: customer.email || '',
      phone: customer.phone || '',
      address: customer.address || '',
      siteAddress: customer.siteAddress || '',
      primaryContactName: customer.primaryContactName || '',
      taxId: customer.taxId || '',
      registrationNumber: customer.registrationNumber || '',
      creditLimit: customer.creditLimit || 0,
      status: customer.status || 'ACTIVE',
      notes: customer.notes || '',
    })
    setIsDialogOpen(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim()) { toast.error('Customer name is required'); return }
    if (!editingCustomer && !formData.customerType) { toast.error('Choose Company or Individual'); return }
    setSaving(true)
    try {
      if (editingCustomer) {
        await updateCustomer(editingCustomer.id, formData)
        toast.success('Customer updated')
      } else {
        await createCustomer(formData)
        toast.success('Customer created')
      }
      setIsDialogOpen(false)
    } catch (err: any) { toast.error(err.message) } finally { setSaving(false) }
  }

  const downloadLegacyBalanceReport = async () => {
    try {
      const token = await authStore.user?.getIdToken()
      if (!token) throw new Error('Authentication required')
      const response = await fetch('/api/crm/credit-migration-report', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to create report')
      const href = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }))
      const anchor = document.createElement('a')
      anchor.href = href
      anchor.download = `legacy-customer-balances-${new Date().toISOString().split('T')[0]}.json`
      anchor.click()
      URL.revokeObjectURL(href)
      toast.success(`Legacy balance report downloaded (${result.count || 0} records)`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to download report')
    }
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!confirm('Delete this customer?')) return
    try {
      const token = await authStore.user?.getIdToken()
      if (!token) throw new Error('Authentication required')
      const response = await fetch(`/api/crm/customers/${encodeURIComponent(id)}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not delete customer')
      toast.success('Customer deleted')
    } catch (err: any) { toast.error(err.message) }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            <span className="text-brand-primary">Customers</span>
          </h2>
          <p className="text-muted-foreground">Customer database with credit limits and profiles</p>
        </div>
        <Button onClick={openCreateDialog} className="bg-brand-primary text-white hover:bg-brand-primary/90">
          <Plus className="mr-2 h-4 w-4" /> Add Customer
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Accumulative Invoices</CardTitle>
            <FileText className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {loading ? <Skeleton className="h-8 w-24" /> : formatCurrency(accumulativeInvoices)}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">{invoices.length} total invoices</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Accumulative Quotes</CardTitle>
            <FileCode className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">
              {loading ? <Skeleton className="h-8 w-24" /> : formatCurrency(accumulativeQuotes)}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">{quotes.length} total quotes</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Outstanding</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-500">
              {loading ? <Skeleton className="h-8 w-24" /> : formatCurrency(totalOutstanding)}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">unpaid balances</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
            <Users className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">
              {loading ? <Skeleton className="h-8 w-16" /> : customers.length}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">{activeCount} active</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center">
        <div className="relative flex-1 max-w-md w-full">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name, email or phone..." className="pl-8" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        <Tabs value={viewMode} onValueChange={(val) => setViewMode(val as 'grid' | 'table' | 'raw')} className="w-fit">
          <TabsList>
            <TabsTrigger value="grid">
              <LayoutGrid className="mr-1.5 h-4 w-4" /> Card Grid
            </TabsTrigger>
            <TabsTrigger value="table">
              <Table2 className="mr-1.5 h-4 w-4" /> Table View
            </TabsTrigger>
            <TabsTrigger value="raw">
              <FileCode className="mr-1.5 h-4 w-4" /> Raw JSON
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {(authStore.isSuperAdmin() || authStore.hasRole('ADMIN' as any)) && (
          <Button variant="outline" onClick={downloadLegacyBalanceReport}>
            <Download className="mr-2 h-4 w-4" /> Legacy Balance Report
          </Button>
        )}
      </div>

      {viewMode === 'grid' && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}><CardContent className="p-4 space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /><Skeleton className="h-3 w-2/3" /></CardContent></Card>
            ))
          ) : filteredCustomers.length === 0 ? (
            <Card className="col-span-full"><CardContent className="p-8 text-center text-muted-foreground">No customers found</CardContent></Card>
          ) : (
            paginatedCustomers.map(customer => (
              <Card
                key={customer.id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => router.push(`/crm/customers/${customer.id}`)}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold">{customer.name}</h3>
                      <Badge variant={customer.status === 'ACTIVE' ? 'default' : customer.status === 'INACTIVE' ? 'secondary' : 'destructive'} className="mt-1">
                        {customer.status}
                      </Badge>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={(e) => openEditDialog(e, customer)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" className="text-red-500" onClick={(e) => handleDelete(e, customer.id)}><Trash className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    {customer.email && <div className="flex items-center gap-2"><Mail className="h-3 w-3" />{customer.email}</div>}
                    {customer.phone && <div className="flex items-center gap-2"><Phone className="h-3 w-3" />{customer.phone}</div>}
                    {customer.address && <div className="flex items-center gap-2"><MapPin className="h-3 w-3" />{customer.address}</div>}
                  </div>
                  <div className="flex justify-between text-sm pt-2 border-t">
                    <span>Credit Limit: <strong>{formatCurrency(customer.creditLimit || 0)}</strong></span>
                    <span>
                      Outstanding:{' '}
                      <strong className={getCustomerOutstanding(customer.name, customer.id) > 0 ? 'text-red-500 font-bold' : 'text-emerald-500 font-bold'}>
                        {formatCurrency(getCustomerOutstanding(customer.name, customer.id))}
                      </strong>
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {viewMode === 'table' && (
        <Card className="border border-muted bg-card text-card-foreground shadow-sm rounded-xl">
          <CardContent className="p-0 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead className="text-right">Credit Limit</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredCustomers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No customers found
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedCustomers.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell className="font-semibold">
                        <span 
                          className="hover:underline hover:text-primary cursor-pointer transition-colors"
                          onClick={() => router.push(`/crm/customers/${customer.id}`)}
                        >
                          {customer.name}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={customer.status === 'ACTIVE' ? 'default' : customer.status === 'INACTIVE' ? 'secondary' : 'destructive'}>
                          {customer.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{customer.email || '-'}</TableCell>
                      <TableCell className="text-muted-foreground">{customer.phone || '-'}</TableCell>
                      <TableCell className="text-muted-foreground max-w-xs truncate" title={customer.address}>{customer.address || '-'}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(customer.creditLimit || 0)}</TableCell>
                      <TableCell className="text-right font-medium">
                        <span className={getCustomerOutstanding(customer.name, customer.id) > 0 ? 'text-red-500 font-bold' : 'text-emerald-500 font-bold'}>
                          {formatCurrency(getCustomerOutstanding(customer.name, customer.id))}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={(e) => openEditDialog(e, customer)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" className="text-red-500" onClick={(e) => handleDelete(e, customer.id)}>
                            <Trash className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {viewMode !== 'raw' && !loading && filteredCustomers.length > 0 && (
        <Card className="bg-muted/5 dark:bg-card/10 border-muted">
          <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-muted-foreground text-center sm:text-left">
              Showing{' '}
              <span className="font-bold text-foreground">{(currentPage - 1) * itemsPerPage + 1}</span>
              {' '}to{' '}
              <span className="font-bold text-foreground">{Math.min(currentPage * itemsPerPage, filteredCustomers.length)}</span>
              {' '}of{' '}
              <span className="font-bold text-foreground">{filteredCustomers.length}</span>
              {' '}customers
            </div>

            <div className="flex items-center gap-4 flex-wrap justify-center sm:justify-end w-full sm:w-auto">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">Show:</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value))
                    setCurrentPage(1)
                  }}
                  className="bg-background border border-muted rounded text-xs px-2 py-1.5 focus:ring-1 focus:ring-emerald-500 focus:outline-none cursor-pointer text-foreground font-medium"
                >
                  <option value={20}>20 per view</option>
                  <option value={50}>50 per view</option>
                  <option value={100}>100 per view</option>
                </select>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 text-foreground"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(1)}
                  title="First Page"
                >
                  &laquo;
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 text-foreground"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  title="Previous Page"
                >
                  &lsaquo;
                </Button>
                
                <span className="text-xs font-medium px-2">
                  Page {currentPage} of {totalPages}
                </span>

                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 text-foreground"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  title="Next Page"
                >
                  &rsaquo;
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 text-foreground"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                  title="Last Page"
                >
                  &raquo;
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {viewMode === 'raw' && (
        <Card className="border border-zinc-800 bg-zinc-950 text-zinc-100 font-mono text-sm shadow-xl rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b border-zinc-800">
            <div>
              <CardTitle className="text-zinc-100 text-base font-semibold">Raw Customer JSON Feed</CardTitle>
              <p className="text-zinc-400 text-xs mt-1">Showing {filteredCustomers.length} active customer profiles</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="border-zinc-800 hover:bg-zinc-900 text-zinc-300 hover:text-zinc-100" onClick={handleCopy}>
                {copied ? <Check className="mr-2 h-4 w-4 text-emerald-400" /> : <Copy className="mr-2 h-4 w-4" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button variant="outline" size="sm" className="border-zinc-800 hover:bg-zinc-900 text-zinc-300 hover:text-zinc-100" onClick={handleDownload}>
                <Download className="mr-2 h-4 w-4" /> Export JSON
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <pre className="p-4 overflow-auto max-h-[500px] text-xs leading-relaxed select-all text-zinc-300 selection:bg-zinc-800 selection:text-white">
              <code>{JSON.stringify(filteredCustomers, null, 2)}</code>
            </pre>
          </CardContent>
        </Card>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingCustomer ? 'Edit Customer' : 'Add Customer'}</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label>Customer Type {!editingCustomer && '*'}</Label>
              <Select value={formData.customerType} onValueChange={(value) => setFormData(p => ({ ...p, customerType: value || '' }))}>
                <SelectTrigger><SelectValue placeholder={editingCustomer && !formData.customerType ? 'Unclassified (legacy)' : 'Choose customer type'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="COMPANY">Company</SelectItem>
                  <SelectItem value="INDIVIDUAL">Individual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>{formData.customerType === 'COMPANY' ? 'Company Name *' : 'Customer Name *'}</Label><Input value={formData.name} onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))} /></div>
            {formData.customerType === 'COMPANY' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Primary Contact</Label><Input value={formData.primaryContactName} onChange={(e) => setFormData(p => ({ ...p, primaryContactName: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Registration Number</Label><Input value={formData.registrationNumber} onChange={(e) => setFormData(p => ({ ...p, registrationNumber: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Tax ID</Label><Input value={formData.taxId} onChange={(e) => setFormData(p => ({ ...p, taxId: e.target.value }))} /></div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Email</Label><Input type="email" value={formData.email} onChange={(e) => setFormData(p => ({ ...p, email: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Phone</Label><Input value={formData.phone} onChange={(e) => setFormData(p => ({ ...p, phone: e.target.value }))} /></div>
            </div>
            <div className="space-y-2"><Label>Billing Address</Label><Input value={formData.address} onChange={(e) => setFormData(p => ({ ...p, address: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Site Address</Label><Input value={formData.siteAddress} onChange={(e) => setFormData(p => ({ ...p, siteAddress: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Credit Limit ($)</Label><Input type="number" min="0" value={formData.creditLimit} onChange={(e) => setFormData(p => ({ ...p, creditLimit: Math.max(0, Number(e.target.value)) }))} /></div>
              <div className="space-y-2">
                <Label>Outstanding Balance</Label>
                <Input value={editingCustomer ? formatCurrency(getCustomerOutstanding(editingCustomer.name, editingCustomer.id)) : formatCurrency(0)} readOnly className="bg-muted" />
                <p className="text-xs text-muted-foreground">Calculated from issued invoices and payments.</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={(v) => v && setFormData(p => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                  <SelectItem value="BLACKLISTED">Blacklisted</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Notes</Label><Textarea value={formData.notes} onChange={(e) => setFormData(p => ({ ...p, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editingCustomer ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
