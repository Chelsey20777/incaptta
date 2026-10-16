'use client'

import React, { useEffect, useState } from 'react'
import { db } from '@/lib/firebase'
import { doc, onSnapshot } from 'firebase/firestore'
import { FileText, ExternalLink, ShieldCheck, CheckCircle2, FileEdit, AlertCircle } from 'lucide-react'

interface JobCardTag {
  type: string
  id: string
  label: string
  url: string
}

interface JobCardMessageCardProps {
  tag: JobCardTag
  brandColor: string
}

export default function JobCardMessageCard({ tag, brandColor }: JobCardMessageCardProps) {
  const [job, setJob] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Listen to real-time updates for this job card
    const unsub = onSnapshot(doc(db, 'jobCards', tag.id), (snap) => {
      if (snap.exists()) {
        setJob(snap.data())
      }
      setLoading(false)
    }, () => {
      setLoading(false)
    })
    return () => unsub()
  }, [tag.id])

  if (loading) {
    return (
      <div className="flex items-center gap-3 p-3 bg-slate-950/40 border border-slate-800/80 rounded-xl w-72 animate-pulse mt-2">
        <div className="h-9 w-9 bg-slate-800 rounded-lg shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3.5 bg-slate-800 rounded w-2/3" />
          <div className="h-2.5 bg-slate-800 rounded w-1/2" />
        </div>
      </div>
    )
  }

  if (!job) {
    return (
      <div className="flex items-center gap-2.5 p-3 bg-red-950/20 border border-red-900/30 text-red-400 text-[11px] rounded-xl w-72 mt-2">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>Job Card reference not found ({tag.label})</span>
      </div>
    )
  }

  const status = job.status || 'DRAFT'
  
  // Status Color and Icon assignment
  const getStatusMeta = (statusStr: string) => {
    switch (statusStr.toUpperCase()) {
      case 'COMPLETED':
        return {
          label: 'Completed',
          bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
          icon: CheckCircle2
        }
      case 'APPROVED_MANAGER':
        return {
          label: 'Approved',
          bg: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
          icon: ShieldCheck
        }
      case 'SUBMITTED':
        return {
          label: 'Submitted',
          bg: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
          icon: FileText
        }
      case 'DRAFT':
      default:
        return {
          label: statusStr === 'DRAFT' ? 'Draft' : statusStr.replace(/_/g, ' '),
          bg: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
          icon: FileEdit
        }
    }
  }

  const statusMeta = getStatusMeta(status)
  const StatusIcon = statusMeta.icon
  const customerName = job.generalInfo?.recipientName || job.generalInfo?.clientName || 'Unknown Customer'
  const jobNumber = job.generalInfo?.jobNumber || tag.label

  // Deep link to the main portal job card record.
  // In local development, link to localhost:3000; otherwise the production portal.
  const isLocalDev = typeof window !== 'undefined' && window.location.hostname === 'localhost'
  const portalBaseUrl = isLocalDev ? 'http://localhost:3000' : 'https://incaptta-pro.web.app'
  const deepLinkUrl = `${portalBaseUrl}/job-cards/${tag.id}`

  return (
    <div className="mt-2 p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl w-72 shadow-lg flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
            <FileText className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h4 className="font-semibold text-xs text-slate-200 truncate">{jobNumber}</h4>
            <p className="text-[10px] text-slate-400 truncate max-w-[140px]" title={customerName}>{customerName}</p>
          </div>
        </div>

        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold border shrink-0 ${statusMeta.bg}`}>
          <StatusIcon className="h-2.5 w-2.5" />
          {statusMeta.label}
        </span>
      </div>

      <div className="flex items-center justify-between border-t border-slate-850 pt-2 mt-1">
        <span className="text-[10px] text-slate-500 font-medium">Job Card Record</span>
        <a 
          href={deepLinkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-950 hover:opacity-90 px-2 py-1 rounded-md transition-all shadow"
          style={{ backgroundColor: brandColor }}
        >
          <span>Open Record</span>
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  )
}
