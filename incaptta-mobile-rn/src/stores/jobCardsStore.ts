import { create } from 'zustand';
import { JobCard, ApprovalStatus } from '@/types';
import { db, auth } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { Unsubscribe } from 'firebase/firestore';

interface JobCardsState {
  jobCards: JobCard[];
  loading: boolean;
  error: string | null;
  unsubscribe: Unsubscribe | null;
  setJobCards: (jobCards: JobCard[]) => void;
  addJobCard: (jobCard: JobCard) => void;
  updateJobCard: (id: string, updates: Partial<JobCard>) => void;
  deleteJobCard: (id: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  updateJobCardStatus: (id: string, status: ApprovalStatus) => void;
  subscribeToJobCards: () => () => void;
}

export const useJobCardsStore = create<JobCardsState>((set, get) => ({
  jobCards: [],
  loading: false,
  error: null,
  unsubscribe: null,
  setJobCards: (jobCards) => set({ jobCards }),
  addJobCard: (jobCard) => set((state) => ({ jobCards: [...state.jobCards, jobCard] })),
  updateJobCard: (id, updates) =>
    set((state) => ({
      jobCards: state.jobCards.map((jc) => (jc.id === id ? { ...jc, ...updates } : jc)),
    })),
  deleteJobCard: (id) =>
    set((state) => ({
      jobCards: state.jobCards.filter((jc) => jc.id !== id),
    })),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  updateJobCardStatus: (id, status) =>
    set((state) => ({
      jobCards: state.jobCards.map((jc) => (jc.id === id ? { ...jc, status, updatedAt: new Date() } : jc)),
    })),
  subscribeToJobCards: () => {
    // Unsubscribe from previous listener if exists
    const { unsubscribe } = get();
    if (unsubscribe) {
      unsubscribe();
    }

    // Check if user is authenticated
    if (!auth.currentUser) {
       console.warn('User not authenticated, skipping jobCards subscription');
       return () => {};
    }

    set({ loading: true });

    // Use a reference to the auth state if possible, but for now we rely on Firestore rules to reject if not authed.
    // However, to avoid console errors, we check if we have a valid reference.

    const q = query(collection(db, 'jobCards'), orderBy('createdAt', 'desc'));

    const newUnsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const jobCardsData: JobCard[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate() || new Date(),
          updatedAt: doc.data().updatedAt?.toDate() || new Date(),
          approvedAt: doc.data().approvedAt?.toDate() || undefined,
        })) as JobCard[];

        set({ jobCards: jobCardsData, loading: false, error: null });
      },
      (error) => {
        // If it's a permission error, don't set it as a critical store error if we're not logged in
        console.error('Error subscribing to job cards:', error);
        if (error.code === 'permission-denied') {
          // Silent fail or handle gracefully
           set({ loading: false });
        } else {
          set({ error: error.message, loading: false });
        }
      }
    );

    set({ unsubscribe: newUnsubscribe });

    // Return cleanup function
    return () => {
      newUnsubscribe();
    };
  },
}));
