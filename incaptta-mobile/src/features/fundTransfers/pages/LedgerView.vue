<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Ledger</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-card>
        <ion-card-header>
          <ion-card-title>Account Balances</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-list>
            <ion-item v-for="account in accountBalances" :key="account.accountId">
              <ion-label>
                <h3>{{ account.accountName }}</h3>
                <p>{{ account.accountType }}</p>
              </ion-label>
              <ion-label slot="end">
                <h2>${{ account.balance }}</h2>
              </ion-label>
            </ion-item>
          </ion-list>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header>
          <ion-card-title>Recent Transactions</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-list>
            <ion-item v-for="(transfer, index) in recentTransfers" :key="transfer.id">
              <ion-label>
                <h3>{{ transfer.transferNumber }}</h3>
                <p>{{ transfer.fromAccountName }} → {{ transfer.toAccountName }}</p>
                <p>{{ formatDate(transfer.date) }}</p>
              </ion-label>
              <ion-label slot="end">
                <h2 :color="transfer.amount >= 0 ? 'success' : 'danger'">
                  {{ transfer.amount >= 0 ? '+' : '' }}{{ formatCurrency(transfer.amount) }}
                </h2>
              </ion-label>
            </ion-item>
          </ion-list>
        </ion-card-content>
      </ion-card>

      <ion-card v-for="account in accountsWithTransactions" :key="account.accountId">
        <ion-card-header>
          <ion-card-title>{{ account.accountName }} - Ledger</ion-card-title>
          <ion-card-subtitle>Running Balance: {{ formatCurrency(account.balance) }}</ion-card-subtitle>
        </ion-card-header>
        <ion-card-content>
          <ion-list>
            <ion-item v-for="(txn, index) in account.transactions" :key="txn.id">
              <ion-label>
                <h3>{{ txn.transferNumber || txn.description }}</h3>
                <p>{{ formatDate(txn.date) }}</p>
              </ion-label>
              <ion-label slot="end">
                <h2 :color="txn.amount >= 0 ? 'success' : 'danger'">
                  {{ txn.amount >= 0 ? '+' : '' }}{{ formatCurrency(txn.amount) }}
                </h2>
                <p>Balance: {{ formatCurrency(txn.runningBalance) }}</p>
              </ion-label>
            </ion-item>
          </ion-list>
        </ion-card-content>
      </ion-card>

      <ion-button expand="block" @click="recordTopUp">
        <ion-icon slot="start" :icon="addOutline" />
        Record Top-Up
      </ion-button>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { 
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonCard, IonCardHeader, IonCardTitle, IonCardContent,
  IonList, IonItem, IonLabel, IonButton, IonIcon
} from '@ionic/vue'
import { addOutline } from 'ionicons/icons'
import { useFundTransfersStore } from '../store/fundTransfersStore'

const router = useRouter()
const transfersStore = useFundTransfersStore()

const accountBalances = computed(() => transfersStore.accountBalances)
const recentTransfers = computed(() => transfersStore.transfers.slice(0, 10))

const formatCurrency = (val?: number) => {
  if (val === undefined || val === null) return '0.00'
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val)
}

const formatDate = (date: any) => {
  if (!date) return 'N/A'
  const d = date.toDate ? date.toDate() : new Date(date)
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

const accountsWithTransactions = computed(() => {
  const accounts = transfersStore.accountBalances.map(account => {
    const accountTransfers = transfersStore.transfers
      .filter(t => t.fromAccount === account.accountId || t.toAccount === account.accountId)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    
    let runningBalance = 0
    const transactions = accountTransfers.map(t => {
      const amount = t.toAccount === account.accountId ? t.amount : -t.amount
      runningBalance += amount
      return {
        ...t,
        amount,
        runningBalance
      }
    })
    
    return {
      ...account,
      transactions
    }
  })
  return accounts
})

const recordTopUp = () => {
  router.push('/tabs/more/ledger/top-up')
}

onMounted(() => {
  transfersStore.setAccountBalances([])
  transfersStore.setTransfers([])
})
</script>
