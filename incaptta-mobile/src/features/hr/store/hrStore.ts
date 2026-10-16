import { defineStore } from 'pinia'
import { ref, computed, onUnmounted } from 'vue'
import { db } from '@/lib/firebase'
import { 
  collection, query, onSnapshot, addDoc, doc, updateDoc, 
  serverTimestamp, orderBy, where, getDocs, limit, getDoc
} from 'firebase/firestore'
import type { Employee, Attendance, Payslip } from '../types'

export const useHrStore = defineStore('hr', () => {
  const employees = ref<Employee[]>([])
  const attendanceRecords = ref<Attendance[]>([])
  const payslips = ref<Payslip[]>([])
  const loading = ref(false)
  const currentEmployee = ref<Employee | null>(null)
  const error = ref<string | null>(null)

  let unsubEmployees: (() => void) | null = null
  let unsubAttendance: (() => void) | null = null
  let unsubPayroll: (() => void) | null = null

  const activeEmployees = computed(() =>
    employees.value.filter(e => e.status === 'Active' || e.status === 'ACTIVE')
  )

  const todayAttendance = computed(() => {
    const today = new Date().toISOString().split('T')[0]
    return attendanceRecords.value.filter(a => {
      const dateStr = a.date instanceof Date 
        ? a.date.toISOString().split('T')[0] 
        : (a.date as any)?.toDate?.()?.toISOString().split('T')[0] || a.date
      return dateStr === today
    })
  })

  const fetchEmployees = () => {
    loading.value = true
    const q = query(collection(db, 'employees'), orderBy('fullName', 'asc'))
    unsubEmployees = onSnapshot(q, (snapshot) => {
      employees.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Employee[]
      loading.value = false
    })
  }

  const fetchAttendance = () => {
    const q = query(collection(db, 'attendance'), orderBy('date', 'desc'), limit(100))
    unsubAttendance = onSnapshot(q, (snapshot) => {
      attendanceRecords.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Attendance[]
    })
  }

  const fetchPayslips = () => {
    const q = query(collection(db, 'payroll'), orderBy('generatedAt', 'desc'))
    unsubPayroll = onSnapshot(q, (snapshot) => {
      payslips.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Payslip[]
    })
  }

  const setCurrentEmployee = (employee: Employee | null) => {
    currentEmployee.value = employee
  }

  const clockIn = async (employeeId: string, employeeName: string, location?: string) => {
    try {
      const payload = {
        employeeId,
        employeeName,
        date: new Date().toISOString().split('T')[0],
        clockInTime: serverTimestamp(),
        location: location || 'Mobile App',
        status: 'IN',
        createdAt: serverTimestamp()
      }
      await addDoc(collection(db, 'attendance'), payload)
    } catch (err) {
      console.error('[HrStore] Clock-in error:', err)
      throw err
    }
  }

  const clockOut = async (attendanceId: string) => {
    try {
      const docRef = doc(db, 'attendance', attendanceId)
      await updateDoc(docRef, {
        clockOutTime: serverTimestamp(),
        status: 'OUT',
        updatedAt: serverTimestamp()
      })
    } catch (err) {
      console.error('[HrStore] Clock-out error:', err)
      throw err
    }
  }

  const createEmployee = async (data: Partial<Employee>, userId: string, userEmail: string) => {
    try {
      const payload = {
        ...data,
        status: 'Active',
        contractType: 'Full-Time',
        createdBy: userId,
        createdByEmail: userEmail,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }
      const docRef = await addDoc(collection(db, 'employees'), payload)
      return docRef.id
    } catch (err) {
      console.error('[HrStore] Error creating employee:', err)
      throw err
    }
  }

  const updateEmployee = async (id: string, updates: Partial<Employee>) => {
    try {
      const docRef = doc(db, 'employees', id)
      await updateDoc(docRef, {
        ...updates,
        updatedAt: serverTimestamp()
      })
    } catch (err) {
      console.error('[HrStore] Error updating employee:', err)
      throw err
    }
  }

  const fetchPayslipById = async (id: string) => {
    try {
      const docRef = doc(db, 'payroll', id)
      const snap = await getDoc(docRef)
      if (snap.exists()) {
        return { id: snap.id, ...snap.data() } as Payslip
      }
      return null
    } catch (err) {
      console.error('[HrStore] Error fetching payslip:', err)
      throw err
    }
  }

  const cleanup = () => {
    unsubEmployees?.()
    unsubAttendance?.()
    unsubPayroll?.()
  }

  onUnmounted(cleanup)

  return {
    employees,
    attendanceRecords,
    payslips,
    loading,
    error,
    currentEmployee,
    activeEmployees,
    todayAttendance,
    fetchEmployees,
    fetchAttendance,
    fetchPayslips,
    setCurrentEmployee,
    clockIn,
    clockOut,
    createEmployee,
    updateEmployee,
    fetchPayslipById,
    cleanup
  }
})
