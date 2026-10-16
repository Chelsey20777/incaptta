'use client'

import React from 'react'
import { FileText, Eye, Download, FileSpreadsheet, FileArchive, FileCode } from 'lucide-react'

interface Attachment {
  url: string
  name: string
  type: string
  size: number
}

interface AttachmentMessageCardProps {
  attachment: Attachment
  onPreview?: (url: string, name: string) => void
}

export default function AttachmentMessageCard({ attachment, onPreview }: AttachmentMessageCardProps) {
  const isImage = attachment.type?.startsWith('image/')
  const isPdf = attachment.type === 'application/pdf'
  const isWord = attachment.type?.includes('word') || attachment.type?.includes('msword')
  const isExcel = attachment.type?.includes('excel') || attachment.type?.includes('spreadsheet') || attachment.type?.includes('csv')
  const isZip = attachment.type?.includes('zip') || attachment.type?.includes('compressed') || attachment.type?.includes('tar')
  const isCode = attachment.type?.includes('javascript') || attachment.type?.includes('json') || attachment.type?.includes('html') || attachment.type?.includes('css')

  const getFileMeta = () => {
    if (isPdf) {
      return {
        label: 'PDF Document',
        bg: 'bg-rose-500/10 border-rose-500/20 text-rose-400',
        icon: FileText
      }
    }
    if (isWord) {
      return {
        label: 'Word Document',
        bg: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
        icon: FileText
      }
    }
    if (isExcel) {
      return {
        label: 'Spreadsheet',
        bg: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
        icon: FileSpreadsheet
      }
    }
    if (isZip) {
      return {
        label: 'Archive',
        bg: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
        icon: FileArchive
      }
    }
    if (isCode) {
      return {
        label: 'Code File',
        bg: 'bg-violet-500/10 border-violet-500/20 text-violet-400',
        icon: FileCode
      }
    }
    return {
      label: 'Document',
      bg: 'bg-slate-500/10 border-slate-500/20 text-slate-400',
      icon: FileText
    }
  }

  const fileMeta = getFileMeta()
  const FileIcon = fileMeta.icon

  const sizeText = (attachment.size / 1024).toFixed(1) + ' KB'

  const handlePreviewClick = (e: React.MouseEvent) => {
    if (onPreview) {
      e.preventDefault()
      onPreview(attachment.url, attachment.name)
    }
  }

  if (isImage) {
    return (
      <div className="group relative rounded-xl overflow-hidden border border-white/[0.06] shadow bg-slate-950/20 hover:opacity-95 transition-all max-w-[240px] mt-2 mb-1">
        <img 
          src={attachment.url} 
          alt={attachment.name} 
          className="w-full max-h-40 object-cover rounded-xl transition-all group-hover:scale-[1.01] duration-300 cursor-pointer" 
          onClick={handlePreviewClick}
        />
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
          <a 
            href={attachment.url} 
            target="_blank" 
            rel="noopener noreferrer"
            onClick={handlePreviewClick}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-full transition-colors shadow"
            title="View Full Image"
          >
            <Eye className="h-4 w-4" />
          </a>
          <a 
            href={attachment.url} 
            className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-full transition-colors shadow"
            title="Download Image"
            download={attachment.name}
          >
            <Download className="h-4 w-4" />
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-3 p-3 bg-slate-950/40 border border-slate-850 hover:border-slate-800 rounded-xl text-xs w-72 transition-all shadow-md mt-2 mb-1">
      <div 
        className="flex items-center gap-2.5 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
        onClick={handlePreviewClick}
      >
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 border ${fileMeta.bg}`}>
          <FileIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-slate-200 truncate max-w-[150px]" title={attachment.name}>
            {attachment.name}
          </p>
          <p className="text-[9px] text-slate-500 font-medium leading-none mt-1">{fileMeta.label} • {sizeText}</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 pl-2.5 border-l border-slate-850">
        {onPreview && (
          <button 
            type="button"
            onClick={handlePreviewClick}
            className="p-1.5 bg-slate-900 hover:bg-slate-855 text-slate-400 hover:text-white rounded-lg transition-colors border border-slate-800 mr-1"
            title="View File"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
        )}
        <a 
          href={attachment.url} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="p-1.5 bg-slate-900 hover:bg-slate-855 text-slate-400 hover:text-white rounded-lg transition-colors border border-slate-800"
          title="Download File"
          download={attachment.name}
        >
          <Download className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  )
}
