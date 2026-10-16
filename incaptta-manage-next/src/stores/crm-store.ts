'use client'

import { create } from 'zustand'
import { db } from '@/lib/firebase'
import {
  collection,
  query,
  orderBy,
  getDocs,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp
} from 'firebase/firestore'
import { toast } from 'sonner'

export interface Customer {
  id: string
  name: string
  phone: string
  email: string
  address: string
  isActive: boolean
  createdAt: any
  updatedAt: any
}

export interface QuotationItem {
  id: string
  name: string
  qty: number
  unitPrice: number
  total: number
}

export interface Quotation {
  id: string
  customerId: string
  customerName: string
  items: QuotationItem[]
  total: number
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED'
  createdAt: any
  updatedAt: any
}

export interface Invoice {
  id: string
  customerId: string
  customerName: string
  amount: number
  status: 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED'
  createdAt: any
  updatedAt?: any
}

export interface Lead {
  id: string
  name: string
  phone: string
  email: string
  source: string
  status: 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'LOST' | 'WON'
  notes: string
  createdAt: any
}

export interface CrmState {
  customers: Customer[]
  quotations: Quotation[]
  invoices: Invoice[]
  leads: Lead[]
  loading: boolean
  error: string | null

  fetchCustomers: () => Promise<void>
  createCustomer: (data: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  updateCustomer: (id: string, data: Partial<Customer>) => Promise<void>
  deleteCustomer: (id: string) => Promise<void>

  fetchQuotations: () => Promise<void>
  createQuotation: (data: Omit<Quotation, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  updateQuotation: (id: string, data: Partial<Quotation>) => Promise<void>
  deleteQuotation: (id: string) => Promise<void>

  fetchInvoices: () => Promise<void>
  createInvoice: (data: Omit<Invoice, 'id' | 'createdAt'>) => Promise<void>
  updateInvoice: (id: string, data: Partial<Invoice>) => Promise<void>
  deleteInvoice: (id: string) => Promise<void>

  fetchLeads: () => Promise<void>
  createLead: (data: Omit<Lead, 'id' | 'createdAt'>) => Promise<void>
  updateLead: (id: string, data: Partial<Lead>) => Promise<void>
  deleteLead: (id: string) => Promise<void>
}

export const useCrmStore = create<CrmState>((set, get) => ({
  customers: [],
  quotations: [],
  invoices: [],
  leads: [],
  loading: false,
  error: null,

  fetchCustomers: async () => {
    set({ loading: true, error: null })
    try {
      const q = query(collection(db, 'customers'), orderBy('createdAt', 'desc'))
      const snapshot = await getDocs(q)
      set({ customers: snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Customer)) })
    } catch (err: any) {
      set({ error: err.message })
      console.error('Failed to fetch customers:', err)
    } finally {
      set({ loading: false })
    }
  },

  createCustomer: async (data) => {
    try {
      await addDoc(collection(db, 'customers'), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
      await get().fetchCustomers()
      toast.success('Customer created successfully')
    } catch (err: any) {
      toast.error('Failed to create customer')
      throw err
    }
  },

  updateCustomer: async (id, data) => {
    try {
      await updateDoc(doc(db, 'customers', id), { ...data, updatedAt: serverTimestamp() })
      await get().fetchCustomers()
      toast.success('Customer updated successfully')
    } catch (err: any) {
      toast.error('Failed to update customer')
      throw err
    }
  },

  deleteCustomer: async (id) => {
    try {
      await deleteDoc(doc(db, 'customers', id))
      await get().fetchCustomers()
      toast.success('Customer deleted')
    } catch (err: any) {
      toast.error('Failed to delete customer')
      throw err
    }
  },

  fetchQuotations: async () => {
    set({ loading: true, error: null })
    try {
      const q = query(collection(db, 'quotations'), orderBy('createdAt', 'desc'))
      const snapshot = await getDocs(q)
      set({ quotations: snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Quotation)) })
    } catch (err: any) {
      set({ error: err.message })
      console.error('Failed to fetch quotations:', err)
    } finally {
      set({ loading: false })
    }
  },

  createQuotation: async (data) => {
    try {
      await addDoc(collection(db, 'quotations'), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
      await get().fetchQuotations()
      toast.success('Quotation created successfully')
    } catch (err: any) {
      toast.error('Failed to create quotation')
      throw err
    }
  },

  updateQuotation: async (id, data) => {
    try {
      await updateDoc(doc(db, 'quotations', id), { ...data, updatedAt: serverTimestamp() })
      await get().fetchQuotations()
      toast.success('Quotation updated')
    } catch (err: any) {
      toast.error('Failed to update quotation')
      throw err
    }
  },

  deleteQuotation: async (id) => {
    try {
      await deleteDoc(doc(db, 'quotations', id))
      await get().fetchQuotations()
      toast.success('Quotation deleted')
    } catch (err: any) {
      toast.error('Failed to delete quotation')
      throw err
    }
  },

  fetchInvoices: async () => {
    set({ loading: true, error: null })
    try {
      const q = query(collection(db, 'invoices'), orderBy('createdAt', 'desc'))
      const snapshot = await getDocs(q)
      set({ invoices: snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Invoice)) })
    } catch (err: any) {
      set({ error: err.message })
      console.error('Failed to fetch invoices:', err)
    } finally {
      set({ loading: false })
    }
  },

  createInvoice: async (data) => {
    try {
      await addDoc(collection(db, 'invoices'), { ...data, createdAt: serverTimestamp() })
      await get().fetchInvoices()
      toast.success('Invoice created')
    } catch (err: any) {
      toast.error('Failed to create invoice')
      throw err
    }
  },

  updateInvoice: async (id, data) => {
    try {
      await updateDoc(doc(db, 'invoices', id), { ...data, updatedAt: serverTimestamp() })
      await get().fetchInvoices()
      toast.success('Invoice updated')
    } catch (err: any) {
      toast.error('Failed to update invoice')
      throw err
    }
  },

  deleteInvoice: async (id) => {
    try {
      await deleteDoc(doc(db, 'invoices', id))
      await get().fetchInvoices()
      toast.success('Invoice deleted')
    } catch (err: any) {
      toast.error('Failed to delete invoice')
      throw err
    }
  },

  fetchLeads: async () => {
    set({ loading: true, error: null })
    try {
      const q = query(collection(db, 'leads'), orderBy('createdAt', 'desc'))
      const snapshot = await getDocs(q)
      set({ leads: snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Lead)) })
    } catch (err: any) {
      set({ error: err.message })
      console.error('Failed to fetch leads:', err)
    } finally {
      set({ loading: false })
    }
  },

  createLead: async (data) => {
    try {
      await addDoc(collection(db, 'leads'), { ...data, createdAt: serverTimestamp() })
      await get().fetchLeads()
      toast.success('Lead created')
    } catch (err: any) {
      toast.error('Failed to create lead')
      throw err
    }
  },

  updateLead: async (id, data) => {
    try {
      await updateDoc(doc(db, 'leads', id), { ...data })
      await get().fetchLeads()
      toast.success('Lead updated')
    } catch (err: any) {
      toast.error('Failed to update lead')
      throw err
    }
  },

  deleteLead: async (id) => {
    try {
      await deleteDoc(doc(db, 'leads', id))
      await get().fetchLeads()
      toast.success('Lead deleted')
    } catch (err: any) {
      toast.error('Failed to delete lead')
      throw err
    }
  }
}))