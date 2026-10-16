'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { db } from '@/lib/firebase'
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp
} from 'firebase/firestore'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Plus,
  Loader2,
  Kanban,
  SquareDashed,
  Clock,
  CheckCircle2,
  X,
  ChevronRight,
  GripVertical
} from 'lucide-react'
import { toast } from 'sonner'

interface Project {
  id: string
  name?: string
  description?: string
  status?: string
  priority?: string
  createdAt?: any
  [key: string]: any
}

const COLUMNS = [
  { id: 'PLANNING', label: 'Planning', color: 'bg-blue-500', icon: SquareDashed },
  { id: 'IN_PROGRESS', label: 'In Progress', color: 'bg-yellow-500', icon: Clock },
  { id: 'REVIEW', label: 'Review', color: 'bg-purple-500', icon: ChevronRight },
  { id: 'COMPLETED', label: 'Completed', color: 'bg-green-500', icon: CheckCircle2 },
]

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showNewModal, setShowNewModal] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({ name: '', description: '', status: 'PLANNING', priority: 'MEDIUM' })

  useEffect(() => {
    setLoading(true)
    const unsub = onSnapshot(
      query(collection(db, 'projects'), orderBy('createdAt', 'desc')),
      (snap) => {
        setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Project))
        setLoading(false)
      },
      () => setLoading(false)
    )
    return () => unsub()
  }, [])

  const filteredProjects = useMemo(() =>
    projects.filter(p => !searchQuery || p.name?.toLowerCase().includes(searchQuery.toLowerCase())),
    [projects, searchQuery]
  )

  const columns = useMemo(() => {
    const cols = COLUMNS.map(col => ({
      ...col,
      items: filteredProjects.filter(p => p.status === col.id)
    }))
    return cols
  }, [filteredProjects])

  const stats = useMemo(() => ({
    total: projects.length,
    active: projects.filter(p => p.status === 'IN_PROGRESS').length,
    completed: projects.filter(p => p.status === 'COMPLETED').length,
  }), [projects])

  const moveProject = async (projectId: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, 'projects', projectId), { status: newStatus, updatedAt: serverTimestamp() })
      toast.success(`Moved to ${newStatus.replace('_', ' ')}`)
    } catch { toast.error('Failed to move project') }
  }

  const handleCreate = async () => {
    if (!formData.name.trim()) { toast.error('Project name is required'); return }
    setIsSubmitting(true)
    try {
      await addDoc(collection(db, 'projects'), {
        ...formData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
      toast.success('Project created')
      setShowNewModal(false)
      setFormData({ name: '', description: '', status: 'PLANNING', priority: 'MEDIUM' })
    } catch { toast.error('Failed to create project') }
    finally { setIsSubmitting(false) }
  }

  return (
    <div className="flex-1 flex flex-col pb-20 bg-background min-h-screen">
      <header className="sticky top-0 z-10 bg-card border-b px-4 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black tracking-tight">Projects Board</h1>
              <Badge className="bg-[#ff8903] text-white text-[10px] font-black h-5 px-2">{stats.total}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">{stats.active} active · {stats.completed} completed</p>
          </div>
          <Button size="sm" className="bg-[#ff8903] hover:bg-[#ff8903]/90 text-white font-bold text-xs gap-1.5 h-9" onClick={() => setShowNewModal(true)}>
            <Plus className="size-4" /> New Project
          </Button>
        </div>
      </header>

      {/* Search */}
      <section className="p-4">
        <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search projects..." className="h-10 border bg-muted/20" />
      </section>

      {/* Kanban Board */}
      <main className="px-4 flex-1 overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="size-8 animate-spin text-primary" /></div>
        ) : filteredProjects.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Kanban className="size-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No projects yet. Create your first one!</p>
          </div>
        ) : (
          <div className="flex gap-4 min-h-[500px] pb-4" style={{ minWidth: '700px' }}>
            {columns.map(col => {
              const ColIcon = col.icon
              return (
                <div key={col.id} className="flex-1 bg-muted/20 rounded-2xl border border-border/40 p-3 min-w-[180px]">
                  <div className="flex items-center gap-2 mb-3 px-1">
                    <div className={`size-3 rounded-full ${col.color}`} />
                    <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">{col.label}</span>
                    <Badge variant="outline" className="text-[9px] font-bold ml-auto">{col.items.length}</Badge>
                  </div>
                  <div className="space-y-2">
                    {col.items.length === 0 && (
                      <div className="text-center py-8 text-[10px] text-muted-foreground italic border border-dashed rounded-xl">
                        Drop items here
                      </div>
                    )}
                    {col.items.map(project => (
                      <Card key={project.id} className="border shadow-sm cursor-pointer hover:shadow-md transition-shadow group"
                        onClick={() => {
                          const nextCol = COLUMNS[COLUMNS.findIndex(c => c.id === col.id) + 1]
                          if (nextCol) moveProject(project.id, nextCol.id)
                        }}
                      >
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-start justify-between">
                            <h3 className="font-bold text-xs text-foreground leading-tight">{project.name}</h3>
                            <div className="flex gap-1 shrink-0 ml-1">
                              {COLUMNS.filter(c => c.id !== col.id).map(c => (
                                <button key={c.id}
                                  className={`size-5 rounded-full ${c.color} opacity-0 group-hover:opacity-100 transition-opacity`}
                                  onClick={(e) => { e.stopPropagation(); moveProject(project.id, c.id) }}
                                  title={`Move to ${c.label}`}
                                />
                              ))}
                            </div>
                          </div>
                          {project.description && (
                            <p className="text-[9px] text-muted-foreground line-clamp-2">{project.description}</p>
                          )}
                          {project.priority && (
                            <Badge variant="outline" className={`text-[7px] h-3.5 px-1 font-bold uppercase ${
                              project.priority === 'HIGH' ? 'bg-red-500/10 text-red-500' :
                              project.priority === 'MEDIUM' ? 'bg-yellow-500/10 text-yellow-500' :
                              'bg-green-500/10 text-green-500'
                            }`}>
                              {project.priority}
                            </Badge>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* New Project Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-card border shadow-2xl rounded-3xl overflow-hidden">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-black tracking-tight">New Project</CardTitle>
              <CardDescription className="text-xs">Create a new project or task</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-black uppercase text-muted-foreground">Project Name *</Label>
                <Input value={formData.name} onChange={(e) => setFormData(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Site Construction" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-black uppercase text-muted-foreground">Description</Label>
                <textarea value={formData.description} onChange={(e) => setFormData(f => ({ ...f, description: e.target.value }))}
                  className="w-full h-20 px-3 py-2 rounded-xl border bg-background text-sm resize-none"
                  placeholder="Brief project description..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-black uppercase text-muted-foreground">Status</Label>
                  <select value={formData.status} onChange={(e) => setFormData(f => ({ ...f, status: e.target.value }))}
                    className="w-full h-10 px-3 rounded-xl border bg-background text-sm"
                  >
                    {COLUMNS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-black uppercase text-muted-foreground">Priority</Label>
                  <select value={formData.priority} onChange={(e) => setFormData(f => ({ ...f, priority: e.target.value }))}
                    className="w-full h-10 px-3 rounded-xl border bg-background text-sm"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1 rounded-xl h-10 font-bold" onClick={() => setShowNewModal(false)}>Cancel</Button>
                <Button className="flex-1 rounded-xl h-10 font-bold bg-[#ff8903] hover:bg-[#ff8903]/90 text-white" disabled={isSubmitting} onClick={handleCreate}>
                  {isSubmitting ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
                  Create
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}