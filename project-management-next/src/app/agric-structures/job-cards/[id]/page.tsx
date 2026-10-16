'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { db } from '@/lib/firebase'
import { doc, getDoc } from 'firebase/firestore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ArrowLeft,
  Save,
  Loader2,
  Building2,
  Ruler,
  Calculator,
  DollarSign,
  Banknote,
  FileText,
  ExternalLink,
  Trash,
  Plus,
  Pencil,
  CheckCircle2,
} from 'lucide-react'
import { useAgricStructuresStore } from '@/stores/agric-structures-store'
import type { AgricJobCard, RequisitionItem } from '@/features/agric-structures/types'
import { generateAgfPdf } from '@/features/agric-structures/utils/generate-agf-pdf'
import { numberToWords } from '@/features/agric-structures/utils/numberToWords'
import { toast } from 'sonner'

const PAYMENT_METHODS = ['CASH', 'BANK', 'ECOCASH'] as const
const ITEM_CATEGORIES = ['material', 'labour', 'transport'] as const

export default function AgricJobCardDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const {
    jobCards,
    isProcessing,
    fetchJobCards,
    updateJobCard,
    deleteJobCard,
    collectPayment,
    cloneToSystemJobCard,
    cleanup,
  } = useAgricStructuresStore()

  const [jobCard, setJobCard] = useState<AgricJobCard | null>(null)
  const [loading, setLoading] = useState(true)

  // Edit mode
  const [editMode, setEditMode] = useState(false)
  const [editClientName, setEditClientName] = useState('')
  const [editSiteLocation, setEditSiteLocation] = useState('')
  const [editItems, setEditItems] = useState<RequisitionItem[]>([])

  // Payment dialog
  const [showPaymentDialog, setShowPaymentDialog] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'BANK' | 'ECOCASH'>('CASH')
  const [paymentNotes, setPaymentNotes] = useState('')

  // Export PDF
  const [exporting, setExporting] = useState(false)

  // Creator name resolution
  const [creatorName, setCreatorName] = useState('Authorized Signatory')

  useEffect(() => {
    const unsub = fetchJobCards()
    return () => {
      unsub()
      cleanup()
    }
  }, [])

  useEffect(() => {
    if (jobCard?.createdBy?.uid) {
      const userRef = doc(db, 'users', jobCard.createdBy.uid)
      getDoc(userRef)
        .then((snap) => {
          if (snap.exists()) {
            setCreatorName(
              snap.data()?.displayName || snap.data()?.email || jobCard.createdBy.name || 'Authorized Signatory'
            )
          } else {
            setCreatorName(jobCard.createdBy.name || 'Authorized Signatory')
          }
        })
        .catch(() => {
          setCreatorName(jobCard.createdBy.name || 'Authorized Signatory')
        })
    } else if (jobCard?.createdBy?.name) {
      setCreatorName(jobCard.createdBy.name)
    }
  }, [jobCard])

  useEffect(() => {
    const found = jobCards.find((j) => j.id === id)
    if (found) {
      setJobCard(found)
      setEditClientName(found.clientName || '')
      setEditSiteLocation(found.siteLocation || '')
      setEditItems(
        (found.requisitionItems || []).map((item) => ({ ...item }))
      )
    }
    setLoading(jobCards.length === 0)
  }, [jobCards, id])

  const totals = useMemo(() => {
    const items = editItems.length > 0 ? editItems : jobCard?.requisitionItems || []
    const materialsTotal = items
      .filter((i) => i.category === 'material')
      .reduce((s, i) => s + (i.rowGrandTot || 0), 0)
    const labourTotal = items
      .filter((i) => i.category === 'labour')
      .reduce((s, i) => s + (i.rowGrandTot || 0), 0)
    const transportTotal = items
      .filter((i) => i.category === 'transport')
      .reduce((s, i) => s + (i.rowGrandTot || 0), 0)
    const grandTotal = materialsTotal + labourTotal + transportTotal
    return { materialsTotal, labourTotal, transportTotal, grandTotal }
  }, [editItems, jobCard])

  const handleSaveEdit = async () => {
    if (!jobCard) return
    try {
      await updateJobCard(jobCard.id, {
        clientName: editClientName,
        siteLocation: editSiteLocation,
        requisitionItems: editItems,
        requisitionSections: [
          {
            id: crypto.randomUUID(),
            description: 'Structural Materials & Labour',
            qty: 1,
            items: editItems,
          },
        ],
        totalAmount: totals.grandTotal,
        balance: totals.grandTotal - (jobCard.paidAmount || 0),
      })
      setEditMode(false)
    } catch {
      // handled in store
    }
  }

  const handleAddLine = () => {
    const newItem: RequisitionItem = {
      id: crypto.randomUUID(),
      description: '',
      itemName: '',
      qty: 0,
      uom: 'PCS',
      irdSellingPrice: 0,
      rowGrandTot: 0,
      category: 'material',
    }
    setEditItems((prev) => [...prev, newItem])
  }

  const handleRemoveLine = (itemId: string) => {
    setEditItems((prev) => prev.filter((i) => i.id !== itemId))
  }

  const handleUpdateLine = (itemId: string, field: string, value: any) => {
    setEditItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item
        const updated = { ...item, [field]: value }
        if (field === 'qty' || field === 'irdSellingPrice') {
          updated.rowGrandTot =
            (updated.qty || 0) * (updated.irdSellingPrice || 0)
        }
        return updated
      })
    )
  }

  const handleCollectPayment = async () => {
    if (!jobCard) return
    if (paymentAmount <= 0) {
      toast.error('Enter a valid payment amount')
      return
    }
    try {
      await collectPayment(
        jobCard,
        paymentAmount,
        paymentMethod,
        paymentNotes
      )
      setShowPaymentDialog(false)
      setPaymentAmount(0)
      setPaymentNotes('')
    } catch {
      // handled in store
    }
  }

  const handleClone = async () => {
    if (!jobCard) return
    try {
      const sysId = await cloneToSystemJobCard(jobCard)
      toast.success(
        'System job card created. Open it?',
        {
          action: {
            label: 'Open',
            onClick: () => router.push(`/job-cards/${sysId}`),
          },
        }
      )
    } catch {
      // handled in store
    }
  }

  const handleExportPdf = async () => {
    if (!jobCard) return
    setExporting(true)
    try {
      await generateAgfPdf(jobCard, undefined, undefined, creatorName)
      toast.success('PDF exported')
    } catch (err: any) {
      toast.error(err.message || 'PDF export failed')
    } finally {
      setExporting(false)
    }
  }

  const handleDelete = async () => {
    if (!jobCard) return
    if (!confirm('Delete this quote? This cannot be undone.')) return
    try {
      await deleteJobCard(jobCard.id)
      router.push('/agric-structures/job-cards')
    } catch {
      // handled in store
    }
  }

  const statusBadge = (status: string) => {
    const v: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> =
      {
        DRAFT: 'secondary',
        APPROVED: 'default',
        PAID: 'outline',
        COMPLETED: 'outline',
        CANCELLED: 'destructive',
      }
    return <Badge variant={v[status] || 'secondary'}>{status}</Badge>
  }

  const isDraft = jobCard?.status === 'DRAFT'
  const items = editMode ? editItems : jobCard?.requisitionItems || []

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!jobCard) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Job card not found
        <div className="mt-4">
          <Link href="/agric-structures/job-cards">
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Job Cards
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-4">
          <Link href="/agric-structures/job-cards">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              {jobCard.jobNumber}
            </h2>
            <p className="text-muted-foreground">
              {jobCard.clientName || 'No client'} — {statusBadge(jobCard.status)}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {isDraft && (
            <>
              <Button
                variant={editMode ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  if (editMode) {
                    handleSaveEdit()
                  } else {
                    setEditMode(true)
                  }
                }}
                disabled={isProcessing}
              >
                {editMode ? (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Quote
                  </>
                ) : (
                  <>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit Quote
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    await updateJobCard(jobCard.id, { status: 'APPROVED' })
                  } catch (err) {
                    console.error(err)
                  }
                }}
                disabled={isProcessing}
                className="bg-brand-primary hover:bg-brand-primary/95 text-white border-none font-bold"
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Approve Job
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-red-500"
                onClick={handleDelete}
                disabled={isProcessing}
              >
                <Trash className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPaymentDialog(true)}
          >
            <Banknote className="mr-2 h-4 w-4" />
            Post Payment
          </Button>

          {jobCard.linkedSystemJobCardId ? (
            <Link href={`/job-cards/${jobCard.linkedSystemJobCardId}`}>
              <Button
                variant="outline"
                size="sm"
                className="border-green-600 text-green-700 hover:bg-green-50 font-bold"
              >
                <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />
                View System JC
              </Button>
            </Link>
          ) : (
            !isDraft && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleClone}
                disabled={isProcessing}
                className="bg-green-600 hover:bg-green-700 text-white border-none font-bold"
              >
                <Plus className="mr-2 h-4 w-4" />
                Create System JC
              </Button>
            )
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportPdf}
            disabled={exporting}
          >
            {exporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileText className="mr-2 h-4 w-4" />
            )}
            Export PDF
          </Button>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Quote Number</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold font-mono">{jobCard.jobNumber}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Client</CardTitle>
          </CardHeader>
          <CardContent>
            {editMode ? (
              <Input
                value={editClientName}
                onChange={(e) => setEditClientName(e.target.value)}
                className="h-8 text-sm"
              />
            ) : (
              <div className="text-lg font-medium truncate">
                {jobCard.clientName || '—'}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Site Location</CardTitle>
          </CardHeader>
          <CardContent>
            {editMode ? (
              <Input
                value={editSiteLocation}
                onChange={(e) => setEditSiteLocation(e.target.value)}
                className="h-8 text-sm"
              />
            ) : (
              <div className="text-lg font-medium truncate">
                {jobCard.siteLocation || '—'}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Structure Size</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-medium">
              {jobCard.fowlrunMeta?.size?.label ||
                jobCard.generalInfo?.dimensionsOfStructure ||
                '—'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Specifications */}
      {jobCard.fowlrunMeta && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Ruler className="h-5 w-5" />
              Specifications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">Area</p>
                <p className="text-lg font-bold">{jobCard.fowlrunMeta.area} m²</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">Perimeter</p>
                <p className="text-lg font-bold">
                  {jobCard.fowlrunMeta.perimeter} m
                </p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">Wall Area</p>
                <p className="text-lg font-bold">
                  {jobCard.fowlrunMeta.wallArea} m²
                </p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">Bays</p>
                <p className="text-lg font-bold">{jobCard.fowlrunMeta.bays}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">Bird Capacity</p>
                <p className="text-lg font-bold">
                  {jobCard.fowlrunMeta.birdCapacityMin} –{' '}
                  {jobCard.fowlrunMeta.birdCapacityMax}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Financial Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total Contract</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              ${(jobCard.totalAmount || 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Paid</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              ${(jobCard.paidAmount || 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              ${(jobCard.balance || 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* BOQ Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Bill of Quantities ({items.length} items)
          </CardTitle>
          {editMode && (
            <Button variant="outline" size="sm" onClick={handleAddLine}>
              <Plus className="mr-1 h-4 w-4" />
              Add Line
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium text-sm">Description</th>
                  <th className="text-center p-3 font-medium text-sm w-[70px]">
                    Qty
                  </th>
                  <th className="text-center p-3 font-medium text-sm w-[60px]">
                    Unit
                  </th>
                  <th className="text-center p-3 font-medium text-sm w-[80px]">Category</th>
                  <th className="text-right p-3 font-medium text-sm w-[90px]">
                    Unit Price
                  </th>
                  <th className="text-right p-3 font-medium text-sm w-[100px]">
                    Total
                  </th>
                  {editMode && (
                    <th className="text-center p-3 font-medium text-sm w-[60px]">
                      Del
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={editMode ? 7 : 6}
                      className="text-center p-8 text-muted-foreground"
                    >
                      No BOQ items
                    </td>
                  </tr>
                ) : (
                  items.map((item, i) => (
                    <tr key={item.id || i} className="border-b hover:bg-muted/30">
                      <td className="p-2">
                        {editMode ? (
                          <Input
                            value={item.description || item.itemName || ''}
                            onChange={(e) =>
                              handleUpdateLine(
                                item.id,
                                'description',
                                e.target.value
                              )
                            }
                            className="h-7 text-xs"
                          />
                        ) : (
                          <span className="text-sm">
                            {item.description || item.itemName}
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-center">
                        {editMode ? (
                          <Input
                            type="number"
                            value={item.qty || 0}
                            onChange={(e) =>
                              handleUpdateLine(
                                item.id,
                                'qty',
                                Number(e.target.value) || 0
                              )
                            }
                            className="h-7 text-xs text-center"
                          />
                        ) : (
                          <span className="text-sm font-mono">{item.qty}</span>
                        )}
                      </td>
                      <td className="p-2 text-center">
                        {editMode ? (
                          <Input
                            value={item.uom || ''}
                            onChange={(e) =>
                              handleUpdateLine(item.id, 'uom', e.target.value)
                            }
                            className="h-7 text-xs text-center"
                          />
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            {item.uom}
                          </span>
                        )}
                      </td>
                      <td className="p-1 text-center">
                        {editMode ? (
                          <Select
                            value={item.category || 'material'}
                            onValueChange={(v) =>
                              handleUpdateLine(item.id, 'category', v)
                            }
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ITEM_CATEGORIES.map((cat) => (
                                <SelectItem key={cat} value={cat}>
                                  {cat}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1 py-0"
                          >
                            {item.category}
                          </Badge>
                        )}
                      </td>
                      <td className="p-2 text-right">
                        {editMode ? (
                          <Input
                            type="number"
                            step="0.01"
                            value={item.irdSellingPrice || 0}
                            onChange={(e) =>
                              handleUpdateLine(
                                item.id,
                                'irdSellingPrice',
                                Number(e.target.value) || 0
                              )
                            }
                            className="h-7 text-xs text-right"
                          />
                        ) : (
                          <span className="text-sm font-mono">
                            ${(item.irdSellingPrice || 0).toFixed(2)}
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-right">
                        <span className="text-sm font-mono font-medium">
                          ${(item.rowGrandTot || 0).toFixed(2)}
                        </span>
                      </td>
                      {editMode && (
                        <td className="p-2 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-1 text-red-500"
                            onClick={() => handleRemoveLine(item.id)}
                          >
                            <Trash className="h-3 w-3" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 bg-muted/20">
                  <td
                    colSpan={editMode ? 4 : 4}
                    className="p-3 text-sm font-medium text-right"
                  >
                    Materials
                  </td>
                  <td className="p-3 text-sm font-mono font-bold text-right">
                    ${totals.materialsTotal.toFixed(2)}
                  </td>
                  <td colSpan={editMode ? 1 : 0}></td>
                </tr>
                <tr className="bg-muted/10">
                  <td
                    colSpan={editMode ? 4 : 4}
                    className="p-3 text-sm font-medium text-right"
                  >
                    Labour
                  </td>
                  <td className="p-3 text-sm font-mono text-right">
                    ${totals.labourTotal.toFixed(2)}
                  </td>
                  <td colSpan={editMode ? 1 : 0}></td>
                </tr>
                <tr className="bg-muted/10">
                  <td
                    colSpan={editMode ? 4 : 4}
                    className="p-3 text-sm font-medium text-right"
                  >
                    Transport
                  </td>
                  <td className="p-3 text-sm font-mono text-right">
                    ${totals.transportTotal.toFixed(2)}
                  </td>
                  <td colSpan={editMode ? 1 : 0}></td>
                </tr>
                <tr className="border-t-2 bg-primary/5">
                  <td
                    colSpan={editMode ? 4 : 4}
                    className="p-3 text-base font-bold text-right text-primary"
                  >
                    Grand Total
                  </td>
                  <td className="p-3 text-base font-mono font-bold text-right text-primary">
                    ${totals.grandTotal.toLocaleString()}
                  </td>
                  <td colSpan={editMode ? 1 : 0}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Amount in Words */}
      <Card>
        <CardContent className="py-3">
          <p className="text-sm text-muted-foreground italic">
            Amount in words: <strong>{numberToWords(totals.grandTotal)}</strong>
          </p>
        </CardContent>
      </Card>

      {/* Linked System Job Card */}
      {jobCard.linkedSystemJobCardId && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Linked System Job Card</CardTitle>
          </CardHeader>
          <CardContent>
            <Link
              href={`/job-cards/${jobCard.linkedSystemJobCardId}`}
              className="text-primary hover:underline flex items-center gap-2"
            >
              {jobCard.linkedSystemJobCardNumber}{' '}
              <ExternalLink className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Payment Dialog */}
      {showPaymentDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Post Payment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Balance: <strong>${(jobCard.balance || 0).toFixed(2)}</strong>
              </p>
              <div className="space-y-2">
                <Label>Amount ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={paymentAmount || ''}
                  onChange={(e) => setPaymentAmount(Number(e.target.value))}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Payment Method</Label>
                <Select
                  value={paymentMethod}
                  onValueChange={(v) =>
                    setPaymentMethod(v as 'CASH' | 'BANK' | 'ECOCASH')
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <Textarea
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="e.g. Cheque #1234"
                  rows={2}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setShowPaymentDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCollectPayment}
                  disabled={isProcessing || paymentAmount <= 0}
                >
                  {isProcessing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Record Payment
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}