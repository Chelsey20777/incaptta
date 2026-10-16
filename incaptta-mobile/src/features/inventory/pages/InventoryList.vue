<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Inventory</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="createNew">
            <ion-icon slot="icon-only" :icon="addOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-searchbar v-model="searchQuery" placeholder="Search inventory..." />

      <ion-segment v-model="filterStatus">
        <ion-segment-button value="all">
          <ion-label>All</ion-label>
        </ion-segment-button>
        <ion-segment-button value="low">
          <ion-label>Low Stock</ion-label>
        </ion-segment-button>
        <ion-segment-button value="out">
          <ion-label>Out of Stock</ion-label>
        </ion-segment-button>
      </ion-segment>

      <ion-list>
        <ion-item v-for="item in filteredItems" :key="item.id" button @click="viewDetail(item.id)">
          <ion-label>
            <h2>{{ item.sku }} - {{ item.name }}</h2>
            <p>{{ item.categoryName }} | {{ item.uom }}</p>
            <p>Stock: {{ item.onHand }} / Reorder: {{ item.reorderLevel ?? 'N/A' }}</p>
          </ion-label>
          <ion-badge slot="end" :color="getStockColor(item)">
            {{ item.onHand }}
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
  IonSearchbar, IonSegment, IonSegmentButton, IonLabel,
  IonList, IonItem, IonBadge, IonButton, IonButtons, IonIcon
} from '@ionic/vue'
import { addOutline } from 'ionicons/icons'
import { useInventoryStore } from '../store/inventoryStore'

const router = useRouter()
const inventoryStore = useInventoryStore()

const searchQuery = ref('')
const filterStatus = ref('all')

const filteredItems = computed(() => {
  let items = inventoryStore.inventoryItems

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    items = items.filter(item => 
      item.sku?.toLowerCase().includes(query) ||
      item.name?.toLowerCase().includes(query) ||
      item.categoryName?.toLowerCase().includes(query)
    )
  }

  if (filterStatus.value === 'low') {
    items = inventoryStore.lowStockItems
  } else if (filterStatus.value === 'out') {
    items = inventoryStore.outOfStockItems
  }

  return items
})

const getStockColor = (item: any) => {
  if (item.onHand <= 0) return 'danger'
  if (item.reorderLevel !== undefined && item.onHand <= item.reorderLevel) return 'warning'
  return 'success'
}

const createNew = () => {
  router.push('/tabs/inventory/new')
}

const viewDetail = (id: string) => {
  router.push(`/tabs/inventory/${id}`)
}

onMounted(() => {
  inventoryStore.fetchItems()
})
</script>
