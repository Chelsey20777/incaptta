'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { auth } from '@/lib/firebase'
import { useAuthStore } from '@/stores/auth-store'
import { useAdminStore } from '@/stores/admin-store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Package, Loader2, Download } from 'lucide-react'
import { generatePmoAcknowledgementPdf } from '@/features/inventory/utils/generatePmoAcknowledgementPdf'
import type { InventoryReceiptRow } from '@/features/inventory/components/PmoReceiptQueue'

interface FulfilmentRow {
  jobCardId: string
  jobNumber: string
  destination: string
  recipient: string
  lineId: string
  itemName: string
  approvedQty: number
  reservedQty: number
  issuedQty: number
  outstandingQty: number
  remainingQty?: number
  fulfilmentState: string
  reservedAt?: string | null
  acknowledgedAt?: string | null
  acknowledgedBy?: string | null
  lastDispatchId?: string | null
  lastSessionId?: string | null
  acknowledgementPdfGeneratedAt?: string | null
  expired?: boolean
  damagedQty?: number
}

function remainingReleaseQty(row: FulfilmentRow) {
  if (typeof row.remainingQty === 'number') return Math.max(0, row.remainingQty)
  const remainingRequired = Math.max(0, Number(row.approvedQty || 0) - Number(row.issuedQty || 0))
  if (Number(row.approvedQty || 0) > 0) {
    return Math.min(Number(row.outstandingQty || 0), remainingRequired)
  }
  return Math.max(0, Number(row.outstandingQty || 0))
}

function groupByJob(items: FulfilmentRow[]) {
  const groups = new Map<string, FulfilmentRow[]>()
  for (const row of items) {
    const existing = groups.get(row.jobCardId) || []
    existing.push(row)
    groups.set(row.jobCardId, existing)
  }
  return [...groups.values()]
}

export default function InventoryFulfilmentPage() {
  const authStore = useAuthStore()
  const appSettings = useAdminStore(state => state.appSettings)
  const { user, profile } = authStore
  const canReleaseJobs = authStore.hasAnyRole(['STOREKEEPER', 'ADMIN', 'SUPER_ADMIN', 'MANAGER', 'DIRECTOR'] as any)
  const canEnterReceipt = authStore.hasAnyRole(['TECHNICAL', 'SUPER_ADMIN'] as any)
  const canPmoDecide = authStore.hasAnyRole(['STOREKEEPER'] as any)
  const canFinalDecide = authStore.hasAnyRole(['MANAGER', 'DIRECTOR', 'ADMIN', 'SUPER_ADMIN'] as any)
  const canView = canReleaseJobs || authStore.hasAnyRole(['TECHNICAL'] as any)
  const [items, setItems] = useState<FulfilmentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string>('')
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [damaged, setDamaged] = useState<Record<string, string>>({})
  const [catalogue, setCatalogue] = useState<Array<{ id: string; sku: string; name: string; uom: string; onHand: number }>>([])
  const [receipts, setReceipts] = useState<InventoryReceiptRow[]>([])
  const [enteredQty, setEnteredQty] = useState<Record<string, string>>({})
  const [tableQuery, setTableQuery] = useState('')
  const [receiveReference, setReceiveReference] = useState('')
  const [receiveNote, setReceiveNote] = useState('')
  const [receiving, setReceiving] = useState(false)

  const sessions = useMemo(() => groupByJob(items), [items])

  const load = async () => {
    const token = await auth.currentUser?.getIdToken()
    if (!token) return
    const response = await fetch('/api/inventory/fulfilment', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.error || 'Could not load fulfilment queue')
    setItems(body.items || [])
  }

  const loadCatalogue = async () => {
    const token = await auth.currentUser?.getIdToken()
    if (!token) return
    const response = await fetch('/api/inventory/fulfilment/catalogue', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.error || 'Could not load inventory')
    setCatalogue(body.items || [])
  }

  const loadReceipts = async () => {
    const token = await auth.currentUser?.getIdToken()
    if (!token) return
    const response = await fetch('/api/inventory/fulfilment/receipts', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.error || 'Could not load receipts')
    setReceipts(body.receipts || [])
  }

  useEffect(() => {
    const tasks = [loadCatalogue(), loadReceipts()]
    if (canReleaseJobs) tasks.unshift(load())
    Promise.all(tasks).catch(error => toast.error(error.message)).finally(() => setLoading(false))
  }, [canReleaseJobs])

  const pendingByItem = useMemo(() => {
    const open = new Map<string, InventoryReceiptRow>()
    for (const receipt of receipts) {
      const itemId = receipt.inventoryItemId
      if (!itemId || open.has(itemId)) continue
      if (receipt.status === 'PENDING_PMO' || receipt.status === 'PENDING_FINAL' || receipt.status === 'PENDING') open.set(itemId, receipt)
    }
    return open
  }, [receipts])

  const visibleCatalogue = useMemo(() => {
    const query = tableQuery.trim().toLowerCase()
    if (!query) return catalogue
    return catalogue.filter(item => `${item.sku} ${item.name}`.toLowerCase().includes(query))
  }, [catalogue, tableQuery])

  const acceptReceipt = async () => {
    const lines = catalogue.flatMap(item => {
      const quantity = Number(enteredQty[item.id])
      if (pendingByItem.has(item.id) || !Number.isFinite(quantity) || quantity <= 0) return []
      return [{ inventoryItemId: item.id, quantity }]
    })
    if (lines.length === 0 || !receiveReference.trim()) {
      toast.error('Enter a quantity on at least one row, and a delivery reference')
      return
    }
    setReceiving(true)
    try {
      const token = await auth.currentUser?.getIdToken()
      if (!token) throw new Error('Sign in required')
      let emailed = false
      for (const line of lines) {
        const response = await fetch('/api/inventory/fulfilment/receive', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            inventoryItemId: line.inventoryItemId,
            quantity: line.quantity,
            reference: receiveReference.trim(),
            note: receiveNote.trim(),
            requestId: crypto.randomUUID(),
          }),
        })
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body.error || 'Stock receipt failed')
        emailed = emailed || Boolean(body.emailed)
      }
      toast.success(emailed
        ? 'Receipt submitted. The notice was emailed. Stock stays the same until PMO, then a manager or admin, approves it.'
        : 'Receipt submitted. The notice was not emailed. Stock stays the same until PMO, then a manager or admin, approves it.')
      setEnteredQty({})
      setReceiveReference('')
      setReceiveNote('')
      await loadReceipts()
      window.dispatchEvent(new Event('pmo-receipts-changed'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Stock receipt failed')
      await loadReceipts()
    } finally {
      setReceiving(false)
    }
  }

  const decideReceipt = async (requestId: string, decision: 'APPROVE' | 'REJECT') => {
    setBusy(requestId)
    try {
      const token = await auth.currentUser?.getIdToken()
      if (!token) throw new Error('Sign in required')
      const response = await fetch('/api/inventory/fulfilment/receipts/decide', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, decision }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'Receipt decision failed')
      toast.success(decision === 'REJECT'
        ? 'Receipt rejected. Stock was not changed.'
        : body.status === 'PENDING_FINAL'
          ? 'PMO approved. Stock stays the same until a manager or admin approves it.'
          : (body.idempotent
            ? 'This receipt was already in stock'
            : body.emailed
              ? `On hand is now ${body.qtyAfter}. The new inventory entry PDF was emailed.`
              : `On hand is now ${body.qtyAfter}. The PDF was not emailed.`))
      await Promise.all([loadReceipts(), loadCatalogue()])
      window.dispatchEvent(new Event('pmo-receipts-changed'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Receipt decision failed')
    } finally {
      setBusy('')
    }
  }

  const actorName = profile?.name || user?.displayName || user?.email || 'PMO'

  const sessionMeta = (rows: FulfilmentRow[]) => {
    const first = rows[0]
    const sessionId = rows.find(row => row.lastSessionId || row.lastDispatchId)?.lastSessionId
      || rows.find(row => row.lastDispatchId)?.lastDispatchId
      || null
    return {
      jobCardId: first.jobCardId,
      jobNumber: first.jobNumber,
      destination: first.destination,
      recipient: first.recipient,
      sessionId,
    }
  }

  const downloadAcknowledgement = async (rows: FulfilmentRow[], extras?: {
    acknowledgedAt?: string | null
    acknowledgedBy?: string | null
    sessionId?: string | null
  }) => {
    const meta = sessionMeta(rows)
    const issuedRows = rows.filter(row => row.issuedQty > 0)
    await generatePmoAcknowledgementPdf({
      jobNumber: meta.jobNumber,
      destination: meta.destination,
      recipient: meta.recipient,
      items: (issuedRows.length ? issuedRows : rows).map(row => ({
        itemName: row.itemName,
        issuedQty: row.issuedQty,
        damagedQty: Number(damaged[row.lineId] || row.damagedQty || 0),
        fulfilmentState: row.fulfilmentState,
      })),
      dispatchId: extras?.sessionId ?? meta.sessionId,
      sessionId: extras?.sessionId ?? meta.sessionId,
      releasedBy: actorName,
      releasedAt: new Date().toISOString(),
      acknowledgedBy: extras?.acknowledgedBy ?? issuedRows.find(row => row.acknowledgedBy)?.acknowledgedBy,
      acknowledgedAt: extras?.acknowledgedAt ?? issuedRows.find(row => row.acknowledgedAt)?.acknowledgedAt,
    }, appSettings)
  }

  const markPdfGenerated = async (rows: FulfilmentRow[]) => {
    const token = await auth.currentUser?.getIdToken()
    if (!token) throw new Error('Authentication required')
    const meta = sessionMeta(rows)
    const response = await fetch('/api/inventory/fulfilment/acknowledgement-pdf', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobCardId: meta.jobCardId, sessionId: meta.sessionId }),
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.error || 'Could not record acknowledgement PDF')
  }

  const createAcknowledgementPdf = async (rows: FulfilmentRow[], extras?: {
    acknowledgedAt?: string | null
    acknowledgedBy?: string | null
    sessionId?: string | null
  }) => {
    await downloadAcknowledgement(rows, extras)
    await markPdfGenerated(rows)
  }

  const handleDispatch = async (rows: FulfilmentRow[]) => {
    const meta = sessionMeta(rows)
    setBusy(meta.jobCardId)
    try {
      const token = await auth.currentUser?.getIdToken()
      if (!token) throw new Error('Authentication required')
      const lines = rows
        .map(row => {
          const remaining = remainingReleaseQty(row)
          const typed = Number(quantities[row.lineId] ?? remaining)
          const quantity = Math.min(Number.isFinite(typed) ? typed : remaining, remaining)
          return {
            lineId: row.lineId,
            quantity,
            damagedQty: Number(damaged[row.lineId] || 0),
          }
        })
        .filter(line => line.quantity > 0)
      const response = await fetch('/api/inventory/fulfilment/dispatch-session', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobCardId: meta.jobCardId,
          recipient: meta.recipient,
          lines,
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'dispatch failed')
      toast.success(body.emailSent
        ? 'Session released. The issue notice was emailed.'
        : 'Session released. The issue notice was not emailed.')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Stock release failed')
    } finally {
      setBusy('')
    }
  }

  const handleAcknowledge = async (rows: FulfilmentRow[]) => {
    const meta = sessionMeta(rows)
    setBusy(meta.jobCardId)
    try {
      const token = await auth.currentUser?.getIdToken()
      if (!token) throw new Error('Authentication required')
      const response = await fetch('/api/inventory/fulfilment/acknowledge', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobCardId: meta.jobCardId,
          sessionId: meta.sessionId,
          note: 'Recipient acknowledgement',
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'acknowledge failed')
      toast.success('Receipt acknowledged. Stock was not deducted again.')
      try {
        await createAcknowledgementPdf(rows, {
          acknowledgedAt: new Date().toISOString(),
          acknowledgedBy: actorName,
          sessionId: meta.sessionId,
        })
      } catch (pdfError) {
        toast.error(pdfError instanceof Error ? pdfError.message : 'Acknowledged, but the PDF could not be created')
      }
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Acknowledgement failed')
    } finally {
      setBusy('')
    }
  }

  const handleDownloadAcknowledgement = async (rows: FulfilmentRow[]) => {
    const meta = sessionMeta(rows)
    setBusy(meta.jobCardId)
    try {
      await createAcknowledgementPdf(rows)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create acknowledgement PDF')
    } finally {
      setBusy('')
    }
  }

  if (!canView) {
    return <p className="text-sm text-muted-foreground">Technical, PMO, or manager access is required.</p>
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">
          <span className="text-brand-primary">PMO portal</span>
        </h2>
        <p className="text-muted-foreground">
          {canReleaseJobs
            ? 'Release reserved materials, and record stock that has arrived in the warehouse.'
            : 'Enter the quantity received. PMO approves it, then a manager or admin posts it to stock.'}
        </p>
      </div>
      <Card>
        <CardContent className="p-4 space-y-3">
          <div>
            <div className="font-semibold">Receive stock</div>
            <p className="text-xs text-muted-foreground">Technical enters the new quantity. PMO approves that entry. A manager or admin gives the approval that increases on-hand. Inventory Master remains the admin path for manual edits.</p>
          </div>
          <Input
            placeholder="Filter by product or SKU"
            value={tableQuery}
            onChange={event => setTableQuery(event.target.value)}
          />
          <div className="overflow-x-auto rounded border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/20">
                  <th className="text-left p-3">SKU</th>
                  <th className="text-left p-3">Product</th>
                  <th className="text-left p-3">Unit</th>
                  <th className="text-right p-3">Current stock</th>
                  <th className="text-left p-3">New quantity</th>
                </tr>
              </thead>
              <tbody>
                {visibleCatalogue.map(item => {
                  const pending = pendingByItem.get(item.id)
                  const ownsStep = pending && (
                    (pending.status === 'PENDING_PMO' && canPmoDecide && pending.requestedBy?.uid !== user?.uid)
                    || ((pending.status === 'PENDING_FINAL' || pending.status === 'PENDING') && canFinalDecide)
                  )
                  return (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="p-3 font-mono text-xs">{item.sku || '—'}</td>
                      <td className="p-3">{item.name}</td>
                      <td className="p-3">{item.uom || '—'}</td>
                      <td className="p-3 text-right font-mono">{item.onHand}</td>
                      <td className="p-3">
                        {pending ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono">{pending.quantity}</span>
                            <Badge variant="outline">
                              {pending.status === 'PENDING_PMO' ? 'Waiting for PMO' : 'Waiting for manager'}
                            </Badge>
                            {ownsStep && (
                              <>
                                <Button size="sm" disabled={busy === pending.id} onClick={() => decideReceipt(pending.id, 'APPROVE')}>Approve</Button>
                                <Button size="sm" variant="outline" disabled={busy === pending.id} onClick={() => decideReceipt(pending.id, 'REJECT')}>Reject</Button>
                              </>
                            )}
                          </div>
                        ) : canEnterReceipt ? (
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            className="h-8 w-28"
                            value={enteredQty[item.id] ?? ''}
                            onChange={event => setEnteredQty(prev => ({ ...prev, [item.id]: event.target.value }))}
                          />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {visibleCatalogue.length === 0 && (
                  <tr><td colSpan={5} className="p-4 text-muted-foreground">No stock items.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {canEnterReceipt && (
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <Input placeholder="Delivery reference" value={receiveReference} onChange={event => setReceiveReference(event.target.value)} />
              <Input placeholder="Note (optional)" value={receiveNote} onChange={event => setReceiveNote(event.target.value)} />
              <Button type="button" disabled={receiving} onClick={acceptReceipt}>
                {receiving ? <Loader2 className="size-4 animate-spin" /> : 'Submit quantities'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      {canReleaseJobs && (loading ? (
        <Card>
          <CardContent className="p-8 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading reserved materials…
          </CardContent>
        </Card>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-sm text-muted-foreground flex items-center gap-2">
            <Package className="size-4" /> No reserved materials waiting for PMO release.
          </CardContent>
        </Card>
      ) : (
        sessions.map(rows => {
          const meta = sessionMeta(rows)
          const canRelease = rows.some(row => remainingReleaseQty(row) > 0)
          const canAcknowledge = rows.some(row => row.issuedQty > 0 && !row.acknowledgedAt)
          const showDownload = rows.some(row => row.acknowledgedAt && !row.acknowledgementPdfGeneratedAt)
          return (
            <Card key={meta.jobCardId}>
              <CardContent className="p-0 overflow-x-auto">
                <div className="flex flex-wrap items-start justify-between gap-3 p-4 border-b bg-muted/30">
                  <div>
                    <div className="font-semibold">{meta.jobNumber}</div>
                    <div className="text-xs text-muted-foreground">
                      {meta.recipient || 'No recipient listed'} · {meta.destination || 'No destination'}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canRelease && (
                      <Button size="sm" disabled={busy === meta.jobCardId} onClick={() => handleDispatch(rows)}>
                        Release stock
                      </Button>
                    )}
                    {canAcknowledge && (
                      <Button size="sm" variant="outline" disabled={busy === meta.jobCardId} onClick={() => handleAcknowledge(rows)}>
                        Acknowledge
                      </Button>
                    )}
                    {showDownload && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === meta.jobCardId}
                        onClick={() => handleDownloadAcknowledgement(rows)}
                      >
                        <Download className="size-3 mr-1" />
                        Download acknowledgement
                      </Button>
                    )}
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/20">
                      <th className="text-left p-3">Item</th>
                      <th className="text-right p-3">Reserved</th>
                      <th className="text-right p-3">Issued</th>
                      <th className="text-right p-3">Release qty</th>
                      <th className="text-right p-3">Damaged</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => {
                      const remaining = remainingReleaseQty(row)
                      const canEditQty = remaining > 0
                      return (
                        <tr key={`${row.jobCardId}-${row.lineId}`} className="border-b last:border-0">
                          <td className="p-3">
                            {row.itemName}
                            <Badge variant="outline" className="ml-2 text-[10px]">{row.fulfilmentState}</Badge>
                            {row.expired && <Badge variant="destructive" className="ml-2 text-[10px]">Expired</Badge>}
                            {row.acknowledgedAt && <Badge variant="secondary" className="ml-2 text-[10px]">Ack</Badge>}
                          </td>
                          <td className="p-3 text-right font-mono">{row.outstandingQty}</td>
                          <td className="p-3 text-right font-mono">{row.issuedQty}</td>
                          <td className="p-3 text-right">
                            <Input
                              type="number"
                              min="0"
                              max={remaining}
                              disabled={!canEditQty || busy === meta.jobCardId}
                              className="h-8 w-24 ml-auto"
                              value={quantities[row.lineId] ?? String(remaining)}
                              onChange={e => {
                                const next = Number(e.target.value)
                                const clamped = Number.isFinite(next) ? Math.min(Math.max(next, 0), remaining) : 0
                                setQuantities(prev => ({ ...prev, [row.lineId]: String(clamped) }))
                              }}
                            />
                          </td>
                          <td className="p-3 text-right">
                            <Input
                              type="number"
                              min="0"
                              className="h-8 w-20 ml-auto"
                              value={damaged[row.lineId] ?? '0'}
                              onChange={e => setDamaged(prev => ({ ...prev, [row.lineId]: e.target.value }))}
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )
        })
      ))}
    </div>
  )
}
