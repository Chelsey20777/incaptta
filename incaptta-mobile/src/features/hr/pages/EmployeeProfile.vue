<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button />
        </ion-buttons>
        <ion-title>{{ employee?.fullName || 'Employee Profile' }}</ion-title>
        <ion-buttons slot="end" v-if="canEdit">
          <ion-button @click="editEmployee">
            <ion-icon slot="icon-only" :icon="pencilOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div v-if="employee">
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ employee.fullName }}</ion-card-title>
            <ion-card-subtitle>{{ employee.employeeNumber }}</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <ion-item lines="none">
              <ion-label>
                <p>Job Title</p>
                <h3>{{ employee.jobTitle || employee.position }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none">
              <ion-label>
                <p>Department</p>
                <h3>{{ employee.department }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none">
              <ion-label>
                <p>Contract Type</p>
                <h3>{{ employee.contractType || employee.employmentType }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none">
              <ion-label>
                <p>Status</p>
                <h3 :color="getStatusColor(employee.status)">{{ employee.status }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none" v-if="employee.contractStartDate">
              <ion-label>
                <p>Contract Start</p>
                <h3>{{ formatDate(employee.contractStartDate) }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none" v-if="employee.contractEndDate">
              <ion-label>
                <p>Contract End</p>
                <h3>{{ formatDate(employee.contractEndDate) }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none">
              <ion-label>
                <p>Basic Salary</p>
                <h2>{{ formatCurrency(employee.salary || employee.basicSalary) }}</h2>
              </ion-label>
            </ion-item>
          </ion-card-content>
        </ion-card>

        <!-- Attendance Summary -->
        <ion-card>
          <ion-card-header>
            <ion-card-title>Attendance Summary (This Month)</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <ion-item lines="none">
              <ion-label>
                <p>Days Clocked In</p>
                <h2>{{ daysClockedIn }}</h2>
              </ion-label>
            </ion-item>
          </ion-card-content>
        </ion-card>

        <!-- Payroll History -->
        <ion-card>
          <ion-card-header>
            <ion-card-title>Payroll History</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <ion-list>
              <ion-item v-for="payslip in recentPayslips" :key="payslip.id" button @click="viewPayslip(payslip.id)">
                <ion-label>
                  <h3>{{ payslip.period }}</h3>
                  <p>Net Pay: {{ formatCurrency(payslip.netPay) }}</p>
                  <p>{{ formatDate(payslip.generatedAt) }}</p>
                </ion-label>
              </ion-item>
            </ion-list>
            <div v-if="recentPayslips.length === 0" class="empty-state">
              <p>No payslips found</p>
            </div>
          </ion-card-content>
        </ion-card>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent,
  IonButtons, IonBackButton, IonButton, IonIcon, IonItem, IonLabel, IonList
} from '@ionic/vue'
import { pencilOutline } from 'ionicons/icons'
import { useHrStore } from '../store/hrStore'
import { useAuthStore } from '@/stores/authStore'

const route = useRoute()
const router = useRouter()
const hrStore = useHrStore()
const authStore = useAuthStore()

const employee = computed(() =>
  hrStore.employees.find(e => e.id === route.params.id)
)

const canEdit = computed(() => {
  return authStore.hasAnyRole(['MANAGER', 'ADMIN', 'SUPER_ADMIN'] as any)
})

const daysClockedIn = computed(() => {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  
  return hrStore.attendanceRecords.filter(a => {
    if (!a.employeeId || a.employeeId !== employee.value?.id) return false
    const date = a.date instanceof Date ? a.date : new Date(a.date)
    return date >= startOfMonth
  }).length
})

const recentPayslips = computed(() => {
  if (!employee.value) return []
  return hrStore.payslips
    .filter(p => p.employeeId === employee.value.id)
    .slice(0, 3)
})

const formatCurrency = (val?: number) => {
  if (val === undefined || val === null) return '0.00'
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val)
}

const formatDate = (date: any) => {
  if (!date) return ''
  const d = date.toDate ? date.toDate() : new Date(date)
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    Active: 'success',
    ACTIVE: 'success',
    'On Leave': 'warning',
    ON_LEAVE: 'warning',
    Probation: 'primary',
    Terminated: 'danger',
    TERMINATED: 'danger',
    INACTIVE: 'medium'
  }
  return colors[status] || 'medium'
}

const editEmployee = () => {
  router.push(`/tabs/more/hr/employees/${employee.value?.id}/edit`)
}

const viewPayslip = (id: string) => {
  router.push(`/tabs/more/hr/payroll/${id}`)
}

onMounted(() => {
  if (hrStore.employees.length === 0) {
    hrStore.fetchEmployees()
  }
  hrStore.fetchAttendance()
  hrStore.fetchPayslips()
})
</script>

<style scoped>
.empty-state {
  text-align: center;
  padding: 24px;
  color: var(--ion-color-medium);
}
</style>
