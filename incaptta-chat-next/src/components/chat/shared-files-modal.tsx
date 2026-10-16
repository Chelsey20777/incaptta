'use client'

import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { FileText, FileSpreadsheet, FileArchive, FileCode, Eye, Download, Loader2 } from 'lucide-react'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'

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

  useEffect(() => {
    if (!isOpen || !chatId) return

    async function fetchFiles() {
      setLoading(true)
      try {
        const messagesRef = collection(db, `chats/${chatId}/messages`)
        const q = query(messagesRef, where('attachment', '!=', null))
        const snapshot = await getDocs(q)
        
        const fetchedFiles = snapshot.docs.map(doc => {
          const data = doc.data()
          return {
            id: doc.id,
            senderName: data.senderName || 'Unknown',
            createdAt: data.createdAt,
            ...data.attachment
          } as SharedFile
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
      return { label: 'Image', bg: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400', icon: FileText, isImage: true }
    }
    if (isPdf) {
      return { label: 'PDF Document', bg: 'bg-rose-500/10 border-rose-500/20 text-rose-400', icon: FileText }
    }
    if (isWord) {
      return { label: 'Word Document', bg: 'bg-blue-500/10 border-blue-500/20 text-blue-400', icon: FileText }
    }
    if (isExcel) {
      return { label: 'Spreadsheet', bg: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400', icon: FileSpreadsheet }
    }
    if (isZip) {
      return { label: 'Archive', bg: 'bg-amber-500/10 border-amber-500/20 text-amber-400', icon: FileArchive }
    }
    if (isCode) {
      return { label: 'Code File', bg: 'bg-violet-500/10 border-violet-500/20 text-violet-400', icon: FileCode }
    }
    return { label: 'File', bg: 'bg-slate-500/10 border-slate-500/20 text-slate-400', icon: FileText }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl h-[70vh] flex flex-col p-4 bg-slate-950 text-slate-100 border-slate-800 rounded-2xl">
        <DialogHeader className="border-b border-slate-800 pb-2 flex-row items-center justify-between gap-4">
          <DialogTitle className="text-base font-semibold truncate flex-1 leading-none mt-1">
            Files shared in {chatTitle}
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-grow overflow-y-auto mt-3 min-h-0">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
            </div>
          ) : files.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-400">
              <FileText className="h-10 w-10 text-slate-600 mb-2" />
              <p className="font-semibold text-slate-300 text-sm">No shared files yet</p>
              <p className="text-xs text-slate-500 mt-1">Attachments sent in this conversation will be listed here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-1">
              {files.map(file => {
                const meta = getFileMeta(file.type)
                const FileIcon = meta.icon
                const sizeText = (file.size / 1024).toFixed(1) + ' KB'
                const dateText = file.createdAt?.toDate?.()?.toLocaleDateString?.([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) || ''

                return (
                  <div key={file.id} className="flex items-center justify-between gap-3 p-2.5 bg-slate-900/40 border border-slate-850 hover:border-slate-800 rounded-xl text-xs transition-all shadow-sm">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="shrink-0">
                        {meta.isImage ? (
                          <img 
                            src={file.url} 
                            alt={file.name} 
                            className="h-9 w-9 rounded-lg object-cover border border-slate-800 bg-slate-950" 
                          />
                        ) : (
                          <div className={`h-9 w-9 rounded-lg flex items-center justify-center border ${meta.bg}`}>
                            <FileIcon className="h-4.5 w-4.5" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-200 truncate pr-1" title={file.name}>
                          {file.name}
                        </p>
                        <p className="text-[9px] text-slate-500 font-medium leading-none mt-1.5">
                          {sizeText} • By {file.senderName} • {dateText}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 pl-2 border-l border-slate-850">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => onPreviewFile(file.url, file.name)}
                        className="h-7 w-7 bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-white rounded-lg border border-slate-800"
                        title="Preview"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        download={file.name}
                        className="h-7 w-7 flex items-center justify-center bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-white rounded-lg border border-slate-800 transition-colors"
                        title="Download"
                      >
                        <Download className="h-3.5 w-3.5" />
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
