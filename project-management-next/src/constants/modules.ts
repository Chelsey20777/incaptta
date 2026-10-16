import type { UserRole } from './roles'

export const MODULES = {
    dashboard:            'Dashboard',
    pmo:                  'PMO Fulfilment',
    jobCards:             'Job Cards',
    subcontractors:       'Subcontractors',
    subcontractorsWrite:  'Subcontractors Write',
    opex:                 'Operational Expenses',
    finance:              'Finance & Ledger',
    inventory:            'Inventory',
    procurement:          'Procurement',
    crm:                  'CRM & Leads',
    tasks:                'Tasks',
    hr:                   'HR (General)',
    hrPayroll:            'HR Payroll',
    hrRecruitment:        'HR Recruitment',
    analytics:            'Analytics',
    support:              'Support',
    admin:                'Admin Settings',
    containerAccess:      'Container Access',
    commissions:          'Commissions',
    mbdi:                 'MBDI Scheme',
    agricStructures:      'Agricultural Structures',
    poultry:              'Poultry',
    chat:                 'Chat',
    tools:                'Tools',
} as const

export type ModuleKey = keyof typeof MODULES

export const CONFIGURABLE_ROLES: Exclude<UserRole, 'SUPER_ADMIN'>[] = [
    'ADMIN',
    'MANAGER',
    'ACCOUNTANT',
    'SALES',
    'STOREKEEPER',
    'TECHNICAL',
    'DIRECTOR',
    'POULTRY_MANAGER',
    'FARM_HAND',
    'MBDI_STAFF',
]

export type PermissionsConfig = Record<string, Record<ModuleKey, boolean>>

const ALL_TRUE = {
    dashboard: true, pmo: true, jobCards: true, subcontractors: true, subcontractorsWrite: true,
    commissions: true, mbdi: true, opex: true, finance: true,
    inventory: true, procurement: true, crm: true, tasks: true, hr: true,
    hrPayroll: true, hrRecruitment: true, analytics: true, support: true,
    admin: true, containerAccess: true, agricStructures: true, poultry: true, chat: true, tools: true,
} as const

/** Minimal staff baseline — MBDI is granted per-user via users/{uid}.modules.mbdi. */
const STAFF_BASE = {
    dashboard: true,
    pmo: false,
    jobCards: false,
    subcontractors: false,
    subcontractorsWrite: false,
    commissions: false,
    mbdi: false,
    opex: false,
    finance: false,
    inventory: false,
    procurement: false,
    crm: false,
    tasks: true,
    hr: false,
    hrPayroll: false,
    hrRecruitment: false,
    analytics: false,
    support: true,
    admin: false,
    containerAccess: false,
    agricStructures: false,
    poultry: false,
    chat: true,
    tools: false,
} as const satisfies Record<ModuleKey, boolean>

/** MBDI-only users: no Projects modules; standalone access via modules.mbdi. */
const MBDI_ONLY = {
    dashboard: false,
    pmo: false,
    jobCards: false,
    subcontractors: false,
    subcontractorsWrite: false,
    commissions: false,
    mbdi: false,
    opex: false,
    finance: false,
    inventory: false,
    procurement: false,
    crm: false,
    tasks: false,
    hr: false,
    hrPayroll: false,
    hrRecruitment: false,
    analytics: false,
    support: false,
    admin: false,
    containerAccess: false,
    agricStructures: false,
    poultry: false,
    chat: false,
    tools: false,
} as const satisfies Record<ModuleKey, boolean>

export const DEFAULT_ROLE_PERMISSIONS: PermissionsConfig = {
    ADMIN: { ...ALL_TRUE },
    MANAGER: { ...ALL_TRUE },
    ACCOUNTANT: { ...ALL_TRUE, inventory: false, pmo: false, admin: false },
    SALES: { ...ALL_TRUE, commissions: false, finance: false, subcontractors: false, subcontractorsWrite: false, procurement: false, hrPayroll: false, hrRecruitment: false, admin: false },
    STOREKEEPER: { ...MBDI_ONLY, pmo: true },
    TECHNICAL: { ...ALL_TRUE, commissions: false, finance: false, subcontractors: false, subcontractorsWrite: false, inventory: false, pmo: true, admin: false },
    DIRECTOR: { ...ALL_TRUE, inventory: false, pmo: false, admin: false },
    POULTRY_MANAGER: { ...STAFF_BASE, poultry: true, hr: true },
    FARM_HAND: { ...STAFF_BASE, poultry: true },
    MBDI_STAFF: { ...MBDI_ONLY },
}

/**
 * Merge Firestore overrides onto role defaults.
 * Missing keys in a partial saved config must fall back to defaults — treating
 * undefined as false strips nav/dashboard for roles like ACCOUNTANT.
 *
 * Note: MBDI employee access is per-user (`users/{uid}.modules.mbdi`), not role-matrix.
 * Approvers bypass via `canAccessMbdi`; the matrix `mbdi` flag is informational only.
 */
export function resolveRoleModules(
    role: string,
    config: PermissionsConfig | null | undefined
): Record<ModuleKey, boolean> {
    // STOREKEEPER is the dedicated PMO role. Clamp persisted legacy matrix
    // values too, so an old broad rolePermissions/config cannot restore access.
    if (role === 'STOREKEEPER') {
        return { ...MBDI_ONLY, pmo: true }
    }
    const defaults = DEFAULT_ROLE_PERMISSIONS[role]
    const stored = config?.[role]
    if (role === 'TECHNICAL') {
        return { ...(defaults ?? {}), ...(stored ?? {}), pmo: true } as Record<ModuleKey, boolean>
    }
    if (!defaults && !stored) {
        return Object.fromEntries(
            (Object.keys(MODULES) as ModuleKey[]).map((k) => [k, false])
        ) as Record<ModuleKey, boolean>
    }
    return { ...(defaults ?? {}), ...(stored ?? {}) } as Record<ModuleKey, boolean>
}

/**
 * Effective permissions for a user = union (OR) of every assigned role.
 * Example: TECHNICAL + ACCOUNTANT unlocks finance even though TECHNICAL alone does not.
 * MBDI is left as-is from the role union — callers must also check `canAccessMbdi`.
 */
export function unionRoleModules(
    roles: string[],
    config: PermissionsConfig | null | undefined
): Record<ModuleKey, boolean> {
    const moduleKeys = Object.keys(MODULES) as ModuleKey[]
    const result = Object.fromEntries(moduleKeys.map((k) => [k, false])) as Record<ModuleKey, boolean>

    if (!roles || roles.length === 0) return result
    if (roles.includes('SUPER_ADMIN')) {
        return Object.fromEntries(moduleKeys.map((k) => [k, true])) as Record<ModuleKey, boolean>
    }

    for (const role of roles) {
        const perms = resolveRoleModules(role, config)
        for (const key of moduleKeys) {
            if (perms[key]) result[key] = true
        }
    }
    return result
}
