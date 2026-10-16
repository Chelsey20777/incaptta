'use client'

import { useState, useRef, useEffect } from 'react'
import { useAdminStore } from '@/stores/admin-store'
import { useAuthStore } from '@/stores/auth-store'
import { useInventoryStore } from '@/stores/inventory-store'
import { renameWaterSystemsCategoryFull } from '@/lib/migrations/rename-water-systems-category'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import {
  Upload,
  X,
  Loader2,
  Image as ImageIcon,
  Save,
  Building2,
  Landmark,
  ShieldAlert,
  Palette,
  PenLine,
  CalendarClock,
  Star,
  Trash2,
  Check,
  Plus
} from 'lucide-react'

export default function AppSettings() {
  const store = useAdminStore()
  const { appSettings, loading: storeLoading } = store
  const { user } = useAuthStore()
  const s = appSettings as any

  const logoInputRef = useRef<HTMLInputElement>(null)
  const faviconInputRef = useRef<HTMLInputElement>(null)
  const sealInputRef = useRef<HTMLInputElement>(null)
  const sealInput2Ref = useRef<HTMLInputElement>(null)
  const signatureInputRef = useRef<HTMLInputElement>(null)
  const bgInputRef = useRef<HTMLInputElement>(null)

  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null)
  const [faviconFile, setFaviconFile] = useState<File | null>(null)
  const [faviconPreviewUrl, setFaviconPreviewUrl] = useState<string | null>(null)
  const [sealFile, setSealFile] = useState<File | null>(null)
  const [sealPreviewUrl, setSealPreviewUrl] = useState<string | null>(null)
  const [seal2File, setSeal2File] = useState<File | null>(null)
  const [seal2PreviewUrl, setSeal2PreviewUrl] = useState<string | null>(null)
  const [signatureFile, setSignatureFile] = useState<File | null>(null)
  const [signaturePreviewUrl, setSignaturePreviewUrl] = useState<string | null>(null)
  const [bgFile, setBgFile] = useState<File | null>(null)
  const [bgPreviewUrl, setBgPreviewUrl] = useState<string | null>(null)

  const [inventoryPin, setInventoryPin] = useState('')
  const [inventoryPinConfirm, setInventoryPinConfirm] = useState('')
  const [uploading, setUploading] = useState(false)
  const [migrating, setMigrating] = useState(false)
  const [renamingInventoryCategory, setRenamingInventoryCategory] = useState(false)
  const inventoryStore = useInventoryStore()

  const runInventoryCategoryRename = async () => {
    if (!window.confirm(
      'Rename all legacy "Water systems" category labels to "Water System" across inventory, job categories, job cards, CRM quotes/invoices, and BOM templates?\n\nThis does NOT change OPEX or approval workflows. Job card line items and approvals are untouched.'
    )) {
      return
    }
    setRenamingInventoryCategory(true)
    try {
      const { db } = await import('@/lib/firebase')
      const stats = await renameWaterSystemsCategoryFull(db)
      await Promise.all([
        inventoryStore.fetchCategories(),
        inventoryStore.fetchItems(),
        store.fetchAll(),
      ])
      toast.success('Water System rename complete', {
        description: [
          stats.inventoryCategoriesUpdated && `${stats.inventoryCategoriesUpdated} inventory category`,
          stats.inventoryItemsUpdated && `${stats.inventoryItemsUpdated} inventory item`,
          stats.jobCategoriesUpdated && `${stats.jobCategoriesUpdated} job category`,
          stats.jobCardsUpdated && `${stats.jobCardsUpdated} job card`,
          stats.crmQuotesUpdated && `${stats.crmQuotesUpdated} quote`,
          stats.crmInvoicesUpdated && `${stats.crmInvoicesUpdated} invoice`,
          stats.bomTemplatesUpdated && `${stats.bomTemplatesUpdated} BOM template`,
        ].filter(Boolean).join(', ') || 'No matching records found (already up to date).',
      })
    } catch (err: any) {
      toast.error('Category rename failed', { description: err.message })
    } finally {
      setRenamingInventoryCategory(false)
    }
  }

  const runTaxonomyMigration = async () => {
    if (!window.confirm("WARNING: This will rewrite category fields and approval identities across ALL operational expense documents. Are you sure you want to proceed?")) {
      return
    }
    setMigrating(true)
    try {
      const { collection, getDocs, doc, setDoc, deleteDoc, writeBatch } = await import('firebase/firestore')
      const { db } = await import('@/lib/firebase')

      const toTitleCase = (str: string): string => {
        return str.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
      }

      const toIsoDate = (val: any): string => {
        if (!val) return new Date().toISOString()
        if (val.toDate) return val.toDate().toISOString()
        try {
          return new Date(val).toISOString()
        } catch {
          return new Date().toISOString()
        }
      }

      toast.info("Starting category catalog normalization...")

      const catSnap = await getDocs(collection(db, 'expenseCategories'))
      for (const d of catSnap.docs) {
        const data = d.data()
        const rawName = String(data.name || d.id || '').trim()
        const normalizedName = toTitleCase(rawName)
        
        if (!normalizedName) continue
        
        if (d.id !== normalizedName) {
          await deleteDoc(doc(db, 'expenseCategories', d.id))
          await setDoc(doc(db, 'expenseCategories', normalizedName), {
            name: normalizedName,
            createdAt: data.createdAt || new Date(),
            updatedAt: new Date()
          })
        } else {
          await setDoc(doc(db, 'expenseCategories', d.id), {
            ...data,
            name: normalizedName,
            updatedAt: new Date()
          })
        }
      }

      toast.info("Category catalog normalized. Normalizing operationalExpenses...")

      const opexSnap = await getDocs(collection(db, 'operationalExpenses'))
      let batch = writeBatch(db)
      let count = 0
      let opexUpdated = 0

      for (const d of opexSnap.docs) {
        const data = d.data()
        const updateData: any = {}

        const rawCat = String(data.category || '').trim().toLowerCase()
        let normCat = 'Uncategorized'
        
        if (rawCat.includes('job-card') || rawCat.includes('job card') || rawCat.includes('ad-hoc')) {
          normCat = 'Job Card Expense'
        } else if (rawCat.includes('operational') || rawCat.includes('opex')) {
          normCat = 'Operational Expense'
        } else if (rawCat.includes('salaries') || rawCat.includes('wages') || rawCat.includes('payroll') || rawCat.includes('advance')) {
          normCat = 'Salaries & Wages'
        } else if (rawCat.includes('statutory') || rawCat.includes('zimra') || rawCat.includes('nssa') || rawCat.includes('tax')) {
          normCat = 'Statutory Liabilities'
        } else if (rawCat.includes('cost of sales') || rawCat.includes('sales') || rawCat.includes('cogs') || rawCat.includes('inventory')) {
          normCat = 'Cost of Sales'
        } else if (data.category) {
          normCat = toTitleCase(String(data.category))
        }
        
        if (data.category !== normCat) {
          updateData.category = normCat
        }

        let accountantApprovedBy = data.accountantApprovedBy
        let accountantChanged = false
        
        if (accountantApprovedBy && typeof accountantApprovedBy !== 'object') {
          const actStr = String(accountantApprovedBy)
          const isSystem = actStr.includes('System') || actStr.includes('Workflow') || actStr.includes('Engine')
          accountantApprovedBy = {
            uid: isSystem ? 'system:accountant-bypass' : 'legacy-import',
            displayName: actStr,
            email: isSystem ? 'system@incaptta.internal' : 'user@incaptta.com',
            actorType: isSystem ? 'SYSTEM_ROBOT' : 'USER',
            actionType: isSystem ? 'WORKFLOW_BYPASS_JOBCARD' : 'MANUAL_APPROVAL',
            timestamp: toIsoDate(data.accountantApprovedAt || data.createdAt)
          }
          accountantChanged = true
        } else if (!accountantApprovedBy && (data.status === 'APPROVED' || data.status === 'APPROVED_FOR_PAYMENT') && data.sourceJobId) {
          accountantApprovedBy = {
            uid: 'system:workflow-engine',
            displayName: 'Job Card Workflow Engine',
            email: 'system@incaptta.internal',
            actorType: 'SYSTEM_ROBOT',
            actionType: 'WORKFLOW_BYPASS_JOBCARD',
            policyRef: 'POLICY-JOBCARD-ADHOC-EXEC',
            timestamp: toIsoDate(data.accountantApprovedAt || data.createdAt)
          }
          accountantChanged = true
        }
        
        if (accountantChanged) {
          updateData.accountantApprovedBy = accountantApprovedBy
        }

        let managerApprovedBy = data.managerApprovedBy
        let managerChanged = false
        
        if (managerApprovedBy && typeof managerApprovedBy !== 'object') {
          const mngStr = String(managerApprovedBy)
          const isSystem = mngStr.includes('System') || mngStr.includes('Workflow') || mngStr.includes('Engine') || mngStr.includes('Auto-approved')
          managerApprovedBy = {
            uid: isSystem ? 'system:policy-engine' : 'legacy-import',
            displayName: isSystem ? 'System Auto-Approval Engine' : mngStr,
            email: isSystem ? 'system@incaptta.internal' : 'user@incaptta.com',
            actorType: isSystem ? 'SYSTEM_ROBOT' : 'USER',
            actionType: isSystem ? 'POLICY_BYPASS_UNDER_300' : 'MANUAL_APPROVAL',
            policyRef: isSystem ? 'POLICY-OPEX-THRESHOLD-300-USD' : undefined,
            timestamp: toIsoDate(data.managerApprovedAt || data.approvedAt || data.createdAt)
          }
          managerChanged = true
        } else if (!managerApprovedBy && (data.status === 'APPROVED' || data.status === 'APPROVED_FOR_PAYMENT') && data.sourceJobId) {
          managerApprovedBy = {
            uid: 'system:jobcard-manager-bypass',
            displayName: 'Manager Job Card Approval',
            email: 'manager@incaptta.internal',
            actorType: 'USER',
            actionType: 'MANUAL_APPROVAL',
            timestamp: toIsoDate(data.managerApprovedAt || data.approvedAt || data.createdAt)
          }
          managerChanged = true
        }
        
        if (managerChanged) {
          updateData.managerApprovedBy = managerApprovedBy
        }

        if (Object.keys(updateData).length > 0) {
          batch.update(doc(db, 'operationalExpenses', d.id), {
            ...updateData,
            categoryNormalized: true,
            schemaVersion: 2,
            lastMigratedAt: new Date()
          })
          opexUpdated++
          count++
          
          if (count >= 400) {
            await batch.commit()
            batch = writeBatch(db)
            count = 0
          }
        }
      }

      if (count > 0) {
        await batch.commit()
      }

      toast.success("Database migration completed successfully!", {
        description: `Normalized category & approval fields on ${opexUpdated} operational expense documents.`
      })
    } catch (err: any) {
      console.error("Migration failed:", err)
      toast.error("Migration Failed", { description: err.message })
    } finally {
      setMigrating(false)
    }
  }

  const [form, setForm] = useState<Record<string, any>>({
    managerName: '',
    managerPosition: '',
    companyName: '',
    companyEmail: '',
    companyAddress: '',
    companyCity: '',
    companyCountry: '',
    companyPhone1: '',
    companyPhone2: '',
    companyWebsite: '',
    bankName: '',
    accountName: '',
    bankAccount: '',
    swiftCode: '',
    branchCode: '',
    bankName2: '',
    accountName2: '',
    bankAccount2: '',
    swiftCode2: '',
    branchCode2: '',
    paymentTerms: '',
    termsAdvised: '',
    termsOther: '',
    moreTerms: '',
    vatEnabled: false,
    vatRate: 15,
    calendarTimezone: 'Africa/Harare',
    calendarWeekdays: '1,2,3,4,5',
    calendarOpenHour: 8,
    calendarCloseHour: 17,
    calendarHolidays: '',
    firstResponseHours: 2,
    reminderMinutes: 30,
    escalationHours: 4,
    billingArrangement: 'FULL_UPFRONT',
    billingNetDays: 0,
    billingDepositPercent: 30,
    blockUnpaidJobClose: true,
    allowReopenClosedEnquiries: false,
    actingStorekeeperUid: '',
    reservationExpiryHours: 72,
    allowNegativeStock: false,
    adjustmentApproverRole: 'ADMIN',
    inventoryManagerPinHash: '',
    lowStockColor: '#ef4444',
    outOfStockColor: '#dc2626',
    ecocashBalanceColor: '#22c55e',
    ledgerBankBalanceColor: '#3b82f6',
    ledgerIrdBalanceColor: '#8b5cf6',
    pieIncomeColor: '#22c55e',
    pieExpenseColor: '#ef4444',
    primaryBrandColor: '#f97316',
    secondaryBrandColor: '#3b82f6',
    crmHeaderBg: '#1e293b',
    crmHeaderText: '#ffffff',
    crmHeaderBorder: '#334155',
    opexHeaderBg: '#1e293b',
    opexHeaderText: '#ffffff',
    opexHeaderBorder: '#334155',
    jobCardsHeaderBg: '#1e293b',
    jobCardsHeaderText: '#ffffff',
    jobCardsHeaderBorder: '#334155',
    ledgerHeaderBg: '#1e293b',
    ledgerHeaderText: '#ffffff',
    ledgerHeaderBorder: '#334155',
    inventoryHeaderBg: '#1e293b',
    inventoryHeaderText: '#ffffff',
    inventoryHeaderBorder: '#334155',
    backgroundImageUrl: '',
    backgroundOpacity: 15,
    pdfLogoMaxWidthMm: 55,
    pdfLogoMaxHeightMm: 28,
  })

  useEffect(() => {
    if (appSettings && Object.keys(appSettings).length > 0) {
      setForm((prev) => {
        const updated: Record<string, any> = {}
        for (const key of Object.keys(prev)) {
          if ((appSettings as any)[key] !== undefined) {
            updated[key] = (appSettings as any)[key]
          }
        }
        for (const key of Object.keys(appSettings)) {
          if (!(key in prev) && key !== 'id' && key !== 'updatedAt' && key !== 'createdAt') {
            updated[key] = (appSettings as any)[key]
          }
        }
        const calendar = (appSettings as any).businessCalendar || {}
        const billing = (appSettings as any).billingTerms || {}
        const jobOps = (appSettings as any).jobOps || {}
        const storePolicies = (appSettings as any).storePolicies || {}
        return {
          ...prev,
          ...updated,
          calendarTimezone: calendar.timezone ?? updated.calendarTimezone ?? prev.calendarTimezone,
          calendarWeekdays: Array.isArray(calendar.weekdays) ? calendar.weekdays.join(',') : (updated.calendarWeekdays ?? prev.calendarWeekdays),
          calendarOpenHour: calendar.openHour ?? updated.calendarOpenHour ?? prev.calendarOpenHour,
          calendarCloseHour: calendar.closeHour ?? updated.calendarCloseHour ?? prev.calendarCloseHour,
          calendarHolidays: Array.isArray(calendar.holidays) ? calendar.holidays.join(',') : (updated.calendarHolidays ?? prev.calendarHolidays),
          firstResponseHours: calendar.firstResponseHours ?? updated.firstResponseHours ?? prev.firstResponseHours,
          reminderMinutes: calendar.reminderMinutes ?? updated.reminderMinutes ?? prev.reminderMinutes,
          escalationHours: calendar.escalationHours ?? updated.escalationHours ?? prev.escalationHours,
          billingArrangement: billing.arrangement ?? updated.billingArrangement ?? prev.billingArrangement,
          billingNetDays: billing.netDays ?? updated.billingNetDays ?? prev.billingNetDays,
          billingDepositPercent: billing.depositPercent ?? updated.billingDepositPercent ?? prev.billingDepositPercent,
          blockUnpaidJobClose: jobOps.blockUnpaidJobClose ?? updated.blockUnpaidJobClose ?? prev.blockUnpaidJobClose,
          allowReopenClosedEnquiries: jobOps.allowReopenClosedEnquiries ?? updated.allowReopenClosedEnquiries ?? prev.allowReopenClosedEnquiries,
          actingStorekeeperUid: storePolicies.actingStorekeeperUid ?? updated.actingStorekeeperUid ?? prev.actingStorekeeperUid,
          reservationExpiryHours: storePolicies.reservationExpiryHours ?? updated.reservationExpiryHours ?? prev.reservationExpiryHours,
          allowNegativeStock: storePolicies.allowNegativeStock ?? updated.allowNegativeStock ?? prev.allowNegativeStock,
          adjustmentApproverRole: storePolicies.adjustmentApproverRole ?? updated.adjustmentApproverRole ?? prev.adjustmentApproverRole,
        }
      })
    }
  }, [appSettings])

  const updateField = (field: string, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleFileSelect = (
    e: React.ChangeEvent<HTMLInputElement>,
    setFile: (f: File | null) => void,
    setPreview: (url: string | null) => void
  ) => {
    const file = e.target.files?.[0]
    if (file) {
      setFile(file)
      setPreview(URL.createObjectURL(file))
    }
  }

  const clearFile = (
    setFile: (f: File | null) => void,
    setPreview: (url: string | null) => void,
    inputRef: React.RefObject<HTMLInputElement | null>
  ) => {
    setFile(null)
    setPreview(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleUploadLogo = async () => {
    if (!logoFile) return
    setUploading(true)
    try {
      await store.uploadLogo(logoFile)
      clearFile(setLogoFile, setLogoPreviewUrl, logoInputRef)
    } catch { /* handled by store */ } finally { setUploading(false) }
  }

  const handleUploadFavicon = async () => {
    if (!faviconFile) return
    setUploading(true)
    try {
      await store.uploadFavicon(faviconFile)
      clearFile(setFaviconFile, setFaviconPreviewUrl, faviconInputRef)
    } catch { /* handled by store */ } finally { setUploading(false) }
  }

  const handleUploadSeal = async () => {
    if (!sealFile) return
    setUploading(true)
    try {
      await store.uploadSeal(sealFile)
      clearFile(setSealFile, setSealPreviewUrl, sealInputRef)
    } catch { /* handled by store */ } finally { setUploading(false) }
  }

  const handleUploadSeal2 = async () => {
    if (!seal2File) return
    setUploading(true)
    try {
      await store.uploadSeal2(seal2File)
      clearFile(setSeal2File, setSeal2PreviewUrl, sealInput2Ref)
    } catch { /* handled by store */ } finally { setUploading(false) }
  }

  const handleUploadSignature = async () => {
    if (!signatureFile) return
    setUploading(true)
    try {
      await store.uploadManagerSignature(signatureFile)
      clearFile(setSignatureFile, setSignaturePreviewUrl, signatureInputRef)
    } catch { /* handled by store */ } finally { setUploading(false) }
  }

  const handleRemoveLogo = async () => { await store.saveSettings({ logoUrl: '', logoDataUrl: '' }); toast.success('Logo removed') }
  const handleRemoveFavicon = async () => { await store.saveSettings({ faviconUrl: '', faviconDataUrl: '' }); toast.success('Favicon removed') }
  const handleRemoveSeal = async () => { await store.saveSettings({ sealUrl: '' }); toast.success('Primary seal removed') }
  const handleRemoveSeal2 = async () => { await store.saveSettings({ sealUrl2: '' }); toast.success('Secondary seal removed') }
  const handleRemoveSignature = async () => { await store.saveSettings({ managerSignatureUrl: '' }); toast.success('Manager signature removed') }

  const handleUploadBg = async () => {
    if (!bgFile) return
    setUploading(true)
    try {
      await store.addBackgroundImage(bgFile)
      clearFile(setBgFile, setBgPreviewUrl, bgInputRef)
    } catch { /* handled by store */ } finally { setUploading(false) }
  }

  const handleRemoveBg = async () => { await store.saveSettings({ backgroundImageUrl: '' }); toast.success('Background image removed') }

  const handleSaveAll = async () => {
    setUploading(true)
    try {
      const cleanForm: Record<string, any> = { ...form }
      if (inventoryPin && inventoryPin === inventoryPinConfirm && inventoryPin.length >= 4) {
        const encoder = new TextEncoder()
        const data = encoder.encode(inventoryPin)
        const hashBuffer = await crypto.subtle.digest('SHA-256', data)
        const hashArray = Array.from(new Uint8Array(hashBuffer))
        cleanForm.inventoryManagerPinHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
      }
      const toMm = (value: unknown, fallback: number, min: number, max: number) => {
        const n = typeof value === 'number' ? value : Number(value)
        if (!Number.isFinite(n)) return fallback
        return Math.min(max, Math.max(min, n))
      }
      cleanForm.pdfLogoMaxWidthMm = toMm(cleanForm.pdfLogoMaxWidthMm, 55, 20, 80)
      cleanForm.pdfLogoMaxHeightMm = toMm(cleanForm.pdfLogoMaxHeightMm, 28, 12, 45)
      cleanForm.businessCalendar = {
        timezone: cleanForm.calendarTimezone || 'Africa/Harare',
        weekdays: String(cleanForm.calendarWeekdays || '1,2,3,4,5').split(',').map((value: string) => Number(value.trim())).filter((value: number) => Number.isFinite(value)),
        openHour: Number(cleanForm.calendarOpenHour || 8),
        closeHour: Number(cleanForm.calendarCloseHour || 17),
        holidays: String(cleanForm.calendarHolidays || '').split(',').map((value: string) => value.trim()).filter(Boolean),
        firstResponseHours: Number(cleanForm.firstResponseHours || 2),
        reminderMinutes: Number(cleanForm.reminderMinutes || 30),
        escalationHours: Number(cleanForm.escalationHours || 4),
      }
      cleanForm.billingTerms = {
        arrangement: cleanForm.billingArrangement || 'FULL_UPFRONT',
        netDays: Number(cleanForm.billingNetDays || 0),
        depositPercent: Number(cleanForm.billingDepositPercent || 30),
      }
      cleanForm.jobOps = {
        blockUnpaidJobClose: cleanForm.blockUnpaidJobClose !== false,
        allowReopenClosedEnquiries: cleanForm.allowReopenClosedEnquiries === true,
      }
      cleanForm.storePolicies = {
        actingStorekeeperUid: cleanForm.actingStorekeeperUid || '',
        reservationExpiryHours: Number(cleanForm.reservationExpiryHours || 72),
        allowNegativeStock: cleanForm.allowNegativeStock === true,
        adjustmentApproverRole: cleanForm.adjustmentApproverRole || 'ADMIN',
      }
      await store.saveSettings(cleanForm)
      setInventoryPin('')
      setInventoryPinConfirm('')
      toast.success('All settings saved successfully')
    } catch { /* handled by store */ } finally { setUploading(false) }
  }

  const handleRemovePin = async () => { await store.saveSettings({ inventoryManagerPinHash: '' }); toast.success('Inventory PIN removed') }

  return (
    <div className="space-y-8 pb-24">
      {/* Application Branding */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ImageIcon className="size-5" />Application Branding</CardTitle>
          <CardDescription>Upload logos, seals, and signature images.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label>Application Logo</Label>
            <div className="flex items-center gap-4">
              {(logoPreviewUrl || s.logoUrl) && <img src={logoPreviewUrl || s.logoUrl} alt="Logo" className="h-16 w-auto object-contain border rounded" />}
              <div className="flex gap-2">
                <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFileSelect(e, setLogoFile, setLogoPreviewUrl)} />
                <Button variant="outline" size="sm" onClick={() => logoInputRef.current?.click()}><Upload className="mr-2 size-4" />Select Logo</Button>
                {logoFile && <Button size="sm" onClick={handleUploadLogo} disabled={uploading}>{uploading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}Apply Logo</Button>}
                {s.logoUrl && <Button variant="destructive" size="sm" onClick={handleRemoveLogo}><X className="mr-2 size-4" />Remove</Button>}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="pdfLogoMaxWidthMm">PDF logo max width (mm)</Label>
                <Input
                  id="pdfLogoMaxWidthMm"
                  type="number"
                  min={20}
                  max={80}
                  step={1}
                  value={form.pdfLogoMaxWidthMm ?? 55}
                  onChange={(e) => updateField('pdfLogoMaxWidthMm', e.target.value === '' ? '' : Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pdfLogoMaxHeightMm">PDF logo max height (mm)</Label>
                <Input
                  id="pdfLogoMaxHeightMm"
                  type="number"
                  min={12}
                  max={45}
                  step={1}
                  value={form.pdfLogoMaxHeightMm ?? 28}
                  onChange={(e) => updateField('pdfLogoMaxHeightMm', e.target.value === '' ? '' : Number(e.target.value))}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Used on quotations, invoices, and job PDFs. Logo scales inside this box without stretching. Defaults 55 × 28. Allowed range: width 20–80, height 12–45.
            </p>
          </div>
          <div className="space-y-3">
            <Label>Application Favicon (Tab & Shortcuts Icon)</Label>
            <div className="flex items-center gap-4">
              {(faviconPreviewUrl || s.faviconUrl) && <img src={faviconPreviewUrl || s.faviconUrl} alt="Favicon" className="h-12 w-12 object-contain border rounded p-1 bg-white" />}
              <div className="flex gap-2">
                <input ref={faviconInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFileSelect(e, setFaviconFile, setFaviconPreviewUrl)} />
                <Button variant="outline" size="sm" onClick={() => faviconInputRef.current?.click()}><Upload className="mr-2 size-4" />Select Favicon</Button>
                {faviconFile && <Button size="sm" onClick={handleUploadFavicon} disabled={uploading}>{uploading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}Apply Favicon</Button>}
                {s.faviconUrl && <Button variant="destructive" size="sm" onClick={handleRemoveFavicon}><X className="mr-2 size-4" />Remove</Button>}
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <Label>Primary Company Seal</Label>
            <div className="flex items-center gap-4">
              {(sealPreviewUrl || s.sealUrl) && <img src={sealPreviewUrl || s.sealUrl} alt="Primary Seal" className="h-16 w-auto object-contain border rounded" />}
              <div className="flex gap-2">
                <input ref={sealInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFileSelect(e, setSealFile, setSealPreviewUrl)} />
                <Button variant="outline" size="sm" onClick={() => sealInputRef.current?.click()}><Upload className="mr-2 size-4" />Select Seal</Button>
                {sealFile && <Button size="sm" onClick={handleUploadSeal} disabled={uploading}>{uploading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}Apply Seal</Button>}
                {s.sealUrl && <Button variant="destructive" size="sm" onClick={handleRemoveSeal}><X className="mr-2 size-4" />Remove</Button>}
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <Label>Secondary Company Seal</Label>
            <div className="flex items-center gap-4">
              {(seal2PreviewUrl || s.sealUrl2) && <img src={seal2PreviewUrl || s.sealUrl2} alt="Secondary Seal" className="h-16 w-auto object-contain border rounded" />}
              <div className="flex gap-2">
                <input ref={sealInput2Ref} type="file" accept="image/*" className="hidden" onChange={(e) => handleFileSelect(e, setSeal2File, setSeal2PreviewUrl)} />
                <Button variant="outline" size="sm" onClick={() => sealInput2Ref.current?.click()}><Upload className="mr-2 size-4" />Select Seal</Button>
                {seal2File && <Button size="sm" onClick={handleUploadSeal2} disabled={uploading}>{uploading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}Apply Seal</Button>}
                {s.sealUrl2 && <Button variant="destructive" size="sm" onClick={handleRemoveSeal2}><X className="mr-2 size-4" />Remove</Button>}
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <Label>Manager Signature</Label>
            <div className="flex items-center gap-4">
              {(signaturePreviewUrl || s.managerSignatureUrl) && <img src={signaturePreviewUrl || s.managerSignatureUrl} alt="Signature" className="h-16 w-auto object-contain border rounded" />}
              <div className="flex gap-2">
                <input ref={signatureInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFileSelect(e, setSignatureFile, setSignaturePreviewUrl)} />
                <Button variant="outline" size="sm" onClick={() => signatureInputRef.current?.click()}><Upload className="mr-2 size-4" />Select Signature</Button>
                {signatureFile && <Button size="sm" onClick={handleUploadSignature} disabled={uploading}>{uploading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}Apply Signature</Button>}
                {s.managerSignatureUrl && <Button variant="destructive" size="sm" onClick={handleRemoveSignature}><X className="mr-2 size-4" />Remove</Button>}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Manager Authorization */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><PenLine className="size-5" />Manager Authorization</CardTitle>
          <CardDescription>Manager name and position for document signing.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="managerName">Manager Name</Label>
            <Input id="managerName" value={form.managerName || ''} onChange={(e) => updateField('managerName', e.target.value)} placeholder="e.g. John Doe" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="managerPosition">Manager Position</Label>
            <Input id="managerPosition" value={form.managerPosition || ''} onChange={(e) => updateField('managerPosition', e.target.value)} placeholder="e.g. Operations Manager" />
          </div>
        </CardContent>
      </Card>

      {/* General Company Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Building2 className="size-5" />General Company Information</CardTitle>
          <CardDescription>Basic company details.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2"><Label htmlFor="companyName">Company Name</Label><Input id="companyName" value={form.companyName || ''} onChange={(e) => updateField('companyName', e.target.value)} placeholder="Company name" /></div>
          <div className="space-y-2"><Label htmlFor="companyEmail">Email</Label><Input id="companyEmail" value={form.companyEmail || ''} onChange={(e) => updateField('companyEmail', e.target.value)} placeholder="company@example.com" type="email" /></div>
          <div className="space-y-2 md:col-span-2"><Label htmlFor="companyAddress">Address</Label><Input id="companyAddress" value={form.companyAddress || ''} onChange={(e) => updateField('companyAddress', e.target.value)} placeholder="Street address" /></div>
          <div className="space-y-2"><Label htmlFor="companyCity">City</Label><Input id="companyCity" value={form.companyCity || ''} onChange={(e) => updateField('companyCity', e.target.value)} placeholder="City" /></div>
          <div className="space-y-2"><Label htmlFor="companyCountry">Country</Label><Input id="companyCountry" value={form.companyCountry || ''} onChange={(e) => updateField('companyCountry', e.target.value)} placeholder="Country" /></div>
          <div className="space-y-2"><Label htmlFor="companyPhone1">Phone 1</Label><Input id="companyPhone1" value={form.companyPhone1 || ''} onChange={(e) => updateField('companyPhone1', e.target.value)} placeholder="Primary phone" /></div>
          <div className="space-y-2"><Label htmlFor="companyPhone2">Phone 2</Label><Input id="companyPhone2" value={form.companyPhone2 || ''} onChange={(e) => updateField('companyPhone2', e.target.value)} placeholder="Secondary phone" /></div>
          <div className="space-y-2"><Label htmlFor="companyWebsite">Website</Label><Input id="companyWebsite" value={form.companyWebsite || ''} onChange={(e) => updateField('companyWebsite', e.target.value)} placeholder="https://example.com" /></div>
        </CardContent>
      </Card>

      {/* Finance Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Landmark className="size-5" />Finance Information</CardTitle>
          <CardDescription>Bank account details.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h4 className="text-sm font-semibold mb-3">Bank Account 1</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2"><Label htmlFor="bankName">Bank Name</Label><Input id="bankName" value={form.bankName || ''} onChange={(e) => updateField('bankName', e.target.value)} placeholder="Bank name" /></div>
              <div className="space-y-2"><Label htmlFor="accountName">Account Name</Label><Input id="accountName" value={form.accountName || ''} onChange={(e) => updateField('accountName', e.target.value)} placeholder="Account holder name" /></div>
              <div className="space-y-2"><Label htmlFor="bankAccount">Account Number</Label><Input id="bankAccount" value={form.bankAccount || ''} onChange={(e) => updateField('bankAccount', e.target.value)} placeholder="Account number" /></div>
              <div className="space-y-2"><Label htmlFor="swiftCode">Swift Code</Label><Input id="swiftCode" value={form.swiftCode || ''} onChange={(e) => updateField('swiftCode', e.target.value)} placeholder="SWIFT/BIC" /></div>
              <div className="space-y-2"><Label htmlFor="branchCode">Branch Code</Label><Input id="branchCode" value={form.branchCode || ''} onChange={(e) => updateField('branchCode', e.target.value)} placeholder="Branch/sort code" /></div>
            </div>
          </div>
          <div className="border-t pt-4">
            <h4 className="text-sm font-semibold mb-3">Bank Account 2</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2"><Label htmlFor="bankName2">Bank Name</Label><Input id="bankName2" value={form.bankName2 || ''} onChange={(e) => updateField('bankName2', e.target.value)} placeholder="Bank name" /></div>
              <div className="space-y-2"><Label htmlFor="accountName2">Account Name</Label><Input id="accountName2" value={form.accountName2 || ''} onChange={(e) => updateField('accountName2', e.target.value)} placeholder="Account holder name" /></div>
              <div className="space-y-2"><Label htmlFor="bankAccount2">Account Number</Label><Input id="bankAccount2" value={form.bankAccount2 || ''} onChange={(e) => updateField('bankAccount2', e.target.value)} placeholder="Account number" /></div>
              <div className="space-y-2"><Label htmlFor="swiftCode2">Swift Code</Label><Input id="swiftCode2" value={form.swiftCode2 || ''} onChange={(e) => updateField('swiftCode2', e.target.value)} placeholder="SWIFT/BIC" /></div>
              <div className="space-y-2"><Label htmlFor="branchCode2">Branch Code</Label><Input id="branchCode2" value={form.branchCode2 || ''} onChange={(e) => updateField('branchCode2', e.target.value)} placeholder="Branch/sort code" /></div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tax Settings (VAT) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Landmark className="size-5" />Tax Settings (VAT)</CardTitle>
          <CardDescription>Configure value-added tax settings.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>VAT Enabled</Label>
              <p className="text-xs text-muted-foreground">Toggle to enable/disable VAT on transactions.</p>
            </div>
            <Switch checked={form.vatEnabled === true} onCheckedChange={(checked: boolean) => updateField('vatEnabled', checked)} />
          </div>
          {form.vatEnabled && (
            <div className="space-y-2">
              <Label htmlFor="vatRate">VAT Rate (%)</Label>
              <Input id="vatRate" type="number" min="0" max="100" step="0.5" value={form.vatRate || 15} onChange={(e) => updateField('vatRate', parseFloat(e.target.value) || 0)} className="w-[200px]" />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CalendarClock className="size-5" />Operating policies</CardTitle>
          <CardDescription>Configurable defaults. These do not invent irreversible tax or legal treatment.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Timezone</Label>
              <Input value={form.calendarTimezone || ''} onChange={(e) => updateField('calendarTimezone', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Working weekdays (0=Sun)</Label>
              <Input value={form.calendarWeekdays || ''} onChange={(e) => updateField('calendarWeekdays', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Holidays (YYYY-MM-DD, comma)</Label>
              <Input value={form.calendarHolidays || ''} onChange={(e) => updateField('calendarHolidays', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Open hour</Label>
              <Input type="number" value={form.calendarOpenHour ?? 8} onChange={(e) => updateField('calendarOpenHour', Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>Close hour</Label>
              <Input type="number" value={form.calendarCloseHour ?? 17} onChange={(e) => updateField('calendarCloseHour', Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>First response hours</Label>
              <Input type="number" value={form.firstResponseHours ?? 2} onChange={(e) => updateField('firstResponseHours', Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>Reminder minutes before due</Label>
              <Input type="number" value={form.reminderMinutes ?? 30} onChange={(e) => updateField('reminderMinutes', Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>Escalation hours after overdue</Label>
              <Input type="number" value={form.escalationHours ?? 4} onChange={(e) => updateField('escalationHours', Number(e.target.value))} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t pt-4">
            <div className="space-y-2">
              <Label>Default billing arrangement</Label>
              <select className="w-full h-10 rounded-md border bg-background px-3 text-sm" value={form.billingArrangement || 'FULL_UPFRONT'} onChange={(e) => updateField('billingArrangement', e.target.value)}>
                <option value="FULL_UPFRONT">Full upfront</option>
                <option value="DEPOSIT_BALANCE">Deposit then balance</option>
                <option value="MILESTONES">Milestones</option>
                <option value="CREDIT">Credit / net days</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Credit net days</Label>
              <Input type="number" value={form.billingNetDays ?? 0} onChange={(e) => updateField('billingNetDays', Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>Deposit percent</Label>
              <Input type="number" value={form.billingDepositPercent ?? 30} onChange={(e) => updateField('billingDepositPercent', Number(e.target.value))} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Block job close when unpaid</Label>
                <p className="text-xs text-muted-foreground">Managers can still record the unpaid amount; closure waits for finance policy.</p>
              </div>
              <Switch checked={form.blockUnpaidJobClose !== false} onCheckedChange={(checked: boolean) => updateField('blockUnpaidJobClose', checked)} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Allow reopen of closed enquiries</Label>
                <p className="text-xs text-muted-foreground">Off by default. Reopen still requires a reason.</p>
              </div>
              <Switch checked={form.allowReopenClosedEnquiries === true} onCheckedChange={(checked: boolean) => updateField('allowReopenClosedEnquiries', checked)} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t pt-4">
            <div className="space-y-2">
              <Label>Acting PMO</Label>
              <select className="w-full h-10 rounded-md border bg-background px-3 text-sm" value={form.actingStorekeeperUid || ''} onChange={(e) => updateField('actingStorekeeperUid', e.target.value)}>
                <option value="">Not named yet</option>
                {store.users.map((item: any) => (
                  <option key={item.id || item.uid} value={item.id || item.uid}>{item.name || item.email || item.id}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Reservation expiry hours</Label>
              <Input type="number" value={form.reservationExpiryHours ?? 72} onChange={(e) => updateField('reservationExpiryHours', Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>Adjustment approver</Label>
              <select className="w-full h-10 rounded-md border bg-background px-3 text-sm" value={form.adjustmentApproverRole || 'ADMIN'} onChange={(e) => updateField('adjustmentApproverRole', e.target.value)}>
                <option value="ADMIN">Admin / Super Admin</option>
                <option value="MANAGER">Manager or Admin</option>
              </select>
            </div>
            <div className="flex items-center justify-between md:col-span-3">
              <div>
                <Label>Allow negative stock</Label>
                <p className="text-xs text-muted-foreground">Recommended off. Damaged quantity never increases usable availability.</p>
              </div>
              <Switch checked={form.allowNegativeStock === true} onCheckedChange={(checked: boolean) => updateField('allowNegativeStock', checked)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Terms & Conditions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><PenLine className="size-5" />Terms & Conditions</CardTitle>
          <CardDescription>Text blocks displayed on quotes, invoices, and job cards.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><Label htmlFor="paymentTerms">Payment Terms</Label><Textarea id="paymentTerms" value={form.paymentTerms || ''} onChange={(e) => updateField('paymentTerms', e.target.value)} placeholder="e.g. Payment due within 30 days..." rows={3} /></div>
          <div className="space-y-2"><Label htmlFor="termsAdvised">Please Be Advised</Label><Textarea id="termsAdvised" value={form.termsAdvised || ''} onChange={(e) => updateField('termsAdvised', e.target.value)} placeholder="Advisory text..." rows={3} /></div>
          <div className="space-y-2"><Label htmlFor="termsOther">Other Info</Label><Textarea id="termsOther" value={form.termsOther || ''} onChange={(e) => updateField('termsOther', e.target.value)} placeholder="Other terms..." rows={3} /></div>
          <div className="space-y-2"><Label htmlFor="moreTerms">More T&Cs</Label><Textarea id="moreTerms" value={form.moreTerms || ''} onChange={(e) => updateField('moreTerms', e.target.value)} placeholder="Additional terms and conditions..." rows={3} /></div>
        </CardContent>
      </Card>

      {/* Dashboard & UI Colors */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Palette className="size-5" />Dashboard & UI Colors</CardTitle>
          <CardDescription>Customize system colors and grid header styles.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h4 className="text-sm font-semibold mb-3">Status Colors</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <ColorField label="Low Stock" value={form.lowStockColor || '#ef4444'} onChange={(v) => updateField('lowStockColor', v)} />
              <ColorField label="Out of Stock" value={form.outOfStockColor || '#dc2626'} onChange={(v) => updateField('outOfStockColor', v)} />
              <ColorField label="EcoCash Balance" value={form.ecocashBalanceColor || '#22c55e'} onChange={(v) => updateField('ecocashBalanceColor', v)} />
              <ColorField label="Ledger Bank Balance" value={form.ledgerBankBalanceColor || '#3b82f6'} onChange={(v) => updateField('ledgerBankBalanceColor', v)} />
              <ColorField label="Ledger IRD Balance" value={form.ledgerIrdBalanceColor || '#8b5cf6'} onChange={(v) => updateField('ledgerIrdBalanceColor', v)} />
              <ColorField label="Pie Chart Income" value={form.pieIncomeColor || '#22c55e'} onChange={(v) => updateField('pieIncomeColor', v)} />
              <ColorField label="Pie Chart Expense" value={form.pieExpenseColor || '#ef4444'} onChange={(v) => updateField('pieExpenseColor', v)} />
              <ColorField label="Primary Brand" value={form.primaryBrandColor || '#f97316'} onChange={(v) => updateField('primaryBrandColor', v)} />
              <ColorField label="Secondary Brand" value={form.secondaryBrandColor || '#3b82f6'} onChange={(v) => updateField('secondaryBrandColor', v)} />
            </div>
          </div>
          <div className="border-t pt-4">
            <h4 className="text-sm font-semibold mb-3">Grid Header Colors</h4>
            {[{ key: 'crm', label: 'CRM' }, { key: 'opex', label: 'OPEX' }, { key: 'jobCards', label: 'Job Cards' }, { key: 'ledger', label: 'Ledger' }, { key: 'inventory', label: 'Inventory' }].map((grid) => (
              <div key={grid.key} className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-3 p-3 border rounded">
                <div className="text-sm font-medium flex items-center">{grid.label}</div>
                <ColorField label="Background" value={(form as any)[`${grid.key}HeaderBg`] || '#1e293b'} onChange={(v: string) => updateField(`${grid.key}HeaderBg`, v)} />
                <ColorField label="Text" value={(form as any)[`${grid.key}HeaderText`] || '#ffffff'} onChange={(v: string) => updateField(`${grid.key}HeaderText`, v)} />
                <ColorField label="Border" value={(form as any)[`${grid.key}HeaderBorder`] || '#334155'} onChange={(v: string) => updateField(`${grid.key}HeaderBorder`, v)} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Theme Background & Opacity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="size-5" />
            Theme Background & Opacity
          </CardTitle>
          <CardDescription>
            Upload a custom background image and set background transparency for the global application theme.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base">Background Images Gallery</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Upload backgrounds for users to choose from. Set a default background that will be shown to all users initially.
                </p>
              </div>
              <div className="flex gap-2">
                <input 
                  ref={bgInputRef} 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  onChange={(e) => handleFileSelect(e, setBgFile, setBgPreviewUrl)} 
                />
                {!bgFile ? (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => bgInputRef.current?.click()}
                  >
                    <Plus className="mr-2 size-4" />
                    Add Background
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs truncate max-w-[150px] text-muted-foreground">{bgFile.name}</span>
                    <Button 
                      size="sm" 
                      onClick={handleUploadBg} 
                      disabled={uploading}
                    >
                      {uploading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}
                      Upload
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="size-8 text-muted-foreground hover:text-destructive"
                      onClick={() => clearFile(setBgFile, setBgPreviewUrl, bgInputRef)}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Gallery Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 pt-2">
              {(s.backgroundImages || []).map((img: any) => {
                const isDefault = s.defaultBackgroundUrl === img.url || (!s.defaultBackgroundUrl && s.backgroundImageUrl === img.url)
                return (
                  <div 
                    key={img.url} 
                    className={`group relative rounded-lg border overflow-hidden bg-muted flex flex-col justify-between transition-all ${isDefault ? 'ring-2 ring-primary border-primary' : 'hover:border-foreground/50'}`}
                  >
                    <div className="relative h-28 w-full overflow-hidden bg-black/40">
                      <img 
                        src={img.url} 
                        alt={img.name || 'Background'} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      {isDefault && (
                        <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1 shadow">
                          <Star className="size-3 fill-current" /> Default
                        </div>
                      )}
                    </div>
                    <div className="p-2.5 bg-card border-t flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate" title={img.name}>{img.name || 'Image'}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {img.uploadedAt ? new Date(img.uploadedAt).toLocaleDateString() : 'Uploaded'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant={isDefault ? "secondary" : "ghost"}
                          size="icon"
                          className="size-7"
                          title={isDefault ? "Current default background" : "Set as default for all users"}
                          onClick={() => store.setDefaultBackground(isDefault ? '' : img.url)}
                        >
                          <Star className={`size-3.5 ${isDefault ? 'fill-amber-400 text-amber-500' : 'text-muted-foreground hover:text-amber-500'}`} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          title="Delete background image"
                          onClick={() => store.removeBackgroundImage(img.url)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}

              {(!s.backgroundImages || s.backgroundImages.length === 0) && !s.backgroundImageUrl && (
                <div className="col-span-full py-8 border border-dashed rounded-lg flex flex-col items-center justify-center text-center p-4 bg-muted/20">
                  <ImageIcon className="size-8 text-muted-foreground/40 mb-2" />
                  <p className="text-sm font-medium text-muted-foreground">No background images in gallery</p>
                  <p className="text-xs text-muted-foreground/80 mt-1 max-w-sm">
                    Click &quot;Add Background&quot; above to upload images that users can select as their workspace wallpaper.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label htmlFor="backgroundOpacity">Background Image Opacity ({form.backgroundOpacity ?? 15}%)</Label>
            </div>
            <div className="flex items-center gap-4">
              <input
                id="backgroundOpacity"
                type="range"
                min="0"
                max="100"
                step="5"
                value={form.backgroundOpacity ?? 15}
                onChange={(e) => updateField('backgroundOpacity', parseInt(e.target.value) || 0)}
                className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
              <Input
                type="number"
                min="0"
                max="100"
                value={form.backgroundOpacity ?? 15}
                onChange={(e) => updateField('backgroundOpacity', Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                className="w-20 font-mono text-center"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Adjusts the transparency of the background image. 0% hides the background completely (solid background), while 100% shows the background fully saturated.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Inventory Access PIN */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldAlert className="size-5" />Inventory Access PIN</CardTitle>
          <CardDescription>Set a PIN required for MANAGER role users to access inventory features.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="inventoryPin">New Inventory PIN</Label>
              <Input id="inventoryPin" type="password" value={inventoryPin} onChange={(e) => setInventoryPin(e.target.value)} placeholder="Minimum 4 characters" minLength={4} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inventoryPinConfirm">Confirm Inventory PIN</Label>
              <Input id="inventoryPinConfirm" type="password" value={inventoryPinConfirm} onChange={(e) => setInventoryPinConfirm(e.target.value)} placeholder="Re-enter PIN" minLength={4} />
            </div>
          </div>
          {s.inventoryManagerPinHash && <Button variant="destructive" size="sm" onClick={handleRemovePin}>Remove Inventory PIN</Button>}
        </CardContent>
      </Card>

      {/* System Data Migration */}
      <Card className="border-red-500/20 bg-red-500/5">
        <CardHeader>
          <CardTitle className="text-red-500 flex items-center gap-2"><ShieldAlert className="size-5" />System Data Migration Utility</CardTitle>
          <CardDescription className="text-red-500/70">One-time backfill migration to normalize categories and refactor approval identity fields to structured AuditActorRef objects.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button variant="destructive" onClick={runTaxonomyMigration} disabled={migrating}>
            {migrating ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Migrating Database...
              </>
            ) : (
              'Run Financial Taxonomy & Identity Migration'
            )}
          </Button>
          <Button
            variant="outline"
            className="border-red-500/30"
            onClick={runInventoryCategoryRename}
            disabled={renamingInventoryCategory || migrating}
          >
            {renamingInventoryCategory ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Renaming Water System labels...
              </>
            ) : (
              'Rename Water System (inventory, job cards, quotes, PDFs)'
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Floating Save Button */}
      <div className="fixed bottom-6 right-6 z-[60]">
        <Button size="lg" onClick={handleSaveAll} disabled={uploading || storeLoading} className="shadow-lg">
          {uploading ? <Loader2 className="mr-2 size-5 animate-spin" /> : <Save className="mr-2 size-5" />}
          Save All Settings
        </Button>
      </div>
    </div>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (color: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-10 h-10 rounded border cursor-pointer p-0.5" />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-[110px] text-xs font-mono" placeholder="#000000" />
      </div>
    </div>
  )
}