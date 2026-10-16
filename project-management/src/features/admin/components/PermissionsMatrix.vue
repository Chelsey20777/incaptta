<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { ShieldCheck, Save, RotateCcw } from 'lucide-vue-next'
import { usePermissionsStore } from '../store/permissionsStore'
import { MODULES, CONFIGURABLE_ROLES, DEFAULT_ROLE_PERMISSIONS, type ModuleKey } from '@/constants/modules'
import { ROLE_LABELS } from '@/constants/roles'
import { toast } from 'vue-sonner'

const store = usePermissionsStore()

// Local draft copy — edits here don't affect the router until saved
const draft = ref<Record<string, Record<ModuleKey, boolean>>>({})

const moduleKeys = Object.keys(MODULES) as ModuleKey[]

function initDraft() {
    const source = store.config ?? DEFAULT_ROLE_PERMISSIONS
    const copy: Record<string, Record<ModuleKey, boolean>> = {}
    for (const role of CONFIGURABLE_ROLES) {
        copy[role] = { ...DEFAULT_ROLE_PERMISSIONS[role], ...(source[role] ?? {}) } as Record<ModuleKey, boolean>
    }
    draft.value = copy
}

onMounted(() => {
    initDraft()
})

// Track which roles have unsaved changes
const dirtyRoles = computed(() => {
    const dirty = new Set<string>()
    const source = store.config ?? DEFAULT_ROLE_PERMISSIONS
    for (const role of CONFIGURABLE_ROLES) {
        for (const mod of moduleKeys) {
            if ((draft.value[role]?.[mod] ?? false) !== (source[role]?.[mod] ?? false)) {
                dirty.add(role)
                break
            }
        }
    }
    return dirty
})

function toggle(role: string, mod: ModuleKey, value: boolean) {
    if (!draft.value[role]) draft.value[role] = { ...DEFAULT_ROLE_PERMISSIONS[role] } as Record<ModuleKey, boolean>
    draft.value[role]![mod] = value
}

async function saveRole(role: string) {
    if (!draft.value[role]) return
    await store.saveRolePermissions(role, draft.value[role]!)
}

async function saveAll() {
    const rolesToSave = Array.from(dirtyRoles.value)
    if (rolesToSave.length === 0) return
    
    try {
        for (const role of rolesToSave) {
            await store.saveRolePermissions(role, draft.value[role]!)
        }
        toast.success(`Successfully saved permissions for ${rolesToSave.length} roles`)
    } catch (err) {
        // Errors are handled inside the store (toast notifications)
    }
}

function resetRole(role: string) {
    const source = store.config ?? DEFAULT_ROLE_PERMISSIONS
    draft.value[role] = { ...DEFAULT_ROLE_PERMISSIONS[role], ...(source[role] ?? {}) } as Record<ModuleKey, boolean>
}
</script>

<template>
    <div class="space-y-4">
        <div>
            <h3 class="text-lg font-medium">Role Permissions</h3>
            <p class="text-sm text-muted-foreground">
                Control which modules each role can access. Changes take effect on the user's next navigation.
                SUPER_ADMIN always has full access and cannot be restricted.
            </p>
        </div>

        <Card>
            <CardHeader class="pb-3 border-b bg-muted/20">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <div class="p-2 rounded-lg bg-orange-100 text-orange-600">
                            <ShieldCheck class="size-5" />
                        </div>
                        <div>
                            <CardTitle class="text-base font-bold">Module Access Matrix</CardTitle>
                            <CardDescription>Toggle access per role. Changes are saved to the central configuration.</CardDescription>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <Button 
                            v-if="dirtyRoles.size > 0"
                            size="sm" 
                            variant="outline" 
                            class="h-9 border-orange-200 text-orange-600 hover:bg-orange-50"
                            @click="initDraft"
                        >
                            <RotateCcw class="size-4 mr-2" />
                            Discard All
                        </Button>
                        <Button 
                            size="sm" 
                            class="h-9 bg-orange-600 hover:bg-orange-700 text-white shadow-lg shadow-orange-600/20"
                            :disabled="dirtyRoles.size === 0 || store.loading"
                            @click="saveAll"
                        >
                            <Save class="size-4 mr-2" />
                            Save All Changes
                            <Badge v-if="dirtyRoles.size > 0" variant="secondary" class="ml-2 bg-white/20 text-white border-0 h-4 px-1 text-[10px]">
                                {{ dirtyRoles.size }}
                            </Badge>
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent class="p-0">
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead>
                            <tr class="border-b bg-muted/50">
                                <th class="text-left px-4 py-3 font-medium min-w-[160px]">Module</th>

                                <!-- SUPER_ADMIN — always on, not editable -->
                                <th class="text-center px-3 py-3 font-medium min-w-[110px]">
                                    <div class="flex flex-col items-center gap-1">
                                        <span class="text-xs">Super Admin</span>
                                        <Badge variant="secondary" class="text-[9px] px-1">Always On</Badge>
                                    </div>
                                </th>

                                <!-- Configurable roles -->
                                <th
                                    v-for="role in CONFIGURABLE_ROLES"
                                    :key="role"
                                    class="text-center px-3 py-3 font-medium min-w-[110px]"
                                >
                                    <div class="flex flex-col items-center gap-1">
                                        <span class="text-xs">{{ ROLE_LABELS[role] }}</span>
                                        <Badge
                                            v-if="dirtyRoles.has(role)"
                                            variant="outline"
                                            class="text-[9px] px-1 border-orange-400 text-orange-600"
                                        >
                                            Unsaved
                                        </Badge>
                                    </div>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr
                                v-for="mod in moduleKeys"
                                :key="mod"
                                class="border-b last:border-0 hover:bg-muted/30 transition-colors"
                            >
                                <!-- Module label -->
                                <td class="px-4 py-3 font-medium text-sm">
                                    {{ MODULES[mod] }}
                                </td>

                                <!-- SUPER_ADMIN always checked, disabled -->
                                <td class="text-center px-3 py-3">
                                    <div class="flex justify-center">
                                        <Switch :checked="true" disabled class="opacity-50 cursor-not-allowed" />
                                    </div>
                                </td>

                                <!-- Configurable role toggles -->
                                <td
                                    v-for="role in CONFIGURABLE_ROLES"
                                    :key="role"
                                    class="text-center px-3 py-3"
                                >
                                    <div class="flex justify-center">
                                        <Switch
                                            :checked="draft[role]?.[mod] ?? false"
                                            @update:checked="(val: boolean) => toggle(role, mod, val)"
                                        />
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                        <!-- Save / Reset row per column -->
                        <tfoot>
                            <tr class="border-t bg-muted/20">
                                <td class="px-4 py-3 text-xs text-muted-foreground">Actions</td>

                                <!-- SUPER_ADMIN — no actions -->
                                <td class="px-3 py-3" />

                                <td
                                    v-for="role in CONFIGURABLE_ROLES"
                                    :key="role"
                                    class="text-center px-3 py-2"
                                >
                                    <div class="flex flex-col items-center gap-1">
                                        <Button
                                            size="sm"
                                            class="h-7 text-xs w-full bg-orange-600 hover:bg-orange-700 text-white"
                                            :disabled="!dirtyRoles.has(role) || store.loading"
                                            @click="saveRole(role)"
                                        >
                                            <Save class="size-3 mr-1" />
                                            Save
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            class="h-7 text-xs w-full"
                                            :disabled="!dirtyRoles.has(role)"
                                            @click="resetRole(role)"
                                        >
                                            <RotateCcw class="size-3 mr-1" />
                                            Reset
                                        </Button>
                                    </div>
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </CardContent>
        </Card>

        <p class="text-xs text-muted-foreground">
            Note: Changes are enforced at the navigation level. A user currently browsing a restricted page
            will be redirected on their next route change.
        </p>
    </div>
</template>
