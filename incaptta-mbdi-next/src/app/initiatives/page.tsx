'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Bell,
  Download,
  Loader2,
  LogOut,
  MessageSquare,
  Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { auth, db } from '@/lib/firebase'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { cn } from '@/lib/utils'
import { useMbdiStore } from '@/stores/mbdi-store'
import { useAuthStore } from '@/stores/auth-store'
import { usePWA } from '@/components/providers/pwa-provider'
import { isMbdiInitiativeOwner } from '@/features/mbdi/utils/ownership'
import { isMbdiApproverRole } from '@/features/mbdi/utils/access'
import { useMbdiLinkedEmployeeId } from '@/features/mbdi/utils/use-linked-employee-id'
import { MbdiStatusPill, MbdiTierPill, ProgressBar } from '@/features/mbdi/ui'
import {
  MBDI_STATUS_LABELS,
  taskProgress,
  type MbdiStatus,
  type MbdiInitiative,
} from '@/features/mbdi/types'
import { BRAND_CONFIG } from '@/config/branding'

function displayProgress(ini: MbdiInitiative): number {
  if (ini.status === 'VALUE_CONFIRMED') return 100
  if (ini.status === 'COMPLETED' || ini.status === 'PERFORMANCE_CLAIMED') return 50
  if (ini.status === 'COMPLETION_CLAIMED') return Math.max(50, taskProgress(ini.tasks))
  return taskProgress(ini.tasks)
}

const AWAITING_REVIEW: MbdiStatus[] = [
  'PENDING_APPROVAL',
  'COMPLETION_CLAIMED',
  'PERFORMANCE_CLAIMED',
]

const STATUS_PILLS: Array<MbdiStatus | 'ALL' | 'AWAITING'> = [
  'ALL',
  'AWAITING',
  'APPROVED',
  'COMPLETION_CLAIMED',
  'COMPLETED',
  'PERFORMANCE_CLAIMED',
  'VALUE_CONFIRMED',
  'PENDING_APPROVAL',
  'REJECTED',
]

export default function InitiativesPage() {
  const router = useRouter()
  const store = useMbdiStore()
  const { user, profile, getRoles, reset } = useAuthStore()
  const { isInstallable, isInstalled, install } = usePWA()
  const linkedEmployeeId = useMbdiLinkedEmployeeId()
  const isApprover = isMbdiApproverRole(getRoles())

  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<MbdiStatus | 'ALL' | 'AWAITING'>('ALL')
  const [scopeFilter, setScopeFilter] = useState<'ALL' | 'MINE'>('ALL')
  const [unreadCount, setUnreadCount] = useState(0)
  const [chatUnreadByInitiative, setChatUnreadByInitiative] = useState<Record<string, number>>({})

  useEffect(() => {
    store.fetchInitiatives()
    return () => store.cleanup()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!user?.uid) return
    const q = query(
      collection(db, 'mbdiNotifications'),
      where('userId', '==', user.uid),
      where('read', '==', false)
    )
    const unsub = onSnapshot(
      q,
      (snap) => setUnreadCount(snap.size),
      (err) => console.error('[initiatives unread]', err)
    )
    return () => unsub()
  }, [user?.uid])

  useEffect(() => {
    if (!user?.uid) return
    const q = query(collection(db, 'chats'), where('participants', 'array-contains', user.uid))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const map: Record<string, number> = {}
        for (const d of snap.docs) {
          const data = d.data()
          if (data.type !== 'mbdi' || !data.mbdiInitiativeId) continue
          const n = Number(data.unreadCount?.[user.uid] || 0)
          if (n > 0) map[data.mbdiInitiativeId as string] = n
        }
        setChatUnreadByInitiative(map)
      },
      (err) => console.error('[initiatives chat unread]', err)
    )
    return () => unsub()
  }, [user?.uid])

  const employeeId = linkedEmployeeId ?? profile?.employeeId ?? null

  const isMine = (i: { ownerId?: string; ownerEmail?: string }) =>
    isMbdiInitiativeOwner(i, user, { employeeId })

  const scopedInitiatives = useMemo(() => {
    if (scopeFilter === 'MINE') return store.initiatives.filter(isMine)
    return store.initiatives
  }, [store.initiatives, scopeFilter, user, employeeId])

  const awaitingCount = useMemo(
    () => scopedInitiatives.filter((i) => AWAITING_REVIEW.includes(i.status)).length,
    [scopedInitiatives]
  )

  const filtered = useMemo(() => {
    let list = scopedInitiatives
    if (statusFilter === 'AWAITING') {
      list = list.filter((i) => AWAITING_REVIEW.includes(i.status))
    } else if (statusFilter !== 'ALL') {
      list = list.filter((i) => i.status === statusFilter)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(
        (i) =>
          (i.mbdiNo || '').toLowerCase().includes(q) ||
          i.title.toLowerCase().includes(q) ||
          (i.ownerName || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [scopedInitiatives, statusFilter, searchQuery])

  const handleLogout = async () => {
    await auth.signOut()
    reset()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-orange-500/15 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-orange-500/10 ring-1 ring-orange-500/20">
              <img src="/icon.png" alt="MBDI" className="h-[78%] w-[78%] object-contain" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-bold tracking-tight truncate">{BRAND_CONFIG.name}</h1>
              <p className="text-[11px] text-muted-foreground truncate">
                {isApprover ? 'Management register' : BRAND_CONFIG.tagline}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {isInstallable && !isInstalled && (
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300 hover:bg-orange-500/20"
                onClick={() => void install()}
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Install</span>
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="relative h-9 w-9 p-0"
              onClick={() => router.push('/notifications')}
              aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-600 px-1 text-[10px] font-bold text-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </Button>
            <Button variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={handleLogout} aria-label="Log out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-4 pb-10">
        {isApprover && awaitingCount > 0 && (
          <button
            type="button"
            onClick={() => setStatusFilter('AWAITING')}
            className={cn(
              'w-full rounded-xl border px-4 py-3 text-left transition-colors',
              statusFilter === 'AWAITING'
                ? 'border-amber-500/50 bg-amber-500/15'
                : 'border-amber-500/25 bg-amber-500/5 hover:bg-amber-500/10'
            )}
          >
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              {awaitingCount} awaiting review
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Proposals and claims that need management action
            </p>
          </button>
        )}

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by MBDI no., title, or owner..."
            className="pl-9"
          />
        </div>

        <div className="inline-flex rounded-lg border border-orange-500/20 bg-muted/40 p-0.5">
          {(['ALL', 'MINE'] as const).map((scope) => (
            <button
              key={scope}
              type="button"
              onClick={() => setScopeFilter(scope)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                scopeFilter === scope
                  ? 'bg-orange-600 text-white'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {scope === 'ALL' ? 'All' : 'Mine'}
            </button>
          ))}
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
          {STATUS_PILLS.map((s) => {
            if (s === 'AWAITING' && !isApprover) return null
            const active = statusFilter === s
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors',
                  active
                    ? 'bg-orange-600 text-white border-orange-600'
                    : 'bg-muted/40 text-muted-foreground border-transparent hover:border-orange-500/30'
                )}
              >
                {s === 'ALL' ? 'All' : s === 'AWAITING' ? `Awaiting (${awaitingCount})` : MBDI_STATUS_LABELS[s]}
              </button>
            )
          })}
        </div>

        {store.loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
          </div>
        ) : filtered.length === 0 ? (
          <Card className="border-dashed border-orange-500/30">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              {scopedInitiatives.length === 0
                ? scopeFilter === 'MINE'
                  ? 'You have no initiatives yet.'
                  : 'No initiatives in the register yet.'
                : 'No initiatives match your filters.'}
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {filtered.map((ini) => {
              const pct = displayProgress(ini)
              const chatUnread = chatUnreadByInitiative[ini.id] || 0
              return (
                <li key={ini.id}>
                  <button
                    type="button"
                    className="w-full text-left rounded-xl border border-orange-500/15 bg-card p-4 shadow-sm transition-colors hover:border-orange-500/40 hover:bg-orange-500/5"
                    onClick={() => router.push(`/initiatives/${ini.id}`)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-bold text-red-600 dark:text-red-400">
                          {ini.mbdiNo || 'Pending'}
                        </p>
                        <p className="font-semibold text-sm mt-0.5 line-clamp-2">{ini.title}</p>
                        <p className="text-[11px] text-muted-foreground mt-1 truncate">
                          {ini.ownerName}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <MbdiStatusPill status={ini.status} />
                        {chatUnread > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-orange-600/15 text-orange-700 dark:text-orange-300 border border-orange-500/25 px-2 py-0.5 text-[10px] font-semibold">
                            <MessageSquare className="size-3" />
                            {chatUnread}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <ProgressBar value={pct} className="flex-1 h-1.5" />
                      <span className="text-xs font-bold tabular-nums text-muted-foreground w-8 text-right">
                        {pct}%
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span>End {ini.endDate || '—'}</span>
                      {ini.tier ? <MbdiTierPill tier={ini.tier} amount={ini.rewardAmount} /> : null}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </main>
    </div>
  )
}
