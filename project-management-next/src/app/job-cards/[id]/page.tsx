'use client'

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Save,
  Loader2,
  FileText,
  ClipboardList,
  Receipt,
  Trash2,
  Ban,
  CheckCircle,
  XCircle,
  Send,
  FileDown,
  AlertTriangle,
  Play,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { formatCurrency, formatDate } from '@/lib/format'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { db } from '@/lib/firebase'
import { doc, getDoc, onSnapshot, serverTimestamp, collection, query, where, updateDoc } from 'firebase/firestore'
import { useJobCardsStore } from '@/stores/job-cards-store'
import { useAdminStore } from '@/stores/admin-store'
import { useAuthStore } from '@/stores/auth-store'
import { usePermissionsStore } from '@/stores/permissions-store'
import { isFinanceLedgerLoaded, useFinanceStore } from '@/stores/finance-store'
import { useCrmStore, isSequentialInvoiceNumber } from '@/stores/crm-store'
import { resolvePdfSigner } from '@/lib/resolve-pdf-signer'
import { FileViewerModal } from '@/components/ui/file-viewer-modal'
import { Separator } from '@/components/ui/separator'
import {
  Wrench,
  TrendingUp,
  Plus,
  Eye,
  Download,
  UserCheck,
  HardHat,
  Users,
} from 'lucide-react'
import {
  generateApprovedRequisitionPdf,
  generateApprovedExpensesPdf,
  generateFullJobCardPdf,
  generatePaymentReceiptPdf,
} from '@/features/jobCards/utils/generatePdf'
import { generatePerformanceReportPdf } from '@/features/jobCards/utils/generatePerformanceReportPdf'
import { generateCrmPdf } from '@/features/crm/utils/generateCrmPdf'
import { hydrateInvoiceFromQuote } from '@/features/crm/utils/hydrateInvoiceFromQuote'
import { resolveStaffName } from '@/lib/person-name'
import JobInformationCard from '@/features/jobCards/components/JobInformationCard'
import InventoryRequisitionGrid from '@/features/jobCards/components/InventoryRequisitionGrid'
import JobCardExpensesGrid from '@/features/jobCards/components/JobCardExpensesGrid'
import JobCardSubcontractWorksGrid from '@/features/jobCards/components/JobCardSubcontractWorksGrid'
import StaffRatesGrid from '@/features/jobCards/components/StaffRatesGrid'
import ReferrerCommissionSection from '@/features/jobCards/components/ReferrerCommissionSection'
import AllocatedToolsGrid from '@/features/jobCards/components/AllocatedToolsGrid'
import { computeFinancials, resolveAgreedInvoice } from '@/lib/financial-engine'
import { catalogueCostOf, stampRequisitionSections } from '@/lib/crm/quotation-commercial'
import { useInventoryStore } from '@/stores/inventory-store'
import type { FinancialSummary } from '@/lib/financial-engine'
import FinancialPerformancePanel from '@/features/jobCards/components/FinancialPerformancePanel'
import type {
  JobInfo,
  BomRequisitionSection,
  AdHocExpense,
  StaffRate,
  Referrer,
  TotalsSummary,
  SubcontractWork,
} from '@/features/jobCards/types'
import { jobStatusLabel } from '@/lib/jobs/stages'
import { canCloseJob, canCompleteJob, canMarkReady, canSubmitJob } from '@/lib/jobs/checklists'
import JobOpsChecklist from '@/features/jobCards/components/JobOpsChecklist'
import CostStatusPanel from '@/features/jobCards/components/CostStatusPanel'
import { accrualPayrollEnabled } from '@/lib/payroll/client'

const STAFF_EARNING_PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/
function isValidStaffEarningPeriod(period?: string) {
  return STAFF_EARNING_PERIOD_RE.test(period || '')
}

// ─── Status Badge Config ─────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  DRAFT: { label: 'Draft', variant: 'secondary' },
  SUBMITTED: { label: 'Submitted', variant: 'outline' },
  APPROVAL_PENDING_ACCOUNTANT: { label: 'Pending Accountant', variant: 'secondary' },
  APPROVED_ACCOUNTANT: { label: 'Approved by Accountant', variant: 'default' },
  APPROVAL_PENDING_MANAGER: { label: 'Pending Manager', variant: 'secondary' },
  APPROVED_MANAGER: { label: 'Approved', variant: 'default' },
  COMPLETED: { label: 'Work Completed', variant: 'default' },
  CLOSED: { label: 'Closed', variant: 'outline' },
  REJECTED: { label: 'Rejected', variant: 'destructive' },
  CANCELLED: { label: 'Cancelled', variant: 'destructive' },
}

// ─── Page Component ──────────────────────────────────────────────────────────
export default function JobCardDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const store = useJobCardsStore()
  const inventoryItems = useInventoryStore(state => state.items)
  const adminStore = useAdminStore()
  const authStore = useAuthStore()
  const { canAccessModule } = usePermissionsStore()
  const financeStore = useFinanceStore()
  const crmStore = useCrmStore()
  const financeBalancesLoaded = isFinanceLedgerLoaded(financeStore)

  // ─── Data state ──────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string>('DRAFT')
  const [workStartedAt, setWorkStartedAt] = useState<string>('')
  const [readyToStartAt, setReadyToStartAt] = useState<string>('')
  const [jobChecklists, setJobChecklists] = useState<Record<string, boolean>>({})
  const [activeTab, setActiveTab] = useState('overview')
  const [editingOverview, setEditingOverview] = useState(false)

  // Job Info
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

  // Requisition sections & items
  const [requisitionItems, setRequisitionItems] = useState<BomRequisitionSection[]>([])
  const [requisitionExpenses, setRequisitionExpenses] = useState<AdHocExpense[]>([])
  const [subcontractWorks, setSubcontractWorks] = useState<SubcontractWork[]>([])
  const [otherServices, setOtherServices] = useState<Array<{ qty?: number; price?: number; total?: number }>>([])
  const [staffRates, setStaffRates] = useState<StaffRate[]>([])
  const [referrers, setReferrers] = useState<Referrer[]>([])

  useEffect(() => {
    void useInventoryStore.getState().fetchItems({ isActive: true })
  }, [])

  useEffect(() => {
    if (!inventoryItems.length || !requisitionItems.length) return
    const costById: Record<string, number> = {}
    for (const item of inventoryItems) {
      if (item.id) costById[item.id] = catalogueCostOf(item)
    }
    const needsCost = requisitionItems.some(section =>
      (section.items || []).some(item =>
        (Number(item.costSnapshot) || 0) <= 0
        && !!item.inventoryItemId
        && (costById[item.inventoryItemId] || 0) > 0,
      ),
    )
    if (!needsCost) return
    setRequisitionItems(stampRequisitionSections(requisitionItems, costById) as BomRequisitionSection[])
  }, [inventoryItems, requisitionItems])

  // Rejection dialog
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [rejecting, setRejecting] = useState(false)

  // Cancel dialog
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  // PDF locking state
  const [isLocking, setIsLocking] = useState(false)

  // Delete dialog
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [isExportingPdf, setIsExportingPdf] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  // Tools & Billing tracking states
  const [recordedPayments, setRecordedPayments] = useState<any[]>([])
  const [invoicePayments, setInvoicePayments] = useState<any[]>([])
  const [allocatedTools, setAllocatedTools] = useState<any[]>([])
  const [approvalTimeline, setApprovalTimeline] = useState<any[]>([])
  const [creatorName, setCreatorName] = useState('Unknown User')
  const [creatorUid, setCreatorUid] = useState<string | null>(null)
  const [viewerFile, setViewerFile] = useState<{ url: string; title: string } | null>(null)
  const expensesHealedRef = useRef(false)
  const jobNumberHealedRef = useRef<string | null>(null)
  const invoiceLinkHealedRef = useRef<string | null>(null)
  /** Prevents onSnapshot from wiping unsaved staff-rate edits (e.g. earning month). */
  const staffRatesDirtyRef = useRef(false)
  const staffRatesRef = useRef(staffRates)
  staffRatesRef.current = staffRates


  // ─── Roles ───────────────────────────────────────────────────────────────
  const isAdmin = authStore.isSuperAdmin() || authStore.hasRole('ADMIN' as any)
  const isSuperAdmin = authStore.isSuperAdmin()
  const userRoles = authStore.getRoles()
  const userName = authStore.user?.displayName || authStore.user?.email || 'Unknown User'
  const isAccountant = authStore.hasRole('ACCOUNTANT' as any) || isAdmin
  const isManager = authStore.hasRole('MANAGER' as any) || isAdmin
  const auditActor = useMemo(
    () => ({
      uid: authStore.user?.uid,
      displayName: userName,
      email: authStore.user?.email || undefined,
    }),
    [authStore.user?.uid, authStore.user?.email, userName]
  )
  const approvalUserContext = useMemo(
    () => ({
      isAccountant,
      isManager,
      userName,
      uid: authStore.user?.uid,
      email: authStore.user?.email || undefined,
    }),
    [isAccountant, isManager, userName, authStore.user?.uid, authStore.user?.email]
  )

  /** Role string passed into store transitions (mirrors legacy Vue priority). */
  const approvalRole = useMemo(() => {
    if (userRoles.includes('SUPER_ADMIN')) return 'SUPER_ADMIN'
    if (userRoles.includes('ADMIN')) return 'ADMIN'
    if (userRoles.includes('MANAGER')) return 'MANAGER'
    if (userRoles.includes('ACCOUNTANT')) return 'ACCOUNTANT'
    if (userRoles.includes('TECHNICAL')) return 'TECHNICAL'
    if (userRoles.includes('SALES')) return 'SALES'
    return userRoles[0] || 'USER'
  }, [userRoles])

  /** Staged card approval — same gates as legacy Vue JobCardDetail. */
  const canApprove = useMemo(() => {
    if (['APPROVED_MANAGER', 'COMPLETED', 'CLOSED', 'REJECTED', 'CANCELLED'].includes(status)) {
      return false
    }
    if (isAdmin) return true
    if (status === 'SUBMITTED' && isAccountant) return true
    if (status === 'APPROVAL_PENDING_ACCOUNTANT' && isAccountant) return true
    if (status === 'APPROVAL_PENDING_MANAGER' && isManager) return true
    return false
  }, [status, isAdmin, isAccountant, isManager])

  const approvalButtonLabel = useMemo(() => {
    if (!canApprove) return 'Awaiting Approval'
    if (status === 'APPROVAL_PENDING_ACCOUNTANT') return 'Approve as Accountant'
    if (status === 'APPROVAL_PENDING_MANAGER') return 'Approve as Manager'
    if (status === 'SUBMITTED') return 'Approve'
    return 'Approve Stage'
  }, [canApprove, status])

  /** Role to send with the approve action for the current stage. */
  const roleForApprovalAction = useMemo(() => {
    if (isAdmin) return isSuperAdmin ? 'SUPER_ADMIN' : 'ADMIN'
    if (status === 'APPROVAL_PENDING_MANAGER') return 'MANAGER'
    if (status === 'SUBMITTED' || status === 'APPROVAL_PENDING_ACCOUNTANT') return 'ACCOUNTANT'
    return approvalRole
  }, [isAdmin, isSuperAdmin, status, approvalRole])

  // ─── CRM Data Subscriptions ─────────────────────────────────────────────
  useEffect(() => {
    const unsubQuotes = crmStore.fetchQuotes()
    const unsubInvoices = crmStore.fetchInvoices()
    return () => {
      if (unsubQuotes) unsubQuotes()
      if (unsubInvoices) unsubInvoices()
    }
  }, [])

  useEffect(() => {
    return financeStore.subscribeLedger()
  }, [])

  // ─── Firestore real-time sync ────────────────────────────────────────────
  useEffect(() => {
    if (!id) return

    expensesHealedRef.current = false
    staffRatesDirtyRef.current = false
    adminStore.fetchAll()

    const unsub = onSnapshot(
      doc(db, 'jobCards', id),
      (snap) => {
        if (!snap.exists()) {
          setNotFound(true)
          setLoading(false)
          return
        }

        const data = snap.data()
        const gi = data.generalInfo || {}

        // ── Hydrate JobInfo ──────────────────────────────────────────────
        setJobInfo({
          jobCardTitle: gi.jobTitle || gi.jobCardTitle || '',
          projectDescription: gi.projectDescription || '',
          requestingDepartmentId: gi.requestingDepartmentId || '',
          jobCategoryId: gi.jobCategoryId || '',
          jobNumber: gi.jobNumber || '',
          projectLocation: gi.projectLocation || 'N/A',
          dimensionsOfStructure: gi.dimensionsOfStructure || '',
          startDate: gi.startDate || '',
          recipientName: gi.recipientName || 'N/A',
          customerId: gi.customerId || '',
          recipientAddress: gi.recipientAddress || 'N/A',
          recipientPhone: gi.recipientPhone || 'N/A',
          linkedCrmId: gi.linkedCrmId || '',
          linkedCrmType: gi.linkedCrmType || '',
          linkedCrmNumber: gi.linkedCrmNumber || '',
          linkedCrmTotal: Number(gi.linkedCrmTotal || 0),
          lockedTotalInvoiceValue: Number(data.lockedTotalInvoiceValue || 0),
        })
        setOtherServices(Array.isArray(data.otherServices) ? data.otherServices : [])

        if (/^JC-DRAFT-/i.test(String(gi.jobNumber || '')) && jobNumberHealedRef.current !== id) {
          jobNumberHealedRef.current = id
          void useJobCardsStore.getState().generateJobNumber()
            .then((jobNumber) => updateDoc(doc(db, 'jobCards', id), {
              'generalInfo.jobNumber': jobNumber,
              updatedAt: serverTimestamp(),
            }))
            .catch((err: unknown) => {
              console.error('[JobCardDetail] Failed to replace draft job number:', err)
              if (jobNumberHealedRef.current === id) jobNumberHealedRef.current = null
            })
        }

        const linkedInvoiceId = String(gi.linkedCrmId || '').trim()
        const invoiceHealKey = `${id}:${linkedInvoiceId}`
        if (
          String(gi.linkedCrmType || '').toUpperCase() === 'INVOICE' &&
          linkedInvoiceId &&
          invoiceLinkHealedRef.current !== invoiceHealKey
        ) {
          invoiceLinkHealedRef.current = invoiceHealKey
          const storedNumber = String(gi.linkedCrmNumber || '').trim()
          void (async () => {
            try {
              const invoiceSnap = await getDoc(doc(db, 'crmInvoices', linkedInvoiceId))
              if (!invoiceSnap.exists()) return
              let invoiceNumber = String(invoiceSnap.data()?.invoiceNumber || '').trim()
              if (/^INV-DRAFT-/i.test(invoiceNumber) || !invoiceNumber) {
                invoiceNumber = await useCrmStore.getState().generateInvoiceNumber()
                await useCrmStore.getState().updateInvoice(linkedInvoiceId, { invoiceNumber })
              }
              if (isSequentialInvoiceNumber(invoiceNumber) && invoiceNumber !== storedNumber) {
                await updateDoc(doc(db, 'jobCards', id), {
                  'generalInfo.linkedCrmNumber': invoiceNumber,
                  updatedAt: serverTimestamp(),
                })
              }
            } catch (err: unknown) {
              console.error('[JobCardDetail] Failed to sync linked invoice number:', err)
              if (invoiceLinkHealedRef.current === invoiceHealKey) invoiceLinkHealedRef.current = null
            }
          })()
        }

        // ── Hydrate requisition sections (prefer sections, fallback to flat items) ──
        if (data.requisitionSections && data.requisitionSections.length > 0) {
          const normalizedSections = data.requisitionSections.map((section: any) => ({
            ...section,
            id: section.id || crypto.randomUUID(),
            items: (section.items || []).map((item: any) => ({
              ...item,
              id: item.id || crypto.randomUUID(),
              qtyRequired: Number(item.qtyRequired ?? item.qty ?? item.quantity ?? 0),
              irdSellingPrice: Number(item.irdSellingPrice ?? item.price ?? 0),
              markupPercent: Number(item.markupPercent ?? item.twidMarkupPercent ?? 0),
              costSnapshot: Number(item.costSnapshot ?? 0),
              approvalStatus: item.approvalStatus || 'PENDING',
              isLockedAgainstPdf: item.isLockedAgainstPdf || false,
            }))
          }))
          setRequisitionItems(normalizedSections)
        } else if (data.requisitionItems && data.requisitionItems.length > 0) {
          // Convert flat items into a single section
          const firstItem = data.requisitionItems[0] || {}
          setRequisitionItems([
            {
              id: crypto.randomUUID(),
              jobCategoryId: firstItem.jobCategoryId || '',
              description: '',
              items: data.requisitionItems.map((item: any) => ({
                ...item,
                id: item.id || crypto.randomUUID(),
                inventoryItemId: item.inventoryItemId || '',
                itemName: item.itemName || 'Unnamed Item',
                description: item.description || '',
                qtyRequired: Number(item.qtyRequired || item.qty || 0),
                irdSellingPrice: Number(item.irdSellingPrice || 0),
                markupPercent: Number(item.markupPercent || item.twidMarkupPercent || 0),
                costSnapshot: Number(item.costSnapshot || 0),
                approvalStatus: item.approvalStatus || 'PENDING',
                isLockedAgainstPdf: item.isLockedAgainstPdf || false,
                inventoryDeducted: item.inventoryDeducted || false,
                rowIRDTot: Number(item.rowIRDTot || 0),
                rowMUTot: Number(item.rowMUTot || 0),
                rowGrandTot: Number(item.rowGrandTot || 0),
              })),
            },
          ])
        } else {
          setRequisitionItems([])
        }

        // ── Hydrate expenses ─────────────────────────────────────────────
        const rawExpenses = data.adHocExpenses || []
        const needsExpenseHealing = rawExpenses.some(
          (e: any) => !e.id || (e.attachmentUrl && !e.attachmentUrls)
        )
        const healedExpenses = rawExpenses.map((e: any) => ({
          // Spread first: keeps approval audit fields (approvedAt/approvedBy,
          // accountantApprovedAt/By, ...) so a later Save doesn't strip them
          ...e,
          id: e.id || crypto.randomUUID(),
          description: e.description || 'No Description',
          recipientName: e.recipientName || '',
          recipientPhone: e.recipientPhone || '',
          quantity: Number(e.quantity || 0),
          unitPrice: Number(e.unitPrice || 0),
          paymentMethod: e.paymentMethod || '',
          paymentRef: e.paymentRef || '',
          totalAmount: Number(e.totalAmount || (e.quantity || 0) * (e.unitPrice || 0)),
          attachmentUrl: e.attachmentUrl || null,
          attachmentUrls: e.attachmentUrls || (e.attachmentUrl ? [e.attachmentUrl] : []),
          approvalStatus: e.approvalStatus || 'PENDING',
          createdAt: e.createdAt || new Date().toISOString(),
          isLockedAgainstPdf: e.isLockedAgainstPdf || false,
        }))
        setRequisitionExpenses(healedExpenses)
        if (needsExpenseHealing && !expensesHealedRef.current && id) {
          expensesHealedRef.current = true
          store.updateJobCardArray(id, 'adHocExpenses', healedExpenses).catch((err: any) => {
            console.error('[JobCardDetail] Failed to persist healed expense IDs:', err)
            expensesHealedRef.current = false
          })
        }

        // ── Hydrate staff rates ──────────────────────────────────────────
        // Skip while local grid edits are dirty so earning month / amounts
        // are not clobbered by a concurrent snapshot before Save/Approve.
        if (!staffRatesDirtyRef.current) {
          setStaffRates(
            (data.staffRates || []).map((r: any) => ({
              ...r,
              id: r.id || crypto.randomUUID(),
              employeeId: r.employeeId || '',
              jobRateAmount: Number(r.jobRateAmount || 0),
              paymentMethod: 'SALARIES',
              approvalStatus: r.approvalStatus || 'PENDING',
              createdAt: r.createdAt || new Date().toISOString(),
            }))
          )
        }

        // ── Hydrate subcontract works ────────────────────────────────────
        setSubcontractWorks(
          (data.subcontractWorks || []).map((w: any) => ({
            ...w,
            id: w.id || crypto.randomUUID(),
            subcontractorId: w.subcontractorId || '',
            subcontractorName: w.subcontractorName || '',
            description: w.description || '',
            quantity: Number(w.quantity || (w.isScnLink || w.subcontractorJobId ? 1 : 0)),
            unitPrice: Number(w.unitPrice || w.contractValue || 0),
            paymentMethod: w.paymentMethod || 'PENDING',
            paymentRef: w.paymentRef || '',
            totalAmount: Number(
              w.totalAmount ||
              w.contractValue ||
              (w.quantity || 0) * (w.unitPrice || 0)
            ),
            attachmentUrl: w.attachmentUrl || null,
            attachmentUrls: w.attachmentUrls || (w.attachmentUrl ? [w.attachmentUrl] : []),
            approvalStatus: w.approvalStatus || 'PENDING',
            createdAt: w.createdAt || new Date().toISOString(),
            isLockedAgainstPdf: w.isLockedAgainstPdf || false,
            transactionChargeId: w.transactionChargeId,
            opexId: w.opexId,
            transactionPaymentId: w.transactionPaymentId,
            isScnLink: !!w.isScnLink || !!w.subcontractorJobId,
            subcontractorJobId: w.subcontractorJobId || (w.isScnLink ? w.id : undefined),
            contractNumber: w.contractNumber,
            contractValue: Number(w.contractValue || w.totalAmount || 0),
            paidApprovedTotal: Number(w.paidApprovedTotal || 0),
            scnStatus: w.scnStatus,
          }))
        )

        // ── Hydrate referrers ────────────────────────────────────────────
        setReferrers(
          (gi.referrers || data.referrers || []).map((ref: any) => ({
            ...ref,
            id: ref.id || `ref_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            name: ref.name || '',
            amount: Number(ref.amount) || 0,
            paymentMethod: ref.paymentMethod || 'CASH',
            approvalStatus: ref.approvalStatus || 'PENDING',
            createdAt: ref.createdAt || new Date().toISOString(),
          }))
        )

        setCreatorName(data.submittedBy?.name || data.createdBy?.name || 'Unknown User')
        setCreatorUid(data.submittedBy?.uid || data.createdBy?.uid || null)

        // ── Status ───────────────────────────────────────────────────────
        setStatus(data.status || 'DRAFT')
        setWorkStartedAt(data.workStartedAt || '')
        setReadyToStartAt(data.readyToStartAt || '')
        setJobChecklists(data.jobChecklists || {})

        // ── Tools & Timeline ─────────────────────────────────────────────
        setAllocatedTools(data.allocatedTools || [])
        setApprovalTimeline(data.approvalTimeline || [])

        setLoading(false)
      },
      (err) => {
        console.error('[JobCardDetail] onSnapshot error:', err)
        toast.error('Failed to load job card', {
          description: err.message,
        })
        setLoading(false)
      }
    )

    return () => unsub()
  }, [id])

  // ─── Payments real-time sync ─────────────────────────────────────────────
  useEffect(() => {
    if (!id) return
    const paymentsRef = collection(db, 'jobPayments')
    const paymentsQ = query(paymentsRef, where('jobCardId', '==', id))
    const unsubPayments = onSnapshot(paymentsQ, (snap) => {
      const raw = snap.docs.map(d => ({ id: d.id, ...d.data() } as any))
      const sorted = raw.sort((a, b) => {
        const timeA = a.createdAt?.toMillis?.() || 0
        const timeB = b.createdAt?.toMillis?.() || 0
        return timeB - timeA
      })
      setRecordedPayments(sorted)
    }, (err) => console.error("Payments fetch error:", err))

    return () => unsubPayments()
  }, [id])

  // Invoice payments for CRM-linked jobs (covers receipts before jobPayments backfill)
  useEffect(() => {
    if (jobInfo.linkedCrmType !== 'INVOICE' || !jobInfo.linkedCrmId) {
      setInvoicePayments([])
      return
    }
    const q = query(
      collection(db, 'invoicePayments'),
      where('invoiceId', '==', jobInfo.linkedCrmId),
    )
    const unsub = onSnapshot(q, (snap) => {
      setInvoicePayments(snap.docs.map((d) => ({ id: d.id, ...d.data() } as any)))
    }, (err) => console.error('Invoice payments fetch error:', err))
    return () => unsub()
  }, [jobInfo.linkedCrmId, jobInfo.linkedCrmType])

  // ─── Totals Calculations ─────────────────────────────────────────────────
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

    const subcontractWorksTotal = subcontractWorks.reduce((acc, w) => {
      if (w.isScnLink || w.subcontractorJobId) {
        return acc + (Number(w.contractValue ?? w.totalAmount) || 0)
      }
      return acc + (w.quantity || 0) * (w.unitPrice || 0)
    }, 0)

    const implementationCost = adhocTotal + staffRatesTotal + subcontractWorksTotal

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

    // Include paid (non-PENDING) subcontract methods in expensesByMethod
    for (const w of subcontractWorks) {
      if (w.isScnLink || w.subcontractorJobId) {
        // SCN OPEX is tracked via paidApprovedTotal, not paymentMethod on the projection
        continue
      }
      const amount = (w.quantity || 0) * (w.unitPrice || 0)
      if (w.paymentMethod === 'CASH') expByMethod.CASH += amount
      else if (w.paymentMethod === 'ECOCASH') expByMethod.ECOCASH += amount
      else if (w.paymentMethod === 'BANK') expByMethod.BANK += amount
    }

    return {
      inventoryIRDTotal: round2(invSummary.totalIrdCost),
      inventoryMUTotal: round2(invSummary.totalMarkup),
      inventoryGrandTotal: round2(invSummary.totalInvoiceable),
      adHocTotal: round2(adhocTotal),
      staffRatesTotal: round2(staffRatesTotal),
      subcontractWorksTotal: round2(subcontractWorksTotal),
      implementationCost: round2(implementationCost),
      expensesByMethod: {
        CASH: round2(expByMethod.CASH),
        ECOCASH: round2(expByMethod.ECOCASH),
        BANK: round2(expByMethod.BANK),
      },
      overallGrandTotal: round2(invSummary.totalInvoiceable + implementationCost),
    }
  }, [requisitionItems, requisitionExpenses, staffRates, subcontractWorks])

  const financialBreakdown = useMemo(() => {
    const mappedSections = (requisitionItems || []).map((sec) => ({
      ...sec,
      items: (sec.items || []).map((item) => ({
        ...item,
        qty: item.qtyRequired || 0,
        twidMarkupPercent: item.markupPercent || 0,
        costSnapshot: item.costSnapshot || 0,
      }))
    }))
    const linkedToCrm = Number(jobInfo.linkedCrmTotal || 0) > 0 || Boolean(jobInfo.linkedCrmId)
    return computeFinancials(
      mappedSections,
      requisitionExpenses || [],
      [], // returns
      staffRates || [],
      referrers || [],
      status,
      subcontractWorks || [],
      otherServices,
      {
        countPendingMaterials: linkedToCrm,
        linkedCrmTotal: Number(jobInfo.linkedCrmTotal || 0),
      },
    )
  }, [requisitionItems, requisitionExpenses, staffRates, referrers, status, subcontractWorks, otherServices, jobInfo.linkedCrmId, jobInfo.linkedCrmTotal])

  const effectiveFinancials = useMemo(() => {
    if (!financialBreakdown) return null

    const round2 = (v: number) => Number((v || 0).toFixed(2))
    const agreed = resolveAgreedInvoice({
      linkedCrmTotal: jobInfo.linkedCrmTotal,
      irdGrossRevenue: financialBreakdown.irdGrossRevenue,
      twidAmount: financialBreakdown.twidAmount,
      otherServicesTotal: financialBreakdown.otherServicesTotal,
      implementationCost: financialBreakdown.implementationCost,
    })
    const initialInvoiceValue = agreed.initialInvoiceValue
    const revenue = round2(initialInvoiceValue - (financialBreakdown.totalAdjustments || 0))
    const totalCost = financialBreakdown.totalCost || 0
    const netProfit = round2(revenue - totalCost)
    const profitMargin = revenue > 0 ? round2((netProfit / revenue) * 100) : 0
    const twidNetAfterAdjustments = financialBreakdown.twidNetAfterAdjustments
    const twidRevenuePercentage = initialInvoiceValue > 0
      ? round2((twidNetAfterAdjustments / initialInvoiceValue) * 100)
      : 0

    return {
      ...financialBreakdown,
      initialInvoiceValue,
      totalInvoiceValue: initialInvoiceValue,
      totalRevenue: revenue,
      totalCost,
      netProfit,
      profitMargin,
      twidNetAfterAdjustments,
      twidRevenuePercentage,
      billedLabor: agreed.hasAgreedBill
        ? financialBreakdown.otherServicesTotal
        : financialBreakdown.implementationCost,
    }
  }, [financialBreakdown, jobInfo.linkedCrmTotal])

  // ─── VAT & Grand Total ────────────────────────────────────────────────────
  const isLinkedToCrm = Boolean(jobInfo.linkedCrmId && Number(jobInfo.linkedCrmTotal || 0) > 0)
  const vatEnabled = Boolean(adminStore.appSettings?.vatEnabled)
  const vatRate = vatEnabled ? Number(adminStore.appSettings?.vatRate || 15) : 0
  const effectiveVatRate = isLinkedToCrm ? 0 : vatRate
  const vatAmount = Number((effectiveVatRate > 0 ? totals.overallGrandTotal * effectiveVatRate / 100 : 0).toFixed(2))
  const grandTotalWithVat = effectiveFinancials
    ? effectiveFinancials.initialInvoiceValue
    : Number((totals.overallGrandTotal + vatAmount).toFixed(2))

  // ─── Total Commission ─────────────────────────────────────────────────────
  const totalCommission = useMemo(() => {
    return referrers.reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
  }, [referrers])

  // Merge jobPayments with any invoice payments not yet mirrored as jobPayments
  const billingPayments = useMemo(() => {
    const linkedInvoiceIds = new Set(
      recordedPayments
        .map((p) => String(p.invoicePaymentId || '').trim())
        .filter(Boolean),
    )
    const extras = invoicePayments
      .filter((ip) => !linkedInvoiceIds.has(ip.id))
      .map((ip) => ({
        id: `invoice-${ip.id}`,
        amount: Number(ip.amount || 0),
        paymentMethod: String(ip.method || ip.paymentMethod || '').toLowerCase(),
        description: `Invoice ${ip.invoiceNumber || jobInfo.linkedCrmNumber || ''}${ip.reference ? ` — ${ip.reference}` : ''}`,
        createdAt: ip.createdAt,
        invoicePaymentId: ip.id,
        source: 'INVOICE',
        proofOfPaymentUrl: ip.proofOfPaymentUrl || null,
      }))
    return [...recordedPayments, ...extras].sort((a, b) => {
      const timeA = a.createdAt?.toMillis?.() || (a.createdAt ? new Date(a.createdAt).getTime() : 0)
      const timeB = b.createdAt?.toMillis?.() || (b.createdAt ? new Date(b.createdAt).getTime() : 0)
      return timeB - timeA
    })
  }, [recordedPayments, invoicePayments, jobInfo.linkedCrmNumber])

  // ─── Unified Payments & Billing Totals ────────────────────────────────────
  const totalPaid = useMemo(() => {
    return billingPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
  }, [billingPayments])

  const paymentsByMethod = useMemo(() => {
    const acc: Record<string, number> = { CASH: 0, BANK: 0, ECOCASH: 0, RESERVE: 0 }
    for (const p of billingPayments) {
      const key = String(p.paymentMethod || '').trim().toUpperCase().replace(/[\s_-]+/g, '')
      const method =
        key === 'CASH' ? 'CASH'
          : key === 'BANK' || key === 'BANKTRANSFER' ? 'BANK'
            : key === 'ECOCASH' || key === 'MOBILEMONEY' ? 'ECOCASH'
              : key === 'RESERVE' ? 'RESERVE'
                : null
      if (!method) continue
      acc[method] += Number(p.amount || 0)
    }
    return acc
  }, [billingPayments])

  const balanceDue = useMemo(() => {
    return Math.max(0, grandTotalWithVat - totalPaid)
  }, [grandTotalWithVat, totalPaid])

  const isFullyPaid = useMemo(() => {
    return grandTotalWithVat > 0 && balanceDue <= 0
  }, [grandTotalWithVat, balanceDue])

  const hasApprovedInventory = useMemo(() => {
    return (requisitionItems || []).some((s: any) =>
      (s.items || []).some((i: any) => i.approvalStatus === 'APPROVED_MANAGER')
    )
  }, [requisitionItems])

  const hasApprovedExpenses = useMemo(() => {
    return (requisitionExpenses || []).some((e: any) =>
      e.approvalStatus === 'APPROVED_MANAGER' && !e.isLockedAgainstPdf
    )
  }, [requisitionExpenses])

  // ─── Tab counts ───────────────────────────────────────────────────────────
  const requisitionCount = useMemo(() => {
    return (requisitionItems || []).reduce((sum, s) => sum + (s.items?.length || 0), 0)
  }, [requisitionItems])

  const expensesCount = requisitionExpenses.length
  const subcontractWorksCount = subcontractWorks.length
  const staffRatesCount = staffRates.length
  const commissionCount = referrers.length
  const toolsCount = allocatedTools.length

  // ─── Brand Color ──────────────────────────────────────────────────────────
  const brandColor = (adminStore.appSettings?.uiColors as any)?.brandPrimaryColor || '#79c21b'

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const statusConfig = {
    ...(STATUS_CONFIG[status] || { label: status, variant: 'secondary' as const }),
    label: jobStatusLabel(status, workStartedAt, readyToStartAt),
  }

  function commercialSections() {
    const costById: Record<string, number> = {}
    for (const item of inventoryItems) {
      if (item.id) costById[item.id] = catalogueCostOf(item)
    }
    return stampRequisitionSections(requisitionItems, costById) as BomRequisitionSection[]
  }

  // ─── Action: Save Changes ─────────────────────────────────────────────────
  const handleSaveChanges = async () => {
    setSaving(true)
    const toastId = toast.loading('Saving changes...')
    try {
      const generalInfo = {
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
          approvalStatus: r.approvalStatus || 'PENDING',
          createdAt: r.createdAt || new Date().toISOString(),
          approvedAt: r.approvedAt || null,
          approvedBy: r.approvedBy || null,
          attachments: r.attachments || [],
          proofUrl: r.proofUrl || null,
          proofName: r.proofName || null,
        })),
      }

      const sections = commercialSections()
      await store.updateFullJobCard(id, {
        generalInfo,
        requisitionSections: sections,
        requisitionItems: sections.flatMap((s) =>
          (s.items || []).map((item: any) => ({
            ...item,
            jobCategoryId: s.jobCategoryId || '',
          }))
        ),
        adHocExpenses: requisitionExpenses,
        subcontractWorks,
        staffRates: staffRates.map((rate) => ({ ...rate, paymentMethod: 'SALARIES' })),
        status,
        jobChecklists,
      }, auditActor)
      staffRatesDirtyRef.current = false
      toast.dismiss(toastId)
      toast.success('Changes saved successfully')
    } catch (err: any) {
      toast.dismiss(toastId)
      console.error('Save failed:', err)
      toast.error('Save Failed', { description: err.message })
    } finally {
      setSaving(false)
    }
  }

  const handleStaffRatesUpdate = useCallback((rates: StaffRate[]) => {
    staffRatesDirtyRef.current = true
    setStaffRates(rates)
  }, [])

  /** Persist local staff-rate edits (earning month) before approve so validation sees them. */
  const persistStaffRatesBeforeApprove = useCallback(async (rates: StaffRate[]) => {
    const normalized = rates.map((rate) => ({ ...rate, paymentMethod: 'SALARIES' as const }))
    await store.updateJobCardArray(id, 'staffRates', normalized, auditActor)
    staffRatesDirtyRef.current = false
    setStaffRates(normalized)
    return normalized
  }, [id, store, auditActor])

  const handleApproveStaffRate = useCallback(async (itemId: string, targetStatus: string) => {
    const rates = staffRatesRef.current
    const row = rates.find((r) => r.id === itemId)
    if (!row) {
      toast.error('Staff rate not found')
      return
    }
    if (targetStatus !== 'REJECTED' && accrualPayrollEnabled && !isValidStaffEarningPeriod(row.earningPeriod)) {
      toast.error('Set the staff rate earning month before approving it')
      return
    }
    try {
      const persisted = await persistStaffRatesBeforeApprove(rates)
      await store.approveItem(id, 'staffRates', itemId, targetStatus, approvalUserContext, persisted)
    } catch (err: any) {
      toast.error(err?.message || 'Staff rate approval failed')
    }
  }, [persistStaffRatesBeforeApprove, store, id, approvalUserContext])

  const handleApproveAllStaffRates = useCallback(async (targetStatus: string) => {
    const rates = staffRatesRef.current
    if (accrualPayrollEnabled && targetStatus !== 'REJECTED') {
      const missing = rates.find(
        (r) =>
          !!r.employeeId &&
          Number(r.jobRateAmount) > 0 &&
          !r.payrollPosted &&
          !isValidStaffEarningPeriod(r.earningPeriod)
      )
      if (missing) {
        toast.error('Set the staff rate earning month before approving it')
        return
      }
    }
    try {
      const persisted = await persistStaffRatesBeforeApprove(rates)
      await store.approveAllItems(id, 'staffRates', targetStatus, approvalUserContext, persisted)
    } catch (err: any) {
      toast.error(err?.message || 'Staff rate approval failed')
    }
  }, [persistStaffRatesBeforeApprove, store, id, approvalUserContext])

  // ─── Action: Submit for Approval (DRAFT → SUBMITTED) ─────────────────────
  const handleSubmitForApproval = async () => {
    const gate = canSubmitJob(jobChecklists)
    if (!gate.ok) {
      toast.error(`Preparation incomplete: ${gate.missing.join(', ')}`)
      return
    }
    setSaving(true)
    const toastId = toast.loading('Submitting for approval...')
    try {
      const generalInfo = {
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
          approvalStatus: r.approvalStatus || 'PENDING',
          createdAt: r.createdAt || new Date().toISOString(),
        })),
      }

      const sections = commercialSections()
      await store.updateFullJobCard(id, {
        generalInfo,
        requisitionSections: sections,
        requisitionItems: sections.flatMap((s) =>
          (s.items || []).map((item: any) => ({
            ...item,
            jobCategoryId: s.jobCategoryId || '',
          }))
        ),
        adHocExpenses: requisitionExpenses,
        subcontractWorks,
        staffRates: staffRates.map((rate) => ({ ...rate, paymentMethod: 'SALARIES' })),
        jobChecklists,
      }, auditActor)

      await store.updateJobCardStatus(id, 'SUBMITTED', {
        user: userName,
        role: approvalRole,
        status: 'Submitted for Approval',
      })

      toast.dismiss(toastId)
      toast.success('Job Card Submitted for Approval')
      setStatus('SUBMITTED')
    } catch (err: any) {
      toast.dismiss(toastId)
      console.error('Submit failed:', err)
      toast.error('Submission Failed', { description: err.message })
    } finally {
      setSaving(false)
    }
  }

  // ─── Action: Staged Approve (Accountant / Manager) ───────────────────────
  const handleApproval = async () => {
    const confirmed = window.confirm(
      'IMPORTANT: Please verify all figures in the job card before proceeding.\n\n' +
      'Note: Approving the Job Card status will NOT automatically approve individual material or expense items. ' +
      'You must approve these items within their respective grids to ensure they are correctly recorded in the financial ledger and stock levels.'
    )
    if (!confirmed) return

    setSaving(true)
    const toastId = toast.loading('Processing approval...')
    const previousStatus = status
    try {
      await store.approveJobCard(id, status, roleForApprovalAction, userName)

      toast.dismiss(toastId)
      toast.success('Status Updated', {
        description: previousStatus === 'APPROVAL_PENDING_MANAGER'
          ? 'Job approved. This does not start work, accept a quotation, or issue an invoice.'
          : 'The job card has moved to the next approval stage.',
      })
    } catch (err: any) {
      toast.dismiss(toastId)
      console.error('Approval failed:', err)
      toast.error('Approval Failed', { description: err.message })
    } finally {
      setSaving(false)
    }
  }

  const handleMarkReady = async () => {
    const gate = canMarkReady(jobChecklists)
    if (!gate.ok) {
      toast.error(`Ready-to-start checks missing: ${gate.missing.join(', ')}`)
      return
    }
    setSaving(true)
    try {
      await updateDoc(doc(db, 'jobCards', id), {
        jobChecklists,
        readyToStartAt: new Date().toISOString(),
        readyToStartBy: userName,
        updatedAt: serverTimestamp(),
      })
      toast.success('Marked ready to start. Work has not started yet.')
    } catch (err: any) {
      toast.error(err.message || 'Could not mark ready')
    } finally {
      setSaving(false)
    }
  }

  const handleStartWork = async () => {
    if (status !== 'APPROVED_MANAGER' || workStartedAt) return
    const gate = canMarkReady(jobChecklists)
    if (!gate.ok) {
      toast.error(`Ready-to-start checks missing: ${gate.missing.join(', ')}`)
      return
    }
    setSaving(true)
    try {
      await updateDoc(doc(db, 'jobCards', id), {
        jobChecklists,
        readyToStartAt: readyToStartAt || new Date().toISOString(),
        workStartedAt: new Date().toISOString(),
        workStartedBy: userName,
        updatedAt: serverTimestamp(),
      })
      toast.success('Work started', { description: 'Approved is not automatically In Progress.' })
    } catch (err: any) {
      toast.error(err.message || 'Could not start work')
    } finally {
      setSaving(false)
    }
  }

  // ─── Action: Reject ──────────────────────────────────────────────────────
  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      toast.error('Please enter a reason for rejection')
      return
    }
    setRejecting(true)
    const toastId = toast.loading('Rejecting job card...')
    try {
      await store.rejectJobCard(id, roleForApprovalAction, userName, rejectionReason.trim())
      toast.dismiss(toastId)
      toast.success('Job Card Rejected')
      setShowRejectDialog(false)
      setRejectionReason('')
      setStatus('REJECTED')
    } catch (err: any) {
      toast.dismiss(toastId)
      console.error('Reject failed:', err)
      toast.error('Rejection Failed', { description: err.message })
    } finally {
      setRejecting(false)
    }
  }

  // ─── Action: Re-invoke rejected card → SUBMITTED ─────────────────────────
  const handleReInvoke = async () => {
    setSaving(true)
    const toastId = toast.loading('Re-invoking job card...')
    try {
      await store.updateJobCardStatus(id, 'SUBMITTED', {
        user: userName,
        role: approvalRole,
        status: 'Re-invoked — returned to Submitted',
      })
      toast.dismiss(toastId)
      toast.success('Job Card Re-invoked', {
        description: 'Status reset to Submitted. It can now go through approvals again.',
      })
      setStatus('SUBMITTED')
    } catch (err: any) {
      toast.dismiss(toastId)
      console.error('Re-invoke failed:', err)
      toast.error('Re-invoke Failed', { description: err.message })
    } finally {
      setSaving(false)
    }
  }

  // ─── Action: Close Job ────────────────────────────────────────────────────
  const handleCompleteWork = async () => {
    const gate = canCompleteJob(jobChecklists)
    if (!gate.ok) {
      toast.error(`Completion checks missing: ${gate.missing.join(', ')}`)
      return
    }
    setSaving(true)
    try {
      await store.updateJobCardStatus(id, 'COMPLETED', {
        user: userName,
        role: approvalRole,
        status: 'Work completed',
      })
      await updateDoc(doc(db, 'jobCards', id), { jobChecklists, updatedAt: serverTimestamp() })
      setStatus('COMPLETED')
      toast.success('Work marked complete')
    } catch (err: any) {
      toast.error(err.message || 'Could not complete work')
    } finally {
      setSaving(false)
    }
  }

  const handleCloseJob = async () => {
    const blockUnpaid = (adminStore.appSettings as any)?.jobOps?.blockUnpaidJobClose !== false
    const gate = canCloseJob({ completed: jobChecklists, outstandingBalance: balanceDue, blockUnpaid })
    if (!gate.ok) {
      toast.error(gate.unpaid
        ? `Outstanding balance ${gate.unpaid.toFixed(2)} blocks closure. Turn this off in Admin settings if finance agrees.`
        : `Closure checks missing: ${gate.missing.join(', ')}`)
      return
    }
    const confirmed = window.confirm(
      'Are you sure you want to CLOSE this Job Card?\n\n' +
      'This action will officially lock the Total Invoice Value and Implementation Cost targets. ' +
      'Any subsequent edits will be treated as formal adjustments (Profit reduction).'
    )
    if (!confirmed) return

    setSaving(true)
    const toastId = toast.loading('Closing job card...')
    try {
      const closeRole = isAdmin ? (isSuperAdmin ? 'SUPER_ADMIN' : 'ADMIN') : 'MANAGER'
      await updateDoc(doc(db, 'jobCards', id), { jobChecklists, updatedAt: serverTimestamp() })
      await store.approveJobCard(id, status, closeRole, userName)
      toast.dismiss(toastId)
      toast.success('Job Card Closed', { description: 'Financial benchmarks have been locked.' })
    } catch (err: any) {
      toast.dismiss(toastId)
      console.error('Close Job failed:', err)
      toast.error('Failed to Close Job', { description: err.message })
    } finally {
      setSaving(false)
    }
  }

  // ─── Action: Cancel Job ──────────────────────────────────────────────────
  const handleCancel = async () => {
    setCancelling(true)
    const toastId = toast.loading('Cancelling job card...')
    try {
      await store.updateJobCardStatus(id, 'CANCELLED', {
        user: userName,
        role: approvalRole,
        status: 'Cancelled',
      })
      toast.dismiss(toastId)
      toast.success('Job Card Cancelled')
      setShowCancelDialog(false)
      setStatus('CANCELLED')
    } catch (err: any) {
      toast.dismiss(toastId)
      console.error('Cancel failed:', err)
      toast.error('Cancel Failed', { description: err.message })
    } finally {
      setCancelling(false)
    }
  }

  // ─── Action: Force Delete ────────────────────────────────────────────────
  const handleForceDelete = async () => {
    if (!isAdmin && !isSuperAdmin) {
      toast.error('Permission Denied', {
        description: 'Only administrators can perform this action.',
      })
      return
    }

    setDeleting(true)
    const toastId = toast.loading('Deleting job card and all related data...')
    try {
      await store.deleteJobCardCascade(id, status, isAdmin || isSuperAdmin)
      toast.dismiss(toastId)
      toast.success('Job Card Deleted Permanently')
      setShowDeleteDialog(false)
      router.push('/job-cards')
    } catch (err: any) {
      toast.dismiss(toastId)
      console.error('Delete failed:', err)
      toast.error('Delete Failed', { description: err.message })
    } finally {
      setDeleting(false)
    }
  }

  const hasLinkedCrmInvoice = Boolean(
    jobInfo.linkedCrmId && String(jobInfo.linkedCrmType || '').toUpperCase() === 'INVOICE',
  )

  const handleDownloadInvoicePdf = async () => {
    if (!hasLinkedCrmInvoice) {
      toast.error('No linked CRM invoice', {
        description: 'Link a CRM invoice on this job card to download the Invoice PDF.',
      })
      return
    }

    setIsExportingPdf(true)
    toast.loading('Generating Invoice PDF...', { id: 'pdf-export' })
    try {
      let invoice =
        crmStore.invoices.find((inv: any) => inv.id === jobInfo.linkedCrmId) || null
      if (!invoice) {
        const snap = await getDoc(doc(db, 'crmInvoices', String(jobInfo.linkedCrmId)))
        if (!snap.exists()) throw new Error('Linked CRM invoice was not found')
        invoice = { id: snap.id, ...snap.data() }
      }

      const { user } = authStore
      const creatorRow = (adminStore.users || []).find(
        (u: any) => u.id === invoice?.createdBy || u.uid === invoice?.createdBy,
      )
      const currentRow = (adminStore.users || []).find(
        (u: any) => u.id === user?.uid || u.uid === user?.uid,
      )
      const signer = await resolvePdfSigner(invoice?.createdBy)
      const pdfCreatorName =
        resolveStaffName({
          directoryUser: creatorRow || currentRow,
          authDisplayName: user?.displayName,
          storedName: invoice.createdByName,
        }) ||
        signer.name ||
        ''
      const pdfInvoice = await hydrateInvoiceFromQuote(invoice)
      await generateCrmPdf(
        {
          ...pdfInvoice,
          signatureUrl: signer.signatureUrl,
          position: signer.position,
        },
        'INVOICE',
        adminStore.appSettings as any,
        adminStore.appSettings as any,
        pdfCreatorName,
        adminStore.jobCategories || [],
      )
      toast.success('Invoice PDF Downloaded Successfully!', { id: 'pdf-export' })
    } catch (err: any) {
      console.error(err)
      toast.error('PDF Generation Failed', { id: 'pdf-export', description: err.message })
    } finally {
      setIsExportingPdf(false)
    }
  }

  // ─── PDF Export Handlers ────────────────────────────────────────────────
  const handleExportPDF = async (type: string) => {
    setIsExportingPdf(true)
    try {
      const signer = await resolvePdfSigner(creatorUid)
      const pdfCreatorName = creatorName !== 'Unknown User' ? creatorName : (signer.name || creatorName)
      const signerOpts = {
        signatureUrl: signer.signatureUrl,
        position: signer.position,
      }

      // Reconstruct job data for PDF helpers
      const jobData = {
        id,
        status: status,
        generalInfo: {
          jobNumber: jobInfo.jobNumber,
          jobTitle: jobInfo.jobCardTitle,
          dateIssued: jobInfo.startDate || new Date(),
          createdAt: jobInfo.startDate || new Date(),
          recipientName: jobInfo.recipientName,
          recipientAddress: jobInfo.recipientAddress,
          recipientPhone: jobInfo.recipientPhone,
          projectLocation: jobInfo.projectLocation,
          startDate: jobInfo.startDate,
          dimensionsOfStructure: jobInfo.dimensionsOfStructure,
          jobCategoryId: jobInfo.jobCategoryId,
          referrerName: referrers.length > 0 ? referrers[0].name : '',
        },
        requisitionItems: commercialSections().flatMap(sec => (sec.items || []).map(it => ({
          ...it,
          sectionName: (sec as any).name || sec.description || 'General'
        }))),
        requisitionSections: commercialSections(),
        adHocExpenses: requisitionExpenses,
        staffRates: staffRates,
        subcontractWorks: subcontractWorks,
      }

      if (type === 'Requisitions') {
        const items = jobData.requisitionItems
        const approvedItems = items.filter((i: any) => i.approvalStatus === 'APPROVED_MANAGER')
        const unlockedApproved = approvedItems.filter((i: any) => !i.isLockedAgainstPdf)
        if (approvedItems.length === 0) {
          toast.error('No items to export', { description: 'There are no approved requisition items available for export.' })
          return
        }

        setIsLocking(true)
        toast.loading(unlockedApproved.length > 0 ? 'Locking items and preparing download...' : 'Preparing requisition PDF...', { id: 'pdf-export' })
        try {
          if (unlockedApproved.length > 0) {
            await store.lockApprovedItems(id, 'inventory')
          }

          await generateApprovedRequisitionPdf(
            jobData,
            adminStore.appSettings as any,
            adminStore.appSettings as any,
            pdfCreatorName,
            adminStore.jobCategories
          )
          toast.success(unlockedApproved.length > 0 ? 'Requisition PDF Downloaded & Items Locked!' : 'Requisition PDF Downloaded!', { id: 'pdf-export' })
        } catch (err: any) {
          toast.error('Lock or PDF Generation Failed', { id: 'pdf-export', description: err.message })
        } finally {
          setIsLocking(false)
        }
      } else if (type === 'Expenses') {
        const approvedExpenses = jobData.adHocExpenses.filter((e: any) => e.approvalStatus === 'APPROVED_MANAGER' && !e.isLockedAgainstPdf)
        if (approvedExpenses.length === 0) {
          toast.error('No expenses to export', { description: 'There are no approved expenses available for export.' })
          return
        }

        setIsLocking(true)
        toast.loading('Locking expenses and preparing download...', { id: 'pdf-export' })
        try {
          // 1. Lock Approved Items First
          await store.lockApprovedItems(id, 'expenses')

          // 2. Generate and deliver the PDF
          await generateApprovedExpensesPdf(
            jobData,
            adminStore.appSettings as any,
            adminStore.appSettings as any,
            pdfCreatorName,
            adminStore.jobCategories
          )
          toast.success('Expenses PDF Downloaded & Items Locked!', { id: 'pdf-export' })
        } catch (err: any) {
          toast.error('Lock or PDF Generation Failed', { id: 'pdf-export', description: err.message })
        } finally {
          setIsLocking(false)
        }
      } else if (type === 'Full Report') {
        toast.loading('Generating Full Report PDF...', { id: 'pdf-export' })
        try {
          await generateFullJobCardPdf(
            jobData,
            jobData.requisitionItems,
            requisitionExpenses,
            [], // returns
            billingPayments,
            effectiveFinancials,
            adminStore.appSettings as any,
            adminStore.appSettings as any,
            pdfCreatorName,
            adminStore.jobCategories,
            signerOpts
          )
          toast.success('Full Report PDF Downloaded Successfully!', { id: 'pdf-export' })
        } catch (err: any) {
          toast.error('PDF Generation Failed', { id: 'pdf-export', description: err.message })
        }
      } else if (type === 'Performance Report') {
        if (!effectiveFinancials) {
          toast.error('Financials not available', { description: 'Cannot generate performance report without financial data.' })
          return
        }
        toast.loading('Generating Performance Report PDF...', { id: 'pdf-export' })
        try {
          await generatePerformanceReportPdf(
            {
              jobId: id,
              jobCardNumber: jobInfo.jobNumber,
              jobCardTitle: jobInfo.jobCardTitle,
              clientName: jobInfo.recipientName,
              financials: effectiveFinancials,
              totalPaid,
              payments: billingPayments,
              generatedBy: authStore.user?.displayName || authStore.user?.email || 'System User',
              staffRates,
              subcontractWorks,
              referrers,
            },
            adminStore.appSettings as any,
            adminStore.appSettings as any,
            pdfCreatorName
          )
          toast.success('Performance Report PDF Downloaded Successfully!', { id: 'pdf-export' })
        } catch (err: any) {
          toast.error('PDF Generation Failed', { id: 'pdf-export', description: err.message })
        }
      }
    } finally {
      setIsExportingPdf(false)
    }
  }

  const handleDownloadReceipt = async (payment: any) => {
    // Reconstruct job data for PDF helpers
    const jobData = {
      id,
      status: status,
      generalInfo: {
        jobNumber: jobInfo.jobNumber,
        jobTitle: jobInfo.jobCardTitle,
        dateIssued: jobInfo.startDate || new Date(),
        createdAt: jobInfo.startDate || new Date(),
        recipientName: jobInfo.recipientName,
        recipientAddress: jobInfo.recipientAddress,
        recipientPhone: jobInfo.recipientPhone,
        projectLocation: jobInfo.projectLocation,
        startDate: jobInfo.startDate,
        dimensionsOfStructure: jobInfo.dimensionsOfStructure,
        jobCategoryId: jobInfo.jobCategoryId,
        referrerName: referrers.length > 0 ? referrers[0].name : '',
      },
    }

    toast.loading('Generating Payment Receipt...', { id: 'receipt-export' })
    try {
      const signer = await resolvePdfSigner(creatorUid)
      const pdfCreatorName = creatorName !== 'Unknown User' ? creatorName : (signer.name || creatorName)
      await generatePaymentReceiptPdf(
        jobData,
        payment,
        adminStore.appSettings as any,
        adminStore.appSettings as any,
        pdfCreatorName,
        {
          signatureUrl: signer.signatureUrl,
          position: signer.position,
        }
      )
      toast.success('Receipt PDF Downloaded Successfully!', { id: 'receipt-export' })
    } catch (err: any) {
      toast.error('Receipt Generation Failed', { id: 'receipt-export', description: err.message })
    }
  }

  // ─── Loading State ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="w-full space-y-6 px-4 md:px-8 py-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      </div>
    )
  }

  // ─── Not Found State ─────────────────────────────────────────────────────
  if (notFound) {
    return (
      <div className="w-full flex flex-col items-center justify-center py-24 px-4">
        <AlertTriangle className="size-16 text-muted-foreground/30 mb-4" />
        <h2 className="text-2xl font-bold text-muted-foreground">Job Card Not Found</h2>
        <p className="text-muted-foreground/60 mt-2 mb-6">
          The job card you are looking for does not exist or has been removed.
        </p>
        <Button variant="outline" onClick={() => router.push('/job-cards')}>
          <ArrowLeft className="size-4 mr-2" />
          Back to Job Cards
        </Button>
      </div>
    )
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="w-full space-y-6 pb-12 px-4 md:px-8">
      {/* ═══ Header ════════════════════════════════════════════════════════ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/job-cards')}>
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
              {jobInfo.jobCardTitle || 'Untitled Job Card'}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <code className="text-sm font-mono text-muted-foreground bg-muted/50 px-2 py-0.5 rounded">
                {jobInfo.jobNumber || id.substring(0, 8)}
              </code>
              <Badge
                variant={statusConfig.variant}
                style={{
                  borderColor: status === 'APPROVED_ACCOUNTANT' || status === 'APPROVED_MANAGER' ? brandColor : undefined,
                }}
              >
                {statusConfig.label}
              </Badge>
            </div>
          </div>
        </div>

        {/* ── Action Buttons ────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Mobile PDF Dropdown */}
          <div className="md:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="outline" size="sm" className="text-xs" disabled={isLocking || isExportingPdf} />
                }
              >
                {isExportingPdf ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <FileDown className="size-3.5 mr-1.5" />}
                Export PDF
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-card border border-border w-48 z-[100]">
                <DropdownMenuItem
                  onClick={handleDownloadInvoicePdf}
                  disabled={!hasLinkedCrmInvoice}
                  className="text-xs cursor-pointer"
                >
                  Invoice PDF
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => handleExportPDF('Requisitions')} 
                  disabled={!hasApprovedInventory} 
                  className="text-xs cursor-pointer"
                >
                  Req PDF
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => handleExportPDF('Expenses')} 
                  disabled={!hasApprovedExpenses} 
                  className="text-xs cursor-pointer"
                >
                  Exp PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExportPDF('Full Report')} className="text-xs cursor-pointer font-semibold">
                  Full PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExportPDF('Performance Report')} className="text-xs cursor-pointer">
                  Perf PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Desktop PDF Buttons */}
          <div className="hidden md:flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadInvoicePdf}
              className="text-xs"
              disabled={isLocking || isExportingPdf || !hasLinkedCrmInvoice}
              title={hasLinkedCrmInvoice ? undefined : 'No linked CRM invoice'}
            >
              <FileDown className="size-3.5 mr-1.5" />
              Invoice PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExportPDF('Requisitions')}
              className="text-xs"
              disabled={isLocking || isExportingPdf || !hasApprovedInventory}
            >
              <FileDown className="size-3.5 mr-1.5" />
              Req PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExportPDF('Expenses')}
              className="text-xs"
              disabled={isLocking || isExportingPdf || !hasApprovedExpenses}
            >
              <FileDown className="size-3.5 mr-1.5" />
              Exp PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExportPDF('Full Report')}
              className="text-xs"
              disabled={isLocking || isExportingPdf}
            >
              <FileDown className="size-3.5 mr-1.5" />
              Full PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExportPDF('Performance Report')}
              className="text-xs"
              disabled={isLocking || isExportingPdf}
            >
              <FileDown className="size-3.5 mr-1.5" />
              Perf PDF
            </Button>
          </div>

          {/* Divider */}
          <div className="w-px h-6 bg-border mx-1 hidden sm:block" />

          {/* Approval / Submit / Close actions */}
          {status === 'DRAFT' && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveChanges}
                disabled={saving}
                style={{ borderColor: brandColor, color: brandColor }}
              >
                {saving ? (
                  <Loader2 className="size-4 mr-1.5 animate-spin" />
                ) : (
                  <Save className="size-4 mr-1.5" />
                )}
                Save Changes
              </Button>
              <Button
                size="sm"
                onClick={handleSubmitForApproval}
                disabled={saving}
                style={{ backgroundColor: brandColor, borderColor: brandColor }}
                className="text-white shadow-md"
              >
                {saving ? (
                  <Loader2 className="size-4 mr-1.5 animate-spin" />
                ) : (
                  <Send className="size-4 mr-1.5" />
                )}
                Submit for Approval
              </Button>
            </>
          )}

          {canApprove && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowRejectDialog(true)}
                disabled={saving || rejecting}
                className="text-rose-600 border-rose-600/50 hover:bg-rose-600/10"
              >
                <XCircle className="size-4 mr-1.5" />
                Reject
              </Button>
              <Button
                size="sm"
                onClick={handleApproval}
                disabled={saving}
                style={{ backgroundColor: brandColor, borderColor: brandColor }}
                className="text-white shadow-md"
              >
                {saving ? (
                  <Loader2 className="size-4 mr-1.5 animate-spin" />
                ) : (
                  <CheckCircle className="size-4 mr-1.5" />
                )}
                {approvalButtonLabel}
              </Button>
            </>
          )}

          {status === 'APPROVED_MANAGER' && !workStartedAt && isManager && (
            <>
              {!readyToStartAt && (
                <Button size="sm" onClick={handleMarkReady} disabled={saving} variant="outline">
                  Mark Ready to Start
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleStartWork}
                disabled={saving}
                variant="outline"
              >
                <Play className="size-4 mr-1.5" />
                Start Work
              </Button>
            </>
          )}

          {status === 'APPROVED_MANAGER' && workStartedAt && isManager && (
            <Button size="sm" onClick={handleCompleteWork} disabled={saving} variant="outline">
              Complete Work
            </Button>
          )}

          {status === 'REJECTED' && (isManager || isAccountant) && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleReInvoke}
              disabled={saving}
              className="text-amber-600 border-amber-500/40 hover:bg-amber-50 dark:hover:bg-amber-900/20"
            >
              {saving ? (
                <Loader2 className="size-4 mr-1.5 animate-spin" />
              ) : (
                <Play className="size-4 mr-1.5" />
              )}
              Re-invoke Job Card
            </Button>
          )}

          {/* Close Job — managers and admins only */}
          {(status === 'APPROVED_MANAGER' || status === 'COMPLETED') && isManager && (
            <Button
              size="sm"
              onClick={handleCloseJob}
              disabled={saving}
              style={{ backgroundColor: '#f97316', borderColor: '#f97316' }}
              className="text-white shadow-md"
            >
              {saving ? (
                <Loader2 className="size-4 mr-1.5 animate-spin" />
              ) : (
                <CheckCircle className="size-4 mr-1.5" />
              )}
              Close Job
            </Button>
          )}

          {/* Admin/SuperAdmin always-visible actions */}
          {(isAdmin || isSuperAdmin) && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCancelDialog(true)}
                disabled={status === 'CANCELLED' || status === 'CLOSED'}
                className="text-amber-600 border-amber-600/50 hover:bg-amber-600/10"
              >
                <Ban className="size-4 mr-1.5" />
                Cancel Job
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowDeleteDialog(true)}
                className="shadow-md"
              >
                <Trash2 className="size-4 mr-1.5" />
                Force Delete
              </Button>
            </>
          )}
        </div>
      </div>

      {canApprove && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <AlertTriangle className="size-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-800 dark:text-amber-200">Verification required</p>
            <p className="text-amber-700/90 dark:text-amber-200/80 text-xs mt-0.5">
              Review all figures before {approvalButtonLabel.toLowerCase()}. Approving the job card status does not
              automatically approve individual materials or expenses — use the grid Approve actions for those.
            </p>
          </div>
        </div>
      )}

      {/* ═══ Tabs Layout ════════════════════════════════════════════════════ */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="w-full overflow-x-auto scrollbar-hide py-1">
          <TabsList
            className="flex justify-start gap-1 rounded-xl border bg-background/50 backdrop-blur-md p-1 min-w-max"
            style={{ borderColor: `${brandColor}30` }}
          >
            <TabsTrigger
              value="overview"
              className="rounded-lg data-[state=active]:text-white data-[state=active]:shadow-sm transition-all shrink-0 flex-none"
              style={{
                ['--tw-shadow-color' as any]: brandColor,
                backgroundColor: activeTab === 'overview' ? brandColor : undefined,
              }}
            >
              <FileText className="size-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="requisitions"
              className="rounded-lg data-[state=active]:text-white data-[state=active]:shadow-sm transition-all shrink-0 flex-none"
              style={{
                ['--tw-shadow-color' as any]: brandColor,
                backgroundColor: activeTab === 'requisitions' ? brandColor : undefined,
              }}
            >
              <ClipboardList className="size-4 mr-2" />
              Inventory & Requisitions
              {requisitionCount > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0 shrink-0">
                  {requisitionCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="expenses"
              className="rounded-lg data-[state=active]:text-white data-[state=active]:shadow-sm transition-all shrink-0 flex-none"
              style={{
                ['--tw-shadow-color' as any]: brandColor,
                backgroundColor: activeTab === 'expenses' ? brandColor : undefined,
              }}
            >
              <Receipt className="size-4 mr-2" />
              Adhoc Expenses
              {expensesCount > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0 shrink-0">
                  {expensesCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="subcontract-works"
              className="rounded-lg data-[state=active]:text-white data-[state=active]:shadow-sm transition-all shrink-0 flex-none"
              style={{
                ['--tw-shadow-color' as any]: brandColor,
                backgroundColor: activeTab === 'subcontract-works' ? brandColor : undefined,
              }}
            >
              <HardHat className="size-4 mr-2" />
              Subcontract Works
              {subcontractWorksCount > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0 shrink-0">
                  {subcontractWorksCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="staff-rates"
              className="rounded-lg data-[state=active]:text-white data-[state=active]:shadow-sm transition-all shrink-0 flex-none"
              style={{
                ['--tw-shadow-color' as any]: brandColor,
                backgroundColor: activeTab === 'staff-rates' ? brandColor : undefined,
              }}
            >
              <Users className="size-4 mr-2 text-blue-500" />
              Staff Rates
              {staffRatesCount > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0 shrink-0">
                  {staffRatesCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="commissions"
              className="rounded-lg data-[state=active]:text-white data-[state=active]:shadow-sm transition-all shrink-0 flex-none"
              style={{
                ['--tw-shadow-color' as any]: brandColor,
                backgroundColor: activeTab === 'commissions' ? brandColor : undefined,
              }}
            >
              <TrendingUp className="size-4 mr-2 text-emerald-500" />
              Commissions
              {commissionCount > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0 shrink-0">
                  {commissionCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="tools"
              className="rounded-lg data-[state=active]:text-white data-[state=active]:shadow-sm transition-all shrink-0 flex-none"
              style={{
                ['--tw-shadow-color' as any]: brandColor,
                backgroundColor: activeTab === 'tools' ? brandColor : undefined,
              }}
            >
              <Wrench className="size-4 mr-2 text-rose-500" />
              Tools
              {toolsCount > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0 shrink-0">
                  {toolsCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="billing"
              className="rounded-lg data-[state=active]:text-white data-[state=active]:shadow-sm transition-all shrink-0 flex-none"
              style={{
                ['--tw-shadow-color' as any]: brandColor,
                backgroundColor: activeTab === 'billing' ? brandColor : undefined,
              }}
            >
              <Receipt className="size-4 mr-2 text-purple-500" />
              Billing & History
              {balanceDue > 0 ? (
                <Badge variant="destructive" className="ml-1.5 text-[9px] px-1.5 py-0 animate-pulse uppercase font-black tracking-wider bg-rose-500 text-white border-none shrink-0">
                  Unpaid
                </Badge>
              ) : (
                <Badge variant="secondary" className="ml-1.5 text-[9px] px-1.5 py-0 uppercase font-black tracking-wider shrink-0 bg-emerald-500/20 text-emerald-600 border-none">
                  Paid
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ── Overview Tab ───────────────────────────────────────────────── */}
        <TabsContent value="overview" className="mt-6 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold">Job Information</h3>
            <Button
              variant={editingOverview ? 'default' : 'outline'}
              size="sm"
              onClick={() => setEditingOverview(!editingOverview)}
              style={
                editingOverview
                  ? { backgroundColor: brandColor, borderColor: brandColor }
                  : { borderColor: brandColor, color: brandColor }
              }
            >
              {editingOverview ? 'Lock Overview' : 'Edit Overview'}
            </Button>
          </div>

          {editingOverview ? (
            <JobInformationCard
              modelValue={jobInfo}
              isGenerating={false}
              generationFailed={false}
              onUpdate={setJobInfo}
              onRetryJobNumber={() => {}}
            />
          ) : (
            <Card
              className="bg-white/5 dark:bg-white/5 backdrop-blur-md border-white/10 shadow-lg overflow-hidden"
            >
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Job Title</Label>
                    <p className="font-semibold">{jobInfo.jobCardTitle || '—'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Job Number</Label>
                    <p className="font-mono font-semibold">{jobInfo.jobNumber || '—'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Department</Label>
                    <p className="font-semibold">
                      {adminStore.departments.find((d: any) => d.id === jobInfo.requestingDepartmentId)?.name || '—'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Category</Label>
                    <p className="font-semibold">
                      {adminStore.jobCategories.find((c: any) => c.id === jobInfo.jobCategoryId)?.name || '—'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Location</Label>
                    <p className="font-semibold">{jobInfo.projectLocation || '—'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Dimensions</Label>
                    <p className="font-semibold">{jobInfo.dimensionsOfStructure || '—'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Start Date</Label>
                    <p className="font-semibold">{jobInfo.startDate || '—'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Recipient</Label>
                    <p className="font-semibold">{jobInfo.recipientName || '—'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Phone</Label>
                    <p className="font-semibold">{jobInfo.recipientPhone || '—'}</p>
                  </div>
                  <div className="space-y-1 col-span-full">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Address</Label>
                    <p className="font-semibold">{jobInfo.recipientAddress || '—'}</p>
                  </div>
                  {jobInfo.linkedCrmId && (
                    <div className="space-y-1 col-span-full">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wider">Linked CRM Document</Label>
                      <p className="font-semibold">
                        {jobInfo.linkedCrmType} — {jobInfo.linkedCrmNumber} ({formatCurrency(jobInfo.linkedCrmTotal || 0)})
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
          {['SUBMITTED', 'APPROVAL_PENDING_ACCOUNTANT', 'APPROVAL_PENDING_MANAGER', 'APPROVED_ACCOUNTANT', 'APPROVED_MANAGER', 'APPROVED_FINAL', 'COMPLETED', 'CLOSED'].includes(status) && effectiveFinancials && (
            <FinancialPerformancePanel financials={effectiveFinancials} />
          )}
          <CostStatusPanel
            job={{
              requisitionSections: requisitionItems,
              adHocExpenses: requisitionExpenses,
              subcontractWorks,
              staffRates,
            }}
          />
          <JobOpsChecklist
            completed={jobChecklists}
            onChange={setJobChecklists}
            disabled={status === 'CLOSED' || status === 'CANCELLED'}
          />
        </TabsContent>

        {/* ── Requisitions Tab ────────────────────────────────────────────── */}
        <TabsContent value="requisitions" className="mt-6 space-y-4">
          <div className="space-y-4">
            <h3 className="text-xl font-semibold">Inventory Requisition</h3>
            <InventoryRequisitionGrid
              modelValue={requisitionItems}
              generalInfo={jobInfo}
              isAdmin={isAdmin || isSuperAdmin}
              isAccountant={isAccountant}
              isManager={isManager}
              isJobApproved={['SUBMITTED', 'APPROVAL_PENDING_ACCOUNTANT', 'APPROVAL_PENDING_MANAGER', 'APPROVED_ACCOUNTANT', 'APPROVED_MANAGER', 'APPROVED_FINAL', 'COMPLETED', 'CLOSED'].includes(status)}
              onUpdate={setRequisitionItems}
              onApproveItem={(itemId, targetStatus) => store.approveItem(id, 'requisitionItems', itemId, targetStatus, { isAccountant, isManager, userName }, requisitionItems)}
              onApproveAll={(targetStatus) => store.approveAllItems(id, 'requisitionItems', targetStatus, { isAccountant, isManager, userName }, requisitionItems)}
            />
          </div>
        </TabsContent>

        {/* ── Expenses Tab ────────────────────────────────────────────────── */}
        <TabsContent value="expenses" className="mt-6 space-y-4">
          <div className="space-y-4">
            <div className="flex flex-col">
              <h3 className="text-xl font-semibold">Job Card Expenses (Ad-hoc)</h3>
              <p className="text-sm text-muted-foreground">
                Miscellaneous items not in inventory (e.g., lunch money, airtime, food).
              </p>
            </div>
            <JobCardExpensesGrid
              modelValue={requisitionExpenses}
              generalInfo={jobInfo}
              isAdmin={isAdmin || isSuperAdmin}
              isAccountant={isAccountant}
              isManager={isManager}
              isJobApproved={['SUBMITTED', 'APPROVAL_PENDING_ACCOUNTANT', 'APPROVAL_PENDING_MANAGER', 'APPROVED_ACCOUNTANT', 'APPROVED_MANAGER', 'APPROVED_FINAL', 'COMPLETED', 'CLOSED'].includes(status)}
              canManageProof={isAccountant || isManager || isAdmin || isSuperAdmin}
              accountBalances={financeStore.finalBalances}
              balancesLoaded={financeBalancesLoaded}
              onUpdate={setRequisitionExpenses}
              onPersistExpenses={async (expenses) => {
                if (!id) throw new Error('Job card id missing')
                await store.updateJobCardArray(id, 'adHocExpenses', expenses, auditActor)
                const syncTargets = expenses.filter((e) =>
                  e.id && ['APPROVED_ACCOUNTANT', 'APPROVED_MANAGER'].includes(e.approvalStatus || '')
                )
                await Promise.all(
                  syncTargets.map((e) =>
                    financeStore.syncAdHocAttachmentsToOpex(
                      e.id,
                      e.attachmentUrls || (e.attachmentUrl ? [e.attachmentUrl] : [])
                    )
                  )
                )
              }}
              onDeleteExpense={async (expense) => {
                if (!id) throw new Error('Job card id missing')
                await store.deleteAdHocExpense(id, expense, auditActor)
              }}
              onApproveItem={(itemId, targetStatus) => store.approveItem(id, 'adHocExpenses', itemId, targetStatus, approvalUserContext, requisitionExpenses)}
              onApproveAll={async (targetStatus) => { await store.approveAllItems(id, 'adHocExpenses', targetStatus, approvalUserContext, requisitionExpenses) }}
            />
          </div>
        </TabsContent>

        {/* ── Subcontract Works Tab ───────────────────────────────────────── */}
        <TabsContent value="subcontract-works" className="mt-6 space-y-4">
          <div className="space-y-4">
            <div className="flex flex-col">
              <h3 className="text-xl font-semibold">Subcontract Works</h3>
              <p className="text-sm text-muted-foreground">
                Third-party contractor work on this job. Approved lines post to the subcontractor statement and OPEX when paid.
              </p>
            </div>
            <JobCardSubcontractWorksGrid
              modelValue={subcontractWorks}
              generalInfo={jobInfo}
              jobCardId={id}
              jobCardNumber={jobInfo?.jobNumber || id}
              isAdmin={isAdmin || isSuperAdmin}
              isAccountant={isAccountant}
              isManager={isManager}
              isJobApproved={['SUBMITTED', 'APPROVAL_PENDING_ACCOUNTANT', 'APPROVAL_PENDING_MANAGER', 'APPROVED_ACCOUNTANT', 'APPROVED_MANAGER', 'APPROVED_FINAL', 'COMPLETED', 'CLOSED'].includes(status)}
              canManageProof={isAccountant || isManager || isAdmin || isSuperAdmin}
              canWrite={
                authStore.isSuperAdmin() ||
                canAccessModule(authStore.getRoles(), 'subcontractorsWrite')
              }
              accountBalances={financeStore.finalBalances}
              balancesLoaded={financeBalancesLoaded}
              userName={userName}
              createdBy={authStore.user?.uid || ''}
              onUpdate={setSubcontractWorks}
              onPersistWorks={async (works) => {
                if (!id) throw new Error('Job card id missing')
                await store.updateJobCardArray(id, 'subcontractWorks', works)
              }}
              onApproveItem={(itemId, targetStatus) => store.approveItem(id, 'subcontractWorks', itemId, targetStatus, { isAccountant, isManager, userName }, subcontractWorks)}
              onApproveAll={async (targetStatus) => { await store.approveAllItems(id, 'subcontractWorks', targetStatus, { isAccountant, isManager, userName }, subcontractWorks) }}
            />
          </div>
        </TabsContent>

        {/* ── Staff Rates Tab ─────────────────────────────────────────────── */}
        <TabsContent value="staff-rates" className="mt-6 space-y-4">
          <div className="space-y-4">
            <div className="flex flex-col">
              <h3 className="text-xl font-semibold">Staff Rates</h3>
              <p className="text-sm text-muted-foreground">
                Job-specific earnings assigned to staff members.
              </p>
            </div>
            <StaffRatesGrid
              modelValue={staffRates}
              generalInfo={jobInfo}
              isAdmin={isAdmin || isSuperAdmin}
              isAccountant={isAccountant}
              isManager={isManager}
              isJobApproved={['SUBMITTED', 'APPROVAL_PENDING_ACCOUNTANT', 'APPROVAL_PENDING_MANAGER', 'APPROVED_ACCOUNTANT', 'APPROVED_MANAGER', 'APPROVED_FINAL', 'COMPLETED', 'CLOSED'].includes(status)}
              onUpdate={handleStaffRatesUpdate}
              onApproveItem={handleApproveStaffRate}
              onApproveAll={handleApproveAllStaffRates}
              onSyncPayroll={() => store.syncStaffRatesToPayroll(id)}
            />
          </div>
        </TabsContent>

        {/* ── Commissions Tab ─────────────────────────────────────────────── */}
        <TabsContent value="commissions" className="mt-6 space-y-4">
          <ReferrerCommissionSection
            referrers={referrers}
            onUpdate={setReferrers}
            totalCommission={totalCommission}
            jobId={id}
            isAdmin={isAdmin || isSuperAdmin}
            isAccountant={isAccountant}
            isManager={isManager}
            isJobApproved={['SUBMITTED', 'APPROVAL_PENDING_ACCOUNTANT', 'APPROVAL_PENDING_MANAGER', 'APPROVED_ACCOUNTANT', 'APPROVED_MANAGER', 'APPROVED_FINAL', 'COMPLETED', 'CLOSED'].includes(status)}
            onApproveItem={(itemId, targetStatus) => store.approveItem(id, 'referrers', itemId, targetStatus, { isAccountant, isManager, userName }, referrers)}
            onApproveAll={async (targetStatus) => { await store.approveAllItems(id, 'referrers', targetStatus, { isAccountant, isManager, userName }, referrers) }}
            accountBalances={financeStore.finalBalances}
            balancesLoaded={financeBalancesLoaded}
          />
        </TabsContent>

        {/* ── Tools Tab ──────────────────────────────────────────────────── */}
        <TabsContent value="tools" className="mt-6 space-y-4">
          <AllocatedToolsGrid
            modelValue={allocatedTools}
            jobId={id}
            onUpdate={setAllocatedTools}
          />
        </TabsContent>

        {/* ── Billing & History Tab ───────────────────────────────────────── */}
        <TabsContent value="billing" className="mt-6 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
            <div className="space-y-6">
              {/* Consolidated Summary Card */}
              <Card className="bg-brand-primary/5 dark:bg-brand-primary/10 backdrop-blur-md border-brand-primary/20 dark:border-brand-primary/30 shadow-lg text-foreground overflow-hidden h-fit">
                <CardHeader className="bg-brand-primary/5 border-b border-brand-primary/10 p-4 py-3">
                  <CardTitle className="text-sm font-black uppercase tracking-widest text-brand-primary">
                    Consolidated Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-sm border-t border-brand-primary/10 pt-2">
                      <span className="text-muted-foreground font-black uppercase text-[10px]">Job Invoice Total</span>
                      <span className="font-bold underline tabular-nums text-brand-primary">{formatCurrency(totals.inventoryGrandTotal)}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs opacity-60">
                      <span className="text-muted-foreground font-medium uppercase text-[9px]">Internal Ad-hoc (Excluded)</span>
                      <span className="font-medium tabular-nums">{formatCurrency(totals.adHocTotal)}</span>
                    </div>

                    <Separator className="my-2 bg-brand-primary/20" />

                    <div className="flex flex-col items-end gap-1">
                      <span className="text-[10px] font-black uppercase text-brand-primary/60 tracking-[.2em]">Subtotal</span>
                      <span className="text-2xl font-black text-brand-primary tracking-tighter tabular-nums">
                        {formatCurrency(totals.overallGrandTotal)}
                      </span>
                    </div>

                    <div className="flex flex-col items-end gap-1 border-t border-brand-primary/30 pt-2">
                      <span className="text-[10px] font-black uppercase text-brand-primary/60 tracking-[.2em]">
                        Overall Grand Total
                      </span>
                      <span className="text-3xl font-black text-brand-primary tracking-tighter tabular-nums drop-shadow-sm">
                        {formatCurrency(grandTotalWithVat)}
                      </span>
                      <p className="text-[9px] text-muted-foreground uppercase font-medium italic">Inventory Items Only</p>
                    </div>

                    {/* Consolidated Payment Tracking */}
                    <div className="pt-3 border-t border-brand-primary/20 flex flex-col items-end gap-1.5">
                      <div className="flex justify-between items-center w-full">
                        <span className="text-[10px] font-black uppercase text-blue-600">Total Paid</span>
                        <span className="font-bold text-blue-600">{formatCurrency(totalPaid)}</span>
                      </div>
                      <div className="flex justify-between items-center w-full">
                        <span className={`text-[11px] font-black uppercase ${isFullyPaid ? 'text-emerald-600' : 'text-amber-600'}`}>Balance Due</span>
                        <span className={`text-lg font-black tabular-nums ${isFullyPaid ? 'text-emerald-600' : 'text-amber-600'}`}>{formatCurrency(balanceDue)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Receipt method breakdown (customer payments) */}
                  <div className="space-y-1.5 pt-3 border-t border-primary/10">
                    <p className="text-[9px] font-black uppercase text-muted-foreground/50 tracking-widest">Payment Method Breakdown</p>
                    {Object.entries(paymentsByMethod).filter(([, amount]) => amount > 0).length === 0 ? (
                      <p className="text-xs text-muted-foreground">No customer payments recorded yet.</p>
                    ) : (
                      Object.entries(paymentsByMethod)
                        .filter(([, amount]) => amount > 0)
                        .map(([method, amount]) => (
                          <div key={method} className="flex justify-between text-xs items-center bg-muted/20 p-2 rounded">
                            <span className="text-muted-foreground uppercase font-black text-[9px]">{method}</span>
                            <span className="font-bold tabular-nums">{formatCurrency(amount)}</span>
                          </div>
                        ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              {/* Payments are recorded on the linked CRM invoice only */}
              {['SUBMITTED', 'APPROVAL_PENDING_ACCOUNTANT', 'APPROVAL_PENDING_MANAGER', 'APPROVED_ACCOUNTANT', 'APPROVED_MANAGER', 'APPROVED_FINAL', 'COMPLETED', 'CLOSED'].includes(status) && (
                <Card className="bg-brand-primary/5 dark:bg-brand-primary/10 backdrop-blur-md border-brand-primary/20 dark:border-brand-primary/30 shadow-lg text-foreground overflow-hidden">
                  <CardHeader className="flex flex-row items-center justify-between bg-brand-primary/10 border-b border-brand-primary/20 p-4 py-3">
                    <CardTitle className="text-sm font-black uppercase tracking-widest text-brand-primary">
                      Customer Payments
                    </CardTitle>
                    {balanceDue > 0 && (
                      <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300 shadow-sm">
                        Balance: {formatCurrency(balanceDue)}
                      </Badge>
                    )}
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    {isFullyPaid ? (
                      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-center">
                        <CheckCircle className="size-6 mx-auto text-emerald-500 mb-1" />
                        <p className="text-emerald-700 font-bold text-sm">Invoice Fully Settled</p>
                        <p className="text-xs text-emerald-600/70">No further payments required.</p>
                      </div>
                    ) : (
                      <div className="rounded-md border border-dashed border-brand-primary/30 bg-background/60 p-3 text-sm text-muted-foreground">
                        Record payments on the linked invoice in CRM
                        {jobInfo.linkedCrmNumber ? ` (${jobInfo.linkedCrmNumber})` : ''}.
                        Receipts post to Cash, Bank, EcoCash, or Reserve automatically.
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Recorded Payments Log */}
              {billingPayments.length > 0 && (
                <Card className="shadow-sm border-muted/60">
                  <CardHeader className="flex flex-row items-center gap-2 pb-2 bg-muted/5 border-b">
                    <Receipt className="size-4 text-muted-foreground" />
                    <CardTitle className="text-sm font-bold">Payment History</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 overflow-x-auto">
                    <table className="w-full border-collapse min-w-[500px]">
                      <thead className="bg-muted/10 border-b border-white/80">
                        <tr>
                          <th className="text-left text-xs font-bold p-3 text-muted-foreground border-r border-white/80">Date</th>
                          <th className="text-left text-xs font-bold p-3 text-muted-foreground border-r border-white/80">Amount</th>
                          <th className="text-left text-xs font-bold p-3 text-muted-foreground border-r border-white/80">Method</th>
                          <th className="text-left text-xs font-bold p-3 text-muted-foreground border-r border-white/80">Reference</th>
                          <th className="text-right text-xs font-bold p-3 text-muted-foreground">Proof</th>
                        </tr>
                      </thead>
                      <tbody>
                        {billingPayments.map((pay) => (
                          <tr key={pay.id} className="border-b border-white/80 hover:bg-muted/5">
                            <td className="text-xs p-3 border-r border-white/80">
                              {pay.createdAt?.toDate ? pay.createdAt.toDate().toLocaleDateString() : pay.createdAt ? new Date(pay.createdAt).toLocaleDateString() : 'N/A'}
                            </td>
                            <td className="text-sm font-bold text-green-700 p-3 border-r border-white/80">
                              {formatCurrency(pay.amount || 0)}
                            </td>
                            <td className="text-xs p-3 border-r border-white/80">
                              <Badge variant="outline" className="uppercase text-[9px]">{pay.paymentMethod}</Badge>
                            </td>
                            <td className="text-xs p-3 text-muted-foreground border-r border-white/80">
                              {pay.description || 'No note'}
                            </td>
                            <td className="text-right p-3">
                              <div className="flex gap-1 justify-end">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-primary"
                                  onClick={() => handleDownloadReceipt(pay)}
                                  title="Download Receipt PDF"
                                >
                                  <FileDown className="size-4" />
                                </Button>
                                {pay.proofOfPaymentUrl && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-primary"
                                    onClick={() => setViewerFile({ url: pay.proofOfPaymentUrl, title: 'Proof of Payment' })}
                                    title="View Proof of Payment"
                                  >
                                    <Eye className="size-4" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          {/* Approval History Underneath (Full Width of Main Column) */}
          {approvalTimeline.length > 0 && (
            <Card className="shadow-sm border-muted/60 mt-8 font-sans">
              <CardHeader className="flex flex-row items-center gap-2 pb-2 bg-muted/5 border-b">
                <UserCheck className="size-4 text-primary" />
                <CardTitle className="text-lg font-bold">Approval History</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-8 relative before:absolute before:left-4 before:top-2 before:bottom-2 before:w-[2px] before:bg-muted/50 md:before:block">
                  {approvalTimeline.map((event, index) => (
                    <div key={index} className="relative pl-10">
                      <div className="absolute left-[-2px] top-1 size-5 rounded-full bg-primary border-4 border-background z-10 hidden md:block shadow-sm"></div>
                      <div className="flex flex-col">
                        <span className="font-black text-sm uppercase tracking-tight">{event.status}</span>
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-1">
                          <span className="font-bold text-foreground">{event.user}</span>
                          <span>•</span>
                          <span className="font-medium">{event.role}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground mt-1 font-mono uppercase bg-muted/30 px-1 rounded inline-block w-fit">
                          {formatDate(event.date)}
                        </span>
                        {event.comment && (
                          <p className="mt-3 text-xs bg-muted/10 border border-muted/20 p-3 rounded-md text-muted-foreground leading-relaxed shadow-sm">
                            "{event.comment}"
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ═══ Summary Card ═══════════════════════════════════════════════════ */}
      <Card className="bg-muted/5 border-muted/60 backdrop-blur-md shadow-lg">
        <CardHeader className="pb-3 border-b bg-muted/10">
          <CardTitle className="text-sm font-bold uppercase text-muted-foreground tracking-wider">
            Financial Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 p-6">
          {/* Inventory Section */}
          <div className="space-y-2">
            <p
              className="text-[11px] font-bold uppercase mb-2 tracking-wider"
              style={{ color: `${brandColor}99` }}
            >
              Inventory Breakdown
            </p>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">IRD Selling Price</span>
              <span className="font-medium">{formatCurrency(totals.inventoryIRDTotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Markup</span>
              <span className="font-medium text-amber-600 dark:text-amber-400">
                +{formatCurrency(totals.inventoryMUTotal)}
              </span>
            </div>
            <div className="flex justify-between text-sm font-bold pt-1 border-t mt-1">
              <span>Inventory Subtotal</span>
              <span>{formatCurrency(totals.inventoryGrandTotal)}</span>
            </div>
          </div>

          {/* Implementation Cost Section */}
          <div className="space-y-2">
            <p
              className="text-[11px] font-bold uppercase mb-2 tracking-wider"
              style={{ color: `${brandColor}99` }}
            >
              Implementation Cost
            </p>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Ad-hoc Expenses</span>
              <span className="font-medium text-orange-600 dark:text-orange-400">
                {formatCurrency(totals.adHocTotal)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Staff Rates</span>
              <span className="font-medium text-blue-600 dark:text-blue-400">
                {formatCurrency(totals.staffRatesTotal)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subcontract Works</span>
              <span className="font-medium text-amber-600 dark:text-amber-400">
                {formatCurrency(totals.subcontractWorksTotal || 0)}
              </span>
            </div>
            <div
              className="flex justify-between text-sm font-bold pt-1 border-t mt-1"
              style={{ color: brandColor }}
            >
              <span>Total Implementation</span>
              <span>{formatCurrency(totals.implementationCost)}</span>
            </div>
            {totals.expensesByMethod.CASH > 0 && (
              <div className="flex justify-between text-xs text-muted-foreground pl-2">
                <span>• Cash</span>
                <span>{formatCurrency(totals.expensesByMethod.CASH)}</span>
              </div>
            )}
            {totals.expensesByMethod.ECOCASH > 0 && (
              <div className="flex justify-between text-xs text-muted-foreground pl-2">
                <span>• EcoCash</span>
                <span>{formatCurrency(totals.expensesByMethod.ECOCASH)}</span>
              </div>
            )}
            {totals.expensesByMethod.BANK > 0 && (
              <div className="flex justify-between text-xs text-muted-foreground pl-2">
                <span>• Bank</span>
                <span>{formatCurrency(totals.expensesByMethod.BANK)}</span>
              </div>
            )}
          </div>

          {/* Spacer */}
          <div className="hidden lg:block" />

          {/* Grand Total */}
          <div
            className="flex flex-col justify-end space-y-2 border-l pl-8"
            style={{ borderColor: `${brandColor}30` }}
          >
            <p
              className="text-[11px] font-black uppercase tracking-widest"
              style={{ color: `${brandColor}66` }}
            >
              Job Invoice Total
            </p>
            {effectiveVatRate > 0 && (
              <div className="w-full space-y-1 text-sm mb-1">
                <div className="flex justify-between gap-6 text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="font-medium tabular-nums">
                    {formatCurrency(totals.overallGrandTotal)}
                  </span>
                </div>
                <div className="flex justify-between gap-6 text-muted-foreground">
                  <span>VAT ({effectiveVatRate}%)</span>
                  <span className="font-medium tabular-nums">
                    +{formatCurrency(vatAmount)}
                  </span>
                </div>
              </div>
            )}
            {isLinkedToCrm && (
              <p className="text-[10px] text-muted-foreground italic">
                VAT excluded (linked to CRM quote/invoice)
              </p>
            )}
            <div
              className="inline-flex items-baseline rounded-xl px-4 py-2.5"
              style={{
                background: `color-mix(in srgb, ${brandColor} 12%, transparent)`,
                border: `1px solid ${brandColor}30`,
              }}
            >
              <span
                className="text-2xl md:text-3xl font-black tracking-tight tabular-nums"
                style={{ color: brandColor }}
              >
                {formatCurrency(grandTotalWithVat)}
              </span>
            </div>
            <p className="text-[9px] text-muted-foreground uppercase font-medium italic">
              {effectiveVatRate > 0
                ? `Incl. VAT (${effectiveVatRate}%) · Inventory + Implementation`
                : 'Inventory Items + Implementation Costs'}
            </p>
          </div>
        </CardContent>
      </Card>



      {/* ═══ Reject Dialog ══════════════════════════════════════════════════ */}
      <Dialog open={showRejectDialog} onOpenChange={(open) => {
        setShowRejectDialog(open)
        if (!open) setRejectionReason('')
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <XCircle className="size-5" />
              Reject Job Card
            </DialogTitle>
            <DialogDescription>
              Please provide a reason for rejection. The requester can re-invoke the card after addressing the issues.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="rejection-reason">Reason</Label>
            <Textarea
              id="rejection-reason"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. Missing cost breakdown, incorrect quantities..."
              rows={4}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowRejectDialog(false)}
              disabled={rejecting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={rejecting || !rejectionReason.trim()}
            >
              {rejecting ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : null}
              Confirm Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Cancel Dialog ══════════════════════════════════════════════════ */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="size-5 text-amber-500" />
              Cancel Job Card
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this job card? This action can be reversed by an
              administrator.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowCancelDialog(false)} disabled={cancelling}>
              Keep Job Card
            </Button>
            <Button variant="outline" onClick={handleCancel} disabled={cancelling}
              className="border-amber-600/50 text-amber-600 hover:bg-amber-600/10"
            >
              {cancelling ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : null}
              Cancel Job Card
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Delete Dialog ══════════════════════════════════════════════════ */}
      <Dialog open={showDeleteDialog} onOpenChange={(open) => { setShowDeleteDialog(open); if (!open) setDeleteConfirmText(''); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-5" />
              Force Delete Job Card
            </DialogTitle>
            <DialogDescription>
              This will permanently delete the job card and all related data including items,
              expenses, and payments. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 px-4 rounded-md bg-destructive/10 border border-destructive/30">
            <p className="text-sm font-semibold text-destructive">
              Job Card: {jobInfo.jobCardTitle || jobInfo.jobNumber || id}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Status: {statusConfig.label}
            </p>
          </div>

          <div className="space-y-2 mt-4">
            <Label htmlFor="delete-confirm" className="text-xs font-bold text-muted-foreground uppercase">
              Type the job card number <code className="text-destructive font-mono bg-destructive/10 px-1 rounded">{jobInfo.jobNumber || id.substring(0, 8)}</code> to confirm:
            </Label>
            <Input
              id="delete-confirm"
              type="text"
              placeholder={jobInfo.jobNumber || id.substring(0, 8)}
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              className="font-mono text-sm border-destructive/20 focus:border-destructive"
              autoComplete="off"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleForceDelete} 
              disabled={deleting || deleteConfirmText !== (jobInfo.jobNumber || id.substring(0, 8))}
            >
              {deleting ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Trash2 className="size-4 mr-1.5" />}
              Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FileViewerModal 
        isOpen={!!viewerFile} 
        onClose={() => setViewerFile(null)} 
        url={viewerFile?.url || ''} 
        title={viewerFile?.title} 
      />
    </div>
  )
}
