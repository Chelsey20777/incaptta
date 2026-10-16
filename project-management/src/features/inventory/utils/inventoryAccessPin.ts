import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

const INVENTORY_MANAGER_PIN_HASH_FIELD = 'inventoryManagerPinHash'
const SETTINGS_MANAGER_PIN_HASH_FIELD = 'settingsManagerPinHash'

function getUnlockStorageKey(uid: string) {
  return `inventory-manager-unlock:${uid}`
}

export function isManagerInventoryPinUnlocked(uid?: string | null) {
  if (!uid) return false
  return window.sessionStorage.getItem(getUnlockStorageKey(uid)) === 'granted'
}

export function grantManagerInventoryPinAccess(uid?: string | null) {
  if (!uid) return
  window.sessionStorage.setItem(getUnlockStorageKey(uid), 'granted')
}

export function clearManagerInventoryPinAccess(uid?: string | null) {
  if (!uid) return
  window.sessionStorage.removeItem(getUnlockStorageKey(uid))
}

export async function getInventoryManagerPinHash() {
  const settingsSnap = await getDoc(doc(db, 'appSettings', 'general'))
  if (!settingsSnap.exists()) return ''
  const data = settingsSnap.data()
  return String(data?.[INVENTORY_MANAGER_PIN_HASH_FIELD] || '')
}

export async function isInventoryManagerPinEnabled() {
  const pinHash = await getInventoryManagerPinHash()
  return !!pinHash
}

export async function hashInventoryPin(pin: string) {
  const normalized = pin.trim()
  const buffer = await window.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(normalized)
  )

  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function verifyInventoryManagerPin(pin: string) {
  const [savedHash, providedHash] = await Promise.all([
    getInventoryManagerPinHash(),
    hashInventoryPin(pin)
  ])

  return !!savedHash && savedHash === providedHash
}

function getSettingsUnlockStorageKey(uid: string) {
  return `settings-manager-unlock:${uid}`
}

export function isManagerSettingsPinUnlocked(uid?: string | null) {
  if (!uid) return false
  return window.sessionStorage.getItem(getSettingsUnlockStorageKey(uid)) === 'granted'
}

export function grantManagerSettingsPinAccess(uid?: string | null) {
  if (!uid) return
  window.sessionStorage.setItem(getSettingsUnlockStorageKey(uid), 'granted')
}

export function clearManagerSettingsPinAccess(uid?: string | null) {
  if (!uid) return
  window.sessionStorage.removeItem(getSettingsUnlockStorageKey(uid))
}

export async function getSettingsManagerPinHash() {
  const settingsSnap = await getDoc(doc(db, 'appSettings', 'general'))
  if (!settingsSnap.exists()) return ''
  const data = settingsSnap.data()
  return String(data?.[SETTINGS_MANAGER_PIN_HASH_FIELD] || '')
}

export async function isSettingsManagerPinEnabled() {
  const pinHash = await getSettingsManagerPinHash()
  return !!pinHash
}

export async function verifySettingsManagerPin(pin: string) {
  const [savedHash, providedHash] = await Promise.all([
    getSettingsManagerPinHash(),
    hashInventoryPin(pin)
  ])

  return !!savedHash && savedHash === providedHash
}
