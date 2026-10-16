<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button />
        </ion-buttons>
        <ion-title>{{ payslip?.payslipNumber || 'Payslip Detail' }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div v-if="payslip">
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ payslip.payslipNumber }}</ion-card-title>
            <ion-card-subtitle>{{ payslip.employeeName }}</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <ion-item lines="none">
              <ion-label>
                <p>Pay Period</p>
                <h3>{{ formatDate(payslip.payPeriodStart) }} - {{ formatDate(payslip.payPeriodEnd) }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none">
              <ion-label>
                <p>Status</p>
                <h3 :color="getStatusColor(payslip.status)">{{ payslip.status }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none">
              <ion-label>
                <p>Generated At</p>
                <h3>{{ formatDate(payslip.generatedAt) }}</h3>
              </ion-label>
            </ion-item>
          </ion-card-content>
        </ion-card>

        <!-- Earnings -->
        <ion-card>
          <ion-card-header>
            <ion-card-title>Earnings</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <ion-item lines="none">
              <ion-label>
                <p>Basic Salary</p>
                <h3>{{ formatCurrency(payslip.basicSalary) }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none" v-if="payslip.overtimePay">
              <ion-label>
                <p>Overtime Pay</p>
                <h3>{{ formatCurrency(payslip.overtimePay) }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none" v-if="payslip.bonuses">
              <ion-label>
                <p>Bonuses</p>
                <h3>{{ formatCurrency(payslip.bonuses) }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none" v-if="payslip.allowances">
              <ion-label>
                <p>Allowances</p>
                <h3>{{ formatCurrency(payslip.allowances) }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none">
              <ion-label>
                <p><strong>Gross Pay</strong></p>
                <h2>{{ formatCurrency(payslip.grossPay) }}</h2>
              </ion-label>
            </ion-item>
          </ion-card-content>
        </ion-card>

        <!-- Deductions -->
        <ion-card>
          <ion-card-header>
            <ion-card-title>Deductions</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <ion-item lines="none" v-if="payslip.tax">
              <ion-label>
                <p>Tax</p>
                <h3>{{ formatCurrency(payslip.tax) }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none" v-if="payslip.socialSecurity">
              <ion-label>
                <p>Social Security</p>
                <h3>{{ formatCurrency(payslip.socialSecurity) }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none" v-if="payslip.pension">
              <ion-label>
                <p>Pension</p>
                <h3>{{ formatCurrency(payslip.pension) }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none" v-if="payslip.otherDeductions">
              <ion-label>
                <p>Other Deductions</p>
                <h3>{{ formatCurrency(payslip.otherDeductions) }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none">
              <ion-label>
                <p><strong>Total Deductions</strong></p>
                <h2>{{ formatCurrency(payslip.totalDeductions) }}</h2>
              </ion-label>
            </ion-item>
          </ion-card-content>
        </ion-card>

        <!-- Net Pay -->
        <ion-card color="success">
          <ion-card-header>
            <ion-card-title>Net Pay</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <h1 style="text-align: center; font-size: 36px; margin: 0;">
              {{ formatCurrency(payslip.netPay) }}
            </h1>
          </ion-card-content>
        </ion-card>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent,
  IonButtons, IonBackButton, IonItem, IonLabel
} from '@ionic/vue'
import { useHrStore } from '../store/hrStore'

const route = useRoute()
const hrStore = useHrStore()

const payslip = computed(() =>
  hrStore.payslips.find(p => p.id === route.params.id)
)

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
    DRAFT: 'medium',
    PROCESSED: 'primary',
    PAID: 'success'
  }
  return colors[status] || 'medium'
}

onMounted(() => {
  if (hrStore.payslips.length === 0) {
    hrStore.fetchPayslips()
  }
})
</script>
