import { create } from 'zustand';
import { Employee } from '@/types';
import { db, auth } from '../lib/firebase';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { Unsubscribe } from 'firebase/firestore';

interface HRState {
  employees: Employee[];
  loading: boolean;
  error: string | null;
  unsubscribe: Unsubscribe | null;
  setEmployees: (employees: Employee[]) => void;
  addEmployee: (employee: Employee) => void;
  updateEmployee: (id: string, updates: Partial<Employee>) => void;
  deleteEmployee: (id: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  subscribeToEmployees: () => () => void;
}

export const useHRStore = create<HRState>((set, get) => ({
  employees: [],
  loading: false,
  error: null,
  unsubscribe: null,
  setEmployees: (employees) => set({ employees }),
  addEmployee: (employee) => set((state) => ({ employees: [...state.employees, employee] })),
  updateEmployee: (id, updates) =>
    set((state) => ({
      employees: state.employees.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    })),
  deleteEmployee: (id) =>
    set((state) => ({
      employees: state.employees.filter((e) => e.id !== id),
    })),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  subscribeToEmployees: () => {
    // Unsubscribe from previous listener if exists
    const { unsubscribe } = get();
    if (unsubscribe) {
      unsubscribe();
    }

    if (!auth.currentUser) {
      console.warn('User not authenticated, skipping employees subscription');
      return () => {};
    }

    set({ loading: true });

    const q = query(collection(db, 'employees'), orderBy('name', 'asc'));

    const newUnsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const employeesData: Employee[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate() || new Date(),
          updatedAt: doc.data().updatedAt?.toDate() || new Date(),
        })) as Employee[];

        set({ employees: employeesData, loading: false, error: null });
      },
      (error) => {
        console.error('Error subscribing to employees:', error);
        set({ error: error.message, loading: false });
      }
    );

    set({ unsubscribe: newUnsubscribe });

    // Return cleanup function
    return () => {
      newUnsubscribe();
    };
  },
}));
