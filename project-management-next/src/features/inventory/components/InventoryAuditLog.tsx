'use client'

import { useEffect, useRef, useState } from 'react'
import { collection, getDocs, limit, orderBy, query, startAfter, Timestamp, where, type QueryConstraint, type QueryDocumentSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import type { InventoryItem } from '@/stores/inventory-store'

export interface InventoryAuditEntry {
  id: string
  inventoryItemId: string
  name: string
  sku: string
  action: 'CREATE' | 'UPDATE' | 'DELETE'
  occurredAt: Timestamp
  principal: { type: string; id: string | null }
  itemProvidedActor: { before: unknown; after: unknown }
  changes: { field: string; beforePresent: boolean; afterPresent: boolean; before: unknown; after: unknown }[]
}

const metadata = new Set(['updatedAt', 'updatedBy', 'createdAt', 'createdBy'])
function principalLabel(principal: InventoryAuditEntry['principal']): string {
  if (principal?.type === 'service_account' || principal?.id?.endsWith('.gserviceaccount.com')) return 'Service account'
  if (principal?.type === 'unknown' && principal.id) return 'Authenticated principal'
  return principal?.type || 'Unknown actor'
}

function display(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString()
  return JSON.stringify(value, null, 2) ?? 'undefined'
}

export default function InventoryAuditLog({ items, itemId, compact = false }: { items: InventoryItem[]; itemId?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState(itemId || '')
  const [action, setAction] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [entries, setEntries] = useState<InventoryAuditEntry[]>([])
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const generation = useRef(0)

  async function load(more = false) {
    const current = ++generation.current
    setLoading(true)
    setError('')
    if (!more) { setEntries([]); setCursor(null); setHasMore(false) }
    try {
      if (from && to && from > to) throw new Error('Start date must not be after end date.')
      const constraints: QueryConstraint[] = []
      if (selectedItem) constraints.push(where('inventoryItemId', '==', selectedItem))
      if (action) constraints.push(where('action', '==', action))
      if (from) constraints.push(where('occurredAt', '>=', Timestamp.fromDate(new Date(`${from}T00:00:00`))))
      if (to) {
        const end = new Date(`${to}T00:00:00`)
        end.setDate(end.getDate() + 1)
        constraints.push(where('occurredAt', '<', Timestamp.fromDate(end)))
      }
      constraints.push(orderBy('occurredAt', 'desc'), orderBy('__name__', 'desc'))
      if (more && cursor) constraints.push(startAfter(cursor))
      constraints.push(limit(25))
      const result = await getDocs(query(collection(db, 'inventoryAuditLogs'), ...constraints))
      if (current !== generation.current) return
      const rows = result.docs.map(doc => ({ ...doc.data(), id: doc.id }) as InventoryAuditEntry)
      setEntries(previous => more ? [...previous, ...rows] : rows)
      setCursor(result.docs.at(-1) ?? null)
      setHasMore(result.size === 25)
    } catch (e) {
      if (current === generation.current) setError(e instanceof Error ? e.message : 'Unable to load audit log.')
    } finally { if (current === generation.current) setLoading(false) }
  }

  useEffect(() => {
    const timer = open ? setTimeout(() => { void load() }, 0) : undefined
    return () => {
      clearTimeout(timer)
      // Invalidate asynchronous query results, not a DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++
    }
    // The cursor is only used for explicit Load more requests.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedItem, action, from, to])

  return <>
    <Button variant="outline" size="sm" onClick={e => { e.stopPropagation(); setOpen(true) }}>{compact ? 'History' : 'Audit Log'}</Button>
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="w-full sm:max-w-3xl overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
        <SheetHeader><SheetTitle>Inventory Audit Log</SheetTitle><SheetDescription>Changes are recorded after they are saved. Dates use your local timezone.</SheetDescription></SheetHeader>
        <div className="grid gap-3 my-4 sm:grid-cols-2">
          <label className="text-sm">Item
            <select aria-label="Filter audit by item" className="border rounded p-2 w-full" value={selectedItem} onChange={e => setSelectedItem(e.target.value)}>
              <option value="">All items</option>
              {items.map(item => <option key={item.id} value={item.id}>{item.name} ({item.sku})</option>)}
              {selectedItem && !items.some(i => i.id === selectedItem) && <option value={selectedItem}>Deleted item ({selectedItem})</option>}
            </select>
          </label>
          <label className="text-sm">Action
            <select aria-label="Filter audit by action" className="border rounded p-2 w-full" value={action} onChange={e => setAction(e.target.value)}>
              <option value="">All actions</option><option value="CREATE">Created</option><option value="UPDATE">Updated</option><option value="DELETE">Deleted</option>
            </select>
          </label>
          <label className="text-sm">From<Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
          <label className="text-sm">Through<Input type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
        </div>
        <Button variant="outline" disabled={loading} onClick={() => void load()}>Refresh</Button>
        {error && <p role="alert" className="text-destructive my-3">{error}</p>}
        {loading && <p role="status" className="my-3">Loading audit entries…</p>}
        {!loading && !error && !entries.length && <p className="my-3">No recorded changes match these filters.</p>}
        <div className="space-y-3 my-4">
          {entries.map(entry => <details key={entry.id} className="border rounded p-3">
            <summary className="cursor-pointer">
              <span className="font-semibold">{entry.name || entry.sku || entry.inventoryItemId} — {entry.action}</span>
              <span className="block text-sm">{entry.occurredAt?.toDate().toLocaleString('en-GB')} · {principalLabel(entry.principal)}: {entry.principal?.id || 'Unknown actor'}</span>
              <span className="block text-sm text-muted-foreground">{entry.changes.filter(c => !metadata.has(c.field)).map(c => c.field).join(', ') || 'Metadata changed'}</span>
            </summary>
            <Button variant="ghost" size="sm" onClick={() => setSelectedItem(entry.inventoryItemId)}>View this item’s history</Button>
            <p className="text-xs">SKU: {entry.sku} · Item ID: {entry.inventoryItemId}</p>
            <div className="overflow-x-auto"><table className="w-full text-sm mt-2"><thead><tr><th className="text-left">Field</th><th className="text-left">Before</th><th className="text-left">After</th></tr></thead><tbody>
              {[...entry.changes].sort((a, b) => Number(metadata.has(a.field)) - Number(metadata.has(b.field))).map(change => <tr key={change.field} className="border-t align-top">
                <td className="p-2">{change.field}</td>
                <td className="p-2"><pre className="whitespace-pre-wrap break-all">{change.beforePresent ? display(change.before) : '(field absent)'}</pre></td>
                <td className="p-2"><pre className="whitespace-pre-wrap break-all">{change.afterPresent ? display(change.after) : '(field absent)'}</pre></td>
              </tr>)}
            </tbody></table></div>
            <details className="mt-3"><summary>Item-provided actor metadata (not verified actor identity)</summary><pre className="text-xs whitespace-pre-wrap break-all">{display(entry.itemProvidedActor)}</pre></details>
          </details>)}
        </div>
        {hasMore && <Button disabled={loading} onClick={() => void load(true)}>Load more</Button>}
      </SheetContent>
    </Sheet>
  </>
}
