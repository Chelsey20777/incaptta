import { create } from 'zustand';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';

export interface RevenueMetric {
  id: string;
  amount: number;
  date: string;
  label: string;
}

export interface ActiveStructure {
  id: string;
  name: string;
  status: string;
  department: string;
  progress: number;
}

export interface MortalityMetric {
  id: string;
  mortalityRate: number;
  date: string;
  flockId: string;
}

interface DashboardState {
  revenueMetrics: RevenueMetric[];
  activeStructures: ActiveStructure[];
  mortalityMetrics: MortalityMetric[];
  loadingMetrics: boolean;
  loadingStructures: boolean;

  fetchDashboardMetrics: () => Promise<void>;
  subscribeToLiveStructures: () => () => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  revenueMetrics: [],
  activeStructures: [],
  mortalityMetrics: [],
  loadingMetrics: false,
  loadingStructures: false,

  fetchDashboardMetrics: async () => {
    set({ loadingMetrics: true });
    try {
      // Stub data for operational metrics dashboard
      const dummyRevenue: RevenueMetric[] = [
        { id: '1', amount: 142850.0, date: '2026-06', label: 'June 2026' },
        { id: '2', amount: 126980.0, date: '2026-05', label: 'May 2026' },
      ];

      const dummyMortality: MortalityMetric[] = [
        { id: '1', mortalityRate: 0.42, date: '2026-06-23', flockId: 'FLOCK-09' },
      ];

      set({
        revenueMetrics: dummyRevenue,
        mortalityMetrics: dummyMortality,
        loadingMetrics: false,
      });
    } catch (error) {
      console.error('Error loading metrics:', error);
      set({ loadingMetrics: false });
    }
  },

  subscribeToLiveStructures: () => {
    set({ loadingStructures: true });

    // Stub active project structures collections
    const dummyStructures: ActiveStructure[] = [
      { id: 'struct-1', name: 'Greenhouse Structure A', status: 'IN_PROGRESS', department: 'Agric', progress: 65 },
      { id: 'struct-2', name: 'Poultry Run Run B', status: 'IN_PROGRESS', department: 'Poultry', progress: 42 },
      { id: 'struct-3', name: 'Fowl Run Calculator System', status: 'COMPLETED', department: 'Agric', progress: 100 },
    ];

    set({ activeStructures: dummyStructures, loadingStructures: false });

    // Stub real-time onSnapshot subscription
    const q = query(collection(db, 'activeStructures'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const structures = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as ActiveStructure[];

        if (structures.length > 0) {
          set({ activeStructures: structures });
        }
      },
      (error) => {
        console.error('Active structures subscription error:', error);
      }
    );

    return unsubscribe;
  },
}));