<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useProcurementStore } from '../store/procurementStore'
import { useSession } from '@/composables/useSession'
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Button } from '@/components/ui/button'
import { ShoppingCart, Loader2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import type { ProcurementRequisition, Supplier } from '../types'

const props = defineProps<{
  requisition: ProcurementRequisition
}>()

const emit = defineEmits<{
  created: [poId: string]
}>()

const router = useRouter()
const procurementStore = useProcurementStore()
const { user: currentUser, hasAnyRole } = useSession()

const isCreating = ref(false)

async function handleCreatePO() {
  // Role check
  if (!hasAnyRole(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TECHNICAL'])) {
    toast.error('Insufficient permissions')
    return
  }

  // Validate requisition has supplier
  if (!props.requisition.supplierId) {
    toast.error('Cannot create PO: Requisition has no supplier assigned')
    return
  }

  isCreating.value = true

  try {
    // Fetch supplier details
    let supplier: Supplier | null = null
    if (props.requisition.supplierId) {
      const supplierDoc = await getDoc(doc(db, 'suppliers', props.requisition.supplierId))
      if (supplierDoc.exists()) {
        supplier = {
          id: supplierDoc.id,
          ...supplierDoc.data()
        } as Supplier
      }
    }

    if (!supplier) {
      toast.error('Supplier not found')
      isCreating.value = false
      return
    }

    // Create PO data
    const poData = {
      prId: props.requisition.id,
      prNumber: props.requisition.prNumber,
      supplierId: props.requisition.supplierId ?? '',
      supplierName: props.requisition.supplierName ?? '',
      supplierEmail: supplier.email ?? '',
      supplierPhone: supplier.phone ?? '',
      paymentTerms: supplier.paymentTerms ?? 'COD',
      items: props.requisition.items,
      totalOrderValue: props.requisition.totalEstimatedCost,
      status: 'DRAFT' as const,
      procurementType: props.requisition.procurementType,
      department: props.requisition.department,
      jobCardId: props.requisition.jobCardId,
      jobCardTitle: props.requisition.jobCardTitle,
      deliveryAddress: '',
      expectedDeliveryDate: null,
      notes: '',
      sentAt: null,
      acknowledgedAt: null,
      createdBy: currentUser.value?.uid ?? ''
    }

    // Call store to add PO
    const poId = await procurementStore.addPurchaseOrder(poData)

    // Write linkedPoId back to the PR so duplicate POs cannot be created
    await updateDoc(doc(db, 'procurementRequisitions', props.requisition.id), {
      linkedPoId: poId,
      updatedAt: serverTimestamp()
    })

    // Success
    toast.success('Purchase Order created', {
      description: `PO created from ${props.requisition.prNumber}`
    })

    // Emit event
    emit('created', poId)

    // Navigate to PO detail
    router.push(`/procurement/purchase-orders/${poId}`)

  } catch (error) {
    console.error('Error creating purchase order:', error)
    toast.error('Failed to create Purchase Order')
  } finally {
    isCreating.value = false
  }
}
</script>

<template>
  <Button
    @click="handleCreatePO"
    :disabled="isCreating"
    class="bg-orange-600 hover:bg-orange-700 text-white"
  >
    <Loader2 v-if="isCreating" class="mr-2 size-4 animate-spin" />
    <ShoppingCart v-else class="mr-2 size-4" />
    {{ isCreating ? 'Creating...' : 'Create Purchase Order' }}
  </Button>
</template>