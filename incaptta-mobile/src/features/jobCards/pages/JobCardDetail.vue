<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button />
        </ion-buttons>
        <ion-title>{{ jobCard?.jobNumber }}</ion-title>
        <ion-buttons slot="end">
          <ion-button v-if="canEdit" @click="editJobCard">
            <ion-icon slot="icon-only" :icon="pencilOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div v-if="jobCard">
        <ion-card>
          <ion-card-header>
            <ion-card-subtitle>{{ jobCard.generalInfo?.recipientName || jobCard.customerName }}</ion-card-subtitle>
            <ion-card-title>{{ jobCard.generalInfo?.jobTitle || jobCard.jobTitle }}</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <p>{{ jobCard.generalInfo?.projectDescription || jobCard.description }}</p>
            <ion-item lines="none">
              <ion-label>
                <p>Status</p>
                <h3 :color="getStatusColor(jobCard.status)">{{ jobCard.status }}</h3>
              </ion-label>
              <ion-badge slot="end" :color="getPriorityColor(jobCard.generalInfo?.priority || jobCard.priority || 'MEDIUM')">
                {{ jobCard.generalInfo?.priority || jobCard.priority || 'MEDIUM' }}
              </ion-badge>
            </ion-item>
            <ion-item lines="none">
              <ion-label>
                <p>Department</p>
                <h3>{{ jobCard.generalInfo?.requestingDepartmentId || jobCard.department }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none" v-if="jobCard.generalInfo?.projectLocation || jobCard.siteAddress">
              <ion-label>
                <p>Site/Project Location</p>
                <h3>{{ jobCard.generalInfo?.projectLocation || jobCard.siteAddress }}</h3>
              </ion-label>
            </ion-item>
          </ion-card-content>
        </ion-card>

        <!-- Financial Summary -->
        <ion-card v-if="jobCard.financialSummary">
          <ion-card-header>
            <ion-card-title>Financial Summary</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <ion-grid>
              <ion-row>
                <ion-col size="6">
                  <ion-label color="medium">IRD Gross Revenue</ion-label>
                  <h2>${{ formatCurrency(jobCard.financialSummary.irdGrossRevenue) }}</h2>
                </ion-col>
                <ion-col size="6">
                  <ion-label color="medium">TWID Amount</ion-label>
                  <h2>${{ formatCurrency(jobCard.financialSummary.twidAmount) }}</h2>
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="6">
                  <ion-label color="medium">Target Job Net</ion-label>
                  <h2>${{ formatCurrency(jobCard.financialSummary.targetJobNet) }}</h2>
                </ion-col>
                <ion-col size="6">
                  <ion-label color="medium">Final Net Revenue</ion-label>
                  <h2 :color="jobCard.financialSummary.isProfitUp ? 'success' : 'danger'">
                    ${{ formatCurrency(jobCard.financialSummary.finalNetRevenue) }}
                  </h2>
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>

        <!-- Requisition Items -->
        <ion-card>
          <ion-card-header>
            <ion-card-title>Requisition Items</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <div v-for="(section, sIndex) in jobCard.requisitionSections" :key="sIndex">
              <h3>{{ section.title }}</h3>
              <ion-list v-if="section.items">
                <ion-item v-for="(item, iIndex) in section.items" :key="iIndex">
                  <ion-label>
                    <h3>Qty: {{ item.qty }}</h3>
                    <p>IRD: ${{ item.irdSellingPrice }} | Cost: ${{ item.costSnapshot }}</p>
                  </ion-label>
                  <ion-badge v-if="item.isAdjustment" color="danger">Adjustment</ion-badge>
                </ion-item>
              </ion-list>
            </div>
          </ion-card-content>
        </ion-card>

        <!-- Submit for Approval -->
        <ion-card v-if="jobCard?.status === 'DRAFT'">
          <ion-card-content>
            <ion-button expand="block" color="primary" @click="submitForApproval">
              Submit for Approval
            </ion-button>
          </ion-card-content>
        </ion-card>

        <!-- Approval Timeline -->
        <ion-card v-if="jobCard?.approvalTimeline">
          <ion-card-header>
            <ion-card-title>Approval Timeline</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <ion-list>
              <ion-item v-for="entry in jobCard.approvalTimeline" :key="entry.date">
                <ion-label>
                  <h3>{{ entry.status }}</h3>
                  <p>{{ entry.user }} · {{ formatDate(entry.date) }}</p>
                  <p v-if="entry.comment">{{ entry.comment }}</p>
                </ion-label>
              </ion-item>
            </ion-list>
          </ion-card-content>
        </ion-card>

        <!-- Approval Actions -->
        <ion-card v-if="canApprove">
          <ion-card-content>
            <ion-button expand="block" color="success" @click="approve">
              Approve
            </ion-button>
            <ion-button expand="block" color="danger" @click="reject">
              Reject
            </ion-button>
          </ion-card-content>
        </ion-card>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent,
  IonButtons, IonBackButton, IonButton, IonIcon, IonBadge,
  IonItem, IonLabel, IonGrid, IonRow, IonCol, IonList
} from '@ionic/vue'
import { pencilOutline } from 'ionicons/icons'
import { useJobCardsStore } from '../store/jobCardsStore'
import { useAuthStore } from '@/stores/authStore'
import { alertController } from '@ionic/vue'

const route = useRoute()
const router = useRouter()
const jobCardsStore = useJobCardsStore()
const authStore = useAuthStore()

const formatCurrency = (val?: number) => {
  if (val === undefined || val === null) return '0.00'
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val)
}

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    DRAFT: 'medium',
    SUBMITTED: 'warning',
    APPROVED: 'success',
    IN_PROGRESS: 'primary',
    COMPLETED: 'success',
    CANCELLED: 'danger',
    REJECTED: 'danger'
  }
  return colors[status] || 'medium'
}

const getPriorityColor = (priority: string) => {
  const colors: Record<string, string> = {
    LOW: 'success',
    MEDIUM: 'warning',
    HIGH: 'danger',
    URGENT: 'danger'
  }
  return colors[priority] || 'medium'
}

const jobCard = computed(() => 
  jobCardsStore.jobCards.find(jc => jc.id === route.params.id)
)

const editJobCard = () => {
  if (jobCard.value) {
    router.push(`/tabs/jobs/edit/${jobCard.value.id}`)
  }
}

const canEdit = computed(() => jobCard.value ? jobCard.value.status === 'DRAFT' : false)
const canApprove = computed(() => {
  if (!jobCard.value) return false
  const status = jobCard.value.status
  const isSuper = authStore.hasRole('SUPER_ADMIN' as any) || authStore.hasRole('ADMIN' as any)
  
  if (status === 'SUBMITTED' || status === 'APPROVAL_PENDING_ACCOUNTANT') {
    return isSuper || authStore.hasRole('ACCOUNTANT' as any)
  }
  if (status === 'APPROVAL_PENDING_MANAGER') {
    return isSuper || authStore.hasRole('MANAGER' as any)
  }
  return false
})

const loading = ref(false)

const approve = async () => {
  if (jobCard.value) {
    loading.value = true
    try {
      await jobCardsStore.handleApproval(
        jobCard.value.id, 
        jobCard.value.status, 
        authStore.userRoles[0] as string, 
        authStore.userEmail
      )
    } finally {
      loading.value = false
    }
  }
}

const reject = async () => {
  if (jobCard.value) {
    const alert = await alertController.create({
      header: 'Reject Job Card',
      inputs: [{
        name: 'reason',
        type: 'textarea',
        placeholder: 'Please provide a reason for rejection',
      }],
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Reject',
          handler: (data) => {
            if (data.reason) {
              handleRejection(data.reason)
            }
          },
        },
      ],
    })
    await alert.present()
  }
}

const handleRejection = async (reason: string) => {
  if (jobCard.value) {
    loading.value = true
    try {
      await jobCardsStore.handleRejection(
        jobCard.value.id,
        authStore.userRoles[0] as string,
        authStore.userEmail,
        reason
      )
    } finally {
      loading.value = false
    }
  }
}

const submitForApproval = async () => {
  if (jobCard.value) {
    loading.value = true
    try {
      await jobCardsStore.submitForApproval(
        jobCard.value.id,
        authStore.userId,
        authStore.userEmail
      )
    } finally {
      loading.value = false
    }
  }
}

onMounted(() => {
  if (jobCardsStore.jobCards.length === 0) {
    jobCardsStore.fetchJobCards()
  }
})
</script>
