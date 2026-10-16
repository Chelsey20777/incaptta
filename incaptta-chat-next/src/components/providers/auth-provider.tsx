'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { onAuthStateChanged, getIdTokenResult } from 'firebase/auth'
import { auth, db } from '@/lib/firebase'
import { doc, onSnapshot } from 'firebase/firestore'
import { useAuthStore } from '@/stores/auth-store'

export function AuthProvider({ children }: { children: ReactNode }) {
  const { setUser, setClaims, setLoading } = useAuthStore()
  const hasRefreshedRef = useRef(false)

  useEffect(() => {
    let unsubscribeStatus: (() => void) | null = null

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser)

      if (unsubscribeStatus) {
        unsubscribeStatus()
        unsubscribeStatus = null
      }

      if (firebaseUser) {
        try {
          const token = await firebaseUser.getIdToken()
          // Set __session cookie for Next.js middleware route guarding
          document.cookie = `__session=${token}; path=/; max-age=3600; SameSite=Strict; Secure`;

          let tokenResult = await getIdTokenResult(firebaseUser)
          let claims = tokenResult.claims
          if (!claims.roles && !hasRefreshedRef.current) {
            hasRefreshedRef.current = true
            tokenResult = await getIdTokenResult(firebaseUser, true)
            claims = tokenResult.claims
          }
          setClaims(claims as Record<string, unknown>)

          // Set up Firestore listener to force token refresh when admin changes user status
          // Note: This may fail with permission-denied if isActive claim isn't set yet;
          // that's expected and non-fatal — the listener will work once claims are refreshed.
          unsubscribeStatus = onSnapshot(doc(db, 'userStatus', firebaseUser.uid), async (snapshot) => {
            if (snapshot.exists()) {
              const statusData = snapshot.data()
              if (statusData?.forceRefresh) {
                console.log('[AuthProvider] Force refresh signal detected, refreshing ID token...')
                try {
                  const refreshedTokenResult = await getIdTokenResult(firebaseUser, true)
                  const freshClaims = refreshedTokenResult.token ? refreshedTokenResult.claims : {}
                  setClaims(freshClaims as Record<string, unknown>)
                  
                  // Update __session cookie with fresh token
                  const freshToken = refreshedTokenResult.token
                  if (freshToken) {
                    document.cookie = `__session=${freshToken}; path=/; max-age=3600; SameSite=Strict; Secure`;
                  }

                  if (freshClaims.isActive === false) {
                    console.log('[AuthProvider] Account deactivation detected. Signing out...')
                    await auth.signOut()
                  }
                } catch (refreshErr) {
                  console.error('[AuthProvider] Failed to force-refresh claims:', refreshErr)
                }
              }
            }
          }, (error) => {
            // Permission errors here are expected if the user's isActive claim
            // isn't set yet — silently ignore to avoid console noise.
            if (error?.code !== 'permission-denied') {
              console.error('[AuthProvider] userStatus listener error:', error)
            }
          })

        } catch (error) {
          console.error('Failed to get token claims:', error)
          setClaims({})
        }
      } else {
        setClaims({})
        hasRefreshedRef.current = false
        // Clear __session cookie on sign out
        document.cookie = '__session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict; Secure';
      }
      setLoading(false)
    })

    return () => {
      unsubscribeAuth()
      if (unsubscribeStatus) {
        unsubscribeStatus()
      }
    }
  }, [setUser, setClaims, setLoading])

  return <>{children}</>
}