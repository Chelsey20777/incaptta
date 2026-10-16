'use client'

import React, { useState, useEffect, useRef } from 'react'
import { db } from '@/lib/firebase'
import { collection, getDocs, query, limit } from 'firebase/firestore'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import {
  Loader2, FileText, Receipt, Building2, User, AtSign, FileCheck,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Entity type configuration — exported so page.tsx can use it for rendering
// ---------------------------------------------------------------------------
export const ENTITY_TYPE_META: Record<string, {
  label: string
  chipClass: string
  icon: React.ComponentType<{ className?: string }>
  firestoreCollection: string
  searchFields: string[]
  buildUrl: (id: string) => string
  getLabel: (doc: any) => string
  getSecondary?: (doc: any) => string
}> = {
  job_card: {
    label: 'JobCard',
    chipClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800',
    icon: FileText,
    firestoreCollection: 'jobCards',
    searchFields: ['generalInfo.jobNumber', 'generalInfo.recipientName', 'generalInfo.clientName'],
    buildUrl: (id) => `/job-cards/${id}`,
    getLabel: (doc) => doc.generalInfo?.recipientName || doc.generalInfo?.clientName || 'Unknown Customer',
    getSecondary: (doc) => doc.generalInfo?.jobNumber || doc.id,
  },
  invoice: {
    label: 'Invoice',
    chipClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
    icon: Receipt,
    firestoreCollection: 'crmInvoices',
    searchFields: ['invoiceNumber', 'customerName'],
    buildUrl: () => `/crm/invoices`,
    getLabel: (doc) => doc.invoiceNumber || doc.id.substring(0, 8),
    getSecondary: (doc) => doc.customerName || '',
  },
  quote: {
    label: 'Quote',
    chipClass: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800',
    icon: FileCheck,
    firestoreCollection: 'crmQuotes',
    searchFields: ['quoteNumber', 'quoteRef', 'customerName'],
    buildUrl: () => `/crm/quotations`,
    getLabel: (doc) => doc.quoteNumber || doc.quoteRef || doc.id,
    getSecondary: (doc) => doc.customerName || '',
  },
  customer: {
    label: 'Customer',
    chipClass: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-200 dark:border-violet-800',
    icon: Building2,
    firestoreCollection: 'customers',
    searchFields: ['name', 'companyName', 'email'],
    buildUrl: (id) => `/crm/customers/${id}`,
    getLabel: (doc) => doc.name || doc.companyName || doc.id,
    getSecondary: (doc) => doc.email || doc.phone || '',
  },
  staff: {
    label: 'Staff',
    chipClass: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-800',
    icon: User,
    firestoreCollection: 'users',
    searchFields: ['name', 'displayName', 'email'],
    buildUrl: (id) => `/hr/${id}`,
    getLabel: (doc) => doc.name || doc.displayName || doc.email || doc.id,
    getSecondary: (doc) => doc.role || doc.jobTitle || doc.email || '',
  },
}

const ENTITY_TYPES = Object.entries(ENTITY_TYPE_META).map(([type, meta]) => ({ type, ...meta }))

function getInitials(name: string) {
  return (name || '?').split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface MentionCommandOverlayProps {
  mode: 'mention' | 'command' | 'entity-search' | null
  mentionQuery: string
  users: any[]
  onSelectMention: (user: any) => void
  onSelectEntityType: (type: string) => void
  onSelectEntity: (entity: any, type: string, label: string, url: string) => void
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function MentionCommandOverlay({
  mode,
  mentionQuery,
  users,
  onSelectMention,
  onSelectEntityType,
  onSelectEntity,
  onClose,
}: MentionCommandOverlayProps) {
  const [entityType, setEntityType] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (mode !== 'entity-search') {
      setEntityType(null)
      setSearchQuery('')
      setResults([])
    }
  }, [mode])

  useEffect(() => {
    if (mode === 'entity-search' && entityType) {
      const t = setTimeout(() => searchInputRef.current?.focus(), 40)
      return () => clearTimeout(t)
    }
  }, [mode, entityType])

  useEffect(() => {
    if (!entityType || mode !== 'entity-search') return
    const meta = ENTITY_TYPE_META[entityType]
    if (!meta) return
    const q = searchQuery.trim().toLowerCase()
    setSearching(true)
    getDocs(query(collection(db, meta.firestoreCollection), limit(200)))
      .then((snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        const filtered = q
          ? docs.filter((doc) =>
              meta.searchFields.some((field) => {
                const val = field.split('.').reduce((obj: any, key) => obj?.[key], doc)
                return String(val ?? '').toLowerCase().includes(q)
              }),
            )
          : docs
        setResults(filtered.slice(0, 8))
      })
      .catch(() => setResults([]))
      .finally(() => setSearching(false))
  }, [searchQuery, entityType, mode])

  const handleSelectEntityType = (type: string) => {
    setEntityType(type)
    setSearchQuery('')
    setResults([])
    onSelectEntityType(type)
  }

  const handleSelectEntity = (doc: any) => {
    if (!entityType) return
    const meta = ENTITY_TYPE_META[entityType]
    const label = meta.getLabel(doc)
    const url = meta.buildUrl(doc.id)
    onSelectEntity(doc, entityType, label, url)
    setEntityType(null)
    setSearchQuery('')
    setResults([])
  }

  const filteredUsers = users
    .filter((u) => {
      const name = (u.displayName || u.email || '').toLowerCase()
      return !mentionQuery.trim() || name.includes(mentionQuery.toLowerCase())
    })
    .slice(0, 8)

  if (!mode) return null

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 z-50">
      <div className="bg-popover border rounded-xl shadow-2xl overflow-hidden max-h-72 flex flex-col">

        {/* Mention Mode */}
        {mode === 'mention' && (
          <>
            <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-1.5 border-b shrink-0">
              <AtSign className="h-3.5 w-3.5 text-primary shrink-0" />
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
                Mention a person
              </p>
            </div>
            <div className="overflow-y-auto">
              {filteredUsers.length === 0 ? (
                <p className="px-3 py-3 text-xs text-muted-foreground">No matching users found</p>
              ) : (
                <div className="py-1">
                  {filteredUsers.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted/50 transition-colors text-left"
                      onMouseDown={(e) => { e.preventDefault(); onSelectMention(u) }}
                    >
                      <Avatar className="h-7 w-7 shrink-0">
                        <AvatarFallback className="text-[10px]">
                          {getInitials(u.displayName || u.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{u.displayName || 'User'}</p>
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Command Mode — Entity Type Picker */}
        {mode === 'command' && (
          <>
            <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-1.5 border-b shrink-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
                Link a record
              </p>
            </div>
            <div className="grid grid-cols-3 gap-1.5 p-2.5">
              {ENTITY_TYPES.map(({ type, label, icon: Icon, chipClass }) => (
                <button
                  key={type}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); handleSelectEntityType(type) }}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs font-semibold transition-all hover:scale-[1.03] active:scale-[0.97] ${chipClass}`}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Entity Search Mode */}
        {mode === 'entity-search' && entityType && (
          <>
            <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0">
              {(() => {
                const meta = ENTITY_TYPE_META[entityType]
                const Icon = meta.icon
                return (
                  <div className={`shrink-0 flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-bold border ${meta.chipClass}`}>
                    <Icon className="h-3 w-3" />
                    {meta.label}
                  </div>
                )
              })()}
              <Input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search ${ENTITY_TYPE_META[entityType]?.label ?? ''}…`}
                className="flex-1 h-7 text-xs"
                onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }}
              />
            </div>
            <div className="overflow-y-auto">
              {searching ? (
                <div className="flex items-center justify-center py-5">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : results.length === 0 ? (
                <p className="px-3 py-3 text-xs text-muted-foreground">
                  {searchQuery ? 'No matching records found' : 'Type to search…'}
                </p>
              ) : (
                <div className="py-1">
                  {results.map((doc) => {
                    const meta = ENTITY_TYPE_META[entityType]
                    const label = meta.getLabel(doc)
                    const secondary = meta.getSecondary?.(doc) || ''
                    return (
                      <button
                        key={doc.id}
                        type="button"
                        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted/50 transition-colors text-left"
                        onMouseDown={(e) => { e.preventDefault(); handleSelectEntity(doc) }}
                      >
                        <div className={`shrink-0 h-7 w-7 rounded flex items-center justify-center border ${meta.chipClass}`}>
                          <meta.icon className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{label}</p>
                          {secondary && <p className="text-xs text-muted-foreground truncate">{secondary}</p>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
