<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { db } from '@/lib/firebase'
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp, arrayUnion, deleteDoc } from 'firebase/firestore'
import { useRouter } from 'vue-router'
import { useSession } from '@/composables/useSession'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { 
  ChevronLeft, 
  Search, 
  Loader2, 
  Briefcase, 
  Calendar, 
  CheckCircle2, 
  X,
  XCircle,
  MapPin,
  FileText,
  AlertCircle,
  PieChart,
  Receipt,
  Clock,
  Package,
  Info,
  Wrench,
  Trash2
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { computeFinancials } from '@shared/financialEngine'
import { useFinanceStore } from '@/stores/financeStore'
import { inventoryApi } from '@/lib/inventoryApi'
import { postJobEarningsToPayroll } from '@/lib/payrollIntegration'

interface RequisitionItem {
  itemName: string
  qty: number
  unitCost: number
  totalCost: number
}

interface RequisitionSection {
  title: string
  items?: RequisitionItem[]
}

interface StaffRate {
  id: string
  employeeId: string
  jobRateAmount: number
  paymentMethod?: string
  approvalStatus?: string
}

interface JobCard {
  id: string
  status: string
  jobNumber?: string
  customerName?: string
  jobTitle?: string
  description?: string
  priority?: string
  lockedImplementationCost?: number
  lockedTotalInvoiceValue?: number
  totalPaid?: number
  generalInfo?: {
    jobNumber?: string
    jobTitle?: string
    recipientName?: string
    recipientPhone?: string
    projectDescription?: string
    dimensionsOfStructure?: string
    projectLocation?: string
    startDate?: string
    priority?: string
    linkedCrmTotal?: number
    jobInvoiceValue?: number
    jobCategoryId?: string
    linkedCrmNumber?: string
    linkedCrmType?: string
    ecocashOrBankAccount?: string
    recipientAddress?: string
    referrers?: any[]
  }
  totals?: {
    grandTotal?: number
    implementationCost?: number
    inventoryIRDTotal?: number
    inventoryMUTotal?: number
    adHocTotal?: number
    staffRatesTotal?: number
    overallGrandTotal?: number
    inventoryIMPCostTotal?: number
  }
  summary?: {
    inventoryIRDTotal?: number
    inventoryMUTotal?: number
    implementationCost?: number
    inventoryIMPCostTotal?: number
    grandTotal?: number
  }
  requisitionSections?: RequisitionSection[]
  staffRates?: StaffRate[]
  adHocExpenses?: any[]
  inventoryReturns?: any[]
  allocatedTools?: any[]
  approvalTimeline?: Array<{
    user: string
    role?: string
    status: string
    comment?: string
    date: string
  }>
}

const router = useRouter()
const { user, claims } = useSession()

const jobCards = ref<JobCard[]>([])
const loading = ref(false)
const searchQuery = ref('')
const statusFilter = ref('all')

// Selected Job Card for Modal & Subcollection stores
const showModal = ref(false)
const selectedJc = ref<JobCard | null>(null)
const isSubmitting = ref(false)

const jobCategoriesList = ref<any[]>([])
const selectedRequisitionItems = ref<any[]>([])
const selectedAdHocExpenses = ref<any[]>([])
const selectedInventoryReturns = ref<any[]>([])
const selectedStaffRates = ref<any[]>([])
const selectedPayments = ref<any[]>([])
const selectedReferrers = ref<any[]>([])
const employees = ref<Map<string, any>>(new Map())

// Sub-systems Approvals Integration State
const activeTab = ref<'info' | 'materials' | 'expenses' | 'labor' | 'tools' | 'financials'>('info')
const selectedToolId = ref('')
const toolsRegistryList = ref<any[]>([])

const financeStore = useFinanceStore()

const isManager = computed(() => {
  const r = claims.value?.roles || []
  const roleArray = Array.isArray(r) ? r : [String(r)]
  return roleArray.some((role: string) => ['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(role))
})

const isAccountant = computed(() => {
  const r = claims.value?.roles || []
  const roleArray = Array.isArray(r) ? r : [String(r)]
  return roleArray.some((role: string) => ['ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN'].includes(role))
})

let unsub: (() => void) | null = null
let catsUnsub: (() => void) | null = null
let toolsUnsub: (() => void) | null = null
let employeesUnsub: (() => void) | null = null
let detailsUnsubs: Array<() => void> = []

onMounted(() => {
  loading.value = true
  const q = query(collection(db, 'jobCards'))
  unsub = onSnapshot(q, (snap) => {
    jobCards.value = snap.docs.map(d => ({ id: d.id, ...d.data() } as JobCard))
    loading.value = false
  }, (err) => {
    console.error(err)
    loading.value = false
  })

  // Dynamic reference categories
  catsUnsub = onSnapshot(collection(db, 'jobCategories'), (snap) => {
    jobCategoriesList.value = snap.docs.map(d => ({ id: d.id, ...d.data() }))
  }, (err) => {
    console.error("Categories fetch error:", err)
  })

  // Dynamic reference tools registry
  toolsUnsub = onSnapshot(collection(db, 'toolsRegistry'), (snap) => {
    toolsRegistryList.value = snap.docs.map(d => ({ id: d.id, ...d.data() }))
  }, (err) => {
    console.error("Tools registry fetch error:", err)
  })

  // Employees listener for name lookup
  employeesUnsub = onSnapshot(collection(db, 'employees'), (snap) => {
    const map = new Map<string, any>()
    snap.docs.forEach(d => map.set(d.id, { id: d.id, ...d.data() }))
    employees.value = map
  }, (err) => {
    console.error("Employees fetch error:", err)
  })
})

onUnmounted(() => {
  unsub?.()
  catsUnsub?.()
  toolsUnsub?.()
  employeesUnsub?.()
  detailsUnsubs.forEach(u => u())
  detailsUnsubs = []
})

// Helpers
const getJobNum = (jc: JobCard) => jc.generalInfo?.jobNumber || jc.jobNumber || jc.id.substring(0, 8).toUpperCase()
const getJobTitle = (jc: JobCard) => jc.generalInfo?.jobTitle || jc.jobTitle || 'Untitled Job Card'
const getRecipient = (jc: JobCard) => jc.generalInfo?.recipientName || jc.customerName || 'Unknown Recipient'
const getStartDate = (jc: JobCard) => jc.generalInfo?.startDate || '—'
const getLocation = (jc: JobCard) => jc.generalInfo?.projectLocation || '—'
const getPriority = (jc: JobCard) => jc.generalInfo?.priority || jc.priority || 'MEDIUM'

const resolveJobCategoryName = (id?: string): string => {
  if (!id) return '—'
  const found = jobCategoriesList.value.find(c => c.id === id)
  return found?.name || id
}

const getEmployeeName = (id?: string) => {
  if (!id) return 'Unknown'
  const emp = employees.value.get(id)
  return emp?.fullName || emp?.name || id.substring(0, 8).toUpperCase()
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

const formatDate = (val: any) => {
  if (!val) return ''
  if (typeof val.toDate === 'function') {
    return val.toDate().toLocaleString()
  }
  return new Date(val).toLocaleString()
}

const getInvoiceValue = (jc: JobCard) => {
  if (jc.generalInfo?.linkedCrmTotal != null && jc.generalInfo.linkedCrmTotal > 0) {
    return jc.generalInfo.linkedCrmTotal
  }
  if (jc.generalInfo?.jobInvoiceValue != null && jc.generalInfo.jobInvoiceValue > 0) {
    return jc.generalInfo.jobInvoiceValue
  }

  const totals = jc.totals || {}
  const summary = jc.summary || {}

  const isApproved = ['APPROVED_MANAGER', 'COMPLETED'].includes(jc.status)
  const lockedImplementationCost = jc.lockedImplementationCost
  
  const inventoryIRDTotal = totals.inventoryIRDTotal ?? summary.inventoryIRDTotal ?? 0
  const inventoryMUTotal = totals.inventoryMUTotal ?? summary.inventoryMUTotal ?? 0
  const implementationCost = isApproved && lockedImplementationCost != null 
    ? lockedImplementationCost 
    : (totals.implementationCost ?? summary.implementationCost ?? totals.inventoryIMPCostTotal ?? summary.inventoryIMPCostTotal ?? 0)

  const computedGrandTotal = inventoryIRDTotal + inventoryMUTotal + implementationCost
  return totals.grandTotal ?? summary.grandTotal ?? totals.overallGrandTotal ?? computedGrandTotal
}

const getAmountDue = (jc: JobCard) => {
  const invoiceValue = getInvoiceValue(jc)
  const paid = jc.totalPaid || 0
  return Math.max(0, invoiceValue - paid)
}

const fmt = (n: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(n || 0)
}

// Stats & Aggregations
const stats = computed(() => {
  const activeList = jobCards.value.filter(j => ['IN_PROGRESS', 'APPROVED_MANAGER', 'APPROVED'].includes(j.status))
  const pendingList = jobCards.value.filter(j => ['SUBMITTED', 'APPROVAL_PENDING_MANAGER', 'APPROVAL_PENDING_ACCOUNTANT'].includes(j.status))
  const completedList = jobCards.value.filter(j => j.status === 'COMPLETED')

  return {
    total: jobCards.value.length,
    active: activeList.length,
    pending: pendingList.length,
    completed: completedList.length
  }
})

const cumulativeTotals = computed(() => {
  let invoiceTotal = 0
  let amountDueTotal = 0
  
  filteredJobCards.value.forEach(jc => {
    if (jc.status && jc.status.toUpperCase() === 'SUBMITTED') {
      return
    }
    invoiceTotal += getInvoiceValue(jc)
    amountDueTotal += getAmountDue(jc)
  })
  
  const collectedTotal = Math.max(0, invoiceTotal - amountDueTotal)
  
  return {
    invoiceTotal,
    amountDueTotal,
    collectedTotal
  }
})

// Filters
const filteredJobCards = computed(() => {
  let list = [...jobCards.value]

  // Status Filter
  if (statusFilter.value !== 'all') {
    if (statusFilter.value === 'pending') {
      list = list.filter(j => ['SUBMITTED', 'APPROVAL_PENDING_MANAGER', 'APPROVAL_PENDING_ACCOUNTANT'].includes(j.status))
    } else if (statusFilter.value === 'active') {
      list = list.filter(j => ['IN_PROGRESS', 'APPROVED_MANAGER', 'APPROVED'].includes(j.status))
    } else if (statusFilter.value === 'completed') {
      list = list.filter(j => j.status === 'COMPLETED')
    } else if (statusFilter.value === 'draft') {
      list = list.filter(j => j.status === 'DRAFT')
    }
  }

  // Search Filter
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(j => {
      const num = getJobNum(j).toLowerCase()
      const title = getJobTitle(j).toLowerCase()
      const recipient = getRecipient(j).toLowerCase()
      const location = getLocation(j).toLowerCase()
      return num.includes(q) || title.includes(q) || recipient.includes(q) || location.includes(q)
    })
  }

  // Order by Job Number descending by default
  return list.sort((a, b) => getJobNum(b).localeCompare(getJobNum(a)))
})

// Badges
const getStatusLabel = (status: string) => {
  const map: Record<string, string> = {
    DRAFT: 'Draft',
    SUBMITTED: 'Submitted',
    APPROVAL_PENDING_ACCOUNTANT: 'Pending Accountant',
    APPROVAL_PENDING_MANAGER: 'Pending Manager',
    APPROVED_MANAGER: 'Approved by Mgr',
    APPROVED: 'Approved',
    IN_PROGRESS: 'In Progress',
    COMPLETED: 'Completed',
    REJECTED: 'Rejected',
    CANCELLED: 'Cancelled'
  }
  return map[status] || status
}

const statusBadgeStyle = (status: string) => {
  if (['APPROVED', 'APPROVED_MANAGER', 'COMPLETED'].includes(status)) {
    return 'bg-green-500/10 text-green-500 border-green-500/25'
  }
  if (['SUBMITTED', 'APPROVAL_PENDING_MANAGER', 'APPROVAL_PENDING_ACCOUNTANT'].includes(status)) {
    return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/25'
  }
  if (status === 'IN_PROGRESS') {
    return 'bg-blue-500/10 text-blue-500 border-blue-500/25'
  }
  if (['REJECTED', 'CANCELLED'].includes(status)) {
    return 'bg-red-500/10 text-red-500 border-red-500/25'
  }
  return 'bg-muted/80 text-muted-foreground border-transparent'
}

const getPriorityStyle = (priority: string) => {
  const p = priority.toUpperCase()
  if (p === 'URGENT' || p === 'HIGH') return 'bg-red-500/15 text-red-500 border-red-500/20'
  if (p === 'MEDIUM') return 'bg-yellow-500/15 text-yellow-500 border-yellow-500/20'
  return 'bg-green-500/15 text-green-500 border-green-500/20'
}

// Modal Trigger
const openDetails = (jc: JobCard) => {
  selectedJc.value = jc
  showModal.value = true

  // Reset selected reactive stores
  selectedRequisitionItems.value = []
  selectedAdHocExpenses.value = []
  selectedInventoryReturns.value = []
  selectedStaffRates.value = []
  selectedPayments.value = []
  selectedReferrers.value = jc.generalInfo?.referrers || []

  // Clear any previous listeners
  detailsUnsubs.forEach(unsub => unsub())
  detailsUnsubs = []

  const jobId = jc.id

  // 0. Real-time Single Document Listener
  const unsubDoc = onSnapshot(doc(db, 'jobCards', jobId), (snap) => {
    if (snap.exists()) {
      const data = { id: snap.id, ...snap.data() } as JobCard
      selectedJc.value = data
      selectedReferrers.value = data.generalInfo?.referrers || []

      // Prioritize main document arrays (New Standard) just like desktop
      if (Array.isArray(data.requisitionSections) && data.requisitionSections.length > 0) {
        selectedRequisitionItems.value = data.requisitionSections
      }
      if (Array.isArray(data.adHocExpenses) && data.adHocExpenses.length > 0) {
        selectedAdHocExpenses.value = data.adHocExpenses
      }
      if (Array.isArray(data.staffRates) && data.staffRates.length > 0) {
        selectedStaffRates.value = data.staffRates
      }
      if (Array.isArray(data.inventoryReturns) && data.inventoryReturns.length > 0) {
        selectedInventoryReturns.value = data.inventoryReturns
      }
    }
  }, (err) => console.error("Job Card fetch error:", err))
  detailsUnsubs.push(unsubDoc)

  // 1. Requisition Items
  const itemsRef = collection(db, 'jobCards', jobId, 'items')
  const unsubItems = onSnapshot(itemsRef, (snap) => {
    // Only use subcollections if the main document didn't already supply them
    const hasMainSections = selectedJc.value && Array.isArray(selectedJc.value.requisitionSections) && selectedJc.value.requisitionSections.length > 0
    if (!hasMainSections) {
      const rawItems = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      }))
      
      if (rawItems.length > 0) {
        // Group flat subcollection items into sections
        const groups: Record<string, any> = {}
        rawItems.forEach((item: any) => {
          const catId = item.jobCategoryId || 'unassigned'
          if (!groups[catId]) {
            groups[catId] = {
              id: catId,
              jobCategoryId: catId === 'unassigned' ? '' : catId,
              description: '',
              items: []
            }
          }
          groups[catId].items.push({
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
        })
        selectedRequisitionItems.value = Object.values(groups)
      } else if (selectedJc.value && Array.isArray(selectedJc.value.requisitionSections) && selectedJc.value.requisitionSections.length > 0) {
        selectedRequisitionItems.value = selectedJc.value.requisitionSections
      }
    }
  }, (err) => console.error("Items fetch error:", err))
  detailsUnsubs.push(unsubItems)

  // 2. Ad-hoc Expenses
  const expRef = collection(db, 'jobCards', jobId, 'expenses')
  const unsubExp = onSnapshot(expRef, (snap) => {
    const hasMainExpenses = selectedJc.value && Array.isArray(selectedJc.value.adHocExpenses) && selectedJc.value.adHocExpenses.length > 0
    if (!hasMainExpenses) {
      const rawExp = snap.docs.map(d => ({ id: d.id, ...d.data() } as any))
      if (rawExp.length > 0) {
        selectedAdHocExpenses.value = rawExp.sort((a, b) => {
          const timeA = a.createdAt?.toMillis?.() || 0
          const timeB = b.createdAt?.toMillis?.() || 0
          return timeA - timeB
        })
      } else if (selectedJc.value && Array.isArray(selectedJc.value.adHocExpenses) && selectedJc.value.adHocExpenses.length > 0) {
        selectedAdHocExpenses.value = selectedJc.value.adHocExpenses
      }
    }
  }, (err) => console.error("Expenses fetch error:", err))
  detailsUnsubs.push(unsubExp)

  // 3. Staff Rates
  const staffRef = collection(db, 'jobCards', jobId, 'staffRates')
  const unsubStaff = onSnapshot(staffRef, (snap) => {
    const hasMainStaff = selectedJc.value && Array.isArray(selectedJc.value.staffRates) && selectedJc.value.staffRates.length > 0
    if (!hasMainStaff) {
      const rawStaff = snap.docs.map(d => ({ id: d.id, ...d.data() } as any))
      if (rawStaff.length > 0) {
        selectedStaffRates.value = rawStaff.sort((a, b) => {
          const timeA = a.createdAt?.toMillis?.() || 0
          const timeB = b.createdAt?.toMillis?.() || 0
          return timeA - timeB
        })
      } else if (selectedJc.value && Array.isArray(selectedJc.value.staffRates) && selectedJc.value.staffRates.length > 0) {
        selectedStaffRates.value = selectedJc.value.staffRates
      }
    }
  }, (err) => console.error("Staff rates fetch error:", err))
  detailsUnsubs.push(unsubStaff)

  // 4. Returns
  const retRef = collection(db, 'jobCards', jobId, 'returns')
  const unsubRet = onSnapshot(retRef, (snap) => {
    const hasMainReturns = selectedJc.value && Array.isArray(selectedJc.value.inventoryReturns) && selectedJc.value.inventoryReturns.length > 0
    if (!hasMainReturns) {
      const rawRet = snap.docs.map(d => ({ id: d.id, ...d.data() } as any))
      if (rawRet.length > 0) {
        selectedInventoryReturns.value = rawRet.sort((a, b) => {
          const timeA = a.updatedAt?.toMillis?.() || 0
          const timeB = b.updatedAt?.toMillis?.() || 0
          return timeA - timeB
        })
      } else if (selectedJc.value && Array.isArray(selectedJc.value.inventoryReturns) && selectedJc.value.inventoryReturns.length > 0) {
        selectedInventoryReturns.value = selectedJc.value.inventoryReturns
      }
    }
  }, (err) => console.error("Returns fetch error:", err))
  detailsUnsubs.push(unsubRet)

  // 5. Payments
  const paymentsRef = collection(db, 'jobPayments')
  const paymentsQ = query(paymentsRef, where('jobCardId', '==', jobId))
  const unsubPayments = onSnapshot(paymentsQ, (snap) => {
    selectedPayments.value = snap.docs.map(d => ({ id: d.id, ...d.data() }))
  }, (err) => console.error("Payments fetch error:", err))
  detailsUnsubs.push(unsubPayments)
}

const closeDetails = () => {
  showModal.value = false
  detailsUnsubs.forEach(unsub => unsub())
  detailsUnsubs = []
  selectedJc.value = null
}

const selectedFinancials = computed(() => {
  if (!selectedJc.value) return null

  let sections: any[] = []
  if (selectedRequisitionItems.value.length > 0) {
    sections = selectedRequisitionItems.value
  } else if (Array.isArray(selectedJc.value.requisitionSections) && selectedJc.value.requisitionSections.length > 0) {
    sections = selectedJc.value.requisitionSections
  }

  const normalizedSections = sections.map((section: any) => ({
    ...section,
    items: (section.items || []).map((item: any) => ({
      ...item,
      itemName: item.itemName || item.inventoryItemName || 'Unnamed Item',
      qty: Number(item.qty || item.qtyRequired || 0),
      irdSellingPrice: Number(item.irdSellingPrice || item.irdSellingPriceSnapshot || 0),
      costSnapshot: Number(item.costSnapshot || item.purchaseCostSnapshot || item.totalCostSnapshot || 0),
      twidMarkupPercent: Number(item.twidMarkupPercent || item.markupPercent || 0),
      rowIRDTot: Number(item.rowIRDTot || item.rowIRDTotal || 0),
      rowMUTot: Number(item.rowMUTot  || item.rowMUTotal  || 0),
      rowGrandTot: Number(item.rowGrandTot || item.rowGrandTotal || 0)
    }))
  }))

  const baseFinancials = computeFinancials(
    normalizedSections,
    selectedAdHocExpenses.value,
    selectedInventoryReturns.value,
    selectedStaffRates.value,
    selectedReferrers.value,
    selectedJc.value.status
  )

  // Prioritize CRM total, then locked manager value, then calculated total
  const getLockedValue = () => {
    const crmTotal = selectedJc.value?.generalInfo?.linkedCrmTotal
    if (crmTotal != null && crmTotal > 0) return crmTotal

    const locked = selectedJc.value?.lockedTotalInvoiceValue
    if (locked != null && locked > 0) return locked

    return baseFinancials.totalInvoiceValue ?? 0
  }

  const initialInvoiceValue = getLockedValue()
  const revenue = initialInvoiceValue
  const baseCost = baseFinancials.totalCost || 0
  const referrerCommission = baseFinancials.referrerCommission || 0
  const commissionPercentage = baseFinancials.commissionPercentage || 0

  const totalCost = baseCost
  const netProfit = revenue - totalCost
  const profitMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0

  // New Formula Fields
  const totalOperationalGross = (baseFinancials.irdGrossRevenue || 0) + (baseFinancials.implementationCost || 0) + referrerCommission
  const twidNetAfterAdjustments = revenue - totalOperationalGross
  const twidRevenuePercentage = initialInvoiceValue > 0 ? (twidNetAfterAdjustments / initialInvoiceValue) * 100 : 0

  // IRD Formula Fields
  const irdCumulativeNetRevenue = (baseFinancials.irdGrossRevenue || 0) - (baseFinancials.irdBaseCost || 0)
  const irdRevenuePercentage = (baseFinancials.irdGrossRevenue || 0) > 0
    ? (irdCumulativeNetRevenue / (baseFinancials.irdGrossRevenue || 0)) * 100
    : 0

  return {
    ...baseFinancials,
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
    irdNetRevenue: (baseFinancials.irdNetRevenue || 0),
    irdCumulativeNetRevenue,
    irdRevenuePercentage
  }
})

const selectedTotalPaid = computed(() => {
  return selectedPayments.value.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0)
})

const selectedBalanceDue = computed(() => {
  const total = selectedFinancials.value?.totalRevenue ?? 0
  return Math.max(0, total - selectedTotalPaid.value)
})

const selectedPaymentProgress = computed(() => {
  const total = selectedFinancials.value?.totalRevenue ?? 0
  if (total <= 0) return 0
  return Math.min(100, (selectedTotalPaid.value / total) * 100)
})

const selectedIsFullyPaid = computed(() => selectedBalanceDue.value <= 0)

// Mgr Approval Operations
const handleApprove = async () => {
  if (!selectedJc.value) return
  isSubmitting.value = true

  const userRoles = claims.value?.roles || []
  const roleArray = Array.isArray(userRoles) ? userRoles : [String(userRoles)]
  const activeRole = roleArray.find((r: string) => ['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(r)) || 'MANAGER'

  try {
    const docRef = doc(db, 'jobCards', selectedJc.value.id)
    await updateDoc(docRef, {
      status: 'APPROVED_MANAGER',
      updatedAt: serverTimestamp(),
      approvalTimeline: arrayUnion({
        user: user.value?.displayName || 'Manager',
        role: activeRole,
        status: 'Approved by Manager',
        date: new Date().toISOString()
      })
    })

    toast.success('Job Card Approved successfully!')
    showModal.value = false
  } catch (err: any) {
    console.error(err)
    toast.error('Failed to approve Job Card')
  } finally {
    isSubmitting.value = false
  }
}

const handleReject = async () => {
  if (!selectedJc.value) return
  const comment = prompt('Enter a reason/comment for rejection:')
  if (comment === null) return // Canceled

  isSubmitting.value = true

  const userRoles = claims.value?.roles || []
  const roleArray = Array.isArray(userRoles) ? userRoles : [String(userRoles)]
  const activeRole = roleArray.find((r: string) => ['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(r)) || 'MANAGER'

  try {
    const docRef = doc(db, 'jobCards', selectedJc.value.id)
    await updateDoc(docRef, {
      status: 'REJECTED',
      updatedAt: serverTimestamp(),
      approvalTimeline: arrayUnion({
        user: user.value?.displayName || 'Manager',
        role: activeRole,
        status: 'Rejected by Manager',
        comment: comment || 'No comments provided',
        date: new Date().toISOString()
      })
    })

    toast.success('Job Card Rejected successfully.')
    showModal.value = false
  } catch (err: any) {
    console.error(err)
    toast.error('Failed to reject Job Card')
  } finally {
    isSubmitting.value = false
  }
}

// Sub-systems Item-Level Approvals & Side-effects
const handleItemApproval = async (
  arrayField: 'requisitionItems' | 'adHocExpenses' | 'inventoryReturns' | 'staffRates',
  itemId: string,
  newStatus: 'APPROVED_ACCOUNTANT' | 'APPROVED_MANAGER' | 'REJECTED'
) => {
  if (!selectedJc.value) return
  isSubmitting.value = true
  const jobId = selectedJc.value.id

  try {
    if (arrayField === 'requisitionItems') {
      const hasSubcollItems = selectedRequisitionItems.value.length > 0 && selectedRequisitionItems.value[0].items !== undefined

      if (hasSubcollItems) {
        const clonedSections = selectedRequisitionItems.value.map(s => ({
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

        if (newStatus === 'APPROVED_MANAGER') {
          if (foundItem.inventoryItemId && !foundItem.inventoryDeducted) {
            const qty = Number(foundItem.qty || 0)
            if (qty > 0) {
              try {
                await inventoryApi.adjustStock(foundItem.inventoryItemId, {
                  type: 'REMOVE',
                  qty,
                  reason: `Item Approved: ${getJobNum(selectedJc.value)}`,
                  reference: selectedJc.value.id,
                  unitCost: Number(foundItem.costSnapshot || 0)
                })
                foundItem.inventoryDeducted = true
                toast.success('Stock Level Decreased')
              } catch (err: any) {
                console.error('Stock deduction failed:', err)
                toast.error('Stock Deduction Failed', { description: err.message })
              }
            }
          }
        }

        if (foundItem.id) {
          const subDocRef = doc(db, 'jobCards', jobId, 'items', foundItem.id)
          if (newStatus === 'REJECTED') {
            await deleteDoc(subDocRef)
          } else {
            await updateDoc(subDocRef, {
              approvalStatus: foundItem.approvalStatus,
              approvedAt: foundItem.approvedAt || null,
              inventoryDeducted: foundItem.inventoryDeducted || false
            })
          }
        }

        const flattenedItems = clonedSections.flatMap(s => s.items.map((i: any) => ({ ...i, jobCategoryId: s.jobCategoryId })))
        await updateDoc(doc(db, 'jobCards', jobId), {
          requisitionSections: clonedSections,
          requisitionItems: flattenedItems,
          updatedAt: serverTimestamp()
        })
      } else {
        let clonedItems = (selectedJc.value.requisitionSections || []).map((i: any) => ({ ...i }))
        const itemIndex = clonedItems.findIndex((i: any) => i.id === itemId)
        if (itemIndex === -1) throw new Error('Item not found')

        if (newStatus === 'REJECTED') {
          clonedItems = clonedItems.filter((i: any) => i.id !== itemId)
        } else {
          clonedItems[itemIndex].approvalStatus = newStatus
          if (newStatus === 'APPROVED_MANAGER') {
            const item = clonedItems[itemIndex]
            item.approvedAt = new Date().toISOString()

            if (item.inventoryItemId && !item.inventoryDeducted) {
              const qty = Number(item.qty || 0)
              if (qty > 0) {
                try {
                  await inventoryApi.adjustStock(item.inventoryItemId, {
                    type: 'REMOVE',
                    qty,
                    reason: `Item Approved: ${getJobNum(selectedJc.value)}`,
                    reference: selectedJc.value.id,
                    unitCost: Number(item.costSnapshot || 0)
                  })
                  item.inventoryDeducted = true
                  toast.success('Stock Level Decreased')
                } catch (err: any) {
                  console.error('Stock deduction failed:', err)
                  toast.error('Stock Deduction Failed', { description: err.message })
                }
              }
            }
          }
        }

        await updateDoc(doc(db, 'jobCards', jobId), {
          requisitionSections: clonedItems,
          updatedAt: serverTimestamp()
        })
      }
    } else if (arrayField === 'adHocExpenses') {
      const clonedArray = selectedAdHocExpenses.value.map(i => ({ ...i }))
      const itemIndex = clonedArray.findIndex(i => i.id === itemId)
      if (itemIndex === -1) throw new Error('Expense item not found')

      const targetItem = clonedArray[itemIndex]

      if (newStatus === 'REJECTED') {
        if (targetItem.id) {
          try {
            await deleteDoc(doc(db, 'jobCards', jobId, 'expenses', targetItem.id))
          } catch (e) {}
        }
        const filtered = clonedArray.filter(i => i.id !== itemId)
        await updateDoc(doc(db, 'jobCards', jobId), {
          adHocExpenses: filtered,
          updatedAt: serverTimestamp()
        })
        toast.success('Ad-hoc Expense Rejected')
        return
      }

      clonedArray[itemIndex].approvalStatus = newStatus
      const amount = Number(targetItem.totalAmount || (targetItem.quantity || 0) * (targetItem.unitPrice || 0))
      if (isAccountant.value && amount < 300 && newStatus === 'APPROVED_ACCOUNTANT') {
        clonedArray[itemIndex].approvalStatus = 'APPROVED_MANAGER'
      }

      const finalStatus = clonedArray[itemIndex].approvalStatus
      if (finalStatus === 'APPROVED_MANAGER') {
        clonedArray[itemIndex].approvedAt = new Date().toISOString()
      }

      if (targetItem.id) {
        await updateDoc(doc(db, 'jobCards', jobId, 'expenses', targetItem.id), {
          approvalStatus: finalStatus,
          approvedAt: clonedArray[itemIndex].approvedAt || null
        })
      }

      await updateDoc(doc(db, 'jobCards', jobId), {
        adHocExpenses: clonedArray,
        updatedAt: serverTimestamp()
      })

      if (finalStatus === 'APPROVED_MANAGER') {
        const jobIdentifier = getJobNum(selectedJc.value)
        await financeStore.recordExpense({
          category: 'job-card-expense',
          amount,
          paymentMethod: (targetItem.paymentMethod || 'cash').toLowerCase(),
          description: `Job Card ${jobIdentifier} - ${targetItem.description || 'Ad-hoc expense'}`,
          attachmentUrl: (targetItem.attachmentUrls && targetItem.attachmentUrls[0]) || targetItem.attachmentUrl || null,
          attachmentUrls: targetItem.attachmentUrls || (targetItem.attachmentUrl ? [targetItem.attachmentUrl] : []),
          status: 'APPROVED',
          sourceJobId: jobId,
          sourceItemId: targetItem.id
        })
        toast.success('Expense Posted to Ledger')
      }
    } else if (arrayField === 'inventoryReturns') {
      const clonedArray = selectedInventoryReturns.value.map(i => ({ ...i }))
      const itemIndex = clonedArray.findIndex(i => i.id === itemId)
      if (itemIndex === -1) throw new Error('Return item not found')

      const targetItem = clonedArray[itemIndex]

      if (newStatus === 'REJECTED') {
        if (targetItem.id) {
          try {
            await deleteDoc(doc(db, 'jobCards', jobId, 'returns', targetItem.id))
          } catch (e) {}
        }
        const filtered = clonedArray.filter(i => i.id !== itemId)
        await updateDoc(doc(db, 'jobCards', jobId), {
          inventoryReturns: filtered,
          updatedAt: serverTimestamp()
        })
        toast.success('Return Record Rejected')
        return
      }

      clonedArray[itemIndex].approvalStatus = newStatus

      if (newStatus === 'APPROVED_MANAGER') {
        if (targetItem.inventoryItemId && !targetItem.inventoryReturned) {
          try {
            const qty = Number(targetItem.qtyReturned || 0)
            await inventoryApi.adjustStock(targetItem.inventoryItemId, {
              type: 'ADD',
              qty,
              reason: `Return from Job ${getJobNum(selectedJc.value)}`,
              reference: selectedJc.value.id
            })
            clonedArray[itemIndex].inventoryReturned = true
            clonedArray[itemIndex].approvedAt = new Date().toISOString()
            toast.success('Inventory Restocked')
          } catch (err: any) {
            console.error('Stock increment failed:', err)
            toast.error('Restocking Failed', { description: err.message })
          }
        }
      }

      if (targetItem.id) {
        await updateDoc(doc(db, 'jobCards', jobId, 'returns', targetItem.id), {
          approvalStatus: clonedArray[itemIndex].approvalStatus,
          inventoryReturned: clonedArray[itemIndex].inventoryReturned || false,
          approvedAt: clonedArray[itemIndex].approvedAt || null
        })
      }

      await updateDoc(doc(db, 'jobCards', jobId), {
        inventoryReturns: clonedArray,
        updatedAt: serverTimestamp()
      })
    } else if (arrayField === 'staffRates') {
      const clonedArray = selectedStaffRates.value.map(i => ({ ...i }))
      const itemIndex = clonedArray.findIndex(i => i.id === itemId)
      if (itemIndex === -1) throw new Error('Staff rate not found')

      const targetItem = clonedArray[itemIndex]

      if (newStatus === 'REJECTED') {
        if (targetItem.id) {
          try {
            await deleteDoc(doc(db, 'jobCards', jobId, 'staffRates', targetItem.id))
          } catch (e) {}
        }
        const filtered = clonedArray.filter(i => i.id !== itemId)
        await updateDoc(doc(db, 'jobCards', jobId), {
          staffRates: filtered,
          updatedAt: serverTimestamp()
        })
        toast.success('Staff Rate Rejected')
        return
      }

      clonedArray[itemIndex].approvalStatus = newStatus
      if (newStatus === 'APPROVED_MANAGER') {
        clonedArray[itemIndex].approvedAt = new Date().toISOString()
      }

      if (targetItem.id) {
        await updateDoc(doc(db, 'jobCards', jobId, 'staffRates', targetItem.id), {
          approvalStatus: newStatus,
          approvedAt: clonedArray[itemIndex].approvedAt || null
        })
      }

      await updateDoc(doc(db, 'jobCards', jobId), {
        staffRates: clonedArray,
        updatedAt: serverTimestamp()
      })

      if (newStatus === 'APPROVED_MANAGER') {
        const jobDate = new Date() // Target the current month when the rate is approved/completed
        const jobNumber = getJobNum(selectedJc.value)
        const results = await postJobEarningsToPayroll(jobId, jobNumber, [clonedArray[itemIndex]], jobDate)

        if (results.length > 0) {
          const r = results[0]
          toast.success('Payroll Ledger Updated', {
            description: `$${r!.amount.toFixed(2)} added to ${r!.employeeName}'s payroll`
          })
        }
      }
    }
    toast.success('Item status updated successfully')
  } catch (err: any) {
    console.error("Action handler failed:", err)
    toast.error("Action Failed", { description: err.message })
  } finally {
    isSubmitting.value = false
  }
}

const handleCommissionApproval = async (commissionId: string, targetStatus: 'APPROVED_ACCOUNTANT' | 'APPROVED_MANAGER') => {
  if (!selectedJc.value) return
  isSubmitting.value = true
  const jobId = selectedJc.value.id

  try {
    const referrers = JSON.parse(JSON.stringify(selectedJc.value.generalInfo?.referrers || []))
    const index = referrers.findIndex((r: any) => r.id === commissionId)
    if (index === -1) throw new Error('Commission record not found')

    const comm = referrers[index]
    comm.approvalStatus = targetStatus
    comm.approvedAt = new Date().toISOString()
    comm.approvedBy = user.value?.displayName || user.value?.email || 'Manager'

    if (targetStatus === 'APPROVED_MANAGER') {
      const jobIdentifier = getJobNum(selectedJc.value)
      await financeStore.recordExpense({
        category: 'commission',
        amount: Number(comm.amount || 0),
        paymentMethod: (comm.paymentMethod || 'cash').toLowerCase(),
        description: `Commission Payout: Job ${jobIdentifier} - ${comm.name || 'Anonymous Referrer'}`,
        status: 'APPROVED',
        sourceJobId: jobId,
        sourceItemId: comm.id
      })
      toast.success('Commission Expense Posted')
    }

    await updateDoc(doc(db, 'jobCards', jobId), {
      'generalInfo.referrers': referrers,
      updatedAt: serverTimestamp()
    })

    toast.success(`Commission Approved: ${targetStatus}`)
  } catch (err: any) {
    console.error("Commission approval failed:", err)
    toast.error("Approval Failed", { description: err.message })
  } finally {
    isSubmitting.value = false
  }
}

const handleRejectCommission = async (commissionId: string) => {
  if (!selectedJc.value) return
  if (!confirm('Are you sure you want to REJECT and REMOVE this referrer commission?')) return
  isSubmitting.value = true
  const jobId = selectedJc.value.id

  try {
    const referrers = JSON.parse(JSON.stringify(selectedJc.value.generalInfo?.referrers || []))
    const filtered = referrers.filter((r: any) => r.id !== commissionId)

    await updateDoc(doc(db, 'jobCards', jobId), {
      'generalInfo.referrers': filtered,
      updatedAt: serverTimestamp()
    })

    toast.success('Commission Rejected & Removed')
  } catch (err: any) {
    console.error("Commission rejection failed:", err)
    toast.error("Rejection Failed", { description: err.message })
  } finally {
    isSubmitting.value = false
  }
}

const handleUpdateToolState = async (toolId: string, newState: 'Allocated' | 'Returned' | 'Damaged') => {
  if (!selectedJc.value) return
  isSubmitting.value = true
  const jobId = selectedJc.value.id

  try {
    const allocatedTools = [...(selectedJc.value.allocatedTools || [])]
    const index = allocatedTools.findIndex(t => t.id === toolId)
    if (index === -1) throw new Error('Allocated tool not found')

    allocatedTools[index].state = newState
    allocatedTools[index].returnedAt = newState !== 'Allocated' ? new Date().toISOString() : null

    await updateDoc(doc(db, 'jobCards', jobId), {
      allocatedTools,
      updatedAt: serverTimestamp()
    })

    toast.success(`Tool marked as ${newState}`)
  } catch (err: any) {
    console.error("Tool status update failed:", err)
    toast.error("Update Failed", { description: err.message })
  } finally {
    isSubmitting.value = false
  }
}

const handleDeallocateTool = async (toolId: string) => {
  if (!selectedJc.value) return
  if (!confirm('Are you sure you want to deallocate/remove this tool from the job card?')) return
  isSubmitting.value = true
  const jobId = selectedJc.value.id

  try {
    const allocatedTools = (selectedJc.value.allocatedTools || []).filter((t: any) => t.id !== toolId)

    await updateDoc(doc(db, 'jobCards', jobId), {
      allocatedTools,
      updatedAt: serverTimestamp()
    })

    toast.success('Tool allocation removed')
  } catch (err: any) {
    console.error("Tool deallocation failed:", err)
    toast.error("Deallocation Failed", { description: err.message })
  } finally {
    isSubmitting.value = false
  }
}

const handleAllocateTool = async () => {
  if (!selectedJc.value || !selectedToolId.value) return
  isSubmitting.value = true
  const jobId = selectedJc.value.id

  try {
    const tool = toolsRegistryList.value.find(t => t.id === selectedToolId.value)
    if (!tool) throw new Error('Tool not found in registry')

    const newAllocation = {
      id: Math.random().toString(36).substring(2),
      toolId: tool.id,
      name: tool.name,
      serialNumber: tool.serialNumber || 'N/A',
      state: 'Allocated',
      allocatedAt: new Date().toISOString(),
      returnedAt: null
    }

    const allocatedTools = [...(selectedJc.value.allocatedTools || []), newAllocation]

    await updateDoc(doc(db, 'jobCards', jobId), {
      allocatedTools,
      updatedAt: serverTimestamp()
    })

    selectedToolId.value = ''
    toast.success(`${tool.name} allocated successfully`)
  } catch (err: any) {
    console.error("Tool allocation failed:", err)
    toast.error("Allocation Failed", { description: err.message })
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="flex-1 flex flex-col pb-20 bg-background min-h-screen">
    <!-- Header -->
    <header class="sticky top-0 z-10 bg-card border-b px-4 py-4 flex items-center gap-4 shadow-sm">
      <Button variant="ghost" size="icon" @click="router.push('/')">
        <ChevronLeft class="size-6" />
      </Button>
      <div class="flex-1">
        <h1 class="text-xl font-black tracking-tight">Job Cards</h1>
        <p class="text-xs text-muted-foreground">Manage & authorize job activities</p>
      </div>
      <Badge class="bg-[#ff8903] text-white text-[10px] font-black h-5 px-2">
        {{ stats.total }} TOTAL
      </Badge>
    </header>

    <!-- Overview Stats cards -->
    <section class="p-4 grid grid-cols-3 gap-2">
      <Card class="bg-card border shadow-sm">
        <CardContent class="p-3 space-y-0.5 text-center">
          <p class="text-[8px] font-black uppercase text-muted-foreground tracking-widest">Active Jobs</p>
          <p class="text-lg font-black text-[#79c21b]">{{ stats.active }}</p>
        </CardContent>
      </Card>
      <Card class="bg-card border shadow-sm">
        <CardContent class="p-3 space-y-0.5 text-center">
          <p class="text-[8px] font-black uppercase text-muted-foreground tracking-widest">Pending Appr.</p>
          <p class="text-lg font-black text-[#ff8903]">{{ stats.pending }}</p>
        </CardContent>
      </Card>
      <Card class="bg-card border shadow-sm">
        <CardContent class="p-3 space-y-0.5 text-center">
          <p class="text-[8px] font-black uppercase text-muted-foreground tracking-widest">Completed</p>
          <p class="text-lg font-black text-blue-500">{{ stats.completed }}</p>
        </CardContent>
      </Card>
    </section>

    <!-- Cumulative Financial Summary Strip -->
    <section class="px-4 pb-2" v-if="!loading && filteredJobCards.length > 0">
      <div class="flex gap-3 overflow-x-auto pb-3 snap-x no-scrollbar">
        <!-- TOTAL INVOICE VALUE -->
        <Card class="min-w-[220px] flex-1 snap-start bg-[#79c21b]/5 border-[#79c21b]/20 shadow-sm">
          <CardContent class="p-4 flex items-center justify-between">
            <div class="space-y-1">
              <p class="text-[9px] font-black text-muted-foreground uppercase tracking-wider">Total Invoice Value</p>
              <h3 class="text-lg font-black tracking-tight text-[#79c21b]">
                {{ fmt(cumulativeTotals.invoiceTotal) }}
              </h3>
            </div>
            <div class="p-2 bg-[#79c21b]/10 rounded-full">
              <FileText class="size-4 text-[#79c21b]" />
            </div>
          </CardContent>
        </Card>

        <!-- TOTAL PAYMENTS COLLECTED -->
        <Card class="min-w-[220px] flex-1 snap-start bg-emerald-500/5 border-emerald-500/20 shadow-sm">
          <CardContent class="p-4 flex items-center justify-between">
            <div class="space-y-1">
              <p class="text-[9px] font-black text-muted-foreground uppercase tracking-wider">Total Payments Collected</p>
              <h3 class="text-lg font-black text-emerald-500 tracking-tight">
                {{ fmt(cumulativeTotals.collectedTotal) }}
              </h3>
            </div>
            <div class="p-2 bg-emerald-500/10 rounded-full">
              <CheckCircle2 class="size-4 text-emerald-500" />
            </div>
          </CardContent>
        </Card>

        <!-- TOTAL OUTSTANDING BALANCE -->
        <Card class="min-w-[220px] flex-1 snap-start bg-amber-500/5 border-amber-500/20 shadow-sm">
          <CardContent class="p-4 flex items-center justify-between">
            <div class="space-y-1">
              <p class="text-[9px] font-black text-muted-foreground uppercase tracking-wider">Total Outstanding Balance</p>
              <h3 class="text-lg font-black text-amber-500 tracking-tight">
                {{ fmt(cumulativeTotals.amountDueTotal) }}
              </h3>
            </div>
            <div class="p-2 bg-amber-500/10 rounded-full">
              <AlertCircle class="size-4 text-amber-500" />
            </div>
          </CardContent>
        </Card>
      </div>
    </section>

    <!-- Toolbar Filters -->
    <section class="px-4 space-y-2.5">
      <div class="relative">
        <Search class="absolute left-3 top-2.5 size-4 text-muted-foreground" />
        <Input 
          v-model="searchQuery" 
          placeholder="Search by Job #, client, title..." 
          class="pl-9 h-10 border bg-muted/20"
        />
      </div>

      <div class="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
        <Button 
          variant="secondary"
          size="sm"
          :class="statusFilter === 'all' ? 'bg-[#ff8903] text-white' : ''"
          class="capitalize text-[10px] font-black px-3 rounded-full"
          @click="statusFilter = 'all'"
        >
          All Jobs
        </Button>
        <Button 
          v-for="s in ['pending', 'active', 'completed', 'draft']" 
          :key="s"
          variant="secondary"
          size="sm"
          :class="statusFilter === s ? 'bg-[#ff8903] text-white' : ''"
          class="capitalize text-[10px] font-black px-3 rounded-full shrink-0"
          @click="statusFilter = s"
        >
          {{ s }}
        </Button>
      </div>
    </section>

    <!-- Listing -->
    <main class="p-4 flex-1 space-y-3">
      <div v-if="loading" class="flex flex-col items-center justify-center py-20">
        <Loader2 class="size-8 animate-spin text-primary" />
      </div>

      <div v-else-if="filteredJobCards.length === 0" class="text-center py-20 text-muted-foreground">
        <p class="text-sm">No job cards match this criteria.</p>
      </div>

      <Card 
        v-for="jc in filteredJobCards" 
        :key="jc.id" 
        class="border shadow-sm hover:shadow-md transition-shadow cursor-pointer"
        @click="openDetails(jc)"
      >
        <CardContent class="p-4 space-y-3">
          <div class="flex justify-between items-start">
            <div class="min-w-0 flex items-start gap-3">
              <div class="size-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                <Briefcase class="size-5 text-[#ff8903]" />
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="text-[10px] font-black text-[#ff8903] tracking-tight">{{ getJobNum(jc) }}</span>
                  <Badge variant="outline" :class="['text-[8px] h-4 px-1.5 font-bold uppercase rounded', getPriorityStyle(getPriority(jc))]">
                    {{ getPriority(jc) }}
                  </Badge>
                </div>
                <h3 class="font-black text-sm tracking-tight text-foreground truncate max-w-[170px] mt-0.5">{{ getJobTitle(jc) }}</h3>
                <p class="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[170px]">Client: {{ getRecipient(jc) }}</p>
              </div>
            </div>

            <Badge variant="outline" :class="['text-[9px] font-bold h-4 px-1.5 rounded shrink-0', statusBadgeStyle(jc.status)]">
              {{ getStatusLabel(jc.status) }}
            </Badge>
          </div>

          <div class="flex items-center justify-between border-t border-dashed pt-3 text-[10px] text-muted-foreground">
            <span class="flex items-center gap-1">
              <Calendar class="size-3.5" /> Start: {{ getStartDate(jc) }}
            </span>
            <div class="flex gap-4 text-right">
              <div>
                <span class="text-[8px] block uppercase text-muted-foreground">Invoice Value</span>
                <span class="font-black text-xs text-[#79c21b]">{{ fmt(getInvoiceValue(jc)) }}</span>
              </div>
              <div>
                <span class="text-[8px] block uppercase text-muted-foreground">Amount Due</span>
                <span v-if="getAmountDue(jc) <= 0" class="text-[8px] font-black text-green-500 bg-green-500/10 px-1 py-0.25 rounded uppercase">Paid</span>
                <span v-else class="font-black text-xs text-[#ff8903]">{{ fmt(getAmountDue(jc)) }}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </main>

    <!-- Details Dialog -->
    <div v-if="showModal" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <Card class="w-full max-w-lg bg-card border shadow-2xl rounded-3xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        <!-- Header -->
        <div class="p-4 border-b flex justify-between items-center shrink-0 bg-muted/20">
          <div>
            <h2 class="text-base font-black tracking-tight">Job Card Details</h2>
            <div class="flex items-center gap-1.5 flex-wrap mt-0.5">
              <span class="text-[10px] font-black text-[#ff8903]">{{ selectedJc ? getJobNum(selectedJc) : '' }}</span>
              <Badge variant="outline" :class="['text-[8px] h-4 px-1.5 font-bold uppercase rounded', selectedJc ? getPriorityStyle(getPriority(selectedJc)) : '']">
                {{ selectedJc ? getPriority(selectedJc) : 'MEDIUM' }}
              </Badge>
              <Badge variant="outline" :class="['text-[8px] h-4 px-1.5 font-bold uppercase rounded', selectedJc ? statusBadgeStyle(selectedJc.status) : '']">
                {{ selectedJc ? getStatusLabel(selectedJc.status) : '' }}
              </Badge>
            </div>
          </div>
          <Button variant="ghost" size="icon" class="rounded-full animate-hover" @click="closeDetails">
            <X class="size-5" />
          </Button>
        </div>

        <!-- Sub-system tabs selector -->
        <div class="px-4 py-2 border-b flex gap-1 overflow-x-auto no-scrollbar bg-muted/10 shrink-0">
          <button 
            v-for="tab in [
              { id: 'info', label: 'Info', icon: Info },
              { id: 'materials', label: 'IRD Inventory', icon: Package },
              { id: 'expenses', label: 'Expenses', icon: Receipt },
              { id: 'labor', label: 'Labor', icon: Briefcase },
              { id: 'tools', label: 'Tools', icon: Wrench },
              { id: 'financials', label: 'Financials', icon: PieChart }
            ]"
            :key="tab.id"
            @click="activeTab = tab.id as any"
            :class="[
              'flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-black tracking-tight shrink-0 transition-all border',
              activeTab === tab.id 
                ? 'bg-[#ff8903] text-white border-[#ff8903] shadow-sm' 
                : 'bg-card text-muted-foreground hover:text-foreground border-border'
            ]"
          >
            <component :is="tab.icon" class="size-3" />
            {{ tab.label }}
          </button>
        </div>

        <div class="p-5 overflow-y-auto space-y-6 flex-1 text-xs no-scrollbar">
          
          <!-- TAB 1: General Info & Timeline -->
          <div v-if="activeTab === 'info'" class="space-y-4 animate-in fade-in duration-200">
            <div class="space-y-3">
              <div class="flex items-center gap-1.5 border-b pb-1">
                <Info class="size-4 text-[#ff8903]" />
                <span class="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground">General Information</span>
              </div>

              <div class="grid grid-cols-2 gap-3 bg-muted/20 p-4 rounded-2xl border">
                <div>
                  <span class="block text-[8px] uppercase font-black text-muted-foreground/75">Job Number</span>
                  <span class="font-bold text-foreground">{{ selectedJc ? getJobNum(selectedJc) : '—' }}</span>
                </div>
                <div>
                  <span class="block text-[8px] uppercase font-black text-muted-foreground/75">Category</span>
                  <span class="font-bold text-foreground capitalize">{{ selectedJc ? resolveJobCategoryName(selectedJc.generalInfo?.jobCategoryId) : '—' }}</span>
                </div>
                <div v-if="selectedJc?.generalInfo?.linkedCrmNumber" class="mt-1">
                  <span class="block text-[8px] uppercase font-black text-muted-foreground/75">Linked CRM Document</span>
                  <span class="font-black text-[#ff8903] flex items-center gap-1">
                    {{ selectedJc.generalInfo.linkedCrmNumber }} 
                    <Badge variant="outline" class="text-[7px] h-3.5 px-1 uppercase font-black bg-[#ff8903]/10 border-[#ff8903]/20 text-[#ff8903]">
                      {{ selectedJc.generalInfo.linkedCrmType || 'QUOTE' }}
                    </Badge>
                  </span>
                </div>
                <div v-else class="mt-1">
                  <span class="block text-[8px] uppercase font-black text-muted-foreground/75">CRM Document</span>
                  <span class="font-bold text-muted-foreground">N/A</span>
                </div>
                <div class="mt-1">
                  <span class="block text-[8px] uppercase font-black text-muted-foreground/75">Start Date</span>
                  <span class="font-bold text-foreground">{{ selectedJc ? getStartDate(selectedJc) : '—' }}</span>
                </div>
                <div class="mt-1">
                  <span class="block text-[8px] uppercase font-black text-muted-foreground/75">Project Location</span>
                  <span class="font-bold text-foreground flex items-center gap-0.5">
                    <MapPin class="size-3 text-[#ff8903] shrink-0" /> {{ selectedJc ? getLocation(selectedJc) : '—' }}
                  </span>
                </div>
                <div class="mt-1">
                  <span class="block text-[8px] uppercase font-black text-muted-foreground/75">Structure Dimensions</span>
                  <span class="font-bold text-foreground">{{ selectedJc?.generalInfo?.dimensionsOfStructure || '—' }}</span>
                </div>
                <div class="mt-1">
                  <span class="block text-[8px] uppercase font-black text-muted-foreground/75">Recipient Name</span>
                  <span class="font-bold text-foreground">{{ selectedJc ? getRecipient(selectedJc) : '—' }}</span>
                </div>
                <div class="mt-1">
                  <span class="block text-[8px] uppercase font-black text-muted-foreground/75">Recipient Phone</span>
                  <span class="font-bold text-foreground">{{ selectedJc?.generalInfo?.recipientPhone || '—' }}</span>
                </div>
                <div class="mt-1 col-span-2">
                  <span class="block text-[8px] uppercase font-black text-muted-foreground/75">Ecocash / Bank Account</span>
                  <span class="font-bold text-foreground flex items-center gap-1">
                    <Briefcase class="size-3 text-[#ff8903] shrink-0" /> {{ selectedJc?.generalInfo?.ecocashOrBankAccount || '—' }}
                  </span>
                </div>
                <div v-if="selectedJc?.generalInfo?.recipientAddress" class="mt-1 col-span-2">
                  <span class="block text-[8px] uppercase font-black text-muted-foreground/75">Recipient Address</span>
                  <span class="font-bold text-foreground italic">{{ selectedJc.generalInfo.recipientAddress }}</span>
                </div>
              </div>

              <div v-if="selectedJc?.generalInfo?.projectDescription" class="bg-muted/10 p-3 rounded-2xl border border-dashed">
                <span class="block text-[8px] uppercase font-black text-muted-foreground/75 mb-1">Scope Description</span>
                <p class="text-[10px] text-muted-foreground leading-relaxed whitespace-pre-wrap">{{ selectedJc.generalInfo.projectDescription }}</p>
              </div>
            </div>

            <!-- Timeline Log -->
            <div v-if="selectedJc?.approvalTimeline && selectedJc.approvalTimeline.length > 0" class="space-y-2 pt-2">
              <div class="flex items-center gap-1.5 border-b pb-1">
                <Clock class="size-4 text-muted-foreground" />
                <span class="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground">Timeline Log</span>
              </div>
              
              <div class="space-y-2 border-l border-dashed border-muted-foreground/35 pl-3 ml-1">
                <div v-for="(log, idx) in selectedJc.approvalTimeline" :key="idx" class="relative text-[10px] space-y-0.5">
                  <span class="absolute -left-[17px] top-1 size-2 rounded-full bg-[#ff8903] animate-pulse" />
                  <div class="flex justify-between font-black">
                    <span>{{ log.user }} <span class="text-[8px] font-normal text-muted-foreground">({{ log.role }})</span></span>
                    <span class="text-[8px] text-muted-foreground">{{ log.date ? new Date(log.date).toLocaleDateString() : '' }}</span>
                  </div>
                  <p class="text-muted-foreground text-[9px]">{{ log.status }}</p>
                  <p v-if="log.comment" class="italic text-[9px] text-[#ff8903] bg-muted/20 p-1.5 rounded mt-0.5">"{{ log.comment }}"</p>
                </div>
              </div>
            </div>
          </div>

          <!-- TAB 2: IRD Inventory & Requisitions -->
          <div v-if="activeTab === 'materials'" class="space-y-4 animate-in fade-in duration-200">
            <div class="flex items-center gap-1.5 border-b pb-1">
              <Package class="size-4 text-[#ff8903]" />
              <span class="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground">IRD Inventory Requisitions</span>
            </div>
            
            <div v-if="selectedRequisitionItems.length === 0" class="text-center py-6 text-muted-foreground">No IRD inventory requisitions listed.</div>
            <div v-else class="space-y-3">
              <div v-for="(section, idx) in selectedRequisitionItems" :key="idx" class="border rounded-xl p-2.5 space-y-1.5 bg-muted/5">
                <p class="font-black text-[10px] uppercase text-[#ff8903] border-b pb-1 flex justify-between items-center">
                  <span>{{ resolveJobCategoryName(section.jobCategoryId) }}</span>
                  <span v-if="section.description" class="text-[8px] font-normal text-muted-foreground normal-case">{{ section.description }}</span>
                </p>
                <div v-if="!section.items || section.items.length === 0" class="text-muted-foreground text-[9px] italic">No items.</div>
                <div v-else class="space-y-2">
                  <div v-for="(item, i_idx) in section.items" :key="i_idx" class="bg-card border rounded-xl p-2.5 shadow-sm space-y-2">
                    <div class="flex justify-between items-start">
                      <div class="min-w-0">
                        <h4 class="font-black text-[10px] text-foreground leading-tight">{{ item.itemName }}</h4>
                        <p class="text-[8px] text-muted-foreground mt-0.5">
                          Qty: <span class="font-bold text-foreground">{{ item.qty }}</span> ea &middot; Cost: {{ fmt(item.costSnapshot) }}
                        </p>
                        <span v-if="item.createdAt" class="block text-[8px] text-yellow-500 italic mt-0.5">Added: {{ formatDate(item.createdAt) }}</span>
                      </div>
                      <div class="text-right">
                        <span class="block font-black text-[10px] text-[#79c21b]">{{ fmt(item.rowGrandTot || item.totalCost || (item.qty * item.irdSellingPrice)) }}</span>
                        <Badge variant="outline" :class="[
                          'text-[6px] h-3.5 px-1 mt-0.5 rounded font-black uppercase border-transparent',
                          item.approvalStatus === 'APPROVED_MANAGER' ? 'bg-green-500/10 text-green-500' :
                          item.approvalStatus === 'APPROVED_ACCOUNTANT' ? 'bg-yellow-500/10 text-yellow-500' :
                          item.approvalStatus === 'REJECTED' ? 'bg-rose-500/10 text-rose-500' : 'bg-muted text-muted-foreground'
                        ]">
                          {{ item.approvalStatus === 'APPROVED_MANAGER' ? 'Approved' : item.approvalStatus === 'APPROVED_ACCOUNTANT' ? 'Appr (Acct)' : item.approvalStatus || 'Pending' }}
                        </Badge>
                      </div>
                    </div>

                    <!-- Item action controls -->
                    <div v-if="!item.approvalStatus || (item.approvalStatus === 'APPROVED_ACCOUNTANT' && isManager)" class="flex gap-2 justify-end pt-1 border-t border-dashed">
                      <Button variant="outline" size="sm" class="h-6 text-[8px] font-bold text-rose-600 px-2 rounded-lg" :disabled="isSubmitting" @click="handleItemApproval('requisitionItems', item.id, 'REJECTED')">Reject</Button>
                      <Button v-if="isAccountant && !item.approvalStatus" variant="outline" size="sm" class="h-6 text-[8px] font-bold text-amber-500 px-2 rounded-lg" :disabled="isSubmitting" @click="handleItemApproval('requisitionItems', item.id, 'APPROVED_ACCOUNTANT')">Appr (Acct)</Button>
                      <Button v-if="isManager" variant="outline" size="sm" class="h-6 text-[8px] font-bold text-green-600 px-2 rounded-lg" :disabled="isSubmitting" @click="handleItemApproval('requisitionItems', item.id, 'APPROVED_MANAGER')">Approve</Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Returns Sub-section -->
            <div class="space-y-2 pt-2">
              <div class="flex items-center gap-1.5 border-b pb-1">
                <Package class="size-4 text-emerald-500" />
                <span class="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground">Inventory Returns</span>
              </div>
              <div v-if="selectedInventoryReturns.length === 0" class="text-center py-4 text-[9px] text-muted-foreground bg-muted/5 rounded-xl border">No returns registered.</div>
              <div v-else class="space-y-2">
                <div v-for="ret in selectedInventoryReturns" :key="ret.id" class="bg-card border rounded-xl p-2.5 shadow-sm space-y-2">
                  <div class="flex justify-between items-start">
                    <div>
                      <h4 class="font-bold text-[10px] text-foreground leading-tight">{{ ret.itemName }}</h4>
                      <p class="text-[8px] text-muted-foreground">Qty: {{ ret.qtyReturned }}</p>
                    </div>
                    <div class="text-right">
                      <span class="block font-bold text-[10px] text-foreground">{{ fmt(ret.purchaseCostSnapshot * ret.qtyReturned) }}</span>
                      <Badge variant="outline" :class="['text-[6px] h-3.5 px-1 mt-0.5 border-transparent uppercase font-black', ret.approvalStatus === 'APPROVED_MANAGER' ? 'bg-green-500/10 text-green-500' : 'bg-muted text-muted-foreground']">{{ ret.approvalStatus || 'Pending' }}</Badge>
                    </div>
                  </div>
                  <div v-if="!ret.approvalStatus || (ret.approvalStatus === 'APPROVED_ACCOUNTANT' && isManager)" class="flex gap-2 justify-end pt-1 border-t border-dashed">
                    <Button variant="outline" size="sm" class="h-6 text-[8px] text-rose-500 px-2 rounded-lg" :disabled="isSubmitting" @click="handleItemApproval('inventoryReturns', ret.id, 'REJECTED')">Reject</Button>
                    <Button v-if="isAccountant && !ret.approvalStatus" variant="outline" size="sm" class="h-6 text-[8px] text-amber-500 px-2 rounded-lg" :disabled="isSubmitting" @click="handleItemApproval('inventoryReturns', ret.id, 'APPROVED_ACCOUNTANT')">Appr (Acct)</Button>
                    <Button v-if="isManager" variant="outline" size="sm" class="h-6 text-[8px] text-green-500 px-2 rounded-lg" :disabled="isSubmitting" @click="handleItemApproval('inventoryReturns', ret.id, 'APPROVED_MANAGER')">Appr (Mgr)</Button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- TAB 3: Ad-hoc Expenses -->
          <div v-if="activeTab === 'expenses'" class="space-y-4 animate-in fade-in duration-200">
            <div class="flex items-center gap-1.5 border-b pb-1">
              <Receipt class="size-4 text-[#ff8903]" />
              <span class="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground">Ad-hoc Expenses</span>
            </div>
            
            <div v-if="selectedAdHocExpenses.length === 0" class="text-center py-6 text-muted-foreground">No ad-hoc expenses logged.</div>
            <div v-else class="space-y-2">
              <div v-for="exp in selectedAdHocExpenses" :key="exp.id" class="bg-card border rounded-xl p-3 shadow-sm space-y-2">
                <div class="flex justify-between items-start gap-2">
                  <div class="min-w-0">
                    <h4 class="font-black text-[10px] text-foreground leading-tight">{{ exp.description || 'Ad-hoc Expense' }}</h4>
                    <p class="text-[8px] text-muted-foreground mt-0.5">Pay: <span class="font-bold">{{ exp.paymentMethod || 'cash' }}</span> &middot; Ref: {{ exp.paymentReference || 'N/A' }}</p>
                    <span v-if="exp.createdAt" class="block text-[8px] text-yellow-500 italic mt-0.5">Added: {{ formatDate(exp.createdAt) }}</span>
                  </div>
                  <div class="text-right shrink-0">
                    <span class="block font-black text-[10px] text-foreground">{{ fmt(exp.totalAmount) }}</span>
                    <Badge variant="outline" :class="[
                      'text-[6px] h-3.5 px-1 mt-0.5 rounded font-black uppercase border-transparent',
                      exp.approvalStatus === 'APPROVED_MANAGER' ? 'bg-green-500/10 text-green-500' :
                      exp.approvalStatus === 'APPROVED_ACCOUNTANT' ? 'bg-yellow-500/10 text-yellow-500' :
                      exp.approvalStatus === 'REJECTED' ? 'bg-rose-500/10 text-rose-500' : 'bg-muted text-muted-foreground'
                    ]">
                      {{ exp.approvalStatus === 'APPROVED_MANAGER' ? 'Approved' : exp.approvalStatus === 'APPROVED_ACCOUNTANT' ? 'Appr (Acct)' : exp.approvalStatus || 'Pending' }}
                    </Badge>
                  </div>
                </div>

                <div v-if="(exp.attachmentUrls && exp.attachmentUrls.length > 0) || exp.attachmentUrl" class="bg-muted/10 p-1.5 rounded-lg border border-dashed flex flex-col gap-1 text-[8px]">
                  <span class="text-muted-foreground font-semibold">Receipt Attachment(s)</span>
                  <div class="flex flex-wrap gap-1.5">
                    <template v-if="exp.attachmentUrls && exp.attachmentUrls.length > 0">
                      <a v-for="(url, idx) in exp.attachmentUrls" :key="idx" 
                        :href="url" target="_blank"
                        :title="getFileName(url)"
                        class="font-black text-[#ff8903] hover:underline bg-[#ff8903]/10 px-1.5 py-0.5 rounded border border-[#ff8903]/20"
                      >
                        Doc {{ Number(idx) + 1 }}
                      </a>
                    </template>
                    <a v-else :href="exp.attachmentUrl" target="_blank"
                      class="font-black text-[#ff8903] hover:underline bg-[#ff8903]/10 px-1.5 py-0.5 rounded border border-[#ff8903]/20"
                    >
                      View Receipt
                    </a>
                  </div>
                </div>

                <div v-if="!exp.approvalStatus || (exp.approvalStatus === 'APPROVED_ACCOUNTANT' && isManager)" class="flex gap-2 justify-end pt-1 border-t border-dashed">
                  <Button variant="outline" size="sm" class="h-6 text-[8px] font-bold text-rose-500 px-2 rounded-lg" :disabled="isSubmitting" @click="handleItemApproval('adHocExpenses', exp.id, 'REJECTED')">Reject</Button>
                  <Button v-if="isAccountant && !exp.approvalStatus" variant="outline" size="sm" class="h-6 text-[8px] font-bold text-amber-500 px-2 rounded-lg" :disabled="isSubmitting" @click="handleItemApproval('adHocExpenses', exp.id, 'APPROVED_ACCOUNTANT')">Appr (Acct)</Button>
                  <Button v-if="isManager" variant="outline" size="sm" class="h-6 text-[8px] font-bold text-green-500 px-2 rounded-lg" :disabled="isSubmitting" @click="handleItemApproval('adHocExpenses', exp.id, 'APPROVED_MANAGER')">Appr (Mgr)</Button>
                </div>
              </div>
            </div>
          </div>

          <!-- TAB 4: Labor & Referrer Commissions -->
          <div v-if="activeTab === 'labor'" class="space-y-4 animate-in fade-in duration-200">
            <div class="space-y-2">
              <div class="flex items-center gap-1.5 border-b pb-1">
                <Briefcase class="size-4 text-[#ff8903]" />
                <span class="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground">Staff Rates</span>
              </div>
              <div v-if="selectedStaffRates.length === 0" class="text-center py-4 text-[9px] text-muted-foreground bg-muted/5 rounded-xl border">No staff rates allocated.</div>
              <div v-else class="space-y-2">
                <div v-for="rate in selectedStaffRates" :key="rate.id" class="bg-card border rounded-xl p-2.5 shadow-sm space-y-2">
                  <div class="flex justify-between items-start">
                    <div>
                      <h4 class="font-bold text-[9px] text-foreground">Employee: {{ getEmployeeName(rate.employeeId) }}</h4>
                      <p class="text-[8px] text-muted-foreground">Pay Method: {{ rate.paymentMethod || 'CASH' }}</p>
                      <span v-if="rate.createdAt" class="block text-[8px] text-yellow-500 italic mt-0.5">Added: {{ formatDate(rate.createdAt) }}</span>
                    </div>
                    <div class="text-right">
                      <span class="block font-black text-[10px] text-foreground">{{ fmt(rate.jobRateAmount) }}</span>
                      <Badge variant="outline" :class="[
                        'text-[6px] h-3.5 px-1 mt-0.5 rounded font-black uppercase border-transparent',
                        rate.approvalStatus === 'APPROVED' || rate.approvalStatus === 'APPROVED_MANAGER' ? 'bg-green-500/10 text-green-500' : 'bg-muted text-muted-foreground'
                      ]">{{ rate.approvalStatus || 'Pending' }}</Badge>
                    </div>
                  </div>
                  <div v-if="!rate.approvalStatus || (rate.approvalStatus === 'APPROVED_ACCOUNTANT' && isManager)" class="flex gap-2 justify-end pt-1 border-t border-dashed">
                    <Button variant="outline" size="sm" class="h-6 text-[8px] text-rose-500 px-2 rounded-lg" :disabled="isSubmitting" @click="handleItemApproval('staffRates', rate.id, 'REJECTED')">Reject</Button>
                    <Button v-if="isAccountant && !rate.approvalStatus" variant="outline" size="sm" class="h-6 text-[8px] text-amber-500 px-2 rounded-lg" :disabled="isSubmitting" @click="handleItemApproval('staffRates', rate.id, 'APPROVED_ACCOUNTANT')">Appr (Acct)</Button>
                    <Button v-if="isManager" variant="outline" size="sm" class="h-6 text-[8px] text-green-500 px-2 rounded-lg" :disabled="isSubmitting" @click="handleItemApproval('staffRates', rate.id, 'APPROVED_MANAGER')">Approve</Button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Referrers Sub-section -->
            <div class="space-y-2 pt-2">
              <div class="flex items-center gap-1.5 border-b pb-1">
                <Briefcase class="size-4 text-emerald-500" />
                <span class="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground">Referrer Commissions</span>
              </div>
              <div v-if="selectedReferrers.length === 0" class="text-center py-4 text-[9px] text-muted-foreground bg-muted/5 rounded-xl border">No referrer commissions.</div>
              <div v-else class="space-y-2">
                <div v-for="comm in selectedReferrers" :key="comm.id" class="bg-card border rounded-xl p-2.5 shadow-sm space-y-2">
                  <div class="flex justify-between items-start">
                    <div>
                      <h4 class="font-bold text-[9px] text-foreground">{{ comm.name || 'Anonymous' }}</h4>
                      <p class="text-[8px] text-muted-foreground">Pay: {{ comm.paymentMethod || 'cash' }}</p>
                      <span v-if="comm.createdAt" class="block text-[8px] text-yellow-500 italic mt-0.5">Added: {{ formatDate(comm.createdAt) }}</span>
                    </div>
                    <div class="text-right">
                      <span class="block font-black text-[10px] text-foreground">{{ fmt(comm.amount) }}</span>
                      <Badge variant="outline" :class="['text-[6px] h-3.5 px-1 mt-0.5 border-transparent font-black uppercase', comm.approvalStatus === 'APPROVED_MANAGER' ? 'bg-green-500/10 text-green-500' : 'bg-muted text-muted-foreground']">{{ comm.approvalStatus || 'Pending' }}</Badge>
                    </div>
                  </div>
                  <div v-if="!comm.approvalStatus || (comm.approvalStatus === 'APPROVED_ACCOUNTANT' && isManager)" class="flex gap-2 justify-end pt-1 border-t border-dashed">
                    <Button variant="outline" size="sm" class="h-6 text-[8px] text-rose-500 px-2 rounded-lg" :disabled="isSubmitting" @click="handleRejectCommission(comm.id)">Reject</Button>
                    <Button v-if="isAccountant && !comm.approvalStatus" variant="outline" size="sm" class="h-6 text-[8px] text-amber-500 px-2 rounded-lg" :disabled="isSubmitting" @click="handleCommissionApproval(comm.id, 'APPROVED_ACCOUNTANT')">Appr (Acct)</Button>
                    <Button v-if="isManager" variant="outline" size="sm" class="h-6 text-[8px] text-green-500 px-2 rounded-lg" :disabled="isSubmitting" @click="handleCommissionApproval(comm.id, 'APPROVED_MANAGER')">Approve</Button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- TAB 5: Tools Registry -->
          <div v-if="activeTab === 'tools'" class="space-y-4 animate-in fade-in duration-200">
            <div class="flex items-center gap-1.5 border-b pb-1">
              <Wrench class="size-4 text-[#ff8903]" />
              <span class="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground">Allocated Tools</span>
            </div>

            <div v-if="isManager" class="bg-muted/10 p-2.5 rounded-xl border border-dashed space-y-2">
              <span class="text-[8px] font-bold text-muted-foreground uppercase">Quick Tool Allocation</span>
              <div class="flex gap-1.5">
                <select v-model="selectedToolId" class="flex-1 h-7 rounded-lg border bg-card text-[9px] px-1 outline-none">
                  <option value="" disabled selected>Select tool to allocate...</option>
                  <option v-for="t in toolsRegistryList.filter(x => !(selectedJc?.allocatedTools || []).some((a: any) => a.toolId === x.id))" :key="t.id" :value="t.id">{{ t.name }} ({{ t.serialNumber }})</option>
                </select>
                <Button size="sm" class="h-7 text-[8px] px-2.5 bg-[#ff8903] text-white" :disabled="!selectedToolId || isSubmitting" @click="handleAllocateTool">Allocate</Button>
              </div>
            </div>

            <div v-if="!(selectedJc?.allocatedTools) || selectedJc.allocatedTools.length === 0" class="text-center py-6 text-muted-foreground italic">No tools allocated to this Job Card.</div>
            <div v-else class="space-y-2">
              <div v-for="tool in selectedJc.allocatedTools" :key="tool.id" class="bg-card border rounded-xl p-2.5 shadow-sm space-y-2">
                <div class="flex justify-between items-start">
                  <div>
                    <h4 class="font-bold text-[10px] leading-tight text-foreground">{{ tool.name }}</h4>
                    <p class="text-[8px] text-muted-foreground">S/N: {{ tool.serialNumber || 'N/A' }}</p>
                  </div>
                  <div class="flex flex-col items-end gap-1">
                    <Badge variant="outline" :class="[
                      'text-[6px] h-3.5 px-1 border-transparent uppercase font-black',
                      tool.state === 'Returned' ? 'bg-green-500/10 text-green-500' :
                      tool.state === 'Damaged' ? 'bg-rose-500/10 text-rose-500' : 'bg-blue-500/10 text-blue-500'
                    ]">{{ tool.state || 'Allocated' }}</Badge>
                    <Button v-if="isManager" variant="ghost" size="icon" class="h-5 w-5 text-rose-500" :disabled="isSubmitting" @click="handleDeallocateTool(tool.id)"><Trash2 class="size-3" /></Button>
                  </div>
                </div>

                <div v-if="isManager" class="flex justify-between items-center gap-1 pt-1.5 border-t border-dashed text-[8px]">
                  <span class="text-muted-foreground">Toggle State:</span>
                  <div class="flex gap-1">
                    <button v-for="s in ['Allocated', 'Returned', 'Damaged']" :key="s" class="px-1.5 py-0.5 rounded border text-[7px]" :class="tool.state === s ? 'bg-primary text-white font-bold' : 'bg-card text-muted-foreground'" :disabled="isSubmitting" @click="handleUpdateToolState(tool.id, s as any)">{{ s }}</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- TAB 6: Financial Performance -->
          <div v-if="activeTab === 'financials' && selectedFinancials" class="space-y-4 animate-in fade-in duration-200">
            <div class="flex items-center gap-1.5 border-b pb-1">
              <PieChart class="size-4 text-[#79c21b]" />
              <span class="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground">Financial Performance</span>
            </div>

            <!-- headline grid -->
            <div class="grid grid-cols-2 gap-2">
              <Card class="bg-card border p-2 flex flex-col justify-between">
                <div>
                  <p class="text-[8px] font-black uppercase text-muted-foreground/80">Invoice Value</p>
                  <p class="text-xs font-black text-foreground">{{ fmt(selectedFinancials.totalRevenue) }}</p>
                </div>
              </Card>
              <Card class="bg-card border p-2 flex flex-col justify-between">
                <div>
                  <p class="text-[8px] font-black uppercase text-rose-500">Direct Costs</p>
                  <p class="text-xs font-black text-rose-500">{{ fmt(selectedFinancials.totalCost) }}</p>
                </div>
              </Card>
              <Card :class="['border p-2 flex flex-col justify-between', selectedFinancials.netProfit >= 0 ? 'bg-[#79c21b]/5 border-[#79c21b]/20' : 'bg-rose-500/5 border-rose-500/10']">
                <div>
                  <p :class="['text-[8px] font-black uppercase', selectedFinancials.netProfit >= 0 ? 'text-[#79c21b]' : 'text-rose-500']">Net Profit</p>
                  <p :class="['text-xs font-black', selectedFinancials.netProfit >= 0 ? 'text-[#79c21b]' : 'text-rose-500']">{{ fmt(selectedFinancials.netProfit) }}</p>
                </div>
              </Card>
              <Card class="bg-card border p-2 flex flex-col justify-between">
                <div>
                  <p class="text-[8px] font-black uppercase text-muted-foreground/80">Profit Margin</p>
                  <p class="text-xs font-black text-foreground">{{ selectedFinancials.profitMargin.toFixed(1) }}%</p>
                </div>
              </Card>
            </div>

            <!-- balanced formula metric grid -->
            <div class="grid grid-cols-2 gap-1.5 text-[9px] bg-muted/20 p-2.5 rounded-xl border">
              <div class="flex justify-between">
                <span class="text-muted-foreground">Initial Invoice:</span>
                <span class="font-bold">{{ fmt(selectedFinancials.initialInvoiceValue) }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">Gross Oper.:</span>
                <span class="font-bold text-rose-500">{{ fmt(selectedFinancials.totalOperationalGross) }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">TWID Net:</span>
                <span class="font-bold text-[#79c21b]">{{ fmt(selectedFinancials.twidNetAfterAdjustments) }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">TWID Rev %:</span>
                <span class="font-bold">{{ selectedFinancials.twidRevenuePercentage.toFixed(1) }}%</span>
              </div>
            </div>

            <!-- IRD inventory block -->
            <div class="border rounded-xl p-2.5 bg-muted/10 border-dashed space-y-1.5">
              <span class="block text-[8px] font-black text-muted-foreground uppercase">IRD Remittance Inventory Formula</span>
              <div class="grid grid-cols-2 gap-1.5 text-[9px]">
                <div class="flex justify-between">
                  <span class="text-muted-foreground">IRD Inventory Gross:</span>
                  <span class="font-bold text-rose-600">{{ fmt(selectedFinancials.irdGrossRevenue) }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-muted-foreground">IRD Purchasing Cost:</span>
                  <span class="font-bold">{{ fmt(selectedFinancials.irdBaseCost) }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-muted-foreground">IRD Net Profit:</span>
                  <span class="font-bold">{{ fmt(selectedFinancials.irdCumulativeNetRevenue) }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-muted-foreground">IRD Margin %:</span>
                  <span class="font-bold">{{ selectedFinancials.irdRevenuePercentage.toFixed(1) }}%</span>
                </div>
              </div>
            </div>

            <!-- breakdowns -->
            <div class="grid grid-cols-2 gap-3 text-[9px] pt-1">
              <div class="space-y-1">
                <h5 class="font-black border-b pb-0.5 text-muted-foreground">REVENUE</h5>
                <div class="flex justify-between"><span>Inventory Sales</span><span class="font-bold">{{ fmt(selectedFinancials.irdGrossRevenue) }}</span></div>
                <div class="flex justify-between"><span>Labor & Exp Billed</span><span class="font-bold">{{ fmt(selectedFinancials.implementationCost) }}</span></div>
                <div class="mt-1 bg-blue-500/5 p-1 rounded border text-[8px] flex justify-between">
                  <span class="text-blue-600 font-bold">IRD Remit</span><span class="font-black text-blue-600">{{ fmt(selectedFinancials.irdNetRevenue) }}</span>
                </div>
              </div>
              <div class="space-y-1">
                <h5 class="font-black border-b pb-0.5 text-muted-foreground">COSTS</h5>
                <div class="flex justify-between"><span>Inventory Base</span><span class="font-bold">{{ fmt(selectedFinancials.irdBaseCost) }}</span></div>
                <div class="flex justify-between"><span>Staff & Labor</span><span class="font-bold">{{ fmt(selectedStaffRates.reduce((s, r) => s + (r.jobRateAmount || 0), 0)) }}</span></div>
                <div class="flex justify-between"><span>Ad-hoc Expenses</span><span class="font-bold">{{ fmt(selectedFinancials.operationalExpenses + selectedFinancials.adjustmentAdhoc) }}</span></div>
                <div v-if="selectedFinancials.referrerCommission > 0" class="flex justify-between">
                  <span>Referrer Commission</span>
                  <span class="font-bold text-amber-600">{{ fmt(selectedFinancials.referrerCommission) }}</span>
                </div>
              </div>
            </div>

            <!-- benchmarks & payment collections -->
            <div class="border-t border-dashed pt-2.5 grid grid-cols-3 gap-1.5 text-[8px]">
              <div class="bg-blue-500/5 p-1.5 rounded-lg border text-center">
                <span class="text-muted-foreground uppercase block text-[7px]">Collected</span>
                <span class="font-black text-blue-600 block mt-0.5 text-[9px]">{{ fmt(selectedTotalPaid) }}</span>
              </div>
              <div class="p-1.5 rounded-lg border text-center" :class="selectedIsFullyPaid ? 'bg-green-500/5' : 'bg-amber-500/5'">
                <span class="text-muted-foreground uppercase block text-[7px]">Outstanding</span>
                <span class="font-black block mt-0.5 text-[9px]" :class="selectedIsFullyPaid ? 'text-green-500' : 'text-amber-500'">{{ fmt(selectedBalanceDue) }}</span>
              </div>
              <div class="p-1.5 rounded-lg border flex flex-col justify-center">
                <span class="text-muted-foreground uppercase block text-[7px] text-center">Paid Rate</span>
                <div class="h-1 w-full rounded-full bg-muted overflow-hidden mt-1">
                  <div class="h-full bg-blue-500" :style="{ width: selectedPaymentProgress.toFixed(1) + '%' }" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="p-4 border-t flex gap-3 shrink-0 bg-muted/10">
          <Button variant="outline" class="flex-1 rounded-xl h-10 font-bold" @click="closeDetails">Close</Button>
          
          <template v-if="selectedJc?.status === 'APPROVAL_PENDING_MANAGER' || selectedJc?.status === 'SUBMITTED'">
            <Button 
              variant="destructive"
              class="flex-1 rounded-xl h-10 font-bold bg-red-600 hover:bg-red-700 text-white"
              :disabled="isSubmitting"
              @click="handleReject"
            >
              <XCircle class="size-4 mr-1.5 shrink-0" /> Reject
            </Button>
            <Button 
              class="flex-1 rounded-xl h-10 font-bold bg-green-600 hover:bg-green-700 text-white"
              :disabled="isSubmitting"
              @click="handleApprove"
            >
              <Loader2 v-if="isSubmitting" class="size-4 animate-spin mr-1" />
              <CheckCircle2 v-else class="size-4 mr-1.5 shrink-0" /> Approve
            </Button>
          </template>
        </div>
      </Card>
    </div>
  </div>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
