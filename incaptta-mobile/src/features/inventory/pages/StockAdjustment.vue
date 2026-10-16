<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button />
        </ion-buttons>
        <ion-title>Stock Adjustment</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-card>
        <ion-card-header>
          <ion-card-title>Adjust Stock</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-item>
            <ion-label position="floating">Adjustment Type</ion-label>
            <ion-select v-model="adjustmentType">
              <ion-select-option value="INCREASE">Increase Stock</ion-select-option>
              <ion-select-option value="DECREASE">Decrease Stock</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-label position="floating">Quantity</ion-label>
            <ion-input v-model="quantity" type="number" />
          </ion-item>
          <ion-item>
            <ion-label position="floating">Reason</ion-label>
            <ion-textarea v-model="reason" rows="3" />
          </ion-item>
        </ion-card-content>
      </ion-card>

      <ion-button expand="block" size="large" @click="save" :disabled="!isFormValid">
        Submit Adjustment
      </ion-button>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonCard, IonCardHeader, IonCardTitle, IonCardContent,
  IonButtons, IonBackButton, IonButton,
  IonItem, IonLabel, IonInput, IonTextarea, IonSelect, IonSelectOption
} from '@ionic/vue'
import { useInventoryStore } from '../store/inventoryStore'
import { useAuthStore } from '@/stores/authStore'

const route = useRoute()
const router = useRouter()
const inventoryStore = useInventoryStore()
const authStore = useAuthStore()

const adjustmentType = ref<'INCREASE' | 'DECREASE'>('INCREASE')
const quantity = ref(0)
const reason = ref('')

const isFormValid = computed(() => {
  return quantity.value > 0 && reason.value.trim() !== ''
})

const loading = ref(false)

const save = async () => {
  if (!isFormValid.value) return
  
  loading.value = true
  try {
    const id = route.params.id as string
    await inventoryStore.adjustStock(
      id, 
      quantity.value, 
      adjustmentType.value, 
      reason.value, 
      authStore.userId
    )
    router.push(`/tabs/inventory/${id}`)
  } catch (err) {
    console.error('Failed to adjust stock:', err)
  } finally {
    loading.value = false
  }
}
</script>
