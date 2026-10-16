'use client'

import { useState, useEffect, useCallback } from 'react'
import { usePermissionsStore } from '@/stores/permissions-store'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell
} from '@/components/ui/table'
import { ShieldCheck, Save, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import {
  MODULES,
  CONFIGURABLE_ROLES,
  resolveRoleModules,
  type ModuleKey
} from '@/constants/modules'
import { ROLE_LABELS } from '@/constants/roles'

export default function PermissionsMatrix() {
  const store = usePermissionsStore()
  const { config, loading: storeLoading, saveRolePermissions } = store

  const [draft, setDraft] = useState<Record<string, Record<ModuleKey, boolean>>>({})
  const [saving, setSaving] = useState(false)

  const moduleKeys = Object.keys(MODULES) as ModuleKey[]

  const initDraft = useCallback(() => {
    const copy: Record<string, Record<ModuleKey, boolean>> = {}
    for (const role of CONFIGURABLE_ROLES) {
      copy[role] = resolveRoleModules(role, config)
    }
    setDraft(copy)
  }, [config])

  useEffect(() => {
    if (storeLoading) {
      store.load()
    }
  }, [store, storeLoading])

  useEffect(() => {
    initDraft()
  }, [initDraft])

  const dirtyRoles = Object.keys(draft).filter((role) => {
    const source = resolveRoleModules(role, config)
    const current = draft[role]
    if (!current) return false
    for (const mod of moduleKeys) {
      if (source[mod] !== current[mod]) return true
    }
    return false
  })

  function toggle(role: string, moduleKey: ModuleKey, value: boolean) {
    // MBDI is per-user; STOREKEEPER is permanently restricted to PMO.
    if (moduleKey === 'mbdi' || role === 'STOREKEEPER') return
    setDraft((prev) => ({
      ...prev,
      [role]: {
        ...prev[role],
        [moduleKey]: value,
      }
    }))
  }

  async function saveRole(role: string) {
    setSaving(true)
    try {
      await saveRolePermissions(role, draft[role])
      toast.success(`Permissions saved for ${ROLE_LABELS[role as keyof typeof ROLE_LABELS] || role}`)
    } catch (err: any) {
      toast.error(`Failed to save permissions: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function saveAll() {
    setSaving(true)
    try {
      for (const role of Object.keys(draft)) {
        await saveRolePermissions(role, draft[role])
      }
      toast.success('All permissions saved successfully')
    } catch (err: any) {
      toast.error(`Failed to save all permissions: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  function resetRole(role: string) {
    setDraft((prev) => ({
      ...prev,
      [role]: resolveRoleModules(role, config)
    }))
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Role Permissions</h3>
          <p className="text-sm text-muted-foreground">
            Configure which roles can access each module. Users with multiple roles get the union of those
            permissions (e.g. TECHNICAL + ACCOUNTANT unlocks finance). SUPER_ADMIN always has full access.
            STOREKEEPER is limited to PMO. MBDI is granted per user under Admin → Users (approver roles bypass the grant).
          </p>
        </div>
        <Button onClick={saveAll} disabled={saving || storeLoading} size="sm">
          <Save className="mr-2 size-4" />
          {saving ? 'Saving...' : 'Save All'}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[180px]">Module</TableHead>
                <TableHead className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <ShieldCheck className="size-4 text-primary" />
                    <span>SUPER_ADMIN</span>
                    <Badge variant="outline" className="ml-1 text-xs">Always On</Badge>
                  </div>
                </TableHead>
                {CONFIGURABLE_ROLES.map((role) => (
                  <TableHead key={role} className="text-center">
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-sm">{ROLE_LABELS[role]}</span>
                      {dirtyRoles.includes(role) && (
                        <Badge variant="secondary" className="text-[10px] bg-yellow-100 text-yellow-800">
                          Unsaved
                        </Badge>
                      )}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {moduleKeys.map((mod) => (
                <TableRow key={mod}>
                  <TableCell className="font-medium">
                    {MODULES[mod]}
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch checked={true} disabled className="opacity-50 cursor-not-allowed" />
                  </TableCell>
                  {CONFIGURABLE_ROLES.map((role) => (
                    <TableCell key={role} className="text-center">
                      {mod === 'mbdi' || role === 'STOREKEEPER' ? (
                        <Switch
                          checked={draft[role]?.[mod] === true}
                          disabled
                          className="opacity-50 cursor-not-allowed"
                          title={role === 'STOREKEEPER' ? 'STOREKEEPER is restricted to the PMO module' : 'MBDI is granted per user in Admin → Users (approvers bypass)'}
                        />
                      ) : (
                        <Switch
                          checked={draft[role]?.[mod] === true}
                          onCheckedChange={(checked: boolean) => toggle(role, mod, checked)}
                        />
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              {/* Footer row with per-role save/reset */}
              <TableRow className="border-t-2">
                <TableCell className="font-medium">Actions</TableCell>
                <TableCell className="text-center">
                  <span className="text-xs text-muted-foreground">—</span>
                </TableCell>
                {CONFIGURABLE_ROLES.map((role) => (
                  <TableCell key={role} className="text-center">
                    <div className="flex flex-col items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => saveRole(role)}
                        disabled={saving || !dirtyRoles.includes(role)}
                        className="text-xs"
                      >
                        <Save className="mr-1 size-3" />
                        Save
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => resetRole(role)}
                        disabled={saving || !dirtyRoles.includes(role)}
                        className="text-xs"
                      >
                        <RotateCcw className="mr-1 size-3" />
                        Reset
                      </Button>
                    </div>
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
