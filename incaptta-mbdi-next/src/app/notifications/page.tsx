'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Bell,
  CheckCheck,
  Loader2,
  Rocket,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { db } from '@/lib/firebase'
import {
  collection,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from 'firebase/firestore'
import { useAuthStore } from '@/stores/auth-store'
import { markAllMbdiNotificationsRead } from '@/features/mbdi/utils/notify'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface MbdiNotification {
  id: string
  userId: string
  type: string
  title: string
  body: string
  initiativeId?: string
  mbdiNo?: string | null
  link?: string
  read: boolean
  createdAt?: { toDate?: () => Date } | null
  actorName?: string
}

function formatWhen(createdAt?: MbdiNotification['createdAt']): string {
  try {
    const d = createdAt?.toDate?.()
    if (!d) return ''
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

export default function NotificationsPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const [items, setItems] = useState<MbdiNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [markingAll, setMarkingAll] = useState(false)

  useEffect(() => {
    if (!user?.uid) return
    setLoading(true)
    const q = query(
      collection(db, 'mbdiNotifications'),
      where('userId', '==', user.uid)
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() } as MbdiNotification)
        )
        list.sort((a, b) => {
          const ta = a.createdAt?.toDate?.()?.getTime?.() || 0
          const tb = b.createdAt?.toDate?.()?.getTime?.() || 0
          return tb - ta
        })
        setItems(list)
        setLoading(false)
      },
      (err) => {
        console.error('[notifications]', err)
        setLoading(false)
        toast.error('Could not load notifications.')
      }
    )
    return () => unsub()
  }, [user?.uid])

  const handleMarkRead = async (n: MbdiNotification) => {
    if (n.read) return
    try {
      await updateDoc(doc(db, 'mbdiNotifications', n.id), { read: true })
    } catch (err) {
      console.error(err)
    }
  }

  const handleOpen = async (n: MbdiNotification) => {
    await handleMarkRead(n)
    if (n.initiativeId) {
      router.push(`/initiatives/${n.initiativeId}`)
    } else if (n.link?.startsWith('/initiatives/')) {
      router.push(n.link)
    } else if (n.link?.startsWith('/mbdi/')) {
      // Legacy Projects links → standalone path
      router.push(n.link.replace('/mbdi/', '/initiatives/'))
    }
  }

  const handleMarkAll = async () => {
    if (!user?.uid) return
    setMarkingAll(true)
    try {
      await markAllMbdiNotificationsRead(user.uid)
      toast.success('All notifications marked read.')
    } catch (err) {
      console.error(err)
      toast.error('Failed to mark notifications read.')
    } finally {
      setMarkingAll(false)
    }
  }

  const unread = items.filter((n) => !n.read).length

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-orange-500/15 bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0"
              onClick={() => router.push('/initiatives')}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="p-2 rounded-xl bg-orange-500/10 border border-orange-500/20">
              <Bell className="size-4 text-orange-600 dark:text-orange-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-bold">Notifications</h1>
              <p className="text-[11px] text-muted-foreground">
                {unread > 0 ? `${unread} unread` : 'All caught up'}
              </p>
            </div>
          </div>
          {unread > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-8 text-xs"
              onClick={handleMarkAll}
              disabled={markingAll}
            >
              {markingAll ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCheck className="h-3.5 w-3.5" />
              )}
              Mark all read
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4 pb-10 space-y-2">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
          </div>
        ) : items.length === 0 ? (
          <Card className="border-dashed border-orange-500/30">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              <Rocket className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
              No MBDI notifications yet.
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-2">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => handleOpen(n)}
                  className={cn(
                    'w-full text-left rounded-xl border p-4 transition-colors',
                    n.read
                      ? 'border-border/60 bg-card/50 opacity-80'
                      : 'border-orange-500/25 bg-orange-500/5 hover:bg-orange-500/10'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold">{n.title}</p>
                    {!n.read && (
                      <span className="mt-1 size-2 shrink-0 rounded-full bg-orange-500" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{n.body}</p>
                  <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span>{n.mbdiNo || (n.initiativeId ? 'Open initiative' : '')}</span>
                    <span>{formatWhen(n.createdAt)}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
