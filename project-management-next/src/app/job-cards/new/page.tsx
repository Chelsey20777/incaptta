'use client'

import React, { useState, useMemo, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Save, Loader2, UserCheck, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useJobCardsStore } from '@/stores/job-cards-store'
import { useAdminStore } from '@/stores/admin-store'
import { useAuthStore } from '@/stores/auth-store'
import { useInventoryStore } from '@/stores/inventory-store'
import { db } from '@/lib/firebase'
import { collection, writeBatch, doc, serverTimestamp } from 'firebase/firestore'
import JobInformationCard from '@/features/jobCards/components/JobInformationCard'
import BomTemplateSelector from '@/features/jobCards/components/BomTemplateSelector'
import InventoryRequisitionGrid from '@/features/jobCards/components/InventoryRequisitionGrid'
import JobCardExpensesGrid from '@/features/jobCards/components/JobCardExpensesGrid'
import StaffRatesGrid from '@/features/jobCards/components/StaffRatesGrid'
import ReferrerCommissionSection from '@/features/jobCards/components/ReferrerCommissionSection'
import type { JobInfo, BomRequisitionSection, UnmatchedBomItem, Referrer, AdHocExpense, StaffRate, TotalsSummary } from '@/features/jobCards/types'
import { catalogueCostOf, stampMaterialLine } from '@/lib/crm/quotation-commercial'

export default function CreateJobCardPage() {
  const router = useRouter()
  const store = useJobCardsStore()
  const adminStore = useAdminStore()
  const authStore = useAuthStore()
  const inventoryStore = useInventoryStore()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isGeneratingNumber, setIsGeneratingNumber] = useState(false)
  const [generationFailed, setGenerationFailed] = useState(false)
  const [isSticky, setIsSticky] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const [jobInfo, setJobInfo] = useState<JobInfo>({
    jobCardTitle: '',
    projectDescription: '',
    requestingDepartmentId: '',
    jobCategoryId: '',
    jobNumber: '',
    projectLocation: '',
    dimensionsOfStructure: '',
    startDate: '',
    recipientName: '',
    customerId: '',
    recipientAddress: '',
    recipientPhone: '',
    linkedCrmId: '',
    linkedCrmType: '',
    linkedCrmNumber: '',
    linkedCrmTotal: 0,
  })

  const [inventoryItemsForTemplate, setInventoryItemsForTemplate] = useState<any[]>([])
  const [unmatchedBomItems, setUnmatchedBomItems] = useState<UnmatchedBomItem[]>([])
  const [requisitionItems, setRequisitionItems] = useState<BomRequisitionSection[]>([
    {
      id: crypto.randomUUID(),
      jobCategoryId: '',
      description: '',
      items: [],
    },
  ])
  const [requisitionExpenses, setRequisitionExpenses] = useState<AdHocExpense[]>([])
  const [staffRates, setStaffRates] = useState<StaffRate[]>([])
  const [referrers, setReferrers] = useState<Referrer[]>([])

  // Generate job number on mount
  useEffect(() => {
    adminStore.fetchAll()
    if (!jobInfo.jobNumber) {
      generateNumber()
    }
    inventoryStore.fetchItems({ isActive: true }).then(() => {
      setInventoryItemsForTemplate(inventoryStore.items)
    }).catch(() => {
      // non-critical
    })

    // Sticky Summary Observer
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry) {
          setIsSticky(!entry.isIntersecting)
        }
      },
      { threshold: 0 }
    )

    if (sentinelRef.current) observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [])

  const generateNumber = async () => {
    setIsGeneratingNumber(true)
    setGenerationFailed(false)
    try {
      const generated = await store.generateJobNumber()
      setJobInfo((prev) => ({ ...prev, jobNumber: generated }))
    } catch (err) {
      console.error('Failed to auto-generate job number:', err)
      setGenerationFailed(true)
      toast.error('Job Number Generation Failed', {
        description: 'Click Retry or enter a number manually.',
      })
    } finally {
      setIsGeneratingNumber(false)
    }
  }

  const handleTemplateApply = ({
    sections,
    mode,
  }: {
    sections: BomRequisitionSection[]
    mode: 'replace' | 'append'
  }) => {
    if (mode === 'replace') {
      setRequisitionItems(sections)
    } else {
      setRequisitionItems((prev) => [...prev, ...sections])
    }
  }

  const handleUnmatched = (items: UnmatchedBomItem[]) => {
    setUnmatchedBomItems(items)
  }

  // Summary Totals Calculations
  const totals = useMemo((): TotalsSummary => {
    const round2 = (v: number) => Number((v || 0).toFixed(2))
    const invSummary = (requisitionItems || []).reduce(
      (acc, section) => {
        const sectionSummary = (section.items || []).reduce(
          (sAcc: any, item: any) => {
            const qty = item.qtyRequired || 0
            const price = item.irdSellingPrice || 0
            const markup = item.markupPercent || 0

            const baseIRD = round2(qty * price)
            const twidMU = round2(baseIRD * (markup / 100))
            const totalInvoicePrice = round2(baseIRD + twidMU)

            return {
              totalIrdCost: sAcc.totalIrdCost + baseIRD,
              totalMarkup: sAcc.totalMarkup + twidMU,
              totalInvoiceable: sAcc.totalInvoiceable + totalInvoicePrice,
            }
          },
          { totalIrdCost: 0, totalMarkup: 0, totalInvoiceable: 0 }
        )

        return {
          totalIrdCost: acc.totalIrdCost + sectionSummary.totalIrdCost,
          totalMarkup: acc.totalMarkup + sectionSummary.totalMarkup,
          totalInvoiceable: acc.totalInvoiceable + sectionSummary.totalInvoiceable,
        }
      },
      { totalIrdCost: 0, totalMarkup: 0, totalInvoiceable: 0 }
    )

    const adhocTotal = requisitionExpenses.reduce((acc, exp) => {
      return acc + (exp.quantity || 0) * (exp.unitPrice || 0)
    }, 0)

    const staffRatesTotal = staffRates.reduce((acc, rate) => {
      return acc + (rate.jobRateAmount || 0)
    }, 0)

    const implementationCost = adhocTotal + staffRatesTotal

    const expByMethod = requisitionExpenses.reduce(
      (acc, exp) => {
        const amount = (exp.quantity || 0) * (exp.unitPrice || 0)
        if (exp.paymentMethod === 'CASH') acc.CASH += amount
        else if (exp.paymentMethod === 'ECOCASH') acc.ECOCASH += amount
        else if (exp.paymentMethod === 'BANK') acc.BANK += amount
        return acc
      },
      { CASH: 0, ECOCASH: 0, BANK: 0 }
    )

    return {
      inventoryIRDTotal: round2(invSummary.totalIrdCost),
      inventoryMUTotal: round2(invSummary.totalMarkup),
      inventoryGrandTotal: round2(invSummary.totalInvoiceable),
      adHocTotal: round2(adhocTotal),
      staffRatesTotal: round2(staffRatesTotal),
      subcontractWorksTotal: 0,
      implementationCost: round2(implementationCost),
      expensesByMethod: {
        CASH: round2(expByMethod.CASH),
        ECOCASH: round2(expByMethod.ECOCASH),
        BANK: round2(expByMethod.BANK),
      },
      overallGrandTotal: round2(invSummary.totalInvoiceable + implementationCost),
    }
  }, [requisitionItems, requisitionExpenses, staffRates])

  const vatEnabled = Boolean(adminStore.appSettings?.vatEnabled)
  const vatRate = vatEnabled ? Number(adminStore.appSettings?.vatRate || 0) : 0
  const vatAmount = Number((vatRate > 0 ? totals.overallGrandTotal * vatRate / 100 : 0).toFixed(2))
  const grandTotalWithVat = Number((totals.overallGrandTotal + vatAmount).toFixed(2))

  const totalCommission = useMemo(() => {
    return referrers.reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
  }, [referrers])

  const handleSubmit = async () => {
    if (isGeneratingNumber) {
      toast.error('Please Wait', { description: 'Generating job number...' })
      return
    }

    if (!jobInfo.jobNumber) {
      toast.error('Job Number Missing', {
        description: 'A job number is required. Please wait for generation or enter one manually.',
      })
      return
    }

    if (!jobInfo.jobCardTitle || !jobInfo.requestingDepartmentId || !jobInfo.jobCategoryId) {
      toast.error('Required Fields Missing', {
        description: 'Please fill in Title, Department, and Category.',
      })
      return
    }

    const processingToast = toast.loading('Creating Job Card...', {
      description: 'Starting atomic submission flow...',
    })
    setIsSubmitting(true)

    try {
      const batch = writeBatch(db)
      const jobCardRef = doc(collection(db, 'jobCards'))
      const jobId = jobCardRef.id

      // Build inventory cost map
      const inventoryMap: Record<string, number> = {}
      inventoryItemsForTemplate.forEach((item: any) => {
        inventoryMap[item.id] = catalogueCostOf(item)
      })

      const pricedLine = (item: any) => stampMaterialLine(
        item,
        item.inventoryItemId ? inventoryMap[item.inventoryItemId] : 0,
      )

      // 1. Prepare Main Doc
      batch.set(jobCardRef, {
        status: 'SUBMITTED',
        generalInfo: {
          jobTitle: jobInfo.jobCardTitle || 'Untitled',
          projectDescription: jobInfo.projectDescription || '',
          requestingDepartmentId: jobInfo.requestingDepartmentId || '',
          jobCategoryId: jobInfo.jobCategoryId || '',
          jobNumber: jobInfo.jobNumber || '',
          projectLocation: jobInfo.projectLocation || 'N/A',
          dimensionsOfStructure: jobInfo.dimensionsOfStructure || 'N/A',
          startDate: jobInfo.startDate || '',
          recipientName: jobInfo.recipientName || 'N/A',
          customerId: jobInfo.customerId || '',
          recipientAddress: jobInfo.recipientAddress || 'N/A',
          recipientPhone: jobInfo.recipientPhone || 'N/A',
          linkedCrmId: jobInfo.linkedCrmId || '',
          linkedCrmType: jobInfo.linkedCrmType || '',
          linkedCrmNumber: jobInfo.linkedCrmNumber || '',
          linkedCrmTotal: Number(jobInfo.linkedCrmTotal || 0),
          referrers: referrers.map((r) => ({
            id: r.id,
            name: r.name || '',
            amount: Number(r.amount) || 0,
            paymentMethod: r.paymentMethod || 'CASH',
            approvalStatus: 'PENDING',
            createdAt: r.createdAt || new Date().toISOString(),
          })),
        },
        submittedBy: {
          uid: authStore.user?.uid || 'unknown',
          email: authStore.user?.email || 'unknown',
          name: authStore.user?.displayName || 'Unknown User',
        },
        totals: {
          inventoryIRDTotal: Number(totals.inventoryIRDTotal || 0),
          inventoryMUTotal: Number(totals.inventoryMUTotal || 0),
          adHocTotal: Number(totals.adHocTotal || 0),
          staffRatesTotal: Number(totals.staffRatesTotal || 0),
          implementationCost: Number(totals.implementationCost || 0),
          grandTotal: Number(totals.overallGrandTotal || 0),
        },
        summary: {
          inventoryIRDTotal: Number(totals.inventoryIRDTotal || 0),
          inventoryMUTotal: Number(totals.inventoryMUTotal || 0),
          adHocTotal: Number(totals.adHocTotal || 0),
          staffRatesTotal: Number(totals.staffRatesTotal || 0),
          implementationCost: Number(totals.implementationCost || 0),
          grandTotal: Number(totals.overallGrandTotal || 0),
          expensesByMethod: totals.expensesByMethod || { CASH: 0, ECOCASH: 0, BANK: 0 },
          itemCount: Number(
            requisitionItems.reduce((sum, s) => sum + (s.items?.length || 0), 0) +
              (requisitionExpenses?.length || 0)
          ),
          lastUpdatedAt: serverTimestamp(),
        },
        requisitionSections: requisitionItems.map((section) => ({
          id: section.id || crypto.randomUUID(),
          jobCategoryId: section.jobCategoryId || '',
          description: section.description || '',
          items: (section.items || []).map((item: any) => {
            const priced = pricedLine(item)
            return {
              id: item.id || crypto.randomUUID(),
              itemName: item.itemName || 'Unnamed Item',
              description: item.description || '',
              inventoryItemId: item.inventoryItemId || '',
              qty: priced.qty,
              qtyRequired: priced.qtyRequired,
              irdSellingPrice: priced.irdSellingPrice,
              markupPercent: priced.markupPercent,
              twidMarkupPercent: priced.twidMarkupPercent,
              costSnapshot: priced.costSnapshot,
              rowIRDTot: priced.rowIRDTot,
              rowMUTot: priced.rowMUTot,
              rowGrandTot: priced.rowGrandTot,
              approvalStatus: 'PENDING',
            }
          }),
        })),
        requisitionItems: requisitionItems.flatMap((section) =>
          (section.items || []).map((item: any) => {
            const priced = pricedLine(item)
            return {
              id: item.id || crypto.randomUUID(),
              jobCategoryId: section.jobCategoryId || '',
              itemName: item.itemName || 'Unnamed Item',
              description: item.description || '',
              inventoryItemId: item.inventoryItemId || '',
              qty: priced.qty,
              qtyRequired: priced.qtyRequired,
              irdSellingPrice: priced.irdSellingPrice,
              markupPercent: priced.markupPercent,
              twidMarkupPercent: priced.twidMarkupPercent,
              costSnapshot: priced.costSnapshot,
              rowIRDTot: priced.rowIRDTot,
              rowMUTot: priced.rowMUTot,
              rowGrandTot: priced.rowGrandTot,
              approvalStatus: 'PENDING',
            }
          })
        ),
        adHocExpenses: requisitionExpenses.map((exp) => ({
          id: exp.id || crypto.randomUUID(),
          description: exp.description || 'No Description',
          recipientName: exp.recipientName || '',
          recipientPhone: exp.recipientPhone || '',
          quantity: Number(exp.quantity || 0),
          unitPrice: Number(exp.unitPrice || 0),
          paymentMethod: exp.paymentMethod || '',
          paymentRef: exp.paymentRef || '',
          totalAmount: Number((exp.quantity || 0) * (exp.unitPrice || 0)),
          attachmentUrl: exp.attachmentUrl || null,
          attachmentUrls: exp.attachmentUrls || (exp.attachmentUrl ? [exp.attachmentUrl] : []),
          approvalStatus: 'PENDING',
          createdAt: exp.createdAt || new Date().toISOString(),
        })),
        subcontractWorks: [],
        staffRates: staffRates.map((rate) => ({
          id: rate.id || crypto.randomUUID(),
          employeeId: rate.employeeId || '',
          employeeName: rate.employeeName || '',
          jobRateAmount: Number(rate.jobRateAmount || 0),
          paymentMethod: 'SALARIES',
          approvalStatus: rate.approvalStatus || 'PENDING',
          createdAt: new Date().toISOString(),
        })),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })

      // 2. Save items to subcollection
      const flattenedItems = requisitionItems.flatMap((section) =>
        (section.items || []).map((item: any) => ({ ...item, jobCategoryId: section.jobCategoryId }))
      )
      if (flattenedItems.length > 0) {
        flattenedItems.forEach((item: any) => {
          const itemRef = doc(collection(db, 'jobCards', jobId, 'items'))
          const priced = pricedLine(item)
          batch.set(itemRef, {
            jobCategoryId: item.jobCategoryId || '',
            itemName: item.itemName || 'Unnamed Item',
            description: item.description || '',
            qty: priced.qty,
            qtyRequired: priced.qtyRequired,
            irdSellingPrice: priced.irdSellingPrice,
            markupPercent: priced.markupPercent,
            twidMarkupPercent: priced.twidMarkupPercent,
            costSnapshot: priced.costSnapshot,
            rowIRDTot: priced.rowIRDTot,
            rowMUTot: priced.rowMUTot,
            rowGrandTot: priced.rowGrandTot,
            approvalStatus: 'PENDING',
            updatedAt: serverTimestamp(),
          })
        })
      }

      // 3. Save expenses to subcollection
      if (requisitionExpenses.length > 0) {
        requisitionExpenses.forEach((exp) => {
          const expRef = doc(collection(db, 'jobCards', jobId, 'expenses'))
          const totalAmount = (exp.quantity || 0) * (exp.unitPrice || 0)

          batch.set(expRef, {
            description: exp.description || 'No Description',
            quantity: Number(exp.quantity || 0),
            unitPrice: Number(exp.unitPrice || 0),
            paymentMethod: exp.paymentMethod || '',
            paymentRef: exp.paymentRef || '',
            totalAmount: Number(totalAmount),
            approvalStatus: 'PENDING',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        })
      }

      // 4. Commit all at once
      await batch.commit()

      toast.dismiss(processingToast)
      toast.success('Job Card Created', {
        description: `Job Card for ${jobInfo.jobCardTitle} has been submitted.`,
      })
      router.push(`/job-cards/${jobId}`)
    } catch (err: any) {
      toast.dismiss(processingToast)
      console.error('CRITICAL: Failed to create job card:', err)

      let errorMsg = err.message || 'Unknown Firestore Error'
      if (err.code === 'permission-denied')
        errorMsg = 'Permission Denied: You do not have access to create job cards.'

      toast.error('Submission Failed', {
        description: errorMsg,
        duration: 6000,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const formatCurrency = (val: number) =>
    `$${val.toLocaleString(undefined, { minimumFractionDigits: 2 })}`

  return (
    <div className="w-full space-y-8 pb-12 px-4 md:px-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="size-4" />
          </Button>
          <h2 className="text-3xl font-bold tracking-tight">Create Job Card</h2>
        </div>
      </div>

      {/* Sentinel for sticky observer */}
      <div ref={sentinelRef} />

      {/* Job Information Section */}
      <JobInformationCard
        modelValue={jobInfo}
        isGenerating={isGeneratingNumber}
        generationFailed={generationFailed}
        onUpdate={setJobInfo}
        onRetryJobNumber={generateNumber}
      />

      {/* BOM Template Auto-Population */}
      <BomTemplateSelector
        structureSize={jobInfo.dimensionsOfStructure}
        inventoryItems={inventoryItemsForTemplate}
        jobCategories={adminStore.jobCategories}
        onApply={handleTemplateApply}
        onUnmatched={handleUnmatched}
      />

      {/* Unmatched Items Warning */}
      {unmatchedBomItems.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
            {unmatchedBomItems.length} template item(s) could not be matched to inventory and have
            been added without pricing. Please select them manually in the grid below.
          </p>
          <ul className="mt-2 list-disc list-inside text-xs text-amber-600 dark:text-amber-300 space-y-0.5">
            {unmatchedBomItems.map((item) => (
              <li key={item.templateName}>
                {item.templateName} &mdash; Qty: {item.qty}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Inventory Requisition Section */}
      <div className="space-y-4">
        <h3 className="text-xl font-semibold">Inventory Requisition</h3>
        <InventoryRequisitionGrid
          modelValue={requisitionItems}
          generalInfo={jobInfo}
          onUpdate={setRequisitionItems}
        />
      </div>

      {/* Ad-hoc Expenses Section */}
      <div className="space-y-4">
        <div className="flex flex-col">
          <h3 className="text-xl font-semibold">Job Card Expenses (Ad-hoc)</h3>
          <p className="text-sm text-muted-foreground">
            Add miscellaneous items (e.g., lunch money, airtime, food) that are not in inventory.
          </p>
        </div>
        <JobCardExpensesGrid
          modelValue={requisitionExpenses}
          generalInfo={jobInfo}
          onUpdate={setRequisitionExpenses}
        />
      </div>

      {/* Staff Rates Section */}
      <div className="space-y-4">
        <div className="flex flex-col">
          <h3 className="text-xl font-semibold">Staff Rates</h3>
          <p className="text-sm text-muted-foreground">
            Assign job-specific earnings to staff members. These will be automatically added to
            their payslip upon job approval.
          </p>
        </div>
        <StaffRatesGrid
          modelValue={staffRates}
          generalInfo={jobInfo}
          isAdmin={false}
          onUpdate={setStaffRates}
        />
      </div>

      {/* Job Referral & Commission Section */}
      <ReferrerCommissionSection
        referrers={referrers}
        onUpdate={setReferrers}
        totalCommission={totalCommission}
      />

      {/* Final Summary Area */}
      <div className="mt-8 space-y-6">
        <Card className="bg-muted/5 border-muted/60">
          <CardHeader className="pb-3 border-b bg-muted/10">
            <CardTitle className="text-sm font-bold uppercase text-muted-foreground tracking-wider">
              Overall Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 p-6">
            {/* Inventory Section */}
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase text-muted-foreground/60 mb-2">
                Inventory Breakdown
              </p>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">IRD Selling Price</span>
                <span className="font-medium">{formatCurrency(totals.inventoryIRDTotal)}</span>
              </div>
              <div className="flex justify-between text-sm text-primary">
                <span className="text-primary font-bold">IMP Cost</span>
                <span className="font-bold">{formatCurrency(totals.implementationCost)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold pt-1 border-t mt-1">
                <span>Subtotal</span>
                <span>{formatCurrency(totals.inventoryGrandTotal)}</span>
              </div>
            </div>

            {/* Implementation Cost Section */}
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase text-muted-foreground/60 mb-2">
                Implementation Cost
              </p>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Ad-hoc Expenses</span>
                <span className="font-medium text-orange-600">
                  {formatCurrency(totals.adHocTotal)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Staff Rates</span>
                <span className="font-medium text-blue-600">
                  {formatCurrency(totals.staffRatesTotal)}
                </span>
              </div>
              <div className="flex justify-between text-sm text-primary font-bold pt-1 border-t mt-1">
                <span>Total Implementation</span>
                <span>{formatCurrency(totals.implementationCost)}</span>
              </div>
              {totals.expensesByMethod.CASH > 0 && (
                <div className="flex justify-between text-xs text-muted-foreground pl-2">
                  <span>&bull; Cash</span>
                  <span>{formatCurrency(totals.expensesByMethod.CASH)}</span>
                </div>
              )}
              {totals.expensesByMethod.ECOCASH > 0 && (
                <div className="flex justify-between text-xs text-muted-foreground pl-2">
                  <span>&bull; EcoCash</span>
                  <span>{formatCurrency(totals.expensesByMethod.ECOCASH)}</span>
                </div>
              )}
              {totals.expensesByMethod.BANK > 0 && (
                <div className="flex justify-between text-xs text-muted-foreground pl-2">
                  <span>&bull; Bank</span>
                  <span>{formatCurrency(totals.expensesByMethod.BANK)}</span>
                </div>
              )}
            </div>

            {/* Spacer */}
            <div className="hidden lg:block"></div>

            {/* Grand Total Section */}
            <div className="flex flex-col justify-end items-end space-y-2 border-l pl-8 border-primary/20">
              <p className="text-[11px] font-black uppercase text-primary/40 tracking-widest">
                Job Invoice Total
              </p>
              {vatAmount > 0 && (
                <div className="w-full space-y-1 text-sm text-right mb-1">
                  <div className="flex justify-between gap-6 text-muted-foreground">
                    <span>Subtotal</span>
                    <span className="font-medium tabular-nums">
                      {formatCurrency(totals.overallGrandTotal)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-6 text-muted-foreground">
                    <span>VAT ({vatRate}%)</span>
                    <span className="font-medium tabular-nums">
                      +{formatCurrency(vatAmount)}
                    </span>
                  </div>
                </div>
              )}
              <div className="text-5xl font-black text-primary tracking-tighter drop-shadow-sm">
                {formatCurrency(grandTotalWithVat)}
              </div>
              <p className="text-[9px] text-muted-foreground uppercase font-medium italic">
                {vatAmount > 0
                  ? `Incl. VAT (${vatRate}%) &middot; Inventory Only`
                  : 'Inventory Items Only'}
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button
            variant="outline"
            size="lg"
            onClick={() => router.back()}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            size="lg"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-8 shadow-lg"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-5 w-5" />
                Create Job Card
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
