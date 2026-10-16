<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button />
        </ion-buttons>
        <ion-title>Record Top-Up</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-card>
        <ion-card-header>
          <ion-card-title>Top-Up Details</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-item>
            <ion-label position="floating">Account *</ion-label>
            <ion-select v-model="account">
              <ion-select-option value="bank">Bank Account</ion-select-option>
              <ion-select-option value="cash">Cash</ion-select-option>
              <ion-select-option value="ecocash">EcoCash</ion-select-option>
              <ion-select-option value="ird">IRD</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-label position="floating">Amount *</ion-label>
            <ion-input v-model="amount" type="number" />
          </ion-item>
          <ion-item>
            <ion-label position="floating">Description</ion-label>
            <ion-textarea v-model="description" rows="3" />
          </ion-item>
          <ion-item>
            <ion-label position="floating">Date *</ion-label>
            <ion-datetime v-model="date" presentation="date" />
          </ion-item>
        </ion-card-content>
      </ion-card>

      <ion-button expand="block" size="large" @click="save" :disabled="!isFormValid">
        Record Top-Up
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
  IonButtons, IonBackButton, IonButton,
  IonItem, IonLabel, IonInput, IonTextarea, IonSelect, IonSelectOption, IonDatetime
} from '@ionic/vue'
import { useFundTransfersStore } from '../store/fundTransfersStore'
import { useAuthStore } from '@/stores/authStore'

const router = useRouter()
const transfersStore = useFundTransfersStore()
const authStore = useAuthStore()

const account = ref('')
const amount = ref(0)
const description = ref('')
const date = ref(new Date().toISOString())

const isFormValid = computed(() => {
  return account.value && amount.value > 0 && date.value
})

const loading = ref(false)

const save = async () => {
  if (!isFormValid.value) return
  
  loading.value = true
  try {
    await transfersStore.recordTopUp({
      account: account.value,
      amount: amount.value,
      description: description.value,
      date: new Date(date.value).toISOString() as any
    }, authStore.userId, authStore.userEmail)
    router.push('/tabs/more/ledger')
  } catch (err) {
    console.error('Failed to record top-up:', err)
  } finally {
    loading.value = false
  }
}
</script>
