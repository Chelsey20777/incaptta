<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button />
        </ion-buttons>
        <ion-title>Create Requisition</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="save" :disabled="!isFormValid">
            <ion-icon slot="icon-only" :icon="checkmarkOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-card>
        <ion-card-header>
          <ion-card-title>Requisition Details</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-item>
            <ion-label position="floating">Department *</ion-label>
            <ion-select v-model="formData.department">
              <ion-select-option value="Sales">Sales</ion-select-option>
              <ion-select-option value="Technical">Technical</ion-select-option>
              <ion-select-option value="Operations">Operations</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-label position="floating">Required Date *</ion-label>
            <ion-datetime v-model="formData.requiredDate" presentation="date" />
          </ion-item>
          <ion-item>
            <ion-label position="floating">Reason *</ion-label>
            <ion-textarea v-model="formData.reason" :rows="3" />
          </ion-item>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header>
          <ion-card-title>Items</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-button expand="block" @click="addItem">
            <ion-icon slot="start" :icon="addOutline" />
            Add Item
          </ion-button>
          <ion-list>
            <ion-item v-for="(item, index) in items" :key="index">
              <ion-label position="stacked">Item Name</ion-label>
              <ion-input v-model="item.itemName" />
              <ion-label position="stacked">Quantity</ion-label>
              <ion-input v-model="item.quantity" type="number" />
              <ion-label position="stacked">Unit</ion-label>
              <ion-input v-model="item.unit" />
              <ion-label position="stacked">Unit Cost</ion-label>
              <ion-input v-model="item.estimatedUnitCost" type="number" />
              <ion-button slot="end" fill="clear" color="danger" @click="removeItem(index)">
                <ion-icon slot="icon-only" :icon="trashOutline" />
              </ion-button>
            </ion-item>
          </ion-list>
        </ion-card-content>
      </ion-card>

      <ion-button expand="block" size="large" @click="save" :disabled="!isFormValid">
        Submit Requisition
      </ion-button>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonCard, IonCardHeader, IonCardTitle, IonCardContent,
  IonButtons, IonBackButton, IonButton, IonIcon,
  IonItem, IonLabel, IonInput, IonTextarea, IonSelect, IonSelectOption, IonDatetime, IonList
} from '@ionic/vue'
import { checkmarkOutline, addOutline, trashOutline } from 'ionicons/icons'
import { useProcurementStore } from '../store/procurementStore'
import { useAuthStore } from '@/stores/authStore'
import type { RequisitionItem } from '../types'

const router = useRouter()
const procurementStore = useProcurementStore()
const authStore = useAuthStore()

const formData = ref({
  department: '',
  requiredDate: new Date().toISOString(),
  reason: ''
})

const items = ref<RequisitionItem[]>([])

const isFormValid = computed(() => {
  return formData.value.department && 
         formData.value.reason &&
         items.value.length > 0 &&
         items.value.every(i => i.itemName && i.quantity > 0 && i.estimatedUnitCost > 0)
})

const addItem = () => {
  items.value.push({
    itemName: '',
    description: '',
    quantity: 0,
    unit: 'pcs',
    estimatedUnitCost: 0,
    totalCost: 0
  })
}

const removeItem = (index: number) => {
  items.value.splice(index, 1)
}

const loading = ref(false)

const save = async () => {
  if (!isFormValid.value) return
  
  // Calculate total cost
  items.value.forEach(item => {
    item.totalCost = item.quantity * item.estimatedUnitCost
  })

  const totalEstimatedCost = items.value.reduce((sum, item) => sum + item.totalCost, 0)

  loading.value = true
  try {
    const requisitionData = {
      ...formData.value,
      requiredDate: new Date(formData.value.requiredDate),
      items: items.value.map(i => ({
        ...i,
        quantity: Number(i.quantity),
        estimatedUnitCost: Number(i.estimatedUnitCost),
        totalCost: Number(i.quantity) * Number(i.estimatedUnitCost)
      })),
      totalEstimatedCost
    }

    await procurementStore.addRequisition(
      requisitionData as any, 
      authStore.userId, 
      authStore.displayName || authStore.userEmail
    )
    router.push('/tabs/more/procurement/requisitions')
  } catch (err) {
    console.error('Failed to create requisition:', err)
  } finally {
    loading.value = false
  }
}
</script>
