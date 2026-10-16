'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useCrmStore } from '@/stores/crm-store'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Users, Search, Loader2 } from 'lucide-react'

export default function CrmPage() {
  const store = useCrmStore()
  const [search, setSearch] = useState('')

  useEffect(() => { store.fetchCustomers(); store.fetchLeads() }, [])

  const filtered = useMemo(() => {
    if (!search) return store.customers
    const q = search.toLowerCase()
    return store.customers.filter(c => c.name.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || c.phone?.includes(q))
  }, [store.customers, search])

  return (
    <div className="space-y-6 p-6">
      <div><h1 className="text-2xl font-bold">CRM</h1><p className="text-sm text-muted-foreground">Customer Relationship Management</p></div>
      <div className="grid grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Customers</p><p className="text-2xl font-bold">{store.customers.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Leads</p><p className="text-2xl font-bold">{store.leads.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Quotations</p><p className="text-2xl font-bold">{store.quotations.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Invoices</p><p className="text-2xl font-bold">{store.invoices.length}</p></CardContent></Card>
      </div>
      <div className="relative"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search customers..." className="pl-9" /></div>
      {store.loading ? <div className="flex justify-center py-12"><Loader2 className="size-8 animate-spin" /></div> : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground"><Users className="size-12 mx-auto mb-2 opacity-50" /><p>No customers found</p></div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm"><thead className="bg-muted/50"><tr>{['Name', 'Phone', 'Email', 'Status'].map(h => <th key={h} className="text-left p-3 font-medium text-muted-foreground">{h}</th>)}</tr></thead>
            <tbody>{filtered.map(c => <tr key={c.id} className="border-t hover:bg-muted/20"><td className="p-3 font-medium">{c.name}</td><td className="p-3 text-muted-foreground">{c.phone || '—'}</td><td className="p-3 text-muted-foreground">{c.email || '—'}</td><td className="p-3"><Badge variant={c.isActive ? 'default' : 'secondary'} className="text-[10px]">{c.isActive ? 'Active' : 'Inactive'}</Badge></td></tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}