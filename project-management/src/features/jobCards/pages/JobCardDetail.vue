<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useBreakpoints, breakpointsTailwind } from '@vueuse/core'
import { useRoute, useRouter } from 'vue-router'
import { db } from '@/lib/firebase'
import { doc, collection, onSnapshot, query, orderBy, getDoc, getDocs, where, updateDoc, serverTimestamp } from 'firebase/firestore'
import { useJobCardsStore } from '../store/jobCardsStore'
import { useSession } from '@/composables/useSession'
import { 
  Loader2, ArrowLeft, Clock, CheckCircle2, XCircle, Package, PackageMinus, 
  Receipt, Info, UserCheck, User, Users, Download, Edit, Trash2, Copy, 
  ChevronDown, FileText, FileSpreadsheet, PackageCheck, MoreVertical, Paperclip, Link2, Minus, Equal, PieChart, Plus, Eye, Lock, Wrench, TrendingUp,
  Upload, X
} from 'lucide-vue-next'
import { VisSingleContainer, VisDonut, VisTooltip } from '@unovis/vue'
import { Donut } from '@unovis/ts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import { formatCurrency } from '@/features/inventory/utils/pricing'
import { formatDate } from '@/lib/utils'
import { computeFinancials } from '@shared/financialEngine'
import JobInformationCard from '../components/JobInformationCard.vue'
import AGFStructureCard from '../components/AGFStructureCard.vue'
import InventoryRequisitionGrid from '../components/InventoryRequisitionGrid.vue'
import JobCardExpensesGrid from '../components/JobCardExpensesGrid.vue'
import InventoryReturnsGrid from '../components/InventoryReturnsGrid.vue'
import StaffRatesGrid from '../components/StaffRatesGrid.vue'
import AllocatedToolsGrid from '../components/AllocatedToolsGrid.vue'
import ToolReturnModal from '../components/ToolReturnModal.vue'
import { inventoryApi } from '@/features/inventory/api/inventoryApi'
import { toast } from 'vue-sonner'
import { useAdminStore } from '@/features/admin/store/adminStore'
import { useFinanceStore } from '@/features/fundTransfers/store/financeStore'
import { uploadProofOfPayment } from '@/features/fundTransfers/utils/financeUtils'
import { useHrStore } from '@/features/hr/store/hrStore'
import { useReferenceResolver } from '@/composables/useReferenceResolver'
import { 
  generateJobPdf, 
  generateApprovedRequisitionPdf, 
  generateApprovedExpensesPdf, 
  generatePaymentReceiptPdf, 
  generateFullJobCardPdf 
} from '../utils/generatePdf'
import { generatePerformanceReportPdf } from '../utils/generatePerformanceReportPdf'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { filterReturnableTools } from '../utils/toolFilters'

const route = useRoute()
const router = useRouter()
const store = useJobCardsStore()
const adminStore = useAdminStore()
const financeStore = useFinanceStore()
const hrStore = useHrStore()
const { user: sessionUser, claims: sessionClaims, roles } = useSession()
const { resolveJobCategoryName, resolveDepartmentName, resolvePaymentMethod } = useReferenceResolver()
const jobId = route.params.id as string

const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('lg')

const job = ref<any>(null)
const creatorName = ref<string>('Loading...')
const requisitionItems = ref<any[]>([])
const adHocExpenses = ref<any[]>([])
const staffRates = ref<any[]>([])
const inventoryReturns = ref<any[]>([])
const allocatedTools = ref<any[]>([])
const recordedPayments = ref<any[]>([])
const loading = ref(true)
const isProcessing = ref(false)
const isUploadingCommissionFile = ref<Record<string, boolean>>({})

// IRD Transfer
const showIrdTransferModal = ref(false)
const irdTransferring = ref(false)
const irdTransferFromAccount = ref<'BANK' | 'CASH' | 'ECOCASH'>('BANK')
const showToolReturnModal = ref(false)

const irdTransferStatus = computed(() => job.value?.irdTransfer || null)

async function handleIrdTransfer() {
  if (!job.value || irdTransferring.value) return
  irdTransferring.value = true
  try {
    const jobIdentifier = job.value.generalInfo?.jobNumber || jobId.substring(0, 8)
    const amount = effectiveFinancials.value?.irdNetRevenue || 0
    const userName = sessionUser.value?.displayName || sessionUser.value?.email || 'Unknown'
    
    // autoApprove is true only for Managers/Admins. Accountants initiate a pending request.
    const autoApprove = isManager.value

    await financeStore.initiateTransfer({
      fromAccount: irdTransferFromAccount.value,
      toAccount: 'IRD',
      amount,
      reference: `JC-${jobIdentifier}`,
      description: `IRD Remittance — Job Card ${jobIdentifier}`,
      jobCardId: jobId,
    }, { name: userName, email: sessionUser.value?.email || '' }, autoApprove)

    await updateDoc(doc(db, 'jobCards', jobId), {
      irdTransfer: {
        status: autoApprove ? 'COMPLETED' : 'PENDING_MANAGER',
        amount,
        fromAccount: irdTransferFromAccount.value,
        initiatedBy: userName,
        initiatedAt: serverTimestamp(),
      }
    })

    if (autoApprove) {
      toast.success('IRD transfer completed immediately to IRD Account')
    } else {
      toast.success('IRD transfer initiated — pending manager approval')
    }
    showIrdTransferModal.value = false
  } catch (e: any) {
    toast.error(e?.message || 'Failed to initiate IRD transfer')
  } finally {
    irdTransferring.value = false
  }
}

async function handleApproveIrdTransfer() {
  if (!job.value || !irdTransferStatus.value || irdTransferring.value) return
  
  const confirmed = confirm(`Are you sure you want to approve this IRD transfer of ${formatCurrency(irdTransferStatus.value.amount)}? This will move funds from ${irdTransferStatus.value.fromAccount} to IRD and update the ledger.`)
  if (!confirmed) return

  irdTransferring.value = true
  try {
    // 1. Locate the transfer document in the fundTransfers collection
    const q = query(
      collection(db, 'fundTransfers'), 
      where('jobCardId', '==', jobId),
      where('status', '==', 'PENDING_MANAGER')
    )
    const snap = await getDocs(q)
    
    if (snap.empty) {
        // Try fallback search for any pending transfer linked to this job
        const q2 = query(collection(db, 'fundTransfers'), where('jobCardId', '==', jobId), where('toAccount', '==', 'IRD'))
        const snap2 = await getDocs(q2)
        const pending = snap2.docs.find((d: any) => d.data().status !== 'COMPLETED')
        if (!pending) throw new Error('Transfer record not found in system.')
        
        await financeStore.approveTransfer(pending.id, { 
            name: sessionUser.value?.displayName || 'Manager', 
            email: sessionUser.value?.email || '' 
        })
    } else {
        await financeStore.approveTransfer(snap.docs[0]!.id, { 
            name: sessionUser.value?.displayName || 'Manager', 
            email: sessionUser.value?.email || '' 
        })
    }

    // 2. Update Job Card state
    await updateDoc(doc(db, 'jobCards', jobId), {
      'irdTransfer.status': 'COMPLETED',
      'irdTransfer.approvedBy': sessionUser.value?.displayName || sessionUser.value?.email || 'Manager',
      'irdTransfer.approvedAt': serverTimestamp()
    })

    toast.success('IRD Transfer Approved', { description: 'Funds have been moved and ledger updated.' })
  } catch (e: any) {
    toast.error('Approval Failed', { description: e?.message || 'Failed to approve IRD transfer' })
  } finally {
    irdTransferring.value = false
  }
}

async function notifyItemApproval(itemName: string, status: string) {
  try {
    const { auth } = await import('@/lib/firebase')
    const token = await auth.currentUser?.getIdToken()
    if (!token) return

    await fetch(`/api/job-cards/${jobId}/notify-item`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ itemName, status })
    })
  } catch (err) {
    console.error('Failed to send item approval notification:', err)
  }
}

const unsubscribers: (() => void)[] = []

async function resolveCreatorName(uid: string) {
  try {
    const userSnap = await getDoc(doc(db, 'users', uid))
    if (userSnap.exists()) {
      const data = userSnap.data()
      creatorName.value = data.displayName || data.email || uid
    } else {
      creatorName.value = job.value?.submittedBy?.name || 'Unknown User'
    }
  } catch (err) {
    console.error('Error resolving creator name:', err)
    creatorName.value = job.value?.submittedBy?.name || 'Unknown User'
  }
}

onMounted(() => {
  if (!jobId) {
    console.error('JobCardDetail mounted without jobId')
    return
  }

  // Hydrate admin and HR store reference data for resolving names
  adminStore.fetchAll()
  hrStore.fetchEmployees()

  // 1. Fetch Main Doc
  const docRef = doc(db, 'jobCards', jobId)
  unsubscribers.push(onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      job.value = { id: docSnap.id, ...docSnap.data() }
      if (job.value.submittedBy?.uid) {
        resolveCreatorName(job.value.submittedBy.uid)
      }

      // Feature: Read Embedded Layouts directly from Document (New Standard)
      if (Array.isArray(job.value.requisitionSections) && job.value.requisitionSections.length > 0) {
        // Heal any section items missing an id
        const sections = job.value.requisitionSections as any[]
        const anyMissing = sections.some((s: any) => (s.items || []).some((i: any) => !i.id))
        if (anyMissing) {
          const healed = sections.map((s: any) => ({
            ...s,
            items: (s.items || []).map((i: any) => ({
              ...i,
              id: i.id || crypto.randomUUID(),
              createdAt: i.createdAt || job.value?.createdAt || new Date().toISOString()
            }))
          }))
          const flatItems = healed.flatMap((s: any) => s.items.map((i: any) => ({ ...i, jobCategoryId: s.jobCategoryId })))
          requisitionItems.value = healed
          store.updateFullJobCard(jobId, { requisitionSections: healed, requisitionItems: flatItems })
        } else {
          // Even if not missing IDs, ensure timestamps exist for display
          requisitionItems.value = sections.map((s: any) => ({
            ...s,
            items: (s.items || []).map((i: any) => ({
              ...i,
              createdAt: i.createdAt || job.value?.createdAt || new Date().toISOString()
            }))
          }))
        }
      } else if (Array.isArray(job.value.requisitionItems) && job.value.requisitionItems.length > 0) {
        // Fallback/Migration: Group flat items into sections by category
        const groups: Record<string, any> = {}
        job.value.requisitionItems.forEach((item: any) => {
          const catId = item.jobCategoryId || 'unassigned'
          if (!groups[catId]) {
            groups[catId] = {
              id: crypto.randomUUID(),
              jobCategoryId: catId === 'unassigned' ? '' : catId,
              description: '',
              items: []
            }
          }
          groups[catId].items.push(item)
        })
        requisitionItems.value = Object.values(groups)
      }
      if (Array.isArray(job.value.adHocExpenses) && job.value.adHocExpenses.length > 0) {
        // Heal any items missing an id or attachmentUrls array
        const expenses = job.value.adHocExpenses as any[]
        const needsHealing = expenses.some((e: any) => !e.id || (e.attachmentUrl && !e.attachmentUrls))
        if (needsHealing) {
          const healed = expenses.map((e: any) => {
            let updated = { ...e }
            if (!updated.id) updated.id = crypto.randomUUID()
            if (!updated.createdAt) updated.createdAt = job.value?.createdAt || new Date().toISOString()
            if (updated.attachmentUrl && !updated.attachmentUrls) {
              updated.attachmentUrls = [updated.attachmentUrl]
            } else if (!updated.attachmentUrls) {
              updated.attachmentUrls = []
            }
            return updated
          })
          adHocExpenses.value = healed
          store.updateJobCardArray(jobId, 'adHocExpenses', healed)
        } else {
          adHocExpenses.value = expenses.map((e: any) => ({
            ...e,
            createdAt: e.createdAt || job.value?.createdAt || new Date().toISOString()
          }))
        }
      }
      if (Array.isArray(job.value.inventoryReturns) && job.value.inventoryReturns.length > 0) {
        const returns = job.value.inventoryReturns as any[]
        const missingIds = returns.some((r: any) => !r.id)
        if (missingIds) {
          const healed = returns.map((r: any) => r.id ? r : { ...r, id: crypto.randomUUID() })
          inventoryReturns.value = healed
          store.updateJobCardArray(jobId, 'inventoryReturns', healed)
        } else {
          inventoryReturns.value = returns
        }
      }
      if (Array.isArray(job.value.staffRates) && job.value.staffRates.length > 0) {
        const rates = job.value.staffRates as any[]
        const missingIds = rates.some((r: any) => !r.id)
        if (missingIds) {
          const healed = rates.map((r: any) => ({
            ...r,
            id: r.id || crypto.randomUUID(),
            createdAt: r.createdAt || job.value?.createdAt || new Date().toISOString()
          }))
          staffRates.value = healed
          store.updateJobCardArray(jobId, 'staffRates', healed)
        } else {
          staffRates.value = rates.map((r: any) => ({
            ...r,
            createdAt: r.createdAt || job.value?.createdAt || new Date().toISOString()
          }))
        }
      }
      if (Array.isArray(job.value.allocatedTools)) {
        allocatedTools.value = job.value.allocatedTools
      } else {
        allocatedTools.value = []
      }
    }
    loading.value = false
  }, (err) => {
    console.error('Snapshot error (main):', err)
    toast.error('Permission Denied', { description: 'You cannot view this Job Card.' })
    router.push('/job-cards')
  }))

  const normalizeJobCardItem = (item: any) => ({
    ...item,
    itemName: item.itemName || item.inventoryItemName || 'Unnamed Item',
    qty: item.qty || item.qtyRequired || 0,
    irdSellingPrice:  item.irdSellingPrice || item.irdSellingPriceSnapshot || 0,
    costSnapshot:     item.costSnapshot || item.purchaseCostSnapshot || item.totalCostSnapshot || 0,
    twidMarkupPercent: item.twidMarkupPercent || item.markupPercent || 0,
    rowIRDTot:        item.rowIRDTot || item.rowIRDTotal || 0,
    rowMUTot:         item.rowMUTot  || item.rowMUTotal  || 0,
    rowGrandTot:      item.rowGrandTot || item.rowGrandTotal || 0
  })

  // 2. Fetch Requisition Items (Fallback for older JobCards)
  const itemsRef = collection(db, 'jobCards', jobId, 'items')
  unsubscribers.push(onSnapshot(itemsRef, (snap) => {
    // Only use subcollections if the main document didn't already supply them
    if (requisitionItems.value.length === 0) {
      const rawItems = snap.docs.map(d => normalizeJobCardItem({ id: d.id, ...d.data() }))
      const sortedItems = rawItems.sort((a, b) => {
        const timeA = a.updatedAt?.toMillis?.() || 0
        const timeB = b.updatedAt?.toMillis?.() || 0
        return timeA - timeB
      })

      // Group flat subcollection items into sections
      const groups: Record<string, any> = {}
      sortedItems.forEach((item: any) => {
        const catId = item.jobCategoryId || 'unassigned'
        if (!groups[catId]) {
          groups[catId] = {
            id: crypto.randomUUID(),
            jobCategoryId: catId === 'unassigned' ? '' : catId,
            description: '',
            items: []
          }
        }
        groups[catId].items.push(item)
      })
      requisitionItems.value = Object.values(groups)
    }
  }, (err) => console.error("Items fetch error:", err)))

  // 3. Fetch Ad-hoc Expenses (Fallback for older JobCards)
  const expRef = collection(db, 'jobCards', jobId, 'expenses')
  unsubscribers.push(onSnapshot(expRef, (snap) => {
    if (!job.value?.adHocExpenses || job.value?.adHocExpenses.length === 0) {
      const rawExp = snap.docs.map(d => ({ id: d.id, ...d.data() } as any))
      adHocExpenses.value = rawExp.sort((a, b) => {
        const timeA = a.createdAt?.toMillis?.() || 0
        const timeB = b.createdAt?.toMillis?.() || 0
        return timeA - timeB
      })
    }
  }, (err) => console.error("Expenses fetch error:", err)))

  // 4. Fetch Inventory Returns (Fallback)
  const retRef = collection(db, 'jobCards', jobId, 'returns')
  unsubscribers.push(onSnapshot(retRef, (snap) => {
    if (!job.value?.inventoryReturns || job.value?.inventoryReturns.length === 0) {
      const rawRet = snap.docs.map(d => ({ id: d.id, ...d.data() } as any))
      inventoryReturns.value = rawRet.sort((a, b) => {
        const timeA = a.updatedAt?.toMillis?.() || 0
        const timeB = b.updatedAt?.toMillis?.() || 0
        return timeA - timeB
      })
    }
  }, (err) => console.error("Returns fetch error:", err)))

  // 5. Fetch Payments Log
  const paymentsRef = collection(db, 'jobPayments')
  const paymentsQ = query(paymentsRef, where('jobCardId', '==', jobId))
  unsubscribers.push(onSnapshot(paymentsQ, (snap) => {
    const raw = snap.docs.map(d => ({ id: d.id, ...d.data() } as any))
    recordedPayments.value = raw.sort((a, b) => {
      const timeA = a.createdAt?.toMillis?.() || 0
      const timeB = b.createdAt?.toMillis?.() || 0
      return timeB - timeA
    })
  }, (err) => console.error("Payments fetch error:", err)))
})

onUnmounted(() => {
  unsubscribers.forEach(unsub => unsub())
})

const getGlobalMaterialIndex = (sIdx: number, iIdx: number) => {
  let count = 0
  for (let i = 0; i < sIdx; i++) {
    count += (requisitionItems.value[i].items || []).length
  }
  return count + iIdx + 1
}

// Approval Logic Helpers
const currentRole = computed(() => {
  const roles = sessionClaims.value?.roles || []
  if (roles.includes('SUPER_ADMIN')) return 'SUPER_ADMIN'
  if (roles.includes('ADMIN')) return 'ADMIN'
  if (roles.includes('MANAGER')) return 'MANAGER'
  if (roles.includes('ACCOUNTANT')) return 'ACCOUNTANT'
  if (roles.includes('TECHNICAL')) return 'TECHNICAL'
  return 'GUEST'
})

const canApprove = computed(() => {
  if (!job.value) return false
  const status = job.value.status
  const role = currentRole.value

  if (['ADMIN', 'SUPER_ADMIN'].includes(role)) return true

  // State: SUBMITTED -> APPROVAL_PENDING_ACCOUNTANT
  if (status === 'SUBMITTED' && role === 'ACCOUNTANT') return true

  // Requirement: ACCOUNTANT approve only when status = APPROVAL_PENDING_ACCOUNTANT
  if (status === 'APPROVAL_PENDING_ACCOUNTANT' && role === 'ACCOUNTANT') return true

  // Requirement: MANAGER approve only when status = APPROVAL_PENDING_MANAGER
  if (status === 'APPROVAL_PENDING_MANAGER' && role === 'MANAGER') return true

  return false
})

const approvalButtonLabel = computed(() => {
  if (!job.value) return 'Loading...'
  if (!canApprove.value) return 'Awaiting Approval / Not Authorized'

  const status = job.value.status
  if (status === 'APPROVAL_PENDING_ACCOUNTANT') return 'Approve as Accountant'
  if (status === 'APPROVAL_PENDING_MANAGER') return 'Approve as Manager'
  if (status === 'SUBMITTED') return 'Approve'
  return 'Approve Stage'
})

// Item Level Permissions
const isMainJobApproved = computed(() => {
  return ['SUBMITTED', 'APPROVAL_PENDING_ACCOUNTANT', 'APPROVAL_PENDING_MANAGER', 'APPROVED_ACCOUNTANT', 'APPROVED_MANAGER', 'APPROVED_FINAL', 'COMPLETED', 'CLOSED'].includes(job.value?.status)
})

const isMainJobApprovedByManager = computed(() => {
  return ['APPROVED_MANAGER', 'APPROVED_FINAL', 'COMPLETED', 'CLOSED'].includes(job.value?.status)
})

const isAccountant = computed(() => {
  const r = roles.value
  return r.includes('ACCOUNTANT') || r.includes('ADMIN') || r.includes('SUPER_ADMIN')
})

const isManager = computed(() => {
  const r = roles.value
  return r.includes('MANAGER') || r.includes('ADMIN') || r.includes('SUPER_ADMIN')
})

const isAdminOrSuperAdmin = computed(() => {
  const role = currentRole.value
  return role === 'ADMIN' || role === 'SUPER_ADMIN'
})

const handleItemApproval = async (
  arrayField: 'requisitionItems' | 'adHocExpenses' | 'inventoryReturns' | 'staffRates',
  itemId: string,
  newStatus: 'APPROVED_ACCOUNTANT' | 'APPROVED_MANAGER' | 'REJECTED'
) => {
  isProcessing.value = true
  try {
    if (arrayField === 'requisitionItems') {
      const isSectionBased = requisitionItems.value.length > 0 && requisitionItems.value[0].items !== undefined

      if (isSectionBased) {
        // Handle Nested Sections
        const clonedSections = requisitionItems.value.map(s => ({
          ...s,
          items: s.items.map((i: any) => ({ ...i }))
        }))

        let foundItem: any = null
        if (newStatus === 'REJECTED') {
           clonedSections.forEach(s => {
             s.items = s.items.filter((i: any) => {
               if (i.id === itemId) {
                 foundItem = i
                 return false
               }
               return true
             })
           })
        } else {
          for (const section of clonedSections) {
            const item = section.items.find((i: any) => i.id === itemId)
            if (item) {
              item.approvalStatus = newStatus
              if (newStatus === 'APPROVED_MANAGER') {
                item.approvedAt = new Date().toISOString()
              }
              foundItem = item
              break
            }
          }
        }

        if (!foundItem) throw new Error('Item not found in sections')

        // AUTOMATIC STOCK DEDUCTION (Per Item)
        if (newStatus === 'APPROVED_MANAGER') {
          if (foundItem.inventoryItemId && !foundItem.inventoryDeducted) {
            const qty = Number(foundItem.qtyRequired || foundItem.quantity || 0)
            if (qty > 0) {
              try {
                await inventoryApi.adjustStock(foundItem.inventoryItemId, {
                  type: 'REMOVE',
                  qty,
                  reason: `Item Approved: ${job.value?.generalInfo?.jobNumber || jobId}`,
                  reference: job.value?.generalInfo?.jobNumber || jobId,
                  unitCost: Number(foundItem.unitCost || foundItem.costSnapshot || 0)
                })
                foundItem.inventoryDeducted = true
                toast.success('Stock Deducted', { description: `${qty} units subtracted from inventory.` })
              } catch (err: any) {
                console.error('Stock deduction failed:', err)
                toast.error('Stock Deduction Failed', { description: err.message })
                // We don't throw here to allow the status update to proceed, 
                // but the item won't be marked as inventoryDeducted.
              }
            }
          } else if (!foundItem.inventoryItemId) {
            toast.warning('Not Linked to Inventory', { description: 'This item is not linked to a stock record and will not be deducted.' })
          }
        }

        const flattenedItems = clonedSections.flatMap(s => s.items.map((i: any) => ({ ...i, jobCategoryId: s.jobCategoryId })))

        await store.updateFullJobCard(jobId, {
          requisitionSections: clonedSections,
          requisitionItems: flattenedItems
        })

        requisitionItems.value = clonedSections
      } else {
        // Handle Legacy Flat Items
        let clonedItems = requisitionItems.value.map(i => ({ ...i }))
        const itemIndex = clonedItems.findIndex(i => i.id === itemId)
        if (itemIndex === -1) throw new Error('Item not found')

        if (newStatus === 'REJECTED') {
          clonedItems = clonedItems.filter(i => i.id !== itemId)
        } else {
          clonedItems[itemIndex].approvalStatus = newStatus
          if (newStatus === 'APPROVED_MANAGER') {
            const item = clonedItems[itemIndex]
            item.approvedAt = new Date().toISOString()
            
            // AUTOMATIC STOCK DEDUCTION (Per Item)
            if (item.inventoryItemId && !item.inventoryDeducted) {
               const qty = Number(item.qtyRequired || item.quantity || 0)
               if (qty > 0) {
                 try {
                   await inventoryApi.adjustStock(item.inventoryItemId, {
                     type: 'REMOVE',
                     qty,
                     reason: `Item Approved: ${job.value?.generalInfo?.jobNumber || jobId}`,
                     reference: job.value?.generalInfo?.jobNumber || jobId,
                     unitCost: Number(item.unitCost || item.costSnapshot || 0)
                   })
                   item.inventoryDeducted = true
                   toast.success('Stock Deducted', { description: `${qty} units subtracted from inventory.` })
                 } catch (err: any) {
                    console.error('Stock deduction failed:', err)
                    toast.error('Stock Deduction Failed', { description: err.message })
                 }
               }
            } else if (!item.inventoryItemId) {
              toast.warning('Not Linked to Inventory', { description: 'This item is not linked to a stock record and will not be deducted.' })
            }
          }
        }

        await store.updateJobCardArray(jobId, 'requisitionItems', clonedItems)
        requisitionItems.value = clonedItems
      }
    } else if (arrayField === 'adHocExpenses') {
      // Handle Ad-hoc Expenses (Flat)
      const clonedArray = adHocExpenses.value.map(i => ({ ...i }))
      const itemIndex = clonedArray.findIndex(i => i.id === itemId)

      if (itemIndex === -1) throw new Error('Item not found')

      if (newStatus === 'REJECTED') {
        const filtered = clonedArray.filter(i => i.id !== itemId)
        await store.updateJobCardArray(jobId, arrayField, filtered)
        adHocExpenses.value = filtered
        return // Exit early as item is deleted
      }

      clonedArray[itemIndex].approvalStatus = newStatus
      
      // Auto-approve rule for Accountant: < $300 moves to APPROVED_MANAGER
      const item = clonedArray[itemIndex]
      const amount = Number(item.totalAmount || (item.quantity || 0) * (item.unitPrice || 0))
      if (isAccountant.value && amount < 300 && newStatus === 'APPROVED_ACCOUNTANT') {
        clonedArray[itemIndex].approvalStatus = 'APPROVED_MANAGER'
      }

      const finalStatus = clonedArray[itemIndex].approvalStatus

      if (finalStatus === 'APPROVED_MANAGER') {
        clonedArray[itemIndex].approvedAt = new Date().toISOString()
      }

      await store.updateJobCardArray(jobId, arrayField, clonedArray)

      // AUTOMATIC LEDGER DEDUCTION
      if (finalStatus === 'APPROVED_MANAGER') {
        const expenseItem = clonedArray[itemIndex]
        const jobIdentifier = job.value?.generalInfo?.jobNumber || job.value?.id?.substring(0, 8) || 'Unknown Job'

        const ledgerPayload = {
          category: 'job-card-expense',
          amount: Number(expenseItem.totalAmount || 0),
          paymentMethod: (expenseItem.paymentMethod || 'cash').toLowerCase(),
          description: `Job Card ${jobIdentifier} - ${expenseItem.description || 'Ad-hoc expense'}`,
          attachmentUrl: (expenseItem.attachmentUrls && expenseItem.attachmentUrls[0]) || expenseItem.attachmentUrl || null,
          attachmentUrls: expenseItem.attachmentUrls || (expenseItem.attachmentUrl ? [expenseItem.attachmentUrl] : []),
          status: 'APPROVED',
          sourceJobId: jobId,
          sourceItemId: expenseItem.id
        }

        await financeStore.recordExpense(ledgerPayload)
      }

      adHocExpenses.value = clonedArray
    } else if (arrayField === 'inventoryReturns') {
      // Handle Inventory Returns
      const clonedArray = inventoryReturns.value.map(i => ({ ...i }))
      const itemIndex = clonedArray.findIndex(i => i.id === itemId)

      if (itemIndex === -1) throw new Error('Return item not found')

      if (newStatus === 'REJECTED') {
        const filtered = clonedArray.filter(i => i.id !== itemId)
        await store.updateJobCardArray(jobId, arrayField, filtered)
        inventoryReturns.value = filtered
        return // Exit early
      }

      clonedArray[itemIndex].approvalStatus = newStatus
      
      // AUTOMATIC STOCK INCREMENT
      if (newStatus === 'APPROVED_MANAGER') {
        const returnItem = clonedArray[itemIndex]
        const jobIdentifier = job.value?.generalInfo?.jobNumber || job.value?.id?.substring(0, 8) || 'Unknown Job'

        if (returnItem.inventoryItemId && !returnItem.inventoryReturned) {
          try {
            await inventoryApi.adjustStock(returnItem.inventoryItemId, {
              type: 'ADD',
              qty: Number(returnItem.qtyReturned || 0),
              reason: `Return from Job ${jobIdentifier}`,
              reference: jobId
            })
            clonedArray[itemIndex].inventoryReturned = true
            clonedArray[itemIndex].approvedAt = new Date().toISOString()
            toast.success('Inventory Updated', { description: `Stock level increased by ${returnItem.qtyReturned}` })
          } catch (err: any) {
            console.error('Stock increment failed:', err)
            toast.error('Inventory Update Failed', { description: err.message })
            // Note: item won't be marked as inventoryReturned if this fails.
          }
        }
      }

      await store.updateJobCardArray(jobId, arrayField, clonedArray)
      inventoryReturns.value = clonedArray
    } else if (arrayField === 'staffRates') {
      // Handle Staff Rates
      const clonedArray = staffRates.value.map(i => ({ ...i }))
      const itemIndex = clonedArray.findIndex(i => i.id === itemId)

      if (itemIndex === -1) throw new Error('Staff rate not found')

      if (newStatus === 'REJECTED') {
        const filtered = clonedArray.filter(i => i.id !== itemId)
        await store.updateJobCardArray(jobId, 'staffRates', filtered)
        staffRates.value = filtered
        return
      }

      clonedArray[itemIndex].approvalStatus = newStatus
      if (newStatus === 'APPROVED_MANAGER') {
        clonedArray[itemIndex].approvedAt = new Date().toISOString()
      }

      await store.updateJobCardArray(jobId, 'staffRates', clonedArray)

      // AUTOMATIC PAYROLL POSTING
      if (newStatus === 'APPROVED_MANAGER') {
        const { postJobEarningsToPayroll } = await import('../utils/payrollIntegration')
        const jobDate = new Date() // Target the current month when the rate is approved/completed
        const jobNumber = job.value?.generalInfo?.jobNumber || jobId.substring(0, 8)
        const results = await postJobEarningsToPayroll(jobId, jobNumber, [clonedArray[itemIndex]], jobDate)

        staffRates.value = clonedArray

        if (results.length > 0) {
          const r = results[0]
          const MONTH_NAMES = ['January','February','March','April','May','June',
            'July','August','September','October','November','December']
          toast.success('Payroll Updated', {
            description: `$${r!.amount.toFixed(2)} added to ${r!.employeeName}'s ${MONTH_NAMES[r!.month - 1]} ${r!.year} payroll`
          })
        }
      }

      staffRates.value = clonedArray
    }

    // TRIGGER NOTIFICATION
    const itemName = arrayField === 'requisitionItems' ? 'Material Item' 
                    : arrayField === 'adHocExpenses' ? 'Ad-hoc Expense'
                    : arrayField === 'staffRates' ? 'Staff Rate'
                    : 'Inventory Return'
    notifyItemApproval(itemName, newStatus)

    const msg = newStatus === 'REJECTED' ? 'Item Rejected and Removed' : `Item marked as ${newStatus}`
    toast.success('Item Status Updated', { description: msg })
  } catch (err: any) {
    toast.error('Item Update Failed', { description: err.message })
  } finally {
    isProcessing.value = false
  }
}

const handleApproval = async () => {
  const warningMsg = `IMPORTANT: Please verify all figures in the job card before proceeding.\n\nNote: Approving the Job Card status will NOT automatically approve individual material or expense items. You must approve these items within their respective grids to ensure they are correctly recorded in the financial ledger and stock levels.`
  
  if (!confirm(warningMsg)) return

  isProcessing.value = true
  try {
    const role = currentRole.value
    const name = sessionUser.value?.displayName || sessionUser.value?.email || 'Unknown User'
    await store.approveJobCard(jobId, job.value.status, role, name)
    toast.success('Status Updated', { description: 'The job card has moved to the next approval stage.' })
  } catch (err: any) {
    toast.error('Approval Failed', { description: err.message })
  } finally {
    isProcessing.value = false
  }
}

const handleCloseJobCard = async () => {
  const checklist = job.value.toolReturnChecklist || []
  let hasOutstandingTools = false
  
  if (checklist.length > 0) {
    hasOutstandingTools = !checklist.every((i: any) => i.returned)
  } else {
    const toolItems = filterReturnableTools(job.value.requisitionSections, resolveJobCategoryName)
    hasOutstandingTools = toolItems.length > 0
  }
  
  if (hasOutstandingTools) {
    toast.error('Tools Not Returned', { 
      description: 'Please verify that all tools have been returned before closing the job.',
      action: {
        label: 'Checklist',
        onClick: () => showToolReturnModal.value = true
      }
    })
    return
  }

  const warningMsg = `Are you sure you want to CLOSE this Job Card?\n\nThis action will officially lock the Total Invoice Value and Implementation Cost targets. Any subsequent edits will be treated as formal adjustments (Profit reduction).`
  
  if (!confirm(warningMsg)) return

  isProcessing.value = true
  try {
    const role = currentRole.value
    const name = sessionUser.value?.displayName || sessionUser.value?.email || 'Unknown User'
    await store.approveJobCard(jobId, job.value.status, role, name)
    toast.success('Job Card Closed', { description: 'Financial benchmarks have been locked.' })
  } catch (err: any) {
    toast.error('Closing Failed', { description: err.message })
  } finally {
    isProcessing.value = false
  }
}

// Determine the next approval status for the current user's role
const nextItemApprovalStatus = computed<'APPROVED_ACCOUNTANT' | 'APPROVED_MANAGER' | null>(() => {
  if (isManager.value) return 'APPROVED_MANAGER'
  if (isAccountant.value) return 'APPROVED_ACCOUNTANT'
  return null
})

const getExpenseAmount = (expense: any) => {
  return Number(expense.totalAmount) || Number((expense.quantity || 0) * (expense.unitPrice || 0))
}

const pendingAdHocApprovalSummary = computed(() => {
  const pendingExpenses = adHocExpenses.value.filter((expense: any) => {
    return !expense.approvalStatus || expense.approvalStatus === 'PENDING'
  })

  const total = pendingExpenses.reduce((sum: number, expense: any) => sum + getExpenseAmount(expense), 0)

  return {
    count: pendingExpenses.length,
    total,
    label: 'Pending expenses'
  }
})

// Unlock a PDF download for an item by removing the lock flag (preserves approval)
const handleUnlockPdf = async (
  arrayField: 'requisitionItems' | 'adHocExpenses' | 'inventoryReturns' | 'staffRates',
  itemId: string
) => {
  isProcessing.value = true
  try {
    if (arrayField === 'requisitionItems') {
      const isSectionBased = requisitionItems.value.length > 0 && requisitionItems.value[0].items !== undefined
      if (isSectionBased) {
        const clonedSections = requisitionItems.value.map(s => ({
          ...s,
          items: s.items.map((i: any) => {
            if (i.id !== itemId) return { ...i }
            const updated = { ...i }
            delete updated.isLockedAgainstPdf // ONLY unlock for PDF re-download
            return updated
          })
        }))
        const flattenedItems = clonedSections.flatMap((s: any) =>
          s.items.map((i: any) => ({ ...i, jobCategoryId: s.jobCategoryId }))
        )
        await store.updateFullJobCard(jobId, { requisitionSections: clonedSections, requisitionItems: flattenedItems })
        requisitionItems.value = clonedSections
      } else {
        const clonedItems = requisitionItems.value.map((i: any) => {
          if (i.id !== itemId) return { ...i }
          const updated = { ...i }
          delete updated.isLockedAgainstPdf
          return updated
        })
        await store.updateJobCardArray(jobId, 'requisitionItems', clonedItems)
        requisitionItems.value = clonedItems
      }
    } else {
      const source = arrayField === 'adHocExpenses' ? adHocExpenses.value 
        : arrayField === 'staffRates' ? staffRates.value 
        : inventoryReturns.value
      const clonedArray = source.map((i: any) => {
        if (i.id !== itemId) return { ...i }
        const updated = { ...i }
        delete updated.isLockedAgainstPdf // ONLY unlock for PDF re-download
        return updated
      })
      await store.updateJobCardArray(jobId, arrayField, clonedArray)
      if (arrayField === 'adHocExpenses') adHocExpenses.value = clonedArray
      else if (arrayField === 'staffRates') staffRates.value = clonedArray
      else inventoryReturns.value = clonedArray
    }
    toast.success('PDF Unlocked', { description: 'The download button is now available again.' })
  } catch (err: any) {
    toast.error('Unlock Failed', { description: err.message })
  } finally {
    isProcessing.value = false
  }
}

// Re-invoke a rejected job card back to SUBMITTED
const handleReInvokeJobCard = async () => {
  isProcessing.value = true
  try {
    await store.updateJobCardStatus(jobId, 'SUBMITTED', {
      user: sessionUser.value?.displayName || sessionUser.value?.email || 'Unknown User',
      role: currentRole.value,
      status: 'Re-invoked — returned to Submitted'
    })
    toast.success('Job Card Re-invoked', { description: 'Status reset to Submitted. It can now go through approvals again.' })
  } catch (err: any) {
    toast.error('Re-invoke Failed', { description: err.message })
  } finally {
    isProcessing.value = false
  }
}

const handleApproveAllInventory = async () => {
  if (!nextItemApprovalStatus.value) return
  isProcessing.value = true
  try {
    const targetStatus = nextItemApprovalStatus.value
    const isSectionBased = requisitionItems.value.length > 0 && requisitionItems.value[0].items !== undefined

    if (isSectionBased) {
      const clonedSections = requisitionItems.value.map(s => ({
        ...s,
        items: s.items.map((i: any) => ({ ...i }))
      }))

      for (const section of clonedSections) {
        for (const item of section.items) {
          const alreadyApproved = item.approvalStatus === 'APPROVED_MANAGER'
          const needsManager = targetStatus === 'APPROVED_MANAGER' && item.approvalStatus === 'APPROVED_ACCOUNTANT'
          const needsAccountant = targetStatus === 'APPROVED_ACCOUNTANT' && !item.approvalStatus

          if (!alreadyApproved && (needsManager || needsAccountant)) {
             item.approvalStatus = targetStatus
             if (targetStatus === 'APPROVED_MANAGER') {
                item.approvedAt = new Date().toISOString()
                
                // AUTOMATIC STOCK DEDUCTION (Per Item)
                if (item.inventoryItemId && !item.inventoryDeducted) {
                   const qty = Number(item.qtyRequired || item.quantity || 0)
                   if (qty > 0) {
                      try {
                        await inventoryApi.adjustStock(item.inventoryItemId, {
                          type: 'REMOVE',
                          qty,
                          reason: `Bulk Item Approval: ${job.value?.generalInfo?.jobNumber || jobId}`,
                          reference: job.value?.generalInfo?.jobNumber || jobId,
                          unitCost: Number(item.unitCost || item.costSnapshot || 0)
                        })
                        item.inventoryDeducted = true
                        toast.success('Stock Deducted', { description: `${qty} units of ${item.itemName || 'item'} subtracted.` })
                      } catch (err: any) {
                        console.error(`Failed to deduct stock for ${item.itemName}:`, err)
                        toast.error('Deduction Failed', { description: `Failed to deduct ${item.itemName}: ${err.message}` })
                      }
                   }
                } else if (!item.inventoryItemId) {
                   toast.warning('Item Not Linked', { description: `${item.itemName || 'An item'} is not linked to inventory.` })
                }
             }
          }
        }
      }

      const flattenedItems = clonedSections.flatMap((s: any) =>
        s.items.map((i: any) => ({ ...i, jobCategoryId: s.jobCategoryId }))
      )
      await store.updateFullJobCard(jobId, {
        requisitionSections: clonedSections,
        requisitionItems: flattenedItems
      })
      requisitionItems.value = clonedSections
    } else {
      const clonedItems = requisitionItems.value.map((i: any) => ({ ...i }))
      
      for (const item of clonedItems) {
        const alreadyApproved = item.approvalStatus === 'APPROVED_MANAGER'
        const needsManager = targetStatus === 'APPROVED_MANAGER' && item.approvalStatus === 'APPROVED_ACCOUNTANT'
        const needsAccountant = targetStatus === 'APPROVED_ACCOUNTANT' && !item.approvalStatus

        if (!alreadyApproved && (needsManager || needsAccountant)) {
          item.approvalStatus = targetStatus
          if (targetStatus === 'APPROVED_MANAGER') {
             item.approvedAt = new Date().toISOString()
             
             // AUTOMATIC STOCK DEDUCTION (Per Item)
             if (item.inventoryItemId && !item.inventoryDeducted) {
                const qty = Number(item.qtyRequired || item.quantity || 0)
                if (qty > 0) {
                   try {
                     await inventoryApi.adjustStock(item.inventoryItemId, {
                       type: 'REMOVE',
                       qty,
                       reason: `Bulk Item Approval: ${job.value?.generalInfo?.jobNumber || jobId}`,
                       reference: job.value?.generalInfo?.jobNumber || jobId,
                       unitCost: Number(item.unitCost || item.costSnapshot || 0)
                     })
                     item.inventoryDeducted = true
                     toast.success('Stock Deducted', { description: `${qty} units of ${item.itemName || 'item'} subtracted.` })
                   } catch (err: any) {
                     console.error(`Failed to deduct stock for ${item.itemName}:`, err)
                     toast.error('Deduction Failed', { description: `Failed to deduct ${item.itemName}: ${err.message}` })
                   }
                }
             } else if (!item.inventoryItemId) {
                toast.warning('Item Not Linked', { description: `${item.itemName || 'An item'} is not linked to inventory.` })
             }
          }
        }
      }

      await store.updateJobCardArray(jobId, 'requisitionItems', clonedItems)
      requisitionItems.value = clonedItems
    }
    
    notifyItemApproval('All Material Items', targetStatus)

    toast.success('All Inventory Items Approved', { description: `Marked all eligible items as ${targetStatus}` })
  } catch (err: any) {
    toast.error('Approve All Failed', { description: err.message })
  } finally {
    isProcessing.value = false
  }
}

const handleApproveAllExpenses = async () => {
  if (!nextItemApprovalStatus.value) return
  isProcessing.value = true
  try {
    const targetStatus = nextItemApprovalStatus.value
    const clonedArray = adHocExpenses.value.map((e: any) => {
      const alreadyApproved = e.approvalStatus === 'APPROVED_MANAGER'
      const needsAccountant = targetStatus === 'APPROVED_ACCOUNTANT' && !e.approvalStatus
      const needsManager = targetStatus === 'APPROVED_MANAGER' && e.approvalStatus === 'APPROVED_ACCOUNTANT'
      if (alreadyApproved) return { ...e }
      if (needsAccountant || needsManager) {
        let finalStatus = targetStatus
        
        // Auto-approve rule for Accountant: < $300 moves to APPROVED_MANAGER
        if (isAccountant.value && targetStatus === 'APPROVED_ACCOUNTANT') {
          const amount = Number(e.totalAmount || (e.quantity || 0) * (e.unitPrice || 0))
          if (amount < 300) {
            finalStatus = 'APPROVED_MANAGER'
          }
        }

        return { 
          ...e, 
          approvalStatus: finalStatus,
          approvedAt: finalStatus === 'APPROVED_MANAGER' ? new Date().toISOString() : e.approvedAt
        }
      }
      return { ...e }
    })
    await store.updateJobCardArray(jobId, 'adHocExpenses', clonedArray)

    // For manager approval: record ledger entries for all newly approved expenses
    if (targetStatus === 'APPROVED_MANAGER') {
      const jobIdentifier = job.value?.generalInfo?.jobNumber || job.value?.id?.substring(0, 8) || 'Unknown Job'
      for (const exp of clonedArray) {
        const original = adHocExpenses.value.find((e: any) => e.id === exp.id)
        if (exp.approvalStatus === 'APPROVED_MANAGER' && original?.approvalStatus !== 'APPROVED_MANAGER') {
          await financeStore.recordExpense({
            category: 'job-card-expense',
            amount: Number(exp.totalAmount || 0),
            paymentMethod: (exp.paymentMethod || 'cash').toLowerCase(),
            description: `Job Card ${jobIdentifier} - ${exp.description || 'Ad-hoc expense'}`,
            attachmentUrl: (exp.attachmentUrls && exp.attachmentUrls[0]) || exp.attachmentUrl || null,
            attachmentUrls: exp.attachmentUrls || (exp.attachmentUrl ? [exp.attachmentUrl] : []),
            status: 'APPROVED',
            sourceJobId: jobId,
            sourceItemId: exp.id
          })
        }
      }
    }

    adHocExpenses.value = clonedArray
    
    notifyItemApproval('All Ad-hoc Expenses', targetStatus)

    toast.success('All Expenses Approved', { description: `Marked all eligible expenses as ${targetStatus}` })
  } catch (err: any) {
    toast.error('Approve All Failed', { description: err.message })
  } finally {
    isProcessing.value = false
  }
}

const handleApproveAllStaffRates = async () => {
  if (!nextItemApprovalStatus.value) return
  isProcessing.value = true
  try {
    const targetStatus = nextItemApprovalStatus.value
    const freshlyApprovedItems: any[] = []

    const clonedArray = staffRates.value.map((r: any) => {
      const alreadyApproved = r.approvalStatus === 'APPROVED_MANAGER'
      const needsAccountant = targetStatus === 'APPROVED_ACCOUNTANT' && !r.approvalStatus
      const needsManager = targetStatus === 'APPROVED_MANAGER' && r.approvalStatus === 'APPROVED_ACCOUNTANT'
      if (alreadyApproved) return { ...r }
      if (needsAccountant || needsManager) {
        const updated = { 
          ...r, 
          approvalStatus: targetStatus,
          approvedAt: targetStatus === 'APPROVED_MANAGER' ? new Date().toISOString() : r.approvedAt
        }
        if (targetStatus === 'APPROVED_MANAGER') {
          freshlyApprovedItems.push(updated)
        }
        return updated
      }
      return { ...r }
    })
    await store.updateJobCardArray(jobId, 'staffRates', clonedArray)

    // AUTOMATIC PAYROLL POSTING FOR BULK APPROVAL
    if (targetStatus === 'APPROVED_MANAGER' && freshlyApprovedItems.length > 0) {
      const { postJobEarningsToPayroll } = await import('../utils/payrollIntegration')
      const jobDate = new Date() // Target the current month when rates are approved/completed
      const jobNumber = job.value?.generalInfo?.jobNumber || jobId.substring(0, 8)
      
      const results = await postJobEarningsToPayroll(jobId, jobNumber, freshlyApprovedItems, jobDate)
      
      if (results.length > 0) {
        const totalAmount = results.reduce((sum, r) => sum + r.amount, 0)
        toast.success('Payroll Updated', {
          description: `Total $${totalAmount.toFixed(2)} posted to payroll for ${results.length} staff members.`
        })
      }
    }

    staffRates.value = clonedArray
    
    notifyItemApproval('All Staff Rates', targetStatus)

    toast.success('All Staff Rates Approved', { description: `Marked all eligible staff rates as ${targetStatus}` })
  } catch (err: any) {
    toast.error('Approve All Failed', { description: err.message })
  } finally {
    isProcessing.value = false
  }
}

const handleApproveAllReturns = async () => {
  if (!nextItemApprovalStatus.value) return
  isProcessing.value = true
  try {
    const targetStatus = nextItemApprovalStatus.value
    const clonedArray = inventoryReturns.value.map((r: any) => ({ ...r }))
    const jobIdentifier = job.value?.generalInfo?.jobNumber || job.value?.id?.substring(0, 8) || 'Unknown Job'

    for (const ret of clonedArray) {
      const alreadyApproved = ret.approvalStatus === 'APPROVED_MANAGER'
      const needsAccountant = targetStatus === 'APPROVED_ACCOUNTANT' && !ret.approvalStatus
      const needsManager = targetStatus === 'APPROVED_MANAGER' && ret.approvalStatus === 'APPROVED_ACCOUNTANT'

      if (!alreadyApproved && (needsAccountant || needsManager)) {
        ret.approvalStatus = targetStatus
        
        if (targetStatus === 'APPROVED_MANAGER') {
          if (ret.inventoryItemId && !ret.inventoryReturned) {
            try {
              await inventoryApi.adjustStock(ret.inventoryItemId, {
                type: 'ADD',
                qty: Number(ret.qtyReturned || 0),
                reason: `Bulk Return: ${jobIdentifier}`,
                reference: jobId
              })
              ret.inventoryReturned = true
              ret.approvedAt = new Date().toISOString()
            } catch (err: any) {
              console.error(`Failed to increment stock for ${ret.itemName}:`, err)
              toast.error('Increment Failed', { description: `Failed for ${ret.itemName}: ${err.message}` })
            }
          }
        }
      }
    }

    await store.updateJobCardArray(jobId, 'inventoryReturns', clonedArray)
    inventoryReturns.value = clonedArray
    
    notifyItemApproval('All Inventory Returns', targetStatus)
    toast.success('All Returns Approved', { description: `Marked all eligible returns as ${targetStatus}` })
  } catch (err: any) {
    toast.error('Approve All Failed', { description: err.message })
  } finally {
    isProcessing.value = false
  }
}

const handleApproveCommission = async (commissionId: string, targetStatus: 'APPROVED_ACCOUNTANT' | 'APPROVED_MANAGER') => {
  isProcessing.value = true
  try {
    const referrers = JSON.parse(JSON.stringify(job.value?.generalInfo?.referrers || []))
    const index = referrers.findIndex((r: any) => r.id === commissionId)
    if (index === -1) throw new Error('Commission not found')

    const comm = referrers[index]
    comm.approvalStatus = targetStatus
    
    // Record in ledger only on final Manager approval
    if (targetStatus === 'APPROVED_MANAGER') {
      comm.approvedAt = new Date().toISOString()
      comm.approvedBy = sessionUser.value?.displayName || sessionUser.value?.email || 'Unknown'
      
      // Record in ledger
      const jobIdentifier = job.value?.generalInfo?.jobNumber || job.value?.id?.substring(0, 8) || 'Unknown Job'
      await financeStore.recordExpense({
        category: 'commission',
        amount: Number(comm.amount || 0),
        paymentMethod: (comm.paymentMethod || 'cash').toLowerCase(),
        description: `Commission Payout: Job ${jobIdentifier} - ${comm.name || 'Anonymous'}`,
        status: 'APPROVED',
        sourceJobId: jobId,
        sourceItemId: comm.id
      })
    } else if (targetStatus === 'APPROVED_ACCOUNTANT') {
      // Just update status for Accountant approval
      comm.approvedAt = new Date().toISOString()
      comm.approvedBy = sessionUser.value?.displayName || sessionUser.value?.email || 'Unknown'
    }

    await store.updateFullJobCard(jobId, { 
      generalInfo: { ...job.value.generalInfo, referrers }
    })
    toast.success('Commission Approved', { description: `Commission for ${comm.name} marked as ${targetStatus}` })
  } catch (err: any) {
    toast.error('Approval Failed', { description: err.message })
  } finally {
    isProcessing.value = false
  }
}

const handleRejectCommission = async (commissionId: string) => {
  if (!confirm('Are you sure you want to REJECT and REMOVE this commission?')) return
  isProcessing.value = true
  try {
    const referrers = JSON.parse(JSON.stringify(job.value?.generalInfo?.referrers || []))
    const filtered = referrers.filter((r: any) => r.id !== commissionId)
    
    await store.updateFullJobCard(jobId, { 
      generalInfo: { ...job.value.generalInfo, referrers: filtered }
    })
    toast.success('Commission Rejected', { description: 'The commission record has been removed.' })
  } catch (err: any) {
    toast.error('Rejection Failed', { description: err.message })
  } finally {
    isProcessing.value = false
  }
}

const handleUploadCommissionFile = async (event: Event, commissionId: string) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  isUploadingCommissionFile.value[commissionId] = true
  try {
    const safeJobId = job.value?.id || jobId
    toast.loading('Uploading commission file...', { id: 'commission-upload' })
    const downloadUrl = await uploadProofOfPayment(file, safeJobId, `commission_${commissionId}`)
    
    const referrers = JSON.parse(JSON.stringify(job.value?.generalInfo?.referrers || []))
    const index = referrers.findIndex((r: any) => r.id === commissionId)
    if (index !== -1) {
      if (!referrers[index].attachments) {
        referrers[index].attachments = []
      }
      referrers[index].attachments.push({
        name: file.name,
        url: downloadUrl,
        uploadedAt: new Date().toISOString()
      })
      
      referrers[index].proofUrl = downloadUrl
      referrers[index].proofName = file.name
      
      await store.updateFullJobCard(safeJobId, {
        generalInfo: { ...job.value.generalInfo, referrers }
      })
      toast.success('File uploaded successfully!', { id: 'commission-upload' })
    }
  } catch (err: any) {
    toast.error('Upload failed', { description: err.message, id: 'commission-upload' })
  } finally {
    isUploadingCommissionFile.value[commissionId] = false
    target.value = ''
  }
}

const handleDeleteCommissionFile = async (commissionId: string, attachmentIdx: number) => {
  if (!confirm('Are you sure you want to remove this file?')) return
  try {
    const safeJobId = job.value?.id || jobId
    const referrers = JSON.parse(JSON.stringify(job.value?.generalInfo?.referrers || []))
    const index = referrers.findIndex((r: any) => r.id === commissionId)
    if (index !== -1 && referrers[index].attachments) {
      referrers[index].attachments.splice(attachmentIdx, 1)
      
      if (referrers[index].attachments.length > 0) {
        referrers[index].proofUrl = referrers[index].attachments[0].url
        referrers[index].proofName = referrers[index].attachments[0].name
      } else {
        referrers[index].proofUrl = null
        referrers[index].proofName = null
      }
      
      await store.updateFullJobCard(safeJobId, {
        generalInfo: { ...job.value.generalInfo, referrers }
      })
      toast.success('File removed successfully!')
    }
  } catch (err: any) {
    toast.error('Failed to remove file', { description: err.message })
  }
}

const handleApproveAllCommissions = async (targetStatus: 'APPROVED_ACCOUNTANT' | 'APPROVED_MANAGER') => {
  isProcessing.value = true
  try {
    const referrers = JSON.parse(JSON.stringify(job.value?.generalInfo?.referrers || []))
    
    for (const comm of referrers) {
      const alreadyApproved = comm.approvalStatus === 'APPROVED_MANAGER'
      const needsAccountant = targetStatus === 'APPROVED_ACCOUNTANT' && (!comm.approvalStatus || comm.approvalStatus === 'PENDING')
      const needsManager = targetStatus === 'APPROVED_MANAGER' && comm.approvalStatus === 'APPROVED_ACCOUNTANT'
      
      if (!alreadyApproved && (needsAccountant || needsManager)) {
        comm.approvalStatus = targetStatus
        
        if (targetStatus === 'APPROVED_MANAGER') {
          comm.approvedAt = new Date().toISOString()
          comm.approvedBy = sessionUser.value?.displayName || sessionUser.value?.email || 'Unknown'
          
          // Record in ledger
          const jobIdentifier = job.value?.generalInfo?.jobNumber || job.value?.id?.substring(0, 8) || 'Unknown Job'
          await financeStore.recordExpense({
            category: 'commission',
            amount: Number(comm.amount || 0),
            paymentMethod: (comm.paymentMethod || 'cash').toLowerCase(),
            description: `Commission Payout: Job ${jobIdentifier} - ${comm.name || 'Anonymous'}`,
            status: 'APPROVED',
            sourceJobId: jobId,
            sourceItemId: comm.id
          })
        } else if (targetStatus === 'APPROVED_ACCOUNTANT') {
          comm.approvedAt = new Date().toISOString()
          comm.approvedBy = sessionUser.value?.displayName || sessionUser.value?.email || 'Unknown'
        }
      }
    }

    await store.updateFullJobCard(jobId, { 
       generalInfo: { ...job.value.generalInfo, referrers }
    })
    toast.success('All Commissions Approved', { description: `Marked all eligible commissions as ${targetStatus}` })
  } catch (err: any) {
    toast.error('Approve All Failed', { description: err.message })
  } finally {
    isProcessing.value = false
  }
}

const handleReject = async () => {
  const reason = prompt('Please enter a reason for rejection:')
  if (reason === null) return

  isProcessing.value = true
  try {
    const role = currentRole.value
    const name = sessionUser.value?.displayName || sessionUser.value?.email || 'Unknown User'
    await store.rejectJobCard(jobId, role, name, reason)
    toast.success('Job Card Rejected', { description: 'The status has been updated to REJECTED.' })
  } catch (err: any) {
    toast.error('Rejection Failed', { description: err.message })
  } finally {
    isProcessing.value = false
  }
}

const handleDownloadPdf = () => {
  generateJobPdf(
    job.value,
    adminStore.appSettings,
    adminStore.appSettings,
    creatorName.value,
    adminStore.jobCategories,
    totalPaid.value
  )
}

const handleDownloadFullReport = () => {
  const allItems = requisitionItems.value.flatMap((s: any) =>
    (s.items ?? []).map((item: any) => ({ ...item, sectionName: s.name || s.category || 'General' }))
  )
  generateFullJobCardPdf(
    job.value,
    allItems.length > 0 ? allItems : requisitionItems.value,
    adHocExpenses.value,
    inventoryReturns.value,
    recordedPayments.value,
    effectiveFinancials.value,
    adminStore.appSettings,
    adminStore.appSettings,
    creatorName.value,
    adminStore.jobCategories
  )
}

const handleDownloadPerformanceReport = () => {
  if (!effectiveFinancials.value) return
  generatePerformanceReportPdf(
    {
      jobId: job.value?.id || '',
      jobCardNumber: job.value?.generalInfo?.jobNumber || 'N/A',
      clientName: job.value?.clientName || job.value?.generalInfo?.recipientName || 'N/A',
      financials: effectiveFinancials.value,
      totalPaid: recordedPayments.value.reduce((s: number, p: any) => s + (p.amount || 0), 0),
      payments: recordedPayments.value,
      generatedBy: sessionUser.value?.displayName || 'System User'
    },
    adminStore.appSettings,
    adminStore.appSettings,
    creatorName.value
  )
}

const isDuplicating = ref(false)
const handleDuplicateJobCard = async () => {
  isDuplicating.value = true
  try {
    const newId = await store.duplicateJobCard(jobId, {
      uid: sessionUser.value?.uid || 'unknown',
      email: sessionUser.value?.email || 'unknown',
      name: sessionUser.value?.displayName || 'Unknown User',
    })
    toast.success('Job Card Duplicated', { description: 'Opening duplicate — update client details then save.' })
    router.push(`/job-cards/${newId}`)
  } catch (err: any) {
    toast.error('Duplicate Failed', { description: err.message })
  } finally {
    isDuplicating.value = false
  }
}

// Payment Recording Logic
const paymentAmount = ref<number | ''>('')
const paymentMethod = ref<string>('bank')
const paymentNote = ref<string>('')
const paymentFile = ref<File | null | undefined>(null)
const isUploadingPayment = ref(false)

const handleFileChange = (e: Event) => {
  const target = e.target as HTMLInputElement
  if (target && target.files && target.files.length > 0) {
    paymentFile.value = target.files[0]
  }
}

const handleRecordPayment = async () => {
  if (!paymentAmount.value || Number(paymentAmount.value) <= 0) {
    return toast.error('Invalid Amount', { description: 'Please enter a valid payment amount.' })
  }
  if (!paymentFile.value) {
    return toast.error('Proof Required', { description: 'Please upload a proof of payment document or image.' })
  }

  isUploadingPayment.value = true
  try {
    const safeJobId = job.value?.id || jobId
    const jobIdentifier = job.value?.generalInfo?.jobNumber || safeJobId.substring(0, 8)

    // 1. Upload to Firebase Storage
    toast.loading('Uploading File...', { id: 'payment-upload' })
    const fileUrl = await uploadProofOfPayment(paymentFile.value, safeJobId, paymentNote.value || 'payment')

    // 2. Transmit to Finance Store Ledger
    toast.loading('Recording Ledger Entry...', { id: 'payment-upload' })
    await financeStore.recordIncome({
      jobCardId: safeJobId,
      amount: Number(paymentAmount.value),
      paymentMethod: paymentMethod.value,
      description: `Payment for Job ${jobIdentifier}${paymentNote.value ? ' - ' + paymentNote.value : ''}`,
      proofOfPaymentUrl: fileUrl,
      recordedBy: sessionUser.value?.uid || 'Unknown',
      recordedByName: sessionUser.value?.displayName || sessionUser.value?.email || 'Unknown User'
    })

    toast.success('Payment Recorded Successfully!', { id: 'payment-upload' })

    // Attempt to log timeline event
    try {
      await store.updateJobCardStatus(safeJobId, job.value.status, {
        user: sessionUser.value?.displayName || sessionUser.value?.email || 'Unknown User',
        role: currentRole.value,
        status: 'Payment Recorded',
        comment: `Received ${formatCurrency(Number(paymentAmount.value))} via ${paymentMethod.value.toUpperCase()}`
      })
    } catch (e) {
      console.warn('Silent timeline update failure:', e)
    }

    // Reset form
    paymentAmount.value = ''
    paymentNote.value = ''
    paymentFile.value = null
    paymentMethod.value = 'bank'
  } catch (err: any) {
    console.error('Record Payment Error:', err)
    toast.error('Payment Failed', { id: 'payment-upload', description: err.message || 'Could not record payment.' })
  } finally {
    isUploadingPayment.value = false
  }
}

const getFileName = (url: string) => {
  if (!url) return 'Document'
  try {
    const decoded = decodeURIComponent(url)
    const pathPart = decoded.split('?')[0] || ''
    const parts = pathPart.split('/')
    const fullName = parts[parts.length - 1] || ''
    return fullName.replace(/^\d+_/g, '')
  } catch (err) {
    return 'Document'
  }
}

const handleViewProof = (url: string) => {
  if (url) window.open(url, '_blank')
}

const handleDownloadReceipt = (payment: any) => {
  generatePaymentReceiptPdf(
    job.value,
    payment,
    adminStore.appSettings,
    adminStore.appSettings,
    creatorName.value
  )
}

const handleDownloadApprovedInventory = async () => {
  generateApprovedRequisitionPdf(
    job.value,
    adminStore.appSettings,
    adminStore.appSettings,
    creatorName.value,
    adminStore.jobCategories
  )
  try {
    await store.lockApprovedItems(jobId, 'inventory')
    toast.success('Inventory Locked', { description: 'These items are now marked as processed.' })
  } catch (err) {
    console.error('Failed to lock inventory:', err)
  }
}

const handleDownloadApprovedExpenses = async () => {
  generateApprovedExpensesPdf(
    job.value,
    adminStore.appSettings,
    adminStore.appSettings,
    creatorName.value,
    adminStore.jobCategories
  )
  try {
    await store.lockApprovedItems(jobId, 'expenses')
    toast.success('Expenses Locked', { description: 'These expenses are now marked as processed.' })
  } catch (err) {
    console.error('Failed to lock expenses:', err)
  }
}

const hasApprovedInventory = computed(() => {
  if (!Array.isArray(job.value?.requisitionItems)) return false
  return job.value.requisitionItems.some((i: any) => i.approvalStatus === 'APPROVED_MANAGER' && !i.isLockedAgainstPdf)
})

const hasApprovedExpenses = computed(() => {
  if (!Array.isArray(job.value?.adHocExpenses)) return false
  return job.value.adHocExpenses.some((e: any) => e.approvalStatus === 'APPROVED_MANAGER' && !e.isLockedAgainstPdf)
})

// === STAFF RATES HELPERS ===
const getEmployee = (employeeId: string) => {
  return hrStore.employees.find(e => e.id === employeeId)
}

const getEmployeeName = (employeeId: string): string => {
  const emp = getEmployee(employeeId)
  return emp?.fullName || 'Unknown'
}

const getEmploymentCode = (employeeId: string): string => {
  const emp = getEmployee(employeeId)
  return emp?.id?.slice(-6).toUpperCase() || 'N/A'
}

const getNationalId = (employeeId: string): string => {
  const emp = getEmployee(employeeId)
  return emp?.nationalId || 'N/A'
}

const getStatusVariant = (status: string) => {
  switch (status) {
    case 'APPROVED_MANAGER':
    case 'COMPLETED': return 'default'
    case 'APPROVAL_PENDING_ACCOUNTANT':
    case 'APPROVAL_PENDING_MANAGER': return 'secondary'
    case 'REJECTED': return 'destructive'
    case 'SUBMITTED':
    case 'APPROVED_ACCOUNTANT': return 'outline'
    default: return 'outline'
  }
}

const getItemStatusVariant = (status?: string) => {
  switch (status) {
    case 'APPROVED_MANAGER': return 'default'
    case 'APPROVED_ACCOUNTANT': return 'secondary'
    case 'REJECTED': return 'destructive'
    case 'PENDING':
    default: return 'outline'
  }
}

const safeTotals = computed(() => {
  if (!job.value) return {}
  const totals = job.value.totals || {}
  const summary = job.value.summary || {}

  // Revenue (Invoiceable) - EXCLUDE ADJUSTMENTS
  const inventorySections = requisitionItems.value || []
  const inventoryInvoiceable = inventorySections.reduce((acc: number, section: any) => {
    return acc + (section.items || []).reduce((sAcc: number, item: any) => {
      if (item.isAdjustment) return sAcc
      return sAcc + (item.rowGrandTot || 0)
    }, 0)
  }, 0)

  // Ad-hoc expenses that are NOT adjustments (though usually all ad-hoc are costs, 
  // if some were billed, we'd exclude them here. Standard is all ad-hoc are costs.)

  const returnsTotal = (inventoryReturns.value || []).reduce((s: number, r: any) => s + (r.totalCredit || 0), 0)

  const inventorySubtotal = inventoryInvoiceable
  const grandTotal = inventorySubtotal

  // Internal Costs - INCLUDE EVERYTHING (Adjustments + Original)
  const inventoryCosts = inventorySections.reduce((acc, section) => {
    const sCosts = (section.items || []).reduce((sAcc: any, item: any) => ({
      totalIrdCost: sAcc.totalIrdCost + (item.rowIRDTot || 0),
      totalMarkup: sAcc.totalMarkup + (item.rowMUTot || 0)
    }), { totalIrdCost: 0, totalMarkup: 0 })

    return {
      totalIrdCost: acc.totalIrdCost + sCosts.totalIrdCost,
      totalMarkup: acc.totalMarkup + sCosts.totalMarkup
    }
  }, { totalIrdCost: 0, totalMarkup: 0 })

  const totalAdHocCost = adHocExpenses.value.reduce((s: number, e: any) => s + (e.totalAmount || 0), 0)
  const totalStaffRatesCost = staffRates.value.reduce((s: number, r: any) => s + (r.jobRateAmount || 0), 0)
  const implementationCost = totalAdHocCost + totalStaffRatesCost

  return {
    inventoryIRDTotal: inventoryCosts.totalIrdCost,
    inventoryMUTotal: inventoryCosts.totalMarkup,
    inventorySubtotal,
    adHocTotal: totalAdHocCost,
    staffRatesTotal: totalStaffRatesCost,
    implementationCost,
    returnsTotal,
    grandTotal: inventorySubtotal + implementationCost,
    expensesByMethod: summary.expensesByMethod || totals.expensesByMethod || { CASH: 0, ECOCASH: 0, BANK: 0 }
  }
})

const sectionImplementationCost = computed(() => {
  const totalAdHocCost = adHocExpenses.value.reduce((s: number, e: any) => s + (e.totalAmount || 0), 0)
  const totalStaffRatesCost = staffRates.value.reduce((s: number, r: any) => s + (r.jobRateAmount || 0), 0)
  const totalImplementationCost = totalAdHocCost + totalStaffRatesCost

  // Calculate total inventory value across all sections
  const inventorySections = requisitionItems.value || []
  const totalInventoryValue = inventorySections.reduce((acc: number, section: any) => {
    return acc + (section.items || []).reduce((sAcc: number, item: any) => {
      return sAcc + (item.rowGrandTot || 0)
    }, 0)
  }, 0)

  // Return a function that calculates proportional cost for a section
  return (section: any) => {
    const sectionValue = (section.items || []).reduce((sum: number, item: any) => sum + (item.rowGrandTot || 0), 0)
    if (totalInventoryValue === 0) return 0
    return (sectionValue / totalInventoryValue) * totalImplementationCost
  }
})
const jobNetRevenue = computed(() => {
  if (!job.value) return null
  const invoiceValue = safeTotals.value.grandTotal || 0
  const totalAdHocExpenses = adHocExpenses.value.reduce(
    (s: number, e: any) => s + (Number(e.totalAmount) || Number((e.quantity || 0) * (e.unitPrice || 0))), 0
  )
  const paymentsReceived = recordedPayments.value.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0)
  const netRevenue = invoiceValue - totalAdHocExpenses
  const expensePercent = invoiceValue > 0 ? (totalAdHocExpenses / invoiceValue) * 100 : 0
  return { invoiceValue, totalAdHocExpenses, paymentsReceived, netRevenue, expensePercent }
})

// === DETAILED FINANCIAL BREAKDOWN (engine) ===
const financialBreakdown = computed(() => {
  if (!job.value) return null
  return computeFinancials(
    requisitionItems.value || [],
    adHocExpenses.value   || [],
    inventoryReturns.value || [],
    staffRates.value || [],
    job.value.generalInfo?.referrers || [],
    job.value.status
  )
})

// Total Invoice Value — prioritize linked CRM total, then locked manager value, then calculated total
const lockedInvoiceValue = computed(() => {
  const crmTotal = job.value?.generalInfo?.linkedCrmTotal
  if (crmTotal != null && crmTotal > 0) return { value: crmTotal, isLocked: true }

  const locked = job.value?.lockedTotalInvoiceValue
  if (locked != null && locked > 0) return { value: locked, isLocked: true }
  
  return { value: financialBreakdown.value?.totalInvoiceValue ?? 0, isLocked: false }
})

const effectiveFinancials = computed(() => {
  if (!financialBreakdown.value) return null
  
  const initialInvoiceValue = lockedInvoiceValue.value.value
  const revenue = initialInvoiceValue
  const baseCost = financialBreakdown.value.totalCost || 0 // This already includes commission from engine if we want, but wait...
  // Let's re-verify the engine totalCost. 
  // Engine totalCost = irdBaseCost + implementationCost - returnsProfit + totalCommission
  
  const referrerCommission = financialBreakdown.value.referrerCommission || 0
  const commissionPercentage = financialBreakdown.value.commissionPercentage || 0

  const totalCost = baseCost
  const netProfit = revenue - totalCost
  const profitMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0
  
  // New Formula Fields
  const totalOperationalGross = (financialBreakdown.value.irdGrossRevenue || 0) + (financialBreakdown.value.implementationCost || 0) + referrerCommission
  // TWID Cumulative Net is the difference between the headline revenue and the operational costs
  const twidNetAfterAdjustments = revenue - totalOperationalGross
  const twidRevenuePercentage = initialInvoiceValue > 0 ? (twidNetAfterAdjustments / initialInvoiceValue) * 100 : 0
  
  // IRD Formula Fields
  const irdCumulativeNetRevenue = (financialBreakdown.value.irdGrossRevenue || 0) - (financialBreakdown.value.irdBaseCost || 0)
  const irdRevenuePercentage = (financialBreakdown.value.irdGrossRevenue || 0) > 0 
    ? (irdCumulativeNetRevenue / (financialBreakdown.value.irdGrossRevenue || 0)) * 100 
    : 0
  
  return {
    ...financialBreakdown.value,
    initialInvoiceValue,
    totalRevenue: revenue,
    totalCost,
    totalOperationalGross,
    twidNetAfterAdjustments,
    twidRevenuePercentage,
    netProfit,
    profitMargin,
    referrerCommission,
    commissionPercentage,
    // IRD Formula Fields
    irdNetRevenue: (financialBreakdown.value.irdGrossRevenue || 0), // Remittable is Gross Sales
    irdCumulativeNetRevenue,
    irdRevenuePercentage: irdRevenuePercentage
  }
})


const financialChartData = computed(() => {
  const f = effectiveFinancials.value
  if (!f) return []
  
  return [
    { name: 'IRD Remittance', value: f.irdNetRevenue, color: '#3b82f6' }, // Blue 500 (Gross Inventory Sales)
    { name: 'Implementation', value: f.implementationCost, color: '#f59e0b' }, // Amber 500
    { name: 'TWID Margin', value: f.twidNetAfterAdjustments, color: '#10b981' }, // Emerald 500
  ].filter(i => i.value > 0)
})

// === PAYMENT TRACKING ===
const totalPaid = computed(() => {
  return recordedPayments.value.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0)
})

// VAT is temporarily disabled for Job Cards per user request
// It will be re-enabled here later. Development continues in the Accounting module.
const vatEnabled = computed(() => false)
const vatRate = computed(() => 0)
const vatAmount = computed(() => 0)
const grandTotalWithVat = computed(() => (lockedInvoiceValue.value.value || 0))

const balanceDue = computed(() => {
  return Math.max(0, grandTotalWithVat.value - totalPaid.value)
})

const paymentProgress = computed(() => {
  const total = grandTotalWithVat.value
  if (total <= 0) return 0
  return Math.min(100, (totalPaid.value / total) * 100)
})

const isFullyPaid = computed(() => balanceDue.value <= 0)

const revenueColorClass = computed(() => {
  const pct = jobNetRevenue.value?.expensePercent ?? 0
  if (pct > 50) return { text: 'text-rose-600', badge: 'bg-rose-100 text-rose-700 border-rose-300', bar: 'bg-rose-500' }
  if (pct >= 35) return { text: 'text-orange-500', badge: 'bg-orange-100 text-orange-700 border-orange-300', bar: 'bg-orange-500' }
  return { text: 'text-emerald-600', badge: 'bg-emerald-100 text-emerald-700 border-emerald-300', bar: 'bg-emerald-500' }
})

const activeTab = ref('overview')

const requisitionCount = computed(() => {
  const source = isEditing.value ? editableJob.value.requisitionItems : requisitionItems.value
  return (source || []).reduce((sum, s) => sum + (s.items?.length || 0), 0)
})

const returnsCount = computed(() => {
  const source = isEditing.value ? editableJob.value.inventoryReturns : inventoryReturns.value
  return (source || []).length
})

const expensesCount = computed(() => {
  const source = isEditing.value ? editableJob.value.adHocExpenses : adHocExpenses.value
  return (source || []).length
})

const staffRatesCount = computed(() => {
  const source = isEditing.value ? editableJob.value.staffRates : staffRates.value
  return (source || []).length
})

const commissionCount = computed(() => {
  const source = isEditing.value ? editableJob.value.generalInfo?.referrers : job.value?.generalInfo?.referrers
  return (source || []).length
})

const toolsCount = computed(() => {
  const source = isEditing.value ? editableJob.value.allocatedTools : allocatedTools.value
  return (source || []).length
})

// === EDIT MODE (SUBMITTED STATE) LOGIC ===
const isEditing = ref(false)
const editableJob = ref({
  generalInfo: {
    referrerName: '',
    referrers: [] as any[],
    commissionPercentage: 0
  } as any,
  requisitionItems: [] as any[],
  adHocExpenses: [] as any[],
  staffRates: [] as any[],
  inventoryReturns: [] as any[],
  allocatedTools: [] as any[],
  agfStructure: {} as Record<string, string>
})

const handleEditJobCard = () => {
  if (!job.value) return
  editableJob.value = {
    generalInfo: {
      ...job.value.generalInfo,
      jobCardTitle: job.value.generalInfo.jobTitle,
      recipientAddress: job.value.generalInfo.recipientAddress || 'N/A',
      recipientPhone: job.value.generalInfo.recipientPhone || 'N/A',
      linkedCrmId: job.value.generalInfo.linkedCrmId || '',
      linkedCrmType: job.value.generalInfo.linkedCrmType || '',
      linkedCrmNumber: job.value.generalInfo.linkedCrmNumber || '',
      linkedCrmTotal: job.value.generalInfo.linkedCrmTotal || 0,
      referrerName: job.value.generalInfo.referrerName || '',
      referrers: JSON.parse(JSON.stringify(job.value.generalInfo.referrers || [])),
      commissionPercentage: job.value.generalInfo.commissionPercentage || 0
    },
    requisitionItems: (job.value.requisitionSections || []).map((s: any) => ({
      ...s,
      items: (s.items || []).map((i: any) => ({
        ...i,
        itemName: i.itemName || i.name || '',
        description: i.description || '',
        qtyRequired: Number(i.qtyRequired ?? i.qty ?? 0),
        irdSellingPrice: Number(i.irdSellingPrice ?? i.sellingPrice ?? 0),
        markupPercent: Number(i.markupPercent ?? i.twidMarkupPercent ?? 0)
      }))
    })),
    adHocExpenses: adHocExpenses.value.map((i: any) => ({ ...i })),
    staffRates: staffRates.value.map((i: any) => ({ ...i })),
    inventoryReturns: inventoryReturns.value.map((i: any) => ({ ...i })),
    allocatedTools: allocatedTools.value.map((i: any) => ({ ...i })),
    agfStructure: { ...(job.value.agfStructure || {}) }
  }
  isEditing.value = true
}

const addReferrer = () => {
  if (!editableJob.value.generalInfo.referrers) {
    editableJob.value.generalInfo.referrers = []
  }
  editableJob.value.generalInfo.referrers.push({ 
    id: `ref_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    name: '', 
    amount: 0,
    approvalStatus: 'PENDING',
    createdAt: new Date().toISOString()
  })
}

const removeReferrer = (index: any) => {
  editableJob.value.generalInfo.referrers.splice(Number(index), 1)
}

const totalEditableCommission = computed(() => {
  return (editableJob.value.generalInfo.referrers || []).reduce((sum: number, r: any) => sum + (Number(r.amount) || 0), 0)
})

const handleCancelEdit = () => {
  isEditing.value = false
}

const handleSaveChanges = async () => {
  if (!editableJob.value.generalInfo.jobCardTitle || !editableJob.value.generalInfo.requestingDepartmentId || !editableJob.value.generalInfo.jobCategoryId) {
    activeTab.value = 'overview'
    toast.error('Required Fields Missing', { description: 'Please fill in Title, Department, and Category.' })
    return
  }

  isProcessing.value = true
  try {
    const isAmendment = job.value.status === 'CLOSED'
    let hasNewItems = false

    // Fetch latest inventory costs to backfill any zero costSnapshots
    const inventoryMap: Record<string, number> = {}
    try {
      const invItems = await inventoryApi.listInventory({ isActive: true })
      invItems.forEach((item: any) => {
        const cost = Number(item.totalCost ?? (Number(item.purchasePrice ?? 0) + Number(item.freightDuty ?? 0)))
        inventoryMap[item.id] = cost
      })
    } catch (err) {
      console.warn('Could not fetch inventory items for cost healing:', err)
    }

    // calculate totals
    const invSummary = (editableJob.value.requisitionItems || []).reduce((acc: any, section: any) => {
      const sectionSummary = (section.items || []).reduce((sAcc: any, item: any) => {
        const qty = item.qtyRequired ?? item.qty ?? 0
        const price = item.irdSellingPrice ?? 0
        const markup = item.markupPercent ?? item.twidMarkupPercent ?? 0

        const baseIRD = qty * price
        const twidMU = baseIRD * (markup / 100)
        const subTotal = baseIRD + twidMU
        const totalInventoryPrice = subTotal

        // If this is an amendment, flag new items
        // Use flat requisitionItems array directly (not sections) to check existence
        const isNew = !job.value.requisitionItems?.some((oldI: any) => oldI.id === item.id)
        if (isNew) {
          if (isAmendment) {
            item.isAdjustment = true
            item.adjustmentDate = new Date().toISOString()
            hasNewItems = true
          }
          if (item.approvalStatus === undefined || item.approvalStatus === null) {
            item.approvalStatus = 'PENDING'
          }
        }

        // normalize item fields
        item.qty = Number(qty)
        item.irdSellingPrice = Number(price)
        item.twidMarkupPercent = Number(markup)

        let resolvedCost = Number(item.costSnapshot || 0)
        if (item.inventoryItemId && resolvedCost === 0) {
          resolvedCost = inventoryMap[item.inventoryItemId] || 0
        }
        item.costSnapshot = resolvedCost

        item.rowIRDTot = Number(baseIRD)
        item.rowMUTot = Number(twidMU)
        item.rowGrandTot = Number(totalInventoryPrice)

        return {
          totalIrdCost: sAcc.totalIrdCost + baseIRD,
          totalMarkup: sAcc.totalMarkup + twidMU,
          totalInvoiceable: item.isAdjustment ? sAcc.totalInvoiceable : (sAcc.totalInvoiceable + totalInventoryPrice)
        }
      }, { totalIrdCost: 0, totalMarkup: 0, totalInvoiceable: 0 })

      return {
        totalIrdCost: acc.totalIrdCost + sectionSummary.totalIrdCost,
        totalMarkup: acc.totalMarkup + sectionSummary.totalMarkup,
        totalInvoiceable: acc.totalInvoiceable + sectionSummary.totalInvoiceable
      }
    }, { totalIrdCost: 0, totalMarkup: 0, totalInvoiceable: 0 })

    const adhocTotal = editableJob.value.adHocExpenses.reduce((acc: any, exp: any) => {
      // Flag new expenses as adjustments
      const isNew = !job.value.adHocExpenses.some((oldE: any) => oldE.id === exp.id)
      if (isNew) {
        if (isAmendment) {
          exp.isAdjustment = true
          exp.adjustmentDate = new Date().toISOString()
          hasNewItems = true
        }
        if (exp.approvalStatus === undefined || exp.approvalStatus === null) {
          exp.approvalStatus = 'PENDING'
        }
      }
      exp.totalAmount = Number((exp.quantity || 0) * (exp.unitPrice || 0))
      return acc + exp.totalAmount
    }, 0)

    const staffRatesTotal = editableJob.value.staffRates.reduce((acc: any, rate: any) => {
      // Flag new staff rates as adjustments
      const isNew = !job.value.staffRates?.some((oldR: any) => oldR.id === rate.id)
      if (isNew) {
        if (isAmendment) {
          rate.isAdjustment = true
          rate.adjustmentDate = new Date().toISOString()
          hasNewItems = true
        }
        if (rate.approvalStatus === undefined || rate.approvalStatus === null) {
          rate.approvalStatus = 'PENDING'
        }
      }
      return acc + (rate.jobRateAmount || 0)
    }, 0)

    const implementationCost = adhocTotal + staffRatesTotal

    const expByMethod = editableJob.value.adHocExpenses.reduce((acc: any, exp: any) => {
      const amount = (exp.quantity || 0) * (exp.unitPrice || 0)
      if (exp.paymentMethod) {
        if (exp.paymentMethod.toUpperCase() === 'CASH') acc.CASH += amount
        else if (exp.paymentMethod.toUpperCase() === 'ECOCASH') acc.ECOCASH += amount
        else if (exp.paymentMethod.toUpperCase() === 'BANK') acc.BANK += amount
      }
      return acc
    }, { CASH: 0, ECOCASH: 0, BANK: 0 })

    const totals = {
      inventoryIRDTotal: Number(invSummary.totalIrdCost),
      inventoryMUTotal: Number(invSummary.totalMarkup),
      adHocTotal: Number(adhocTotal),
      staffRatesTotal: Number(staffRatesTotal),
      implementationCost: Number(implementationCost),
      grandTotal: Number(invSummary.totalInvoiceable + implementationCost),
    }

    const summary = {
      inventoryIRDTotal: Number(invSummary.totalIrdCost),
      inventoryMUTotal: Number(invSummary.totalMarkup),
      adHocTotal: Number(adhocTotal),
      staffRatesTotal: Number(staffRatesTotal),
      implementationCost: Number(implementationCost),
      grandTotal: Number(invSummary.totalInvoiceable + implementationCost),
      expensesByMethod: expByMethod,
      itemCount: editableJob.value.requisitionItems.reduce((sum: number, s: any) => sum + (s.items?.length || 0), 0) +
        editableJob.value.adHocExpenses.length +
        editableJob.value.inventoryReturns.length,
    }

    const generalInfoPayload = {
      ...editableJob.value.generalInfo,
      jobTitle: editableJob.value.generalInfo.jobCardTitle,
      linkedCrmId: editableJob.value.generalInfo.linkedCrmId || '',
      linkedCrmType: editableJob.value.generalInfo.linkedCrmType || '',
      linkedCrmNumber: editableJob.value.generalInfo.linkedCrmNumber || '',
      linkedCrmTotal: Number(editableJob.value.generalInfo.linkedCrmTotal || 0)
    }
    // Remove the JobInformationCard specific map key to keep standard schema
    delete generalInfoPayload.jobCardTitle

    // Flag new returns as adjustments
    editableJob.value.inventoryReturns.forEach((ret: any) => {
      const isNew = !job.value.inventoryReturns.some((oldR: any) => oldR.id === ret.id)
      if (isAmendment && isNew) {
        ret.isAdjustment = true
        ret.adjustmentDate = new Date().toISOString()
        ret.approvalStatus = 'PENDING'
        hasNewItems = true
      }
    })

    const payload: any = {
      generalInfo: generalInfoPayload,
      requisitionSections: editableJob.value.requisitionItems,
      // Flattened for reports
      requisitionItems: (editableJob.value.requisitionItems || []).flatMap((s: any) =>
        (s.items || []).map((i: any) => ({ ...i, jobCategoryId: s.jobCategoryId }))
      ),
      adHocExpenses: editableJob.value.adHocExpenses,
      staffRates: editableJob.value.staffRates,
      inventoryReturns: editableJob.value.inventoryReturns,
      allocatedTools: editableJob.value.allocatedTools,
      agfStructure: editableJob.value.agfStructure,
      totals,
      summary
    }

    if (isAmendment && hasNewItems) {
      payload.status = 'APPROVAL_PENDING_ACCOUNTANT'
    }

    await store.updateFullJobCard(jobId, payload)

    // Update local refs to prevent flash
    job.value.generalInfo = generalInfoPayload
    requisitionItems.value = editableJob.value.requisitionItems
    adHocExpenses.value = editableJob.value.adHocExpenses
    staffRates.value = editableJob.value.staffRates
    inventoryReturns.value = editableJob.value.inventoryReturns
    allocatedTools.value = editableJob.value.allocatedTools
    job.value.agfStructure = editableJob.value.agfStructure
    job.value.totals = totals
    job.value.summary = summary

    toast.success('Job Card Updated', { description: 'The changes have been saved.' })
    isEditing.value = false
  } catch (err: any) {
    toast.error('Save Failed', { description: err.message })
  } finally {
    isProcessing.value = false
  }
}

// === INLINE EDIT FOR PENDING AD-HOC EXPENSES ===
const editingExpenseId = ref<string | null>(null)
const editingExpenseForm = ref<{
  description: string;
  quantity: number;
  unitPrice: number;
  paymentMethod: string;
  recipientName: string;
  recipientPhone: string;
  attachmentUrls?: string[];
  attachmentUrl?: string | null;
}>({
  description: '',
  quantity: 1,
  unitPrice: 0,
  paymentMethod: 'CASH',
  recipientName: '',
  recipientPhone: '',
  attachmentUrls: [],
  attachmentUrl: null
})

const handleEditExpense = (exp: any) => {
  editingExpenseId.value = exp.id
  editingExpenseForm.value = {
    description:   exp.description   || '',
    quantity:      exp.quantity      ?? 1,
    unitPrice:     exp.unitPrice     ?? 0,
    paymentMethod: exp.paymentMethod || 'CASH',
    recipientName: exp.recipientName || '',
    recipientPhone: exp.recipientPhone || '',
    attachmentUrls: exp.attachmentUrls || [],
    attachmentUrl:  exp.attachmentUrl  || null
  }
}

const handleCancelEditExpense = () => {
  editingExpenseId.value = null
}

const handleSaveExpense = async () => {
  const expId = editingExpenseId.value
  if (!expId || !job.value) return
  isProcessing.value = true
  try {
    const f = editingExpenseForm.value
    const totalAmount = Number((f.quantity || 0) * (f.unitPrice || 0))
    const cloned = adHocExpenses.value.map((e: any) => {
      if (e.id !== expId) return { ...e }
      return {
        ...e,
        description:   f.description,
        quantity:      Number(f.quantity),
        unitPrice:     Number(f.unitPrice),
        paymentMethod: f.paymentMethod,
        recipientName: f.recipientName,
        recipientPhone: f.recipientPhone,
        totalAmount,
        attachmentUrl: f.attachmentUrl || null,
        attachmentUrls: f.attachmentUrls || [],
        // Reset to PENDING for re-approval — isAdjustment flag is preserved as-is
        approvalStatus: 'PENDING',
        editedAt: new Date().toISOString(),
        editedBy: sessionUser.value?.displayName || sessionUser.value?.email || 'User'
      }
    })
    await store.updateJobCardArray(jobId, 'adHocExpenses', cloned)
    adHocExpenses.value = cloned
    editingExpenseId.value = null
    toast.success('Expense Updated', { description: 'Expense has been updated and reset to Pending for re-approval.' })
  } catch (err: any) {
    toast.error('Update Failed', { description: err.message })
  } finally {
    isProcessing.value = false
  }
}

const handleDeleteJobCard = async () => {
  if (!['DRAFT', 'SUBMITTED', 'APPROVAL_PENDING_ACCOUNTANT', 'APPROVAL_PENDING_MANAGER'].includes(job.value.status)) {
    toast.error('Deletion Blocked', { description: 'Approved Job Cards cannot be structurally deleted.' })
    return
  }

  const confirmed = confirm(`Are you SURE you want to permanently delete Job Card ${job.value.generalInfo?.jobNumber || job.value.id.substring(0, 8)} and ALL its connected records? This action CANNOT be undone.`)
  if (!confirmed) return

  isProcessing.value = true
  try {
    toast.loading('Deleting Job Card & records...', { id: 'delete-jc' })
    await store.deleteJobCardCascade(job.value.id, job.value.status)
    toast.success('Job Card Deleted Successfully', { id: 'delete-jc' })
    router.replace('/job-cards')
  } catch (err: any) {
    toast.error('Deletion Failed', { id: 'delete-jc', description: err.message })
  } finally {
    isProcessing.value = false
  }
}

</script>

<template>
  <div v-if="loading" class="flex h-[400px] items-center justify-center">
    <Loader2 class="size-8 animate-spin text-muted-foreground" />
  </div>
  <div v-else-if="!job" class="text-center p-12">
    <p class="text-muted-foreground">Job Card not found.</p>
    <Button variant="link" @click="router.push('/job-cards')">Back to list</Button>
  </div>
  <div v-else class="w-full space-y-8 pb-20 px-4 mt-8 font-sans">

    <!-- Header Section -->
    <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b pb-6">
      <div class="flex items-start md:items-center gap-4 min-w-0">
        <Button variant="ghost" size="icon" class="shrink-0 mt-1 md:mt-0" @click="router.push('/job-cards')">
          <ArrowLeft class="size-4" />
        </Button>
        <div class="min-w-0 flex-1">
          <h1 class="text-2xl md:text-3xl font-bold tracking-tight flex flex-wrap items-center gap-2 md:gap-3">
            <span class="bg-brand-primary text-white px-3 py-1 rounded-md text-xl md:text-2xl shadow-sm shrink-0">
              {{ job.generalInfo?.jobNumber || job.id.substring(0, 8) }}
            </span>
            <span class="text-foreground dark:text-white break-words">
              {{ job.generalInfo?.jobTitle || 'Untitled Job' }}
            </span>
          </h1>
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2 text-sm text-muted-foreground">
            <Badge :variant="getStatusVariant(job.status)" class="uppercase font-bold text-[9px] md:text-[10px] shrink-0">
              {{ job.status.replace(/_/g, ' ') }}
            </Badge>
            <Badge v-if="job.generalInfo?.linkedCrmId" variant="outline" class="uppercase font-bold text-[9px] md:text-[10px] shrink-0 bg-brand-primary/5 border-brand-primary/20 text-brand-primary flex items-center gap-1">
              <Link2 class="size-2.5" />
              {{ job.generalInfo.linkedCrmType }}: {{ job.generalInfo.linkedCrmNumber }}
            </Badge>
            <span class="hidden md:inline text-muted-foreground/30">•</span>
            <div class="flex items-center gap-1.5 shrink-0">
              <User class="size-3.5" />
              <span class="font-medium text-foreground">By {{ creatorName }}</span>
            </div>
            <span class="hidden md:inline text-muted-foreground/30">•</span>
            <span class="shrink-0">{{ resolveDepartmentName(job.generalInfo?.requestingDepartmentId) }}</span>
          </div>
        </div>
      </div>

      <!-- Header Actions Area -->
      <div class="flex flex-col items-end gap-4 shrink-0">
        <!-- 1. Urgent Alerts / Status Logic -->
        <div v-if="canApprove && !isEditing" class="w-full max-w-[450px]">
          <div class="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/40 rounded-xl p-3.5 flex gap-3 shadow-sm">
            <Info class="size-4 text-amber-600 shrink-0 mt-0.5" />
            <div class="space-y-1">
              <p class="text-[10px] font-black text-amber-900 dark:text-amber-400 uppercase tracking-widest">Verification Required</p>
              <p class="text-[10px] text-amber-700 dark:text-amber-500/90 leading-relaxed font-medium">
                Please verify all items. After you <strong>CLOSE</strong> this Job Card, any further adjustments will negatively impact project profitability.
              </p>
            </div>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-end gap-3">
          <div v-if="!isEditing" class="flex items-center gap-2">
            <template v-if="!['APPROVED_MANAGER', 'COMPLETED', 'REJECTED'].includes(job.status)">
              <Button v-if="job.status === 'SUBMITTED'" variant="outline" class="h-10 px-4 text-xs font-bold text-primary border-primary/30 shadow-sm"
                @click="handleEditJobCard" :disabled="isProcessing">
                <Edit class="mr-2 size-4" />
                Edit Card
              </Button>
              
              <template v-if="canApprove">
                <Button variant="outline" class="h-10 px-4 text-xs font-bold text-rose-600 border-rose-200 hover:bg-rose-50" 
                  :class="{ 'hidden': isMobile }" @click="handleReject" :disabled="isProcessing">
                  <XCircle class="mr-2 size-4" />
                  Reject
                </Button>
                <Button class="h-10 px-6 text-xs font-bold bg-brand-primary text-white shadow-md hover:shadow-lg transition-all" 
                  :class="{ 'flex-1': isMobile }" @click="handleApproval" :disabled="!canApprove || isProcessing">
                  <CheckCircle2 v-if="!isProcessing && canApprove" class="mr-2 size-4" />
                  <Loader2 v-else-if="isProcessing" class="mr-2 size-4 animate-spin" />
                  {{ isProcessing ? 'Processing...' : approvalButtonLabel }}
                </Button>
              </template>
            </template>
        
            <template v-else-if="['APPROVED_MANAGER', 'COMPLETED', 'CLOSED'].includes(job.status)">
              <Button v-if="['APPROVED_MANAGER', 'COMPLETED'].includes(job.status)" 
                variant="outline" class="h-10 px-4 text-xs font-bold text-brand-primary border-brand-primary/20 hover:bg-brand-primary/5 shadow-sm"
                @click="showToolReturnModal = true">
                <Wrench class="mr-2 size-4" />
                Tool Returns
              </Button>

              <Button v-if="['APPROVED_MANAGER', 'COMPLETED'].includes(job.status) && (isManager || isAdminOrSuperAdmin)" 
                class="h-10 px-6 text-xs font-bold bg-amber-600 text-white shadow-md hover:bg-amber-700 transition-all"
                :disabled="isProcessing" @click="handleCloseJobCard">
                <Lock class="mr-2 size-4" />
                Close Job Card
              </Button>

              <Button variant="outline" class="h-10 px-4 text-xs font-bold text-brand-primary border-brand-primary/20 hover:bg-brand-primary/5 shadow-sm"
                @click="handleEditJobCard">
                <Edit class="mr-2 size-4" />
                {{ job.status === 'CLOSED' ? 'Amend Job Card' : 'Edit Items' }}
              </Button>
            </template>
            
            <template v-else-if="job.status === 'REJECTED' && (isManager || isAccountant)">
              <Button variant="outline"
                class="h-10 px-4 text-xs font-bold text-amber-600 border-amber-500/40 hover:bg-amber-50 dark:hover:bg-amber-900/20 gap-2 shadow-sm"
                :disabled="isProcessing"
                @click="handleReInvokeJobCard">
                <svg xmlns="http://www.w3.org/2000/svg" class="size-4" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                  <path d="M3 3v5h5"/>
                </svg>
                Re-invoke Job Card
              </Button>
            </template>
          </div>

          <!-- Divider -->
          <div v-if="!isEditing" class="h-6 w-px bg-border mx-1 hidden md:block" />

          <!-- Utility Actions (Reports, Duplicate, Delete) -->
          <div v-if="!isEditing" class="flex items-center gap-2">
            <Button v-if="job.status === 'SUBMITTED'" variant="outline"
              class="h-10 px-4 text-xs font-bold text-blue-600 border-blue-200 hover:bg-blue-50 shadow-sm"
              @click="handleDuplicateJobCard" :disabled="isDuplicating">
              <Loader2 v-if="isDuplicating" class="mr-2 size-4 animate-spin" />
              <Copy v-else class="mr-2 size-4" />
              Duplicate
            </Button>
          
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" class="h-10 px-4 text-xs font-bold gap-2 shadow-sm">
                  <Download class="size-4" />
                  Reports
                  <ChevronDown class="size-3.5 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" class="w-56">
                <DropdownMenuLabel>Job Reports</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem @click="handleDownloadPdf">
                  <FileText class="mr-2 size-4 text-blue-500" />
                  Download PDF
                </DropdownMenuItem>
                <DropdownMenuItem @click="handleDownloadFullReport">
                  <FileSpreadsheet class="mr-2 size-4 text-purple-500" />
                  Full Report PDF
                </DropdownMenuItem>
                <DropdownMenuItem @click="handleDownloadPerformanceReport">
                  <TrendingUp class="mr-2 size-4 text-green-500" />
                  Performance Report PDF
                </DropdownMenuItem>
                <DropdownMenuSeparator v-if="hasApprovedInventory || hasApprovedExpenses" />
                <DropdownMenuItem v-if="hasApprovedInventory" @click="handleDownloadApprovedInventory">
                  <PackageCheck class="mr-2 size-4 text-emerald-500" />
                  Approved Inventory
                </DropdownMenuItem>
                <DropdownMenuItem v-if="hasApprovedExpenses" @click="handleDownloadApprovedExpenses">
                  <Receipt class="mr-2 size-4 text-orange-500" />
                  Approved Expenses
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button v-if="['DRAFT', 'SUBMITTED', 'APPROVAL_PENDING_ACCOUNTANT', 'APPROVAL_PENDING_MANAGER'].includes(job.status)"
              variant="ghost" class="h-10 px-4 text-xs font-medium text-rose-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
              @click="handleDeleteJobCard" :disabled="isProcessing">
              <Trash2 class="mr-2 size-4" />
              Delete
            </Button>
          </div>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">

      <!-- Main Content -->
      <div class="space-y-8 lg:col-span-12">
        <Tabs v-model="activeTab" class="w-full">
          <div class="relative w-full">
            <!-- Fade overlays for mobile horizontal scrolling indicator -->
            <div class="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-background to-transparent pointer-events-none z-10 lg:hidden"></div>
            <div class="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent pointer-events-none z-10 lg:hidden"></div>

            <TabsList class="bg-muted/50 p-1 h-auto flex flex-nowrap items-center justify-start gap-1 w-full border-b border-border/10 rounded-xl mb-6 overflow-x-auto no-scrollbar scroll-smooth">
              <TabsTrigger value="overview" class="flex items-center gap-2 px-4 py-2 text-xs font-bold transition-all data-[state=active]:bg-background data-[state=active]:text-foreground rounded-lg flex-none whitespace-nowrap">
                <Info class="size-4 shrink-0 text-brand-primary" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="inventory" class="flex items-center gap-2 px-4 py-2 text-xs font-bold transition-all data-[state=active]:bg-background data-[state=active]:text-foreground rounded-lg flex-none whitespace-nowrap">
                <Package class="size-4 shrink-0 text-amber-500" />
                Inventory & Requisitions
                <Badge v-if="requisitionCount || returnsCount" variant="secondary" class="ml-1 text-[10px] px-1.5 py-0 shrink-0">
                  {{ requisitionCount + returnsCount }}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="expenses" class="flex items-center gap-2 px-4 py-2 text-xs font-bold transition-all data-[state=active]:bg-background data-[state=active]:text-foreground rounded-lg flex-none whitespace-nowrap">
                <Receipt class="size-4 shrink-0 text-orange-500" />
                Adhoc expenses
                <Badge v-if="expensesCount" variant="secondary" class="ml-1 text-[10px] px-1.5 py-0 shrink-0">
                  {{ expensesCount }}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="labor" class="flex items-center gap-2 px-4 py-2 text-xs font-bold transition-all data-[state=active]:bg-background data-[state=active]:text-foreground rounded-lg flex-none whitespace-nowrap">
                <Users class="size-4 shrink-0 text-blue-500" />
                Staff Rates
                <Badge v-if="staffRatesCount" variant="secondary" class="ml-1 text-[10px] px-1.5 py-0 shrink-0">
                  {{ staffRatesCount }}
                </Badge>
              </TabsTrigger>
              <TabsTrigger v-if="isEditing || commissionCount || job?.generalInfo?.referrerName" value="commissions" class="flex items-center gap-2 px-4 py-2 text-xs font-bold transition-all data-[state=active]:bg-background data-[state=active]:text-foreground rounded-lg flex-none whitespace-nowrap">
                <TrendingUp class="size-4 shrink-0 text-emerald-500" />
                Commissions
                <Badge v-if="commissionCount" variant="secondary" class="ml-1 text-[10px] px-1.5 py-0 shrink-0">
                  {{ commissionCount }}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="tools" class="flex items-center gap-2 px-4 py-2 text-xs font-bold transition-all data-[state=active]:bg-background data-[state=active]:text-foreground rounded-lg flex-none whitespace-nowrap">
                <Wrench class="size-4 shrink-0 text-rose-500" />
                Tools
                <Badge v-if="toolsCount" variant="secondary" class="ml-1 text-[10px] px-1.5 py-0 shrink-0">
                  {{ toolsCount }}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="billing" class="flex items-center gap-2 px-4 py-2 text-xs font-bold transition-all data-[state=active]:bg-background data-[state=active]:text-foreground rounded-lg flex-none whitespace-nowrap">
                <Receipt class="size-4 shrink-0 text-purple-500" />
                Billing & History
                <Badge v-if="balanceDue > 0" variant="destructive" class="ml-1 text-[9px] px-1.5 py-0 animate-pulse uppercase font-black tracking-wider bg-rose-500 text-white border-none shrink-0">
                  Unpaid
                </Badge>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" class="space-y-8 mt-6">

            <!-- 1. General Information -->
        <template v-if="isEditing">
          <JobInformationCard v-model="editableJob.generalInfo" :is-generating="false" />
        </template>
        <template v-else>
          <Card
            class="bg-brand-primary/5 dark:bg-brand-primary/10 backdrop-blur-md border-brand-primary/20 dark:border-brand-primary/30 shadow-lg text-foreground dark:text-white overflow-hidden">
            <CardHeader
              class="flex flex-row items-center gap-2 pb-2 bg-brand-primary/5 border-b border-brand-primary/10">
              <Info class="size-4 text-brand-primary" />
              <CardTitle class="text-lg font-bold text-brand-primary dark:text-white">General Information</CardTitle>
            </CardHeader>
            <CardContent class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-6 gap-x-12 p-6">
              <!-- Row 1 -->
              <div class="space-y-1">
                <span class="text-[11px] font-bold uppercase text-foreground/50 dark:text-white/50">Job Number</span>
                <p class="text-sm font-medium">{{ job.generalInfo?.jobNumber || 'N/A' }}</p>
              </div>
              <div class="space-y-1">
                <span class="text-[11px] font-bold uppercase text-foreground/50 dark:text-white/50">Category</span>
                <p class="text-sm font-medium">{{ resolveJobCategoryName(job.generalInfo?.jobCategoryId) }}</p>
              </div>
              <div v-if="job.generalInfo?.linkedCrmId" class="space-y-1">
                <span class="text-[11px] font-bold uppercase text-foreground/50 dark:text-white/50">Linked CRM Document</span>
                <div class="flex items-center gap-2">
                   <p class="text-sm font-bold text-brand-primary">{{ job.generalInfo.linkedCrmNumber }}</p>
                   <Badge variant="outline" class="text-[9px] px-1 h-4 uppercase font-black opacity-60">{{ job.generalInfo.linkedCrmType }}</Badge>
                </div>
              </div>
              <div v-else class="space-y-1">
                <span class="text-[11px] font-bold uppercase text-foreground/50 dark:text-white/50">Invoice Value</span>
                <p class="text-sm font-bold text-brand-primary">{{ formatCurrency(job.generalInfo?.jobInvoiceValue || 0) }}</p>
              </div>

              <div v-if="job.generalInfo?.linkedCrmId" class="space-y-1">
                <span class="text-[11px] font-bold uppercase text-foreground/50 dark:text-white/50">Invoice Value</span>
                <p class="text-sm font-bold text-emerald-600">{{ formatCurrency(job.generalInfo.linkedCrmTotal || 0) }}</p>
              </div>

              <!-- Row 2 -->
              <div class="space-y-1">
                <span class="text-[11px] font-bold uppercase text-foreground/50 dark:text-white/50">Start Date</span>
                <p class="text-sm font-medium">{{ job.generalInfo?.startDate || 'Not specified' }}</p>
              </div>
              <div class="space-y-1">
                <span class="text-[11px] font-bold uppercase text-foreground/50 dark:text-white/50">Project
                  Location</span>
                <p class="text-sm font-medium">{{ job.generalInfo?.projectLocation || 'N/A' }}</p>
              </div>
              <div class="space-y-1">
                <span class="text-[11px] font-bold uppercase text-foreground/50 dark:text-white/50">Dimensions</span>
                <p class="text-sm font-medium">{{ job.generalInfo?.dimensionsOfStructure || 'N/A' }}</p>
              </div>

              <!-- Row 3 -->
              <div class="space-y-1">
                <span class="text-[11px] font-bold uppercase text-foreground/50 dark:text-white/50">Recipient
                  Name</span>
                <p class="text-sm font-medium">{{ job.generalInfo?.recipientName || 'N/A' }}</p>
              </div>
              <div class="space-y-1">
                <span class="text-[11px] font-bold uppercase text-foreground/50 dark:text-white/50">Recipient
                  Phone</span>
                <p class="text-sm font-medium">{{ job.generalInfo?.recipientPhone || 'N/A' }}</p>
              </div>
              <div class="space-y-1">
                <span class="text-[11px] font-bold uppercase text-foreground/50 dark:text-white/50">Ecocash /
                  Bank</span>
                <p class="text-sm font-medium">{{ job.generalInfo?.ecocashOrBankAccount || 'N/A' }}</p>
              </div>

              <!-- Divider -->
              <div class="space-y-1 md:col-span-2 lg:col-span-3">
                <Separator class="my-2 bg-brand-primary/10" />
              </div>

              <!-- Row 4 -->
              <div class="md:col-span-2 lg:col-span-3 space-y-1">
                <span class="text-[11px] font-bold uppercase text-foreground/50 dark:text-white/50">Recipient
                  Address</span>
                <p class="text-sm font-medium italic opacity-80">{{ job.generalInfo?.recipientAddress || 'N/A' }}</p>
              </div>

              <!-- Row 5 -->
              <div v-if="job.generalInfo?.projectDescription"
                class="space-y-1 md:col-span-2 lg:col-span-3 mt-2 p-4 bg-brand-primary/5 dark:bg-brand-primary/10 rounded-md border border-brand-primary/10">
                <span class="text-[11px] font-bold uppercase text-foreground/50 dark:text-white/50">Detailed Project
                  Description</span>
                <p class="text-sm font-medium whitespace-pre-wrap leading-relaxed opacity-70 mt-2">{{
                  job.generalInfo?.projectDescription }}</p>
              </div>
            </CardContent>
          </Card>
        </template>

        <!-- 1b. AGF Structure Specifications (Fowlrun jobs only) -->
        <template v-if="job.fowlrunMeta">
          <template v-if="isEditing">
            <AGFStructureCard v-model="editableJob.agfStructure" />
          </template>
          <template v-else>
            <Card class="bg-orange-50/30 dark:bg-orange-900/10 border-orange-200/60 dark:border-orange-700/30 shadow-md overflow-hidden">
              <CardHeader class="bg-orange-50/50 border-b border-orange-200/40 py-5 flex flex-row items-center justify-between">
                <CardTitle class="text-xl font-bold text-orange-600 dark:text-orange-400">AGF Structure Specifications</CardTitle>
                <Button v-if="job.fowlrunMeta?.linkedQuoteId" variant="outline" size="sm" class="border-orange-500 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 h-8" @click="router.push(`/agric-structures/job-cards/${job.fowlrunMeta.linkedQuoteId}`)">
                  View Source Agric Quote
                </Button>
              </CardHeader>
              <CardContent class="p-6">
                <div v-if="job.agfStructure && Object.values(job.agfStructure).some(v => v)" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  <template v-for="item in [
                    ['coverSubtitle','Cover Sub-title'],['birdCapacity','Bird Capacity'],
                    ['trussConstruction','Truss Construction'],['trussType','Truss Type'],
                    ['baySpacing','Bay Spacing'],['purlinType','Purlin Type'],
                    ['sheetingAndFlashing','Sheeting & Flashing'],['sheetingColour','Sheeting Colour'],
                    ['sideCladding','Side Cladding'],['endCladding','End Cladding'],
                    ['doors','Doors'],['gutters','Gutters'],
                    ['fabricationLeadTime','Fabrication Lead Time'],['installationPeriod','Installation Period'],
                    ['totalProjectDuration','Total Project Duration']
                  ]" :key="item[0]">
                    <div v-if="job.agfStructure[item[0] as string]" class="space-y-1">
                      <span class="text-[11px] font-bold uppercase tracking-wider text-orange-600">{{ item[1] }}</span>
                      <p class="text-sm font-medium">{{ job.agfStructure[item[0] as string] }}</p>
                    </div>
                  </template>
                  <div v-if="job.agfStructure.insulationNotes" class="md:col-span-2 lg:col-span-3 space-y-1">
                    <span class="text-[11px] font-bold uppercase tracking-wider text-orange-600">Insulation Notes</span>
                    <p class="text-sm font-medium whitespace-pre-wrap">{{ job.agfStructure.insulationNotes }}</p>
                  </div>
                  <div v-if="job.agfStructure.ventilationNotes" class="md:col-span-2 lg:col-span-3 space-y-1">
                    <span class="text-[11px] font-bold uppercase tracking-wider text-orange-600">Ventilation Notes</span>
                    <p class="text-sm font-medium whitespace-pre-wrap">{{ job.agfStructure.ventilationNotes }}</p>
                  </div>
                </div>
                <p v-else class="text-sm text-muted-foreground italic">No structure specifications entered yet. Click Edit to add them.</p>
              </CardContent>
            </Card>
          </template>
        </template>

        <!-- 1c. Financial Performance Panel (Approved Jobs Only) — 10-Tile Layout -->
        <Card v-if="isMainJobApproved && effectiveFinancials"
          class="bg-brand-primary/5 dark:bg-brand-primary/10 backdrop-blur-md border-brand-primary/20 dark:border-brand-primary/30 shadow-lg text-foreground dark:text-white overflow-hidden">
          <CardHeader class="flex flex-row items-center gap-2 py-3 px-4 bg-brand-primary/5 border-b border-brand-primary/10">
            <svg xmlns="http://www.w3.org/2000/svg" class="size-4 text-brand-primary" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
              <polyline points="16 7 22 7 22 13" />
            </svg>
            <CardTitle class="text-sm font-black uppercase tracking-widest text-brand-primary dark:text-white">Financial Performance</CardTitle>
          </CardHeader>
          <CardContent class="p-4 space-y-6">
            <!-- ── Top Level KPIs (P&L Summary) ────────────────────────────────── -->
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
              <!-- Total Revenue -->
              <div class="rounded-xl border border-border/50 bg-card p-4 shadow-sm space-y-1.5">
                <p class="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70">Invoice Value</p>
                <div class="flex items-baseline gap-2">
                  <p class="text-2xl font-black tabular-nums text-foreground">{{ formatCurrency(effectiveFinancials.totalRevenue) }}</p>
                </div>
                <p class="text-[10px] text-muted-foreground/60 italic leading-tight">Agreed value from CRM / Manager</p>
              </div>

              <!-- Total Cost -->
              <div class="rounded-xl border border-border/50 bg-card p-4 shadow-sm space-y-1.5">
                <p class="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70">Direct Costs</p>
                <p class="text-2xl font-black tabular-nums text-rose-500">{{ formatCurrency(effectiveFinancials.totalCost) }}</p>
                <p class="text-[10px] text-muted-foreground/60 italic leading-tight">Materials + Labor + Expenses + Commission</p>
              </div>

              <!-- Net Profit -->
              <div :class="['rounded-xl border p-4 shadow-md space-y-1.5', effectiveFinancials.netProfit >= 0 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-rose-500/10 border-rose-500/20']">
                <p :class="['text-[10px] font-black uppercase tracking-widest', effectiveFinancials.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600']">Net Profit</p>
                <div class="flex items-center gap-2">
                  <p :class="['text-2xl font-black tabular-nums', effectiveFinancials.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600']">
                    {{ formatCurrency(effectiveFinancials.netProfit) }}
                  </p>
                </div>
                <p class="text-[10px] opacity-70 italic leading-tight">The bottom line for this job</p>
              </div>

              <!-- Profit Margin -->
              <div :class="['rounded-xl border p-4 shadow-sm space-y-1.5', effectiveFinancials.profitMargin >= 20 ? 'bg-emerald-500/5' : effectiveFinancials.profitMargin > 0 ? 'bg-amber-500/5' : 'bg-rose-500/5']">
                <p class="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70">Profit Margin</p>
                <p :class="['text-2xl font-black tabular-nums', effectiveFinancials.profitMargin >= 20 ? 'text-emerald-600' : effectiveFinancials.profitMargin > 0 ? 'text-amber-600' : 'text-rose-600']">
                  {{ effectiveFinancials.profitMargin.toFixed(1) }}%
                </p>
                <div class="h-1.5 w-full rounded-full bg-muted overflow-hidden mt-1">
                  <div :class="['h-full rounded-full transition-all duration-700', effectiveFinancials.profitMargin >= 20 ? 'bg-emerald-500' : effectiveFinancials.profitMargin > 0 ? 'bg-amber-500' : 'bg-rose-500']"
                    :style="{ width: Math.max(0, Math.min(100, effectiveFinancials.profitMargin)) + '%' }" />
                </div>
              </div>
            </div>
            
            <!-- ── Formula Row (Balanced) ────────────────────────────────────────── -->
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <!-- Initial Invoice Value -->
              <div class="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 shadow-sm space-y-1.5 min-h-[100px] flex flex-col justify-center">
                <p class="text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400">Initial Invoice Value</p>
                <p class="text-2xl font-black tabular-nums text-emerald-700 dark:text-emerald-400">{{ formatCurrency(effectiveFinancials.initialInvoiceValue) }}</p>
              </div>

              <!-- Direct & Material costs -->
              <div class="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 shadow-sm space-y-1.5 min-h-[100px] flex flex-col justify-center">
                <p class="text-[10px] font-black uppercase tracking-widest text-rose-700 dark:text-rose-400">IRD Gross + Staff + Adhoc + Commission</p>
                <p class="text-2xl font-black tabular-nums text-rose-700 dark:text-rose-400">{{ formatCurrency(effectiveFinancials.totalOperationalGross) }}</p>
                <p class="text-[9px] text-rose-600/60 font-bold">Operational Costs</p>
              </div>

              <!-- TWID Cumulative Net Amount -->
              <div class="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 shadow-sm space-y-1.5 min-h-[100px] flex flex-col justify-center">
                <p class="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400">T.W.I.D CUMULATIVE NET AMOUNT</p>
                <p class="text-2xl font-black tabular-nums text-amber-700 dark:text-amber-400">{{ formatCurrency(effectiveFinancials.twidNetAfterAdjustments) }}</p>
              </div>

              <!-- TWID Revenue Percentage -->
              <div class="rounded-xl border border-border bg-card p-4 shadow-sm space-y-1.5 min-h-[100px] flex flex-col justify-center">
                <p class="text-[10px] font-black uppercase tracking-widest text-muted-foreground">TWID REVENUE PERCENTAGE</p>
                <p class="text-xl font-black tabular-nums text-foreground">{{ effectiveFinancials.twidRevenuePercentage.toFixed(2) }}%</p>
              </div>
            </div>

            <!-- ── IRD Formula Row (Balanced) ────────────────────────────────────────── -->
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4 pb-4 border-b border-border/30">
              <!-- Inventory Gross Value -->
              <div class="rounded-xl border border-rose-500/20 bg-rose-600 p-4 shadow-sm space-y-1.5 min-h-[100px] flex flex-col justify-center">
                <p class="text-[10px] font-black uppercase tracking-widest text-white/80">Inventory Gross Value</p>
                <p class="text-2xl font-black tabular-nums text-white">{{ formatCurrency(effectiveFinancials.irdGrossRevenue) }}</p>
                <p class="text-[8px] text-white/60 font-bold">(PURCHASING + MARKUP)</p>
              </div>

              <!-- IRD Inventory Purchasing Price -->
              <div class="rounded-xl border border-border bg-card p-4 shadow-sm space-y-1.5 min-h-[100px] flex flex-col justify-center">
                <p class="text-[10px] font-black uppercase tracking-widest text-muted-foreground">I.R.D INVENTORY PURCHASING PRICE</p>
                <p class="text-2xl font-black tabular-nums text-foreground">{{ formatCurrency(effectiveFinancials.irdBaseCost) }}</p>
                <p class="text-[8px] text-muted-foreground/60 font-bold">(CUMULATIVE)</p>
              </div>

              <!-- IRD Cumulative Net Revenue -->
              <div class="rounded-xl border border-border bg-card p-4 shadow-sm space-y-1.5 min-h-[100px] flex flex-col justify-center">
                <p class="text-[10px] font-black uppercase tracking-widest text-muted-foreground">I.R.D CUMULATIVE NET REVENUE</p>
                <p class="text-2xl font-black tabular-nums text-foreground">{{ formatCurrency(effectiveFinancials.irdCumulativeNetRevenue) }}</p>
              </div>

              <!-- IRD Revenue Percentage -->
              <div class="rounded-xl border border-border bg-card p-4 shadow-sm space-y-1.5 min-h-[100px] flex flex-col justify-center">
                <p class="text-[10px] font-black uppercase tracking-widest text-muted-foreground">I.R.D REVENUE PERCENTAGE</p>
                <p class="text-xl font-black tabular-nums text-foreground">{{ effectiveFinancials.irdRevenuePercentage.toFixed(1) }}%</p>
              </div>
            </div>

            <!-- ── Financial Breakdown Visualization ────────────────────────── -->
            <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-4 border-t border-border/10">
              <!-- Chart Column -->
              <div class="lg:col-span-4 flex flex-col items-center justify-center p-6 bg-muted/5 rounded-2xl border border-border/50">
                 <div class="w-full flex items-center justify-between mb-4">
                    <div class="flex items-center gap-2">
                      <PieChart class="size-4 text-brand-primary" />
                      <span class="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Revenue Allocation</span>
                    </div>
                    <Badge variant="outline" class="text-[9px] font-bold">100% OF INVOICE</Badge>
                 </div>

                 <div class="relative w-full aspect-square max-w-[240px]">
                    <VisSingleContainer :data="financialChartData" :height="240" :margin="{ top: 10, right: 10, bottom: 10, left: 10 }">
                      <VisDonut 
                        :value="(d: any) => d.value" 
                        :color="(d: any) => d.color"
                        :thickness="25"
                        :cornerRadius="5"
                        :showLabels="false"
                      />
                      <VisTooltip />
                    </VisSingleContainer>
                    
                    <!-- Center Overlay -->
                    <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span class="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-tighter">Total Invoice</span>
                      <span class="text-xl font-black tabular-nums text-foreground">{{ formatCurrency(effectiveFinancials.initialInvoiceValue) }}</span>
                    </div>
                 </div>

                 <!-- Legend -->
                 <div class="grid grid-cols-2 gap-x-6 gap-y-2 mt-6 w-full">
                    <div v-for="item in financialChartData" :key="item.name" class="flex items-center gap-2">
                       <div class="size-2 rounded-full" :style="{ backgroundColor: item.color }"></div>
                       <div class="flex flex-col">
                          <span class="text-[9px] font-bold text-muted-foreground uppercase leading-none">{{ item.name }}</span>
                          <span class="text-[10px] font-black tabular-nums leading-tight">{{ formatCurrency(item.value) }}</span>
                       </div>
                    </div>
                 </div>
              </div>

              <!-- Metrics Column (Detailed Breakdown) -->
              <div class="lg:col-span-8">
              
              <!-- Column 1: Revenue Detail -->
              <div class="space-y-3">
                <h4 class="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50 border-b pb-1">Revenue Breakdown</h4>
                <div class="space-y-2">
                  <div class="flex justify-between items-center text-xs">
                    <span class="text-muted-foreground">Inventory Sales</span>
                    <span class="font-bold tabular-nums">{{ formatCurrency(effectiveFinancials.irdGrossRevenue) }}</span>
                  </div>

                  <div class="flex justify-between items-center text-xs">
                    <span class="text-muted-foreground">Labor & Expenses Billed</span>
                    <span class="font-bold tabular-nums">{{ formatCurrency(effectiveFinancials.implementationCost) }}</span>
                  </div>
                  <div v-if="effectiveFinancials.totalAdjustments > 0" class="flex justify-between items-center text-xs pt-1 border-t border-dashed">
                    <span class="text-amber-600 font-medium">Adjustments (Reductions)</span>
                    <span class="font-bold tabular-nums text-amber-600">-{{ formatCurrency(effectiveFinancials.totalAdjustments) }}</span>
                  </div>
                </div>

                <!-- IRD Remittance Card (Specific Workflow) -->
                <div class="mt-4 p-3 rounded-lg border border-brand-primary/20 bg-brand-primary/5 space-y-2">
                   <div class="flex justify-between items-center">
                     <p class="text-[9px] font-black uppercase tracking-widest text-brand-primary">IRD Remittance</p>
                     <span class="text-xs font-black text-brand-primary">{{ formatCurrency(effectiveFinancials.irdNetRevenue) }}</span>
                   </div>
                   <p class="text-[8px] text-muted-foreground leading-tight italic">Revenue due to IRD account for materials.</p>
                   <div v-if="irdTransferStatus" class="pt-1">
                      <div class="flex items-center gap-1.5">
                        <span class="text-[9px] font-black uppercase tracking-wide"
                          :class="irdTransferStatus.status === 'COMPLETED' ? 'text-emerald-500' : 'text-amber-500'">
                          {{ irdTransferStatus.status === 'COMPLETED' ? '✓ Transferred' : '⏳ Awaiting Approval' }}
                        </span>
                      </div>
                      <Button v-if="irdTransferStatus.status === 'PENDING_MANAGER' && isManager"
                        size="sm" class="h-6 text-[9px] font-black uppercase px-2 bg-emerald-600 hover:bg-emerald-700 text-white w-full mt-1"
                        :disabled="irdTransferring" @click="handleApproveIrdTransfer">
                        Approve Transfer
                      </Button>
                   </div>
                   <Button v-else-if="isMainJobApprovedByManager && (isManager || isAccountant) && effectiveFinancials.irdNetRevenue > 0"
                      size="sm" variant="outline"
                      class="h-6 text-[9px] font-black uppercase px-2 border-brand-primary/40 text-brand-primary hover:bg-brand-primary hover:text-white w-full"
                      @click="showIrdTransferModal = true">
                      Transfer to IRD
                   </Button>
                </div>
              </div>

              <!-- Column 2: Cost Detail -->
              <div class="space-y-3">
                <h4 class="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50 border-b pb-1">Cost Breakdown</h4>
                <div class="space-y-2">
                  <div class="flex justify-between items-center text-xs">
                    <span class="text-muted-foreground">Inventory Base Cost</span>
                    <span class="font-bold tabular-nums">{{ formatCurrency(effectiveFinancials.irdBaseCost) }}</span>
                  </div>
                  <div class="flex justify-between items-center text-xs">
                    <span class="text-muted-foreground">Staff & Labor Costs</span>
                    <span class="font-bold tabular-nums">{{ formatCurrency(safeTotals.staffRatesTotal) }}</span>
                  </div>
                  <div class="flex justify-between items-center text-xs">
                    <span class="text-muted-foreground">Ad-hoc Expenses</span>
                    <span class="font-bold tabular-nums">{{ formatCurrency(effectiveFinancials.operationalExpenses + effectiveFinancials.adjustmentAdhoc) }}</span>
                  </div>
                  <div v-if="effectiveFinancials.returnsProfit > 0" class="flex justify-between items-center text-xs pt-1 border-t border-dashed">
                    <span class="text-emerald-600 font-medium">Returns (Cost Recovery)</span>
                    <span class="font-bold tabular-nums text-emerald-600">-{{ formatCurrency(effectiveFinancials.returnsProfit) }}</span>
                  </div>
                </div>
              </div>

              <!-- Column 3: Performance Insights -->
              <div class="space-y-3">
                <h4 class="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50 border-b pb-1">Performance Benchmarks</h4>
                <div class="space-y-2.5">
                   <div class="p-2.5 rounded-lg bg-muted/30 border border-border/50">
                     <p class="text-[9px] font-black uppercase text-muted-foreground/70">Original Profit Target</p>
                     <p class="text-sm font-black tabular-nums text-foreground/80 mt-0.5">{{ formatCurrency(effectiveFinancials.targetJobNet) }}</p>
                     <p class="text-[8px] text-muted-foreground/60 italic">Expected margin at creation</p>
                   </div>

                   <div class="p-2.5 rounded-lg border border-border/50" :class="effectiveFinancials.netProfit >= effectiveFinancials.targetJobNet ? 'bg-emerald-500/5' : 'bg-orange-500/5'">
                     <div class="flex justify-between items-center">
                        <p class="text-[9px] font-black uppercase text-muted-foreground/70">Profit Variance</p>
                        <Badge :variant="effectiveFinancials.netProfit >= effectiveFinancials.targetJobNet ? 'default' : 'secondary'" class="text-[8px] h-4">
                          {{ effectiveFinancials.netProfit >= effectiveFinancials.targetJobNet ? 'ABOVE TARGET' : 'BELOW TARGET' }}
                        </Badge>
                     </div>
                     <p class="text-sm font-black tabular-nums mt-1" :class="effectiveFinancials.netProfit >= effectiveFinancials.targetJobNet ? 'text-emerald-600' : 'text-orange-600'">
                       {{ effectiveFinancials.netProfit >= effectiveFinancials.targetJobNet ? '+' : '' }}{{ formatCurrency(effectiveFinancials.netProfit - effectiveFinancials.targetJobNet) }}
                     </p>
                     <p class="text-[8px] text-muted-foreground/60 italic">Actual vs Original Target</p>
                   </div>
                </div>
              </div>

            </div>
            </div>

            <!-- ── Payment & Collection Summary ───────────────────────────────── -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4 border-t border-border/30">
              <div class="flex items-center gap-3 p-3 rounded-xl bg-blue-500/5 border border-blue-500/10">
                <div class="p-2 rounded-full bg-blue-500/10 text-blue-600">
                  <Receipt class="size-4" />
                </div>
                <div>
                  <p class="text-[9px] font-black uppercase tracking-widest text-blue-600/70">Total Collected</p>
                  <p class="text-base font-black text-blue-600 tabular-nums">{{ formatCurrency(totalPaid) }}</p>
                </div>
              </div>

              <div class="flex items-center gap-3 p-3 rounded-xl border border-border/50" :class="isFullyPaid ? 'bg-emerald-500/5 border-emerald-500/10' : 'bg-amber-500/5 border-amber-500/10'">
                <div class="p-2 rounded-full" :class="isFullyPaid ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'">
                  <Clock class="size-4" />
                </div>
                <div>
                  <p class="text-[9px] font-black uppercase tracking-widest" :class="isFullyPaid ? 'text-emerald-600/70' : 'text-amber-600/70'">Balance Due</p>
                  <p class="text-base font-black tabular-nums" :class="isFullyPaid ? 'text-emerald-600' : 'text-amber-600'">{{ formatCurrency(balanceDue) }}</p>
                </div>
              </div>

              <div class="flex flex-col justify-center p-3 rounded-xl border border-border/50 bg-card space-y-1.5">
                <div class="flex items-center justify-between">
                  <p class="text-[9px] font-black uppercase tracking-widest text-muted-foreground/70">Collection Rate</p>
                  <p class="text-xs font-black text-blue-600 tabular-nums">{{ paymentProgress.toFixed(0) }}%</p>
                </div>
                <div class="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div :class="['h-full rounded-full transition-all duration-700', isFullyPaid ? 'bg-emerald-500' : 'bg-blue-500']"
                    :style="{ width: paymentProgress.toFixed(1) + '%' }" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="inventory" class="space-y-8 mt-6">
        <!-- 2. Inventory Requisition Grid -->
        <template v-if="isEditing">
          <div class="space-y-4">
            <h3 class="text-xl font-semibold">Inventory Requisition</h3>
            <InventoryRequisitionGrid v-model="editableJob.requisitionItems" :general-info="job.generalInfo" :is-admin="isAdminOrSuperAdmin" />
          </div>
        </template>
        <template v-else>
          <Card
            class="bg-brand-primary/5 dark:bg-brand-primary/10 backdrop-blur-md border-brand-primary/20 dark:border-brand-primary/30 shadow-lg text-foreground dark:text-white overflow-hidden">
            <CardHeader
              class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-brand-primary/5 border-b border-brand-primary/10 py-4 px-4 sm:px-6">
              <div class="flex items-center gap-2">
                <Package class="size-4 text-brand-primary" />
                <CardTitle class="text-base sm:text-lg font-bold text-brand-primary dark:text-white">Inventory Requisition</CardTitle>
              </div>
              <Button v-if="(isAccountant || isManager) && isMainJobApproved" size="sm" variant="outline"
                class="h-8 text-[10px] sm:text-xs font-bold border-green-500/40 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 gap-1.5 w-full sm:w-auto mt-1 sm:mt-0"
                :disabled="isProcessing"
                @click="handleApproveAllInventory">
                <CheckCircle2 class="size-3" />
                Approve All {{ isManager ? '(Manager)' : '(Accountant)' }}
              </Button>
            </CardHeader>
            <CardContent class="p-0 overflow-x-auto">
              <!-- Desktop Table View -->
              <Table v-if="!isMobile" class="border-collapse table-fixed w-full border-t border-l border-white/80">
                <TableHeader>
                  <TableRow class="bg-muted/20 border-b border-white/80">
                    <TableHead class="text-xs font-bold w-12 px-2 text-center text-foreground dark:text-white border-r border-b border-white/80">#</TableHead>
                    <TableHead
                      class="text-xs font-bold px-4 w-64 text-foreground dark:text-white border-r border-b border-white/80">
                      Item Name
                    </TableHead>
                    <TableHead
                      class="text-xs font-bold text-foreground dark:text-white border-r border-b border-white/80">
                      Description
                    </TableHead>
                    <TableHead
                      class="text-xs font-bold text-right w-24 text-foreground dark:text-white border-r border-b border-white/80">
                      Qty
                    </TableHead>
                    <TableHead
                      class="text-xs font-bold text-right w-32 text-foreground dark:text-white border-r border-b border-white/80">
                      IRD
                      (Selling)</TableHead>

                    <TableHead
                      class="text-xs font-bold text-right w-40 text-foreground dark:text-white border-r border-b border-white/80">
                      Total
                      Price</TableHead>

                    <TableHead v-if="isMainJobApproved"
                      class="text-xs font-bold text-right w-48 text-foreground dark:text-white border-r border-b border-white/80">
                      Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <template v-for="(section, sIdx) in requisitionItems" :key="section.id">
                    <!-- Category Header Row -->
                    <TableRow class="bg-muted/10 border-b border-white/80">
                      <TableCell class="px-2 py-3 border-r border-b border-white/80 bg-muted/20 font-black text-center text-[10px]">
                        {{ String.fromCharCode(65 + Number(sIdx)) }}
                      </TableCell>
                      <TableCell colspan="3"
                        class="px-4 py-3 font-black text-foreground dark:text-white uppercase text-xs border-r border-b border-white/80">
                        <div class="flex flex-col gap-1">
                          <span>{{ resolveJobCategoryName(section.jobCategoryId) }}</span>
                          <div v-if="section.description"
                            class="normal-case italic font-medium opacity-70 w-full max-w-4xl xl:w-[60vw] break-words whitespace-normal leading-normal">
                            {{ section.description }}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell class="p-0 bg-muted/10 border-r border-b border-white/80"></TableCell>
                      <TableCell
                        class="text-right py-2 font-black text-foreground dark:text-white tabular-nums border-r border-b border-white/80 pl-4">
                        {{ formatCurrency((section.items || []).reduce((sum: number, i: any) => sum + (Number(i.rowGrandTot) || 0), 0)) }}
                      </TableCell>
                      <TableCell v-if="isMainJobApproved" class="text-right py-2 border-r border-b border-white/80">
                        <Badge variant="outline" class="text-[9px] opacity-40">SECTION TOTAL</Badge>
                      </TableCell>
                    </TableRow>

                    <!-- Nested Item Rows -->
                    <TableRow v-for="(item, iIdx) in section.items" :key="item.id"
                      class="text-sm border-b border-white/80 last:border-b hover:bg-muted/10 transition-colors">
                      <TableCell class="text-center tabular-nums font-bold text-[11px] opacity-50 border-r border-b border-white/80">
                        {{ getGlobalMaterialIndex(Number(sIdx), Number(iIdx)) }}
                      </TableCell>
                      <TableCell class="px-4 py-2 font-medium border-r border-b border-white/80">
                        <div class="flex flex-col gap-0.5">
                          <div class="flex items-center gap-2">
                            <div class="w-1 h-1 rounded-full bg-brand-primary/30"></div>
                            {{ item.itemName }}
                            <Badge v-if="item.isAdjustment" variant="outline"
                              class="text-[8px] font-black bg-amber-100 text-amber-700 border-amber-200 py-0 px-1">
                              ADJUSTMENT</Badge>
                          </div>
                          <div class="flex items-center gap-2 mt-0.5 ml-3">
                            <span v-if="item.createdAt" class="text-[9px] text-muted-foreground italic">Added: {{ new Date(item.createdAt).toLocaleString() }}</span>
                            <span v-else-if="item.isAdjustment" class="text-[9px] font-bold text-amber-600/80">
                              {{ formatDate(item.adjustmentDate || job.updatedAt) }}
                            </span>
                          </div>
                          <span class="text-[10px] opacity-60 font-normal ml-3 italic">
                            {{ resolveJobCategoryName(item.jobCategoryId || section.jobCategoryId) }}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell class="py-2 px-3 border-r border-b border-white/80 text-[11px] text-muted-foreground">
                        {{ item.description || '—' }}
                      </TableCell>
                      <TableCell class="text-right tabular-nums py-2 border-r border-b border-white/80">{{ item.qty }}
                      </TableCell>
                      <TableCell class="text-right tabular-nums py-2 border-r border-b border-white/80">{{
                        formatCurrency(item.irdSellingPrice) }}
                      </TableCell>

                      <TableCell
                        class="text-right font-bold opacity-80 tabular-nums py-2 border-r border-b border-white/80">
                        {{
                          formatCurrency(item.rowGrandTot) }}</TableCell>

                      <TableCell v-if="isMainJobApproved"
                        class="text-right whitespace-nowrap py-2 pl-4 border-r border-b border-white/80">
                        <template
                          v-if="item.approvalStatus === 'APPROVED_MANAGER' || item.approvalStatus === 'REJECTED'">
                          <div class="flex items-center justify-end gap-1">
                            <Badge :variant="getItemStatusVariant(item.approvalStatus)">{{ item.approvalStatus ===
                              'APPROVED_MANAGER' ? 'APPROVED' : 'REJECTED' }}</Badge>
                            <Button v-if="(item.approvalStatus === 'REJECTED' && (isAccountant || isManager)) || (item.approvalStatus === 'APPROVED_MANAGER' && isAdminOrSuperAdmin)"
                              size="icon" variant="outline" :title="item.approvalStatus === 'REJECTED' ? 'Re-invoke — reset to Pending' : 'Unlock PDF Download'"
                              class="h-6 w-6 text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 border-amber-300/50"
                              :disabled="isProcessing"
                              @click="handleUnlockPdf('requisitionItems', item.id)">
                              <svg v-if="item.approvalStatus === 'REJECTED'" xmlns="http://www.w3.org/2000/svg" class="size-3" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
                              </svg>
                              <svg v-else xmlns="http://www.w3.org/2000/svg" class="size-3" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
                              </svg>
                            </Button>
                          </div>
                        </template>
                        <template v-else-if="item.approvalStatus === 'APPROVED_ACCOUNTANT'">
                          <div class="flex items-center justify-end gap-1">
                            <Badge variant="secondary" class="mr-2">ACCT OK</Badge>
                            <template v-if="isManager">
                              <Button size="icon" variant="outline"
                                class="h-6 w-6 text-green-600 dark:text-green-400 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
                                @click="handleItemApproval('requisitionItems', item.id, 'APPROVED_MANAGER')">
                                <CheckCircle2 class="size-3" />
                              </Button>
                              <Button size="icon" variant="outline"
                                class="h-6 w-6 text-red-600 dark:text-red-400 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                                @click="handleItemApproval('requisitionItems', item.id, 'REJECTED')">
                                <XCircle class="size-3" />
                              </Button>
                            </template>
                          </div>
                        </template>
                        <template v-else>
                          <div class="flex items-center justify-end gap-1">
                            <Badge variant="outline" class="mr-2">PENDING</Badge>
                            <template v-if="isAccountant">
                              <Button size="icon" variant="outline"
                                class="h-6 w-6 text-green-600 dark:text-green-400 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
                                @click="handleItemApproval('requisitionItems', item.id, 'APPROVED_ACCOUNTANT')">
                                <CheckCircle2 class="size-3" />
                              </Button>
                              <Button size="icon" variant="outline"
                                class="h-6 w-6 text-red-600 dark:text-red-400 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                                @click="handleItemApproval('requisitionItems', item.id, 'REJECTED')">
                                <XCircle class="size-3" />
                              </Button>
                            </template>
                          </div>
                        </template>
                      </TableCell>
                    </TableRow>
                  </template>
                  <TableRow v-if="requisitionItems.length === 0">
                    <TableCell colspan="7" class="text-center py-12 opacity-60 italic border-0">No inventory items
                      requested.</TableCell>
                  </TableRow>
                </TableBody>
              </Table>

              <!-- Mobile Card View -->
              <div v-else class="space-y-3 px-2 py-2">
                <div v-for="(section, sIdx) in requisitionItems" :key="section.id" 
                    class="space-y-2 rounded-2xl border bg-muted/10 p-1 shadow-sm">
                    
                    <!-- Section Header -->
                    <div class="relative overflow-hidden rounded-lg border bg-card shadow-sm">
                        <div class="flex items-center justify-between px-2 py-1.5 bg-brand-primary/5 border-b border-brand-primary/10">
                            <div class="flex items-center gap-2">
                                <div class="p-1 rounded-md bg-brand-primary/10 text-brand-primary">
                                    <LayoutGrid class="size-3" />
                                </div>
                                <div class="flex flex-col">
                                    <span class="text-[9px] font-black uppercase tracking-widest text-brand-primary leading-none">Section {{ String.fromCharCode(65 + Number(sIdx)) }}</span>
                                    <span class="text-xs font-bold text-foreground mt-0.5">{{ resolveJobCategoryName(section.jobCategoryId) }}</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="p-2 space-y-2">
                            <p v-if="section.description" class="text-[11px] italic text-muted-foreground bg-muted/30 p-2 rounded-lg border border-border/40 leading-relaxed">
                                {{ section.description }}
                            </p>

                            <div class="flex justify-between items-center p-2 rounded-lg bg-brand-primary/5 border border-brand-primary/10">
                                <span class="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Section Total</span>
                                <span class="text-base font-black text-brand-primary">{{ formatCurrency((section.items || []).reduce((sum: number, i: any) => sum + (Number(i.rowGrandTot) || 0), 0)) }}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Items in Section -->
                    <div class="space-y-1 px-0.5">
                        <div v-for="(item, iIdx) in section.items" :key="item.id" 
                            class="relative overflow-hidden rounded-lg border bg-card shadow-sm transition-all"
                            :class="[getItemStatusVariant(item.approvalStatus) === 'destructive' ? 'border-rose-500/20 bg-rose-50/10' : 'border-border/60']">
                            
                            <div class="flex items-center justify-between px-2 py-1 bg-muted/5 border-b border-border/40">
                                <div class="flex items-center gap-2">
                                    <span class="flex size-4 items-center justify-center rounded-full bg-blue-600 text-[8px] font-black text-white shadow-sm">
                                        {{ getGlobalMaterialIndex(Number(sIdx), Number(iIdx)) }}
                                    </span>
                                    <span class="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Item Entry</span>
                                </div>
                                <Badge v-if="isMainJobApproved" :variant="getItemStatusVariant(item.approvalStatus)" class="h-3.5 text-[7px] font-black uppercase px-1">
                                    {{ item.approvalStatus === 'APPROVED_MANAGER' ? 'Approved' : item.approvalStatus === 'REJECTED' ? 'Rejected' : 'Pending' }}
                                </Badge>
                            </div>

                            <div class="p-2 space-y-2">
                                <!-- Item Name -->
                                <div class="space-y-0.5">
                                    <div class="flex items-center gap-2">
                                        <p class="text-xs font-bold text-foreground">{{ item.itemName }}</p>
                                        <Badge v-if="item.isAdjustment" variant="outline" class="text-[7px] bg-amber-100 text-amber-700 border-amber-200">ADJ</Badge>
                                    </div>
                                    <p v-if="item.description" class="text-[10px] text-muted-foreground leading-snug">{{ item.description }}</p>
                                </div>

                                <!-- Qty & Total -->
                                <div class="grid grid-cols-2 gap-1 py-1 border-y border-border/40 bg-muted/5 -mx-2 px-2">
                                    <div class="space-y-0">
                                        <p class="text-[7px] font-black uppercase text-muted-foreground tracking-widest leading-none">Qty & Rate</p>
                                        <p class="text-[10px] font-bold">{{ item.qty }} × {{ formatCurrency(item.irdSellingPrice) }}</p>
                                    </div>
                                    <div class="text-right space-y-0">
                                        <p class="text-[7px] font-black uppercase text-brand-primary tracking-widest leading-none">Total Value</p>
                                        <p class="text-[11px] font-black text-brand-primary">{{ formatCurrency(item.rowGrandTot) }}</p>
                                    </div>
                                </div>

                                <!-- Approval Actions (View Only Mode) -->
                                <div v-if="isMainJobApproved && (item.approvalStatus !== 'APPROVED_MANAGER' || isAccountant || isManager || isAdminOrSuperAdmin)" 
                                     class="pt-0.5 flex flex-wrap justify-end gap-1">
                                     
                                    <Button v-if="(item.approvalStatus === 'REJECTED' && (isAccountant || isManager)) || (item.approvalStatus === 'APPROVED_MANAGER' && isAdminOrSuperAdmin)"
                                        size="sm" variant="outline" class="h-7 px-2 text-[8px] font-black uppercase gap-1 text-amber-600 border-amber-200 bg-amber-50/50 hover:bg-amber-50 shadow-sm"
                                        :disabled="isProcessing"
                                        @click="handleUnlockPdf('requisitionItems', item.id)">
                                        <Loader2 v-if="isProcessing" class="size-3 animate-spin"/>
                                        <template v-else>
                                          <svg v-if="item.approvalStatus === 'REJECTED'" xmlns="http://www.w3.org/2000/svg" class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
                                          </svg>
                                          <Lock v-else class="size-3" />
                                        </template>
                                        {{ item.approvalStatus === 'REJECTED' ? 'Re-invoke' : 'Unlock' }}
                                    </Button>

                                    <!-- Accountant Approval -->
                                    <template v-if="(!item.approvalStatus || item.approvalStatus === 'PENDING') && isAccountant">
                                        <div class="flex gap-1 w-full sm:w-auto mt-1 sm:mt-0">
                                            <Button size="sm" variant="outline" class="flex-1 sm:flex-none h-8 px-2 text-[8px] font-black uppercase text-green-600 border-green-600/20 bg-green-600/5 hover:bg-green-600/10"
                                              :disabled="isProcessing"
                                              @click="handleItemApproval('requisitionItems', item.id, 'APPROVED_ACCOUNTANT')">Approve (Acct)</Button>
                                            <Button size="sm" variant="outline" class="flex-1 sm:flex-none h-8 px-2 text-[8px] font-black uppercase text-rose-600 border-rose-600/20 bg-rose-600/5 hover:bg-rose-600/10"
                                              :disabled="isProcessing"
                                              @click="handleItemApproval('requisitionItems', item.id, 'REJECTED')">Reject</Button>
                                        </div>
                                    </template>

                                    <template v-if="item.approvalStatus === 'APPROVED_ACCOUNTANT' && isManager">
                                        <div class="flex gap-1 w-full sm:w-auto mt-1 sm:mt-0">
                                            <Button size="sm" variant="outline" class="flex-1 sm:flex-none h-8 px-2 text-[8px] font-black uppercase text-green-600 border-green-600/20 bg-green-600/5 hover:bg-green-600/10"
                                              :disabled="isProcessing"
                                              @click="handleItemApproval('requisitionItems', item.id, 'APPROVED_MANAGER')">Approve (Mgr)</Button>
                                            <Button size="sm" variant="outline" class="flex-1 sm:flex-none h-8 px-2 text-[8px] font-black uppercase text-rose-600 border-rose-600/20 bg-rose-600/5 hover:bg-rose-600/10"
                                              :disabled="isProcessing"
                                              @click="handleItemApproval('requisitionItems', item.id, 'REJECTED')">Reject</Button>
                                        </div>
                                    </template>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div v-if="requisitionItems.length === 0" class="flex flex-col items-center justify-center py-20 px-4 text-center space-y-5">
                    <div class="size-20 rounded-3xl bg-brand-primary/10 flex items-center justify-center shadow-inner">
                        <LayoutGrid class="size-10 text-brand-primary/30" />
                    </div>
                    <div class="space-y-2">
                        <h4 class="text-base font-black text-muted-foreground tracking-tight">Requisition Empty</h4>
                        <p class="text-sm text-muted-foreground/60 max-w-[200px] mx-auto">No inventory items requested for this job.</p>
                    </div>
                </div>
              </div>
            </CardContent>
            <div v-if="requisitionItems.length > 0" class="bg-muted/5 p-4 border-t border-muted/20 flex flex-col md:flex-row justify-end items-end md:items-center gap-4 md:gap-8">
              <div class="flex gap-4 md:gap-8 text-sm">
                <div class="flex flex-col items-end">
                  <span class="text-[10px] uppercase text-muted-foreground font-black tracking-widest">Base IRD</span>
                  <span class="font-bold">{{ formatCurrency(safeTotals.inventoryIRDTotal) }}</span>
                </div>

                <div v-if="!isMobile" class="flex flex-col items-end">
                  <span class="text-[10px] uppercase text-muted-foreground font-black tracking-widest">IMP Cost</span>
                  <span class="font-bold text-primary">+{{ formatCurrency(safeTotals.implementationCost) }}</span>
                </div>
              </div>
              <div class="flex flex-col items-end md:border-l md:pl-8 md:ml-2">
                <span class="text-[10px] uppercase text-primary font-black tracking-widest">INV Subtotal</span>
                <span class="text-lg font-black text-primary">{{ formatCurrency(safeTotals.inventorySubtotal) }}</span>
              </div>
            </div>
          </Card>
        </template>
      </TabsContent>

      <TabsContent value="expenses" class="space-y-8 mt-6">
        <!-- 3. Ad-hoc Expenses Grid -->
        <template v-if="isEditing">
          <div class="space-y-4">
            <div class="flex flex-col">
              <h3 class="text-xl font-semibold">Job Card Expenses (Ad-hoc)</h3>
              <p class="text-sm text-muted-foreground">Add miscellaneous items (e.g., lunch money, airtime, food) that
                are not in inventory.</p>
            </div>
            <JobCardExpensesGrid v-model="editableJob.adHocExpenses" :general-info="job.generalInfo" :is-admin="isAdminOrSuperAdmin" />
          </div>
        </template>
        <template v-else>
          <Card
            class="bg-brand-primary/5 dark:bg-brand-primary/10 backdrop-blur-md border-brand-primary/20 dark:border-brand-primary/30 shadow-lg text-foreground dark:text-white overflow-hidden">
            <CardHeader
              class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-brand-primary/5 border-b border-brand-primary/10 py-4 px-4 sm:px-6">
              <div class="flex items-center gap-4 min-w-0">
                <div class="flex items-center gap-2">
                  <Receipt class="size-4 text-orange-500" />
                  <CardTitle class="text-base sm:text-lg font-bold text-brand-primary dark:text-white">Ad-hoc Expenses</CardTitle>
                </div>
                <div v-if="adHocExpenses.length > 0" class="min-w-0">
                  <div class="flex items-baseline gap-2 rounded-md border border-orange-500/20 bg-orange-500/5 px-2 py-0.5 sm:px-3 sm:py-1">
                    <span class="text-[9px] sm:text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-black whitespace-nowrap">
                      {{ pendingAdHocApprovalSummary.label }}
                    </span>
                    <span class="text-xs sm:text-sm font-black text-orange-600 tabular-nums whitespace-nowrap">
                      {{ formatCurrency(pendingAdHocApprovalSummary.total) }}
                    </span>
                  </div>
                </div>
              </div>
              <Button v-if="(isAccountant || isManager) && isMainJobApproved" size="sm" variant="outline"
                class="h-8 text-[10px] sm:text-xs font-bold border-green-500/40 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 gap-1.5 w-full sm:w-auto mt-1 sm:mt-0"
                :disabled="isProcessing"
                @click="handleApproveAllExpenses">
                <CheckCircle2 class="size-3" />
                Approve All {{ isManager ? '(Manager)' : '(Accountant)' }}
              </Button>
            </CardHeader>
            <CardContent class="p-0 overflow-x-auto">
              <!-- Desktop Table View -->
              <Table v-if="!isMobile" class="border-collapse table-fixed w-full border-t border-l border-white/80">
                <TableHeader>
                  <TableRow class="bg-muted/20 border-b border-white/80">
                    <TableHead class="text-xs font-bold w-12 px-2 text-center text-foreground dark:text-white border-r border-b border-white/80">#</TableHead>
                    <TableHead
                      class="text-xs font-bold px-4 text-foreground dark:text-white border-r border-b border-white/80">
                      Description
                    </TableHead>
                    <TableHead
                      class="text-xs font-bold px-4 w-40 text-foreground dark:text-white border-r border-b border-white/80">
                      Recipient Name
                    </TableHead>
                    <TableHead
                      class="text-xs font-bold px-4 w-32 text-foreground dark:text-white border-r border-b border-white/80">
                      Phone
                    </TableHead>
                    <TableHead
                      class="text-xs font-bold text-right w-24 text-foreground dark:text-white border-r border-b border-white/80">
                      Qty
                    </TableHead>
                    <TableHead
                      class="text-xs font-bold text-right w-32 text-foreground dark:text-white border-r border-b border-white/80">
                      Unit
                      Price</TableHead>
                    <TableHead
                      class="text-xs font-bold text-right w-40 text-foreground dark:text-white border-r border-b border-white/80">
                      Total
                    </TableHead>
                    <TableHead
                      class="text-xs font-bold px-4 w-32 text-foreground dark:text-white border-r border-b border-white/80">
                      Method
                    </TableHead>
                    <TableHead
                      class="text-xs font-bold text-center w-24 text-foreground dark:text-white border-r border-b border-white/80">
                      Receipt
                    </TableHead>

                    <TableHead v-if="isMainJobApproved"
                      class="text-xs font-bold text-right w-48 text-foreground dark:text-white border-r border-b border-white/80">
                      Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <template v-for="(exp, expIdx) in adHocExpenses" :key="exp.id">
                    <!-- ── INLINE EDIT ROW ── -->
                    <TableRow v-if="editingExpenseId === exp.id"
                      class="text-sm border-b border-white/80 bg-amber-500/5">
                      <TableCell class="px-2 border-r border-b border-white/80">
                        <input v-model="editingExpenseForm.description"
                          class="w-full bg-background border border-muted/40 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                          placeholder="Description" />
                      </TableCell>
                      <TableCell class="px-2 border-r border-b border-white/80">
                        <input v-model="editingExpenseForm.recipientName"
                          class="w-full bg-background border border-muted/40 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                          placeholder="Recipient Name" />
                      </TableCell>
                      <TableCell class="px-2 border-r border-b border-white/80">
                        <input v-model="editingExpenseForm.recipientPhone"
                          class="w-full bg-background border border-muted/40 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                          placeholder="Phone" />
                      </TableCell>
                      <TableCell class="px-2 border-r border-b border-white/80">
                        <input v-model.number="editingExpenseForm.quantity" type="number" min="1"
                          class="w-full bg-background border border-muted/40 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-amber-500/50" />
                      </TableCell>
                      <TableCell class="px-2 border-r border-b border-white/80">
                        <input v-model.number="editingExpenseForm.unitPrice" type="number" min="0" step="0.01"
                          class="w-full bg-background border border-muted/40 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-amber-500/50" />
                      </TableCell>
                      <TableCell class="text-right font-bold text-orange-600 tabular-nums border-r border-b border-white/80 px-2">
                        {{ formatCurrency((editingExpenseForm.quantity || 0) * (editingExpenseForm.unitPrice || 0)) }}
                      </TableCell>
                      <TableCell class="px-2 border-r border-b border-white/80">
                        <select v-model="editingExpenseForm.paymentMethod"
                          class="w-full bg-background border border-muted/40 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500/50">
                          <option value="CASH">Cash</option>
                          <option value="ECOCASH">EcoCash</option>
                          <option value="BANK">Bank</option>
                          <option value="IRD">IRD</option>
                        </select>
                      </TableCell>
                      <TableCell class="text-center border-r border-b border-white/80 px-2">
                        <div v-if="editingExpenseForm.attachmentUrls && editingExpenseForm.attachmentUrls.length > 0" class="flex flex-wrap items-center justify-center gap-1">
                          <Button v-for="(url, idx) in editingExpenseForm.attachmentUrls" :key="url + '-' + idx" variant="outline" size="sm" 
                            class="h-7 text-[10px] font-black uppercase gap-1 bg-yellow-500/10 text-yellow-500 border-yellow-500/30 hover:bg-yellow-500/20 shadow-sm transition-all"
                            :title="getFileName(url)"
                            @click="handleViewProof(url)">
                            <Eye class="size-3.5" /> VIEW {{ (editingExpenseForm.attachmentUrls.length > 1) ? (Number(idx) + 1) : '' }}
                          </Button>
                        </div>
                        <Button v-else-if="editingExpenseForm.attachmentUrl" variant="outline" size="sm" 
                          class="h-7 text-[10px] font-black uppercase gap-1 bg-brand-primary/5 text-brand-primary border-brand-primary/20 hover:bg-brand-primary/10 shadow-sm transition-all"
                          :title="getFileName(editingExpenseForm.attachmentUrl)"
                          @click="handleViewProof(editingExpenseForm.attachmentUrl)">
                          <Eye class="size-3.5" /> VIEW
                        </Button>
                        <span v-else class="text-[10px] opacity-50 italic">—</span>
                      </TableCell>
                      <TableCell v-if="isMainJobApproved"
                        class="text-right whitespace-nowrap border-r border-b border-white/80 px-2">
                        <div class="flex items-center justify-end gap-1">
                          <Button size="icon" variant="outline"
                            class="h-6 w-6 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"
                            title="Save changes" :disabled="isProcessing" @click="handleSaveExpense">
                            <CheckCircle2 class="size-3" />
                          </Button>
                          <Button size="icon" variant="ghost"
                            class="h-6 w-6 text-muted-foreground hover:text-foreground"
                            title="Cancel" @click="handleCancelEditExpense">
                            <XCircle class="size-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>

                    <!-- ── NORMAL DISPLAY ROW ── -->
                    <TableRow v-else
                      class="text-sm border-b border-white/80 last:border-b hover:bg-muted/10 transition-colors">
                      <TableCell class="text-center tabular-nums font-bold text-[11px] opacity-50 border-r border-b border-white/80">
                        {{ expIdx + 1 }}
                      </TableCell>
                      <TableCell class="px-4 font-medium border-r border-b border-white/80">
                        <div class="flex flex-col gap-0.5 py-1">
                          <div class="flex items-center gap-2">
                            {{ exp.description }}
                            <Badge v-if="exp.isAdjustment" variant="outline"
                              class="text-[8px] font-black bg-amber-100 text-amber-700 border-amber-200 py-0 px-1">
                              ADJUSTMENT</Badge>
                          </div>
                          <div class="flex items-center gap-2 mt-0.5">
                            <span v-if="exp.createdAt" class="text-[9px] text-yellow-500 italic">Added: {{ new Date(exp.createdAt).toLocaleString() }}</span>
                            <span v-else-if="exp.isAdjustment" class="text-[9px] font-bold text-amber-600/80">
                              {{ formatDate(exp.adjustmentDate || job.updatedAt) }}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell class="px-4 border-r border-b border-white/80 text-xs text-muted-foreground truncate max-w-[150px]">
                        {{ exp.recipientName || '—' }}
                      </TableCell>
                      <TableCell class="px-4 border-r border-b border-white/80 text-xs text-muted-foreground">
                        {{ exp.recipientPhone || '—' }}
                      </TableCell>
                      <TableCell class="text-right tabular-nums border-r border-b border-white/80">{{ exp.quantity }}
                      </TableCell>
                      <TableCell class="text-right tabular-nums border-r border-b border-white/80">{{
                        formatCurrency(exp.unitPrice) }}</TableCell>
                      <TableCell
                        class="text-right font-bold text-orange-600 tabular-nums border-r border-b border-white/80">{{
                          formatCurrency(exp.totalAmount) }}
                      </TableCell>
                      <TableCell class="px-4 border-r border-b border-white/80">
                        <Badge variant="outline" class="text-[9px] font-black uppercase tracking-tighter">{{
                          resolvePaymentMethod(exp.paymentMethod)
                        }}</Badge>
                      </TableCell>
                      <TableCell class="text-center border-r border-b border-white/80">
                        <div v-if="exp.attachmentUrls && exp.attachmentUrls.length > 0" class="flex flex-wrap items-center justify-center gap-1.5 p-1">
                          <Button v-for="(url, idx) in exp.attachmentUrls" :key="url + '-' + idx" variant="outline" size="sm" 
                            class="h-7 text-[10px] font-black uppercase gap-1 bg-yellow-500/10 text-yellow-500 border-yellow-500/30 hover:bg-yellow-500/20 shadow-sm transition-all"
                            :title="getFileName(url)"
                            @click="handleViewProof(url)">
                            <Eye class="size-3.5" /> VIEW {{ (exp.attachmentUrls.length > 1) ? (Number(idx) + 1) : '' }}
                          </Button>
                        </div>
                        <Button v-else-if="exp.attachmentUrl" variant="outline" size="sm" 
                          class="h-7 text-[10px] font-black uppercase gap-1 bg-yellow-500/10 text-yellow-500 border-yellow-500/30 hover:bg-yellow-500/20 shadow-sm transition-all"
                          :title="getFileName(exp.attachmentUrl)"
                          @click="handleViewProof(exp.attachmentUrl)">
                          <Eye class="size-3.5" /> VIEW
                        </Button>
                        <span v-else class="text-[10px] opacity-50 italic text-muted-foreground">None</span>
                      </TableCell>

                      <TableCell v-if="isMainJobApproved"
                        class="text-right whitespace-nowrap border-r border-b border-white/80">
                        <template v-if="exp.approvalStatus === 'APPROVED_MANAGER' || exp.approvalStatus === 'REJECTED'">
                          <div class="flex items-center justify-end gap-1 px-2">
                            <Badge :variant="getItemStatusVariant(exp.approvalStatus)">{{ exp.approvalStatus ===
                              'APPROVED_MANAGER' ? 'APPROVED' : 'REJECTED' }}</Badge>
                            <Button v-if="(exp.approvalStatus === 'REJECTED' && (isAccountant || isManager)) || (exp.approvalStatus === 'APPROVED_MANAGER' && isAdminOrSuperAdmin)"
                              size="icon" variant="outline" :title="exp.approvalStatus === 'REJECTED' ? 'Re-invoke — reset to Pending' : 'Unlock PDF Download'"
                              class="h-6 w-6 text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 border-amber-300/50"
                              :disabled="isProcessing"
                              @click="handleUnlockPdf('adHocExpenses', exp.id)">
                              <svg v-if="exp.approvalStatus === 'REJECTED'" xmlns="http://www.w3.org/2000/svg" class="size-3" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
                              </svg>
                              <svg v-else xmlns="http://www.w3.org/2000/svg" class="size-3" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
                              </svg>
                            </Button>
                          </div>
                        </template>
                        <template v-else-if="exp.approvalStatus === 'APPROVED_ACCOUNTANT'">
                          <div class="flex items-center justify-end gap-1 px-2">
                            <Badge variant="secondary" class="mr-2">ACCT OK</Badge>
                            <Button v-if="isAdminOrSuperAdmin" size="icon" variant="outline"
                              title="Edit this expense (will reset to Pending) — Admin only"
                              class="h-6 w-6 text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 border-amber-300/50"
                              :disabled="isProcessing" @click="handleEditExpense(exp)">
                              <Edit class="size-3" />
                            </Button>
                            <template v-if="isManager">
                              <Button size="icon" variant="outline"
                                class="h-6 w-6 text-green-600 dark:text-green-400 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
                                @click="handleItemApproval('adHocExpenses', exp.id, 'APPROVED_MANAGER')">
                                <CheckCircle2 class="size-3" />
                              </Button>
                              <Button size="icon" variant="outline"
                                class="h-6 w-6 text-red-600 dark:text-red-400 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                                @click="handleItemApproval('adHocExpenses', exp.id, 'REJECTED')">
                                <XCircle class="size-3" />
                              </Button>
                            </template>
                          </div>
                        </template>
                        <template v-else>
                          <div class="flex items-center justify-end gap-1 px-2">
                            <Badge variant="outline" class="mr-2">PENDING</Badge>
                            <Button v-if="isAccountant || isManager" size="icon" variant="outline"
                              title="Edit this expense"
                              class="h-6 w-6 text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 border-amber-300/50"
                              :disabled="isProcessing" @click="handleEditExpense(exp)">
                              <Edit class="size-3" />
                            </Button>
                            <template v-if="isAccountant">
                              <Button size="icon" variant="outline"
                                class="h-6 w-6 text-green-600 dark:text-green-400 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
                                @click="handleItemApproval('adHocExpenses', exp.id, 'APPROVED_ACCOUNTANT')">
                                <CheckCircle2 class="size-3" />
                              </Button>
                              <Button size="icon" variant="outline"
                                class="h-6 w-6 text-red-600 dark:text-red-400 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                                @click="handleItemApproval('adHocExpenses', exp.id, 'REJECTED')">
                                <XCircle class="size-3" />
                              </Button>
                            </template>
                          </div>
                        </template>
                      </TableCell>
                    </TableRow>
                  </template>
                  <TableRow v-if="adHocExpenses.length === 0">
                    <TableCell colspan="9" class="text-center py-12 opacity-60 italic border-0">No ad-hoc expenses recorded.</TableCell>
                  </TableRow>
                </TableBody>
              </Table>

              <!-- Mobile Card View -->
              <div v-else class="divide-y divide-border/40">
                <div v-for="(exp, expIdx) in adHocExpenses" :key="exp.id" class="p-3 space-y-2">
                  <div class="flex items-center gap-2 mb-0.5">
                    <span class="text-[9px] font-black bg-orange-600 text-white size-4 flex items-center justify-center rounded-full">{{ Number(expIdx) + 1 }}</span>
                    <span v-if="exp.createdAt" class="text-[8px] text-muted-foreground italic">{{ new Date(exp.createdAt).toLocaleString() }}</span>
                  </div>
                  <!-- Inline Edit Mode -->
                  <template v-if="editingExpenseId === exp.id">
                    <div class="space-y-4 p-1">
                      <div class="space-y-1.5">
                        <Label class="text-[10px] font-black uppercase text-muted-foreground/70">Description</Label>
                        <Input v-model="editingExpenseForm.description" class="h-10 text-sm shadow-sm" placeholder="e.g. Labour Payment" />
                      </div>
                      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div class="space-y-1.5">
                          <Label class="text-[10px] font-black uppercase text-muted-foreground/70">Recipient Name</Label>
                          <Input v-model="editingExpenseForm.recipientName" class="h-10 text-sm shadow-sm" placeholder="Full name" />
                        </div>
                        <div class="space-y-1.5">
                          <Label class="text-[10px] font-black uppercase text-muted-foreground/70">Recipient Phone</Label>
                          <Input v-model="editingExpenseForm.recipientPhone" class="h-10 text-sm shadow-sm" placeholder="Phone number" />
                        </div>
                      </div>
                      <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-1.5">
                          <Label class="text-[10px] font-black uppercase text-muted-foreground/70">Qty</Label>
                          <Input v-model.number="editingExpenseForm.quantity" type="number" class="h-10 text-sm shadow-sm" />
                        </div>
                        <div class="space-y-1.5">
                          <Label class="text-[10px] font-black uppercase text-muted-foreground/70">Unit Price ($)</Label>
                          <Input v-model.number="editingExpenseForm.unitPrice" type="number" step="0.01" class="h-10 text-sm shadow-sm" />
                        </div>
                      </div>
                      <div class="space-y-1.5">
                        <Label class="text-[10px] font-black uppercase text-muted-foreground/70">Payment Method</Label>
                        <Select v-model="editingExpenseForm.paymentMethod">
                          <SelectTrigger class="h-10 text-sm shadow-sm">
                            <SelectValue placeholder="Select method" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="CASH">Cash</SelectItem>
                            <SelectItem value="ECOCASH">EcoCash</SelectItem>
                            <SelectItem value="BANK">Bank</SelectItem>
                            <SelectItem value="IRD">IRD</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div class="space-y-1">
                        <label class="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Receipts</label>
                        <div v-if="(editingExpenseForm.attachmentUrls && editingExpenseForm.attachmentUrls.length > 0) || editingExpenseForm.attachmentUrl" class="flex flex-wrap gap-2 py-1">
                          <template v-if="editingExpenseForm.attachmentUrls && editingExpenseForm.attachmentUrls.length > 0">
                            <Button v-for="(url, idx) in editingExpenseForm.attachmentUrls" :key="url + '-' + idx" variant="outline" size="sm" 
                              class="h-8 text-[10px] font-black uppercase gap-1.5 bg-yellow-500/10 text-yellow-500 border-yellow-500/30 shadow-sm"
                              :title="getFileName(url)"
                              @click="handleViewProof(url)">
                              <Eye class="size-3.5" /> VIEW PROOF {{ (editingExpenseForm.attachmentUrls.length > 1) ? (Number(idx) + 1) : '' }}
                            </Button>
                          </template>
                          <Button v-else-if="editingExpenseForm.attachmentUrl" variant="outline" size="sm" 
                            class="h-8 text-[10px] font-black uppercase gap-1.5 bg-yellow-500/10 text-yellow-500 border-yellow-500/30 shadow-sm"
                            :title="getFileName(editingExpenseForm.attachmentUrl)"
                            @click="handleViewProof(editingExpenseForm.attachmentUrl)">
                            <Eye class="size-3.5" /> VIEW RECEIPT
                          </Button>
                        </div>
                        <div v-else class="text-[10px] text-muted-foreground italic py-1">No receipt attached</div>
                      </div>
                      <div class="flex gap-3 pt-2">
                        <Button variant="outline" class="flex-1 h-11 font-bold" @click="handleCancelEditExpense">Cancel</Button>
                        <Button class="flex-1 h-11 font-bold bg-brand-primary text-white" 
                          :disabled="isProcessing" @click="handleSaveExpense">
                          <Loader2 v-if="isProcessing" class="size-4 animate-spin mr-2" />
                          Save Changes
                        </Button>
                      </div>
                    </div>
                  </template>

                  <!-- Normal Display Mode -->
                  <template v-else>
                    <div class="space-y-3">
                      <!-- Description & Status -->
                      <div class="flex justify-between items-start gap-2">
                        <div class="space-y-0.5">
                          <div class="flex items-center gap-2">
                            <h4 class="text-sm font-bold text-foreground leading-tight">{{ exp.description }}</h4>
                            <Badge v-if="exp.isAdjustment" variant="outline" class="text-[7px] bg-amber-100 text-amber-700 border-amber-200 h-4 px-1">ADJ</Badge>
                          </div>
                          <p v-if="exp.isAdjustment" class="text-[8px] font-bold text-amber-600/80">
                            {{ formatDate(exp.adjustmentDate || job.updatedAt) }}
                          </p>
                          <Badge variant="outline" class="text-[8px] uppercase tracking-wider h-4 px-1.5 bg-muted/30">{{ resolvePaymentMethod(exp.paymentMethod) }}</Badge>
                        </div>
                        <Badge v-if="isMainJobApproved" :variant="getItemStatusVariant(exp.approvalStatus)" class="h-5 text-[8px] uppercase px-1.5">
                          {{ exp.approvalStatus === 'APPROVED_MANAGER' ? 'Approved' : exp.approvalStatus === 'REJECTED' ? 'Rejected' : 'Pending' }}
                        </Badge>
                      </div>

                      <!-- Recipient & Details Section -->
                      <div class="rounded-xl bg-muted/30 p-2.5 space-y-2 border border-border/40 shadow-inner">
                        <div v-if="exp.recipientName || exp.recipientPhone" class="space-y-0.5">
                          <p class="text-[8px] font-black uppercase text-muted-foreground/60 tracking-widest ml-1">Paid To</p>
                          <div class="flex items-center gap-1.5 px-2 py-1 bg-background/50 rounded-lg border border-border/60">
                            <User class="size-3 text-muted-foreground" />
                            <p class="text-[11px] font-bold text-foreground">
                              {{ exp.recipientName || 'No name' }} 
                              <span v-if="exp.recipientPhone" class="text-muted-foreground font-medium ml-1 text-[9px]">({{ exp.recipientPhone }})</span>
                            </p>
                          </div>
                        </div>

                        <!-- Financials Row -->
                        <div class="grid grid-cols-2 gap-2">
                          <div class="space-y-0.5">
                            <p class="text-[8px] font-black uppercase text-muted-foreground/60 tracking-widest ml-1">Qty & Rate</p>
                            <p class="text-[11px] font-bold px-1">{{ exp.quantity }} × {{ formatCurrency(exp.unitPrice) }}</p>
                          </div>
                          <div class="text-right space-y-0.5">
                            <p class="text-[8px] font-black uppercase text-orange-600 tracking-widest mr-1">Total Cost</p>
                            <p class="text-sm font-black text-orange-600">{{ formatCurrency(exp.totalAmount) }}</p>
                          </div>
                        </div>
                      </div>

                      <!-- Evidence / Receipts -->
                      <div class="space-y-1.5 px-0.5">
                        <p class="text-[8px] font-black uppercase text-muted-foreground/60 tracking-widest ml-1">Supporting Evidence</p>
                        <div v-if="exp.attachmentUrls && exp.attachmentUrls.length > 0" class="flex flex-wrap gap-1.5">
                          <Button v-for="(url, idx) in exp.attachmentUrls" :key="url + '-' + idx" variant="outline" size="sm" 
                            class="h-8 px-3 text-[9px] font-black uppercase gap-1.5 bg-yellow-500/10 text-yellow-500 border-yellow-500/30 shadow-sm rounded-lg"
                            :title="getFileName(url)"
                            @click="handleViewProof(url)">
                            <Eye class="size-3.5" /> VIEW PROOF {{ (exp.attachmentUrls.length > 1) ? (Number(idx) + 1) : '' }}
                          </Button>
                        </div>
                        <Button v-else-if="exp.attachmentUrl" variant="outline" size="sm" 
                          class="h-8 px-3 text-[9px] font-black uppercase gap-1.5 bg-yellow-500/10 text-yellow-500 border-yellow-500/30 shadow-sm rounded-lg"
                          :title="getFileName(exp.attachmentUrl)"
                          @click="handleViewProof(exp.attachmentUrl)">
                          <Eye class="size-3.5" /> VIEW RECEIPT
                        </Button>
                        <div v-else class="text-[9px] text-muted-foreground italic bg-muted/20 p-2 rounded-lg border border-dashed border-border/60 text-center">
                          No receipt or proof of payment attached
                        </div>
                      </div>

                      <!-- Mobile Actions & Approval -->
                      <div class="pt-4 border-t border-border/40 flex flex-col gap-3">
                        <div class="flex items-center justify-between">
                           <!-- Edit Button (Always visible if editable) -->
                          <Button v-if="!isMainJobApproved || (exp.approvalStatus === 'PENDING' && (isAccountant || isManager))"
                            variant="ghost" size="sm" class="h-8 px-2 text-[9px] font-black uppercase gap-1.5 text-amber-600 hover:bg-amber-50 rounded-lg border border-amber-200/50"
                            @click="handleEditExpense(exp)">
                            <Edit class="size-3" /> Edit Expense
                          </Button>
                          <div v-else></div>

                          <!-- Re-invoke / Unlock PDF -->
                          <Button v-if="isMainJobApproved && ((exp.approvalStatus === 'REJECTED' && (isAccountant || isManager)) || (exp.approvalStatus === 'APPROVED_MANAGER' && isAdminOrSuperAdmin))"
                             size="sm" variant="outline" class="h-8 px-2 text-[9px] font-black uppercase gap-1.5 text-amber-600 border-amber-200 bg-amber-50/30 shadow-sm rounded-lg"
                             :disabled="isProcessing"
                             @click="handleUnlockPdf('adHocExpenses', exp.id)">
                             <Loader2 v-if="isProcessing" class="size-3 animate-spin" />
                             <template v-else>
                               <svg v-if="exp.approvalStatus === 'REJECTED'" xmlns="http://www.w3.org/2000/svg" class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                 <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
                               </svg>
                               <Lock v-else class="size-3" />
                             </template>
                             {{ exp.approvalStatus === 'REJECTED' ? 'Re-invoke' : 'Unlock' }}
                          </Button>
                        </div>

                        <!-- Approval Actions -->
                        <div v-if="isMainJobApproved" class="flex flex-wrap gap-2 justify-end">
                           <!-- Accountant Approval -->
                           <template v-if="(!exp.approvalStatus || exp.approvalStatus === 'PENDING') && isAccountant">
                              <div class="flex gap-1.5 w-full sm:w-auto">
                                <Button size="sm" variant="outline" class="flex-1 sm:flex-none h-9 px-3 text-[9px] font-black uppercase text-green-600 border-green-600/20 bg-green-600/5 hover:bg-green-600/10 rounded-lg shadow-sm"
                                  :disabled="isProcessing"
                                  @click="handleItemApproval('adHocExpenses', exp.id, 'APPROVED_ACCOUNTANT')">Approve (Acct)</Button>
                                <Button size="sm" variant="outline" class="flex-1 sm:flex-none h-9 px-3 text-[9px] font-black uppercase text-rose-600 border-rose-600/20 bg-rose-600/5 hover:bg-rose-600/10 rounded-lg shadow-sm"
                                  :disabled="isProcessing"
                                  @click="handleItemApproval('adHocExpenses', exp.id, 'REJECTED')">Reject</Button>
                              </div>
                           </template>

                           <!-- Manager Approval -->
                           <template v-if="exp.approvalStatus === 'APPROVED_ACCOUNTANT' && isManager">
                              <div class="flex gap-1.5 w-full sm:w-auto">
                                <Button size="sm" variant="outline" class="flex-1 sm:flex-none h-9 px-3 text-[9px] font-black uppercase text-green-600 border-green-600/20 bg-green-600/5 hover:bg-green-600/10 rounded-lg shadow-sm"
                                  :disabled="isProcessing"
                                  @click="handleItemApproval('adHocExpenses', exp.id, 'APPROVED_MANAGER')">Approve (Mgr)</Button>
                                <Button size="sm" variant="outline" class="flex-1 sm:flex-none h-9 px-3 text-[9px] font-black uppercase text-rose-600 border-rose-600/20 bg-rose-600/5 hover:bg-rose-600/10 rounded-lg shadow-sm"
                                  :disabled="isProcessing"
                                  @click="handleItemApproval('adHocExpenses', exp.id, 'REJECTED')">Reject</Button>
                              </div>
                           </template>
                        </div>
                      </div>
                    </div>
                  </template>
                </div>
                <div v-if="adHocExpenses.length === 0" class="p-12 text-center opacity-60 italic">No ad-hoc expenses recorded.</div>
              </div>
            </CardContent>
            <div v-if="adHocExpenses.length > 0" class="bg-muted/5 p-4 border-t flex justify-end">
              <div class="flex flex-col items-end">
                <span class="text-[10px] uppercase text-orange-600 font-black tracking-widest">EXP Subtotal</span>
                <span class="text-lg font-black text-orange-600">{{ formatCurrency(safeTotals.adHocTotal) }}</span>
              </div>
            </div>
          </Card>
        </template>
      </TabsContent>

      <TabsContent value="labor" class="space-y-8 mt-6">
        <!-- 3b. Staff Rates Grid -->
        <template v-if="isEditing">
          <div class="space-y-4">
            <div class="flex flex-col">
              <h3 class="text-xl font-semibold">Staff Rates</h3>
              <p class="text-sm text-muted-foreground">Assign job-specific earnings to staff members. These will be automatically added to their payslip upon job approval.</p>
            </div>
            <StaffRatesGrid v-model="editableJob.staffRates" :general-info="job.generalInfo" :is-admin="isAdminOrSuperAdmin" />
          </div>
        </template>
        <template v-else>
          <Card
            class="bg-emerald-50/30 dark:bg-emerald-900/10 backdrop-blur-md border-emerald-200 dark:border-emerald-700/30 shadow-lg text-foreground dark:text-white overflow-hidden">
            <CardHeader
              class="flex flex-row items-center justify-between gap-2 bg-emerald-100/50 dark:bg-emerald-900/20 border-b border-emerald-200 dark:border-emerald-700/30 py-4">
              <div class="flex items-center gap-2">
                <Users class="size-4 text-emerald-600" />
                <CardTitle class="text-lg font-bold text-emerald-700 dark:text-emerald-400">Staff Rates</CardTitle>
              </div>
              <Button v-if="(isAccountant || isManager) && isMainJobApproved && staffRates.length > 0" size="sm" variant="outline"
                class="h-7 text-xs font-bold border-emerald-500/40 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 gap-1.5"
                :disabled="isProcessing"
                @click="handleApproveAllStaffRates">
                <CheckCircle2 class="size-3" />
                Approve All {{ isManager ? '(Manager)' : '(Accountant)' }}
              </Button>
            </CardHeader>
            <CardContent class="p-0 overflow-x-auto">
              <!-- Desktop Table View -->
              <Table v-if="!isMobile" class="border-collapse table-fixed w-full border-t border-l border-white/80">
                <TableHeader v-if="staffRates.length > 0">
                  <TableRow class="bg-muted/20 border-b border-white/80">
                    <TableHead class="text-xs font-bold w-12 px-2 text-center text-foreground dark:text-white border-r border-b border-white/80">#</TableHead>
                    <TableHead
                      class="text-xs font-bold px-4 text-foreground dark:text-white border-r border-b border-white/80">
                      Name</TableHead>
                    <TableHead
                      class="text-xs font-bold text-left w-40 text-foreground dark:text-white border-r border-b border-white/80">
                      Employment Code</TableHead>
                    <TableHead
                      class="text-xs font-bold text-left w-40 text-foreground dark:text-white border-r border-b border-white/80">
                      ID Number</TableHead>
                    <TableHead
                      class="text-xs font-bold text-right w-32 text-foreground dark:text-white border-r border-b border-white/80">
                      Job Rate Amount</TableHead>

                    <TableHead v-if="isMainJobApproved"
                      class="text-xs font-bold text-right w-48 text-foreground dark:text-white border-r border-b border-white/80">
                      Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="(rate, rIdx) in staffRates" :key="rate.id"
                    class="text-sm border-b border-white/80 last:border-b hover:bg-muted/10 transition-colors">
                    <TableCell class="text-center tabular-nums font-bold text-[11px] opacity-50 border-r border-b border-white/80">
                      {{ Number(rIdx) + 1 }}
                    </TableCell>
                    <TableCell class="px-4 font-medium border-r border-b border-white/80">
                      <div class="flex flex-col gap-0.5 py-1">
                        <div class="flex items-center gap-2">
                          {{ getEmployeeName(rate.employeeId) }}
                          <Badge v-if="rate.isAdjustment" variant="outline"
                            class="text-[8px] font-black bg-amber-100 text-amber-700 border-amber-200 py-0 px-1">
                            ADJUSTMENT</Badge>
                        </div>
                        <div class="flex items-center gap-2 mt-0.5">
                          <span v-if="rate.createdAt" class="text-[9px] text-yellow-500 italic">Added: {{ new Date(rate.createdAt).toLocaleString() }}</span>
                          <span v-else-if="rate.isAdjustment" class="text-[9px] font-bold text-amber-600/80">
                            {{ formatDate(rate.adjustmentDate || job.updatedAt) }}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell class="text-left tabular-nums border-r border-b border-white/80">{{ getEmploymentCode(rate.employeeId) }}</TableCell>
                    <TableCell class="text-left tabular-nums border-r border-b border-white/80">{{ getNationalId(rate.employeeId) }}</TableCell>
                    <TableCell
                      class="text-right font-bold text-emerald-600 tabular-nums border-r border-b border-white/80">
                      {{ formatCurrency(rate.jobRateAmount) }}
                    </TableCell>

                    <TableCell v-if="isMainJobApproved"
                      class="text-right whitespace-nowrap border-r border-b border-white/80">
                      <template v-if="rate.approvalStatus === 'APPROVED_MANAGER' || rate.approvalStatus === 'REJECTED'">
                        <div class="flex items-center justify-end gap-1 px-2">
                          <Badge :variant="getItemStatusVariant(rate.approvalStatus)">{{ rate.approvalStatus ===
                            'APPROVED_MANAGER' ? 'APPROVED' : 'REJECTED' }}</Badge>
                          <Button v-if="(rate.approvalStatus === 'REJECTED' && (isAccountant || isManager)) || (rate.approvalStatus === 'APPROVED_MANAGER' && isAdminOrSuperAdmin)"
                            size="icon" variant="outline" :title="rate.approvalStatus === 'REJECTED' ? 'Re-invoke — reset to Pending' : 'Unlock PDF Download'"
                            class="h-6 w-6 text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 border-amber-300/50"
                            :disabled="isProcessing"
                            @click="handleUnlockPdf('staffRates', rate.id)">
                            <svg v-if="rate.approvalStatus === 'REJECTED'" xmlns="http://www.w3.org/2000/svg" class="size-3" viewBox="0 0 24 24" fill="none"
                              stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
                            </svg>
                            <svg v-else xmlns="http://www.w3.org/2000/svg" class="size-3" viewBox="0 0 24 24" fill="none"
                              stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
                            </svg>
                          </Button>
                        </div>
                      </template>
                      <template v-else-if="rate.approvalStatus === 'APPROVED_ACCOUNTANT'">
                        <div class="flex items-center justify-end gap-1 px-2">
                          <Badge variant="secondary" class="mr-2">ACCT OK</Badge>
                          <template v-if="isManager">
                            <Button size="icon" variant="outline"
                              class="h-6 w-6 text-green-600 dark:text-green-400 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
                              @click="handleItemApproval('staffRates', rate.id, 'APPROVED_MANAGER')">
                              <CheckCircle2 class="size-3" />
                            </Button>
                            <Button size="icon" variant="outline"
                              class="h-6 w-6 text-red-600 dark:text-red-400 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                              @click="handleItemApproval('staffRates', rate.id, 'REJECTED')">
                              <XCircle class="size-3" />
                            </Button>
                          </template>
                        </div>
                      </template>
                      <template v-else>
                        <div class="flex items-center justify-end gap-1 px-2">
                          <Badge variant="outline" class="mr-2">PENDING</Badge>
                          <template v-if="isAccountant">
                            <Button size="icon" variant="outline"
                              class="h-6 w-6 text-green-600 dark:text-green-400 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
                              @click="handleItemApproval('staffRates', rate.id, 'APPROVED_ACCOUNTANT')">
                              <CheckCircle2 class="size-3" />
                            </Button>
                            <Button size="icon" variant="outline"
                              class="h-6 w-6 text-red-600 dark:text-red-400 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                              @click="handleItemApproval('staffRates', rate.id, 'REJECTED')">
                              <XCircle class="size-3" />
                            </Button>
                          </template>
                        </div>
                      </template>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>

              <!-- Mobile Card View -->
              <div v-else class="space-y-1.5 px-2 py-1.5">
                <div v-for="(rate, rIdx) in staffRates" :key="rate.id" 
                    class="relative overflow-hidden rounded-lg border bg-card shadow-sm transition-all"
                    :class="[getItemStatusVariant(rate.approvalStatus) === 'destructive' ? 'border-rose-500/20 bg-rose-50/10' : 'border-emerald-200/60 shadow-md']">
                  
                  <!-- Card Header: Index & Status -->
                  <div class="flex items-center justify-between px-2 py-1 bg-emerald-50/50 border-b border-emerald-100">
                    <div class="flex items-center gap-1.5">
                      <span class="flex size-4 items-center justify-center rounded-full bg-emerald-600 text-[8px] font-black text-white shadow-sm">
                        {{ Number(rIdx) + 1 }}
                      </span>
                      <div class="flex items-center gap-1">
                        <Users class="size-3 text-emerald-600" />
                        <span class="text-[8px] font-bold text-emerald-800 uppercase tracking-wider">Staff Entry</span>
                      </div>
                    </div>
                    <Badge v-if="isMainJobApproved" :variant="getItemStatusVariant(rate.approvalStatus)" class="h-4 text-[7px] font-black uppercase px-1">
                      {{ rate.approvalStatus === 'APPROVED_MANAGER' ? 'Approved' : rate.approvalStatus === 'REJECTED' ? 'Rejected' : 'Pending' }}
                    </Badge>
                  </div>

                  <div class="p-2 space-y-2">
                    <!-- Staff Info -->
                    <div class="space-y-1">
                      <div class="flex items-center justify-between">
                        <p class="text-[11px] font-bold text-emerald-900 dark:text-emerald-400">{{ getEmployeeName(rate.employeeId) }}</p>
                        <Badge v-if="rate.isAdjustment" variant="outline" class="text-[7px] bg-amber-100 text-amber-700 border-amber-200">ADJ</Badge>
                      </div>
                      
                      <div class="flex flex-wrap gap-1">
                        <div class="flex items-center gap-1 px-1 py-0.5 rounded-md bg-muted/40 border border-border/50">
                          <span class="text-[8px] font-black text-muted-foreground uppercase">Code:</span>
                          <span class="text-[9px] font-bold tabular-nums">{{ getEmploymentCode(rate.employeeId) }}</span>
                        </div>
                        <div class="flex items-center gap-1 px-1 py-0.5 rounded-md bg-muted/40 border border-border/50">
                          <span class="text-[8px] font-black text-muted-foreground uppercase">ID:</span>
                          <span class="text-[9px] font-bold tabular-nums">{{ getNationalId(rate.employeeId) }}</span>
                        </div>
                      </div>
                    </div>

                    <!-- Financial Row -->
                    <div class="flex items-center justify-between p-1.5 rounded-lg bg-emerald-600/5 border border-emerald-600/10">
                      <div class="flex flex-col">
                        <span class="text-[8px] font-black text-emerald-600/60 uppercase tracking-widest leading-none mb-0.5">Rate Amount</span>
                        <span class="text-xs font-black text-emerald-600">{{ formatCurrency(rate.jobRateAmount) }}</span>
                      </div>
                      <div v-if="rate.createdAt" class="flex flex-col items-end">
                         <span class="text-[8px] font-black text-muted-foreground uppercase tracking-widest leading-none mb-0.5">Entry Date</span>
                         <span class="text-[9px] font-medium text-muted-foreground">{{ new Date(rate.createdAt).toLocaleDateString() }}</span>
                      </div>
                    </div>

                    <!-- Mobile Approval Actions -->
                    <div v-if="isMainJobApproved && (rate.approvalStatus !== 'APPROVED_MANAGER' || isAccountant || isManager || isAdminOrSuperAdmin)" 
                         class="pt-1 flex flex-wrap justify-end gap-1.5">
                         
                         <!-- Re-invoke / Unlock -->
                         <Button v-if="(rate.approvalStatus === 'REJECTED' && (isAccountant || isManager)) || (rate.approvalStatus === 'APPROVED_MANAGER' && isAdminOrSuperAdmin)"
                            size="sm" variant="outline" class="h-8 px-2 text-[9px] font-black uppercase gap-1 text-amber-600 border-amber-200 bg-amber-50/30 hover:bg-amber-50 shadow-sm rounded-lg"
                            :disabled="isProcessing"
                            @click="handleUnlockPdf('staffRates', rate.id)">
                            <Loader2 v-if="isProcessing" class="size-3 animate-spin"/>
                            <template v-else>
                              <svg v-if="rate.approvalStatus === 'REJECTED'" xmlns="http://www.w3.org/2000/svg" class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
                              </svg>
                              <Lock v-else class="size-3" />
                            </template>
                            {{ rate.approvalStatus === 'REJECTED' ? 'Re-invoke' : 'Unlock' }}
                         </Button>

                         <!-- Accountant Approval -->
                         <template v-if="(!rate.approvalStatus || rate.approvalStatus === 'PENDING') && isAccountant">
                            <div class="flex gap-1.5 w-full sm:w-auto mt-1 sm:mt-0">
                                <Button size="sm" variant="outline" class="flex-1 sm:flex-none h-8 px-2 text-[9px] font-black uppercase text-green-600 border-green-600/20 bg-green-600/5 hover:bg-green-600/10 rounded-lg shadow-sm"
                                  :disabled="isProcessing"
                                  @click="handleItemApproval('staffRates', rate.id, 'APPROVED_ACCOUNTANT')">Approve (Acct)</Button>
                                <Button size="sm" variant="outline" class="flex-1 sm:flex-none h-8 px-2 text-[9px] font-black uppercase text-rose-600 border-rose-600/20 bg-rose-600/5 hover:bg-rose-600/10 rounded-lg shadow-sm"
                                  :disabled="isProcessing"
                                  @click="handleItemApproval('staffRates', rate.id, 'REJECTED')">Reject</Button>
                            </div>
                         </template>

                         <!-- Manager Approval -->
                         <template v-if="rate.approvalStatus === 'APPROVED_ACCOUNTANT' && isManager">
                            <div class="flex gap-1.5 w-full sm:w-auto mt-1 sm:mt-0">
                                <Button size="sm" variant="outline" class="flex-1 sm:flex-none h-8 px-2 text-[9px] font-black uppercase text-green-600 border-green-600/20 bg-green-600/5 hover:bg-green-600/10 rounded-lg shadow-sm"
                                  :disabled="isProcessing"
                                  @click="handleItemApproval('staffRates', rate.id, 'APPROVED_MANAGER')">Approve (Mgr)</Button>
                                <Button size="sm" variant="outline" class="flex-1 sm:flex-none h-8 px-2 text-[9px] font-black uppercase text-rose-600 border-rose-600/20 bg-rose-600/5 hover:bg-rose-600/10 rounded-lg shadow-sm"
                                  :disabled="isProcessing"
                                  @click="handleItemApproval('staffRates', rate.id, 'REJECTED')">Reject</Button>
                            </div>
                         </template>
                    </div>
                  </div>
                </div>
              </div>
              <div v-if="staffRates.length === 0" class="text-center py-12 opacity-60 italic">
                No staff rates assigned to this job.
              </div>
            </CardContent>
            <div v-if="staffRates.length > 0" class="bg-emerald-50/30 p-4 border-t border-emerald-200 flex justify-end">
              <div class="flex flex-col items-end">
                <span class="text-[10px] uppercase text-emerald-600 font-black tracking-widest">Total Staff Earnings</span>
                <span class="text-lg font-black text-emerald-600">{{ formatCurrency(staffRates.reduce((s, r) => s + (Number(r.jobRateAmount) || 0), 0)) }}</span>
              </div>
            </div>
          </Card>
        </template>
      </TabsContent>

      <TabsContent value="commissions" class="space-y-8 mt-6">
        <!-- 3b. Job Referral & Commission -->
        <template v-if="isEditing">
          <Card class="bg-emerald-600/5 dark:bg-emerald-600/10 backdrop-blur-md border-emerald-600/20 dark:border-emerald-600/30 shadow-lg mb-6 overflow-hidden">
            <CardHeader class="flex flex-row items-center justify-between gap-2 bg-emerald-100/50 dark:bg-emerald-900/20 border-b border-emerald-200 dark:border-emerald-700/30 py-4">
              <div class="flex items-center gap-2">
                <UserCheck class="size-4 text-emerald-600" />
                <CardTitle class="text-lg font-bold text-emerald-700 dark:text-emerald-400">Job Referral & Commission</CardTitle>
              </div>
              <Button size="sm" variant="outline" class="h-8 text-xs font-bold border-emerald-300 text-emerald-700 hover:bg-emerald-100" @click="addReferrer">
                <Plus class="size-3 mr-1" /> Add Recipient
              </Button>
            </CardHeader>
            <CardContent class="p-0">
              <div class="overflow-x-auto">
                <table class="w-full text-sm text-left">
                  <thead class="text-[10px] uppercase text-emerald-600 font-black tracking-widest bg-emerald-100/30">
                    <tr>
                      <th class="px-6 py-3 border-r border-white/80">Recipient Name</th>
                      <th class="px-6 py-3 border-r border-white/80 w-[26%]">Commission Amount ($)</th>
                      <th class="px-6 py-3 border-r border-white/80 w-[16%]">Payment Method</th>
                      <th class="px-4 py-3 w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(referrer, idx) in editableJob.generalInfo.referrers" :key="idx" class="border-b border-white/80">
                      <td class="px-4 py-2 border-r border-white/80">
                        <Input v-model="referrer.name" placeholder="Name" class="bg-white/50 border-emerald-100 h-9" />
                      </td>
                      <td class="px-4 py-2 border-r border-white/80">
                        <Input v-model.number="referrer.amount" type="number" step="0.01" placeholder="0.00" class="bg-white/50 border-emerald-100 h-9" />
                      </td>
                      <td class="px-4 py-2 border-r border-white/80">
                        <select v-model="referrer.paymentMethod"
                          class="h-9 w-full rounded-md border border-emerald-100 bg-white/80 dark:bg-emerald-950/50 px-3 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-400">
                          <option value="CASH" class="text-neutral-900 bg-white dark:text-white dark:bg-emerald-900">Cash</option>
                          <option value="ECOCASH" class="text-neutral-900 bg-white dark:text-white dark:bg-emerald-900">EcoCash</option>
                          <option value="BANK" class="text-neutral-900 bg-white dark:text-white dark:bg-emerald-900">Bank</option>
                        </select>
                      </td>
                      <td class="px-4 py-2 text-center">
                        <Button size="icon" variant="ghost" class="h-8 w-8 text-rose-500 hover:text-rose-700 hover:bg-rose-50" @click="removeReferrer(idx)">
                          <Trash2 class="size-4" />
                        </Button>
                      </td>
                    </tr>
                    <tr v-if="!editableJob.generalInfo.referrers?.length">
                       <td colspan="4" class="px-6 py-8 text-center text-muted-foreground italic">
                         No commission recipients added. Click "Add Recipient" to start.
                       </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="p-6 bg-emerald-50/50 flex justify-between items-center border-t border-emerald-200">
                <span class="text-sm font-bold text-emerald-700">Total Fixed Commission</span>
                <span class="text-xl font-black text-emerald-600">{{ formatCurrency(totalEditableCommission) }}</span>
              </div>
            </CardContent>
          </Card>
        </template>
        <template v-else-if="job.generalInfo.referrers?.length || job.generalInfo.referrerName">
          <Card class="bg-emerald-50/30 dark:bg-emerald-900/10 backdrop-blur-md border-emerald-200 dark:border-emerald-700/30 shadow-lg overflow-hidden mb-6">
            <CardHeader class="flex flex-row items-center gap-2 bg-emerald-100/50 dark:bg-emerald-900/20 border-b border-emerald-200 dark:border-emerald-700/30 py-4">
              <UserCheck class="size-4 text-emerald-600" />
              <CardTitle class="text-lg font-bold text-emerald-700 dark:text-emerald-400">Job Referral & Commission</CardTitle>
            </CardHeader>
            <CardContent class="p-0">
               <!-- Legacy Single Referrer Support -->
               <div v-if="job.generalInfo.referrerName && (!job.generalInfo.referrers || job.generalInfo.referrers.length === 0)" 
                    class="grid grid-cols-1 md:grid-cols-3 border-t border-l border-white/80">
                <div class="flex flex-col p-6 border-r border-b border-white/80">
                  <span class="text-[10px] uppercase text-muted-foreground font-black tracking-widest">Referrer Name</span>
                  <span class="text-lg font-bold text-emerald-600">{{ job.generalInfo.referrerName }}</span>
                </div>
                <div class="flex flex-col p-6 border-r border-b border-white/80">
                  <span class="text-[10px] uppercase text-muted-foreground font-black tracking-widest">Commission Rate</span>
                  <span class="text-lg font-bold text-emerald-600">{{ job.generalInfo.commissionPercentage || 0 }}%</span>
                </div>
                <div class="flex flex-col p-6 border-r border-b border-white/80">
                  <span class="text-[10px] uppercase text-muted-foreground font-black tracking-widest text-right">Commission Amount</span>
                  <span class="text-lg font-black text-emerald-600">{{ formatCurrency(effectiveFinancials?.referrerCommission || 0) }}</span>
                </div>
              </div>

              <div v-else class="divide-y divide-emerald-600/10">
                <div v-for="(referrer, idx) in job.generalInfo.referrers" :key="idx" 
                     class="flex flex-col lg:flex-row justify-between items-stretch lg:items-center px-3 py-3 hover:bg-emerald-600/5 transition-colors gap-3">
                  
                  <!-- Left: Recipient Info -->
                  <div class="flex flex-col gap-2 flex-1">
                    <div class="flex items-center gap-2">
                      <span class="flex size-5 items-center justify-center rounded-full bg-emerald-600 text-[9px] font-black text-white shadow-sm shrink-0">
                        {{ Number(idx) + 1 }}
                      </span>
                      <div class="flex flex-col">
                        <span class="text-[9px] font-black uppercase tracking-widest text-muted-foreground leading-none">Commission Recipient</span>
                        <span class="text-sm font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">{{ referrer.name || 'Anonymous Recipient' }}</span>
                      </div>
                    </div>
                    
                    <div class="flex flex-wrap items-center gap-2 mt-0.5 ml-7">
                      <div v-if="referrer.approvalStatus" class="flex items-center gap-1.5">
                        <Badge :variant="referrer.approvalStatus === 'APPROVED_MANAGER' ? 'default' : 'outline'" 
                               class="text-[8px] uppercase font-black py-0 h-4 px-1.5 bg-emerald-100 text-emerald-700 border-emerald-200">
                          {{ referrer.approvalStatus.replace('_', ' ') }}
                        </Badge>
                      </div>
                      <span v-if="referrer.createdAt" class="text-[8px] text-muted-foreground italic">Added: {{ new Date(referrer.createdAt).toLocaleDateString() }}</span>
                    </div>

                    <div v-if="referrer.approvedAt" class="ml-9 mt-1 flex flex-col">
                       <span class="text-[9px] text-muted-foreground italic bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200/50 rounded px-2 py-1 w-fit">
                          Approved by {{ referrer.approvedBy }} on {{ new Date(referrer.approvedAt).toLocaleDateString() }}
                       </span>
                    </div>

                    <!-- Attachments Display & Upload Trigger -->
                    <div class="ml-9 mt-3 flex flex-col gap-2">
                       <span class="text-[9px] font-black uppercase text-muted-foreground tracking-widest leading-none">Proof of Payment / Files</span>
                       
                       <!-- Loading state -->
                       <div v-if="isUploadingCommissionFile[referrer.id]" class="flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 class="size-3 animate-spin text-emerald-600" />
                          <span>Uploading file...</span>
                       </div>

                       <!-- Existing Attachments -->
                       <div v-if="referrer.attachments && referrer.attachments.length > 0" class="flex flex-wrap gap-1.5">
                          <div v-for="(file, fIdx) in referrer.attachments" :key="fIdx" 
                               class="flex items-center gap-1.5 bg-emerald-100/50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/30 rounded-md px-2.5 py-1 text-xs text-emerald-800 dark:text-emerald-300">
                             <Paperclip class="size-3.5 shrink-0 text-emerald-600" />
                             <a :href="file.url" target="_blank" rel="noopener noreferrer" class="hover:underline font-bold truncate max-w-[150px]" :title="file.name">
                                {{ file.name }}
                             </a>
                             <button type="button" class="text-rose-500 hover:text-rose-700 ml-1 cursor-pointer" @click.stop="handleDeleteCommissionFile(referrer.id, Number(fIdx))">
                                <X class="size-3.5" />
                             </button>
                          </div>
                       </div>
                       
                       <!-- Legacy proofUrl Fallback -->
                       <div v-else-if="referrer.proofUrl" class="flex flex-wrap gap-1.5">
                          <div class="flex items-center gap-1.5 bg-emerald-100/50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/30 rounded-md px-2.5 py-1 text-xs text-emerald-800 dark:text-emerald-300">
                             <Paperclip class="size-3.5 shrink-0 text-emerald-600" />
                             <a :href="referrer.proofUrl" target="_blank" rel="noopener noreferrer" class="hover:underline font-bold truncate max-w-[150px]">
                                {{ referrer.proofName || 'Proof of Payment' }}
                             </a>
                             <button type="button" class="text-rose-500 hover:text-rose-700 ml-1 cursor-pointer" @click.stop="handleDeleteCommissionFile(referrer.id, 0)">
                                <X class="size-3.5" />
                             </button>
                          </div>
                       </div>

                       <div v-if="(!referrer.attachments || referrer.attachments.length === 0) && !referrer.proofUrl" class="text-[10px] text-muted-foreground/70 italic">
                          No files attached
                       </div>

                       <!-- Upload Trigger Button -->
                       <div class="mt-1">
                          <label :for="'commission-file-' + referrer.id" class="inline-flex items-center gap-1.5 px-3 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-900/20 cursor-pointer w-fit transition-colors">
                             <Upload class="size-3 text-emerald-600 dark:text-emerald-400" />
                             Attach File
                          </label>
                          <input type="file" :id="'commission-file-' + referrer.id" class="hidden" @change="handleUploadCommissionFile($event, referrer.id)" />
                       </div>
                    </div>
                  </div>

                  <!-- Right: Amount & Actions -->
                  <div class="flex flex-row lg:flex-row items-center justify-between lg:justify-end gap-3 border-t lg:border-t-0 pt-2 lg:pt-0 border-emerald-600/10">
                    <div class="flex flex-col items-start lg:items-end">
                      <span class="text-[9px] font-black uppercase text-muted-foreground tracking-widest leading-none">Amount</span>
                      <span class="text-lg font-black text-emerald-600 dark:text-emerald-400">{{ formatCurrency(referrer.amount || 0) }}</span>
                    </div>
                    
                    <!-- Approval Actions -->
                    <div class="flex items-center gap-2 border-l lg:border-l-0 lg:pl-0 border-emerald-600/10 pl-4">
                       <!-- Accountant Approval -->
                       <template v-if="(!referrer.approvalStatus || referrer.approvalStatus === 'PENDING') && isAccountant">
                          <div class="flex gap-2">
                            <Button size="sm" variant="outline" class="h-10 px-4 text-[10px] font-black uppercase text-green-600 border-green-600/20 bg-green-600/5 hover:bg-green-600/10"
                              :disabled="isProcessing"
                              @click="handleApproveCommission(referrer.id, 'APPROVED_ACCOUNTANT')">Approve (Acct)</Button>
                            <Button size="sm" variant="outline" class="h-10 px-4 text-[10px] font-black uppercase text-rose-600 border-rose-600/20 bg-rose-600/5 hover:bg-rose-600/10"
                              :disabled="isProcessing"
                              @click="handleRejectCommission(referrer.id)">Reject</Button>
                          </div>
                       </template>

                       <!-- Manager Approval -->
                       <template v-if="referrer.approvalStatus === 'APPROVED_ACCOUNTANT' && isManager">
                          <div class="flex gap-2">
                            <Button size="sm" variant="outline" class="h-10 px-4 text-[10px] font-black uppercase text-green-600 border-green-600/20 bg-green-600/5 hover:bg-green-600/10"
                              :disabled="isProcessing"
                              @click="handleApproveCommission(referrer.id, 'APPROVED_MANAGER')">Approve (Mgr)</Button>
                            <Button size="sm" variant="outline" class="h-10 px-4 text-[10px] font-black uppercase text-rose-600 border-rose-600/20 bg-rose-600/5 hover:bg-rose-600/10"
                              :disabled="isProcessing"
                              @click="handleRejectCommission(referrer.id)">Reject</Button>
                          </div>
                       </template>
                    </div>
                  </div>
                </div>
                <div class="flex justify-between items-center px-4 py-2 bg-emerald-600/5 dark:bg-emerald-950/40 border-t border-emerald-600/10">
                  <div class="flex items-center gap-3">
                    <span class="text-[11px] font-bold text-emerald-800 dark:text-emerald-300">Total Approved Commissions</span>
                    <div class="flex items-center gap-2">
                      <Button v-if="isAccountant" size="sm" variant="link" 
                              class="h-5 text-[9px] uppercase font-black text-emerald-600 p-0 hover:text-emerald-500"
                              @click="handleApproveAllCommissions('APPROVED_ACCOUNTANT')">
                         Acct Bulk Approve
                      </Button>
                      <span v-if="isAccountant && isManager" class="text-emerald-300">|</span>
                      <Button v-if="isManager" size="sm" variant="link" 
                              class="h-5 text-[9px] uppercase font-black text-emerald-600 p-0 hover:text-emerald-500"
                              @click="handleApproveAllCommissions('APPROVED_MANAGER')">
                         Mgr Bulk Approve
                      </Button>
                    </div>
                  </div>
                  <span class="text-base font-black text-emerald-600 dark:text-emerald-400">{{ formatCurrency(effectiveFinancials?.referrerCommission || 0) }}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </template>
      </TabsContent>

      <TabsContent value="inventory" class="space-y-8 mt-6">
        <!-- 4. Inventory Returns Grid -->
        <template v-if="isEditing">
          <div class="space-y-4">
            <div class="flex flex-col">
              <h3 class="text-xl font-semibold">Inventory Returns</h3>
              <p class="text-sm text-muted-foreground">Return unused inventory items to stock. Credits will be applied
                upon approval.</p>
            </div>
            <InventoryReturnsGrid v-model="editableJob.inventoryReturns" :general-info="job.generalInfo" />
          </div>
        </template>
        <template v-else-if="inventoryReturns.length > 0">
          <Card
            class="bg-orange-600/5 dark:bg-orange-600/10 backdrop-blur-md border-orange-600/20 dark:border-orange-600/30 shadow-lg text-foreground dark:text-white overflow-hidden">
            <CardHeader class="flex flex-row items-center justify-between gap-2 bg-orange-600/10 border-b border-orange-600/20 py-4">
              <div class="flex items-center gap-2">
                <PackageMinus class="size-4 text-orange-600" />
                <CardTitle class="text-lg font-bold text-orange-600 dark:text-white">Inventory Returns</CardTitle>
              </div>
              <Button v-if="(isAccountant || isManager) && isMainJobApproved && inventoryReturns.length > 0" size="sm" variant="outline"
                class="h-7 text-xs font-bold border-orange-500/40 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 gap-1.5"
                :disabled="isProcessing"
                @click="handleApproveAllReturns">
                <CheckCircle2 class="size-3" />
                Approve All {{ isManager ? '(Manager)' : '(Accountant)' }}
              </Button>
            </CardHeader>
            <CardContent class="p-0">
              <!-- Desktop Table View -->
              <Table v-if="!isMobile" class="border-collapse table-fixed w-full border-t border-l border-white/80">
                <TableHeader>
                  <TableRow class="bg-muted/20 border-b border-white/80">
                    <TableHead
                      class="text-xs font-bold px-4 text-foreground dark:text-white border-r border-b border-white/80">
                      Item Name</TableHead>
                    <TableHead
                      class="text-xs font-bold text-right w-24 text-foreground dark:text-white border-r border-b border-white/80">
                      Qty
                    </TableHead>
                    <TableHead
                      class="text-xs font-bold text-right w-32 text-foreground dark:text-white border-r border-b border-white/80">
                      Unit Price
                    </TableHead>
                    <TableHead
                      class="text-xs font-bold text-right w-40 text-foreground dark:text-white border-r border-b border-white/80">
                      Total
                      Credit</TableHead>
                    <TableHead v-if="isMainJobApproved"
                      class="text-xs font-bold text-right w-48 text-foreground dark:text-white border-r border-b border-white/80">
                      Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="ret in inventoryReturns" :key="ret.id"
                    class="text-sm border-b border-white/80 last:border-b hover:bg-muted/10 transition-colors">
                    <TableCell class="px-4 font-medium border-r border-b border-white/80">
                      <div class="flex flex-col gap-0.5">
                        <div class="flex items-center gap-2">
                          {{ ret.itemName }}
                          <Badge v-if="ret.isAdjustment" variant="outline"
                            class="text-[8px] font-black bg-amber-100 text-amber-700 border-amber-200 py-0 px-1">
                            ADJUSTMENT</Badge>
                        </div>
                        <div class="flex items-center gap-2 mt-0.5">
                          <span v-if="ret.createdAt" class="text-[9px] text-muted-foreground italic">Added: {{ new Date(ret.createdAt).toLocaleString() }}</span>
                          <span v-else-if="ret.isAdjustment" class="text-[9px] font-bold text-amber-600/80">
                            {{ formatDate(ret.adjustmentDate || job.updatedAt) }}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell class="text-right tabular-nums border-r border-b border-white/80">{{ ret.qtyReturned }}
                    </TableCell>
                    <TableCell class="text-right tabular-nums border-r border-b border-white/80">{{
                      formatCurrency(ret.unitPrice) }}</TableCell>
                    <TableCell
                      class="text-right font-bold text-orange-700 dark:text-orange-400 tabular-nums border-r border-b border-white/80">
                      {{ formatCurrency(ret.totalCredit) }}
                    </TableCell>
                    <TableCell v-if="isMainJobApproved"
                      class="text-right whitespace-nowrap border-r border-b border-white/80">
                      <template v-if="ret.approvalStatus === 'APPROVED_MANAGER' || ret.approvalStatus === 'REJECTED'">
                        <div class="flex items-center justify-end gap-1 px-2">
                          <Badge :variant="getItemStatusVariant(ret.approvalStatus)">{{ ret.approvalStatus ===
                            'APPROVED_MANAGER' ? 'APPROVED' : 'REJECTED' }}</Badge>
                          <Button v-if="(ret.approvalStatus === 'REJECTED' && (isAccountant || isManager)) || (ret.approvalStatus === 'APPROVED_MANAGER' && isAdminOrSuperAdmin)"
                            size="icon" variant="outline" :title="ret.approvalStatus === 'REJECTED' ? 'Re-invoke — reset to Pending' : 'Unlock PDF Download'"
                            class="h-6 w-6 text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 border-amber-300/50"
                            :disabled="isProcessing"
                            @click="handleUnlockPdf('inventoryReturns', ret.id)">
                            <svg v-if="ret.approvalStatus === 'REJECTED'" xmlns="http://www.w3.org/2000/svg" class="size-3" viewBox="0 0 24 24" fill="none"
                              stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
                            </svg>
                            <svg v-else xmlns="http://www.w3.org/2000/svg" class="size-3" viewBox="0 0 24 24" fill="none"
                              stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
                            </svg>
                          </Button>
                        </div>
                      </template>
                      <template v-else-if="ret.approvalStatus === 'APPROVED_ACCOUNTANT'">
                        <div class="flex items-center justify-end gap-1 px-2">
                          <Badge variant="secondary" class="mr-2">ACCT OK</Badge>
                          <template v-if="isManager">
                            <Button size="icon" variant="outline"
                              class="h-6 w-6 text-green-600 dark:text-green-400 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
                              @click="handleItemApproval('inventoryReturns', ret.id, 'APPROVED_MANAGER')">
                              <CheckCircle2 class="size-3" />
                            </Button>
                            <Button size="icon" variant="outline"
                              class="h-6 w-6 text-red-600 dark:text-red-400 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                              @click="handleItemApproval('inventoryReturns', ret.id, 'REJECTED')">
                              <XCircle class="size-3" />
                            </Button>
                          </template>
                        </div>
                      </template>
                      <template v-else>
                        <div class="flex items-center justify-end gap-1 px-2">
                          <Badge variant="outline" class="mr-2">PENDING</Badge>
                          <template v-if="isAccountant">
                            <Button size="icon" variant="outline"
                              class="h-6 w-6 text-green-600 dark:text-green-400 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
                              @click="handleItemApproval('inventoryReturns', ret.id, 'APPROVED_ACCOUNTANT')">
                              <CheckCircle2 class="size-3" />
                            </Button>
                            <Button size="icon" variant="outline"
                              class="h-6 w-6 text-red-600 dark:text-red-400 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                              @click="handleItemApproval('inventoryReturns', ret.id, 'REJECTED')">
                              <XCircle class="size-3" />
                            </Button>
                          </template>
                        </div>
                      </template>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>

              <!-- Mobile Card View -->
              <div v-else class="space-y-2 px-2 py-2">
                <div v-for="(ret, retIdx) in inventoryReturns" :key="ret.id" 
                    class="relative overflow-hidden rounded-xl border bg-card shadow-sm transition-all"
                    :class="[getItemStatusVariant(ret.approvalStatus) === 'destructive' ? 'border-rose-500/20 bg-rose-50/10' : 'border-border/60']">
                  
                  <!-- Card Header -->
                  <div class="flex items-center justify-between px-3 py-1.5 bg-muted/5 border-b border-border/40">
                    <div class="flex items-center gap-2">
                      <span class="flex size-4 items-center justify-center rounded-full bg-blue-600 text-[8px] font-black text-white shadow-sm">
                        {{ Number(retIdx) + 1 }}
                      </span>
                      <span class="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Return Entry</span>
                    </div>
                    <Badge v-if="isMainJobApproved" :variant="getItemStatusVariant(ret.approvalStatus)" class="h-4 text-[7px] font-black uppercase px-1.5">
                      {{ ret.approvalStatus === 'APPROVED_MANAGER' ? 'Approved' : ret.approvalStatus === 'REJECTED' ? 'Rejected' : 'Pending' }}
                    </Badge>
                  </div>

                  <div class="p-3 space-y-3">
                    <!-- Item Name -->
                    <div class="space-y-0.5">
                      <p class="text-xs font-bold text-foreground">{{ ret.itemName }}</p>
                      <p v-if="ret.description" class="text-[10px] text-muted-foreground leading-snug">{{ ret.description }}</p>
                      <p v-if="ret.isAdjustment" class="text-[8px] font-bold text-amber-600">
                        Adjustment: {{ formatDate(ret.adjustmentDate || job.updatedAt) }}
                      </p>
                    </div>

                    <!-- Financial Row -->
                    <div class="grid grid-cols-2 gap-2 py-2 border-y border-border/40 bg-muted/5 -mx-3 px-3">
                      <div class="space-y-0.5">
                        <p class="text-[8px] font-black uppercase text-muted-foreground tracking-widest leading-none">Qty & Rate</p>
                        <p class="text-[11px] font-bold">{{ ret.quantityReturned }} × {{ formatCurrency(ret.unitPrice) }}</p>
                      </div>
                      <div class="text-right space-y-0.5">
                        <p class="text-[8px] font-black uppercase text-blue-600 tracking-widest leading-none">Total Value</p>
                        <p class="text-xs font-black text-blue-600">{{ formatCurrency(ret.totalAmount) }}</p>
                      </div>
                    </div>

                     <!-- Mobile Approval Actions -->
                    <div v-if="isMainJobApproved && (ret.approvalStatus !== 'APPROVED_MANAGER' || isAccountant || isManager || isAdminOrSuperAdmin)" 
                         class="pt-0.5 flex flex-wrap justify-end gap-1">
                         
                         <!-- Re-invoke / Unlock -->
                         <Button v-if="(ret.approvalStatus === 'REJECTED' && (isAccountant || isManager)) || (ret.approvalStatus === 'APPROVED_MANAGER' && isAdminOrSuperAdmin)"
                            size="sm" variant="outline" class="h-7 px-2 text-[8px] font-black uppercase gap-1 text-amber-600 border-amber-200 bg-amber-50/30 hover:bg-amber-50 shadow-sm rounded-lg"
                            :disabled="isProcessing"
                            @click="handleUnlockPdf('inventoryReturns', ret.id)">
                            <Loader2 v-if="isProcessing" class="size-3 animate-spin"/>
                            <template v-else>
                              <svg v-if="ret.approvalStatus === 'REJECTED'" xmlns="http://www.w3.org/2000/svg" class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
                              </svg>
                              <Lock v-else class="size-3" />
                            </template>
                            {{ ret.approvalStatus === 'REJECTED' ? 'Re-invoke' : 'Unlock' }}
                         </Button>

                         <!-- Accountant Approval -->
                         <template v-if="(!ret.approvalStatus || ret.approvalStatus === 'PENDING') && isAccountant">
                            <div class="flex gap-1 w-full sm:w-auto mt-1 sm:mt-0">
                                <Button size="sm" variant="outline" class="flex-1 sm:flex-none h-8 px-2 text-[8px] font-black uppercase text-green-600 border-green-600/20 bg-green-600/5 hover:bg-green-600/10 rounded-lg shadow-sm"
                                  :disabled="isProcessing"
                                  @click="handleItemApproval('inventoryReturns', ret.id, 'APPROVED_ACCOUNTANT')">Approve (Acct)</Button>
                                <Button size="sm" variant="outline" class="flex-1 sm:flex-none h-8 px-2 text-[8px] font-black uppercase text-rose-600 border-rose-600/20 bg-rose-600/5 hover:bg-rose-600/10 rounded-lg shadow-sm"
                                  :disabled="isProcessing"
                                  @click="handleItemApproval('inventoryReturns', ret.id, 'REJECTED')">Reject</Button>
                            </div>
                         </template>

                         <!-- Manager Approval -->
                         <template v-if="ret.approvalStatus === 'APPROVED_ACCOUNTANT' && isManager">
                            <div class="flex gap-1 w-full sm:w-auto mt-1 sm:mt-0">
                                <Button size="sm" variant="outline" class="flex-1 sm:flex-none h-8 px-2 text-[8px] font-black uppercase text-green-600 border-green-600/20 bg-green-600/5 hover:bg-green-600/10 rounded-lg shadow-sm"
                                  :disabled="isProcessing"
                                  @click="handleItemApproval('inventoryReturns', ret.id, 'APPROVED_MANAGER')">Approve (Mgr)</Button>
                                <Button size="sm" variant="outline" class="flex-1 sm:flex-none h-8 px-2 text-[8px] font-black uppercase text-rose-600 border-rose-600/20 bg-rose-600/5 hover:bg-rose-600/10 rounded-lg shadow-sm"
                                  :disabled="isProcessing"
                                  @click="handleItemApproval('inventoryReturns', ret.id, 'REJECTED')">Reject</Button>
                            </div>
                         </template>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
            <div class="bg-orange-600/5 p-4 border-t border-orange-600/20 flex justify-end">
              <div class="flex flex-col items-end">
                <span class="text-[10px] uppercase text-orange-600 font-black tracking-widest">Returned Items Value</span>
                <span class="text-lg font-black text-orange-600">{{formatCurrency(inventoryReturns.reduce((s, r) => s
                  +
                  (Number(r.totalCredit) || 0), 0))}}</span>
              </div>
            </div>
          </Card>
        </template>
      </TabsContent>

      <TabsContent value="tools" class="space-y-8 mt-6">
        <!-- 4b. Tools Allocation Section -->
        <div class="mt-8">
          <AllocatedToolsGrid 
            v-if="isEditing" 
            v-model="editableJob.allocatedTools" 
            :job-id="jobId" 
            :is-editing="true" 
          />
          <AllocatedToolsGrid 
            v-else 
            v-model="allocatedTools" 
            :job-id="jobId" 
            :is-editing="false" 
          />
        </div>
      </TabsContent>

      <TabsContent value="billing" class="space-y-8 mt-6">
        <!-- New Unified Summary & Payments Section -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">

          <div class="space-y-6">
            <!-- Consolidated Summary Card -->
            <Card
              class="bg-brand-primary/5 dark:bg-brand-primary/10 backdrop-blur-md border-brand-primary/20 dark:border-brand-primary/30 shadow-lg text-foreground dark:text-white overflow-hidden h-fit">
              <CardHeader class="bg-brand-primary/5 border-b border-brand-primary/10 p-3 py-2">
                <CardTitle class="text-sm font-black uppercase tracking-widest text-brand-primary dark:text-white">
                  Consolidated Summary
                </CardTitle>
              </CardHeader>
              <CardContent class="p-3 space-y-2">
                <div class="space-y-1.5">
                  <div class="flex justify-between items-center text-sm border-t border-brand-primary/10 pt-1.5">
                    <span class="text-muted-foreground font-black uppercase text-[10px]">Job Invoice Total</span>
                    <span class="font-bold underline tabular-nums decoration-[#79c21b]/30 offset-4 text-brand-primary">{{
                        formatCurrency(safeTotals.inventorySubtotal) }}</span>
                  </div>
                  <div class="flex justify-between items-center text-xs opacity-60">
                    <span class="text-muted-foreground font-medium uppercase text-[9px]">Internal Ad-hoc (Excluded)</span>
                    <span class="font-medium tabular-nums text-foreground dark:text-white">{{ formatCurrency(safeTotals.adHocTotal) }}</span>
                  </div>

                  <Separator class="my-1.5 bg-brand-primary/20" />

                  <div class="flex flex-col items-end gap-0.5">
                    <span class="text-[10px] font-black uppercase text-brand-primary/60 dark:text-brand-primary/40 tracking-[.2em]">Subtotal</span>
                    <span class="text-2xl font-black text-brand-primary dark:text-brand-primary tracking-tighter tabular-nums">
                      {{ formatCurrency(safeTotals.grandTotal) }}
                    </span>
                  </div>

                  <div class="flex flex-col items-end gap-0.5 border-t border-brand-primary/30 pt-1.5">
                    <span class="text-[10px] font-black uppercase text-brand-primary/60 dark:text-brand-primary/40 tracking-[.2em]">
                      Overall Grand Total
                    </span>
                    <span class="text-3xl font-black text-brand-primary dark:text-brand-primary tracking-tighter tabular-nums drop-shadow-sm">
                      {{ formatCurrency(grandTotalWithVat) }}
                    </span>
                    <p class="text-[9px] text-muted-foreground uppercase font-medium italic">Inventory Items Only</p>
                  </div>

                  <!-- Consolidated Payment Tracking -->
                  <div class="pt-2 border-t border-brand-primary/20 flex flex-col items-end gap-1">
                    <div class="flex justify-between items-center w-full">
                      <span class="text-[10px] font-black uppercase text-blue-600">Total Paid</span>
                      <span class="font-bold text-blue-600">{{ formatCurrency(totalPaid) }}</span>
                    </div>
                    <div class="flex justify-between items-center w-full">
                      <span :class="['text-[11px] font-black uppercase', isFullyPaid ? 'text-emerald-600' : 'text-amber-600']">Balance Due</span>
                      <span :class="['text-lg font-black tabular-nums', isFullyPaid ? 'text-emerald-600' : 'text-amber-600']">{{ formatCurrency(balanceDue) }}</span>
                    </div>
                  </div>
                </div>

                <!-- Payment Breakdown -->
                <div v-if="safeTotals.expensesByMethod" class="space-y-1 pt-2 border-t border-primary/10">
                  <p class="text-[9px] font-black uppercase text-muted-foreground/50 tracking-widest">Payment Method Breakdown</p>
                  <div v-for="(amount, method) in safeTotals.expensesByMethod" :key="method"
                    class="flex justify-between text-xs items-center bg-muted/20 p-1 px-2 rounded">
                    <span class="text-muted-foreground uppercase font-black text-[9px]">{{ method }}</span>
                    <span class="font-bold tabular-nums">{{ formatCurrency(amount) }}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div class="space-y-8">
            <!-- Record Payment Card -->
            <Card v-if="isMainJobApprovedByManager"
              class="bg-brand-primary/5 dark:bg-brand-primary/10 backdrop-blur-md border-brand-primary/20 dark:border-brand-primary/30 shadow-lg text-foreground dark:text-white overflow-hidden">
              <CardHeader
                class="flex flex-row items-center justify-between bg-brand-primary/10 border-b border-brand-primary/20 p-4 py-3">
                <CardTitle class="text-sm font-black uppercase tracking-widest text-brand-primary dark:text-white">
                  Record Incoming Payment
                </CardTitle>
                <Badge v-if="balanceDue > 0" variant="outline"
                  class="bg-amber-100 text-amber-700 border-amber-300 shadow-sm animate-pulse">Balance: {{
                    formatCurrency(balanceDue) }}</Badge>
              </CardHeader>
              <CardContent class="p-3 space-y-2">
                <div class="space-y-1">
                  <Label class="text-xs">Incoming Amount ($)</Label>
                  <Input type="number" v-model="paymentAmount" placeholder="0.00" class="text-sm h-8"
                    :disabled="isUploadingPayment" />
                </div>

                <div class="space-y-1">
                  <Label class="text-xs">Deposit Account / Payment Method</Label>
                  <Select v-model="paymentMethod" :disabled="isUploadingPayment">
                    <SelectTrigger class="text-sm bg-background h-8">
                      <SelectValue placeholder="Select Method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank">Bank Transfer</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="ecocash">EcoCash</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div class="space-y-1">
                  <Label class="text-xs">Proof of Payment</Label>
                  <Input type="file" @change="handleFileChange" accept="image/*,.pdf" class="text-sm h-8 cursor-pointer"
                    :disabled="isUploadingPayment" />
                </div>

                <div class="space-y-1">
                  <Label class="text-xs">Reference Note (Optional)</Label>
                  <Textarea v-model="paymentNote" placeholder="e.g. Initial 50% deposit" class="text-sm resize-none min-h-[60px]"
                    :disabled="isUploadingPayment" />
                </div>

                <div v-if="isFullyPaid" class="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-center">
                  <CheckCircle2 class="size-6 mx-auto text-emerald-500 mb-1" />
                  <p class="text-emerald-700 font-bold text-sm">Invoice Fully Settled</p>
                  <p class="text-xs text-emerald-600/70">No further payments required.</p>
                </div>

                <Button v-else
                  class="w-full bg-brand-primary hover:bg-brand-primary/90 text-white font-bold shadow-lg"
                  @click="handleRecordPayment" :disabled="isUploadingPayment">
                  <Loader2 v-if="isUploadingPayment" class="size-4 animate-spin mr-2" />
                  {{ isUploadingPayment ? 'Uploading & Saving...' : 'Log into Ledger' }}
                </Button>
              </CardContent>
            </Card>

            <!-- Recorded Payments Log -->
            <Card v-if="recordedPayments.length > 0" class="shadow-sm border-muted/60">
              <CardHeader class="flex flex-row items-center gap-2 pb-2 bg-muted/5 border-b">
                <Receipt class="size-4 text-muted-foreground" />
                <CardTitle class="text-sm font-bold">Payment History</CardTitle>
              </CardHeader>
              <CardContent class="p-0">
                <Table class="border-collapse table-fixed w-full border-t border-l border-white/80">
                  <TableHeader class="bg-muted/10">
                    <TableRow class="border-b border-white/80">
                      <TableHead class="text-xs border-r border-b border-white/80">Date</TableHead>
                      <TableHead class="text-xs border-r border-b border-white/80">Amount</TableHead>
                      <TableHead class="text-xs border-r border-b border-white/80">Method</TableHead>
                      <TableHead class="text-xs border-r border-b border-white/80">Reference</TableHead>
                      <TableHead class="text-xs text-right text-muted-foreground/40 border-r border-b border-white/80">
                        Proof
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow v-for="pay in recordedPayments" :key="pay.id" class="border-b border-white/80">
                      <TableCell class="text-xs py-3 border-r border-b border-white/80">
                        {{ pay.createdAt?.toDate?.()?.toLocaleDateString() || 'N/A' }}
                      </TableCell>
                      <TableCell class="text-sm font-bold text-green-700 py-3 border-r border-b border-white/80">
                        {{ formatCurrency(pay.amount || 0) }}
                      </TableCell>
                      <TableCell class="text-xs py-3 border-r border-b border-white/80">
                        <Badge variant="outline" class="uppercase text-[9px]">{{ pay.paymentMethod }}</Badge>
                      </TableCell>
                      <TableCell class="text-xs py-3 text-muted-foreground border-r border-b border-white/80">
                        {{ pay.description || 'No note' }}
                      </TableCell>
                      <TableCell class="text-right py-3 flex gap-1 justify-end border-r border-b border-white/80">
                        <Button v-if="pay.proofOfPaymentUrl" variant="ghost" size="icon" class="h-8 w-8 text-primary"
                          @click="handleViewProof(pay.proofOfPaymentUrl)">
                          <Eye class="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" class="h-8 w-8" @click="handleDownloadReceipt(pay)">
                          <Download class="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </div>

        <!-- Approval History Underneath (Full Width of Main Column) -->
        <Card class="shadow-sm border-muted/60 mt-8 font-sans">
          <CardHeader class="flex flex-row items-center gap-2 pb-2 bg-muted/5 border-b">
            <UserCheck class="size-4 text-primary" />
            <CardTitle class="text-lg font-bold">Approval History</CardTitle>
          </CardHeader>
          <CardContent class="p-6">
            <div v-if="!job.approvalTimeline || job.approvalTimeline.length === 0"
              class="text-sm text-muted-foreground py-8 border-2 border-dashed rounded-lg text-center">
              Card pending initial evaluation...
            </div>
            <div
              class="space-y-8 relative before:absolute before:left-4 before:top-2 before:bottom-2 before:w-[2px] before:bg-muted/50 md:before:block">
              <div v-for="(event, index) in job.approvalTimeline" :key="index" class="relative pl-10">
                <div
                  class="absolute left-[-2px] top-1 size-5 rounded-full bg-primary border-4 border-background z-10 hidden md:block shadow-sm">
                </div>
                <div class="flex flex-col">
                  <span class="font-black text-sm uppercase tracking-tight">{{ event.status }}</span>
                  <div class="flex items-center gap-1 text-[11px] text-muted-foreground mt-1">
                    <span class="font-bold text-foreground">{{ event.user }}</span>
                    <span>•</span>
                    <span class="font-medium">{{ event.role }}</span>
                  </div>
                  <span
                    class="text-[10px] text-muted-foreground mt-1 font-mono uppercase bg-muted/30 px-1 rounded inline-block w-fit">
                    {{ new Date(event.date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) }}
                  </span>
                  <p v-if="event.comment"
                    class="mt-3 text-xs bg-muted/10 border border-muted/20 p-3 rounded-md text-muted-foreground leading-relaxed shadow-sm">
                    "{{ event.comment }}"
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="overview" class="space-y-8 mt-6">
        <!-- 6. Metadata -->
        <Card class="shadow-sm border-dashed bg-muted/5 mt-8">
          <CardHeader class="py-3">
            <CardTitle class="text-[10px] uppercase font-black text-muted-foreground/40 tracking-[.3em]">System Identity
            </CardTitle>
          </CardHeader>
          <CardContent class="text-[11px] space-y-4 px-6 pb-6">
            <div class="flex justify-between border-b border-dashed border-muted/60 pb-2">
              <span class="text-muted-foreground font-medium uppercase text-[9px]">Creator ID</span>
              <span class="text-muted-foreground tabular-nums">{{ job.submittedBy?.uid }}</span>
            </div>
            <div class="flex justify-between border-b border-dashed border-muted/60 pb-2">
              <span class="text-muted-foreground font-medium uppercase text-[9px]">Document Reference</span>
              <span class="text-primary font-bold tabular-nums">{{ job.id }}</span>
            </div>
            <div class="flex justify-between items-center pt-2">
              <span class="text-muted-foreground font-medium uppercase text-[9px]">Last Sync</span>
              <span class="text-[10px] tabular-nums font-bold">{{ job.updatedAt?.toDate()?.toLocaleString() || 'N/A'
              }}</span>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  </div>
</div>
</div>

    <!-- Mobile Sticky Approval Bar (Only visible on mobile when not editing) -->
    <div v-if="isMobile && !isEditing && canApprove" 
      class="fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-lg border-t border-border p-4 flex gap-3 shadow-[0_-4px_12px_rgba(0,0,0,0.1)] z-50">
      <Button variant="outline" class="flex-1 h-12 font-bold text-rose-600 border-rose-200" @click="handleReject" :disabled="isProcessing">
        <XCircle class="mr-2 size-5" />
        Reject
      </Button>
      <Button class="flex-1 h-12 font-bold bg-brand-primary text-white" @click="handleApproval" :disabled="!canApprove || isProcessing">
        <template v-if="!isProcessing">
          <CheckCircle2 class="mr-2 size-5" />
          {{ approvalButtonLabel }}
        </template>
        <template v-else>
          <Loader2 class="mr-2 size-5 animate-spin" />
          Processing...
        </template>
      </Button>
    </div>

  <!-- Edit Mode Action Bar -->
  <div v-if="isEditing"
    class="fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-md border-t p-4 z-50 flex justify-end gap-4 shadow-lg pr-8">
    <Button variant="outline" size="lg" @click="handleCancelEdit" :disabled="isProcessing">Cancel</Button>
    <Button size="lg" @click="handleSaveChanges" :disabled="isProcessing" class="px-8 shadow-lg">
      <Loader2 v-if="isProcessing" class="mr-2 h-5 w-5 animate-spin" />
      <CheckCircle2 v-else class="mr-2 h-5 w-5" />
      {{ isProcessing ? 'Saving...' : 'Save Changes' }}
    </Button>
  </div>

  <!-- IRD Transfer Confirmation Modal -->
  <Teleport to="body">
    <div v-if="showIrdTransferModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      @click.self="showIrdTransferModal = false">
      <div class="bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
        <div>
          <p class="text-xs font-black uppercase tracking-widest text-brand-primary mb-0.5">IRD Remittance</p>
          <h2 class="text-lg font-black text-foreground">Transfer to IRD Account</h2>
          <p class="text-sm text-muted-foreground mt-1">
            This will initiate a fund transfer of <span class="font-black text-foreground">{{ formatCurrency(effectiveFinancials?.irdNetRevenue) }}</span> to the IRD account. <span v-if="isManager">The transfer will be completed immediately.</span><span v-else>It will require manager approval before posting to the ledger.</span>
          </p>
        </div>

        <div class="space-y-1.5">
          <Label class="text-xs font-black uppercase tracking-wide">Transfer From</Label>
          <Select v-model="irdTransferFromAccount">
            <SelectTrigger class="h-9 text-sm">
              <SelectValue placeholder="Select account" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="BANK">Bank</SelectItem>
              <SelectItem value="CASH">Cash</SelectItem>
              <SelectItem value="ECOCASH">EcoCash</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="rounded-lg bg-brand-primary/10 border border-brand-primary/20 px-3 py-2 text-sm space-y-0.5">
          <div class="flex justify-between">
            <span class="text-muted-foreground text-xs font-bold uppercase">Amount</span>
            <span class="font-black text-brand-primary">{{ formatCurrency(effectiveFinancials?.irdNetRevenue) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground text-xs font-bold uppercase">To</span>
            <span class="font-black text-foreground">IRD Account</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground text-xs font-bold uppercase">Reference</span>
            <span class="font-black text-foreground">JC-{{ job?.generalInfo?.jobNumber || jobId.substring(0, 8) }}</span>
          </div>
        </div>

        <div class="flex gap-2 pt-1">
          <Button variant="outline" class="flex-1" :disabled="irdTransferring" @click="showIrdTransferModal = false">
            Cancel
          </Button>
          <Button class="flex-1 bg-brand-primary hover:bg-brand-primary/90 text-white font-black"
            :disabled="irdTransferring" @click="handleIrdTransfer">
            <Loader2 v-if="irdTransferring" class="size-3.5 mr-1.5 animate-spin" />
            {{ irdTransferring ? 'Initiating...' : 'Confirm Transfer' }}
          </Button>
        </div>
      </div>
    </div>
  </Teleport>

  <ToolReturnModal
    v-if="job"
    v-model:open="showToolReturnModal"
    :job="job"
    :is-manager="isManager"
    :is-accountant="isAccountant"
  />
</template>

<style scoped>
/* Force Inter font throughout the entire Job Card Detail page */
:deep(*) {
  font-family: "Inter", ui-sans-serif, system-ui, sans-serif !important;
}
/* Preserve monospace only where explicitly requested (timestamps, IDs) */
:deep(.font-mono) {
  font-family: "Geist Mono", ui-monospace, monospace !important;
}
</style>
