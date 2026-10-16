'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { onAuthStateChanged, getIdTokenResult } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { useAuthStore } from '@/stores/auth-store'

export function AuthProvider({ children }: { children: ReactNode }) {
  const { setUser, setClaims, setLoading } = useAuthStore()
  const hasRefreshedRef = useRef(false)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser)
      if (firebaseUser) {
        try {
          let tokenResult = await getIdTokenResult(firebaseUser)
          let claims = tokenResult.claims
          if (!claims.roles && !hasRefreshedRef.current) {
            hasRefreshedRef.current = true
            tokenResult = await getIdTokenResult(firebaseUser, true)
            claims = tokenResult.claims
          }
          setClaims(claims as Record<string, unknown>)
        } catch (error) {
          console.error('Failed to get token claims:', error)
          setClaims({})
        }
      } else {
        setClaims({})
        hasRefreshedRef.current = false
      }
      setLoading(false)
    })

    return () => unsubscribe()
  }, [setUser, setClaims, setLoading])

  return <>{children}</>
}
