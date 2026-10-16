<template>
  <ion-page>
    <ion-content :fullscreen="true" class="ion-padding">
      <div class="login-container">
        <div class="header">
          <div class="logo">
            <ion-icon :icon="cubeOutline" color="primary"></ion-icon>
          </div>
          <h1>InCaptta Mobile</h1>
          <p>Project Management Companion</p>
        </div>

        <div class="form-section">
          <ion-item lines="full" class="ion-margin-bottom">
            <ion-label position="stacked">Email</ion-label>
            <ion-input v-model="email" type="email" placeholder="email@example.com"></ion-input>
          </ion-item>

          <ion-item lines="full" class="ion-margin-bottom">
            <ion-label position="stacked">Password</ion-label>
            <ion-input v-model="password" type="password" placeholder="••••••••"></ion-input>
          </ion-item>

          <ion-button expand="block" class="ion-margin-top" @click="handleLogin" :disabled="loading">
            <ion-spinner v-if="loading" name="crescent"></ion-spinner>
            <span v-else>Sign In</span>
          </ion-button>
          
          <p v-if="error" class="error-text">{{ error }}</p>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { 
  IonPage, IonContent, IonHeader, IonToolbar, IonTitle, 
  IonItem, IonLabel, IonInput, IonButton, IonIcon, IonSpinner
} from '@ionic/vue';
import { cubeOutline } from 'ionicons/icons';
import { auth } from '@/lib/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';

const router = useRouter();
const email = ref('');
const password = ref('');
const loading = ref(false);
const error = ref('');

const handleLogin = async () => {
  if (!email.value || !password.value) {
    error.value = 'Please enter both email and password';
    return;
  }

  loading.value = true;
  error.value = '';
  
  try {
    await signInWithEmailAndPassword(auth, email.value, password.value);
    router.replace('/tabs/dashboard');
  } catch (err: any) {
    console.error('Login error:', err);
    error.value = 'Invalid email or password';
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.login-container {
  display: flex;
  flex-direction: column;
  justify-content: center;
  height: 100%;
  max-width: 400px;
  margin: 0 auto;
}

.header {
  text-align: center;
  margin-bottom: 40px;
}

.logo {
  font-size: 64px;
  margin-bottom: 16px;
}

h1 {
  font-weight: 700;
  margin: 0;
  color: var(--ion-color-dark);
}

p {
  color: var(--ion-color-medium);
  margin-top: 8px;
}

.form-section {
  background: var(--ion-background-color);
  padding: 20px;
  border-radius: 16px;
}

.error-text {
  color: var(--ion-color-danger);
  font-size: 14px;
  text-align: center;
  margin-top: 16px;
}

ion-item {
  --background: transparent;
  --padding-start: 0;
  --highlight-color-focused: var(--ion-color-primary);
}

ion-button {
  --border-radius: 12px;
  height: 52px;
  margin-top: 24px;
  font-weight: 600;
}
</style>
