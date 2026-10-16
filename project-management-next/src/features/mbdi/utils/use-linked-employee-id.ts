'use client'

import { useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuthStore } from '@/stores/auth-store'

/** Loads the signed-in user's linked HR employeeId from users/{uid}. */
export function useMbdiLinkedEmployeeId(): string | null {
  const { user } = useAuthStore()
  const [employeeId, setEmployeeId] = useState<string | null>(null)

  useEffect(() => {
    const uid = user?.uid
    if (!uid) {
      setEmployeeId(null)
      return
    }
    let cancelled = false
    getDoc(doc(db, 'users', uid))
      .then((snap) => {
        if (cancelled) return
        const id = snap.exists() ? (snap.data()?.employeeId as string | undefined) : undefined
        setEmployeeId(id || null)
      })
      .catch((err) => {
        console.error('[useMbdiLinkedEmployeeId]', err)
        if (!cancelled) setEmployeeId(null)
      })
    return () => {
      cancelled = true
    }
  }, [user?.uid])

  return employeeId
}
