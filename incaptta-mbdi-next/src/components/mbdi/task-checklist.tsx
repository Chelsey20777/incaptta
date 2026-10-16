'use client'

import React, { useState } from 'react'
import { Check, Loader2, ListChecks, Plus, Trash2, Undo2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useMbdiStore } from '@/stores/mbdi-store'
import { MbdiTaskStatusPill, ProgressBar } from '@/features/mbdi/ui'
import {
  MBDI_TASK_STATUS_META,
  taskProgress,
  type MbdiInitiative,
  type MbdiTask,
} from '@/features/mbdi/types'

interface Props {
  initiative: MbdiInitiative
  isOwner: boolean
  isApprover: boolean
  actor: { uid: string; name: string }
}

export function MbdiTaskChecklist({ initiative, isOwner, isApprover, actor }: Props) {
  const store = useMbdiStore()
  const [newTitle, setNewTitle] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const tasks = initiative.tasks || []
  const progress = taskProgress(tasks)
  const verifiedCount = tasks.filter((t) => t.status === 'VERIFIED').length
  const canManageTasks =
    isApprover && !['COMPLETED', 'PERFORMANCE_CLAIMED', 'VALUE_CONFIRMED', 'REJECTED'].includes(initiative.status)
  const canOwnerMark = isOwner && initiative.status === 'APPROVED'
  const canVerify = isApprover && initiative.status === 'APPROVED'

  const run = async (taskId: string | 'add', fn: () => Promise<void>, okMsg: string) => {
    setBusyId(taskId)
    try {
      await fn()
      toast.success(okMsg)
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || 'Action failed.')
    } finally {
      setBusyId(null)
    }
  }

  const handleAdd = async () => {
    if (!newTitle.trim()) return toast.error('Enter a success indicator.')
    setAdding(true)
    try {
      await store.addTask(initiative, newTitle.trim(), actor)
      setNewTitle('')
      toast.success('Success indicator added.')
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add indicator.')
    } finally {
      setAdding(false)
    }
  }

  const handleSeed = () =>
    run('add', () => store.seedTasksFromIndicators(initiative, actor), 'Stage 1 indicators loaded.')

  return (
    <Card className="mb-4 overflow-hidden shadow-sm border-orange-500/20 bg-orange-500/5 dark:bg-orange-500/10">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-3 pb-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2 rounded-lg bg-orange-500/10 shrink-0">
            <ListChecks className="size-4 text-orange-500" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base">Success Indicators</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Defined at Stage 1 (proposal). The owner ticks each indicator as achieved; management verifies
              it to unlock progress. Stage 2 claim requires all indicators verified.
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p
            className={cn(
              'text-2xl font-black tabular-nums',
              progress >= 100
                ? 'text-emerald-600 dark:text-emerald-400'
                : progress > 0
                  ? 'text-orange-600 dark:text-orange-400'
                  : 'text-muted-foreground'
            )}
          >
            {progress}%
          </p>
          <p className="text-[11px] text-muted-foreground font-medium">
            {verifiedCount}/{tasks.length || 0} verified
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <ProgressBar value={progress} className="h-2.5" />

        {tasks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-orange-500/30 bg-background/60 py-8 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              {canManageTasks && (initiative.successIndicators || []).length > 0
                ? 'This initiative was created before indicators became tickable.'
                : 'No success indicators yet. They are defined in the Stage 1 proposal.'}
            </p>
            {canManageTasks && (initiative.successIndicators || []).length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 dark:text-orange-400 border-orange-500/20"
                onClick={handleSeed}
                disabled={busyId === 'add'}
              >
                {busyId === 'add' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ListChecks className="h-3.5 w-3.5" />}
                Load Stage 1 indicators
              </Button>
            )}
          </div>
        ) : (
          <ul className="space-y-2">
            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                busy={busyId === task.id}
                canOwnerMark={canOwnerMark}
                canVerify={canVerify}
                canRemove={canManageTasks && task.status !== 'VERIFIED'}
                onMarkDone={() =>
                  run(task.id, () => store.setTaskDone(initiative, task.id, true), 'Marked done — awaiting verification.')
                }
                onMarkPending={() =>
                  run(task.id, () => store.setTaskDone(initiative, task.id, false), 'Indicator unticked.')
                }
                onVerify={() =>
                  run(task.id, () => store.verifyTask(initiative, task.id, true, actor), 'Indicator verified.')
                }
                onReturn={() =>
                  run(
                    task.id,
                    () => store.verifyTask(initiative, task.id, false, actor),
                    'Indicator returned to owner.'
                  )
                }
                onUnverify={() =>
                  run(
                    task.id,
                    () => store.verifyTask(initiative, task.id, false, actor),
                    'Verification withdrawn.'
                  )
                }
                onRemove={() =>
                  run(task.id, () => store.removeTask(initiative, task.id), 'Indicator removed.')
                }
              />
            ))}
          </ul>
        )}

        {canManageTasks && (
          <div className="flex gap-2 pt-3 border-t border-orange-500/15">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Add a success indicator..."
              className="bg-background/80"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleAdd()
                }
              }}
            />
            <Button className="gap-1.5 shrink-0 bg-orange-600 hover:bg-orange-700 text-white" onClick={handleAdd} disabled={adding}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function TaskRow({
  task,
  busy,
  canOwnerMark,
  canVerify,
  canRemove,
  onMarkDone,
  onMarkPending,
  onVerify,
  onReturn,
  onUnverify,
  onRemove,
}: {
  task: MbdiTask
  busy: boolean
  canOwnerMark: boolean
  canVerify: boolean
  canRemove: boolean
  onMarkDone: () => void
  onMarkPending: () => void
  onVerify: () => void
  onReturn: () => void
  onUnverify: () => void
  onRemove: () => void
}) {
  const accent = MBDI_TASK_STATUS_META[task.status].accent

  return (
    <li
      className={cn(
        'rounded-xl border bg-background/80 p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 border-l-4 shadow-sm',
        accent
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold">{task.title}</p>
          <MbdiTaskStatusPill status={task.status} />
        </div>
        {task.reviewNote && (
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">Note: {task.reviewNote}</p>
        )}
        {task.verifiedByName && task.status === 'VERIFIED' && (
          <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80 mt-0.5">
            Verified by {task.verifiedByName}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
        {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}

        {canOwnerMark && task.status === 'PENDING' && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
            onClick={onMarkDone}
            disabled={busy}
          >
            <Check className="h-3.5 w-3.5" />
            Done
          </Button>
        )}
        {canOwnerMark && task.status === 'DONE' && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1 bg-slate-500/10 hover:bg-slate-500/20 text-slate-600 border-slate-500/20"
            onClick={onMarkPending}
            disabled={busy}
          >
            <X className="h-3.5 w-3.5" />
            Undo
          </Button>
        )}

        {canVerify && task.status === 'DONE' && (
          <>
            <Button
              size="sm"
              className="h-8 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={onVerify}
              disabled={busy}
            >
              <Check className="h-3.5 w-3.5" />
              Verify
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1 bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 dark:text-orange-400 border-orange-500/20"
              onClick={onReturn}
              disabled={busy}
            >
              <Undo2 className="h-3.5 w-3.5" />
              Return
            </Button>
          </>
        )}

        {canVerify && task.status === 'VERIFIED' && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1 bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 dark:text-orange-400 border-orange-500/20"
            onClick={onUnverify}
            disabled={busy}
          >
            <Undo2 className="h-3.5 w-3.5" />
            Unverify
          </Button>
        )}

        {canRemove && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0 text-red-500 hover:bg-red-500/10"
            onClick={onRemove}
            disabled={busy}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </li>
  )
}
