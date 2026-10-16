'use client'

import { create } from 'zustand'
import { db, auth } from '@/lib/firebase'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  writeBatch,
  runTransaction,
  limit
} from 'firebase/firestore'
import { toast } from 'sonner'
import { cascadeDeleteAdHocExpense } from '@/lib/cascadeDeleteAdHocExpense'

export interface JobCardRequisitionItem {
  id: string
  itemName: string
  inventoryItemId?: string
  qty: number
  qtyRequired?: number
  irdSellingPrice?: number
  costSnapshot?: number
  twidMarkupPercent?: number
  rowIRDTot?: number
  rowMUTot?: number
  rowGrandTot?: number
  approvalStatus?: string
  approvedAt?: string
  inventoryDeducted?: boolean
  jobCategoryId?: string
  createdAt?: any
}

export interface JobCardRequisitionSection {
  title?: string
  jobCategoryId?: string
  description?: string
  items?: JobCardRequisitionItem[]
}

export interface JobCardStaffRate {
  id: string
  employeeId: string
  jobRateAmount: number
  paymentMethod?: string
  approvalStatus?: string
  approvedAt?: string
  createdAt?: any
}

export interface JobCardAdHocExpense {
  id: string
  description?: string
  totalAmount: number
  quantity?: number
  unitPrice?: number
  paymentMethod?: string
  paymentReference?: string
  attachmentUrl?: string
  attachmentUrls?: string[]
  approvalStatus?: string
  approvedAt?: string
  createdAt?: any
}

export interface JobCardReturn {
  id: string
  itemName: string
  qtyReturned: number
  purchaseCostSnapshot: number
  inventoryItemId?: string
  approvalStatus?: string
  approvedAt?: string
  inventoryReturned?: boolean
  updatedAt?: any
}

export interface JobCardToolAllocation {
  id: string
  toolId: string
  name: string
  serialNumber: string
  state: 'Allocated' | 'Returned' | 'Damaged'
  allocatedAt: string
  returnedAt: string | null
}

export interface JobCardReferrer {
  id: string
  name: string
  amount: number
  paymentMethod?: string
  approvalStatus?: string
  approvedAt?: string
  createdAt?: any
}

export interface JobCardApprovalTimeline {
  user: string
  role?: string
  status: string
  comment?: string
  date: string
}

export interface JobCardGeneralInfo {
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
  referrers?: JobCardReferrer[]
}

export interface JobCardTotals {
  grandTotal?: number
  implementationCost?: number
  inventoryIRDTotal?: number
  inventoryMUTotal?: number
  adHocTotal?: number
  staffRatesTotal?: number
  overallGrandTotal?: number
  inventoryIMPCostTotal?: number
}

export interface JobCard {
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
  generalInfo?: JobCardGeneralInfo
  totals?: JobCardTotals
  summary?: any
  requisitionSections?: JobCardRequisitionSection[]
  staffRates?: JobCardStaffRate[]
  adHocExpenses?: JobCardAdHocExpense[]
  inventoryReturns?: JobCardReturn[]
  allocatedTools?: JobCardToolAllocation[]
  approvalTimeline?: JobCardApprovalTimeline[]
  updatedAt?: any
  createdAt?: any
  createdBy?: any
  updatedBy?: any
}

export interface JobCardFilters {
  search?: string
  status?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface JobCardsState {
  items: JobCard[]
  selectedItem: JobCard | null
  categories: any[]
  toolsRegistry: any[]
  employees: Map<string, any>
  selectedRequisitionItems: JobCardRequisitionSection[]
  selectedAdHocExpenses: JobCardAdHocExpense[]
  selectedStaffRates: JobCardStaffRate[]
  selectedInventoryReturns: JobCardReturn[]
  selectedPayments: any[]
  selectedReferrers: JobCardReferrer[]
  loading: boolean
  error: string | null
  showModal: boolean
  activeTab: 'info' | 'materials' | 'expenses' | 'labor' | 'tools' | 'financials'

  subscriptions: (() => void)[]
  detailSubscriptions: (() => void)[]

  getJobNum: (jc: JobCard) => string
  getJobTitle: (jc: JobCard) => string
  getRecipient: (jc: JobCard) => string
  getStartDate: (jc: JobCard) => string
  getLocation: (jc: JobCard) => string
  getPriority: (jc: JobCard) => string
  getInvoiceValue: (jc: JobCard) => number
  getAmountDue: (jc: JobCard) => number
  getStatusLabel: (status: string) => string
  statusBadgeStyle: (status: string) => string
  getPriorityStyle: (priority: string) => string
  resolveJobCategoryName: (id?: string) => string
  getEmployeeName: (id?: string) => string

  fetchItems: () => () => void
  fetchCategories: () => () => void
  fetchToolsRegistry: () => () => void
  fetchEmployees: () => () => void
  
  openDetails: (jc: JobCard) => void
  closeDetails: () => void
  
  approveJobCard: () => Promise<void>
  rejectJobCard: () => Promise<void>
  
  handleItemApproval: (
    arrayField: 'requisitionItems' | 'adHocExpenses' | 'inventoryReturns' | 'staffRates',
    itemId: string,
    newStatus: 'APPROVED_ACCOUNTANT' | 'APPROVED_MANAGER' | 'REJECTED'
  ) => Promise<void>
  
  handleCommissionApproval: (commissionId: string, targetStatus: 'APPROVED_ACCOUNTANT' | 'APPROVED_MANAGER') => Promise<void>
  handleRejectCommission: (commissionId: string) => Promise<void>
  handleUpdateToolState: (toolId: string, newState: 'Allocated' | 'Returned' | 'Damaged') => Promise<void>
  handleDeallocateTool: (toolId: string) => Promise<void>
  handleAllocateTool: (toolId: string) => Promise<void>
  
  cleanup: () => void
}

const fmt = (n: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(n || 0)
}

export const useJobCardsStore = create<JobCardsState>((set, get) => ({
  items: [],
  selectedItem: null,
  categories: [],
  toolsRegistry: [],
  employees: new Map(),
  selectedRequisitionItems: [],
  selectedAdHocExpenses: [],
  selectedStaffRates: [],
  selectedInventoryReturns: [],
  selectedPayments: [],
  selectedReferrers: [],
  loading: false,
  error: null,
  showModal: false,
  activeTab: 'info',
  subscriptions: [],
  detailSubscriptions: [],

  getJobNum: (jc: JobCard) => jc.generalInfo?.jobNumber || jc.jobNumber || jc.id.substring(0, 8).toUpperCase(),
  getJobTitle: (jc: JobCard) => jc.generalInfo?.jobTitle || jc.jobTitle || 'Untitled Job Card',
  getRecipient: (jc: JobCard) => jc.generalInfo?.recipientName || jc.customerName || 'Unknown Recipient',
  getStartDate: (jc: JobCard) => jc.generalInfo?.startDate || '—',
  getLocation: (jc: JobCard) => jc.generalInfo?.projectLocation || '—',
  getPriority: (jc: JobCard) => jc.generalInfo?.priority || jc.priority || 'MEDIUM',

  getInvoiceValue: (jc: JobCard) => {
    if (jc.generalInfo?.linkedCrmTotal != null && jc.generalInfo.linkedCrmTotal > 0) return jc.generalInfo.linkedCrmTotal
    if (jc.generalInfo?.jobInvoiceValue != null && jc.generalInfo.jobInvoiceValue > 0) return jc.generalInfo.jobInvoiceValue
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
  },

  getAmountDue: (jc: JobCard) => {
    const invoiceValue = get().getInvoiceValue(jc)
    const paid = jc.totalPaid || 0
    return Math.max(0, invoiceValue - paid)
  },

  getStatusLabel: (status: string) => {
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
  },

  statusBadgeStyle: (status: string) => {
    if (['APPROVED', 'APPROVED_MANAGER', 'COMPLETED'].includes(status)) return 'bg-green-500/10 text-green-500 border-green-500/25'
    if (['SUBMITTED', 'APPROVAL_PENDING_MANAGER', 'APPROVAL_PENDING_ACCOUNTANT'].includes(status)) return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/25'
    if (status === 'IN_PROGRESS') return 'bg-blue-500/10 text-blue-500 border-blue-500/25'
    if (['REJECTED', 'CANCELLED'].includes(status)) return 'bg-red-500/10 text-red-500 border-red-500/25'
    return 'bg-muted/80 text-muted-foreground border-transparent'
  },

  getPriorityStyle: (priority: string) => {
    const p = priority.toUpperCase()
    if (p === 'URGENT' || p === 'HIGH') return 'bg-red-500/15 text-red-500 border-red-500/20'
    if (p === 'MEDIUM') return 'bg-yellow-500/15 text-yellow-500 border-yellow-500/20'
    return 'bg-green-500/15 text-green-500 border-green-500/20'
  },

  resolveJobCategoryName: (id?: string) => {
    if (!id) return '—'
    const found = get().categories.find(c => c.id === id)
    return found?.name || id
  },

  getEmployeeName: (id?: string) => {
    if (!id) return 'Unknown'
    const emp = get().employees.get(id)
    return emp?.fullName || emp?.name || id.substring(0, 8).toUpperCase()
  },

  fetchItems: () => {
    set({ loading: true })
    const q = query(collection(db, 'jobCards'))
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as JobCard))
      set({ items, loading: false })
    }, (err) => {
      console.error(err)
      set({ loading: false })
    })
    set((state) => ({ subscriptions: [...state.subscriptions, unsub] }))
    return unsub
  },

  fetchCategories: () => {
    const unsub = onSnapshot(collection(db, 'jobCategories'), (snap) => {
      set({ categories: snap.docs.map(d => ({ id: d.id, ...d.data() })) })
    }, (err) => console.error("Categories fetch error:", err))
    set((state) => ({ subscriptions: [...state.subscriptions, unsub] }))
    return unsub
  },

  fetchToolsRegistry: () => {
    const unsub = onSnapshot(collection(db, 'toolsRegistry'), (snap) => {
      set({ toolsRegistry: snap.docs.map(d => ({ id: d.id, ...d.data() })) })
    }, (err) => console.error("Tools registry fetch error:", err))
    set((state) => ({ subscriptions: [...state.subscriptions, unsub] }))
    return unsub
  },

  fetchEmployees: () => {
    const unsub = onSnapshot(collection(db, 'employees'), (snap) => {
      const map = new Map<string, any>()
      snap.docs.forEach(d => map.set(d.id, { id: d.id, ...d.data() }))
      set({ employees: map })
    }, (err) => console.error("Employees fetch error:", err))
    set((state) => ({ subscriptions: [...state.subscriptions, unsub] }))
    return unsub
  },

  openDetails: (jc: JobCard) => {
    set({
      selectedItem: jc,
      showModal: true,
      selectedRequisitionItems: [],
      selectedAdHocExpenses: [],
      selectedStaffRates: [],
      selectedInventoryReturns: [],
      selectedPayments: [],
      selectedReferrers: jc.generalInfo?.referrers || [],
      activeTab: 'info'
    })

    const state = get()
    state.detailSubscriptions.forEach(u => u())
    set({ detailSubscriptions: [] })

    const jobId = jc.id
    
    const subscriptions: (() => void)[] = []

    // Real-time document listener
    const unsubDoc = onSnapshot(doc(db, 'jobCards', jobId), (snap) => {
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() } as JobCard
        set({
          selectedItem: data,
          selectedReferrers: data.generalInfo?.referrers || []
        })
        if (Array.isArray(data.requisitionSections) && data.requisitionSections.length > 0) {
          set({ selectedRequisitionItems: data.requisitionSections })
        }
        if (Array.isArray(data.adHocExpenses) && data.adHocExpenses.length > 0) {
          set({ selectedAdHocExpenses: data.adHocExpenses })
        }
        if (Array.isArray(data.staffRates) && data.staffRates.length > 0) {
          set({ selectedStaffRates: data.staffRates })
        }
        if (Array.isArray(data.inventoryReturns) && data.inventoryReturns.length > 0) {
          set({ selectedInventoryReturns: data.inventoryReturns })
        }
      }
    }, (err) => console.error("Job Card fetch error:", err))
    subscriptions.push(unsubDoc)

    // Requisition Items
    const itemsRef = collection(db, 'jobCards', jobId, 'items')
    const unsubItems = onSnapshot(itemsRef, (snap) => {
      const state = get()
      const hasMainSections = state.selectedItem && Array.isArray(state.selectedItem.requisitionSections) && state.selectedItem.requisitionSections.length > 0
      if (!hasMainSections) {
        const rawItems = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        if (rawItems.length > 0) {
          const groups: Record<string, any> = {}
          rawItems.forEach((item: any) => {
            const catId = item.jobCategoryId || 'unassigned'
            if (!groups[catId]) {
              groups[catId] = { id: catId, jobCategoryId: catId === 'unassigned' ? '' : catId, description: '', items: [] }
            }
            groups[catId].items.push({
              ...item,
              itemName: item.itemName || item.inventoryItemName || 'Unnamed Item',
              qty: item.qty || item.qtyRequired || 0,
              irdSellingPrice: item.irdSellingPrice || item.irdSellingPriceSnapshot || 0,
              costSnapshot: item.costSnapshot || item.purchaseCostSnapshot || item.totalCostSnapshot || 0,
              twidMarkupPercent: item.twidMarkupPercent || item.markupPercent || 0,
              rowIRDTot: item.rowIRDTot || item.rowIRDTotal || 0,
              rowMUTot: item.rowMUTot || item.rowMUTotal || 0,
              rowGrandTot: item.rowGrandTot || item.rowGrandTotal || 0
            })
          })
          set({ selectedRequisitionItems: Object.values(groups) })
        }
      }
    }, (err) => console.error("Items fetch error:", err))
    subscriptions.push(unsubItems)

    // Ad-hoc Expenses
    const expRef = collection(db, 'jobCards', jobId, 'expenses')
    const unsubExp = onSnapshot(expRef, (snap) => {
      const state = get()
      const hasMainExpenses = state.selectedItem && Array.isArray(state.selectedItem.adHocExpenses) && state.selectedItem.adHocExpenses.length > 0
      if (!hasMainExpenses) {
        const rawExp = snap.docs.map(d => ({ id: d.id, ...d.data() } as any))
        if (rawExp.length > 0) {
          set({ selectedAdHocExpenses: rawExp.sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0)) })
        }
      }
    }, (err) => console.error("Expenses fetch error:", err))
    subscriptions.push(unsubExp)

    // Staff Rates
    const staffRef = collection(db, 'jobCards', jobId, 'staffRates')
    const unsubStaff = onSnapshot(staffRef, (snap) => {
      const state = get()
      const hasMainStaff = state.selectedItem && Array.isArray(state.selectedItem.staffRates) && state.selectedItem.staffRates.length > 0
      if (!hasMainStaff) {
        const rawStaff = snap.docs.map(d => ({ id: d.id, ...d.data() } as any))
        if (rawStaff.length > 0) {
          set({ selectedStaffRates: rawStaff.sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0)) })
        }
      }
    }, (err) => console.error("Staff rates fetch error:", err))
    subscriptions.push(unsubStaff)

    // Returns
    const retRef = collection(db, 'jobCards', jobId, 'returns')
    const unsubRet = onSnapshot(retRef, (snap) => {
      const state = get()
      const hasMainReturns = state.selectedItem && Array.isArray(state.selectedItem.inventoryReturns) && state.selectedItem.inventoryReturns.length > 0
      if (!hasMainReturns) {
        const rawRet = snap.docs.map(d => ({ id: d.id, ...d.data() } as any))
        if (rawRet.length > 0) {
          set({ selectedInventoryReturns: rawRet.sort((a, b) => (a.updatedAt?.toMillis?.() || 0) - (b.updatedAt?.toMillis?.() || 0)) })
        }
      }
    }, (err) => console.error("Returns fetch error:", err))
    subscriptions.push(unsubRet)

    // Payments
    const paymentsRef = collection(db, 'jobPayments')
    const paymentsQ = query(paymentsRef, where('jobCardId', '==', jobId))
    const unsubPayments = onSnapshot(paymentsQ, (snap) => {
      set({ selectedPayments: snap.docs.map(d => ({ id: d.id, ...d.data() })) })
    }, (err) => console.error("Payments fetch error:", err))
    subscriptions.push(unsubPayments)

    set({ detailSubscriptions: subscriptions })
  },

  closeDetails: () => {
    get().detailSubscriptions.forEach(u => u())
    set({
      showModal: false,
      selectedItem: null,
      selectedRequisitionItems: [],
      selectedAdHocExpenses: [],
      selectedStaffRates: [],
      selectedInventoryReturns: [],
      selectedPayments: [],
      selectedReferrers: [],
      detailSubscriptions: [],
      activeTab: 'info'
    })
  },

  approveJobCard: async () => {
    const { selectedItem } = get()
    if (!selectedItem) return
    try {
      const user = auth.currentUser
      const docRef = doc(db, 'jobCards', selectedItem.id)
      await updateDoc(docRef, {
        status: 'APPROVED_MANAGER',
        updatedAt: serverTimestamp(),
        approvalTimeline: arrayUnion({
          user: user?.displayName || 'Manager',
          role: 'MANAGER',
          status: 'Approved by Manager',
          date: new Date().toISOString()
        })
      })
      toast.success('Job Card Approved successfully!')
      set({ showModal: false })
    } catch (err: any) {
      console.error(err)
      toast.error('Failed to approve Job Card')
    }
  },

  rejectJobCard: async () => {
    const { selectedItem } = get()
    if (!selectedItem) return
    const comment = prompt('Enter a reason/comment for rejection:')
    if (comment === null) return
    try {
      const user = auth.currentUser
      const docRef = doc(db, 'jobCards', selectedItem.id)
      await updateDoc(docRef, {
        status: 'REJECTED',
        updatedAt: serverTimestamp(),
        approvalTimeline: arrayUnion({
          user: user?.displayName || 'Manager',
          role: 'MANAGER',
          status: 'Rejected by Manager',
          comment: comment || 'No comments provided',
          date: new Date().toISOString()
        })
      })
      toast.success('Job Card Rejected successfully.')
      set({ showModal: false })
    } catch (err: any) {
      console.error(err)
      toast.error('Failed to reject Job Card')
    }
  },

  handleItemApproval: async (arrayField, itemId, newStatus) => {
    const { selectedItem } = get()
    if (!selectedItem) return
    const jobId = selectedItem.id
    const user = auth.currentUser

    try {
      if (arrayField === 'requisitionItems') {
        const { selectedRequisitionItems } = get()
        const hasSubcollItems = selectedRequisitionItems.length > 0 && selectedRequisitionItems[0].items !== undefined
        if (hasSubcollItems) {
          const clonedSections = selectedRequisitionItems.map(s => ({ ...s, items: s.items?.map(i => ({ ...i })) }))
          let foundItem: any = null
          if (newStatus === 'REJECTED') {
            clonedSections.forEach(s => {
              s.items = s.items?.filter(i => {
                if (i.id === itemId) { foundItem = i; return false }
                return true
              })
            })
          } else {
            for (const section of clonedSections) {
              const item = section.items?.find(i => i.id === itemId)
              if (item) {
                item.approvalStatus = newStatus
                if (newStatus === 'APPROVED_MANAGER') item.approvedAt = new Date().toISOString()
                foundItem = item
                break
              }
            }
          }
          if (!foundItem) throw new Error('Item not found in sections')
          if (newStatus === 'APPROVED_MANAGER' && foundItem.inventoryItemId && !foundItem.inventoryDeducted) {
            const qty = Number(foundItem.qty || 0)
            if (qty > 0) {
              try {
                await adjustStock(foundItem.inventoryItemId, {
                  type: 'REMOVE', qty,
                  reason: `Item Approved: ${get().getJobNum(selectedItem)}`,
                  reference: selectedItem.id,
                  unitCost: Number(foundItem.costSnapshot || 0)
                })
                foundItem.inventoryDeducted = true
                toast.success('Stock Level Decreased')
              } catch (err: any) {
                toast.error('Stock Deduction Failed', { description: err.message })
              }
            }
          }
          if (foundItem.id) {
            const subDocRef = doc(db, 'jobCards', jobId, 'items', foundItem.id)
            if (newStatus === 'REJECTED') {
              await deleteDoc(subDocRef)
            } else {
              await updateDoc(subDocRef, { approvalStatus: foundItem.approvalStatus, approvedAt: foundItem.approvedAt || null, inventoryDeducted: foundItem.inventoryDeducted || false })
            }
          }
          const flattenedItems = clonedSections.flatMap(s => s.items?.map(i => ({ ...i, jobCategoryId: s.jobCategoryId })) || [])
          await updateDoc(doc(db, 'jobCards', jobId), { requisitionSections: clonedSections, requisitionItems: flattenedItems, updatedAt: serverTimestamp() })
        }
      } else if (arrayField === 'adHocExpenses') {
        const { selectedAdHocExpenses } = get()
        const clonedArray = selectedAdHocExpenses.map(i => ({ ...i }))
        const itemIndex = clonedArray.findIndex(i => i.id === itemId)
        if (itemIndex === -1) throw new Error('Expense item not found')
        const targetItem = clonedArray[itemIndex]
        if (newStatus === 'REJECTED') {
          if (targetItem.id) { try { await deleteDoc(doc(db, 'jobCards', jobId, 'expenses', targetItem.id)) } catch (e) {} }
          const filtered = clonedArray.filter(i => i.id !== itemId)
          await updateDoc(doc(db, 'jobCards', jobId), { adHocExpenses: filtered, updatedAt: serverTimestamp() })
          set({ selectedAdHocExpenses: filtered })
          try {
            await cascadeDeleteAdHocExpense({
              jobCardId: jobId,
              jobNumber: get().getJobNum(selectedItem),
              expense: targetItem,
              deletedBy: {
                uid: user?.uid,
                displayName: user?.displayName || user?.email || undefined,
                email: user?.email || undefined,
              },
              deletedVia: 'REJECT',
            })
          } catch (cascadeErr) {
            console.error('[handleItemApproval] Ad-hoc reject cascade failed:', cascadeErr)
          }
          toast.success('Ad-hoc Expense Rejected')
          return
        }
        clonedArray[itemIndex].approvalStatus = newStatus
        const amount = Number(targetItem.totalAmount || (targetItem.quantity || 0) * (targetItem.unitPrice || 0))
        if (newStatus === 'APPROVED_MANAGER') {
          clonedArray[itemIndex].approvedAt = new Date().toISOString()
        }
        if (targetItem.id) {
          await updateDoc(doc(db, 'jobCards', jobId, 'expenses', targetItem.id), { approvalStatus: clonedArray[itemIndex].approvalStatus, approvedAt: clonedArray[itemIndex].approvedAt || null })
        }
        await updateDoc(doc(db, 'jobCards', jobId), { adHocExpenses: clonedArray, updatedAt: serverTimestamp() })
        if (newStatus === 'APPROVED_MANAGER') {
          const jobIdentifier = get().getJobNum(selectedItem)
          await addDoc(collection(db, 'operationalExpenses'), {
            category: 'job-card-expense', amount,
            paymentMethod: (targetItem.paymentMethod || 'cash').toLowerCase(),
            description: `Job Card ${jobIdentifier} - ${targetItem.description || 'Ad-hoc expense'}`,
            attachmentUrl: (targetItem.attachmentUrls && targetItem.attachmentUrls[0]) || targetItem.attachmentUrl || null,
            attachmentUrls: targetItem.attachmentUrls || (targetItem.attachmentUrl ? [targetItem.attachmentUrl] : []),
            status: 'APPROVED', sourceJobId: jobId, sourceItemId: targetItem.id,
            createdAt: serverTimestamp()
          })
          toast.success('Expense Posted to Ledger')
        }
      } else if (arrayField === 'inventoryReturns') {
        const { selectedInventoryReturns } = get()
        const clonedArray = selectedInventoryReturns.map(i => ({ ...i }))
        const itemIndex = clonedArray.findIndex(i => i.id === itemId)
        if (itemIndex === -1) throw new Error('Return item not found')
        const targetItem = clonedArray[itemIndex]
        if (newStatus === 'REJECTED') {
          if (targetItem.id) { try { await deleteDoc(doc(db, 'jobCards', jobId, 'returns', targetItem.id)) } catch (e) {} }
          await updateDoc(doc(db, 'jobCards', jobId), { inventoryReturns: clonedArray.filter(i => i.id !== itemId), updatedAt: serverTimestamp() })
          toast.success('Return Record Rejected')
          return
        }
        clonedArray[itemIndex].approvalStatus = newStatus
        if (newStatus === 'APPROVED_MANAGER' && targetItem.inventoryItemId && !targetItem.inventoryReturned) {
          try {
            const qty = Number(targetItem.qtyReturned || 0)
            await adjustStock(targetItem.inventoryItemId, { type: 'ADD', qty, reason: `Return from Job ${get().getJobNum(selectedItem)}`, reference: selectedItem.id })
            clonedArray[itemIndex].inventoryReturned = true
            clonedArray[itemIndex].approvedAt = new Date().toISOString()
            toast.success('Inventory Restocked')
          } catch (err: any) { toast.error('Restocking Failed', { description: err.message }) }
        }
        if (targetItem.id) {
          await updateDoc(doc(db, 'jobCards', jobId, 'returns', targetItem.id), { approvalStatus: clonedArray[itemIndex].approvalStatus, inventoryReturned: clonedArray[itemIndex].inventoryReturned || false, approvedAt: clonedArray[itemIndex].approvedAt || null })
        }
        await updateDoc(doc(db, 'jobCards', jobId), { inventoryReturns: clonedArray, updatedAt: serverTimestamp() })
      } else if (arrayField === 'staffRates') {
        const { selectedStaffRates } = get()
        const clonedArray = selectedStaffRates.map(i => ({ ...i }))
        const itemIndex = clonedArray.findIndex(i => i.id === itemId)
        if (itemIndex === -1) throw new Error('Staff rate not found')
        const targetItem = clonedArray[itemIndex]
        if (newStatus === 'REJECTED') {
          if (targetItem.id) { try { await deleteDoc(doc(db, 'jobCards', jobId, 'staffRates', targetItem.id)) } catch (e) {} }
          await updateDoc(doc(db, 'jobCards', jobId), { staffRates: clonedArray.filter(i => i.id !== itemId), updatedAt: serverTimestamp() })
          toast.success('Staff Rate Rejected')
          return
        }
        clonedArray[itemIndex].approvalStatus = newStatus
        if (newStatus === 'APPROVED_MANAGER') clonedArray[itemIndex].approvedAt = new Date().toISOString()
        if (targetItem.id) {
          await updateDoc(doc(db, 'jobCards', jobId, 'staffRates', targetItem.id), { approvalStatus: newStatus, approvedAt: clonedArray[itemIndex].approvedAt || null })
        }
        await updateDoc(doc(db, 'jobCards', jobId), { staffRates: clonedArray, updatedAt: serverTimestamp() })
        if (newStatus === 'APPROVED_MANAGER') {
          toast.success('Staff Rate Approved - Payroll integration available')
        }
      }
      toast.success('Item status updated successfully')
    } catch (err: any) {
      console.error("Action handler failed:", err)
      toast.error("Action Failed", { description: err.message })
    }
  },

  handleCommissionApproval: async (commissionId, targetStatus) => {
    const { selectedItem } = get()
    if (!selectedItem) return
    const jobId = selectedItem.id
    try {
      const referrers = JSON.parse(JSON.stringify(selectedItem.generalInfo?.referrers || []))
      const index = referrers.findIndex((r: any) => r.id === commissionId)
      if (index === -1) throw new Error('Commission record not found')
      const comm = referrers[index]
      comm.approvalStatus = targetStatus
      comm.approvedAt = new Date().toISOString()
      comm.approvedBy = auth.currentUser?.displayName || auth.currentUser?.email || 'Manager'
      if (targetStatus === 'APPROVED_MANAGER') {
        const jobIdentifier = get().getJobNum(selectedItem)
        await addDoc(collection(db, 'operationalExpenses'), {
          category: 'commission',
          amount: Number(comm.amount || 0),
          paymentMethod: (comm.paymentMethod || 'cash').toLowerCase(),
          description: `Commission Payout: Job ${jobIdentifier} - ${comm.name || 'Anonymous Referrer'}`,
          status: 'APPROVED',
          sourceJobId: jobId,
          sourceItemId: comm.id,
          createdAt: serverTimestamp()
        })
        toast.success('Commission Expense Posted')
      }
      await updateDoc(doc(db, 'jobCards', jobId), { 'generalInfo.referrers': referrers, updatedAt: serverTimestamp() })
      toast.success(`Commission Approved: ${targetStatus}`)
    } catch (err: any) {
      console.error("Commission approval failed:", err)
      toast.error("Approval Failed", { description: err.message })
    }
  },

  handleRejectCommission: async (commissionId) => {
    const { selectedItem } = get()
    if (!selectedItem) return
    const jobId = selectedItem.id
    try {
      const referrers = JSON.parse(JSON.stringify(selectedItem.generalInfo?.referrers || []))
      const filtered = referrers.filter((r: any) => r.id !== commissionId)
      await updateDoc(doc(db, 'jobCards', jobId), { 'generalInfo.referrers': filtered, updatedAt: serverTimestamp() })
      toast.success('Commission Rejected & Removed')
    } catch (err: any) {
      console.error("Commission rejection failed:", err)
      toast.error("Rejection Failed", { description: err.message })
    }
  },

  handleUpdateToolState: async (toolId, newState) => {
    const { selectedItem } = get()
    if (!selectedItem) return
    const jobId = selectedItem.id
    try {
      const allocatedTools = [...(selectedItem.allocatedTools || [])]
      const index = allocatedTools.findIndex(t => t.id === toolId)
      if (index === -1) throw new Error('Allocated tool not found')
      allocatedTools[index].state = newState
      allocatedTools[index].returnedAt = newState !== 'Allocated' ? new Date().toISOString() : null
      await updateDoc(doc(db, 'jobCards', jobId), { allocatedTools, updatedAt: serverTimestamp() })
      toast.success(`Tool marked as ${newState}`)
    } catch (err: any) {
      console.error("Tool status update failed:", err)
      toast.error("Update Failed", { description: err.message })
    }
  },

  handleDeallocateTool: async (toolId) => {
    const { selectedItem } = get()
    if (!selectedItem) return
    const jobId = selectedItem.id
    try {
      const allocatedTools = (selectedItem.allocatedTools || []).filter((t: any) => t.id !== toolId)
      await updateDoc(doc(db, 'jobCards', jobId), { allocatedTools, updatedAt: serverTimestamp() })
      toast.success('Tool allocation removed')
    } catch (err: any) {
      console.error("Tool deallocation failed:", err)
      toast.error("Deallocation Failed", { description: err.message })
    }
  },

  handleAllocateTool: async (toolId) => {
    const { selectedItem, toolsRegistry } = get()
    if (!selectedItem || !toolId) return
    const jobId = selectedItem.id
    try {
      const tool = toolsRegistry.find(t => t.id === toolId)
      if (!tool) throw new Error('Tool not found in registry')
      const newAllocation = {
        id: Math.random().toString(36).substring(2),
        toolId: tool.id,
        name: tool.name,
        serialNumber: tool.serialNumber || 'N/A',
        state: 'Allocated' as const,
        allocatedAt: new Date().toISOString(),
        returnedAt: null
      }
      const allocatedTools = [...(selectedItem.allocatedTools || []), newAllocation]
      await updateDoc(doc(db, 'jobCards', jobId), { allocatedTools, updatedAt: serverTimestamp() })
      toast.success(`${tool.name} allocated successfully`)
    } catch (err: any) {
      console.error("Tool allocation failed:", err)
      toast.error("Allocation Failed", { description: err.message })
    }
  },

  cleanup: () => {
    get().subscriptions.forEach(u => u())
    get().detailSubscriptions.forEach(u => u())
    set({ subscriptions: [], detailSubscriptions: [] })
  }
}))

// Helper function similar to inventoryApi.adjustStock
async function adjustStock(id: string, adjustment: {
  type: 'ADD' | 'REMOVE' | 'SET',
  qty: number,
  reason: string,
  reference?: string,
  unitCost?: number,
  skipFinancials?: boolean
}) {
  const user = auth.currentUser
  if (!user) throw new Error('Authentication required')

  const itemRef = doc(db, 'inventoryItems', id)
  await runTransaction(db, async (transaction) => {
    const itemSnap = await transaction.get(itemRef)
    if (!itemSnap.exists()) throw new Error(`Inventory item ${id} does not exist.`)
    const data = itemSnap.data()
    const currentOnHand = Number(data.onHand ?? data.inStock ?? 0)
    let qtyChange = 0
    if (adjustment.type === 'ADD') qtyChange = adjustment.qty
    else if (adjustment.type === 'REMOVE') qtyChange = -adjustment.qty
    else if (adjustment.type === 'SET') qtyChange = adjustment.qty - currentOnHand
    const newOnHand = adjustment.type === 'SET' ? adjustment.qty : currentOnHand + qtyChange
    if (adjustment.type === 'REMOVE' && newOnHand < 0) {
      throw new Error(`Insufficient stock for ${data.name || data.itemName}. Available: ${currentOnHand}, Requested: ${adjustment.qty}`)
    }
    transaction.update(itemRef, { onHand: newOnHand, updatedAt: serverTimestamp() })
    if (!adjustment.skipFinancials) {
      const ledgerRef = doc(collection(db, 'stockLedger'))
      transaction.set(ledgerRef, {
        inventoryItemId: id,
        movementType: 'ADJUST',
        qty: qtyChange,
        reason: adjustment.reason,
        reference: adjustment.reference || 'Manual Adjustment',
        unitCost: adjustment.unitCost || 0,
        totalCost: (adjustment.unitCost || 0) * qtyChange,
        postedAt: serverTimestamp(),
        postedByUid: user.uid
      })
    }
    if (qtyChange < 0 && !adjustment.skipFinancials) {
      const costAmount = Math.abs(qtyChange * (adjustment.unitCost || 0))
      if (costAmount > 0) {
        const cogsRef = doc(collection(db, 'operationalExpenses'))
        transaction.set(cogsRef, {
          type: 'COST_OF_SALES',
          description: `COGS: ${adjustment.reason} (Ref: ${adjustment.reference || 'Manual'})`,
          amount: costAmount,
          status: 'APPROVED',
          category: 'Cost of Sales',
          paymentMethod: 'INVENTORY',
          inventoryItemId: id,
          reference: adjustment.reference || 'Manual',
          createdAt: serverTimestamp(),
          approvedAt: serverTimestamp()
        })
      }
    }
  })
}