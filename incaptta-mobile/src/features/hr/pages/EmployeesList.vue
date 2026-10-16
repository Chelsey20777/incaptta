<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Employees</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="createNew">
            <ion-icon slot="icon-only" :icon="addOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-searchbar v-model="searchQuery" placeholder="Search employees..." />

      <ion-list>
        <ion-item v-for="employee in filteredEmployees" :key="employee.id" button @click="viewDetail(employee.id)">
          <ion-label>
            <h2>{{ employee.employeeNumber }}</h2>
            <h3>{{ employee.fullName || (employee.firstName + ' ' + employee.lastName) }}</h3>
            <p>{{ employee.jobTitle || employee.position }} - {{ employee.department }}</p>
          </ion-label>
          <ion-badge slot="end" :color="getStatusColor(employee.status)">
            {{ employee.status }}
          </ion-badge>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { 
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonSearchbar, IonList, IonItem, IonBadge, IonButton, IonButtons, IonIcon, IonLabel
} from '@ionic/vue'
import { addOutline } from 'ionicons/icons'
import { useHrStore } from '../store/hrStore'

const router = useRouter()
const hrStore = useHrStore()

const searchQuery = ref('')

const filteredEmployees = computed(() => {
  let employees = hrStore.employees

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    employees = employees.filter(e => 
      e.employeeNumber.toLowerCase().includes(query) ||
      (e.fullName || '').toLowerCase().includes(query) ||
      (e.firstName || '').toLowerCase().includes(query) ||
      (e.lastName || '').toLowerCase().includes(query) ||
      (e.jobTitle || e.position || '').toLowerCase().includes(query)
    )
  }

  return employees
})

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    Active: 'success',
    ACTIVE: 'success',
    'On Leave': 'warning',
    Probation: 'primary',
    Terminated: 'danger',
    TERMINATED: 'danger'
  }
  return colors[status] || 'medium'
}

const createNew = () => {
  router.push('/tabs/more/hr/employees/new')
}

const viewDetail = (id: string) => {
  router.push(`/tabs/more/hr/employees/${id}`)
}

onMounted(() => {
  hrStore.fetchEmployees()
})
</script>
