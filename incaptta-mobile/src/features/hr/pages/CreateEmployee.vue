<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button />
        </ion-buttons>
        <ion-title>Create Employee</ion-title>
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
          <ion-card-title>Employee Information</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-item>
            <ion-label position="floating">First Name *</ion-label>
            <ion-input v-model="formData.firstName" required />
          </ion-item>
          <ion-item>
            <ion-label position="floating">Last Name *</ion-label>
            <ion-input v-model="formData.lastName" required />
          </ion-item>
          <ion-item>
            <ion-label position="floating">Employee Number</ion-label>
            <ion-input v-model="formData.employeeNumber" placeholder="Auto-generated if blank" />
          </ion-item>
          <ion-item>
            <ion-label position="floating">Job Title *</ion-label>
            <ion-input v-model="formData.jobTitle" required />
          </ion-item>
          <ion-item>
            <ion-label position="floating">Department *</ion-label>
            <ion-select v-model="formData.department">
              <ion-select-option value="Sales">Sales</ion-select-option>
              <ion-select-option value="Technical">Technical</ion-select-option>
              <ion-select-option value="Operations">Operations</ion-select-option>
              <ion-select-option value="Finance">Finance</ion-select-option>
              <ion-select-option value="HR">HR</ion-select-option>
              <ion-select-option value="Management">Management</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-label position="floating">Contract Type *</ion-label>
            <ion-select v-model="formData.contractType">
              <ion-select-option value="Full-Time">Full Time</ion-select-option>
              <ion-select-option value="Part-Time">Part Time</ion-select-option>
              <ion-select-option value="Contract">Contract</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-label position="floating">Contract Start Date</ion-label>
            <ion-datetime v-model="formData.contractStartDate" presentation="date" />
          </ion-item>
          <ion-item>
            <ion-label position="floating">Contract End Date (Optional)</ion-label>
            <ion-datetime v-model="formData.contractEndDate" presentation="date" />
          </ion-item>
          <ion-item>
            <ion-label position="floating">Salary *</ion-label>
            <ion-input v-model="formData.salary" type="number" required />
          </ion-item>
          <ion-item>
            <ion-label position="floating">Status</ion-label>
            <ion-select v-model="formData.status">
              <ion-select-option value="Active">Active</ion-select-option>
              <ion-select-option value="On Leave">On Leave</ion-select-option>
              <ion-select-option value="Probation">Probation</ion-select-option>
              <ion-select-option value="Terminated">Terminated</ion-select-option>
            </ion-select>
          </ion-item>
        </ion-card-content>
      </ion-card>

      <ion-button expand="block" size="large" @click="save" :disabled="!isFormValid">
        Create Employee
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
  IonItem, IonLabel, IonInput, IonSelect, IonSelectOption, IonDatetime
} from '@ionic/vue'
import { checkmarkOutline } from 'ionicons/icons'
import { useHrStore } from '../store/hrStore'
import { useAuthStore } from '@/stores/authStore'

const router = useRouter()
const hrStore = useHrStore()
const authStore = useAuthStore()

const formData = ref({
  firstName: '',
  lastName: '',
  employeeNumber: '',
  jobTitle: '',
  department: '',
  contractType: 'Full-Time',
  contractStartDate: '',
  contractEndDate: '',
  salary: 0,
  status: 'Active'
})

const isFormValid = computed(() => {
  return formData.value.firstName && 
         formData.value.lastName && 
         formData.value.jobTitle &&
         formData.value.department &&
         formData.value.salary > 0
})

const loading = ref(false)

const save = async () => {
  if (!isFormValid.value) return
  
  loading.value = true
  try {
    const fullName = `${formData.value.firstName} ${formData.value.lastName}`
    const id = await hrStore.createEmployee({
      fullName,
      firstName: formData.value.firstName,
      lastName: formData.value.lastName,
      employeeNumber: formData.value.employeeNumber || `EMP-${Date.now()}`,
      jobTitle: formData.value.jobTitle,
      department: formData.value.department,
      contractType: formData.value.contractType as any,
      contractStartDate: formData.value.contractStartDate ? new Date(formData.value.contractStartDate as string) : undefined,
      contractEndDate: formData.value.contractEndDate ? new Date(formData.value.contractEndDate as string) : undefined,
      salary: formData.value.salary,
      status: formData.value.status as any
    }, authStore.userId, authStore.userEmail)

    console.log('Created employee with ID:', id)
    router.push('/tabs/more/hr/employees')
  } catch (err) {
    console.error('Failed to create employee:', err)
  } finally {
    loading.value = false
  }
}
</script>
