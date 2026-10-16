<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button />
        </ion-buttons>
        <ion-title>Customer Detail</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="editCustomer">
            <ion-icon slot="icon-only" :icon="pencilOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div v-if="customer">
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ customer.customerNumber }}</ion-card-title>
            <ion-card-subtitle>{{ customer.name }}</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <ion-item v-if="customer.company" lines="none">
              <ion-label>
                <p>Company</p>
                <h3>{{ customer.company }}</h3>
              </ion-label>
            </ion-item>
            <ion-item v-if="customer.email" lines="none" button @click="sendEmail">
              <ion-label>
                <p>Email</p>
                <h3>{{ customer.email }}</h3>
              </ion-label>
              <ion-icon slot="end" :icon="mailOutline" />
            </ion-item>
            <ion-item v-if="customer.phone" lines="none" button @click="callPhone">
              <ion-label>
                <p>Phone</p>
                <h3>{{ customer.phone }}</h3>
              </ion-label>
              <ion-icon slot="end" :icon="callOutline" />
            </ion-item>
            <ion-item v-if="customer.address" lines="none">
              <ion-label>
                <p>Address</p>
                <h3>{{ customer.address }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none">
              <ion-label>
                <p>Status</p>
                <h3 :color="getStatusColor(customer.status)">{{ customer.status }}</h3>
              </ion-label>
            </ion-item>
            <ion-item v-if="customer.creditLimit !== undefined" lines="none">
              <ion-label>
                <p>Credit Limit</p>
                <h3>${{ customer.creditLimit }}</h3>
              </ion-label>
            </ion-item>
            <ion-item v-if="customer.currentBalance !== undefined" lines="none">
              <ion-label>
                <p>Current Balance</p>
                <h3>${{ customer.currentBalance }}</h3>
              </ion-label>
            </ion-item>
          </ion-card-content>
        </ion-card>

        <ion-card v-if="customer.address">
          <ion-card-header>
            <ion-card-title>Map Location</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <ion-button expand="block" @click="openMap">
              <ion-icon slot="start" :icon="mapOutline" />
              Open in Maps
            </ion-button>
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
  IonButtons, IonBackButton, IonButton, IonIcon, IonBadge, IonItem, IonLabel
} from '@ionic/vue'
import { pencilOutline, mailOutline, callOutline, mapOutline } from 'ionicons/icons'
import { useCrmStore } from '../store/crmStore'

const route = useRoute()
const crmStore = useCrmStore()

const customer = computed(() => crmStore.currentCustomer)

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    ACTIVE: 'success',
    INACTIVE: 'medium',
    BLACKLISTED: 'danger'
  }
  return colors[status] || 'medium'
}

const editCustomer = () => {
  // Navigate to edit page
}

const sendEmail = () => {
  if (customer.value?.email) {
    window.location.href = `mailto:${customer.value.email}`
  }
}

const callPhone = () => {
  if (customer.value?.phone) {
    window.location.href = `tel:${customer.value.phone}`
  }
}

const openMap = () => {
  if (customer.value?.address) {
    window.open(`https://maps.google.com/?q=${encodeURIComponent(customer.value.address)}`, '_blank')
  }
}

onMounted(() => {
  const id = route.params.id as string
  crmStore.setCurrentCustomer(null)
})
</script>
