<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-title>Inventory</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-searchbar v-model="searchQuery" placeholder="Search stock..."></ion-searchbar>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <ion-list v-if="filteredInventory.length > 0">
        <ion-item v-for="item in filteredInventory" :key="item.id">
          <ion-icon slot="start" :icon="cubeOutline" color="medium"></ion-icon>
          <ion-label>
            <h3>{{ item.name }}</h3>
            <p>{{ item.category }} • {{ item.sku }}</p>
          </ion-label>
          <ion-note slot="end" :color="getStockColor(item.quantity)">
            <div class="stock-info">
              <span class="qty">{{ item.quantity }}</span>
              <span class="unit">{{ item.unit || 'pcs' }}</span>
            </div>
          </ion-note>
        </ion-item>
      </ion-list>

      <div v-else class="empty-state ion-padding">
        <ion-icon :icon="cubeOutline"></ion-icon>
        <p>No inventory items found.</p>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { 
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, 
  IonList, IonItem, IonLabel, IonIcon, IonSearchbar, IonNote
} from '@ionic/vue';
import { cubeOutline } from 'ionicons/icons';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';

const searchQuery = ref('');
const inventory = ref<any[]>([]);

onMounted(() => {
  const q = query(collection(db, 'inventory'), orderBy('name', 'asc'));
  onSnapshot(q, (snapshot) => {
    inventory.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  });
});

const filteredInventory = computed(() => {
  if (!searchQuery.value) return inventory.value;
  const q = searchQuery.value.toLowerCase();
  return inventory.value.filter(i => 
    i.name?.toLowerCase().includes(q) ||
    i.sku?.toLowerCase().includes(q)
  );
});

const getStockColor = (qty: number) => {
  if (qty <= 0) return 'danger';
  if (qty < 10) return 'warning';
  return 'success';
};
</script>

<style scoped>
h3 {
  font-weight: 600;
  margin: 0;
}

.stock-info {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.qty {
  font-size: 18px;
  font-weight: 700;
}

.unit {
  font-size: 10px;
  text-transform: uppercase;
}

.empty-state {
  text-align: center;
  margin-top: 60px;
  color: var(--ion-color-medium);
}

.empty-state ion-icon {
  font-size: 64px;
  margin-bottom: 16px;
}
</style>
