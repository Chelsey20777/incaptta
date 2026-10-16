<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { db } from '@/lib/firebase'
import { doc, onSnapshot, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore'
import { 
  ArrowLeft, 
  Loader2, 
  DollarSign, 
  Construction, 
  CheckCircle2, 
  Clock, 
  FileText, 
  Printer,
  History,
  TrendingUp,
  Landmark,
  ShieldCheck,
  Edit,
  Save,
  X,
  Plus,
  Trash2
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { toast } from 'vue-sonner'
import { useSession } from '@/composables/useSession'
import { useAgricPayments } from '../composables/useAgricPayments'
import { useAdminStore } from '@/features/admin/store/adminStore'
import { useFinanceStore } from '@/features/fundTransfers/store/financeStore'
import { generateAgfQuotePdf } from '@/features/jobCards/utils/generateAgfPdf'
import { useCreateJobCardFromCalculator } from '@/features/jobCards/composables/useCreateJobCardFromCalculator'

const { isCreating: isCreatingSystemJobCard, createJobCardFromCalculation } = useCreateJobCardFromCalculator()

async function handleCreateSystemJobCard() {
  if (!job.value) return
  
  try {
    // Resolve Agric department
    const agricDept = adminStore.departments.find((d: any) => d.name?.toLowerCase().includes('agric'))
    const deptId = agricDept?.id || ''
    const deptName = agricDept?.name || 'Agric'
    
    // Resolve Fowlrun category
    const fowlrunCat = adminStore.jobCategories.find((c: any) => c.name?.toLowerCase().includes('fowl'))
    const catId = fowlrunCat?.id || ''
    const catName = fowlrunCat?.name || 'Fowlrun Construction'

    // Map AgricJobCard to FowlrunCalculation format
    const calc = {
      size: {
        label: job.value.fowlrunMeta?.size?.label || job.value.fowlrunMeta?.dimensionsOfStructure || 'Custom',
        length: Number(job.value.fowlrunMeta?.structureLength || job.value.fowlrunMeta?.size?.length || 0),
        width: Number(job.value.fowlrunMeta?.structureWidth || job.value.fowlrunMeta?.size?.width || 0),
      },
      area: Number(job.value.fowlrunMeta?.floorArea || job.value.fowlrunMeta?.area || 0),
      perimeter: Number(job.value.fowlrunMeta?.perimeter || 0),
      bays: Number(job.value.fowlrunMeta?.bays || 0),
      birdCapacityMin: Number(job.value.fowlrunMeta?.birdCapacityMin || 0),
      birdCapacityMax: Number(job.value.fowlrunMeta?.birdCapacityMax || 0),
      items: (job.value.requisitionItems || []).map((item: any) => ({
        description: item.description || item.itemName || '',
        qty: Number(item.qty || 0),
        unit: item.unit || item.uom || 'pcs',
        unitPrice: Number(item.unitPrice || item.irdSellingPrice || 0),
        total: Number(item.total || item.rowGrandTot || 0),
        category: item.category || item.boqCategory || 'material'
      })),
      materialsTotal: Number(job.value.fowlrunMeta?.materialsTotal || 0),
      labourTotal: Number(job.value.fowlrunMeta?.labourTotal || 0),
      transportTotal: Number(job.value.fowlrunMeta?.transportTotal || 0),
      grandTotal: Number(job.value.totalAmount || 0)
    }

    const options = {
      clientName: job.value.clientName,
      siteLocation: job.value.siteLocation,
      linkedQuoteId: job.value.id,
      linkedCalculationId: job.value.fowlrunMeta?.linkedCalculationId || null,
      departmentId: deptId,
      departmentName: deptName,
      jobCategoryId: catId,
      jobCategoryName: catName,
    }

    const result = await createJobCardFromCalculation(calc, options)

    // Save linkage on the Agric Job Card
    await updateDoc(doc(db, 'agricJobCards', jobId), {
      linkedSystemJobCardId: result.jobCardId,
      linkedSystemJobCardNumber: result.jobCardNumber,
      updatedAt: serverTimestamp()
    })

    toast.success(`Agric-structure Jobcard ${result.jobCardNumber} created and linked successfully`)
    
    // Redirect to the newly created standard job card
    router.push(`/job-cards/${result.jobCardId}`)
  } catch (err: any) {
    console.error('Failed to create system job card:', err)
    toast.error('Failed to create system job card', { description: err.message })
  }
}

const route = useRoute()
const router = useRouter()
const { hasAnyRole, user: sessionUser } = useSession()
const { collectPayment, isProcessing: isPaying } = useAgricPayments()
const adminStore = useAdminStore()
const financeStore = useFinanceStore()

const jobId = route.params.id as string
const job = ref<any>(null)
const loading = ref(true)
const isUpdating = ref(false)
const creatorName = ref('Loading...')
const financeSettings = ref<any>(null)

// Editing state
const isEditing = ref(false)
const editableItems = ref<any[]>([])

const canManage = computed(() => hasAnyRole(['ADMIN', 'MANAGER', 'SUPER_ADMIN']))

function startEditing() {
  editableItems.value = JSON.parse(JSON.stringify(job.value.requisitionItems || []))
  isEditing.value = true
}

function cancelEditing() {
  isEditing.value = false
  editableItems.value = []
}

function addItem() {
  editableItems.value.push({
    id: crypto.randomUUID(),
    description: '',
    qty: 0,
    unit: 'pcs',
    unitPrice: 0,
    total: 0
  })
}

function removeItem(idx: number) {
  editableItems.value.splice(idx, 1)
}

const currentEditableTotal = computed(() => {
  return editableItems.value.reduce((sum, item) => {
    const total = (item.qty || 0) * (item.unitPrice || 0)
    return sum + total
  }, 0)
})

async function saveEdits() {
  isUpdating.value = true
  try {
    const finalItems = editableItems.value.map(item => ({
      ...item,
      total: parseFloat(((item.qty || 0) * (item.unitPrice || 0)).toFixed(2))
    }))
    const newTotal = finalItems.reduce((sum, item) => sum + item.total, 0)
    
    await updateDoc(doc(db, 'agricJobCards', jobId), {
      requisitionItems: finalItems,
      totalAmount: newTotal,
      balance: newTotal - (job.value.paidAmount || 0),
      updatedAt: serverTimestamp()
    })
    
    toast.success('Quote updated successfully')
    isEditing.value = false
  } catch (err) {
    console.error('Save edits failed:', err)
    toast.error('Failed to save changes')
  } finally {
    isUpdating.value = false
  }
}

// Payment Dialog State
const showPaymentDialog = ref(false)
const payAmount = ref(0)
const payAccount = ref<'CASH' | 'BANK' | 'ECOCASH'>('CASH')
const payNotes = ref('')

async function handleCollectPayment() {
  if (payAmount.value <= 0) {
    toast.error('Please enter a valid amount')
    return
  }
  try {
    await collectPayment(job.value, payAmount.value, payAccount.value, payNotes.value)
    showPaymentDialog.value = false
    payAmount.value = 0
    payNotes.value = ''
  } catch (err) {}
}

async function updateStatus(newStatus: string) {
  isUpdating.value = true
  try {
    await updateDoc(doc(db, 'agricJobCards', jobId), {
      status: newStatus,
      updatedAt: serverTimestamp()
    })
    toast.success(`Status updated to ${newStatus}`)
  } catch (err) {
    toast.error('Failed to update status')
  } finally {
    isUpdating.value = false
  }
}

async function resolveCreatorName(uid: string) {
  try {
    const userSnap = await getDoc(doc(db, 'users', uid))
    if (userSnap.exists()) {
      creatorName.value = userSnap.data()?.displayName || userSnap.data()?.email || 'Authorized Signatory'
    } else {
      creatorName.value = job.value?.createdBy?.name || 'Authorized Signatory'
    }
  } catch (err) {
    creatorName.value = job.value?.createdBy?.name || 'Authorized Signatory'
  }
}

async function handlePrint() {
  if (!job.value) return
  
  // Map AgricJobCard to the structure expected by generateAgfQuotePdf
  const pdfData = {
     ...job.value,
     generalInfo: {
       ...job.value.generalInfo,
       jobNumber: job.value.jobNumber,
       jobInvoiceValue: job.value.totalAmount
     }
  }

  try {
    await generateAgfQuotePdf(
      pdfData, 
      adminStore.appSettings, 
      financeSettings.value || {}, 
      creatorName.value
    )
  } catch (err) {
    toast.error('Failed to generate PDF')
  }
}

onMounted(() => {
  adminStore.fetchAll()
  
  // Fetch finance settings directly
  getDoc(doc(db, 'appSettings', 'finance')).then(s => {
    if (s.exists()) financeSettings.value = s.data()
  })

  const unsub = onSnapshot(doc(db, 'agricJobCards', jobId), (snap) => {
    if (snap.exists()) {
      job.value = { id: snap.id, ...snap.data() }
      if (job.value.createdBy?.uid) {
        resolveCreatorName(job.value.createdBy.uid)
      } else {
        creatorName.value = job.value.createdBy?.name || 'Authorized Signatory'
      }
    } else {
      toast.error('Project not found')
      router.push('/agric-structures/dashboard')
    }
    loading.value = false
  })
  return unsub
})
</script>

<template>
  <div class="h-full space-y-6 p-8 pt-6 pb-20">
    <div v-if="loading" class="flex flex-col items-center justify-center py-40 gap-4">
      <Loader2 class="size-8 animate-spin text-primary" />
      <p class="text-sm text-muted-foreground animate-pulse">Loading Project Details...</p>
    </div>

    <template v-else-if="job">
      <!-- Top Action Bar -->
      <div class="flex items-center justify-between">
        <Button variant="ghost" size="sm" @click="router.back()">
          <ArrowLeft class="mr-2 h-4 w-4" /> Back
        </Button>
        <div class="flex items-center gap-2">
          <template v-if="isEditing">
             <Button variant="outline" size="sm" @click="cancelEditing" :disabled="isUpdating">
                <X class="mr-2 h-4 w-4" /> Cancel
             </Button>
             <Button class="bg-brand-primary hover:bg-brand-primary/90 text-white" size="sm" @click="saveEdits" :disabled="isUpdating">
                <Loader2 v-if="isUpdating" class="mr-2 h-4 w-4 animate-spin" />
                <Save v-else class="mr-2 h-4 w-4" /> Save Changes
             </Button>
          </template>
          <template v-else>
             <Button variant="outline" size="sm" @click="handlePrint">
               <Printer class="mr-2 h-4 w-4" /> Export PDF
             </Button>
             <Button v-if="canManage && job.status === 'DRAFT'" variant="outline" size="sm" @click="startEditing">
                <Edit class="mr-2 h-4 w-4" /> Edit Quote
             </Button>
             <Button v-if="canManage && job.status === 'DRAFT'" class="bg-brand-primary hover:bg-brand-primary/90 text-white border-none" size="sm" @click="updateStatus('APPROVED')">
               <CheckCircle2 class="mr-2 h-4 w-4" /> Approve Job
             </Button>
             <Button v-if="canManage && job.status !== 'DRAFT' && !job.linkedSystemJobCardId" class="bg-green-600 hover:bg-green-700 text-white" size="sm" @click="handleCreateSystemJobCard" :disabled="isCreatingSystemJobCard">
               <Loader2 v-if="isCreatingSystemJobCard" class="mr-2 h-4 w-4 animate-spin" />
               <Plus v-else class="mr-2 h-4 w-4" /> Create Agric-structure Jobcard
             </Button>
             <Button v-if="job.linkedSystemJobCardId" variant="outline" class="border-green-600 text-green-700 hover:bg-green-50" size="sm" @click="router.push(`/job-cards/${job.linkedSystemJobCardId}`)">
               <CheckCircle2 class="mr-2 h-4 w-4 text-green-600" /> View Agric-structure Jobcard
             </Button>
          </template>
        </div>
      </div>

      <!-- Header Section -->
      <div class="flex flex-col md:flex-row md:items-start justify-between gap-6">
        <div class="space-y-2">
          <div class="flex items-center gap-3">
             <Badge variant="outline" class="bg-primary/10 text-primary border-primary/20 px-3 py-1">
                {{ job.jobNumber }}
             </Badge>
             <Badge :variant="job.status === 'PAID' ? 'default' : 'secondary'">
                {{ job.status }}
             </Badge>
          </div>
          <h1 class="text-3xl font-bold tracking-tight">{{ job.clientName }}</h1>
          <p class="text-muted-foreground flex items-center gap-2">
             <Construction class="size-4" />
             {{ job.generalInfo?.jobTitle }} · {{ job.siteLocation }}
          </p>
        </div>
        
        <!-- Financial Snapshot -->
        <Card class="w-full md:w-80 shadow-xl border-brand-primary/20 bg-gradient-to-br from-brand-primary/10 via-background to-brand-primary/5">
           <CardContent class="p-6">
              <div class="space-y-4">
                 <div class="flex items-center justify-between">
                    <span class="text-sm font-medium text-muted-foreground">Contract Total</span>
                    <span class="text-xl font-bold">${{ (isEditing ? currentEditableTotal : job.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 }) }}</span>
                 </div>
                 <div class="flex items-center justify-between">
                    <span class="text-sm font-medium text-muted-foreground">Amount Paid</span>
                    <span class="text-lg font-semibold text-green-600">${{ job.paidAmount.toLocaleString() }}</span>
                 </div>
                 <Separator />
                 <div class="flex items-center justify-between">
                    <span class="text-sm font-bold">Outstanding</span>
                    <span class="text-xl font-black text-rose-600">${{ ((isEditing ? currentEditableTotal : job.totalAmount) - (job.paidAmount || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 }) }}</span>
                 </div>
                 <Button class="w-full mt-2 group bg-brand-secondary hover:bg-brand-secondary/90 text-white border-none shadow-lg shadow-brand-secondary/20" size="lg" @click="showPaymentDialog = true" :disabled="job.balance <= 0 || isEditing">
                    <DollarSign class="mr-2 h-5 w-5 group-hover:scale-110 transition-transform" /> 
                    Collect Payment
                 </Button>
              </div>
           </CardContent>
        </Card>
      </div>

      <div class="grid gap-6 md:grid-cols-3">
         <!-- Project Details (Left) -->
         <div class="md:col-span-2 space-y-6">
            <Card>
               <CardHeader>
                  <CardTitle class="text-lg flex items-center gap-2">
                     <FileText class="size-4 text-primary" />
                     Project Specifications
                  </CardTitle>
               </CardHeader>
               <CardContent class="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div class="space-y-1">
                     <p class="text-[10px] uppercase font-bold text-muted-foreground">Bird Capacity</p>
                     <p class="font-bold flex items-center gap-1">
                        <TrendingUp class="size-3.5 text-green-500" />
                        {{ job.fowlrunMeta?.birdCapacityMax?.toLocaleString() }}
                     </p>
                  </div>
                  <div class="space-y-1">
                     <p class="text-[10px] uppercase font-bold text-muted-foreground">Internal Bays</p>
                     <p class="font-bold">{{ job.fowlrunMeta?.bays }} Bays</p>
                  </div>
                  <div class="space-y-1">
                     <p class="text-[10px] uppercase font-bold text-muted-foreground">Floor Area</p>
                     <p class="font-bold">{{ job.fowlrunMeta?.area?.toFixed(1) }} m²</p>
                  </div>
                  <div class="space-y-1">
                     <p class="text-[10px] uppercase font-bold text-muted-foreground">Dimensions</p>
                     <p class="font-bold">{{ job.fowlrunMeta?.size?.label }}</p>
                  </div>
               </CardContent>
            </Card>

            <Card>
               <CardHeader class="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle class="text-lg">Bill of Quantities (BOQ)</CardTitle>
                    <CardDescription>Estimated materials and labour for construction.</CardDescription>
                  </div>
                  <Button v-if="isEditing" size="sm" variant="outline" @click="addItem">
                     <Plus class="size-4 mr-2" /> Add Item
                  </Button>
               </CardHeader>
               <CardContent class="p-0">
                  <div class="overflow-auto max-h-[600px]">
                     <table class="w-full text-sm">
                        <thead class="bg-muted/50 sticky top-0 border-b">
                           <tr class="h-10 text-left text-xs uppercase font-bold text-muted-foreground">
                              <th class="px-4">Description</th>
                              <th class="px-4 w-24 text-right">Qty</th>
                              <th class="px-4 w-20 text-center">Unit</th>
                              <th class="px-4 w-32 text-right">Unit $</th>
                              <th class="px-4 w-32 text-right">Total $</th>
                              <th v-if="isEditing" class="px-4 w-10"></th>
                           </tr>
                        </thead>
                        <tbody class="divide-y divide-border">
                           <template v-if="isEditing">
                              <tr v-for="(item, idx) in editableItems" :key="item.id" class="h-14 hover:bg-muted/30">
                                 <td class="px-4">
                                    <Input v-model="item.description" class="h-8 text-xs" />
                                 </td>
                                 <td class="px-4">
                                    <Input v-model.number="item.qty" type="number" class="h-8 text-xs text-right" />
                                 </td>
                                 <td class="px-4">
                                    <Input v-model="item.unit" class="h-8 text-xs text-center uppercase" />
                                 </td>
                                 <td class="px-4">
                                    <Input v-model.number="item.unitPrice" type="number" step="0.01" class="h-8 text-xs text-right" />
                                 </td>
                                 <td class="px-4 text-right font-bold">
                                    ${{ ((item.qty || 0) * (item.unitPrice || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 }) }}
                                 </td>
                                 <td class="px-4">
                                    <Button variant="ghost" size="sm" class="h-8 w-8 p-0 text-destructive" @click="removeItem(idx)">
                                       <Trash2 class="size-3.5" />
                                    </Button>
                                 </td>
                              </tr>
                           </template>
                           <template v-else>
                              <tr v-for="item in job.requisitionItems" :key="item.id" class="h-12 hover:bg-muted/30">
                                 <td class="px-4 font-medium">{{ item.description }}</td>
                                 <td class="px-4 text-right">{{ item.qty }}</td>
                                 <td class="px-4 text-center uppercase text-[10px] font-bold text-muted-foreground">{{ item.unit }}</td>
                                 <td class="px-4 text-right">${{ item.unitPrice.toFixed(2) }}</td>
                                 <td class="px-4 text-right font-bold">${{ item.total.toLocaleString(undefined, { minimumFractionDigits: 2 }) }}</td>
                              </tr>
                           </template>
                        </tbody>
                        <tfoot class="border-t-2 bg-muted/20 font-bold">
                           <tr class="h-12">
                              <td colspan="4" class="px-4 text-right">Grand Total Estimate</td>
                              <td class="px-4 text-right text-lg text-primary">${{ (isEditing ? currentEditableTotal : job.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 }) }}</td>
                              <td v-if="isEditing"></td>
                           </tr>
                        </tfoot>
                     </table>
                  </div>
               </CardContent>
            </Card>
         </div>

         <!-- Timeline / Sidebar (Right) -->
         <div class="space-y-6">
             <Card>
                <CardHeader>
                   <CardTitle class="text-base flex items-center gap-2">
                      <History class="size-4 text-primary" />
                      Project Timeline
                   </CardTitle>
                </CardHeader>
                <CardContent class="space-y-4">
                   <div class="flex gap-3">
                      <div class="mt-1 flex-none flex h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
                      <div class="space-y-0.5">
                         <p class="text-xs font-bold uppercase">Created</p>
                         <p class="text-xs text-muted-foreground">{{ job.createdAt?.toDate?.()?.toLocaleString() || 'Just now' }}</p>
                         <p class="text-[10px] text-muted-foreground">By {{ job.createdBy?.name }}</p>
                      </div>
                   </div>
                   <div v-if="job.updatedAt" class="flex gap-3">
                      <div class="mt-1 flex-none flex h-2 w-2 rounded-full bg-primary/40"></div>
                      <div class="space-y-0.5">
                         <p class="text-xs font-bold uppercase">Last Updated</p>
                         <p class="text-xs text-muted-foreground">{{ job.updatedAt?.toDate?.()?.toLocaleString() }}</p>
                      </div>
                   </div>
                </CardContent>
             </Card>

             <div class="bg-blue-50 border border-blue-100 rounded-xl p-6 space-y-3">
                <div class="flex items-center gap-3">
                   <ShieldCheck class="size-6 text-blue-600" />
                   <h3 class="font-bold text-blue-900">Project Certified</h3>
                </div>
                <p class="text-sm text-blue-700 leading-relaxed">
                   This calculation follows the latest structural standards for poultry housing. All rates are verified against the central agric material price list.
                </p>
             </div>
         </div>
      </div>
    </template>

    <!-- Payment Dialog -->
    <div v-if="showPaymentDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
       <Card class="w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
          <CardHeader>
             <CardTitle class="flex items-center gap-2">
                <Landmark class="size-5 text-primary" />
                Collect Fund Payment
             </CardTitle>
             <CardDescription>Enter the amount received from {{ job?.clientName }}.</CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
             <div class="space-y-2">
                <label class="text-sm font-bold">Amount to Record ($)</label>
                <Input v-model.number="payAmount" type="number" placeholder="0.00" class="text-xl font-black h-12" />
                <p class="text-[10px] text-muted-foreground italic">Current Balance: ${{ job?.balance.toLocaleString() }}</p>
             </div>
             
             <div class="space-y-2">
                <label class="text-sm font-bold">Target Account</label>
                <div class="grid grid-cols-3 gap-2">
                   <Button 
                     v-for="acc in ['CASH', 'BANK', 'ECOCASH']" 
                     :key="acc"
                     variant="outline"
                     size="sm"
                     :class="payAccount === acc ? 'bg-primary text-white border-primary' : ''"
                     @click="payAccount = acc as any"
                   >
                      {{ acc }}
                   </Button>
                </div>
             </div>

             <div class="space-y-2">
                <label class="text-sm font-bold">Reference / Notes</label>
                <Input v-model="payNotes" placeholder="e.g. Receipt #1234" />
             </div>
          </CardContent>
          <div class="p-6 pt-0 flex gap-3">
             <Button variant="ghost" class="flex-1" @click="showPaymentDialog = false" :disabled="isPaying">Cancel</Button>
             <Button class="flex-1 font-bold" @click="handleCollectPayment" :disabled="isPaying">
                <Loader2 v-if="isPaying" class="size-4 animate-spin mr-2" />
                Post Payment
             </Button>
          </div>
       </Card>
    </div>
  </div>
</template>
