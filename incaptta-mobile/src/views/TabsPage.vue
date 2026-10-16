<template>
  <ion-page>
    <ion-tabs @ionTabsWillChange="onTabChange">
      <ion-router-outlet></ion-router-outlet>
      <ion-tab-bar slot="bottom">
        <ion-tab-button tab="dashboard" href="/tabs/dashboard">
          <ion-icon aria-hidden="true" :icon="gridOutline" />
          <ion-label>Dashboard</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="jobs" href="/tabs/jobs">
          <ion-icon aria-hidden="true" :icon="constructOutline" />
          <ion-label>Jobs</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="inventory" @click.prevent="goToInventory">
          <ion-icon aria-hidden="true" :icon="cubeOutline" />
          <ion-label>Inventory</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="crm" href="/tabs/crm">
          <ion-icon aria-hidden="true" :icon="peopleOutline" />
          <ion-label>CRM</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="more" href="/tabs/more">
          <ion-icon aria-hidden="true" :icon="menuOutline" />
          <ion-label>More</ion-label>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  </ion-page>
</template>

<script setup lang="ts">
import { IonTabBar, IonTabButton, IonTabs, IonLabel, IonIcon, IonPage, IonRouterOutlet, useIonRouter } from '@ionic/vue';
import { gridOutline, constructOutline, cubeOutline, peopleOutline, menuOutline } from 'ionicons/icons';

const ionRouter = useIonRouter();

function goToInventory() {
  ionRouter.navigate('/tabs/inventory', 'root', 'replace');
}

function onTabChange(e: CustomEvent) {
  // Hook for future tab change events if needed
}
</script>

<style scoped>
ion-tab-bar {
  --border: 0;
  --background: var(--ion-background-color);
  box-shadow: 0 -2px 10px rgba(0,0,0,0.05);
  border-top: 1px solid var(--ion-color-step-100);
}

ion-tab-button {
  --color-selected: var(--ion-color-primary);
}
</style>
