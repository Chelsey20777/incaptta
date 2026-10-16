'use client'

import React, { useState, useMemo, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { useContainerAccessStore } from '@/stores/container-access-store'
import { useJobCardsStore } from '@/stores/job-cards-store'
import { useAuthStore } from '@/stores/auth-store'
import type { JobCardRef } from '@/features/container-access/types'

export default function CreateCaaPage() {
  const router = useRouter()
  const store = useContainerAccessStore()
  const jobCardsStore = useJobCardsStore()
  const { user, claims } = useAuthStore()
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    jobCardsStore.fetchJobCards()
    return () => {
      jobCardsStore.cleanup?.()
    }
  }, [])

  // ── Job card selector ─────────────────────────────────────────────────────
  const [jobSearch, setJobSearch] = useState('')
  const [selectedJobCard, setSelectedJobCard] = useState<JobCardRef | null>(null)
  const [showJobDropdown, setShowJobDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const filteredJobCards = useMemo(() => {
    const q = jobSearch.toLowerCase().trim()
    if (!q) return jobCardsStore.jobCards.slice(0, 20)
    return jobCardsStore.jobCards
      .filter((j: any) => {
        const num = (j.generalInfo?.jobNumber || '').toLowerCase()
        const name = (j.generalInfo?.recipientName || '').toLowerCase()
        const addr = (j.generalInfo?.recipientAddress || '').toLowerCase()
        return num.includes(q) || name.includes(q) || addr.includes(q)
      })
      .slice(0, 20)
  }, [jobCardsStore.jobCards, jobSearch])

  function selectJobCard(job: any) {
    setSelectedJobCard({
      id: job.id,
      jobNumber: job.generalInfo?.jobNumber || job.id.substring(0, 8),
      clientName: job.generalInfo?.recipientName || 'Unknown',
      location: job.generalInfo?.recipientAddress || '—',
    })
    setJobSearch(job.generalInfo?.jobNumber || job.id.substring(0, 8))
    setShowJobDropdown(false)
  }

  function clearJobCard() {
    setSelectedJobCard(null)
    setJobSearch('')
  }

  // ── Form state ────────────────────────────────────────────────────────────

  const [form, setForm] = useState({
    containerName: 'Main Container',
    containerLocation: '',
    purposeOfAccess: '',
    accessDate: '',
    accessTimeFrom: '',
    accessTimeTo: '',
  })

  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  function validate(): boolean {
    const errors: Record<string, string> = {}
    if (!form.containerName.trim()) errors.containerName = 'Container name is required'
    if (!form.containerLocation.trim()) errors.containerLocation = 'Container location is required'
    if (!form.purposeOfAccess.trim()) errors.purposeOfAccess = 'Purpose of access is required'
    if (!form.accessDate) {
      errors.accessDate = 'Access date is required'
    } else {
      const today = new Date().toISOString().substring(0, 10)
      if (form.accessDate < today) {
        errors.accessDate = 'Access date cannot be in the past'
      }
    }
    if (!form.accessTimeFrom) errors.accessTimeFrom = 'Start time is required'
    if (!form.accessTimeTo) errors.accessTimeTo = 'End time is required'
    if (form.accessTimeFrom && form.accessTimeTo && form.accessTimeTo <= form.accessTimeFrom) {
      errors.accessTimeTo = 'End time must be after start time'
    }
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    if (!user) {
      toast.error('You must be logged in to submit a request')
      return
    }

    setIsSubmitting(true)
    try {
      const rolesRaw = claims?.roles
      const role = Array.isArray(rolesRaw) ? rolesRaw[0] : String(rolesRaw || 'UNKNOWN')

      const id = await store.createRequest({
        containerName: form.containerName.trim(),
        containerLocation: form.containerLocation.trim(),
        purposeOfAccess: form.purposeOfAccess.trim(),
        accessDate: form.accessDate,
        accessTimeFrom: form.accessTimeFrom,
        accessTimeTo: form.accessTimeTo,
        requestedByUid: user.uid,
        requestedByName: user.displayName || user.email || 'Unknown',
        requestedByRole: role,
        requestedByEmail: user.email || '',
        ...(selectedJobCard ? { jobCardRef: selectedJobCard } : {}),
      })

      toast.success('Access request submitted successfully')
      router.push(`/container-access/${id}`)
    } catch (err: any) {
      toast.error('Failed to submit request', { description: err.message })
    } finally {
      setIsSubmitting(false)
    }
  }

  function updateForm(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (formErrors[field]) {
      setFormErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <Button variant="ghost" size="sm" className="mb-4 gap-1" onClick={() => router.push('/container-access')}>
        <ArrowLeft className="h-4 w-4" />
        Back
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>New Container Access Request</CardTitle>
          <CardDescription>
            Submit a request to access a physical inventory container. A manager must approve before
            access is granted.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Job Card Reference (optional) */}
          <div className="space-y-1.5" ref={dropdownRef}>
            <Label>
              Job Card Reference{' '}
              <span className="text-muted-foreground text-xs font-normal">(optional)</span>
            </Label>
            <div className="relative">
              <div className="relative flex items-center">
                <Search className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  value={jobSearch}
                  onChange={(e) => {
                    setJobSearch(e.target.value)
                    setShowJobDropdown(true)
                  }}
                  placeholder="Search by job #, client name or location..."
                  className="pl-9 pr-8"
                  onFocus={() => setShowJobDropdown(true)}
                  onBlur={() => setTimeout(() => setShowJobDropdown(false), 150)}
                />
                {selectedJobCard && (
                  <button
                    type="button"
                    className="absolute right-2 text-muted-foreground hover:text-foreground"
                    onClick={clearJobCard}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Selected job card badge */}
              {selectedJobCard && (
                <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-1.5">
                  <span className="font-semibold text-foreground">{selectedJobCard.jobNumber}</span>
                  <span>·</span>
                  <span>{selectedJobCard.clientName}</span>
                  <span>·</span>
                  <span>{selectedJobCard.location}</span>
                </div>
              )}

              {/* Dropdown results */}
              {showJobDropdown && filteredJobCards.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-md max-h-52 overflow-y-auto">
                  {filteredJobCards.map((job: any) => (
                    <button
                      key={job.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex flex-col gap-0.5"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        selectJobCard(job)
                      }}
                    >
                      <span className="font-semibold">
                        {job.generalInfo?.jobNumber || job.id.substring(0, 8)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {job.generalInfo?.recipientName || '—'}
                        {job.generalInfo?.recipientAddress && (
                          <> · {job.generalInfo.recipientAddress}</>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Container Name */}
          <div className="space-y-1.5">
            <Label htmlFor="containerName">
              Container Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="containerName"
              value={form.containerName}
              onChange={(e) => updateForm('containerName', e.target.value)}
              placeholder="e.g. Main Warehouse Container A"
              className={formErrors.containerName ? 'border-red-500' : ''}
            />
            {formErrors.containerName && (
              <p className="text-xs text-red-500">{formErrors.containerName}</p>
            )}
          </div>

          {/* Container Location */}
          <div className="space-y-1.5">
            <Label htmlFor="containerLocation">
              Container Location <span className="text-red-500">*</span>
            </Label>
            <Input
              id="containerLocation"
              value={form.containerLocation}
              onChange={(e) => updateForm('containerLocation', e.target.value)}
              placeholder="e.g. Warehouse Block B, Bay 3"
              className={formErrors.containerLocation ? 'border-red-500' : ''}
            />
            {formErrors.containerLocation && (
              <p className="text-xs text-red-500">{formErrors.containerLocation}</p>
            )}
          </div>

          {/* Purpose of Access */}
          <div className="space-y-1.5">
            <Label htmlFor="purposeOfAccess">
              Purpose of Access <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="purposeOfAccess"
              value={form.purposeOfAccess}
              onChange={(e) => updateForm('purposeOfAccess', e.target.value)}
              placeholder="Describe why you need access to this container..."
              rows={3}
              className={formErrors.purposeOfAccess ? 'border-red-500' : ''}
            />
            {formErrors.purposeOfAccess && (
              <p className="text-xs text-red-500">{formErrors.purposeOfAccess}</p>
            )}
          </div>

          {/* Access Date */}
          <div className="space-y-1.5">
            <Label htmlFor="accessDate">
              Requested Access Date <span className="text-red-500">*</span>
            </Label>
            <Input
              id="accessDate"
              value={form.accessDate}
              onChange={(e) => updateForm('accessDate', e.target.value)}
              type="date"
              className={formErrors.accessDate ? 'border-red-500' : ''}
            />
            {formErrors.accessDate && (
              <p className="text-xs text-red-500">{formErrors.accessDate}</p>
            )}
          </div>

          {/* Time Window */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="accessTimeFrom">
                From <span className="text-red-500">*</span>
              </Label>
              <Input
                id="accessTimeFrom"
                value={form.accessTimeFrom}
                onChange={(e) => updateForm('accessTimeFrom', e.target.value)}
                type="time"
                className={formErrors.accessTimeFrom ? 'border-red-500' : ''}
              />
              {formErrors.accessTimeFrom && (
                <p className="text-xs text-red-500">{formErrors.accessTimeFrom}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="accessTimeTo">
                To <span className="text-red-500">*</span>
              </Label>
              <Input
                id="accessTimeTo"
                value={form.accessTimeTo}
                onChange={(e) => updateForm('accessTimeTo', e.target.value)}
                type="time"
                className={formErrors.accessTimeTo ? 'border-red-500' : ''}
              />
              {formErrors.accessTimeTo && (
                <p className="text-xs text-red-500">{formErrors.accessTimeTo}</p>
              )}
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => router.push('/container-access')}>
            Cancel
          </Button>
          <Button disabled={isSubmitting} onClick={handleSubmit}>
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Submit Request
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}