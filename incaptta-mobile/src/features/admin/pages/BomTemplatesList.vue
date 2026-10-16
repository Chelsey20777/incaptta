<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>BOM Templates</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="createNew">
            <ion-icon slot="icon-only" :icon="addOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-searchbar v-model="searchQuery" placeholder="Search templates..." />

      <ion-list>
        <ion-item v-for="template in filteredTemplates" :key="template.id" button @click="viewDetail(template.id)">
          <ion-label>
            <h2>{{ template.templateNumber }}</h2>
            <h3>{{ template.name }}</h3>
            <p>{{ template.category }}</p>
          </ion-label>
          <ion-label slot="end">
            <h2>${{ template.totalCost }}</h2>
            <ion-badge :color="template.isActive ? 'success' : 'medium'">
              {{ template.isActive ? 'Active' : 'Inactive' }}
            </ion-badge>
          </ion-label>
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
  IonSearchbar, IonList, IonItem, IonBadge, IonButton, IonButtons, IonIcon, IonLabel
} from '@ionic/vue'
import { addOutline } from 'ionicons/icons'
import { useBomTemplateStore } from '../store/bomTemplateStore'

const router = useRouter()
const bomStore = useBomTemplateStore()

const searchQuery = ref('')

const filteredTemplates = computed(() => {
  let templates = bomStore.templates

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    templates = templates.filter(t => 
      t.templateNumber.toLowerCase().includes(query) ||
      t.name.toLowerCase().includes(query) ||
      t.category.toLowerCase().includes(query)
    )
  }

  return templates
})

const createNew = () => {
  router.push('/tabs/more/bom-templates/new')
}

const viewDetail = (id: string) => {
  router.push(`/tabs/more/bom-templates/${id}`)
}

onMounted(() => {
  bomStore.setTemplates([])
})
</script>
