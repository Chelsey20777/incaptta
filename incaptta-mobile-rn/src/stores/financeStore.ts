import { create } from 'zustand';
import { OpEx, FundTransfer, ApprovalStatus } from '@/types';

interface FinanceState {
  opexList: OpEx[];
  fundTransfers: FundTransfer[];
  loading: boolean;
  error: string | null;
  setOpexList: (opexList: OpEx[]) => void;
  addOpex: (opex: OpEx) => void;
  updateOpex: (id: string, updates: Partial<OpEx>) => void;
  deleteOpex: (id: string) => void;
  setFundTransfers: (fundTransfers: FundTransfer[]) => void;
  addFundTransfer: (fundTransfer: FundTransfer) => void;
  updateFundTransfer: (id: string, updates: Partial<FundTransfer>) => void;
  deleteFundTransfer: (id: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  updateOpexStatus: (id: string, status: ApprovalStatus) => void;
  updateFundTransferStatus: (id: string, status: ApprovalStatus) => void;
}

export const useFinanceStore = create<FinanceState>((set) => ({
  opexList: [],
  fundTransfers: [],
  loading: false,
  error: null,
  setOpexList: (opexList) => set({ opexList }),
  addOpex: (opex) => set((state) => ({ opexList: [...state.opexList, opex] })),
  updateOpex: (id, updates) =>
    set((state) => ({
      opexList: state.opexList.map((op) => (op.id === id ? { ...op, ...updates } : op)),
    })),
  deleteOpex: (id) =>
    set((state) => ({
      opexList: state.opexList.filter((op) => op.id !== id),
    })),
  setFundTransfers: (fundTransfers) => set({ fundTransfers }),
  addFundTransfer: (fundTransfer) =>
    set((state) => ({ fundTransfers: [...state.fundTransfers, fundTransfer] })),
  updateFundTransfer: (id, updates) =>
    set((state) => ({
      fundTransfers: state.fundTransfers.map((ft) => (ft.id === id ? { ...ft, ...updates } : ft)),
    })),
  deleteFundTransfer: (id) =>
    set((state) => ({
      fundTransfers: state.fundTransfers.filter((ft) => ft.id !== id),
    })),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  updateOpexStatus: (id, status) =>
    set((state) => ({
      opexList: state.opexList.map((op) => (op.id === id ? { ...op, status, updatedAt: new Date() } : op)),
    })),
  updateFundTransferStatus: (id, status) =>
    set((state) => ({
      fundTransfers: state.fundTransfers.map((ft) =>
        ft.id === id ? { ...ft, status, updatedAt: new Date() } : ft
      ),
    })),
}));
