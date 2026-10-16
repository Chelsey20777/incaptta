<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button />
        </ion-buttons>
        <ion-title>Create Inventory Item</ion-title>
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
          <ion-card-title>Item Information</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-item>
            <ion-label position="floating">Item Code *</ion-label>
            <ion-input v-model="formData.itemCode" required />
          </ion-item>
          <ion-item>
            <ion-label position="floating">Item Name *</ion-label>
            <ion-input v-model="formData.itemName" required />
          </ion-item>
          <ion-item>
            <ion-label position="floating">Description</ion-label>
            <ion-textarea v-model="formData.description" rows="2" />
          </ion-item>
          <ion-item>
            <ion-label position="floating">Category *</ion-label>
            <ion-select v-model="formData.category">
              <ion-select-option value="Materials">Materials</ion-select-option>
              <ion-select-option value="Equipment">Equipment</ion-select-option>
              <ion-select-option value="Tools">Tools</ion-select-option>
              <ion-select-option value="Consumables">Consumables</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-label position="floating">Unit *</ion-label>
            <ion-select v-model="formData.unit">
              <ion-select-option value="pcs">Pieces</ion-select-option>
              <ion-select-option value="kg">Kilograms</ion-select-option>
              <ion-select-option value="m">Meters</ion-select-option>
              <ion-select-option value="l">Liters</ion-select-option>
              <ion-select-option value="box">Box</ion-select-option>
            </ion-select>
          </ion-item>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header>
          <ion-card-title>Pricing & Stock</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-item>
            <ion-label position="floating">Purchase Price *</ion-label>
            <ion-input v-model="formData.purchasePrice" type="number" />
          </ion-item>
          <ion-item>
            <ion-label position="floating">Freight/Duty</ion-label>
            <ion-input v-model="formData.freightDuty" type="number" />
          </ion-item>
          <ion-item>
            <ion-label position="floating">Selling Price *</ion-label>
            <ion-input v-model="formData.sellingPrice" type="number" />
          </ion-item>
          <ion-item>
            <ion-label position="floating">TWID Markup %</ion-label>
            <ion-input v-model="formData.twidMarkupPercent" type="number" />
          </ion-item>
          <ion-item>
            <ion-label position="floating">Current Stock</ion-label>
            <ion-input v-model="formData.currentStock" type="number" />
          </ion-item>
          <ion-item>
            <ion-label position="floating">Minimum Stock</ion-label>
            <ion-input v-model="formData.minimumStock" type="number" />
          </ion-item>
        </ion-card-content>
      </ion-card>

      <ion-button expand="block" size="large" @click="save" :disabled="!isFormValid">
        Create Item
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
  IonItem, IonLabel, IonInput, IonTextarea, IonSelect, IonSelectOption
} from '@ionic/vue'
import { checkmarkOutline } from 'ionicons/icons'
import { useInventoryStore } from '../store/inventoryStore'
import { useAuthStore } from '@/stores/authStore'
import type { InventoryFormData } from '../types'

const router = useRouter()
const inventoryStore = useInventoryStore()
const authStore = useAuthStore()

const formData = ref<InventoryFormData>({
  itemCode: '',
  itemName: '',
  description: '',
  category: '',
  unit: '',
  purchasePrice: 0,
  freightDuty: 0,
  sellingPrice: 0,
  twidMarkupPercent: 0,
  currentStock: 0,
  minimumStock: 10
})

const isFormValid = computed(() => {
  return formData.value.itemCode && 
         formData.value.itemName &&
         formData.value.category &&
         formData.value.unit &&
         formData.value.purchasePrice > 0 &&
         formData.value.sellingPrice > 0
})

const save = () => {
  const item = inventoryStore.createInventoryItem(formData.value, authStore.userId)
  console.log('Creating inventory item:', item)
  router.push('/tabs/inventory')
}
</script>
