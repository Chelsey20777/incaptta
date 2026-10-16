'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { auth } from '@/lib/firebase'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

export interface InventoryReceiptRow {
  id: string
  itemName?: string
  sku?: string
  uom?: string
  quantity?: number
  reference?: string
  note?: string
  inventoryItemId?: string
  status?: string
  requestedAt?: string
  requestedBy?: { uid?: string; name?: string }
}

export default function PmoReceiptQueue({ canDecide }: { canDecide: boolean }) {
  const [receipts, setReceipts] = useState<InventoryReceiptRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')

  const load = useCallback(async () => {
    const token = await auth.currentUser?.getIdToken()
    if (!token) return
    const response = await fetch('/api/inventory/fulfilment/receipts', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.error || 'Could not load receipts')
    setReceipts(body.receipts || [])
  }, [])

  useEffect(() => {
    let active = true
    load()
      .catch(error => { if (active) toast.error(error.message) })
      .finally(() => { if (active) setLoading(false) })
    const refresh = () => { load().catch(error => toast.error(error.message)) }
    window.addEventListener('pmo-receipts-changed', refresh)
    return () => {
      active = false
      window.removeEventListener('pmo-receipts-changed', refresh)
    }
  }, [load])

  const decide = async (requestId: string, decision: 'APPROVE' | 'REJECT') => {
    setBusyId(requestId)
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
      toast.success(decision === 'APPROVE'
        ? (body.status === 'PENDING_FINAL'
          ? 'PMO approved. Stock stays the same until a manager or admin approves it.'
          : (body.idempotent
            ? 'This receipt was already in stock'
            : body.emailed
              ? `On hand is now ${body.qtyAfter}. The new inventory entry PDF was emailed.`
              : `On hand is now ${body.qtyAfter}. The PDF was not emailed.`))
        : 'Receipt rejected. Stock was not changed.')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Receipt decision failed')
    } finally {
      setBusyId('')
    }
  }

  const waiting = (status?: string) => status === 'PENDING_FINAL' || status === 'PENDING'
  const pending = receipts.filter(receipt => waiting(receipt.status))
  const recent = receipts.filter(receipt => !waiting(receipt.status)).slice(0, 8)
  if (loading) {
    return (
      <Card>
        <CardContent className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading warehouse receipts…
        </CardContent>
      </Card>
    )
  }
  if (pending.length === 0 && recent.length === 0) return null

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div>
          <div className="font-semibold">Warehouse receipts</div>
          <p className="text-xs text-muted-foreground">These receipts already have PMO approval. Stock increases only after a manager or admin approves them.</p>
        </div>
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">No receipts waiting for approval.</p>
        ) : (
          <div className="space-y-2">
            {pending.map(receipt => (
              <div key={receipt.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-3">
                <div className="text-sm">
                  <div className="font-medium">{receipt.itemName} · {receipt.quantity} {receipt.uom}</div>
                  <div className="text-xs text-muted-foreground">
                    {receipt.sku ? `${receipt.sku} · ` : ''}{receipt.reference}
                    {receipt.requestedBy?.name ? ` · ${receipt.requestedBy.name}` : ''}
                    {receipt.note ? ` · ${receipt.note}` : ''}
                  </div>
                </div>
                {canDecide ? (
                  <div className="flex gap-2">
                    <Button size="sm" disabled={busyId === receipt.id} onClick={() => decide(receipt.id, 'APPROVE')}>Approve</Button>
                    <Button size="sm" variant="outline" disabled={busyId === receipt.id} onClick={() => decide(receipt.id, 'REJECT')}>Reject</Button>
                  </div>
                ) : (
                  <Badge variant="outline">Waiting for approval</Badge>
                )}
              </div>
            ))}
          </div>
        )}
        {recent.length > 0 && (
          <div className="space-y-1 text-xs text-muted-foreground">
            {recent.map(receipt => (
              <div key={receipt.id}>{receipt.itemName} · {receipt.quantity} · {receipt.status}</div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
