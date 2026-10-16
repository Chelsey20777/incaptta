import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { collection, onSnapshot } from 'firebase/firestore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { User, Plus, Trash2, Edit3, Search, Eye, Link2 } from 'lucide-react'
import { toast } from 'sonner'
import { db } from '@/lib/firebase'
import { emailsMatch, findUserIdByEmail } from '@/lib/user-employee-link'

const emptyForm = {
  fullName: '',
  email: '',
  phone: '',
  department: '',
  jobTitle: '',
  salary: 0,
  contractType: 'Full-Time',
  nationalId: '',
  startDate: new Date().toISOString().split('T')[0],
  linkedUserId: '' as string,
}

export function RosterTab({ store, fmt, getEmpName }: any) {
  const router = useRouter()
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [search, setSearch] = useState('')
  const [users, setUsers] = useState<any[]>([])

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    return () => unsub()
  }, [])

  const openEdit = (emp: any) => {
    setEditing(emp)
    setForm({
      fullName: emp.fullName || emp.name || '',
      email: emp.email || '',
      phone: emp.phone || '',
      department: emp.department || '',
      jobTitle: emp.jobTitle || emp.position || '',
      salary: emp.salary || 0,
      contractType: emp.contractType || 'Full-Time',
      nationalId: emp.nationalId || '',
      startDate: emp.startDate || new Date().toISOString().split('T')[0],
      linkedUserId: emp.userId || findUserIdByEmail(users, emp.email) || '',
    })
    setShowAdd(true)
  }

  const openAdd = () => {
    setEditing(null)
    setForm({ ...emptyForm })
    setShowAdd(true)
  }

  const suggestedUserId = useMemo(
    () => findUserIdByEmail(users, form.email) || '',
    [users, form.email]
  )

  const handleSave = async () => {
    if (!form.fullName) {
      toast.error('Name required')
      return
    }
    try {
      const { linkedUserId, ...rest } = form
      const payload = {
        ...rest,
        linkedUserId: linkedUserId || null,
      }
      if (editing) {
        await store.updateEmployee(editing.id, payload)
      } else {
        await store.addEmployee(payload)
      }
      setShowAdd(false)
      setEditing(null)
    } catch {
      // store toasts
    }
  }

  const filtered = store.employees.filter((emp: any) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    const name = (getEmpName(emp) || '').toLowerCase()
    return (
      name.includes(q) ||
      (emp.email || '').toLowerCase().includes(q) ||
      (emp.department || '').toLowerCase().includes(q) ||
      (emp.jobTitle || '').toLowerCase().includes(q)
    )
  })

  const linkedUserLabel = (emp: any) => {
    if (!emp.userId) return null
    const u = users.find((x: any) => x.id === emp.userId)
    return u?.name || u?.email || emp.userId
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            id="roster-search"
            placeholder="Search employees..."
            className="pl-9 h-10 border bg-muted/20"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button size="sm" className="bg-[#ff8903] text-white font-bold h-10" onClick={openAdd}>
          <Plus className="size-4" /> Add
        </Button>
      </div>

      {filtered.map((emp: any) => {
        const statusClass =
          emp.status === 'Terminated'
            ? 'bg-red-500/10 text-red-600'
            : emp.status === 'On Leave'
              ? 'bg-amber-500/10 text-amber-600'
              : emp.status === 'Probation'
                ? 'bg-amber-500/10 text-amber-600'
                : emp.isActive !== false
                  ? 'bg-green-500/10 text-green-600'
                  : 'bg-gray-500/10 text-gray-600'
        const linkedName = linkedUserLabel(emp)
        const emailMismatch =
          emp.userId &&
          (() => {
            const u = users.find((x: any) => x.id === emp.userId)
            return u && !emailsMatch(u.email, emp.email)
          })()

        return (
          <Card key={emp.id} className="border shadow-sm hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div
                  className="flex items-center gap-3 flex-1 min-w-0"
                  onClick={() => router.push(`/hr/${emp.id}`)}
                >
                  <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <User className="size-5 text-[#ff8903]" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className="font-black text-sm truncate">{getEmpName(emp)}</h3>
                      <Badge variant="outline" className={`text-[8px] h-4 px-1.5 font-bold ${statusClass}`}>
                        {emp.status || (emp.isActive !== false ? 'Active' : 'Inactive')}
                      </Badge>
                      {emp.userId ? (
                        <Badge
                          variant="outline"
                          className={`text-[8px] h-4 px-1.5 font-bold ${
                            emailMismatch
                              ? 'bg-amber-500/10 text-amber-700 border-amber-300'
                              : 'bg-blue-500/10 text-blue-700 border-blue-300'
                          }`}
                          title={emailMismatch ? 'Linked user email differs from HR email' : undefined}
                        >
                          <Link2 className="size-2.5 mr-0.5 inline" />
                          {emailMismatch ? 'Linked (email differs)' : 'Linked'}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[8px] h-4 px-1.5 font-bold bg-gray-500/10 text-gray-600">
                          No login
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-2 text-[10px] text-muted-foreground mt-0.5 flex-wrap">
                      {emp.department && <span>{emp.department}</span>}
                      {emp.jobTitle && <span>• {emp.jobTitle}</span>}
                      {emp.salary > 0 && <span>• {fmt(emp.salary)}</span>}
                      {linkedName && <span>• App: {linkedName}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    title="View Profile"
                    onClick={() => router.push(`/hr/${emp.id}`)}
                  >
                    <Eye className="size-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openEdit(emp)}>
                    <Edit3 className="size-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-red-500"
                    onClick={() => {
                      if (confirm('Delete employee?')) store.deleteEmployee(emp.id)
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}

      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-card border shadow-2xl rounded-3xl max-h-[85vh] overflow-y-auto">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-black">
                {editing ? 'Edit Employee' : 'Add Employee'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {['fullName', 'email', 'phone', 'department', 'jobTitle', 'nationalId'].map((f) => (
                <div key={f} className="space-y-1">
                  <Label className="text-xs font-black uppercase text-muted-foreground">
                    {f.replace(/([A-Z])/g, ' $1')}
                  </Label>
                  <Input
                    value={(form as any)[f]}
                    onChange={(e) => {
                      const value = e.target.value
                      setForm((prev) => {
                        const next = { ...prev, [f]: value }
                        if (f === 'email' && !editing?.userId) {
                          next.linkedUserId = findUserIdByEmail(users, value) || ''
                        }
                        return next
                      })
                    }}
                    className="h-10"
                  />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs font-black uppercase text-muted-foreground">Salary</Label>
                  <Input
                    type="number"
                    value={form.salary}
                    onChange={(e) => setForm({ ...form, salary: Number(e.target.value) })}
                    className="h-10"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-black uppercase text-muted-foreground">Contract</Label>
                  <select
                    value={form.contractType}
                    onChange={(e) => setForm({ ...form, contractType: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl border bg-background text-sm"
                  >
                    <option>Full-Time</option>
                    <option>Part-Time</option>
                    <option>Contract</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-black uppercase text-muted-foreground">Start Date</Label>
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  className="h-10"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-black uppercase text-muted-foreground">App User</Label>
                <select
                  value={form.linkedUserId}
                  onChange={(e) => setForm({ ...form, linkedUserId: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl border bg-background text-sm"
                >
                  <option value="">None — no login</option>
                  {users.map((u: any) => (
                    <option key={u.id} value={u.id}>
                      {u.name || u.email} ({u.email})
                      {suggestedUserId === u.id ? ' — email match' : ''}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-muted-foreground">
                  Optional. Matching email is suggested automatically. Users without an HR record stay unlinked.
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1 rounded-xl font-bold" onClick={() => setShowAdd(false)}>
                  Cancel
                </Button>
                <Button className="flex-1 rounded-xl font-bold bg-[#ff8903] text-white" onClick={handleSave}>
                  {editing ? 'Update' : 'Add'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
