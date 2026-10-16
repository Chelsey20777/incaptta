<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button />
        </ion-buttons>
        <ion-title>Inventory Detail</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="adjustStock">
            <ion-icon slot="icon-only" :icon="swapHorizontalOutline" />
          </ion-button>
          <ion-button @click="editItem">
            <ion-icon slot="icon-only" :icon="pencilOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div v-if="item">
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ item.sku }}</ion-card-title>
            <ion-card-subtitle>{{ item.name }}</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <p>{{ item.notes }}</p>
            <ion-item lines="none">
              <ion-label>
                <p>Category</p>
                <h3>{{ item.categoryName }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none">
              <ion-label>
                <p>Unit</p>
                <h3>{{ item.uom }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none">
              <ion-label>
                <p>Current Stock</p>
                <h3 :color="getStockColor(item)">{{ item.onHand }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none">
              <ion-label>
                <p>Reorder Level</p>
                <h3>{{ item.reorderLevel ?? 'N/A' }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none">
              <ion-label>
                <p>Purchase Price</p>
                <h3>${{ formatCurrency(item.purchasePrice) }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none">
              <ion-label>
                <p>Total Cost</p>
                <h3>${{ formatCurrency(item.totalCost) }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none">
              <ion-label>
                <p>Selling Price</p>
              <h3>${{ formatCurrency(item.sellingPrice) }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none">
              <ion-label>
                <p>TWID Markup</p>
                <h3>{{ item.markupPercent }}%</h3>
              </ion-label>
            </ion-item>
          </ion-card-content>
        </ion-card>

        <ion-card>
          <ion-card-header>
            <ion-card-title>Stock Ledger</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <ion-list>
              <ion-item v-for="movement in stockMovements" :key="movement.id">
                <ion-label>
                  <h3>{{ movement.movementType }}</h3>
                  <p>{{ movement.reason }}</p>
                  <p>{{ formatDate(movement.postedAt) }}</p>
                </ion-label>
                <ion-badge slot="end" :color="movement.qty > 0 ? 'success' : 'danger'">
                  {{ movement.qty > 0 ? '+' : '' }}{{ movement.qty }}
                </ion-badge>
              </ion-item>
            </ion-list>
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
  IonButtons, IonBackButton, IonButton, IonIcon, IonBadge, IonItem, IonLabel, IonList
} from '@ionic/vue'
import { swapHorizontalOutline, pencilOutline } from 'ionicons/icons'
import { useInventoryStore } from '../store/inventoryStore'

const route = useRoute()
const router = useRouter()
const inventoryStore = useInventoryStore()

const formatCurrency = (val?: number) => {
  if (val === undefined || val === null) return '0.00'
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(val)
}

const item = computed(() => 
  inventoryStore.inventoryItems.find(i => i.id === route.params.id)
)
const stockMovements = computed(() => inventoryStore.stockMovements)

const getStockColor = (item: any) => {
  if (item.onHand <= 0) return 'danger'
  if (item.reorderLevel !== undefined && item.onHand <= item.reorderLevel) return 'warning'
  return 'success'
}

const formatDate = (date: any) => {
  if (!date) return ''
  const d = date.toDate ? date.toDate() : new Date(date)
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const adjustStock = () => {
  router.push(`/tabs/inventory/${route.params.id}/adjust`)
}

const editItem = () => {
  router.push(`/tabs/inventory/${route.params.id}/edit`)
}

onMounted(() => {
  const id = route.params.id as string
  inventoryStore.fetchMovements(id)
})
</script>
