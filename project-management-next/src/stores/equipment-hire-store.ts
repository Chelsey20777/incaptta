'use client'

import { create } from 'zustand'
import { db } from '@/lib/firebase'
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from 'firebase/firestore'
import { toast } from 'sonner'
import { EquipmentAsset, HireContract, InspectionLog } from '@/types/equipment-hire'

interface EquipmentHireState {
  assets: EquipmentAsset[]
  contracts: HireContract[]
  inspections: InspectionLog[]
  loading: boolean
  
  fetchData: () => () => void
  createAsset: (asset: Omit<EquipmentAsset, 'id'>) => Promise<void>
  updateAssetStatus: (id: string, status: EquipmentAsset['status'], engineHours?: number) => Promise<void>
  createContract: (contract: Omit<HireContract, 'id' | 'standbyDays'>) => Promise<string>
  updateContractStatus: (id: string, status: HireContract['status']) => Promise<void>
  addStandbyDay: (id: string, dateStr: string) => Promise<void>
  saveInspection: (inspection: Omit<InspectionLog, 'id'>) => Promise<void>
}

export const useEquipmentHireStore = create<EquipmentHireState>((set, get) => {
  let unsubscribeAll: (() => void)[] = []

  return {
    assets: [],
    contracts: [],
    inspections: [],
    loading: false,

    fetchData: () => {
      // Clean up previous listeners
      unsubscribeAll.forEach(unsub => unsub())
      unsubscribeAll = []

      set({ loading: true })

      const unsubAssets = onSnapshot(collection(db, 'equipmentAssets'), (snap) => {
        const assets: EquipmentAsset[] = []
        snap.forEach(d => {
          const data = d.data()
          assets.push({
            id: d.id,
            name: data.name || '',
            serialNumber: data.serialNumber || '',
            category: data.category || 'Tractor',
            currentEngineHours: Number(data.currentEngineHours ?? 0),
            currentOdometer: Number(data.currentOdometer ?? 0),
            compatibilityTags: data.compatibilityTags || [],
            status: data.status || 'Available'
          })
        })
        set({ assets })
      })

      const unsubContracts = onSnapshot(query(collection(db, 'hireContracts'), orderBy('startDate', 'desc')), (snap) => {
        const contracts: HireContract[] = []
        snap.forEach(d => {
          const data = d.data()
          contracts.push({
            id: d.id,
            customerId: data.customerId || '',
            customerName: data.customerName || '',
            assetId: data.assetId || '',
            assetName: data.assetName || '',
            status: data.status || 'Draft',
            startDate: data.startDate || '',
            endDate: data.endDate || '',
            hireType: data.hireType || 'DRY',
            baseDailyRate: Number(data.baseDailyRate ?? 0),
            includedDailyHours: Number(data.includedDailyHours ?? 8.0),
            excessHourRate: Number(data.excessHourRate ?? 0),
            standbyRatePercentage: Number(data.standbyRatePercentage ?? 0.50),
            standbyDays: data.standbyDays || []
          })
        })
        set({ contracts })
      })

      const unsubInspections = onSnapshot(collection(db, 'inspectionLogs'), (snap) => {
        const inspections: InspectionLog[] = []
        snap.forEach(d => {
          const data = d.data()
          inspections.push({
            id: d.id,
            contractId: data.contractId || '',
            type: data.type || 'PRE_HIRE',
            engineHoursRecorded: Number(data.engineHoursRecorded ?? 0),
            fuelLevelPercentage: Number(data.fuelLevelPercentage ?? 100),
            biosecurityWashdownCertified: !!data.biosecurityWashdownCertified,
            damageNotes: data.damageNotes || '',
            signedOffByUserId: data.signedOffByUserId || '',
            signedOffByUserName: data.signedOffByUserName || ''
          })
        })
        set({ inspections, loading: false })
      })

      unsubscribeAll = [unsubAssets, unsubContracts, unsubInspections]
      return () => {
        unsubscribeAll.forEach(unsub => unsub())
        unsubscribeAll = []
      }
    },

    createAsset: async (asset) => {
      await addDoc(collection(db, 'equipmentAssets'), {
        ...asset,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
      toast.success('Equipment asset created successfully')
    },

    updateAssetStatus: async (id, status, engineHours) => {
      const updateData: Record<string, any> = { status, updatedAt: serverTimestamp() }
      if (engineHours !== undefined) {
        updateData.currentEngineHours = engineHours
      }
      await updateDoc(doc(db, 'equipmentAssets', id), updateData)
    },

    createContract: async (contract) => {
      const docRef = await addDoc(collection(db, 'hireContracts'), {
        ...contract,
        standbyDays: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
      toast.success('Contract drafted successfully')
      return docRef.id
    },

    updateContractStatus: async (id, status) => {
      await updateDoc(doc(db, 'hireContracts', id), {
        status,
        updatedAt: serverTimestamp()
      })
    },

    addStandbyDay: async (id, dateStr) => {
      const contract = get().contracts.find(c => c.id === id)
      if (!contract) return
      const standbyDays = [...(contract.standbyDays || [])]
      if (standbyDays.includes(dateStr)) {
        toast.info('Day is already marked as Standby')
        return
      }
      standbyDays.push(dateStr)
      await updateDoc(doc(db, 'hireContracts', id), {
        standbyDays,
        updatedAt: serverTimestamp()
      })
      toast.success('Standby day approved')
    },

    saveInspection: async (inspection) => {
      await addDoc(collection(db, 'inspectionLogs'), {
        ...inspection,
        createdAt: serverTimestamp()
      })
    }
  }
})
