'use client'

import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { useAdminStore } from '@/stores/admin-store'
import { useAuthStore } from '@/stores/auth-store'
import { db } from '@/lib/firebase'
import { emailsMatch, findEmployeeIdByEmail } from '@/lib/user-employee-link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from '@/components/ui/dialog'
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell
} from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { UserPlus, UserCheck, UserX, Shield, Mail, User, Edit, Trash2, Link2, Link2Off, Monitor, Loader2, LogOut, Rocket } from 'lucide-react'
import { ROLE_LABELS, type UserRole } from '@/constants/roles'
import type { UserSessionDevice } from '@/stores/admin-store'
import { toast } from 'sonner'
import { isMbdiApproverRole } from '@/features/mbdi/utils/access'

interface UsersTableProps {
  users: any[]
  isAdmin?: boolean
}

function empName(emp: any) {
  return emp?.fullName || emp?.name || emp?.displayName || emp?.email || emp?.id || 'Employee'
}

function formatSessionTime(ms: number | null) {
  if (!ms) return '—'
  try {
    return new Date(ms).toLocaleString()
  } catch {
    return '—'
  }
}

export default function UsersTable({ users, isAdmin }: UsersTableProps) {
  const store = useAdminStore()
  const { user: currentUser } = useAuthStore()

  const [employees, setEmployees] = useState<any[]>([])
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [userToDelete, setUserToDelete] = useState<any>(null)
  const [isSessionsDialogOpen, setIsSessionsDialogOpen] = useState(false)
  const [sessionsUser, setSessionsUser] = useState<any>(null)
  const [sessions, setSessions] = useState<UserSessionDevice[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [revokingSessions, setRevokingSessions] = useState(false)

  const [selectedUser, setSelectedUser] = useState<any>(null)
  const [selectedRoles, setSelectedRoles] = useState<UserRole[]>([])

  const [selectedProfileData, setSelectedProfileData] = useState({
    id: '',
    name: '',
    employeeId: '' as string,
    mbdiAccess: false,
    isApprover: false,
  })

  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    isActive: true,
    roles: [] as UserRole[],
    employeeId: '' as string,
    mbdiAccess: false,
  })
  const [saving, setSaving] = useState(false)
  const [backfilling, setBackfilling] = useState(false)

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'employees'), (snap) => {
      setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    return () => unsub()
  }, [])

  const suggestedEmployeeId = useMemo(
    () => findEmployeeIdByEmail(employees, newUser.email) || '',
    [employees, newUser.email]
  )

  function openRoleEdit(user: any) {
    setSelectedUser(user)
    setSelectedRoles([...(user.roles || [])])
    setIsRoleDialogOpen(true)
  }

  function openProfileEdit(user: any) {
    const roles = (user.roles || []) as string[]
    const isApprover = isMbdiApproverRole(roles)
    setSelectedProfileData({
      id: user.id,
      name: user.name || '',
      employeeId: user.employeeId || findEmployeeIdByEmail(employees, user.email) || '',
      mbdiAccess: isApprover || user.modules?.mbdi === true,
      isApprover,
    })
    setIsProfileDialogOpen(true)
  }

  async function handleSaveProfile() {
    if (!selectedProfileData.id) return
    setSaving(true)
    try {
      await store.updateUserProfile(selectedProfileData.id, { name: selectedProfileData.name })
      await store.linkUserToEmployee(
        selectedProfileData.id,
        selectedProfileData.employeeId || null
      )
      if (!selectedProfileData.isApprover) {
        await store.updateUserModules(selectedProfileData.id, {
          mbdi: selectedProfileData.mbdiAccess,
        })
      }
      setIsProfileDialogOpen(false)
    } catch {
      // Error handled by store
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveRoles() {
    if (selectedUser) {
      setSaving(true)
      try {
        await store.updateUserRole(selectedUser.id, selectedRoles)
        if (
          selectedRoles.includes('MBDI_STAFF') &&
          !isMbdiApproverRole(selectedRoles) &&
          selectedUser.modules?.mbdi !== true
        ) {
          await store.updateUserModules(selectedUser.id, { mbdi: true })
        }
        setIsRoleDialogOpen(false)
      } catch {
        // Error handled by store
      } finally {
        setSaving(false)
      }
    }
  }

  async function handleCreateUser() {
    if (!newUser.name || !newUser.email) return

    const rolesToSend = newUser.roles.length > 0 ? [...newUser.roles] : ['TECHNICAL']
    const grantMbdi =
      newUser.mbdiAccess || rolesToSend.includes('MBDI_STAFF')

    setSaving(true)
    try {
      const uid = await store.createUserWithPassword({
        name: newUser.name,
        email: newUser.email,
        password: newUser.password || undefined,
        roles: rolesToSend as string[],
        isActive: newUser.isActive,
        employeeId: newUser.employeeId || null,
      })

      if (uid && grantMbdi && !isMbdiApproverRole(rolesToSend)) {
        await store.updateUserModules(uid, { mbdi: true })
      }

      setIsCreateDialogOpen(false)
      setNewUser({
        name: '',
        email: '',
        password: '',
        isActive: true,
        roles: [],
        employeeId: '',
        mbdiAccess: false,
      })
    } catch {
      // Error handled by store
    } finally {
      setSaving(false)
    }
  }

  async function toggleStatus(user: any) {
    await store.toggleUserStatus(user.id, !user.isActive)
  }

  function openDeleteConfirm(user: any) {
    setUserToDelete(user)
    setIsDeleteDialogOpen(true)
  }

  async function handleDeleteUser() {
    if (!userToDelete) return
    if (currentUser && (currentUser.uid === userToDelete.id || currentUser.email === userToDelete.email)) {
      return
    }
    await store.deleteUser(userToDelete.id)
    setIsDeleteDialogOpen(false)
    setUserToDelete(null)
  }

  async function openSessions(user: any) {
    setSessionsUser(user)
    setIsSessionsDialogOpen(true)
    setSessionsLoading(true)
    setSessions([])
    try {
      const list = await store.fetchUserSessions(user.id)
      setSessions(list)
    } catch (err: unknown) {
      setSessions([])
      const message = err instanceof Error ? err.message : 'Failed to load sessions'
      toast.error(message)
    } finally {
      setSessionsLoading(false)
    }
  }

  async function handleForceLogoutAll() {
    if (!sessionsUser) return
    if (
      !window.confirm(
        `Force logout ${sessionsUser.name || sessionsUser.email} from all devices? They will need to sign in again.`
      )
    ) {
      return
    }
    setRevokingSessions(true)
    try {
      await store.revokeUserSessions(sessionsUser.id)
      const list = await store.fetchUserSessions(sessionsUser.id)
      setSessions(list)
    } catch {
      // store toasts
    } finally {
      setRevokingSessions(false)
    }
  }

  function toggleRole(role: UserRole) {
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    )
  }

  function toggleNewUserRole(role: UserRole) {
    setNewUser((prev) => {
      const roles = prev.roles.includes(role)
        ? prev.roles.filter((r) => r !== role)
        : [...prev.roles, role]
      return {
        ...prev,
        roles,
        // Selecting MBDI Staff turns MBDI access on automatically
        mbdiAccess: roles.includes('MBDI_STAFF') ? true : prev.mbdiAccess,
      }
    })
  }

  async function handleBackfill() {
    setBackfilling(true)
    try {
      await store.backfillUserEmployeeLinks(employees)
    } catch {
      // store toasts
    } finally {
      setBackfilling(false)
    }
  }

  const roleKeys = Object.keys(ROLE_LABELS) as UserRole[]

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-2 flex-wrap">
        <div>
          <h3 className="text-lg font-medium">User Accounts</h3>
          <p className="text-sm text-muted-foreground">
            Manage system users, assigned roles, and optional HR employee links.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={backfilling}
            onClick={handleBackfill}
            title="Link users and employees that share the same email"
          >
            <Link2 className="mr-2 size-4" />
            {backfilling ? 'Linking…' : 'Link matching emails'}
          </Button>
          <Button
            size="sm"
            className="bg-orange-600 hover:bg-orange-700 text-white border-orange-700"
            onClick={() => setIsCreateDialogOpen(true)}
          >
            <UserPlus className="mr-2 size-4" />
            Invite User
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>HR Employee</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const linkedEmp = user.employeeId
                  ? employees.find((e) => e.id === user.employeeId)
                  : null
                const mismatch =
                  linkedEmp && user.email && linkedEmp.email && !emailsMatch(user.email, linkedEmp.email)

                return (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <User className="size-4 text-muted-foreground" />
                        {user.name || 'N/A'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Mail className="size-4 text-muted-foreground" />
                        {user.email}
                      </div>
                    </TableCell>
                    <TableCell>
                      {linkedEmp ? (
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            mismatch
                              ? 'border-amber-300 text-amber-700'
                              : 'border-blue-300 text-blue-700'
                          }`}
                          title={mismatch ? 'Emails differ between user and employee' : undefined}
                        >
                          <Link2 className="size-3 mr-1 inline" />
                          {empName(linkedEmp)}
                          {mismatch ? ' (email differs)' : ''}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Not in HR</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(user.roles || []).map((role: string) => (
                          <Badge key={role} variant="secondary" className="text-[10px] uppercase">
                            {(ROLE_LABELS as any)[role] || role}
                          </Badge>
                        ))}
                        {(!user.roles || user.roles.length === 0) && (
                          <span className="text-xs text-muted-foreground italic text-[10px]">
                            No roles
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.isActive !== false ? 'default' : 'destructive'}>
                        {user.isActive !== false ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button variant="outline" size="sm" onClick={() => openProfileEdit(user)}>
                        <Edit className="mr-1 size-3" /> Edit
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openRoleEdit(user)}>
                        <Shield className="mr-1 size-3" /> Roles
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openSessions(user)}
                        title="View logged-in devices"
                      >
                        <Monitor className="mr-1 size-3" /> Sessions
                      </Button>
                      {user.employeeId && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Unlink HR employee"
                          onClick={() => store.unlinkUserFromEmployee(user.id)}
                        >
                          <Link2Off className="size-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className={user.isActive !== false ? 'text-destructive' : 'text-primary'}
                        onClick={() => toggleStatus(user)}
                      >
                        {user.isActive !== false ? <UserX className="size-4" /> : <UserCheck className="size-4" />}
                      </Button>
                      {isAdmin &&
                        !(
                          currentUser &&
                          (currentUser.uid === user.id || currentUser.email === user.email)
                        ) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:bg-destructive/10"
                            onClick={() => openDeleteConfirm(user)}
                            title="Delete user permanently"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                    </TableCell>
                  </TableRow>
                )
              })}
              {users.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="h-24 text-center text-muted-foreground italic text-sm"
                  >
                    No users found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isProfileDialogOpen} onOpenChange={setIsProfileDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
            <DialogDescription>Update the user's name and optional HR employee link.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-name" className="text-right">
                Name
              </Label>
              <Input
                id="edit-name"
                value={selectedProfileData.name}
                onChange={(e) =>
                  setSelectedProfileData((prev) => ({ ...prev, name: e.target.value }))
                }
                className="col-span-3"
                placeholder="Full Name"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-employee" className="text-right">
                HR Employee
              </Label>
              <select
                id="edit-employee"
                value={selectedProfileData.employeeId}
                onChange={(e) =>
                  setSelectedProfileData((prev) => ({ ...prev, employeeId: e.target.value }))
                }
                className="col-span-3 h-10 px-3 rounded-md border bg-background text-sm"
              >
                <option value="">None — not in HR</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {empName(emp)}
                    {emp.email ? ` (${emp.email})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-mbdi" className="text-right flex items-center justify-end gap-1">
                <Rocket className="size-3.5 text-orange-600" />
                MBDI
              </Label>
              <div className="col-span-3 flex items-center gap-3">
                <Switch
                  id="edit-mbdi"
                  checked={selectedProfileData.mbdiAccess}
                  disabled={selectedProfileData.isApprover}
                  onCheckedChange={(checked) =>
                    setSelectedProfileData((prev) => ({ ...prev, mbdiAccess: checked }))
                  }
                />
                <span className="text-sm text-muted-foreground">
                  {selectedProfileData.isApprover
                    ? 'Approver roles always have MBDI access'
                    : 'Grant standalone / Projects MBDI access'}
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsProfileDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveProfile} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage Roles</DialogTitle>
            <DialogDescription>
              Assign system roles to {selectedUser?.name || selectedUser?.email}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {roleKeys.map((role) => (
              <div key={role} className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id={role}
                  checked={selectedRoles.includes(role)}
                  onChange={() => toggleRole(role)}
                  className="size-4 rounded border-input accent-primary cursor-pointer"
                />
                <Label htmlFor={role} className="text-sm font-medium leading-none cursor-pointer">
                  {ROLE_LABELS[role]} ({role})
                </Label>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRoleDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveRoles} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User Account</DialogTitle>
            <DialogDescription>
              This will permanently delete{' '}
              <strong>{userToDelete?.name || userToDelete?.email}</strong>'s account
              from Firebase Auth and Firestore. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteUser}
              disabled={saving}
            >
              Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isSessionsDialogOpen}
        onOpenChange={(open) => {
          setIsSessionsDialogOpen(open)
          if (!open) {
            setSessionsUser(null)
            setSessions([])
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Monitor className="size-5" />
              Active Sessions
            </DialogTitle>
            <DialogDescription>
              Devices where <strong>{sessionsUser?.name || sessionsUser?.email}</strong> is
              signed in (seen in the last 14 days). Location is approximate from IP.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[360px] overflow-y-auto space-y-3 py-1">
            {sessionsLoading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading sessions…
              </div>
            ) : sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8 italic">
                No active sessions recorded yet. Sessions appear after the user opens the app.
              </p>
            ) : (
              sessions.map((session) => (
                <div
                  key={session.sessionId}
                  className="rounded-lg border bg-muted/20 p-3 space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold">{session.deviceName}</p>
                    <Badge variant="secondary" className="text-[10px] uppercase shrink-0">
                      {({
                        'project-management-next': 'Projects',
                        'incaptta-mbdi-next': 'MBDI',
                        'incaptta-chat-next': 'Chat',
                        'incaptta-manage-next': 'Manage',
                      } as Record<string, string>)[session.app] ||
                        session.app ||
                        'App'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    IP: <span className="text-foreground font-medium">{session.ip}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Location:{' '}
                    <span className="text-foreground font-medium">{session.locationLabel}</span>
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground pt-1">
                    <span>Last seen: {formatSessionTime(session.lastSeenAt)}</span>
                    <span>First seen: {formatSessionTime(session.createdAt)}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setIsSessionsDialogOpen(false)}
            >
              Close
            </Button>
            <Button
              variant="destructive"
              onClick={handleForceLogoutAll}
              disabled={revokingSessions || sessionsLoading}
              className="gap-1.5"
            >
              {revokingSessions ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <LogOut className="size-3.5" />
              )}
              Force logout all devices
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Invite New User</DialogTitle>
            <DialogDescription>
              Create a user profile and assign roles. Optionally link an HR employee.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Name
              </Label>
              <Input
                id="name"
                value={newUser.name}
                onChange={(e) => setNewUser((prev) => ({ ...prev, name: e.target.value }))}
                className="col-span-3"
                placeholder="Full Name"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="email" className="text-right">
                Email
              </Label>
              <Input
                id="email"
                value={newUser.email}
                onChange={(e) => {
                  const email = e.target.value
                  setNewUser((prev) => ({
                    ...prev,
                    email,
                    employeeId: findEmployeeIdByEmail(employees, email) || prev.employeeId,
                  }))
                }}
                className="col-span-3"
                placeholder="user@example.com"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="password" className="text-right">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser((prev) => ({ ...prev, password: e.target.value }))}
                className="col-span-3"
                placeholder="Optional - auto generated if empty"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="employee" className="text-right">
                HR Employee
              </Label>
              <select
                id="employee"
                value={newUser.employeeId}
                onChange={(e) => setNewUser((prev) => ({ ...prev, employeeId: e.target.value }))}
                className="col-span-3 h-10 px-3 rounded-md border bg-background text-sm"
              >
                <option value="">None — not in HR</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {empName(emp)}
                    {emp.email ? ` (${emp.email})` : ''}
                    {suggestedEmployeeId === emp.id ? ' — email match' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-4 pt-4">
              <Label className="text-sm font-semibold">Assign Roles</Label>
              <div className="grid grid-cols-2 gap-2">
                {roleKeys.map((roleKey) => (
                  <div key={roleKey} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={`new-${roleKey}`}
                      checked={newUser.roles.includes(roleKey)}
                      onChange={() => toggleNewUserRole(roleKey)}
                      className="size-4 rounded border-input accent-primary cursor-pointer"
                    />
                    <Label
                      htmlFor={`new-${roleKey}`}
                      className="text-xs font-medium leading-none cursor-pointer"
                    >
                      {ROLE_LABELS[roleKey]}
                    </Label>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                For MBDI-only users, assign <span className="font-medium">MBDI Staff</span> (not Technical).
              </p>
            </div>
            <div className="grid grid-cols-4 items-center gap-4 pt-2">
              <Label htmlFor="new-mbdi" className="text-right flex items-center justify-end gap-1">
                <Rocket className="size-3.5 text-orange-600" />
                MBDI
              </Label>
              <div className="col-span-3 flex items-center gap-3">
                <Switch
                  id="new-mbdi"
                  checked={newUser.mbdiAccess || newUser.roles.includes('MBDI_STAFF')}
                  disabled={isMbdiApproverRole(newUser.roles)}
                  onCheckedChange={(checked) =>
                    setNewUser((prev) => ({ ...prev, mbdiAccess: checked }))
                  }
                />
                <span className="text-sm text-muted-foreground">
                  Grant standalone / Projects MBDI access
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateUser} disabled={saving}>
              {saving ? 'Creating...' : 'Create Profile'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
