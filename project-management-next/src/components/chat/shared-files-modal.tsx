'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { FileText, FileSpreadsheet, FileArchive, FileCode, FileImage, Eye, Download, Loader2, Search, Files } from 'lucide-react'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { getMessageAttachments, type Message } from '@/stores/chat-store'
import { cn } from '@/lib/utils'

interface SharedFile {
  id: string
  senderName: string
  createdAt: any
  url: string
  name: string
  type: string
  size: number
}

interface SharedFilesModalProps {
  isOpen: boolean
  onClose: () => void
  chatId: string | null
  chatTitle: string
  onPreviewFile: (url: string, name: string) => void
}

export function SharedFilesModal({ isOpen, onClose, chatId, chatTitle, onPreviewFile }: SharedFilesModalProps) {
  const [files, setFiles] = useState<SharedFile[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!isOpen) setSearch('')
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !chatId) return

    async function fetchFiles() {
      setLoading(true)
      try {
        const messagesRef = collection(db, `chats/${chatId}/messages`)
        // Singular `attachment` is always set (first file) for multi-file messages too.
        const q = query(messagesRef, where('attachment', '!=', null))
        const snapshot = await getDocs(q)

        const fetchedFiles = snapshot.docs.flatMap(docSnap => {
          const data = docSnap.data()
          return getMessageAttachments(data as Message).map((file, idx) => ({
            id: `${docSnap.id}-${idx}`,
            senderName: data.senderName || 'Unknown',
            createdAt: data.createdAt,
            url: file.url,
            name: file.name,
            type: file.type,
            size: file.size,
          } as SharedFile))
        })

        // Sort by timestamp descending (newest first)
        fetchedFiles.sort((a, b) => {
          const timeA = a.createdAt?.seconds || a.createdAt?.toMillis?.() || 0
          const timeB = b.createdAt?.seconds || b.createdAt?.toMillis?.() || 0
          return timeB - timeA
        })

        setFiles(fetchedFiles)
      } catch (e) {
        console.error("Failed to fetch shared files:", e)
      } finally {
        setLoading(false)
      }
    }

    fetchFiles()
  }, [isOpen, chatId])

  const getFileMeta = (type: string) => {
    const lowerType = type?.toLowerCase() || ''
    const isImage = lowerType.startsWith('image/')
    const isPdf = lowerType === 'application/pdf'
    const isWord = lowerType.includes('word') || lowerType.includes('msword')
    const isExcel = lowerType.includes('excel') || lowerType.includes('spreadsheet') || lowerType.includes('csv')
    const isZip = lowerType.includes('zip') || lowerType.includes('compressed') || lowerType.includes('tar')
    const isCode = lowerType.includes('javascript') || lowerType.includes('json') || lowerType.includes('html') || lowerType.includes('css')

    if (isImage) {
      return { label: 'Image', bg: 'bg-primary/10 border-primary/20 text-primary', icon: FileImage, isImage: true }
    }
    if (isPdf) {
      return { label: 'PDF', bg: 'bg-destructive/10 border-destructive/20 text-destructive', icon: FileText }
    }
    if (isWord) {
      return { label: 'Word', bg: 'bg-blue-500/10 border-blue-500/20 text-blue-500', icon: FileText }
    }
    if (isExcel) {
      return { label: 'Sheet', bg: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600', icon: FileSpreadsheet }
    }
    if (isZip) {
      return { label: 'Archive', bg: 'bg-amber-500/10 border-amber-500/20 text-amber-600', icon: FileArchive }
    }
    if (isCode) {
      return { label: 'Code', bg: 'bg-violet-500/10 border-violet-500/20 text-violet-600', icon: FileCode }
    }
    return { label: 'File', bg: 'bg-muted border-border text-muted-foreground', icon: FileText }
  }

  const filteredFiles = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return files
    return files.filter(f =>
      f.name.toLowerCase().includes(q) || (f.senderName || '').toLowerCase().includes(q)
    )
  }, [files, search])

  const formatSize = (bytes: number) => {
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
    return (bytes / 1024).toFixed(1) + ' KB'
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[95vw] sm:max-w-4xl lg:max-w-5xl xl:max-w-6xl h-[80vh] flex flex-col gap-0 p-0 bg-background text-foreground border border-border rounded-xl overflow-hidden">
        <DialogHeader className="border-b px-5 py-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Files className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base font-semibold truncate leading-tight">
                Shared files
              </DialogTitle>
              <p className="text-xs text-muted-foreground truncate">
                {chatTitle}
                {!loading && files.length > 0 && (
                  <span> · {files.length} file{files.length !== 1 ? 's' : ''}</span>
                )}
              </p>
            </div>
          </div>
          {!loading && files.length > 0 && (
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by file name or sender…"
                className="pl-8 h-9 text-sm"
              />
            </div>
          )}
        </DialogHeader>

        <div className="flex-grow overflow-y-auto min-h-0 px-5 py-4">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-xs">Loading shared files…</p>
            </div>
          ) : files.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/60 mb-3">
                <FileText className="h-7 w-7 text-muted-foreground/50" />
              </div>
              <p className="font-semibold text-foreground text-sm">No shared files yet</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[240px]">Attachments sent in this conversation will be listed here.</p>
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
              <Search className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="font-medium text-foreground text-sm">No matches for “{search}”</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredFiles.map(file => {
                const meta = getFileMeta(file.type)
                const FileIcon = meta.icon
                const dateText = file.createdAt?.toDate?.()?.toLocaleDateString?.([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) || ''

                return (
                  <div
                    key={file.id}
                    className="group flex flex-col rounded-lg border border-border bg-card hover:border-primary/40 hover:shadow-md transition-all overflow-hidden"
                  >
                    <div className="flex items-start gap-3 p-3">
                      <div className="shrink-0">
                        {meta.isImage ? (
                          <img
                            src={file.url}
                            alt={file.name}
                            className="h-11 w-11 rounded-lg object-cover border border-border bg-background"
                          />
                        ) : (
                          <div className={cn('h-11 w-11 rounded-lg flex items-center justify-center border', meta.bg)}>
                            <FileIcon className="h-5 w-5" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide border', meta.bg)}>
                            {meta.label}
                          </span>
                          <span className="text-[10px] text-muted-foreground font-medium">{formatSize(file.size)}</span>
                        </div>
                        <p className="font-semibold text-sm text-foreground truncate mt-1" title={file.name}>
                          {file.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                          {file.senderName}{dateText ? ` · ${dateText}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center border-t border-border/70 divide-x divide-border/70">
                      <button
                        onClick={() => onPreviewFile(file.url, file.name)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                      >
                        <Eye className="h-3.5 w-3.5" /> Preview
                      </button>
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        download={file.name}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                      >
                        <Download className="h-3.5 w-3.5" /> Download
                      </a>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
