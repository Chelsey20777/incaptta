<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button />
        </ion-buttons>
        <ion-title>Request Container Access</ion-title>
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
          <ion-card-title>Access Request Details</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-item>
            <ion-label position="floating">Department *</ion-label>
            <ion-select v-model="formData.department">
              <ion-select-option value="Technical">Technical</ion-select-option>
              <ion-select-option value="Operations">Operations</ion-select-option>
              <ion-select-option value="Storekeeper">Storekeeper</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-label position="floating">Container ID *</ion-label>
            <ion-input v-model="formData.containerId" />
          </ion-item>
          <ion-item>
            <ion-label position="floating">Container Location *</ion-label>
            <ion-input v-model="formData.containerLocation" />
          </ion-item>
          <ion-item>
            <ion-label position="floating">Date *</ion-label>
            <ion-datetime v-model="formData.date" presentation="date" />
          </ion-item>
          <ion-item>
            <ion-label position="floating">Start Time *</ion-label>
            <ion-datetime v-model="formData.startTime" presentation="time" />
          </ion-item>
          <ion-item>
            <ion-label position="floating">End Time *</ion-label>
            <ion-datetime v-model="formData.endTime" presentation="time" />
          </ion-item>
          <ion-item>
            <ion-label position="floating">Purpose *</ion-label>
            <ion-textarea v-model="formData.purpose" rows="3" />
          </ion-item>
        </ion-card-content>
      </ion-card>

      <ion-button expand="block" size="large" @click="save" :disabled="!isFormValid">
        Submit Request
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
import { useContainerAccessStore } from '../store/containerAccessStore'
import { useAuthStore } from '@/stores/authStore'

const router = useRouter()
const caaStore = useContainerAccessStore()
const authStore = useAuthStore()

const formData = ref({
  department: '',
  containerId: '',
  containerLocation: '',
  date: new Date().toISOString(),
  startTime: '',
  endTime: '',
  purpose: ''
})

const isFormValid = computed(() => {
  return formData.value.department && 
         formData.value.containerId &&
         formData.value.containerLocation &&
         formData.value.date &&
         formData.value.startTime &&
         formData.value.endTime &&
         formData.value.purpose
})

const loading = ref(false)

const save = async () => {
  if (!isFormValid.value) return
  
  loading.value = true
  try {
    await caaStore.createCAA({
      ...formData.value,
      date: new Date(formData.value.date).toISOString() as any
    }, authStore.userId, authStore.displayName || authStore.userEmail)
    router.push('/tabs/more/container-access')
  } catch (err) {
    console.error('Failed to create CAA request:', err)
  } finally {
    loading.value = false
  }
}
</script>
