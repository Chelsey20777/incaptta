<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { db } from '@/lib/firebase'
import { collection, writeBatch, doc, serverTimestamp } from 'firebase/firestore'
import { useJobCardsStore } from '../store/jobCardsStore'
import { useAdminStore } from '@/features/admin/store/adminStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { ArrowLeft, Save, Loader2, UserCheck, Plus, Trash2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { useSession } from '@/composables/useSession'
import JobInformationCard from '../components/JobInformationCard.vue'
import BomTemplateSelector from '../components/BomTemplateSelector.vue'
import InventoryRequisitionGrid from '../components/InventoryRequisitionGrid.vue'
import JobCardExpensesGrid from '../components/JobCardExpensesGrid.vue'
import StaffRatesGrid from '../components/StaffRatesGrid.vue'
import { formatCurrency } from '@/features/inventory/utils/pricing'
import { inventoryApi } from '@/features/inventory/api/inventoryApi'
import type { UnmatchedBomItem, BomRequisitionSection } from '../composables/useBomTemplate'

const router = useRouter()
const store = useJobCardsStore()
const adminStore = useAdminStore()
const { user: sessionUser } = useSession()
const isSubmitting = ref(false)
const isGeneratingNumber = ref(false)
const generationFailed = ref(false)
const isSticky = ref(false)
const sentinel = ref<HTMLElement | null>(null)

const generateNumber = async () => {
  isGeneratingNumber.value = true
  generationFailed.value = false
  try {
    const generated = await store.generateJobNumber()
    jobInfo.value.jobNumber = generated
  } catch (err) {
    console.error('Failed to auto-generate job number:', err)
    generationFailed.value = true
    toast.error('Job Number Generation Failed', { description: 'Click Retry or enter a number manually.' })
  } finally {
    isGeneratingNumber.value = false
  }
}

const inventoryItemsForTemplate = ref<any[]>([])
const unmatchedBomItems = ref<UnmatchedBomItem[]>([])

function handleTemplateApply({ sections, mode }: { sections: BomRequisitionSection[], mode: 'replace' | 'append' }) {
  if (mode === 'replace') {
    requisitionItems.value = sections
  } else {
    requisitionItems.value = [...requisitionItems.value, ...sections]
  }
}

function handleUnmatched(items: UnmatchedBomItem[]) {
  unmatchedBomItems.value = items
}

onMounted(async () => {
  adminStore.fetchAll()
  if (!jobInfo.value.jobNumber) {
    await generateNumber()
  }
  inventoryApi.listInventory({ isActive: true }).then(items => {
    inventoryItemsForTemplate.value = items
  }).catch(() => {
    // non-critical — template matching will show all as unmatched
  })

  // Sticky Summary Observer
  const observer = new IntersectionObserver((entries) => {
    const entry = entries[0]
    if (entry) {
      isSticky.value = !entry.isIntersecting
    }
  }, { threshold: 0 })

  if (sentinel.value) observer.observe(sentinel.value)
})

const jobInfo = ref({
  jobCardTitle: '',
  projectDescription: '',
  requestingDepartmentId: '',
  jobCategoryId: '',
  jobNumber: '',
  projectLocation: '',
  dimensionsOfStructure: '',
  startDate: '',
  recipientName: '',
  recipientAddress: '',
  recipientPhone: '',
  // CRM Link Fields
  linkedCrmId: '',
  linkedCrmType: '' as 'QUOTE' | 'INVOICE' | '',
  linkedCrmNumber: '',
  linkedCrmTotal: 0
})

const requisitionItems = ref<any[]>([
  {
    id: crypto.randomUUID(),
    jobCategoryId: '',
    description: '',
    items: []
  }
])
const requisitionExpenses = ref<any[]>([])
const staffRates = ref<any[]>([])

const referrers = ref<any[]>([])

const addReferrer = () => {
  referrers.value.push({
    id: `ref_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    name: '',
    amount: 0,
    paymentMethod: 'CASH',
    approvalStatus: 'PENDING',
    createdAt: new Date().toISOString()
  })
}

const removeReferrer = (index: number) => {
  referrers.value.splice(index, 1)
}

const totalCommission = computed(() => {
  return referrers.value.reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
})

// Summary Totals Calculations
const totals = computed(() => {
  const invSummary = (requisitionItems.value || []).reduce((acc, section) => {
    const sectionSummary = (section.items || []).reduce((sAcc: any, item: any) => {
      const qty = item.qtyRequired || 0
      const price = item.irdSellingPrice || 0
      const markup = item.markupPercent || 0

      const baseIRD = qty * price
      const twidMU = baseIRD * (markup / 100)
      const subTotal = baseIRD + twidMU
      const totalInventoryPrice = subTotal

      return {
        totalIrdCost: sAcc.totalIrdCost + baseIRD,
        totalMarkup: sAcc.totalMarkup + twidMU,
        totalInvoiceable: sAcc.totalInvoiceable + totalInventoryPrice
      }
    }, { totalIrdCost: 0, totalMarkup: 0, totalInvoiceable: 0 })

    return {
      totalIrdCost: acc.totalIrdCost + sectionSummary.totalIrdCost,
      totalMarkup: acc.totalMarkup + sectionSummary.totalMarkup,
      totalInvoiceable: acc.totalInvoiceable + sectionSummary.totalInvoiceable
    }
  }, { totalIrdCost: 0, totalMarkup: 0, totalInvoiceable: 0 })

  const adhocTotal = requisitionExpenses.value.reduce((acc, exp) => {
    return acc + ((exp.quantity || 0) * (exp.unitPrice || 0))
  }, 0)

  const staffRatesTotal = staffRates.value.reduce((acc, rate) => {
    return acc + (rate.jobRateAmount || 0)
  }, 0)

  const implementationCost = adhocTotal + staffRatesTotal

  const expByMethod = requisitionExpenses.value.reduce((acc, exp) => {
    const amount = (exp.quantity || 0) * (exp.unitPrice || 0)
    if (exp.paymentMethod === 'CASH') acc.CASH += amount
    else if (exp.paymentMethod === 'ECOCASH') acc.ECOCASH += amount
    else if (exp.paymentMethod === 'BANK') acc.BANK += amount
    return acc
  }, { CASH: 0, ECOCASH: 0, BANK: 0 })

  return {
    inventoryIRDTotal: invSummary.totalIrdCost,
    inventoryMUTotal: invSummary.totalMarkup,
    inventoryGrandTotal: invSummary.totalInvoiceable,
    adHocTotal: adhocTotal,
    staffRatesTotal: staffRatesTotal,
    implementationCost: implementationCost,
    expensesByMethod: expByMethod,
    overallGrandTotal: invSummary.totalInvoiceable + implementationCost
  }
})

const vatEnabled = computed(() => Boolean(adminStore.appSettings?.vatEnabled))
const vatRate = computed(() => vatEnabled.value ? Number(adminStore.appSettings?.vatRate || 0) : 0)
const vatAmount = computed(() => vatRate.value > 0 ? totals.value.overallGrandTotal * vatRate.value / 100 : 0)
const grandTotalWithVat = computed(() => totals.value.overallGrandTotal + vatAmount.value)

const handleSubmit = async () => {
  if (isGeneratingNumber.value) {
    toast.error('Please Wait', { description: 'Generating job number...' })
    return
  }

  if (!jobInfo.value.jobNumber) {
    toast.error('Job Number Missing', { description: 'A job number is required. Please wait for generation or enter one manually.' })
    return
  }

  if (!jobInfo.value.jobCardTitle || !jobInfo.value.requestingDepartmentId || !jobInfo.value.jobCategoryId) {
    toast.error('Required Fields Missing', { description: 'Please fill in Title, Department, and Category.' })
    return
  }

  const processingToast = toast.loading('Creating Job Card...', { description: 'Starting atomic submission flow...' })
  isSubmitting.value = true
  try {
    const batch = writeBatch(db)
    const jobCardRef = doc(collection(db, 'jobCards'))
    const jobId = jobCardRef.id

    const inventoryMap: Record<string, number> = {}
    inventoryItemsForTemplate.value.forEach((item: any) => {
      const cost = Number(item.totalCost ?? (Number(item.purchasePrice ?? 0) + Number(item.freightDuty ?? 0)))
      inventoryMap[item.id] = cost
    })

    // 1. Prepare Main Doc
    batch.set(jobCardRef, {
      status: 'SUBMITTED', // Set to SUBMITTED as per Part 2 (Sales/Requester "submit only")
      generalInfo: {
        jobTitle: jobInfo.value.jobCardTitle || 'Untitled',
        projectDescription: jobInfo.value.projectDescription || '',
        requestingDepartmentId: jobInfo.value.requestingDepartmentId || '',
        jobCategoryId: jobInfo.value.jobCategoryId || '',
        jobNumber: jobInfo.value.jobNumber || '',
        projectLocation: jobInfo.value.projectLocation || 'N/A',
        dimensionsOfStructure: jobInfo.value.dimensionsOfStructure || 'N/A',
        startDate: jobInfo.value.startDate || '',
        recipientName: jobInfo.value.recipientName || 'N/A',
        recipientAddress: jobInfo.value.recipientAddress || 'N/A',
        recipientPhone: jobInfo.value.recipientPhone || 'N/A',
        // CRM Link Fields
        linkedCrmId: jobInfo.value.linkedCrmId || '',
        linkedCrmType: jobInfo.value.linkedCrmType || '',
        linkedCrmNumber: jobInfo.value.linkedCrmNumber || '',
        linkedCrmTotal: Number(jobInfo.value.linkedCrmTotal || 0),
        // Referral and Commissions
        referrers: referrers.value.map(r => ({
          id: r.id,
          name: r.name || '',
          amount: Number(r.amount) || 0,
          paymentMethod: r.paymentMethod || 'CASH',
          approvalStatus: 'PENDING',
          createdAt: r.createdAt || new Date().toISOString()
        }))
      },
      submittedBy: {
        uid: sessionUser.value?.uid || 'unknown',
        email: sessionUser.value?.email || 'unknown',
        name: sessionUser.value?.displayName || 'Unknown User'
      },
      summary: { // Deprecated: Keep for backward compatibility
        inventoryIRDTotal: Number(totals.value.inventoryIRDTotal || 0),
        inventoryMUTotal: Number(totals.value.inventoryMUTotal || 0),
        adHocTotal: Number(totals.value.adHocTotal || 0),
        staffRatesTotal: Number(totals.value.staffRatesTotal || 0),
        implementationCost: Number(totals.value.implementationCost || 0),
        grandTotal: Number(totals.value.overallGrandTotal || 0), // grandTotal source
        expensesByMethod: totals.value.expensesByMethod || { CASH: 0, ECOCASH: 0, BANK: 0 },
        itemCount: Number(requisitionItems.value.reduce((sum, s) => sum + (s.items?.length || 0), 0) + (requisitionExpenses.value?.length || 0)),
        lastUpdatedAt: serverTimestamp()
      },
      totals: { // NEW SCHEMA
        inventoryIRDTotal: Number(totals.value.inventoryIRDTotal || 0),
        inventoryMUTotal: Number(totals.value.inventoryMUTotal || 0),
        adHocTotal: Number(totals.value.adHocTotal || 0),
        staffRatesTotal: Number(totals.value.staffRatesTotal || 0),
        implementationCost: Number(totals.value.implementationCost || 0),
        grandTotal: Number(totals.value.overallGrandTotal || 0),
      },
      // FULL ITEM BREAKDOWN EMBEDDED
      // NESTED SECTIONS & ITEMS EMBEDDED
      requisitionSections: requisitionItems.value.map(section => ({
          id: section.id || crypto.randomUUID(),
          jobCategoryId: section.jobCategoryId || '',
          description: section.description || '',
          items: (section.items || []).map((item: any) => {
              const qty = item.qtyRequired || 0
              const price = item.irdSellingPrice || 0
              const markup = item.markupPercent || 0
              
              const baseIRD = qty * price
              const twidMU = baseIRD * (markup / 100)
              const subTotal = baseIRD + twidMU

              let resolvedCost = Number(item.costSnapshot || 0)
              if (item.inventoryItemId && resolvedCost === 0) {
                resolvedCost = inventoryMap[item.inventoryItemId] || 0
              }

              return {
                  id: item.id || crypto.randomUUID(),
                  itemName: item.itemName || 'Unnamed Item',
                  description: item.description || '',
                  inventoryItemId: item.inventoryItemId || '',
                  qty: Number(qty),
                  irdSellingPrice: Number(price),
                  twidMarkupPercent: Number(markup),
                  costSnapshot: resolvedCost,
                  rowIRDTot: Number(baseIRD),
                  rowMUTot: Number(twidMU),
                  rowGrandTot: Number(subTotal),
                  approvalStatus: 'PENDING'
              }
          })
      })),
      // Flattened items for legacy/reports
      requisitionItems: requisitionItems.value.flatMap(section => 
        (section.items || []).map((item: any) => {
          const qty = item.qtyRequired || 0
          const price = item.irdSellingPrice || 0
          const markup = item.markupPercent || 0
          
          const baseIRD = qty * price
          const twidMU = baseIRD * (markup / 100)
          const subTotal = baseIRD + twidMU

          let resolvedCost = Number(item.costSnapshot || 0)
          if (item.inventoryItemId && resolvedCost === 0) {
            resolvedCost = inventoryMap[item.inventoryItemId] || 0
          }

          return {
            id: item.id || crypto.randomUUID(),
            jobCategoryId: section.jobCategoryId || '', // Use section's category
            itemName: item.itemName || 'Unnamed Item',
            description: item.description || '',
            inventoryItemId: item.inventoryItemId || '',
            qty: Number(qty),
            irdSellingPrice: Number(price),
            twidMarkupPercent: Number(markup),
            costSnapshot: resolvedCost,
            rowIRDTot: Number(baseIRD),
            rowMUTot: Number(twidMU),
            rowGrandTot: Number(subTotal),
            approvalStatus: 'PENDING'
          }
        })
      ),
      adHocExpenses: requisitionExpenses.value.map(exp => ({
        id: exp.id || crypto.randomUUID(),
        description: exp.description || 'No Description',
        recipientName: exp.recipientName || '',
        recipientPhone: exp.recipientPhone || '',
        quantity: Number(exp.quantity || 0),
        unitPrice: Number(exp.unitPrice || 0),
        paymentMethod: exp.paymentMethod || 'CASH',
        paymentRef: exp.paymentRef || '',
        totalAmount: Number((exp.quantity || 0) * (exp.unitPrice || 0)),
        attachmentUrl: exp.attachmentUrl || null,
        attachmentUrls: exp.attachmentUrls || (exp.attachmentUrl ? [exp.attachmentUrl] : []),
        approvalStatus: 'PENDING',
        createdAt: exp.createdAt || new Date().toISOString()
      })),
      staffRates: staffRates.value.map(rate => ({
        id: rate.id || crypto.randomUUID(),
        employeeId: rate.employeeId || '',
        jobRateAmount: Number(rate.jobRateAmount || 0),
        approvalStatus: rate.approvalStatus || 'PENDING',
        createdAt: new Date().toISOString()
      })),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })

    // 2. Save items (Flattened) to subcollection
    const flattenedItems = requisitionItems.value.flatMap(section => 
        (section.items || []).map((item: any) => ({ ...item, jobCategoryId: section.jobCategoryId }))
    )
    if (flattenedItems.length > 0) {
      flattenedItems.forEach(item => {
        const itemRef = doc(collection(db, 'jobCards', jobId, 'items'))
        const qty = item.qtyRequired || 0
        const price = item.irdSellingPrice || 0
        const markup = item.markupPercent || 0
        
        const baseIRD = qty * price
        const twidMU = baseIRD * (markup / 100)
        const subTotal = baseIRD + twidMU
        const totalInventoryPrice = subTotal

        let resolvedCost = Number(item.costSnapshot || 0)
        if (item.inventoryItemId && resolvedCost === 0) {
          resolvedCost = inventoryMap[item.inventoryItemId] || 0
        }

        batch.set(itemRef, {
          jobCategoryId: item.jobCategoryId || '',
          itemName: item.itemName || 'Unnamed Item',
          description: item.description || '',
          qty: Number(qty),
          irdSellingPrice: Number(price),
          twidMarkupPercent: Number(markup),
          costSnapshot: resolvedCost,
          rowIRDTot: Number(baseIRD),
          rowMUTot: Number(twidMU),
          rowGrandTot: Number(totalInventoryPrice),
          approvalStatus: 'PENDING',
          updatedAt: serverTimestamp()
        })
      })
    }

    // 3. Save expenses to subcollection
    if (requisitionExpenses.value.length > 0) {
      requisitionExpenses.value.forEach(exp => {
        const expRef = doc(collection(db, 'jobCards', jobId, 'expenses'))
        const totalAmount = (exp.quantity || 0) * (exp.unitPrice || 0)

        batch.set(expRef, {
          description: exp.description || 'No Description',
          quantity: Number(exp.quantity || 0),
          unitPrice: Number(exp.unitPrice || 0),
          paymentMethod: exp.paymentMethod || 'CASH',
          paymentRef: exp.paymentRef || '',
          totalAmount: Number(totalAmount),
          approvalStatus: 'PENDING',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        })
      })
    }

    // 4. Commit all at once
    await batch.commit()

    toast.dismiss(processingToast)
    toast.success('Job Card Created', { description: `Job Card for ${jobInfo.value.jobCardTitle} is now a DRAFT.` })
    router.push(`/job-cards/${jobId}`)
  } catch (err: any) {
    toast.dismiss(processingToast)
    console.error('CRITICAL: Failed to create job card:', err)

    let errorMsg = err.message || 'Unknown Firestore Error'
    if (err.code === 'permission-denied') errorMsg = 'Permission Denied: You do not have access to create job cards.'

    toast.error('Submission Failed', {
      description: errorMsg,
      duration: 6000
    })
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="w-full space-y-8 pb-12 px-4 md:px-8">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-4">
        <Button variant="ghost" size="icon" @click="router.back()">
          <ArrowLeft class="size-4" />
        </Button>
        <h2 class="text-3xl font-bold tracking-tight">Create Job Card</h2>
      </div>
    </div>

    <!-- General Information Section -->
    <JobInformationCard v-model="jobInfo" :is-generating="isGeneratingNumber" :generation-failed="generationFailed" @retry-job-number="generateNumber" />

    <!-- BOM Template Auto-Population -->
    <BomTemplateSelector
      :structure-size="jobInfo.dimensionsOfStructure"
      :inventory-items="inventoryItemsForTemplate"
      :job-categories="adminStore.jobCategories"
      @apply="handleTemplateApply"
      @unmatched="handleUnmatched"
    />

    <!-- Unmatched Items Warning -->
    <div v-if="unmatchedBomItems.length > 0" class="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
      <p class="text-sm font-semibold text-amber-700 dark:text-amber-400">
        {{ unmatchedBomItems.length }} template item(s) could not be matched to inventory and have been added without pricing. Please select them manually in the grid below.
      </p>
      <ul class="mt-2 list-disc list-inside text-xs text-amber-600 dark:text-amber-300 space-y-0.5">
        <li v-for="item in unmatchedBomItems" :key="item.templateName">
          {{ item.templateName }} — Qty: {{ item.qty }}
        </li>
      </ul>
    </div>

    <!-- Inventory Requisition Section -->
    <div class="space-y-4">
      <h3 class="text-xl font-semibold">Inventory Requisition</h3>
      <InventoryRequisitionGrid v-model="requisitionItems" />
    </div>

    <!-- Ad-hoc Expenses Section -->
    <div class="space-y-4">
      <div class="flex flex-col">
        <h3 class="text-xl font-semibold">Job Card Expenses (Ad-hoc)</h3>
        <p class="text-sm text-muted-foreground">Add miscellaneous items (e.g., lunch money, airtime, food) that are not
          in inventory.</p>
      </div>
      <JobCardExpensesGrid v-model="requisitionExpenses" />
    </div>

    <!-- Staff Rates Section -->
    <div class="space-y-4">
      <div class="flex flex-col">
        <h3 class="text-xl font-semibold">Staff Rates</h3>
        <p class="text-sm text-muted-foreground">Assign job-specific earnings to staff members. These will be automatically added to their payslip upon job approval.</p>
      </div>
      <StaffRatesGrid v-model="staffRates" :general-info="jobInfo" :is-admin="false" />
    </div>

    <!-- Job Referral & Commission Section -->
    <div class="space-y-4">
      <div class="flex flex-col">
        <h3 class="text-xl font-semibold">Job Referral & Commission</h3>
        <p class="text-sm text-muted-foreground">Add referral/commission recipients. These will require accountant and manager approval.</p>
      </div>
      
      <Card class="bg-emerald-600/5 dark:bg-emerald-600/10 backdrop-blur-md border-emerald-600/20 dark:border-emerald-600/30 shadow-lg overflow-hidden">
        <CardHeader class="flex flex-row items-center justify-between gap-2 bg-emerald-100/50 dark:bg-emerald-900/20 border-b border-emerald-200 dark:border-emerald-700/30 py-4">
          <div class="flex items-center gap-2">
            <UserCheck class="size-4 text-emerald-600" />
            <CardTitle class="text-lg font-bold text-emerald-700 dark:text-emerald-400">Job Referral & Commission</CardTitle>
          </div>
          <Button type="button" size="sm" variant="outline" class="h-8 text-xs font-bold border-emerald-300 text-emerald-700 hover:bg-emerald-100" @click="addReferrer">
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
                <tr v-for="(referrer, idx) in referrers" :key="referrer.id" class="border-b border-white/80">
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
                    <Button type="button" size="icon" variant="ghost" class="h-8 w-8 text-rose-500 hover:text-rose-700 hover:bg-rose-50" @click="removeReferrer(idx)">
                      <Trash2 class="size-4" />
                    </Button>
                  </td>
                </tr>
                <tr v-if="!referrers.length">
                   <td colspan="4" class="px-6 py-8 text-center text-muted-foreground italic">
                     No commission recipients added. Click "Add Recipient" to start.
                   </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="p-6 bg-emerald-50/50 flex justify-between items-center border-t border-emerald-200">
            <span class="text-sm font-bold text-emerald-700">Total Fixed Commission</span>
            <span class="text-xl font-black text-emerald-600">{{ formatCurrency(totalCommission) }}</span>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Final Summary Area -->
    <div class="mt-8 space-y-6">
      <Card class="bg-muted/5 border-muted/60">
        <CardHeader class="pb-3 border-b bg-muted/10">
          <CardTitle class="text-sm font-bold uppercase text-muted-foreground tracking-wider">Overall Summary
          </CardTitle>
        </CardHeader>
        <CardContent class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 p-6">
          <!-- Inventory Section -->
          <div class="space-y-2">
            <p class="text-[11px] font-bold uppercase text-muted-foreground/60 mb-2">Inventory Breakdown</p>
            <div class="flex justify-between text-sm">
              <span class="text-muted-foreground">IRD Selling Price</span>
              <span class="font-medium">{{ formatCurrency(totals.inventoryIRDTotal) }}</span>
            </div>

            <div class="flex justify-between text-sm text-primary">
              <span class="text-primary font-bold">IMP Cost</span>
              <span class="font-bold">{{ formatCurrency(totals.implementationCost) }}</span>
            </div>
            <div class="flex justify-between text-sm font-bold pt-1 border-t mt-1">
              <span>Subtotal</span>
              <span>{{ formatCurrency(totals.inventoryGrandTotal) }}</span>
            </div>
          </div>

          <!-- Implementation Cost Section -->
          <div class="space-y-2">
            <p class="text-[11px] font-bold uppercase text-muted-foreground/60 mb-2">Implementation Cost</p>
            <div class="flex justify-between text-sm">
              <span class="text-muted-foreground">Ad-hoc Expenses</span>
              <span class="font-medium text-orange-600">{{ formatCurrency(totals.adHocTotal) }}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-muted-foreground">Staff Rates</span>
              <span class="font-medium text-blue-600">{{ formatCurrency(totals.staffRatesTotal) }}</span>
            </div>
            <div class="flex justify-between text-sm text-primary font-bold pt-1 border-t mt-1">
              <span>Total Implementation</span>
              <span>{{ formatCurrency(totals.implementationCost) }}</span>
            </div>
            <div v-if="totals.expensesByMethod.CASH > 0"
              class="flex justify-between text-xs text-muted-foreground pl-2">
              <span>• Cash</span>
              <span>{{ formatCurrency(totals.expensesByMethod.CASH) }}</span>
            </div>
            <div v-if="totals.expensesByMethod.ECOCASH > 0"
              class="flex justify-between text-xs text-muted-foreground pl-2">
              <span>• EcoCash</span>
              <span>{{ formatCurrency(totals.expensesByMethod.ECOCASH) }}</span>
            </div>
            <div v-if="totals.expensesByMethod.BANK > 0"
              class="flex justify-between text-xs text-muted-foreground pl-2">
              <span>• Bank</span>
              <span>{{ formatCurrency(totals.expensesByMethod.BANK) }}</span>
            </div>
          </div>

          <!-- Placeholder/Spacer for Alignment -->
          <div class="hidden lg:block"></div>

          <!-- Grand Total Section -->
          <div class="flex flex-col justify-end items-end space-y-2 border-l pl-8 border-primary/20">
            <p class="text-[11px] font-black uppercase text-primary/40 tracking-widest">Job Invoice Total</p>
            <div v-if="vatAmount > 0" class="w-full space-y-1 text-sm text-right mb-1">
              <div class="flex justify-between gap-6 text-muted-foreground">
                <span>Subtotal</span>
                <span class="font-medium tabular-nums">{{ formatCurrency(totals.overallGrandTotal) }}</span>
              </div>
              <div class="flex justify-between gap-6 text-muted-foreground">
                <span>VAT ({{ vatRate }}%)</span>
                <span class="font-medium tabular-nums">+{{ formatCurrency(vatAmount) }}</span>
              </div>
            </div>
            <div class="text-5xl font-black text-primary tracking-tighter drop-shadow-sm">
              {{ formatCurrency(grandTotalWithVat) }}
            </div>
            <p class="text-[9px] text-muted-foreground uppercase font-medium italic">
              {{ vatAmount > 0 ? `Incl. VAT (${vatRate}%) · Inventory Only` : 'Inventory Items Only' }}
            </p>
          </div>
        </CardContent>
      </Card>

      <div class="flex justify-end gap-3 pt-4 border-t">
        <Button variant="outline" size="lg" @click="router.back()" :disabled="isSubmitting">Cancel</Button>
        <Button size="lg" @click="handleSubmit" :disabled="isSubmitting" class="px-8 shadow-lg">
          <Loader2 v-if="isSubmitting" class="mr-2 h-5 w-5 animate-spin" />
          <Save v-else class="mr-2 h-5 w-5" />
          {{ isSubmitting ? 'Saving...' : 'Create Job Card' }}
        </Button>
      </div>
    </div>
  </div>
</template>
```
