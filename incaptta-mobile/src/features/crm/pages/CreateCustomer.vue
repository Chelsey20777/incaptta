<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button />
        </ion-buttons>
        <ion-title>Create Customer</ion-title>
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
          <ion-card-title>Customer Information</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-item>
            <ion-label position="floating">Name *</ion-label>
            <ion-input v-model="formData.name" required />
          </ion-item>
          <ion-item>
            <ion-label position="floating">Company</ion-label>
            <ion-input v-model="formData.company" />
          </ion-item>
          <ion-item>
            <ion-label position="floating">Email</ion-label>
            <ion-input v-model="formData.email" type="email" />
          </ion-item>
          <ion-item>
            <ion-label position="floating">Phone</ion-label>
            <ion-input v-model="formData.phone" type="tel" />
          </ion-item>
          <ion-item>
            <ion-label position="floating">Address</ion-label>
            <ion-textarea v-model="formData.address" rows="2" />
          </ion-item>
          <ion-item>
            <ion-label position="floating">City</ion-label>
            <ion-input v-model="formData.city" />
          </ion-item>
          <ion-item>
            <ion-label position="floating">Country</ion-label>
            <ion-input v-model="formData.country" />
          </ion-item>
          <ion-item>
            <ion-label position="floating">Credit Limit</ion-label>
            <ion-input v-model="formData.creditLimit" type="number" />
          </ion-item>
          <ion-item>
            <ion-label position="floating">Notes</ion-label>
            <ion-textarea v-model="formData.notes" rows="3" />
          </ion-item>
        </ion-card-content>
      </ion-card>

      <ion-button expand="block" size="large" @click="save" :disabled="!isFormValid">
        Create Customer
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
  IonItem, IonLabel, IonInput, IonTextarea
} from '@ionic/vue'
import { checkmarkOutline } from 'ionicons/icons'
import { useCrmStore } from '../store/crmStore'
import { useAuthStore } from '@/stores/authStore'

const router = useRouter()
const crmStore = useCrmStore()
const authStore = useAuthStore()

const formData = ref({
  name: '',
  company: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  country: '',
  creditLimit: 0,
  notes: ''
})

const isFormValid = computed(() => {
  return formData.value.name.trim() !== ''
})

const save = () => {
  const customer = crmStore.createCustomer({
    ...formData.value,
    creditLimit: formData.value.creditLimit || undefined
  }, authStore.userId)

  console.log('Creating customer:', customer)
  router.push('/tabs/crm/customers')
}
</script>
