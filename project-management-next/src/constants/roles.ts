export const USER_ROLES = {
    SUPER_ADMIN: 'SUPER_ADMIN',
    ADMIN: 'ADMIN',
    MANAGER: 'MANAGER',
    ACCOUNTANT: 'ACCOUNTANT',
    SALES: 'SALES',
    STOREKEEPER: 'STOREKEEPER',
    TECHNICAL: 'TECHNICAL',
    DIRECTOR: 'DIRECTOR',
    POULTRY_MANAGER: 'POULTRY_MANAGER',
    FARM_HAND: 'FARM_HAND',
    MBDI_STAFF: 'MBDI_STAFF',
} as const;

export type UserRole = keyof typeof USER_ROLES;

export const ROLE_LABELS: Record<UserRole, string> = {
    SUPER_ADMIN: 'Super Admin',
    ADMIN: 'Administrator',
    MANAGER: 'Manager',
    ACCOUNTANT: 'Accountant',
    SALES: 'Sales Representative',
    STOREKEEPER: 'Property Manager Officer (PMO)',
    TECHNICAL: 'Technical',
    DIRECTOR: 'Director',
    POULTRY_MANAGER: 'Poultry Manager',
    FARM_HAND: 'Farm Hand',
    MBDI_STAFF: 'MBDI Staff',
};
