<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button />
        </ion-buttons>
        <ion-title>{{ caa?.caaNumber || 'CAA Detail' }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div v-if="caa">
        <ion-card>
          <ion-card-header>
            <ion-card-subtitle>{{ caa.caaNumber }}</ion-card-subtitle>
            <ion-card-title>Container Access Authorization</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <ion-item lines="none">
              <ion-label>
                <p>Status</p>
                <h3 :color="getStatusColor(caa.status)">{{ caa.status }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none">
              <ion-label>
                <p>Department</p>
                <h3>{{ caa.department }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none">
              <ion-label>
                <p>Container ID</p>
                <h3>{{ caa.containerId }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none">
              <ion-label>
                <p>Location</p>
                <h3>{{ caa.containerLocation }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none">
              <ion-label>
                <p>Date</p>
                <h3>{{ formatDate(caa.date) }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none">
              <ion-label>
                <p>Time Window</p>
                <h3>{{ caa.startTime }} - {{ caa.endTime }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none">
              <ion-label>
                <p>Purpose</p>
                <h3>{{ caa.purpose }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none">
              <ion-label>
                <p>Requested By</p>
                <h3>{{ caa.requestedByName }}</h3>
              </ion-label>
            </ion-item>
          </ion-card-content>
        </ion-card>

        <!-- Approval Metadata -->
        <ion-card v-if="caa.status === 'APPROVED'">
          <ion-card-header>
            <ion-card-title>Approval Details</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <ion-item lines="none">
              <ion-label>
                <p>Approved By</p>
                <h3>{{ caa.approvedBy }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none">
              <ion-label>
                <p>Approved At</p>
                <h3>{{ formatDate(caa.approvedAt) }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none" v-if="caa.approvalComment">
              <ion-label>
                <p>Comment</p>
                <h3>{{ caa.approvalComment }}</h3>
              </ion-label>
            </ion-item>
          </ion-card-content>
        </ion-card>

        <ion-card v-if="caa.status === 'REJECTED'">
          <ion-card-header>
            <ion-card-title>Rejection Details</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <ion-item lines="none">
              <ion-label>
                <p>Rejected By</p>
                <h3>{{ caa.rejectedBy }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none">
              <ion-label>
                <p>Rejected At</p>
                <h3>{{ formatDate(caa.rejectedAt) }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none" v-if="caa.rejectionReason">
              <ion-label>
                <p>Reason</p>
                <h3>{{ caa.rejectionReason }}</h3>
              </ion-label>
            </ion-item>
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
import { useRoute } from 'vue-router'
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent,
  IonButtons, IonBackButton, IonButton, IonItem, IonLabel
} from '@ionic/vue'
import { alertController } from '@ionic/vue'
import { useContainerAccessStore } from '../store/containerAccessStore'
import { useAuthStore } from '@/stores/authStore'

const route = useRoute()
const containerAccessStore = useContainerAccessStore()
const authStore = useAuthStore()

const caa = computed(() =>
  containerAccessStore.caaRecords.find(c => c.id === route.params.id)
)

const canApprove = computed(() => {
  if (!caa.value) return false
  const status = caa.value.status
  const hasRole = authStore.hasAnyRole(['MANAGER', 'ADMIN', 'SUPER_ADMIN'] as any)
  return hasRole && (status === 'SUBMITTED' || status === 'PENDING')
})

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    DRAFT: 'medium',
    SUBMITTED: 'warning',
    PENDING: 'warning',
    APPROVED: 'success',
    REJECTED: 'danger',
    COMPLETED: 'success',
    CANCELLED: 'danger'
  }
  return colors[status] || 'medium'
}

const formatDate = (date: any) => {
  if (!date) return ''
  const d = date.toDate ? date.toDate() : new Date(date)
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const approve = async () => {
  if (caa.value) {
    await containerAccessStore.approveCAA(caa.value.id, authStore.userEmail)
  }
}

const reject = async () => {
  if (caa.value) {
    const alert = await alertController.create({
      header: 'Reject CAA',
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
              containerAccessStore.rejectCAA(caa.value!.id, authStore.userEmail, data.reason)
            }
          },
        },
      ],
    })
    await alert.present()
  }
}

onMounted(() => {
  if (containerAccessStore.caaRecords.length === 0) {
    containerAccessStore.fetchCAARecords()
  }
})
</script>
