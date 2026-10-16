<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button />
        </ion-buttons>
        <ion-title>Create Job Card</ion-title>
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
          <ion-card-title>Job Information</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-item>
            <ion-label position="floating">Customer Name *</ion-label>
            <ion-input v-model="formData.customerName" required />
          </ion-item>
          <ion-item>
            <ion-label position="floating">Customer Phone</ion-label>
            <ion-input v-model="formData.customerPhone" type="tel" />
          </ion-item>
          <ion-item>
            <ion-label position="floating">Job Title *</ion-label>
            <ion-input v-model="formData.jobTitle" required />
          </ion-item>
          <ion-item>
            <ion-label position="floating">Description *</ion-label>
            <ion-textarea v-model="formData.description" rows="3" required />
          </ion-item>
          <ion-item>
            <ion-label position="floating">Department *</ion-label>
            <ion-select v-model="formData.department">
              <ion-select-option value="Sales">Sales</ion-select-option>
              <ion-select-option value="Technical">Technical</ion-select-option>
              <ion-select-option value="Operations">Operations</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-label position="floating">Priority</ion-label>
            <ion-select v-model="formData.priority">
              <ion-select-option value="LOW">Low</ion-select-option>
              <ion-select-option value="MEDIUM">Medium</ion-select-option>
              <ion-select-option value="HIGH">High</ion-select-option>
              <ion-select-option value="URGENT">Urgent</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-label position="floating">Start Date</ion-label>
            <ion-datetime v-model="formData.startDate" presentation="date" />
          </ion-item>
          <ion-item>
            <ion-label position="floating">End Date</ion-label>
            <ion-datetime v-model="formData.endDate" presentation="date" />
          </ion-item>
          <ion-item>
            <ion-label position="floating">Site Address</ion-label>
            <ion-input v-model="formData.siteAddress" />
          </ion-item>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header>
          <ion-card-title>Requisition Items</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-button expand="block" @click="addSection">
            <ion-icon slot="start" :icon="addOutline" />
            Add Section
          </ion-button>
          
          <div v-for="(section, sIndex) in requisitionSections" :key="sIndex" class="section">
            <ion-item>
              <ion-label position="floating">Section Title</ion-label>
              <ion-input v-model="section.title" />
              <ion-button slot="end" fill="clear" color="danger" @click="removeSection(sIndex)">
                <ion-icon slot="icon-only" :icon="trashOutline" />
              </ion-button>
            </ion-item>
            <ion-button size="small" @click="addItem(sIndex)">
              <ion-icon slot="start" :icon="addOutline" />
              Add Item
            </ion-button>
            <ion-list v-if="section.items">
              <ion-item v-for="(item, iIndex) in section.items" :key="iIndex">
                <ion-label position="stacked">Qty</ion-label>
                <ion-input v-model="item.qty" type="number" />
                <ion-label position="stacked">IRD Price</ion-label>
                <ion-input v-model="item.irdSellingPrice" type="number" />
                <ion-label position="stacked">Cost</ion-label>
                <ion-input v-model="item.costSnapshot" type="number" />
                <ion-label position="stacked">TWID %</ion-label>
                <ion-input v-model="item.twidMarkupPercent" type="number" />
                <ion-checkbox slot="end" v-model="item.isAdjustment">Adjustment</ion-checkbox>
              </ion-item>
            </ion-list>
          </div>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header>
          <ion-card-title>Ad-Hoc Expenses</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-button expand="block" @click="addExpense">
            <ion-icon slot="start" :icon="addOutline" />
            Add Expense
          </ion-button>
          <ion-list>
            <ion-item v-for="(expense, index) in adHocExpenses" :key="index">
              <ion-label position="stacked">Amount</ion-label>
              <ion-input v-model="expense.totalAmount" type="number" />
              <ion-checkbox slot="end" v-model="expense.isAdjustment">Adjustment</ion-checkbox>
              <ion-button slot="end" fill="clear" color="danger" @click="removeExpense(index)">
                <ion-icon slot="icon-only" :icon="trashOutline" />
              </ion-button>
            </ion-item>
          </ion-list>
        </ion-card-content>
      </ion-card>

      <ion-button expand="block" size="large" @click="save" :disabled="!isFormValid">
        Submit Job Card
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
  IonItem, IonLabel, IonInput, IonTextarea, IonSelect, IonSelectOption,
  IonDatetime, IonCheckbox, IonList
} from '@ionic/vue'
import { addOutline, trashOutline, checkmarkOutline } from 'ionicons/icons'
import { useJobCardsStore } from '../store/jobCardsStore'
import { useAuthStore } from '@/stores/authStore'
import type { JobCardFormData } from '../types'
import type { RequisitionItem, AdHocExpense } from '@/utils/financialEngine'

const router = useRouter()
const jobCardsStore = useJobCardsStore()
const authStore = useAuthStore()

const formData = ref<JobCardFormData>({
  customerName: '',
  customerPhone: '',
  jobTitle: '',
  description: '',
  department: '',
  priority: 'MEDIUM',
  siteAddress: ''
})

const requisitionSections = ref<{ title: string; items?: RequisitionItem[] }[]>([])
const adHocExpenses = ref<AdHocExpense[]>([])

const isFormValid = computed(() => {
  return formData.value.customerName && 
         formData.value.jobTitle && 
         formData.value.description &&
         formData.value.department
})

const addSection = () => {
  requisitionSections.value.push({ title: '', items: [] })
}

const removeSection = (index: number) => {
  requisitionSections.value.splice(index, 1)
}

const addItem = (sectionIndex: number) => {
  if (!requisitionSections.value[sectionIndex].items) {
    requisitionSections.value[sectionIndex].items = []
  }
  requisitionSections.value[sectionIndex].items!.push({
    qty: 0,
    irdSellingPrice: 0,
    costSnapshot: 0,
    twidMarkupPercent: 0,
    isAdjustment: false
  })
}

const addExpense = () => {
  adHocExpenses.value.push({
    totalAmount: 0,
    isAdjustment: false
  })
}

const removeExpense = (index: number) => {
  adHocExpenses.value.splice(index, 1)
}

const loading = ref(false)

const save = async () => {
  if (!isFormValid.value) return
  
  loading.value = true
  try {
    const id = await jobCardsStore.createJobCard({
      ...formData.value,
      startDate: formData.value.startDate ? new Date(formData.value.startDate as string) : undefined as any,
      endDate: formData.value.endDate ? new Date(formData.value.endDate as string) : undefined as any,
      requisitionSections: requisitionSections.value,
      adHocExpenses: adHocExpenses.value,
      inventoryReturns: []
    }, authStore.userId, authStore.userEmail)

    console.log('Created job card with ID:', id)
    router.push('/tabs/jobs')
  } catch (err) {
    console.error('Failed to create job card:', err)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.section {
  margin-bottom: 16px;
  padding: 12px;
  background: var(--ion-color-light);
  border-radius: 8px;
}
</style>
