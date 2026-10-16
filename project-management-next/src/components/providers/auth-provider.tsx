'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { onAuthStateChanged, getIdTokenResult } from 'firebase/auth'
import { auth, db } from '@/lib/firebase'
import { doc, onSnapshot } from 'firebase/firestore'
import { useAuthStore } from '@/stores/auth-store'
import { useRouter, usePathname } from 'next/navigation'

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
        app: 'project-management-next',
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
  const processedRefreshSignalRef = useRef<string | null>(null)
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const router = useRouter()
  const pathname = usePathname()

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
          // Set __session cookie for Next.js middleware route guarding
          document.cookie = `__session=${token}; path=/; max-age=3600; SameSite=Strict; Secure`;

          let tokenResult = await getIdTokenResult(firebaseUser)
          let claims = tokenResult.claims
          // Force-refresh when roles OR isActive are missing — Firestore authed()
          // fails closed without isActive === true, which surfaces as permission-denied.
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
                  signatureUrl: data.signatureUrl ?? null,
                  position: data.position ?? null,
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

          // Set up Firestore listener to force token refresh when admin changes user status
          unsubscribeStatus = onSnapshot(doc(db, 'userStatus', firebaseUser.uid), async (snapshot) => {
            if (snapshot.exists()) {
              const statusData = snapshot.data()
              if (statusData?.forceRefresh) {
                const signal = Number(statusData.forceRefresh)
                const signalKey = `${firebaseUser.uid}:${signal}`
                if (!Number.isFinite(signal) || processedRefreshSignalRef.current === signalKey) return
                processedRefreshSignalRef.current = signalKey
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
                  } else {
                    try {
                      const ack = await fetch('/api/auth/force-refresh/ack', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          Authorization: `Bearer ${refreshedTokenResult.token}`,
                        },
                        body: JSON.stringify({ signal }),
                      })
                      if (!ack.ok) {
                        console.warn('[AuthProvider] Could not acknowledge force-refresh signal:', ack.status)
                      }
                    } catch (ackErr) {
                      console.warn('[AuthProvider] Could not acknowledge force-refresh signal:', ackErr)
                    }
                  }
                } catch (refreshErr) {
                  console.error('[AuthProvider] Failed to force-refresh claims — signing out:', refreshErr)
                  try {
                    await auth.signOut()
                  } catch (signOutErr) {
                    console.error('[AuthProvider] Sign-out after revoke failed:', signOutErr)
                  }
                }
              }
            }
          })

        } catch (error) {
          console.error('Failed to get token claims:', error)
          setClaims({})
          setProfile(null)
          setProfileLoading(false)
        }
      } else {
        // Check if there is an active MongoDB session before clearing state
        try {
          const meRes = await fetch('/api/auth/me')
          if (meRes.ok) {
            const data = await meRes.json()
            if (data.authenticated && data.user) {
              const u = data.user
              setUser({
                uid: u.uid,
                email: u.email,
                displayName: u.name,
                getIdToken: async () => {
                  const match = typeof document !== 'undefined' ? document.cookie.match(/(?:^|;\s*)__session=([^;]+)/) : null
                  return match ? decodeURIComponent(match[1]) : ''
                }
              } as any)
              setClaims({
                roles: u.roles,
                isActive: u.isActive,
                company: u.company,
              })
              setProfile({
                modules: u.modules,
                employeeId: u.employeeId ?? null,
                email: u.email,
                name: u.name,
                signatureUrl: u.signatureUrl ?? null,
                position: u.position ?? null,
              })
              setProfileLoading(false)
              setLoading(false)
              return
            }
          }
        } catch {
          // No active MongoDB session
        }

        setClaims({})
        setProfile(null)
        setProfileLoading(false)
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
      if (unsubscribeProfile) {
        unsubscribeProfile()
      }
      clearHeartbeat()
    }
  }, [setUser, setClaims, setLoading, setProfile, setProfileLoading, router, pathname])

  // PWA Service Worker Registration
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then((registration) => {
            console.log('[PWA] ServiceWorker registered successfully with scope:', registration.scope)
          })
          .catch((err) => {
            console.error('[PWA] ServiceWorker registration failed:', err)
          })
      })
    }
  }, [])

  return <>{children}</>
}
