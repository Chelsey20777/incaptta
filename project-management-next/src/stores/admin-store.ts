'use client'

import { create } from 'zustand'
import { db, storage, auth } from '@/lib/firebase'
import { 
  doc, 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  setDoc, 
  addDoc,
  deleteDoc,
  updateDoc,
  serverTimestamp 
} from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { toast } from 'sonner'
import {
  autoLinkByEmail,
  backfillLinksByEmail,
  linkPair,
  unlinkPair,
} from '@/lib/user-employee-link'

interface AppSettings {
  logoUrl?: string
  logoDataUrl?: string
  faviconUrl?: string
  faviconDataUrl?: string
  sealUrl?: string
  sealDataUrl?: string
  managerSignatureUrl?: string
  managerSignatureDataUrl?: string
  sealUrl2?: string
  sealUrl2DataUrl?: string
  backgroundImageUrl?: string
  backgroundImages?: { url: string; name: string; uploadedAt: string }[]
  defaultBackgroundUrl?: string
  backgroundOpacity?: number
  uiColors?: Record<string, string>
  vatEnabled?: boolean
  vatRate?: number
  businessCalendar?: {
    timezone?: string
    weekdays?: number[]
    openHour?: number
    closeHour?: number
    holidays?: string[]
    firstResponseHours?: number
    reminderMinutes?: number
    escalationHours?: number
  }
  billingTerms?: {
    arrangement?: 'FULL_UPFRONT' | 'DEPOSIT_BALANCE' | 'MILESTONES' | 'CREDIT'
    netDays?: number
    depositPercent?: number
  }
  jobOps?: {
    blockUnpaidJobClose?: boolean
    allowReopenClosedEnquiries?: boolean
  }
  storePolicies?: {
    actingStorekeeperUid?: string
    reservationExpiryHours?: number
    allowNegativeStock?: boolean
    adjustmentApproverRole?: 'ADMIN' | 'MANAGER'
  }
  /** PDF header logo max width in mm */
  pdfLogoMaxWidthMm?: number
  /** PDF header logo max height in mm */
  pdfLogoMaxHeightMm?: number
  [key: string]: unknown
}

interface NewUserData {
  name: string
  email: string
  password?: string
  roles: string[]
  isActive: boolean
  employeeId?: string | null
}

export interface UserSessionDevice {
  sessionId: string
  deviceName: string
  userAgent: string
  ip: string
  locationLabel: string
  app: string
  createdAt: number | null
  lastSeenAt: number | null
  revokedAt: number | null
  isActive: boolean
}

interface AdminState {
  users: any[]
  departments: any[]
  productCategories: any[]
  inventoryCategories: any[]
  jobCategories: any[]
  expenseCategories: any[]
  cashAccounts: any[]
  toolsRegistry: any[]
  appSettings: AppSettings
  loading: boolean
  error: string | null
  
  subscriptions: (() => void)[]
  
  fetchSettings: (uid: string) => () => void
  fetchAll: () => () => void
  /** Departments + expense categories only — safe for OPEX create without finance-gated collections. */
  fetchOpexLookups: () => () => void
  saveSettings: (settings: Partial<AppSettings>, silent?: boolean) => Promise<void>
  cleanup: () => void
  
  // Entity CRUD
  addEntity: (collectionName: string, data: Record<string, unknown>, label: string) => Promise<void>
  updateEntity: (collectionName: string, id: string, data: Record<string, unknown>, label: string) => Promise<void>
  deleteEntity: (collectionName: string, id: string, label: string) => Promise<void>
  
  // User management
  updateUserProfile: (userId: string, data: { name?: string }) => Promise<void>
  updateUserRole: (userId: string, roles: string[]) => Promise<void>
  updateUserModules: (userId: string, modules: { mbdi?: boolean }) => Promise<void>
  toggleUserStatus: (userId: string, isActive: boolean) => Promise<void>
  createUserWithPassword: (data: NewUserData) => Promise<string | undefined>
  deleteUser: (uid: string) => Promise<void>
  linkUserToEmployee: (userId: string, employeeId: string | null) => Promise<void>
  unlinkUserFromEmployee: (userId: string) => Promise<void>
  backfillUserEmployeeLinks: (employees: Array<{ id: string; email?: string; userId?: string | null }>) => Promise<void>
  fetchUserSessions: (userId: string) => Promise<UserSessionDevice[]>
  revokeUserSessions: (userId: string) => Promise<void>
  
  // File uploads
  uploadFileToStorage: (collectionName: string, file: File) => Promise<string>
  uploadLogo: (file: File) => Promise<string>
  uploadFavicon: (file: File) => Promise<string>
  uploadSeal: (file: File) => Promise<string>
  uploadSeal2: (file: File) => Promise<string>
  uploadManagerSignature: (file: File) => Promise<string>
  uploadBackgroundImage: (file: File) => Promise<string>
  addBackgroundImage: (file: File) => Promise<string>
  removeBackgroundImage: (url: string) => Promise<void>
  setDefaultBackground: (url: string) => Promise<void>
}

export const useAdminStore = create<AdminState>((set, get) => ({
  users: [],
  departments: [],
  productCategories: [],
  inventoryCategories: [],
  jobCategories: [],
  expenseCategories: [],
  cashAccounts: [],
  toolsRegistry: [],
  appSettings: { logoUrl: '' },
  loading: false,
  error: null,
  subscriptions: [],

  fetchSettings: (uid) => {
    if (!uid) return () => {}
    const unsub = onSnapshot(doc(db, 'appSettings', 'general'), 
      (snap) => {
        if (snap.exists()) {
          set({ appSettings: { id: snap.id, ...snap.data() } })
        }
      },
      (err) => {
        console.error('[AdminStore] Fetch Settings failed:', err)
        set({ error: err.message })
      }
    )
    set((state) => ({ subscriptions: [...state.subscriptions, unsub] }))
    return unsub
  },

  fetchAll: () => {
    // Clean up any existing subscriptions first
    get().cleanup()

    const subs: (() => void)[] = []

    const handleError = (err: any, context: string) => {
      const message = err.code === 'permission-denied'
        ? 'Missing or insufficient permissions to perform this action.'
        : err.message || 'An unexpected error occurred.'
      set({ error: message })
      toast.error(`${context} Failed: ${message}`)
      console.error(`[AdminStore] Error in ${context}:`, err)
    }

    // Users
    subs.push(
      onSnapshot(collection(db, 'users'),
        (s) => set({ users: s.docs.map(d => ({ id: d.id, ...d.data() })) }),
        (e) => handleError(e, 'Fetch Users')
      )
    )

    // Departments
    subs.push(
      onSnapshot(query(collection(db, 'departments'), orderBy('name')),
        (s) => set({ departments: s.docs.map(d => ({ id: d.id, ...d.data() })) }),
        (e) => handleError(e, 'Fetch Departments')
      )
    )

    // Product Categories
    subs.push(
      onSnapshot(query(collection(db, 'categories'), orderBy('name')),
        (s) => set({ productCategories: s.docs.map(d => ({ id: d.id, ...d.data() })) }),
        (e) => handleError(e, 'Fetch Product Categories')
      )
    )

    // Inventory Categories
    subs.push(
      onSnapshot(query(collection(db, 'inventoryCategories'), orderBy('name')),
        (s) => set({ inventoryCategories: s.docs.map(d => ({ id: d.id, ...d.data() })) }),
        (e) => handleError(e, 'Fetch Inventory Categories')
      )
    )

    // Job Categories
    subs.push(
      onSnapshot(query(collection(db, 'jobCategories'), orderBy('name')),
        (s) => set({ jobCategories: s.docs.map(d => ({ id: d.id, ...d.data() })) }),
        (e) => handleError(e, 'Fetch Job Categories')
      )
    )

    // Expense Categories
    subs.push(
      onSnapshot(query(collection(db, 'expenseCategories'), orderBy('name')),
        (s) => set({ expenseCategories: s.docs.map(d => ({ id: d.id, ...d.data() })) }),
        (e) => handleError(e, 'Fetch Expense Categories')
      )
    )

    // Cash Accounts
    subs.push(
      onSnapshot(query(collection(db, 'cashAccounts'), orderBy('name')),
        (s) => set({ cashAccounts: s.docs.map(d => ({ id: d.id, ...d.data() })) }),
        (e) => handleError(e, 'Fetch Cash Accounts')
      )
    )

    // Tools Registry
    subs.push(
      onSnapshot(query(collection(db, 'toolsRegistry'), orderBy('name')),
        (s) => set({ toolsRegistry: s.docs.map(d => ({ id: d.id, ...d.data() })) }),
        (e) => handleError(e, 'Fetch Tools Registry')
      )
    )

    // App Settings
    subs.push(
      onSnapshot(doc(db, 'appSettings', 'general'),
        (snap) => {
          if (snap.exists()) {
            set({ appSettings: { id: snap.id, ...snap.data() } })
          }
        },
        (e) => handleError(e, 'Fetch Settings')
      )
    )

    set({ subscriptions: subs })

    return () => {
      subs.forEach(unsub => unsub())
      set({ subscriptions: [] })
    }
  },

  fetchOpexLookups: () => {
    get().cleanup()

    const subs: (() => void)[] = []

    const handleError = (err: any, context: string) => {
      const message = err.code === 'permission-denied'
        ? 'Missing or insufficient permissions to perform this action.'
        : err.message || 'An unexpected error occurred.'
      set({ error: message })
      toast.error(`${context} Failed: ${message}`)
      console.error(`[AdminStore] Error in ${context}:`, err)
    }

    set({ loading: true })

    subs.push(
      onSnapshot(query(collection(db, 'departments'), orderBy('name')),
        (s) => set({ departments: s.docs.map(d => ({ id: d.id, ...d.data() })), loading: false }),
        (e) => {
          set({ loading: false })
          handleError(e, 'Fetch Departments')
        }
      )
    )

    subs.push(
      onSnapshot(query(collection(db, 'expenseCategories'), orderBy('name')),
        (s) => set({ expenseCategories: s.docs.map(d => ({ id: d.id, ...d.data() })) }),
        (e) => handleError(e, 'Fetch Expense Categories')
      )
    )

    set({ subscriptions: subs })

    return () => {
      subs.forEach(unsub => unsub())
      set({ subscriptions: [] })
    }
  },

  saveSettings: async (settings, silent) => {
    set({ loading: true, error: null })
    try {
      await setDoc(doc(db, 'appSettings', 'general'), {
        ...settings,
        updatedAt: serverTimestamp()
      }, { merge: true })
      if (!silent) {
        toast.success('Settings saved successfully')
      }
    } catch (err: any) {
      console.error('[AdminStore] Save Settings failed:', err)
      set({ error: err.message })
      toast.error(`Save Failed: ${err.message}`)
      throw err
    } finally {
      set({ loading: false })
    }
  },

  cleanup: () => {
    get().subscriptions.forEach(unsub => unsub())
    set({ subscriptions: [] })
  },

  // Entity CRUD operations
  addEntity: async (collectionName, data, label) => {
    set({ loading: true, error: null })
    try {
      if (collectionName === 'expenseCategories') {
        const rawName = String(data.name || '').trim()
        const normalizedName = rawName.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
        if (!normalizedName) throw new Error('Category name cannot be empty')
        
        const docRef = doc(db, collectionName, normalizedName)
        await setDoc(docRef, {
          name: normalizedName,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        })
      } else {
        const docRef = collection(db, collectionName)
        await addDoc(docRef, {
          ...data,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        })
      }
      toast.success(`${label} added successfully`)
    } catch (err: any) {
      const message = err.code === 'permission-denied'
        ? 'Missing or insufficient permissions.'
        : err.message || 'An unexpected error occurred.'
      set({ error: message })
      toast.error(`Add ${label} Failed: ${message}`)
      throw err
    } finally {
      set({ loading: false })
    }
  },

  updateEntity: async (collectionName, id, data, label) => {
    set({ loading: true, error: null })
    try {
      if (collectionName === 'expenseCategories') {
        const rawName = String(data.name || '').trim()
        const normalizedName = rawName.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
        if (!normalizedName) throw new Error('Category name cannot be empty')

        if (id !== normalizedName) {
          const oldDocRef = doc(db, collectionName, id)
          await deleteDoc(oldDocRef)
          const newDocRef = doc(db, collectionName, normalizedName)
          await setDoc(newDocRef, {
            name: normalizedName,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          })
        } else {
          const docRef = doc(db, collectionName, id)
          await updateDoc(docRef, {
            name: normalizedName,
            updatedAt: serverTimestamp()
          })
        }
      } else {
        const docRef = doc(db, collectionName, id)
        await updateDoc(docRef, {
          ...data,
          updatedAt: serverTimestamp()
        })
      }
      toast.success(`${label} updated successfully`)
    } catch (err: any) {
      const message = err.code === 'permission-denied'
        ? 'Missing or insufficient permissions.'
        : err.message || 'An unexpected error occurred.'
      set({ error: message })
      toast.error(`Update ${label} Failed: ${message}`)
      throw err
    } finally {
      set({ loading: false })
    }
  },

  deleteEntity: async (collectionName, id, label) => {
    set({ loading: true, error: null })
    try {
      const docRef = doc(db, collectionName, id)
      await deleteDoc(docRef)
      toast.success(`${label} deleted successfully`)
    } catch (err: any) {
      const message = err.code === 'permission-denied'
        ? 'Missing or insufficient permissions.'
        : err.message || 'An unexpected error occurred.'
      set({ error: message })
      toast.error(`Delete ${label} Failed: ${message}`)
      throw err
    } finally {
      set({ loading: false })
    }
  },

  // User management
  updateUserProfile: async (userId, data) => {
    set({ loading: true, error: null })
    try {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(data)
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.message || errData.error || `Request failed with status ${res.status}`)
      }
      toast.success('User profile updated successfully')
    } catch (err: any) {
      set({ error: err.message })
      toast.error(`Update Profile Failed: ${err.message}`)
      throw err
    } finally {
      set({ loading: false })
    }
  },

  updateUserRole: async (userId, roles) => {
    set({ loading: true, error: null })
    try {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ roles })
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.message || errData.error || `Request failed with status ${res.status}`)
      }
      toast.success('User roles updated successfully')
    } catch (err: any) {
      set({ error: err.message })
      toast.error(`Update Roles Failed: ${err.message}`)
      throw err
    } finally {
      set({ loading: false })
    }
  },

  updateUserModules: async (userId, modules) => {
    set({ loading: true, error: null })
    try {
      const token = await auth.currentUser?.getIdToken()
      // Local Next route (not Cloud Functions) so grants work without CF redeploy.
      const res = await fetch('/api/super/user-mbdi', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ userId, mbdi: modules.mbdi === true })
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.message || errData.error || `Request failed with status ${res.status}`)
      }
      toast.success('MBDI access updated')
    } catch (err: any) {
      set({ error: err.message })
      toast.error(`Update modules failed: ${err.message}`)
      throw err
    } finally {
      set({ loading: false })
    }
  },

  toggleUserStatus: async (userId, isActive) => {
    set({ loading: true, error: null })
    try {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ isActive })
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.message || errData.error || `Request failed with status ${res.status}`)
      }
      toast.success(`User ${isActive ? 'activated' : 'deactivated'} successfully`)
    } catch (err: any) {
      set({ error: err.message })
      toast.error(`Toggle Status Failed: ${err.message}`)
      throw err
    } finally {
      set({ loading: false })
    }
  },

  createUserWithPassword: async (data) => {
    set({ loading: true, error: null })
    try {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: data.name,
          email: data.email,
          password: data.password,
          roles: data.roles,
          isActive: data.isActive,
          employeeId: data.employeeId ?? null,
        })
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || errData.message || `Request failed with status ${res.status}`)
      }
      const created = await res.json().catch(() => null)
      const uid = created?.uid as string | undefined
      // Client-side safety net if API has not been redeployed with employee linking yet
      if (uid && !created?.employeeId && data.email) {
        if (data.employeeId) {
          await linkPair({ userId: uid, employeeId: data.employeeId })
        } else {
          await autoLinkByEmail({ email: data.email, userId: uid })
        }
      }
      toast.success('User created successfully')
      return uid
    } catch (err: any) {
      set({ error: err.message })
      toast.error(`Create User Failed: ${err.message}`)
      throw err
    } finally {
      set({ loading: false })
    }
  },

  deleteUser: async (uid) => {
    set({ loading: true, error: null })
    try {
      try {
        await unlinkPair({ userId: uid })
      } catch {
        // Best-effort unlink before delete
      }
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch(`/api/users/${uid}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Request failed with status ${res.status}`)
      }
      toast.success('User deleted successfully')
    } catch (err: any) {
      set({ error: err.message })
      toast.error(`Delete User Failed: ${err.message}`)
      throw err
    } finally {
      set({ loading: false })
    }
  },

  linkUserToEmployee: async (userId, employeeId) => {
    try {
      if (!employeeId) {
        await unlinkPair({ userId })
        toast.success('User unlinked from HR employee')
        return
      }
      await linkPair({ userId, employeeId })
      toast.success('User linked to HR employee')
    } catch (err: any) {
      toast.error(err?.message || 'Failed to link')
      throw err
    }
  },

  unlinkUserFromEmployee: async (userId) => {
    try {
      await unlinkPair({ userId })
      toast.success('User unlinked from HR employee')
    } catch (err: any) {
      toast.error(err?.message || 'Failed to unlink')
      throw err
    }
  },

  fetchUserSessions: async (userId) => {
    const token = await auth.currentUser?.getIdToken()
    const res = await fetch(`/api/sessions/${userId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.message || errData.error || `Request failed with status ${res.status}`)
    }
    const data = await res.json()
    return (data.sessions || []) as UserSessionDevice[]
  },

  revokeUserSessions: async (userId) => {
    set({ loading: true, error: null })
    try {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch(`/api/sessions/${userId}/revoke`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.message || errData.error || `Request failed with status ${res.status}`)
      }
      toast.success('Forced logout on all devices')
    } catch (err: any) {
      set({ error: err.message })
      toast.error(`Force logout failed: ${err.message}`)
      throw err
    } finally {
      set({ loading: false })
    }
  },

  backfillUserEmployeeLinks: async (employees) => {
    set({ loading: true, error: null })
    try {
      const users = get().users.map((u: any) => ({
        id: u.id,
        email: u.email,
        employeeId: u.employeeId ?? null,
      }))
      const result = await backfillLinksByEmail(users, employees)
      toast.success(
        `Linked ${result.linked} pair(s). Already linked: ${result.skippedAlreadyLinked}. Skipped conflicts: ${result.skippedConflicts}.`
      )
    } catch (err: any) {
      set({ error: err.message })
      toast.error(`Backfill failed: ${err.message}`)
      throw err
    } finally {
      set({ loading: false })
    }
  },

  // File uploads
  uploadFileToStorage: async (collection, file) => {
    set({ loading: true, error: null })
    try {
      const ext = file.name.split('.').pop() || 'png'
      const path = `${collection}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`
      const fileRef = storageRef(storage, path)
      const snapshot = await uploadBytes(fileRef, file)
      const downloadUrl = await getDownloadURL(snapshot.ref)
      return downloadUrl
    } catch (err: any) {
      set({ error: err.message })
      toast.error(`Upload Failed: ${err.message}`)
      throw err
    } finally {
      set({ loading: false })
    }
  },

  uploadLogo: async (file: File) => {
    const url = await get().uploadFileToStorage('logos', file)
    let logoDataUrl = ''
    try {
      logoDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
    } catch (e) {
      console.warn('Failed to convert logo to data URL:', e)
    }
    const updateData: Partial<AppSettings> = { logoUrl: url }
    if (logoDataUrl) {
      updateData.logoDataUrl = logoDataUrl
    }
    await get().saveSettings(updateData, true)
    toast.success('Logo uploaded successfully')
    return url
  },

  uploadFavicon: async (file: File) => {
    const url = await get().uploadFileToStorage('favicons', file)
    let faviconDataUrl = ''
    try {
      faviconDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
    } catch (e) {
      console.warn('Failed to convert favicon to data URL:', e)
    }
    const updateData: Partial<AppSettings> = { faviconUrl: url }
    if (faviconDataUrl) {
      updateData.faviconDataUrl = faviconDataUrl
    }
    await get().saveSettings(updateData, true)
    toast.success('Favicon uploaded successfully')
    return url
  },

  uploadSeal: async (file: File) => {
    const url = await get().uploadFileToStorage('seals', file)
    await get().saveSettings({ sealUrl: url }, true)
    toast.success('Primary company seal uploaded successfully')
    return url
  },

  uploadSeal2: async (file: File) => {
    const url = await get().uploadFileToStorage('seals', file)
    await get().saveSettings({ sealUrl2: url }, true)
    toast.success('Secondary company seal uploaded successfully')
    return url
  },

  uploadManagerSignature: async (file: File) => {
    const url = await get().uploadFileToStorage('signatures', file)
    await get().saveSettings({ managerSignatureUrl: url }, true)
    toast.success('Manager signature uploaded successfully')
    return url
  },

  uploadBackgroundImage: async (file: File) => {
    const url = await get().uploadFileToStorage('backgrounds', file)
    await get().saveSettings({ backgroundImageUrl: url }, true)
    toast.success('Background image uploaded successfully')
    return url
  },

  addBackgroundImage: async (file: File) => {
    const url = await get().uploadFileToStorage('backgrounds', file)
    const current = get().appSettings?.backgroundImages || []
    const newEntry = {
      url,
      name: file.name || 'Background Image',
      uploadedAt: new Date().toISOString()
    }
    const updated = [newEntry, ...current]
    await get().saveSettings({ backgroundImages: updated }, true)
    toast.success('Background image added to gallery')
    return url
  },

  removeBackgroundImage: async (url: string) => {
    const current = get().appSettings?.backgroundImages || []
    const updated = current.filter(img => img.url !== url)
    const updates: Partial<AppSettings> = { backgroundImages: updated }
    if (get().appSettings?.defaultBackgroundUrl === url) {
      updates.defaultBackgroundUrl = ''
    }
    await get().saveSettings(updates, true)
    toast.success('Background image removed')
  },

  setDefaultBackground: async (url: string) => {
    await get().saveSettings({ defaultBackgroundUrl: url }, true)
    toast.success(url ? 'Default background updated' : 'Default background cleared')
  }
}))
