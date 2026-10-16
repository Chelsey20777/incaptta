'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useChatStore, type VaultFile } from '@/stores/chat-store'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { 
  Search, Eye, Download, MessageSquare, Loader2, FolderOpen, 
  FileText, FileImage, FileSpreadsheet, FileArchive, FileCode, FileUp, ArrowLeft
} from 'lucide-react'

interface FileVaultDashboardProps {
  users: any[]
  onViewInChat: (chatId: string) => void
  onPreviewFile: (url: string, name: string) => void
}

type FileCategory = 'all' | 'images' | 'pdfs' | 'spreadsheets' | 'documents' | 'archives' | 'code' | 'others'

export default function FileVaultDashboard({ users, onViewInChat, onPreviewFile }: FileVaultDashboardProps) {
  const { user } = useAuthStore()
  const { vaultFiles, loadingVault, fetchVaultFiles } = useChatStore()
  
  const [searchQuery, setSearchQuery] = useState('')
  const [category, setCategory] = useState<FileCategory>('all')
  const [viewType, setViewType] = useState<'grid' | 'list'>('grid')

  const uid = user?.uid || ''

  useEffect(() => {
    if (uid) {
      fetchVaultFiles(uid, users)
    }
  }, [uid, users, fetchVaultFiles])

  const getFileCategory = (type: string): FileCategory => {
    const lowerType = type?.toLowerCase() || ''
    if (lowerType.startsWith('image/')) return 'images'
    if (lowerType === 'application/pdf') return 'pdfs'
    if (lowerType.includes('excel') || lowerType.includes('spreadsheet') || lowerType.includes('csv') || lowerType.includes('sheet')) return 'spreadsheets'
    if (lowerType.includes('word') || lowerType.includes('msword') || lowerType.includes('document') || lowerType.includes('text/plain')) return 'documents'
    if (lowerType.includes('zip') || lowerType.includes('compressed') || lowerType.includes('tar') || lowerType.includes('rar')) return 'archives'
    if (lowerType.includes('javascript') || lowerType.includes('json') || lowerType.includes('html') || lowerType.includes('css') || lowerType.includes('typescript')) return 'code'
    return 'others'
  }

  const getFileMeta = (type: string) => {
    const cat = getFileCategory(type)
    switch (cat) {
      case 'images':
        return { icon: FileImage, bg: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20' }
      case 'pdfs':
        return { icon: FileText, bg: 'bg-rose-500/10 text-rose-500 border-rose-500/20' }
      case 'spreadsheets':
        return { icon: FileSpreadsheet, bg: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' }
      case 'documents':
        return { icon: FileText, bg: 'bg-blue-500/10 text-blue-500 border-blue-500/20' }
      case 'archives':
        return { icon: FileArchive, bg: 'bg-amber-500/10 text-amber-500 border-amber-500/20' }
      case 'code':
        return { icon: FileCode, bg: 'bg-violet-500/10 text-violet-500 border-violet-500/20' }
      default:
        return { icon: FileUp, bg: 'bg-muted text-muted-foreground border-border' }
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  const filteredFiles = useMemo(() => {
    return vaultFiles.filter(file => {
      const matchesSearch = file.name.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesCategory = category === 'all' || getFileCategory(file.type) === category
      return matchesSearch && matchesCategory
    })
  }, [vaultFiles, searchQuery, category])

  const categories: { label: string; value: FileCategory }[] = [
    { label: 'All Files', value: 'all' },
    { label: 'Images', value: 'images' },
    { label: 'PDFs', value: 'pdfs' },
    { label: 'Spreadsheets', value: 'spreadsheets' },
    { label: 'Documents', value: 'documents' },
    { label: 'Archives', value: 'archives' },
    { label: 'Code', value: 'code' },
    { label: 'Others', value: 'others' },
  ]

  return (
    <div className="flex flex-col h-full bg-background rounded-none md:rounded-xl border shadow-sm overflow-hidden">
      {/* Header */}
      <div className="border-b px-6 py-4 flex flex-col gap-4 bg-muted/20 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Button 
              size="icon" 
              variant="ghost" 
              className="md:hidden shrink-0 h-9 w-9 text-muted-foreground -ml-2 mr-1"
              onClick={() => onViewInChat('')}
              title="Back to conversations"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <FolderOpen className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">File Vault</h2>
              <p className="text-xs text-muted-foreground">Browse all attachments shared in your conversations</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 border rounded-lg p-0.5 bg-background">
            <Button 
              size="sm" 
              variant={viewType === 'grid' ? 'secondary' : 'ghost'} 
              className="h-7 px-2.5 text-xs font-semibold rounded-md"
              onClick={() => setViewType('grid')}
            >
              Grid
            </Button>
            <Button 
              size="sm" 
              variant={viewType === 'list' ? 'secondary' : 'ghost'} 
              className="h-7 px-2.5 text-xs font-semibold rounded-md"
              onClick={() => setViewType('list')}
            >
              List
            </Button>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search files by name..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
          <Button 
            size="sm" 
            variant="outline" 
            className="h-9 text-xs font-semibold shrink-0"
            onClick={() => fetchVaultFiles(uid, users)}
            disabled={loadingVault}
          >
            {loadingVault ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                Refreshing...
              </>
            ) : 'Refresh'}
          </Button>
        </div>

        {/* Category Pill Badges */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-2 px-2 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setCategory(cat.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-all shrink-0 select-none ${
                category === cat.value
                  ? 'bg-primary border-primary text-primary-foreground shadow-sm'
                  : 'bg-background hover:bg-muted border-border text-muted-foreground'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Files Area */}
      <div className="flex-1 min-h-0 bg-muted/5 relative">
        {loadingVault && vaultFiles.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-xs text-muted-foreground font-semibold">Loading file vault...</p>
            </div>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
            <FolderOpen className="h-10 w-10 text-muted-foreground/30 mb-2" />
            <p className="font-bold text-foreground text-sm">No files found</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-[280px]">
              {searchQuery || category !== 'all' 
                ? 'Try adjusting your search query or filters to find what you need.' 
                : 'Attachments sent in any of your chats will automatically sync here.'}
            </p>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="p-4 md:p-6 pb-20">
              {viewType === 'grid' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredFiles.map(file => {
                    const meta = getFileMeta(file.type)
                    const FileIcon = meta.icon
                    const isImg = getFileCategory(file.type) === 'images'
                    const dateText = file.createdAt?.toDate?.()?.toLocaleDateString?.([], { month: 'short', day: 'numeric', year: 'numeric' }) || 'Recent'

                    return (
                      <div 
                        key={file.id} 
                        className="group flex flex-col bg-background border border-border/80 hover:border-muted-foreground/20 hover:shadow-md rounded-xl overflow-hidden transition-all duration-200"
                      >
                        {/* Preview panel / Thumbnail */}
                        <div className="aspect-[16/10] bg-muted/40 border-b border-border/50 relative overflow-hidden flex items-center justify-center select-none shrink-0">
                          {isImg ? (
                            <img 
                              src={file.url} 
                              alt={file.name} 
                              className="w-full h-full object-cover group-hover:scale-105 transition-all duration-300"
                              loading="lazy"
                            />
                          ) : (
                            <div className={`h-12 w-12 rounded-xl flex items-center justify-center border ${meta.bg}`}>
                              <FileIcon className="h-6 w-6" />
                            </div>
                          )}
                          
                          {/* Hover action overlay */}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-all duration-200">
                            <Button 
                              size="sm" 
                              variant="secondary" 
                              className="h-8 text-xs font-semibold rounded-lg"
                              onClick={() => onPreviewFile(file.url, file.name)}
                            >
                              <Eye className="h-3.5 w-3.5 mr-1.5" /> Preview
                            </Button>
                            <a 
                              href={file.url} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              download={file.name}
                              className="h-8 px-3 inline-flex items-center justify-center bg-white hover:bg-slate-100 text-slate-900 text-xs font-semibold rounded-lg shadow transition-colors"
                            >
                              <Download className="h-3.5 w-3.5 mr-1.5" /> Download
                            </a>
                          </div>
                        </div>

                        {/* Text Detail Info */}
                        <div className="p-3.5 flex-1 flex flex-col justify-between gap-3 text-xs">
                          <div className="min-w-0">
                            <p 
                              className="font-bold text-foreground leading-tight truncate group-hover:text-primary transition-colors cursor-pointer"
                              onClick={() => onPreviewFile(file.url, file.name)}
                              title={file.name}
                            >
                              {file.name}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-1.5 font-medium leading-none">
                              {formatFileSize(file.size)} • By {file.senderName}
                            </p>
                          </div>

                          <div className="pt-3 border-t border-border/60 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                            <div className="flex items-center gap-1.5 min-w-0 max-w-[60%]">
                              <MessageSquare className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                              <span className="truncate font-semibold text-foreground/80">{file.chatTitle}</span>
                            </div>
                            <span className="shrink-0">{dateText}</span>
                          </div>

                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="w-full h-8 mt-1 border border-border bg-muted/10 hover:bg-muted font-bold text-foreground text-xs rounded-lg flex items-center justify-center gap-1.5"
                            onClick={() => onViewInChat(file.chatId)}
                          >
                            <MessageSquare className="h-3.5 w-3.5" /> View in Conversation
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="border border-border/80 rounded-xl bg-background overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b bg-muted/40 font-semibold text-muted-foreground select-none">
                          <th className="p-3 pl-4">Name</th>
                          <th className="p-3">Sender</th>
                          <th className="p-3">Location</th>
                          <th className="p-3">Size</th>
                          <th className="p-3">Date</th>
                          <th className="p-3 pr-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredFiles.map(file => {
                          const meta = getFileMeta(file.type)
                          const FileIcon = meta.icon
                          const dateText = file.createdAt?.toDate?.()?.toLocaleDateString?.([], { month: 'short', day: 'numeric', year: 'numeric' }) || 'Recent'

                          return (
                            <tr key={file.id} className="border-b last:border-0 hover:bg-muted/10 transition-colors">
                              <td className="p-3 pl-4 max-w-xs md:max-w-md">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center border shrink-0 ${meta.bg}`}>
                                    <FileIcon className="h-4.5 w-4.5" />
                                  </div>
                                  <span 
                                    className="font-bold text-foreground truncate cursor-pointer hover:text-primary transition-colors flex-1"
                                    onClick={() => onPreviewFile(file.url, file.name)}
                                    title={file.name}
                                  >
                                    {file.name}
                                  </span>
                                </div>
                              </td>
                              <td className="p-3 text-muted-foreground font-medium">{file.senderName}</td>
                              <td className="p-3 font-semibold text-foreground/80">
                                <div className="flex items-center gap-1.5 max-w-[150px]">
                                  <MessageSquare className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                                  <span className="truncate">{file.chatTitle}</span>
                                </div>
                              </td>
                              <td className="p-3 text-muted-foreground">{formatFileSize(file.size)}</td>
                              <td className="p-3 text-muted-foreground">{dateText}</td>
                              <td className="p-3 pr-4 text-right">
                                <div className="inline-flex items-center gap-1">
                                  <Button 
                                    size="icon" 
                                    variant="ghost" 
                                    className="h-7 w-7 text-muted-foreground hover:text-foreground border border-border bg-background"
                                    onClick={() => onPreviewFile(file.url, file.name)}
                                    title="Preview"
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                  </Button>
                                  <a 
                                    href={file.url} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    download={file.name}
                                    className="h-7 w-7 inline-flex items-center justify-center text-muted-foreground hover:text-foreground border border-border bg-background rounded-md transition-colors"
                                    title="Download"
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                  </a>
                                  <Button 
                                    size="icon" 
                                    variant="ghost" 
                                    className="h-7 w-7 text-muted-foreground hover:text-foreground border border-border bg-background"
                                    onClick={() => onViewInChat(file.chatId)}
                                    title="View in Chat"
                                  >
                                    <MessageSquare className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  )
}
