import { create } from 'zustand';
import { Task } from '@/types';
import { db, auth } from '../lib/firebase';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { Unsubscribe } from 'firebase/firestore';

interface TasksState {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  unsubscribe: Unsubscribe | null;
  setTasks: (tasks: Task[]) => void;
  addTask: (task: Task) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  updateTaskStatus: (id: string, status: Task['status']) => void;
  subscribeToTasks: (userId: string) => () => void;
}

export const useTasksStore = create<TasksState>((set, get) => ({
  tasks: [],
  loading: false,
  error: null,
  unsubscribe: null,
  setTasks: (tasks) => set({ tasks }),
  addTask: (task) => set((state) => ({ tasks: [...state.tasks, task] })),
  updateTask: (id, updates) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),
  deleteTask: (id) =>
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
    })),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  updateTaskStatus: (id, status) =>
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              status,
              updatedAt: new Date(),
              completedAt: status === 'completed' ? new Date() : t.completedAt,
            }
          : t
      ),
    })),
  subscribeToTasks: (userId) => {
    // Unsubscribe from previous listener if exists
    const { unsubscribe } = get();
    if (unsubscribe) {
      unsubscribe();
    }

    if (!auth.currentUser) {
      console.warn('User not authenticated, skipping tasks subscription');
      return () => {};
    }

    set({ loading: true });

    // Query tasks assigned to the current user
    const q = query(
      collection(db, 'projectTasks'),
      where('assignedTo', '==', userId),
      orderBy('createdAt', 'desc')
    );

    const newUnsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const tasksData: Task[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate() || new Date(),
          updatedAt: doc.data().updatedAt?.toDate() || new Date(),
          completedAt: doc.data().completedAt?.toDate() || undefined,
          dueDate: doc.data().dueDate?.toDate() || undefined,
        })) as Task[];

        set({ tasks: tasksData, loading: false, error: null });
      },
      (error) => {
        console.error('Error subscribing to tasks:', error);
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
