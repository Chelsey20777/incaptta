'use client'

import React from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ExternalLink, FileText } from 'lucide-react'

interface FileViewerModalProps {
  isOpen: boolean
  onClose: () => void
  url: string
  title?: string
}

export function FileViewerModal({ isOpen, onClose, url, title = 'Document Viewer' }: FileViewerModalProps) {
  const detectPdf = (fileUrl: string) => {
    if (!fileUrl) return false
    try {
      const decoded = decodeURIComponent(fileUrl).toLowerCase()
      const cleanUrl = decoded.split('?')[0]
      return cleanUrl.endsWith('.pdf') || cleanUrl.includes('.pdf')
    } catch {
      return false
    }
  }

  const detectOfficeDoc = (fileUrl: string) => {
    if (!fileUrl) return false
    try {
      const decoded = decodeURIComponent(fileUrl).toLowerCase()
      const cleanUrl = decoded.split('?')[0]
      return (
        cleanUrl.endsWith('.doc') || cleanUrl.includes('.doc') ||
        cleanUrl.endsWith('.docx') || cleanUrl.includes('.docx') ||
        cleanUrl.endsWith('.xls') || cleanUrl.includes('.xls') ||
        cleanUrl.endsWith('.xlsx') || cleanUrl.includes('.xlsx') ||
        cleanUrl.endsWith('.ppt') || cleanUrl.includes('.ppt') ||
        cleanUrl.endsWith('.pptx') || cleanUrl.includes('.pptx')
      )
    } catch {
      return false
    }
  }

  const detectImage = (fileUrl: string) => {
    if (!fileUrl) return false
    try {
      const decoded = decodeURIComponent(fileUrl).toLowerCase()
      const cleanUrl = decoded.split('?')[0]
      return (
        cleanUrl.endsWith('.png') || cleanUrl.includes('.png') ||
        cleanUrl.endsWith('.jpg') || cleanUrl.includes('.jpg') ||
        cleanUrl.endsWith('.jpeg') || cleanUrl.includes('.jpeg') ||
        cleanUrl.endsWith('.gif') || cleanUrl.includes('.gif') ||
        cleanUrl.endsWith('.webp') || cleanUrl.includes('.webp') ||
        cleanUrl.endsWith('.svg') || cleanUrl.includes('.svg') ||
        cleanUrl.endsWith('.bmp') || cleanUrl.includes('.bmp')
      )
    } catch {
      return false
    }
  }

  const isPdf = detectPdf(url)
  const isOfficeDoc = detectOfficeDoc(url)
  const isImage = detectImage(url)

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-4">
        <DialogHeader className="border-b pb-2 flex flex-row items-center justify-between gap-4">
          <DialogTitle className="text-lg font-semibold truncate flex-1">{title}</DialogTitle>
          <div className="flex items-center gap-2 mr-6">
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open(url, '_blank')}
              className="h-8 gap-1 text-xs"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open in New Tab
            </Button>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-auto flex items-center justify-center bg-muted/10 rounded-md p-2 mt-2 min-h-0 relative">
          {url ? (
            isPdf ? (
              <object
                data={url}
                type="application/pdf"
                className="w-full h-full rounded-md border bg-background"
              >
                <iframe
                  src={`${url}#toolbar=1`}
                  className="w-full h-full rounded-md border bg-background"
                  title={title}
                />
              </object>
            ) : isOfficeDoc ? (
              <iframe
                src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`}
                className="w-full h-full rounded-md border bg-background"
                title={title}
                frameBorder="0"
              />
            ) : isImage ? (
              <img
                src={url}
                alt={title}
                className="max-w-full max-h-full object-contain rounded-md shadow-sm bg-background"
              />
            ) : (
              <div className="flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
                <FileText className="h-12 w-12 text-muted-foreground/50 mb-3" />
                <p className="font-medium text-foreground mb-1 truncate max-w-md">{title}</p>
                <p className="text-xs text-muted-foreground mb-4">This file type cannot be previewed directly in the browser.</p>
                <Button onClick={() => window.open(url, '_blank')} variant="outline" size="sm">
                  Download / Open File
                </Button>
              </div>
            )
          ) : (
            <span className="text-muted-foreground text-sm">No document to display</span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
