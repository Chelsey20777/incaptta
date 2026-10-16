<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Payroll</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-datetime v-model="selectedMonth" presentation="month-year" :max="currentMonth" />

      <div v-if="groupedPayslips.length === 0" class="empty-state">
        <ion-icon :icon="documentOutline" size="large" color="medium" />
        <h2>No Payslips Found</h2>
        <p>No payslips for the selected period.</p>
      </div>

      <div v-else>
        <ion-card v-for="group in groupedPayslips" :key="group.employeeId">
          <ion-card-header>
            <ion-card-title>{{ group.employeeName }}</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <ion-list>
              <ion-item v-for="payslip in group.payslips" :key="payslip.id" button @click="viewDetail(payslip.id)">
                <ion-label>
                  <h3>{{ payslip.payslipNumber }}</h3>
                  <p>{{ formatDate(payslip.payPeriodStart) }} - {{ formatDate(payslip.payPeriodEnd) }}</p>
                </ion-label>
                <ion-label slot="end">
                  <h2>{{ formatCurrency(payslip.netPay) }}</h2>
                  <ion-badge :color="getStatusColor(payslip.status)">{{ payslip.status }}</ion-badge>
                </ion-label>
              </ion-item>
            </ion-list>
          </ion-card-content>
        </ion-card>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonList, IonItem, IonLabel, IonCard, IonCardHeader, IonCardTitle, IonCardContent,
  IonDatetime, IonBadge, IonIcon
} from '@ionic/vue'
import { documentOutline } from 'ionicons/icons'
import { useHrStore } from '../store/hrStore'

const router = useRouter()
const hrStore = useHrStore()

const selectedMonth = ref(new Date().toISOString())
const currentMonth = new Date().toISOString()

const filteredPayslips = computed(() => {
  if (!selectedMonth.value) return hrStore.payslips
  const month = new Date(selectedMonth.value).getMonth()
  const year = new Date(selectedMonth.value).getFullYear()
  return hrStore.payslips.filter(p => {
    const date = p.payPeriodStart instanceof Date ? p.payPeriodStart : new Date(p.payPeriodStart)
    return date.getMonth() === month && date.getFullYear() === year
  })
})

const groupedPayslips = computed(() => {
  const groups: Record<string, { employeeId: string; employeeName: string; payslips: any[] }> = {}
  filteredPayslips.value.forEach(p => {
    if (!groups[p.employeeId]) {
      groups[p.employeeId] = {
        employeeId: p.employeeId,
        employeeName: p.employeeName,
        payslips: []
      }
    }
    groups[p.employeeId].payslips.push(p)
  })
  return Object.values(groups)
})

const formatCurrency = (val?: number) => {
  if (val === undefined || val === null) return '0.00'
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val)
}

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    DRAFT: 'medium',
    PROCESSED: 'primary',
    PAID: 'success'
  }
  return colors[status] || 'medium'
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

const viewDetail = (id: string) => {
  router.push(`/tabs/more/hr/payroll/${id}`)
}

onMounted(() => {
  hrStore.fetchPayslips()
})
</script>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
  color: var(--ion-color-medium);
}
.empty-state ion-icon {
  margin-bottom: 16px;
}
.empty-state h2 {
  margin: 8px 0;
  font-size: 20px;
}
.empty-state p {
  margin: 4px 0;
  font-size: 14px;
}
</style>
