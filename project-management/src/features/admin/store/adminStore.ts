import { defineStore } from 'pinia'
import { ref, onUnmounted } from 'vue'
import { db, auth } from '@/lib/firebase'
import {
    collection,
    query,
    onSnapshot,
    doc,
    updateDoc,
    setDoc,
    addDoc,
    deleteDoc,
    getDoc,
    serverTimestamp,
    orderBy
} from 'firebase/firestore'
import {
    ref as storageRef,
    uploadBytes,
    getDownloadURL
} from 'firebase/storage'
import { storage } from '@/lib/firebase'
import { toast } from 'vue-sonner'

export const useAdminStore = defineStore('admin', () => {
    const users = ref<any[]>([])
    const departments = ref<any[]>([])
    const productCategories = ref<any[]>([])
    const jobCategories = ref<any[]>([])
    const expenseCategories = ref<any[]>([])
    const cashAccounts = ref<any[]>([])
    const toolsRegistry = ref<any[]>([])
    const appSettings = ref<any>({ logoUrl: '' })
    const loading = ref(false)
    const error = ref<string | null>(null)

    let subscriptions: (() => void)[] = []

    function handleError(err: any, context: string) {
        const message = err.code === 'permission-denied'
            ? 'Missing or insufficient permissions to perform this action.'
            : err.message || 'An unexpected error occurred.'

        error.value = message
        toast.error(`${context} Failed`, { description: message })
        console.error(`[AdminStore] Error in ${context}:`, err)
    }

    function fetchAll() {
        cleanup()

        // Users
        subscriptions.push(onSnapshot(collection(db, 'users'),
            (s) => users.value = s.docs.map(d => ({ id: d.id, ...d.data() })),
            (e) => handleError(e, 'Fetch Users')
        ))

        // Departments
        subscriptions.push(onSnapshot(query(collection(db, 'departments'), orderBy('name')),
            (s) => departments.value = s.docs.map(d => ({ id: d.id, ...d.data() })),
            (e) => handleError(e, 'Fetch Departments')
        ))

        // Product Categories
        subscriptions.push(onSnapshot(query(collection(db, 'categories'), orderBy('name')),
            (s) => productCategories.value = s.docs.map(d => ({ id: d.id, ...d.data() })),
            (e) => handleError(e, 'Fetch Product Categories')
        ))

        // Job Categories
        subscriptions.push(onSnapshot(query(collection(db, 'jobCategories'), orderBy('name')),
            (s) => jobCategories.value = s.docs.map(d => ({ id: d.id, ...d.data() })),
            (e) => handleError(e, 'Fetch Job Categories')
        ))

        // Expense Categories
        subscriptions.push(onSnapshot(query(collection(db, 'expenseCategories'), orderBy('name')),
            (s) => expenseCategories.value = s.docs.map(d => ({ id: d.id, ...d.data() })),
            (e) => handleError(e, 'Fetch Expense Categories')
        ))

        // Cash Accounts
        subscriptions.push(onSnapshot(query(collection(db, 'cashAccounts'), orderBy('name')),
            (s) => cashAccounts.value = s.docs.map(d => ({ id: d.id, ...d.data() })),
            (e) => handleError(e, 'Fetch Cash Accounts')
        ))

        // Tools Registry
        subscriptions.push(onSnapshot(query(collection(db, 'toolsRegistry'), orderBy('name')),
            (s) => toolsRegistry.value = s.docs.map(d => ({ id: d.id, ...d.data() })),
            (e) => handleError(e, 'Fetch Tools Registry')
        ))

        fetchSettings()
    }

    function fetchUsers() {
        subscriptions.push(onSnapshot(collection(db, 'users'),
            (s) => users.value = s.docs.map(d => ({ id: d.id, ...d.data() })),
            (e) => handleError(e, 'Fetch Users')
        ))
    }

    function fetchSettings() {
        if (!auth.currentUser) {
            console.log('[AdminStore] Skipping settings fetch: user not authenticated')
            return
        }
        subscriptions.push(onSnapshot(doc(db, 'appSettings', 'general'),
            (s) => {
                if (s.exists()) {
                    appSettings.value = { id: s.id, ...s.data() }
                }
            },
            (e) => handleError(e, 'Fetch Settings')
        ))
    }

    // User Actions
    async function updateUserRole(userId: string, roles: string[]) {
        try {
            loading.value = true
            const { auth } = await import('@/lib/firebase')
            const token = await auth.currentUser?.getIdToken()

            const res = await fetch(`/api/users/${userId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ roles })
            })

            const data = await res.json()
            if (!res.ok) throw new Error(data.message || 'Failed to update roles')

            toast.success('Roles Updated')
        } catch (e) { handleError(e, 'Update User Role') }
        finally { loading.value = false }
    }

    async function toggleUserStatus(userId: string, isActive: boolean) {
        try {
            loading.value = true
            const { auth } = await import('@/lib/firebase')
            const token = await auth.currentUser?.getIdToken()

            const res = await fetch(`/api/users/${userId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ isActive })
            })

            const data = await res.json()
            if (!res.ok) throw new Error(data.message || 'Failed to update status')

            toast.success(`User ${isActive ? 'Activated' : 'Deactivated'}`)
        } catch (e) { handleError(e, 'Update User Status') }
        finally { loading.value = false }
    }

    // Generic CRUD Action Helper
    async function saveEntity(colName: string, entity: any, context: string) {
        try {
            if (colName === 'users' && entity.id) {
                // Route user profile updates through our secure API
                const { id, ...data } = entity
                const { auth } = await import('@/lib/firebase')
                const token = await auth.currentUser?.getIdToken()

                const res = await fetch(`/api/users/${id}`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(data)
                })

                if (!res.ok) {
                    const errorData = await res.json()
                    throw new Error(errorData.message || `Failed to update ${context}`)
                }
                toast.success(`${context} Updated`)
                return
            }

            if (entity.id) {
                const { id, ...data } = entity
                await updateDoc(doc(db, colName, id), { ...data, updatedAt: serverTimestamp() })
                toast.success(`${context} Updated`)
            } else {
                await addDoc(collection(db, colName), {
                    ...entity,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                })
                toast.success(`${context} Created`)
            }
        } catch (e: any) {
            handleError(e, `Save ${context}`)
            throw e
        }
    }

    async function deleteUser(uid: string) {
        loading.value = true
        try {
            const { auth } = await import('@/lib/firebase')
            const token = await auth.currentUser?.getIdToken()
            if (!token) throw new Error('Not authenticated')

            const res = await fetch(`/api/users/${uid}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.message || 'Failed to delete user')
            }

            toast.success('User Deleted', { description: 'The user account has been permanently removed.' })
        } catch (e) {
            handleError(e, 'Delete User')
            throw e
        } finally {
            loading.value = false
        }
    }

    async function createUserWithPassword(payload: { email: string; name: string; password?: string; roles: string[]; isActive: boolean }) {
        loading.value = true
        try {
            const { auth } = await import('@/lib/firebase')
            const token = await auth.currentUser?.getIdToken()

            if (!token) throw new Error('Not authenticated')

            const res = await fetch('/api/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            })

            const data = await res.json()
            if (!res.ok) throw new Error(data.message || data.error || 'Failed to create user')

            toast.success('User Profile Created Successfully')
        } catch (e) {
            handleError(e, 'Create User with Password')
            throw e
        } finally {
            loading.value = false
        }
    }

    async function deleteEntity(colName: string, id: string, context: string) {
        try {
            await deleteDoc(doc(db, colName, id))
            toast.success(`${context} Deleted`)
        } catch (e) { handleError(e, `Delete ${context}`) }
    }

    async function saveSettings(settings: any) {
        try {
            loading.value = true
            await setDoc(doc(db, 'appSettings', 'general'), {
                ...settings,
                updatedAt: serverTimestamp()
            }, { merge: true })
            toast.success('Settings Saved')
        } catch (e) { handleError(e, 'Save Settings') }
        finally { loading.value = false }
    }

    const fileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = error => reject(error);
        });
    };

    const resizeImage = async (base64Str: string, maxWidth = 800): Promise<string> => {
        return new Promise((resolve) => {
            const img = new Image();
            img.src = base64Str;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/png', 0.8));
            };
            img.onerror = () => resolve(base64Str);
        });
    };

    async function uploadLogo(file: File) {
        try {
            loading.value = true
            const path = `app/logo_${Date.now()}_${file.name}`
            const sRef = storageRef(storage, path)

            const rawBase64 = await fileToBase64(file);
            const logoDataUrl = await resizeImage(rawBase64, 400);

            await uploadBytes(sRef, file)
            const logoUrl = await getDownloadURL(sRef)

            await saveSettings({ logoUrl, logoDataUrl })
            return logoUrl
        } catch (e) {
            handleError(e, 'Logo Upload')
            throw e
        } finally { loading.value = false }
    }

    async function uploadSeal(file: File) {
        try {
            loading.value = true
            const path = `app/seal_${Date.now()}_${file.name}`
            const sRef = storageRef(storage, path)

            const rawBase64 = await fileToBase64(file);
            const sealDataUrl = await resizeImage(rawBase64, 600);

            await uploadBytes(sRef, file)
            const sealUrl = await getDownloadURL(sRef)

            await saveSettings({ sealUrl, sealDataUrl })
            return sealUrl
        } catch (e) {
            handleError(e, 'Seal Upload')
            throw e
        } finally { loading.value = false }
    }

    async function uploadManagerSignature(file: File) {
        try {
            loading.value = true
            const path = `app/mgrsig_${Date.now()}_${file.name}`
            const sRef = storageRef(storage, path)

            const rawBase64 = await fileToBase64(file);
            const managerSignatureDataUrl = await resizeImage(rawBase64, 600);

            await uploadBytes(sRef, file)
            const managerSignatureUrl = await getDownloadURL(sRef)

            await saveSettings({ managerSignatureUrl, managerSignatureDataUrl })
            return managerSignatureUrl
        } catch (e) {
            handleError(e, 'Manager Signature Upload')
            throw e
        } finally { loading.value = false }
    }

    async function uploadSeal2(file: File) {
        try {
            loading.value = true
            const path = `app/seal2_${Date.now()}_${file.name}`
            const sRef = storageRef(storage, path)

            const rawBase64 = await fileToBase64(file);
            const sealUrl2DataUrl = await resizeImage(rawBase64, 600);

            await uploadBytes(sRef, file)
            const sealUrl2 = await getDownloadURL(sRef)

            await saveSettings({ sealUrl2, sealUrl2DataUrl })
            return sealUrl2
        } catch (e) {
            handleError(e, 'Secondary Seal Upload')
            throw e
        } finally { loading.value = false }
    }

    function cleanup() {
        subscriptions.forEach(unsub => unsub())
        subscriptions = []
    }

    return {
        users,
        departments,
        productCategories,
        jobCategories,
        expenseCategories,
        cashAccounts,
        toolsRegistry,
        appSettings,
        loading,
        error,
        fetchAll,
        fetchUsers,
        fetchSettings,
        updateUserRole,
        toggleUserStatus,
        saveEntity,
        createUserWithPassword,
        deleteUser,
        deleteEntity,
        saveSettings,
        uploadLogo,
        uploadSeal,
        uploadSeal2,
        uploadManagerSignature,
        cleanup
    }
})
