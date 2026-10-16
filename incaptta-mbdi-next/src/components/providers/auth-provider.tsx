'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { onAuthStateChanged, getIdTokenResult } from 'firebase/auth'
import { auth, db } from '@/lib/firebase'
import { doc, onSnapshot } from 'firebase/firestore'
import { useAuthStore } from '@/stores/auth-store'

const SESSION_STORAGE_KEY = 'incaptta_session_id'
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000

function getOrCreateSessionId(): string {
  try {
    const existing = localStorage.getItem(SESSION_STORAGE_KEY)
    if (existing && existing.length > 8) return existing
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
    localStorage.setItem(SESSION_STORAGE_KEY, id)
    return id
  } catch {
    return `sess_${Date.now()}`
  }
}

async function sendSessionHeartbeat(idToken: string) {
  const sessionId = getOrCreateSessionId()
  try {
    const res = await fetch('/api/sessions/heartbeat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        sessionId,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        app: 'incaptta-mbdi-next',
      }),
    })
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      console.warn(
        '[AuthProvider] Session heartbeat rejected:',
        res.status,
        (errData as { message?: string }).message || res.statusText
      )
    }
  } catch (err) {
    console.warn('[AuthProvider] Session heartbeat failed:', err)
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { setUser, setClaims, setLoading, setProfile, setProfileLoading } = useAuthStore()
  const hasRefreshedRef = useRef(false)
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let unsubscribeStatus: (() => void) | null = null
    let unsubscribeProfile: (() => void) | null = null

    const clearHeartbeat = () => {
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current)
        heartbeatTimerRef.current = null
      }
    }

    const startHeartbeat = (firebaseUser: NonNullable<typeof auth.currentUser>) => {
      clearHeartbeat()

      const beat = async () => {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
        try {
          const token = await firebaseUser.getIdToken()
          await sendSessionHeartbeat(token)
        } catch (err) {
          console.warn('[AuthProvider] Heartbeat token error:', err)
        }
      }

      void beat()
      heartbeatTimerRef.current = setInterval(beat, HEARTBEAT_INTERVAL_MS)
    }

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser)

      if (unsubscribeStatus) {
        unsubscribeStatus()
        unsubscribeStatus = null
      }
      if (unsubscribeProfile) {
        unsubscribeProfile()
        unsubscribeProfile = null
      }
      clearHeartbeat()

      if (firebaseUser) {
        try {
          const token = await firebaseUser.getIdToken()
          document.cookie = `__session=${token}; path=/; max-age=3600; SameSite=Strict; Secure`

          let tokenResult = await getIdTokenResult(firebaseUser)
          let claims = tokenResult.claims
          // Force-refresh when roles OR isActive are missing — Firestore authed()
          // fails closed without isActive === true.
          if ((!claims.roles || claims.isActive === undefined) && !hasRefreshedRef.current) {
            hasRefreshedRef.current = true
            tokenResult = await getIdTokenResult(firebaseUser, true)
            claims = tokenResult.claims
          }
          setClaims(claims as Record<string, unknown>)

          startHeartbeat(firebaseUser)

          // Live user profile (modules.mbdi, employeeId, …) for access gates
          setProfileLoading(true)
          unsubscribeProfile = onSnapshot(
            doc(db, 'users', firebaseUser.uid),
            (snap) => {
              if (snap.exists()) {
                const data = snap.data()
                setProfile({
                  modules: data.modules,
                  employeeId: data.employeeId ?? null,
                  email: data.email,
                  name: data.name,
                })
              } else {
                setProfile(null)
              }
              setProfileLoading(false)
            },
            (err) => {
              console.error('[AuthProvider] User profile listener error:', err)
              setProfile(null)
              setProfileLoading(false)
            }
          )

          // Force token refresh when admin changes user status
          unsubscribeStatus = onSnapshot(
            doc(db, 'userStatus', firebaseUser.uid),
            async (snapshot) => {
              if (snapshot.exists()) {
                const statusData = snapshot.data()
                if (statusData?.forceRefresh) {
                  console.log('[AuthProvider] Force refresh signal detected, refreshing ID token...')
                  try {
                    const refreshedTokenResult = await getIdTokenResult(firebaseUser, true)
                    const freshClaims = refreshedTokenResult.token
                      ? refreshedTokenResult.claims
                      : {}
                    setClaims(freshClaims as Record<string, unknown>)

                    const freshToken = refreshedTokenResult.token
                    if (freshToken) {
                      document.cookie = `__session=${freshToken}; path=/; max-age=3600; SameSite=Strict; Secure`
                    }

                    if (freshClaims.isActive === false) {
                      console.log('[AuthProvider] Account deactivation detected. Signing out...')
                      await auth.signOut()
                    }
                  } catch (refreshErr) {
                    console.error(
                      '[AuthProvider] Failed to force-refresh claims — signing out:',
                      refreshErr
                    )
                    try {
                      await auth.signOut()
                    } catch (signOutErr) {
                      console.error('[AuthProvider] Sign-out after revoke failed:', signOutErr)
                    }
                  }
                }
              }
            },
            (error) => {
              if (error?.code !== 'permission-denied') {
                console.error('[AuthProvider] userStatus listener error:', error)
              }
            }
          )
        } catch (error) {
          console.error('Failed to get token claims:', error)
          setClaims({})
          setProfile(null)
          setProfileLoading(false)
        }
      } else {
        setClaims({})
        setProfile(null)
        setProfileLoading(false)
        hasRefreshedRef.current = false
        document.cookie =
          '__session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict; Secure'
      }
      setLoading(false)
    })

    return () => {
      unsubscribeAuth()
      clearHeartbeat()
      if (unsubscribeStatus) unsubscribeStatus()
      if (unsubscribeProfile) unsubscribeProfile()
    }
  }, [setUser, setClaims, setLoading, setProfile, setProfileLoading])

  return <>{children}</>
}
