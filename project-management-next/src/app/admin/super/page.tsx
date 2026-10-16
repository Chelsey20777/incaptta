'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { usePermissionsStore } from '@/stores/permissions-store'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { ShieldCheck, Plus, Trash2, Save, ArrowLeft, Loader2, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { auth } from '@/lib/firebase'
import { MODULES, type ModuleKey } from '@/constants/modules'
import { ROLE_LABELS } from '@/constants/roles'

export default function SuperAdminPage() {
  const router = useRouter()
  const authStore = useAuthStore()
  const permissionsStore = usePermissionsStore()

  const { claims, loading: authLoading } = authStore
  const isSuperAdmin = authStore.isSuperAdmin()

  const [rolesList, setRolesList] = useState<any[]>([])
  const [customRolesLoading, setCustomRolesLoading] = useState(true)

  // New role form state
  const [newRoleId, setNewRoleId] = useState('')
  const [newRoleName, setNewRoleName] = useState('')
  const [newRolePermissions, setNewRolePermissions] = useState<ModuleKey[]>([])
  const [savingNewRole, setSavingNewRole] = useState(false)

  // Module toggles draft state
  const [modulesDraft, setModulesDraft] = useState<Record<string, Record<ModuleKey, boolean>>>({})
  const [savingModules, setSavingModules] = useState(false)

  const moduleKeys = Object.keys(MODULES) as ModuleKey[]
  const standardRoles = Object.keys(ROLE_LABELS)

  useEffect(() => {
    if (!authLoading && !isSuperAdmin) {
      router.replace('/dashboard')
    }
  }, [authLoading, isSuperAdmin, router])

  // Load configuration and custom roles
  useEffect(() => {
    if (isSuperAdmin) {
      permissionsStore.load()
      fetchCustomRoles()
    }
  }, [isSuperAdmin, permissionsStore])

  // Sync draft modules when permissionsStore loads
  useEffect(() => {
    if (permissionsStore.config) {
      const copy: Record<string, Record<ModuleKey, boolean>> = {}
      // Include standard configurable roles
      standardRoles.forEach((role) => {
        copy[role] = { ...(permissionsStore.config?.[role] || {}) } as Record<ModuleKey, boolean>
      })
      // Include loaded custom roles
      rolesList.forEach((r) => {
        copy[r.id] = { ...(permissionsStore.config?.[r.id] || {}) } as Record<ModuleKey, boolean>
      })
      setModulesDraft(copy)
    }
  }, [permissionsStore.config, rolesList])

  async function fetchCustomRoles() {
    setCustomRolesLoading(true)
    try {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch('/api/super/roles', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setRolesList(data)
      }
    } catch (err) {
      console.error('Failed to load custom roles:', err)
    } finally {
      setCustomRolesLoading(false)
    }
  }

  // Handle module toggle locally in draft state
  function handleToggleModule(role: string, moduleKey: ModuleKey, value: boolean) {
    if (moduleKey === 'mbdi') return
    setModulesDraft((prev) => ({
      ...prev,
      [role]: {
        ...prev[role],
        [moduleKey]: value,
        mbdi: true,
      }
    }))
  }

  // Save module permissions via Server Endpoint
  async function handleSaveModules(role: string) {
    setSavingModules(true)
    try {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch('/api/super/modules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ role, modules: modulesDraft[role] })
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Request failed')
      }

      toast.success(`Module permissions updated for ${ROLE_LABELS[role as keyof typeof ROLE_LABELS] || role}`)
      permissionsStore.load() // reload store configuration
    } catch (err: any) {
      toast.error(`Save failed: ${err.message}`)
    } finally {
      setSavingModules(false)
    }
  }

  // Create custom role
  async function handleCreateRole(e: React.FormEvent) {
    e.preventDefault()
    if (!newRoleId || !newRoleName) return

    const sanitizedId = newRoleId.trim().toUpperCase().replace(/\s+/g, '_')
    const idPattern = /^[A-Z0-9_]+$/
    if (!idPattern.test(sanitizedId)) {
      toast.error('Invalid ID format. Uppercase and underscores only.')
      return
    }

    setSavingNewRole(true)
    try {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch('/api/super/roles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          id: sanitizedId,
          name: newRoleName,
          permissions: newRolePermissions
        })
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Failed to create role')
      }

      toast.success(`Custom role ${sanitizedId} created successfully`)
      setNewRoleId('')
      setNewRoleName('')
      setNewRolePermissions([])
      fetchCustomRoles()
      permissionsStore.load()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSavingNewRole(false)
    }
  }

  // Delete custom role
  async function handleDeleteRole(roleId: string) {
    if (!window.confirm(`Are you sure you want to permanently delete custom role ${roleId}?`)) {
      return
    }

    try {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch(`/api/super/roles?id=${roleId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Failed to delete role')
      }

      toast.success(`Role ${roleId} deleted`)
      fetchCustomRoles()
      permissionsStore.load()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  // Handle custom role creation checklist toggles
  function toggleNewRolePermission(mod: ModuleKey) {
    setNewRolePermissions((prev) =>
      prev.includes(mod) ? prev.filter((item) => item !== mod) : [...prev, mod]
    )
  }

  if (authLoading || !isSuperAdmin) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Verifying credentials...</p>
        </div>
      </div>
    )
  }

  // Construct active roles list (Standard configurable + Custom roles)
  const activeRoles = [...standardRoles.filter(r => r !== 'SUPER_ADMIN')]

  return (
    <div className="space-y-8 p-8 pt-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => router.push('/admin')} className="p-0 hover:bg-transparent">
              <ArrowLeft className="size-4 mr-2" /> Back
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <h2 className="text-3xl font-bold tracking-tight">Super Admin Controls</h2>
            <Badge className="bg-primary/20 text-primary border-primary">System Owner Access</Badge>
          </div>
          <p className="text-muted-foreground">Manage organization-level toggles, customize role lists, and override strict configs.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Panel 1: Modules / Permissions Matrix (takes 2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ShieldCheck className="size-5 text-primary" />Module Access Matrix</CardTitle>
              <CardDescription>Configure active modules per role. Toggles write to configuration via secure Server verification API.</CardDescription>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[150px]">Module Name</TableHead>
                    {activeRoles.map((role) => (
                      <TableHead key={role} className="text-center min-w-[100px]">
                        <span className="text-xs uppercase">{ROLE_LABELS[role as keyof typeof ROLE_LABELS] || role}</span>
                      </TableHead>
                    ))}
                    {rolesList.map((r) => (
                      <TableHead key={r.id} className="text-center min-w-[100px]">
                        <span className="text-xs font-semibold text-primary uppercase">{r.name}</span>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {moduleKeys.map((mod) => (
                    <TableRow key={mod}>
                      <TableCell className="font-medium text-sm">{MODULES[mod]}</TableCell>
                      {/* Standard Configurable Toggles */}
                      {activeRoles.map((role) => (
                        <TableCell key={role} className="text-center">
                          {mod === 'mbdi' ? (
                            <Switch checked={true} disabled className="opacity-50 cursor-not-allowed" />
                          ) : (
                            <Switch
                              checked={modulesDraft[role]?.[mod] === true}
                              onCheckedChange={(val) => handleToggleModule(role, mod, val)}
                            />
                          )}
                        </TableCell>
                      ))}
                      {/* Custom Roles Toggles */}
                      {rolesList.map((r) => (
                        <TableCell key={r.id} className="text-center">
                          {mod === 'mbdi' ? (
                            <Switch checked={true} disabled className="opacity-50 cursor-not-allowed" />
                          ) : (
                            <Switch
                              checked={modulesDraft[r.id]?.[mod] === true}
                              onCheckedChange={(val) => handleToggleModule(r.id, mod, val)}
                            />
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  {/* Save action triggers */}
                  <TableRow className="bg-muted/30">
                    <TableCell className="font-semibold text-xs text-muted-foreground">Commit Writes</TableCell>
                    {activeRoles.map((role) => (
                      <TableCell key={role} className="text-center">
                        <Button variant="outline" size="sm" onClick={() => handleSaveModules(role)} disabled={savingModules} className="text-xs h-7 px-2">
                          <Save className="size-3 mr-1" /> Save
                        </Button>
                      </TableCell>
                    ))}
                    {rolesList.map((r) => (
                      <TableCell key={r.id} className="text-center">
                        <Button variant="outline" size="sm" onClick={() => handleSaveModules(r.id)} disabled={savingModules} className="text-xs h-7 px-2 border-primary/40 hover:bg-primary/5">
                          <Save className="size-3 mr-1" /> Save
                        </Button>
                      </TableCell>
                    ))}
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Panel 2: Role Management (takes 1 col) */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><KeyRound className="size-5 text-primary" />Create Custom Role</CardTitle>
              <CardDescription>Provision custom roles with uppercase key ID (no spaces).</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateRole} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="roleId">Role Key ID</Label>
                  <Input
                    id="roleId"
                    value={newRoleId}
                    onChange={(e) => setNewRoleId(e.target.value)}
                    placeholder="e.g. WAREHOUSE_AUDITOR"
                    required
                  />
                  <p className="text-[10px] text-muted-foreground">Uppercase, numbers, and underscores only. Example: SHIFT_LEAD</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="roleName">Display Label Name</Label>
                  <Input
                    id="roleName"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    placeholder="e.g. Shift Lead Auditor"
                    required
                  />
                </div>
                <div className="space-y-2 pt-2 border-t">
                  <Label className="text-xs font-semibold">Assign Initial Access Toggles</Label>
                  <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto border p-2 rounded">
                    {moduleKeys.map((mod) => (
                      <div key={mod} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id={`new-role-${mod}`}
                          checked={newRolePermissions.includes(mod)}
                          onChange={() => toggleNewRolePermission(mod)}
                          className="size-4 rounded border-input accent-primary cursor-pointer"
                        />
                        <Label htmlFor={`new-role-${mod}`} className="text-xs cursor-pointer">{MODULES[mod]}</Label>
                      </div>
                    ))}
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={savingNewRole}>
                  {savingNewRole ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Plus className="size-4 mr-2" />}
                  Create Custom Role
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Active Custom Roles</CardTitle>
              <CardDescription>Custom roles defined. Core system roles cannot be deleted.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {customRolesLoading ? (
                <div className="flex justify-center p-4">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : rolesList.length === 0 ? (
                <p className="text-xs text-muted-foreground italic text-center py-4">No custom roles defined.</p>
              ) : (
                rolesList.map((r) => (
                  <div key={r.id} className="flex items-center justify-between border p-3 rounded-lg bg-card/50">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">{r.name}</p>
                      <p className="text-[10px] font-mono text-muted-foreground">{r.id}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => handleDeleteRole(r.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  )
}
