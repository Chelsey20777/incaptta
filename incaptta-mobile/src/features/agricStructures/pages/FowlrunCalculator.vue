<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button />
        </ion-buttons>
        <ion-title>Fowlrun Calculator</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-card>
        <ion-card-header>
          <ion-card-title>Select Size</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="4" v-for="preset in sizePresets" :key="preset.size">
                <ion-button 
                  expand="block" 
                  :color="selectedSize === preset.size ? 'primary' : 'medium'"
                  @click="selectSize(preset)"
                >
                  {{ preset.label }}
                </ion-button>
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <ion-card v-if="selectedSize">
        <ion-card-header>
          <ion-card-title>Specifications</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-item>
            <ion-label>
              <p>Number of Birds</p>
              <h2>{{ calculation.birds }}</h2>
            </ion-label>
          </ion-item>
          <ion-item>
            <ion-label>
              <p>Dimensions (L x W x H)</p>
              <h3>{{ calculation.dimensions.length }}m x {{ calculation.dimensions.width }}m x {{ calculation.dimensions.height }}m</h3>
            </ion-label>
          </ion-item>
        </ion-card-content>
      </ion-card>

      <ion-card v-if="selectedSize">
        <ion-card-header>
          <ion-card-title>Cost Breakdown</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-list>
            <ion-item v-for="material in calculation.materials" :key="material.description">
              <ion-label>
                <h3>{{ material.description }}</h3>
                <p>{{ material.quantity }} {{ material.unit }} @ ${{ material.unitCost }}</p>
              </ion-label>
              <ion-label slot="end">
                <h3>${{ material.totalCost }}</h3>
              </ion-label>
            </ion-item>
          </ion-list>
          <ion-item lines="none">
            <ion-label>
              <p>Labor Cost</p>
              <h3>${{ calculation.laborCost }}</h3>
            </ion-label>
          </ion-item>
          <ion-item lines="none">
            <ion-label>
              <p>Material Cost</p>
              <h3>${{ calculation.materialCost }}</h3>
            </ion-label>
          </ion-item>
          <ion-item lines="none">
            <ion-label>
              <p>Total Cost</p>
              <h2>${{ calculation.totalCost }}</h2>
            </ion-label>
          </ion-item>
          <ion-item lines="none">
            <ion-label>
              <p>Selling Price</p>
              <h2 :color="'success'">${{ calculation.sellingPrice }}</h2>
            </ion-label>
          </ion-item>
          <ion-item lines="none">
            <ion-label>
              <p>Profit Margin</p>
              <h3>{{ calculation.profitMargin }}%</h3>
            </ion-label>
          </ion-item>
        </ion-card-content>
      </ion-card>

      <ion-button v-if="selectedSize" expand="block" size="large" @click="createJobCard">
        <ion-icon slot="start" :icon="documentTextOutline" />
        Create Job Card
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
  IonGrid, IonRow, IonCol, IonItem, IonLabel, IonList
} from '@ionic/vue'
import { documentTextOutline } from 'ionicons/icons'
import type { FowlrunCalculation, SizePreset } from '../types'

const router = useRouter()

const selectedSize = ref<string>('')

const sizePresets: SizePreset[] = [
  { size: 'SMALL', label: 'Small', birds: 100, length: 6, width: 3, height: 2.5 },
  { size: 'MEDIUM', label: 'Medium', birds: 500, length: 12, width: 6, height: 3 },
  { size: 'LARGE', label: 'Large', birds: 1000, length: 20, width: 10, height: 3.5 }
]

const calculation = ref<FowlrunCalculation>({
  birds: 0,
  size: 'SMALL',
  dimensions: { length: 0, width: 0, height: 0 },
  materials: [],
  laborCost: 0,
  materialCost: 0,
  totalCost: 0,
  sellingPrice: 0,
  profitMargin: 0
})

const selectSize = (preset: SizePreset) => {
  selectedSize.value = preset.size
  calculateCosts(preset)
}

const calculateCosts = (preset: SizePreset) => {
  const materials = [
    { description: 'Steel Posts', quantity: preset.length * 2, unit: 'pcs', unitCost: 15, totalCost: 0 },
    { description: 'Wire Mesh', quantity: preset.length * preset.width, unit: 'sqm', unitCost: 25, totalCost: 0 },
    { description: 'Roofing Sheets', quantity: preset.length * preset.width * 1.2, unit: 'sqm', unitCost: 30, totalCost: 0 },
    { description: 'Nails & Fasteners', quantity: preset.birds / 50, unit: 'kg', unitCost: 5, totalCost: 0 }
  ]

  materials.forEach(m => {
    m.totalCost = m.quantity * m.unitCost
  })

  const materialCost = materials.reduce((sum, m) => sum + m.totalCost, 0)
  const laborCost = materialCost * 0.3 // 30% of material cost
  const totalCost = materialCost + laborCost
  const profitMargin = 25
  const sellingPrice = totalCost * (1 + profitMargin / 100)

  calculation.value = {
    birds: preset.birds,
    size: preset.size as any,
    dimensions: {
      length: preset.length,
      width: preset.width,
      height: preset.height
    },
    materials,
    laborCost,
    materialCost,
    totalCost,
    sellingPrice,
    profitMargin
  }
}

const createJobCard = () => {
  // Navigate to job card creation with calculator data
  console.log('Creating job card from calculator:', calculation.value)
  router.push('/tabs/jobs/new')
}
</script>
