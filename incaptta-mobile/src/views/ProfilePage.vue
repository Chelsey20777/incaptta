<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button />
        </ion-buttons>
        <ion-title>Profile</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-card>
        <ion-card-header>
          <ion-card-title>User Profile</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-item lines="none">
            <ion-label>
              <p>Name</p>
              <h3>Current User</h3>
            </ion-label>
          </ion-item>
          <ion-item lines="none">
            <ion-label>
              <p>Email</p>
              <h3>user@example.com</h3>
            </ion-label>
          </ion-item>
          <ion-item lines="none">
            <ion-label>
              <p>Role</p>
              <h3>Staff</h3>
            </ion-label>
          </ion-item>
        </ion-card-content>
      </ion-card>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonCard, IonCardHeader, IonCardTitle, IonCardContent,
  IonButtons, IonBackButton, IonItem, IonLabel
} from '@ionic/vue'
</script>
