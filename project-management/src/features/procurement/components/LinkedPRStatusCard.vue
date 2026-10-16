<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { GitBranch, ChevronDown, ChevronUp, CheckCircle } from 'lucide-vue-next'
import type { ProcurementRequisition } from '../types/index'
import type { PurchaseOrder, GoodsReceiptNote, SupplierInvoice } from '../types/procurement'

const props = defineProps<{
  prId: string
  poId?: string | null
}>()

const router = useRouter()

// Internal data
const pr = ref<ProcurementRequisition | null>(null)
const po = ref<PurchaseOrder | null>(null)
const grn = ref<GoodsReceiptNote | null>(null)
const invoice = ref<SupplierInvoice | null>(null)
const loading = ref(true)
const expanded = ref(false)

onMounted(async () => {
  const { doc, getDoc, collection, query, where, limit, getDocs } = await import('firebase/firestore')
  const { db } = await import('@/lib/firebase')

  try {
    // Fetch PR
    const prSnap = await getDoc(doc(db, 'procurementRequisitions', props.prId))
    if (prSnap.exists()) {
      pr.value = {
        id: prSnap.id,
        ...prSnap.data()
      } as ProcurementRequisition
    }

    // Fetch PO (if poId provided)
    if (props.poId) {
      const poSnap = await getDoc(doc(db, 'procurementPurchaseOrders', props.poId))
      if (poSnap.exists()) {
        po.value = {
          id: poSnap.id,
          ...poSnap.data()
        } as PurchaseOrder
      }
    }

    // Fetch most recent GRN for this PO (if PO exists)
    if (po.value?.id) {
      const grnSnap = await getDocs(
        query(
          collection(db, 'procurementGrns'),
          where('poId', '==', po.value.id),
          limit(1)
        )
      )
      if (!grnSnap.empty && grnSnap.docs[0]) {
        grn.value = {
          id: grnSnap.docs[0].id,
          ...grnSnap.docs[0].data()
        } as GoodsReceiptNote
      }
    }

    // Fetch invoice for this PO (if PO exists)
    if (po.value?.id) {
      const invSnap = await getDocs(
        query(
          collection(db, 'procurementSupplierInvoices'),
          where('poId', '==', po.value.id),
          limit(1)
        )
      )
      if (!invSnap.empty && invSnap.docs[0]) {
        invoice.value = {
          id: invSnap.docs[0].id,
          ...invSnap.docs[0].data()
        } as SupplierInvoice
      }
    }
  } catch (e) {
    console.error('LinkedPRStatusCard fetch error:', e)
  } finally {
    loading.value = false
  }
})

// Step state computed
type StepState = 'complete' | 'current' | 'pending'

const prStep = computed<StepState>(() => {
  if (!pr.value) return 'pending'
  if (pr.value.status === 'APPROVED') return 'complete'
  if (['SUBMITTED','DRAFT'].includes(pr.value.status))
    return 'current'
  return 'pending'
})

const poStep = computed<StepState>(() => {
  if (!po.value) return 'pending'
  if (['ACKNOWLEDGED','PARTIALLY_FULFILLED','COMPLETE']
      .includes(po.value.status)) return 'complete'
  if (po.value.status === 'SENT') return 'current'
  if (po.value.status === 'DRAFT') return 'current'
  return 'pending'
})

const grnStep = computed<StepState>(() => {
  if (!grn.value) return 'pending'
  if (grn.value.status === 'CONFIRMED') return 'complete'
  if (grn.value.status === 'DRAFT') return 'current'
  return 'pending'
})

const invoiceStep = computed<StepState>(() => {
  if (!invoice.value) return 'pending'
  if (invoice.value.status === 'PAYMENT_PROCESSED')
    return 'complete'
  if (['APPROVED','PAYMENT_PENDING',
       'PENDING_MATCH','MATCHED',
       'VARIANCE_FLAGGED'].includes(invoice.value.status))
    return 'current'
  return 'pending'
})

const paidStep = computed<StepState>(() => {
  if (invoice.value?.status === 'PAYMENT_PROCESSED')
    return 'complete'
  return 'pending'
})

const currentStageName = computed(() => {
  if (paidStep.value === 'complete') return 'Paid'
  if (invoiceStep.value === 'current') return 'Invoice'
  if (grnStep.value === 'current') return 'GRN'
  if (poStep.value === 'current') return 'PO'
  if (prStep.value === 'current') return 'PR'
  if (prStep.value === 'complete') return 'PO Pending'
  return 'Draft'
})

// Step labels and routes
const steps = computed(() => [
  {
    label: pr.value?.prNumber ?? 'PR',
    route: `/procurement/requisitions/${props.prId}`,
    docId: props.prId,
    step: prStep.value
  },
  {
    label: po.value?.poNumber ?? 'Pending',
    route: po.value ? `/procurement/purchase-orders/${po.value.id}` : '',
    docId: po.value?.id ?? null,
    step: poStep.value
  },
  {
    label: grn.value?.grnNumber ?? 'Pending',
    route: grn.value ? `/procurement/grns/${grn.value.id}` : '',
    docId: grn.value?.id ?? null,
    step: grnStep.value
  },
  {
    label: invoice.value?.invoiceNumber ?? 'Pending',
    route: invoice.value ? `/procurement/invoices/${invoice.value.id}` : '',
    docId: invoice.value?.id ?? null,
    step: invoiceStep.value
  },
  {
    label: paidStep.value === 'complete' 
      ? (invoice.value?.paymentMethod ?? 'Paid') 
      : 'Pending',
    route: invoice.value ? `/procurement/invoices/${invoice.value.id}` : '',
    docId: invoice.value?.id ?? null,
    step: paidStep.value
  }
])
</script>

<template>
  <div class="w-full">
    <!-- Collapsed State -->
    <div v-if="!loading" class="flex items-center gap-2 mt-1 text-xs">
      <GitBranch :size="12" class="text-blue-500 shrink-0" />
      <span class="text-blue-700 font-medium">
        {{ pr?.prNumber ?? 'PR' }} — {{ currentStageName }}
      </span>
      <button
        @click="expanded = !expanded"
        class="text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronDown v-if="!expanded" :size="12" />
        <ChevronUp v-else :size="12" />
      </button>
    </div>

    <!-- Loading State -->
    <div v-else class="h-4 w-32 bg-gray-200 animate-pulse rounded mt-1"></div>

    <!-- Expanded State -->
    <div v-if="expanded && !loading" class="mt-2 p-3 bg-blue-50 border border-blue-100 rounded-md">
      <div class="flex items-center justify-between">
        <!-- Pipeline Stepper -->
        <div class="flex items-center flex-1">
          <div v-for="(step, index) in steps" :key="index" class="flex items-center">
            <!-- Step Circle -->
            <div class="flex flex-col items-center">
              <div :class="[
                'w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold',
                step.step === 'complete'
                  ? 'bg-green-500 text-white'
                  : step.step === 'current'
                    ? 'border-2 border-blue-500 bg-white text-blue-500'
                    : 'border-2 border-gray-300 bg-white text-gray-400'
              ]">
                <CheckCircle v-if="step.step === 'complete'" :size="12" />
                <div v-else-if="step.step === 'current'" class="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                <div v-else class="w-2 h-2 rounded-full bg-gray-300" />
              </div>

              <!-- Step Label with Link -->
              <router-link
                v-if="step.docId"
                :to="step.route"
                class="text-xs text-blue-600 hover:underline mt-1 text-center max-w-16 leading-tight"
              >
                {{ step.label }}
              </router-link>
              <span
                v-else
                class="text-xs text-muted-foreground mt-1 text-center max-w-16 leading-tight"
              >
                {{ step.label }}
              </span>
            </div>

            <!-- Connector Line -->
            <div
              v-if="index < steps.length - 1"
              :class="[
                'flex-1 h-0.5 mt-2.5',
                step.step === 'complete' ? 'bg-green-400' : 'bg-gray-200'
              ]"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>