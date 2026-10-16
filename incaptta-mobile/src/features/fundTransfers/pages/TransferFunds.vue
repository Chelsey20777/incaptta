<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button />
        </ion-buttons>
        <ion-title>Transfer Funds</ion-title>
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
          <ion-card-title>Transfer Details</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-item>
            <ion-label position="floating">From Account *</ion-label>
            <ion-select v-model="fromAccount">
              <ion-select-option value="bank">Bank Account</ion-select-option>
              <ion-select-option value="cash">Cash</ion-select-option>
              <ion-select-option value="ecocash">EcoCash</ion-select-option>
              <ion-select-option value="ird">IRD</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-label position="floating">To Account *</ion-label>
            <ion-select v-model="toAccount">
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
        Submit Transfer
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
  IonItem, IonLabel, IonInput, IonTextarea, IonSelect, IonSelectOption, IonDatetime
} from '@ionic/vue'
import { checkmarkOutline } from 'ionicons/icons'
import { useFundTransfersStore } from '../store/fundTransfersStore'
import { useAuthStore } from '@/stores/authStore'

const router = useRouter()
const transfersStore = useFundTransfersStore()
const authStore = useAuthStore()

const fromAccount = ref('')
const toAccount = ref('')
const amount = ref(0)
const description = ref('')
const date = ref(new Date().toISOString())

const isFormValid = computed(() => {
  return fromAccount.value && 
         toAccount.value &&
         fromAccount.value !== toAccount.value &&
         amount.value > 0 &&
         date.value
})

const loading = ref(false)

const save = async () => {
  if (!isFormValid.value) return
  
  loading.value = true
  try {
    await transfersStore.initiateTransfer({
      fromAccount: fromAccount.value,
      toAccount: toAccount.value,
      amount: amount.value,
      description: description.value,
      date: new Date(date.value).toISOString() as any,
      reference: description.value
    }, {
      name: authStore.displayName || authStore.userEmail,
      email: authStore.userEmail
    })
    router.push('/tabs/more/transfers')
  } catch (err) {
    console.error('Failed to initiate transfer:', err)
  } finally {
    loading.value = false
  }
}

const getAccountName = (account: string): string => {
  const names: Record<string, string> = {
    bank: 'Bank Account',
    cash: 'Cash',
    ecocash: 'EcoCash',
    ird: 'IRD'
  }
  return names[account] || account
}
</script>
