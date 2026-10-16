import { ref, onUnmounted } from 'vue'
import { db } from '@/lib/firebase'

export function useInventoryOnHand(
  inventoryItemId: string | null
) {
  const onHand = ref<number | null>(null)
  const loading = ref(true)

  if (!inventoryItemId) {
    loading.value = false
    return { onHand, loading }
  }

  let unsubscribe: (() => void) | null = null

  const setup = async () => {
    const { doc, onSnapshot } =
      await import('firebase/firestore')

    unsubscribe = onSnapshot(
      doc(db, 'inventoryItems', inventoryItemId),
      (snap) => {
        if (snap.exists()) {
          onHand.value = snap.data()?.onHand ?? 0
        } else {
          onHand.value = null
        }
        loading.value = false
      },
      (error) => {
        console.error('onHand listener error:', error)
        loading.value = false
      }
    )
  }

  setup()

  onUnmounted(() => {
    if (unsubscribe) unsubscribe()
  })

  return { onHand, loading }
}