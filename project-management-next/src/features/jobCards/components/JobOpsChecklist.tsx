'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  CHECKLIST_LABELS,
  CLOSURE_CHECKS,
  COMPLETION_CHECKS,
  PREPARATION_CHECKS,
  READY_CHECKS,
} from '@/lib/jobs/checklists'

interface JobOpsChecklistProps {
  completed: Record<string, boolean>
  onChange: (next: Record<string, boolean>) => void
  disabled?: boolean
}

function CheckGroup({
  title,
  keys,
  completed,
  onChange,
  disabled,
}: {
  title: string
  keys: readonly string[]
  completed: Record<string, boolean>
  onChange: (next: Record<string, boolean>) => void
  disabled?: boolean
}) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{title}</p>
      <div className="grid gap-2 md:grid-cols-2">
        {keys.map(key => (
          <label key={key} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={Boolean(completed[key])}
              disabled={disabled}
              onChange={event => onChange({ ...completed, [key]: event.target.checked })}
            />
            <span>{CHECKLIST_LABELS[key] || key}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

export default function JobOpsChecklist({ completed, onChange, disabled }: JobOpsChecklistProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-black uppercase tracking-widest">Job operating checks</CardTitle>
        <p className="text-xs text-muted-foreground">
          Submission, start, completion and closure each require their checklist. These do not approve costs or issue invoices.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <CheckGroup title="Preparation" keys={PREPARATION_CHECKS} completed={completed} onChange={onChange} disabled={disabled} />
        <CheckGroup title="Ready to start" keys={READY_CHECKS} completed={completed} onChange={onChange} disabled={disabled} />
        <CheckGroup title="Completion" keys={COMPLETION_CHECKS} completed={completed} onChange={onChange} disabled={disabled} />
        <CheckGroup title="Closure" keys={CLOSURE_CHECKS} completed={completed} onChange={onChange} disabled={disabled} />
        <Label className="text-xs text-muted-foreground">Unpaid customer balances can block closure from Admin settings.</Label>
      </CardContent>
    </Card>
  )
}
