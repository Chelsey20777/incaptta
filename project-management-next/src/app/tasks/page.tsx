'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { db } from '@/lib/firebase'
import { collection, doc, addDoc, updateDoc, deleteDoc, query, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Search, Loader2, LayoutGrid, List, GripVertical, CheckCircle2, Clock, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

interface Task {
  id: string
  title: string
  description: string
  status: 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE'
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  assignee: string
  dueDate: string
  createdBy: string
  createdAt: any
  updatedAt: any
}

const COLUMNS = [
  { key: 'TODO', label: 'To Do', color: 'border-slate-500/20 bg-slate-500/5 text-slate-200' },
  { key: 'IN_PROGRESS', label: 'In Progress', color: 'border-blue-500/20 bg-blue-500/5 text-blue-200' },
  { key: 'REVIEW', label: 'Review', color: 'border-purple-500/20 bg-purple-500/5 text-purple-200' },
  { key: 'DONE', label: 'Done', color: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-200' },
]

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board')
  const [searchQuery, setSearchQuery] = useState('')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({ title: '', description: '', status: 'TODO', priority: 'MEDIUM', assignee: '', dueDate: '' })

  useEffect(() => {
    const q = query(collection(db, 'tasks'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, (snap) => {
      setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() } as Task)))
      setLoading(false)
    })
    return () => unsub()
  }, [])

  const filteredTasks = useMemo(() => {
    if (!searchQuery) return tasks
    const q = searchQuery.toLowerCase()
    return tasks.filter(t => t.title.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q) || t.assignee?.toLowerCase().includes(q))
  }, [tasks, searchQuery])

  const getTasksByStatus = (status: string) => filteredTasks.filter(t => t.status === status)

  const stats = {
    total: tasks.length,
    todo: tasks.filter(t => t.status === 'TODO').length,
    inProgress: tasks.filter(t => t.status === 'IN_PROGRESS').length,
    review: tasks.filter(t => t.status === 'REVIEW').length,
    done: tasks.filter(t => t.status === 'DONE').length,
    overdue: tasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'DONE').length,
  }

  const priorityBadge = (priority: string) => {
    const v: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = { CRITICAL: 'destructive', HIGH: 'default', MEDIUM: 'secondary', LOW: 'outline' }
    return <Badge variant={v[priority] || 'secondary'}>{priority}</Badge>
  }

  const openCreate = () => {
    setEditingTask(null)
    setFormData({ title: '', description: '', status: 'TODO', priority: 'MEDIUM', assignee: '', dueDate: '' })
    setIsDialogOpen(true)
  }

  const openEdit = (task: Task) => {
    setEditingTask(task)
    setFormData({ title: task.title, description: task.description || '', status: task.status, priority: task.priority, assignee: task.assignee || '', dueDate: task.dueDate || '' })
    setIsDialogOpen(true)
  }

  const handleSave = async () => {
    if (!formData.title) { toast.error('Title is required'); return }
    setSaving(true)
    try {
      if (editingTask) {
        await updateDoc(doc(db, 'tasks', editingTask.id), { ...formData, updatedAt: serverTimestamp() })
        toast.success('Task updated')
      } else {
        await addDoc(collection(db, 'tasks'), { ...formData, createdBy: 'User', createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
        toast.success('Task created')
      }
      setIsDialogOpen(false)
    } catch (err: any) { toast.error(err.message) } finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this task?')) return
    try {
      await deleteDoc(doc(db, 'tasks', id))
      toast.success('Task deleted')
    } catch (err: any) { toast.error(err.message) }
  }

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await updateDoc(doc(db, 'tasks', id), { status, updatedAt: serverTimestamp() })
    } catch (err: any) { toast.error(err.message) }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Tasks</h2>
          <p className="text-muted-foreground">Manage and track project tasks</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => setViewMode('board')}><LayoutGrid className={`h-4 w-4 ${viewMode === 'board' ? 'text-primary' : ''}`} /></Button>
          <Button variant="outline" size="icon" onClick={() => setViewMode('list')}><List className={`h-4 w-4 ${viewMode === 'list' ? 'text-primary' : ''}`} /></Button>
          <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />New Task</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-6">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Total</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats.total}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">To Do</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-slate-500">{stats.todo}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">In Progress</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-blue-500">{stats.inProgress}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Review</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-purple-500">{stats.review}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Done</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-emerald-500">{stats.done}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Overdue</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-red-500">{stats.overdue}</div></CardContent></Card>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search tasks..." className="pl-8" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
      </div>

      {viewMode === 'board' ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map(col => {
            const colTasks = getTasksByStatus(col.key)
            return (
              <div key={col.key} className={`flex-shrink-0 w-72 rounded-xl border-2 ${col.color} p-3 backdrop-blur-md shadow-sm`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm">{col.label}</h3>
                  <Badge variant="secondary">{colTasks.length}</Badge>
                </div>
                <div className="space-y-2 min-h-[200px]"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    const taskId = e.dataTransfer.getData('taskId')
                    if (taskId) handleStatusChange(taskId, col.key)
                  }}
                >
                  {colTasks.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">No tasks</p>
                  ) : (
                    colTasks.map(task => (
                      <Card key={task.id} className="cursor-pointer hover:shadow-md"
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData('taskId', task.id)}
                        onClick={() => openEdit(task)}
                      >
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-start justify-between">
                            <p className="font-medium text-sm">{task.title}</p>
                            <Button variant="ghost" size="icon" className="h-5 w-5 -mt-1 -mr-1" onClick={(e) => { e.stopPropagation(); handleDelete(task.id) }}>
                              <span className="text-xs">✕</span>
                            </Button>
                          </div>
                          <div className="flex items-center gap-2">
                            {priorityBadge(task.priority)}
                            {task.dueDate && <span className="text-[10px] text-muted-foreground">{new Date(task.dueDate).toLocaleDateString()}</span>}
                          </div>
                          {task.assignee && <p className="text-xs text-muted-foreground">{task.assignee}</p>}
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full">
              <thead><tr className="border-b">
                <th className="text-left p-3 font-medium text-sm">Title</th>
                <th className="text-center p-3 font-medium text-sm">Status</th>
                <th className="text-center p-3 font-medium text-sm">Priority</th>
                <th className="text-left p-3 font-medium text-sm">Assignee</th>
                <th className="text-center p-3 font-medium text-sm">Due Date</th>
                <th className="text-right p-3 font-medium text-sm">Actions</th>
              </tr></thead>
              <tbody>
                {filteredTasks.length === 0 ? (
                  <tr><td colSpan={6} className="text-center p-8 text-muted-foreground">No tasks found</td></tr>
                ) : (
                  filteredTasks.map(task => (
                    <tr key={task.id} className="border-b hover:bg-muted/50 cursor-pointer" onClick={() => openEdit(task)}>
                      <td className="p-3 text-sm font-medium">{task.title}</td>
                      <td className="p-3 text-center"><Badge variant={task.status === 'DONE' ? 'outline' : task.status === 'IN_PROGRESS' ? 'default' : 'secondary'}>{task.status}</Badge></td>
                      <td className="p-3 text-center">{priorityBadge(task.priority)}</td>
                      <td className="p-3 text-sm">{task.assignee || '-'}</td>
                      <td className="p-3 text-center text-sm">{task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '-'}</td>
                      <td className="p-3 text-right">
                        <Select value={task.status} onValueChange={(v) => v && handleStatusChange(task.id, v)}>
                          <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="TODO">To Do</SelectItem>
                            <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                            <SelectItem value="REVIEW">Review</SelectItem>
                            <SelectItem value="DONE">Done</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingTask ? 'Edit Task' : 'Create Task'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Title *</Label><Input value={formData.title} onChange={(e) => setFormData(p => ({ ...p, title: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Description</Label><Textarea value={formData.description} onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Status</Label>
                <Select value={formData.status} onValueChange={(v) => v && setFormData(p => ({ ...p, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TODO">To Do</SelectItem>
                    <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                    <SelectItem value="REVIEW">Review</SelectItem>
                    <SelectItem value="DONE">Done</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Priority</Label>
                <Select value={formData.priority} onValueChange={(v) => v && setFormData(p => ({ ...p, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="CRITICAL">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Assignee</Label><Input value={formData.assignee} onChange={(e) => setFormData(p => ({ ...p, assignee: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Due Date</Label><Input type="date" value={formData.dueDate} onChange={(e) => setFormData(p => ({ ...p, dueDate: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editingTask ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}