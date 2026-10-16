'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { ArrowLeft, Loader2, Plus, Rocket, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { toast } from 'sonner'
import { db } from '@/lib/firebase'
import { useMbdiStore } from '@/stores/mbdi-store'
import { useAuthStore } from '@/stores/auth-store'
import { useHrStore } from '@/stores/hr-store'
import { getEmpName } from '@/stores/hr-utils'
import {
  MBDI_TIERS,
  MBDI_APPROVER_ROLES,
  validateTierAmount,
  type MbdiTier,
} from '@/features/mbdi/types'

interface AppOwnerUser {
  id: string
  name: string
  email: string
  employeeId?: string | null
}

export default function NewMbdiProposalPage() {
  const router = useRouter()
  const store = useMbdiStore()
  const hrStore = useHrStore()
  const { user, hasAnyRole } = useAuthStore()

  const canAssignOwner = hasAnyRole([...MBDI_APPROVER_ROLES])

  const [title, setTitle] = useState('')
  const [objective, setObjective] = useState('')
  const [estimatedCost, setEstimatedCost] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [indicators, setIndicators] = useState<string[]>([''])
  /** Encoded: __myself__ | user:{uid} | emp:{employeeId} */
  const [ownerKey, setOwnerKey] = useState('')
  const [appUsers, setAppUsers] = useState<AppOwnerUser[]>([])
  const [tier, setTier] = useState<MbdiTier>('BRONZE')
  const [rewardAmount, setRewardAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!canAssignOwner) return
    hrStore.fetchEmployees()
    getDocs(collection(db, 'users'))
      .then((snap) => {
        const list: AppOwnerUser[] = snap.docs
          .map((d) => {
            const data = d.data()
            if (data.isActive === false) return null
            const email = (data.email || '').trim()
            if (!email) return null
            const name = (data.name || data.displayName || email) as string
            return {
              id: d.id,
              name,
              email,
              employeeId: (data.employeeId as string | undefined) || null,
            }
          })
          .filter(Boolean) as AppOwnerUser[]
        list.sort((a, b) => a.name.localeCompare(b.name))
        setAppUsers(list)
      })
      .catch((err) => console.error('Failed to load app users for MBDI owner picker:', err))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAssignOwner])

  const activeEmployees = useMemo(
    () =>
      hrStore.employees.filter(
        (e: any) => e.isActive !== false && e.status !== 'Terminated' && e.status !== 'Inactive'
      ),
    [hrStore.employees]
  )

  /** HR employees that do not already appear as an app user (by uid link or email). */
  const hrOnlyEmployees = useMemo(() => {
    const userEmails = new Set(appUsers.map((u) => u.email.trim().toLowerCase()))
    const linkedEmpIds = new Set(
      appUsers.map((u) => u.employeeId).filter(Boolean) as string[]
    )
    const userIds = new Set(appUsers.map((u) => u.id))

    return activeEmployees
      .filter((e: any) => {
        if (linkedEmpIds.has(e.id)) return false
        if (e.userId && userIds.has(e.userId)) return false
        const email = (e.email || '').trim().toLowerCase()
        if (email && userEmails.has(email)) return false
        return true
      })
      .sort((a: any, b: any) => getEmpName(a).localeCompare(getEmpName(b)))
  }, [activeEmployees, appUsers])

  const ownerSelectLabel = useMemo(() => {
    if (!ownerKey) return undefined
    if (ownerKey === '__myself__') {
      return `Myself (${user?.displayName || user?.email || 'current user'})`
    }
    if (ownerKey.startsWith('user:')) {
      const uid = ownerKey.slice(5)
      const u = appUsers.find((x) => x.id === uid)
      return u ? `${u.name} · ${u.email}` : ownerKey
    }
    if (ownerKey.startsWith('emp:')) {
      const eid = ownerKey.slice(4)
      const emp = activeEmployees.find((e: any) => e.id === eid)
      if (!emp) return ownerKey
      return emp.email
        ? `${getEmpName(emp)} · ${emp.email} (HR only)`
        : `${getEmpName(emp)} (HR only)`
    }
    return ownerKey
  }, [ownerKey, appUsers, activeEmployees, user])

  const setIndicator = (idx: number, value: string) =>
    setIndicators((prev) => prev.map((v, i) => (i === idx ? value : v)))

  const removeIndicator = (idx: number) =>
    setIndicators((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev))

  /** Resolve an app user uid that matches the HR employee's email. */
  const resolveOwnerUidByEmail = async (email: string): Promise<string | null> => {
    const normalized = email.trim().toLowerCase()
    try {
      const snap = await getDocs(
        query(collection(db, 'users'), where('email', '==', email.trim()))
      )
      if (!snap.empty) return snap.docs[0]!.id

      const all = await getDocs(collection(db, 'users'))
      const match = all.docs.find(
        (d) => (d.data().email || '').trim().toLowerCase() === normalized
      )
      return match?.id || null
    } catch (err) {
      console.error('Failed to resolve owner login account:', err)
      return null
    }
  }

  /** Resolve app uid for an HR employee via userId, employeeId link, or email. */
  const resolveUidForEmployee = async (emp: any): Promise<string | null> => {
    if (emp.userId) return emp.userId as string
    try {
      const byLink = await getDocs(
        query(collection(db, 'users'), where('employeeId', '==', emp.id))
      )
      if (!byLink.empty) return byLink.docs[0]!.id
    } catch (err) {
      console.error('Failed to resolve owner by employeeId:', err)
    }
    const email = (emp.email || '').trim()
    if (email) return resolveOwnerUidByEmail(email)
    return null
  }

  const resolveOwner = async () => {
    if (!user) return null

    if (!canAssignOwner) {
      return {
        ownerId: user.uid,
        ownerName: user.displayName || user.email || 'Unknown',
        ownerEmail: user.email || '',
      }
    }

    if (!ownerKey) {
      toast.error('Select the Initiative Owner.')
      return null
    }

    if (ownerKey === '__myself__') {
      if (!user.email) {
        toast.error('Your account needs an email address for payroll matching.')
        return null
      }
      return {
        ownerId: user.uid,
        ownerName: user.displayName || user.email || 'Manager',
        ownerEmail: user.email,
      }
    }

    if (ownerKey.startsWith('user:')) {
      const uid = ownerKey.slice(5)
      const appUser = appUsers.find((u) => u.id === uid)
      if (!appUser) {
        toast.error('Selected user was not found.')
        return null
      }
      if (!appUser.email) {
        toast.error('That user has no email — add one in Admin before assigning them.')
        return null
      }
      return {
        ownerId: appUser.id,
        ownerName: appUser.name,
        ownerEmail: appUser.email,
      }
    }

    if (ownerKey.startsWith('emp:')) {
      const eid = ownerKey.slice(4)
      const emp = activeEmployees.find((e: any) => e.id === eid) as any
      if (!emp) {
        toast.error('Selected employee was not found.')
        return null
      }

      const email = (emp.email || '').trim()
      if (!email) {
        toast.error('That employee has no email in HR — add an email before assigning them as owner.')
        return null
      }

      const appUid = await resolveUidForEmployee(emp)
      if (!appUid) {
        toast.warning(
          `${getEmpName(emp)} has no app login yet. Initiative will use their HR email (${email}) — create their user account with the same email so they can open MBDI and get notifications.`
        )
      }

      return {
        ownerId: appUid || emp.id,
        ownerName: getEmpName(emp),
        ownerEmail: email,
      }
    }

    toast.error('Invalid owner selection.')
    return null
  }

  const handleSubmit = async () => {
    if (!user) return
    const cleanIndicators = indicators.map((s) => s.trim()).filter(Boolean)

    if (!title.trim()) return toast.error('Give your initiative a short title.')
    if (!objective.trim()) return toast.error('Describe the objective.')
    if (estimatedCost === '' || Number(estimatedCost) < 0 || !Number.isFinite(Number(estimatedCost)))
      return toast.error('Enter a valid estimated cost (0 or more).')
    if (!startDate || !endDate) return toast.error('Set the planned timeline (start and end dates).')
    if (endDate < startDate) return toast.error('End date cannot be before the start date.')
    if (cleanIndicators.length === 0) return toast.error('Add at least one success indicator.')

    let amount = 0
    if (canAssignOwner) {
      amount = Number(rewardAmount)
      const validationError = validateTierAmount(tier, amount)
      if (validationError) return toast.error(validationError)
    }

    setSubmitting(true)
    try {
      const owner = await resolveOwner()
      if (!owner) {
        setSubmitting(false)
        return
      }

      const proposal = {
        title: title.trim(),
        ...owner,
        objective: objective.trim(),
        expectedBenefit: '',
        estimatedCost: Number(estimatedCost),
        startDate,
        endDate,
        successIndicators: cleanIndicators,
      }

      if (canAssignOwner) {
        const { id, mbdiNo } = await store.createApprovedInitiative(
          proposal,
          { tier, rewardAmount: amount },
          { uid: user.uid, name: user.displayName || user.email || 'Manager' }
        )
        toast.success(`Initiative ${mbdiNo} created and approved for ${owner.ownerName}.`)
        router.push(`/mbdi/${id}`)
      } else {
        const id = await store.submitProposal(proposal)
        toast.success('Proposal submitted for management approval.')
        router.push(`/mbdi/${id}`)
      }
    } catch (err: any) {
      console.error('Failed to submit MBDI proposal:', err)
      toast.error(err?.message || 'Failed to submit proposal.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="sm" className="h-9 w-9 p-0 shrink-0 mt-0.5" onClick={() => router.push('/mbdi')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 shrink-0">
          <Rocket className="size-5 text-red-600 dark:text-red-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New MBDI Proposal</h1>
          <p className="text-sm text-muted-foreground">
            {canAssignOwner
              ? 'Create an approved initiative and assign an Initiative Owner'
              : 'Stage 1 — submit your business development initiative for management approval'}
          </p>
        </div>
      </div>

      <Card className="shadow-sm border-red-500/15 overflow-hidden">
        <CardHeader className="bg-red-500/5 border-b border-red-500/10">
          <CardTitle className="text-base text-red-700 dark:text-red-300">Proposal Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {canAssignOwner && (
            <div className="space-y-1.5">
              <Label>Initiative Owner</Label>
              <Select value={ownerKey} onValueChange={(v) => setOwnerKey(v || '')}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a user (preferred) or HR employee">
                    {ownerSelectLabel}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__myself__">
                    Myself ({user?.displayName || user?.email || 'current user'})
                  </SelectItem>
                  {appUsers.map((u) => (
                    <SelectItem key={`user:${u.id}`} value={`user:${u.id}`}>
                      {u.name} · {u.email}
                    </SelectItem>
                  ))}
                  {hrOnlyEmployees.map((emp: any) => (
                    <SelectItem key={`emp:${emp.id}`} value={`emp:${emp.id}`}>
                      {getEmpName(emp)}
                      {emp.email ? ` · ${emp.email}` : ''} (no login)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Prefer app users so they can open MBDI immediately. HR-only entries are people without a
                login yet — payroll still matches by email; create their user with the same email so they
                get access and notifications.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="mbdi-title">Initiative Title</Label>
            <Input
              id="mbdi-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Negotiate a quarterly advertising partnership with a local agricultural magazine"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mbdi-objective">Objective</Label>
            <Textarea
              id="mbdi-objective"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="What will this initiative achieve, and how will you go about it?"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="mbdi-cost">Estimated Cost (US$)</Label>
              <Input
                id="mbdi-cost"
                type="number"
                min="0"
                step="0.01"
                value={estimatedCost}
                onChange={(e) => setEstimatedCost(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mbdi-start">Start Date</Label>
              <Input id="mbdi-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mbdi-end">Target End Date</Label>
              <Input id="mbdi-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Success Indicators</Label>
            <p className="text-xs text-muted-foreground">
              The owner ticks each indicator as it is achieved, and management verifies it. All indicators
              must be verified before the Stage 2 payment unlocks.
            </p>
            <div className="space-y-2">
              {indicators.map((value, idx) => (
                <div key={idx} className="flex gap-2">
                  <Input
                    value={value}
                    onChange={(e) => setIndicator(idx, e.target.value)}
                    placeholder={`Indicator ${idx + 1} — e.g. Contract signed and campaign launched`}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0 shrink-0"
                    onClick={() => removeIndicator(idx)}
                    disabled={indicators.length === 1}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 mt-1"
              onClick={() => setIndicators((prev) => [...prev, ''])}
            >
              <Plus className="h-3.5 w-3.5" />
              Add Indicator
            </Button>
          </div>
        </CardContent>
      </Card>

      {canAssignOwner ? (
        <Card className="shadow-sm border-emerald-500/15 overflow-hidden">
          <CardHeader className="bg-emerald-500/5 border-b border-emerald-500/10">
            <CardTitle className="text-base text-emerald-700 dark:text-emerald-300">
              Reward Classification (auto-approved on create)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Reward Tier</Label>
                <Select value={tier} onValueChange={(v) => setTier((v as MbdiTier) || 'BRONZE')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(MBDI_TIERS) as MbdiTier[]).map((t) => (
                      <SelectItem key={t} value={t}>
                        {MBDI_TIERS[t].label} — {MBDI_TIERS[t].description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mbdi-reward">Reward Amount (US$)</Label>
                <Input
                  id="mbdi-reward"
                  type="number"
                  min="0"
                  step="0.01"
                  value={rewardAmount}
                  onChange={(e) => setRewardAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Creating this proposal assigns an MBDI number immediately. The owner earns 50% on successful
              completion and the remaining 50% after the performance assessment — paid with their monthly salary.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="shadow-sm border-amber-500/15 overflow-hidden">
          <CardHeader className="bg-amber-500/5 border-b border-amber-500/10">
            <CardTitle className="text-base text-amber-700 dark:text-amber-300">
              Reward Scale (set by management at approval)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              {(Object.keys(MBDI_TIERS) as MbdiTier[]).map((key) => {
                const t = MBDI_TIERS[key]
                return (
                  <div key={t.label} className={`rounded-xl border p-3 ${t.badgeClass}`}>
                    <p className="font-bold">{t.label}</p>
                    <p className="text-xs opacity-80 mt-0.5">{t.description}</p>
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              50% is paid on successful completion of the approved scope; the remaining 50% is paid once
              management confirms the initiative produced measurable value. Rewards are paid with your monthly salary.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end gap-2 pb-4">
        <Button variant="outline" onClick={() => router.push('/mbdi')} disabled={submitting}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={submitting}
          className="gap-1.5 bg-red-600 hover:bg-red-700 text-white"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {canAssignOwner ? 'Create & Approve Initiative' : 'Submit Proposal'}
        </Button>
      </div>
    </div>
  )
}
