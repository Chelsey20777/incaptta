'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { useAdminStore } from '@/stores/admin-store'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Loader2, LockKeyhole, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'

function getUnlockStorageKey(uid: string) {
  return `inventory-manager-unlock:${uid}`
}

function SettingsUnlockContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const authStore = useAuthStore()
  const { user, loading: authLoading } = authStore
  const { appSettings, fetchSettings, loading: settingsLoading } = useAdminStore()

  const [pin, setPin] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [checking, setChecking] = useState(true)

  const redirectTarget = searchParams.get('redirect') || '/admin'

  // Fetch settings on mount
  useEffect(() => {
    if (user?.uid) {
      const unsub = fetchSettings(user.uid)
      return () => unsub()
    }
  }, [user?.uid, fetchSettings])

  // Access validation logic
  useEffect(() => {
    if (authLoading) return

    const roles = authStore.getRoles()
    const isRestrictedManager = roles.includes('MANAGER') && !roles.includes('SUPER_ADMIN') && !roles.includes('ADMIN')

    // If not restricted manager, bypass unlock
    if (!isRestrictedManager) {
      router.replace(redirectTarget)
      return
    }

    // If already unlocked, bypass
    if (user?.uid && sessionStorage.getItem(getUnlockStorageKey(user.uid)) === 'granted') {
      router.replace(redirectTarget)
      return
    }

    // Check if PIN is configured at all
    const pinHash = (appSettings as any)?.inventoryManagerPinHash
    if (appSettings && Object.keys(appSettings).length > 0 && !pinHash) {
      router.replace(redirectTarget)
      return
    }

    if (appSettings && Object.keys(appSettings).length > 0) {
      setChecking(false)
    }
  }, [authLoading, user, appSettings, redirectTarget, router])

  const handleUnlock = async () => {
    if (!pin.trim()) {
      toast.error('PIN required', { description: 'Please enter the access PIN.' })
      return
    }

    setSubmitting(true)
    try {
      const savedHash = (appSettings as any)?.inventoryManagerPinHash
      if (!savedHash) {
        toast.error('No PIN configured', { description: 'Contact system administrator.' })
        return
      }

      // Compute client-side SHA-256 hash
      const encoder = new TextEncoder()
      const data = encoder.encode(pin.trim())
      const hashBuffer = await crypto.subtle.digest('SHA-256', data)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const clientHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')

      if (clientHash !== savedHash) {
        toast.error('Invalid PIN', { description: 'The settings access PIN is incorrect.' })
        setPin('')
        return
      }

      if (user?.uid) {
        sessionStorage.setItem(getUnlockStorageKey(user.uid), 'granted')
      }
      toast.success('Access Unlocked')
      router.replace(redirectTarget)
    } catch (err: any) {
      toast.error('Verification failed', { description: err.message || 'Unable to check PIN.' })
    } finally {
      setSubmitting(false)
    }
  }

  if (authLoading || checking || settingsLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Checking settings access...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <Card className="w-full max-w-md border shadow-xl bg-card">
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2 text-primary">
            <LockKeyhole className="size-5" />
            <span className="text-xs font-black uppercase tracking-[0.2em]">Restricted Access</span>
          </div>
          <CardTitle className="text-2xl font-bold">Unlock Settings</CardTitle>
          <CardDescription>
            Managers must enter the inventory PIN before opening settings.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-muted-foreground">
            <div className="flex items-start gap-2">
              <ShieldAlert className="mt-0.5 size-4 text-amber-500 shrink-0" />
              <p>This unlock stays active for your current browser session.</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="settings-pin">Access PIN</Label>
            <Input
              id="settings-pin"
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="Enter PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleUnlock()
              }}
            />
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => router.push('/')}>Cancel</Button>
            <Button onClick={handleUnlock} disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Unlock Settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function SettingsUnlockPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading Page...</p>
        </div>
      </div>
    }>
      <SettingsUnlockContent />
    </Suspense>
  )
}
