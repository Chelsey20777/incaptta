'use client'

import React, { useEffect, useState, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useInventoryStore } from '@/stores/inventory-store'
import { useAuthStore } from '@/stores/auth-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Package, Search, AlertTriangle, Download, Upload, FileSpreadsheet, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import InventorySpreadsheetGrid from '@/features/inventory/components/InventorySpreadsheetGrid'
import PmoReceiptQueue from '@/features/inventory/components/PmoReceiptQueue'
import { downloadInventoryTemplateCsv, exportInventoryCsv } from '@/features/inventory/utils/importCsv'
import CsvMapperModal from '@/features/inventory/components/CsvMapperModal'


export default function InventoryPage() {
  const router = useRouter()
  const store = useInventoryStore()
  const authStore = useAuthStore()

  const [stockMode, setStockMode] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const [isImporting, setIsImporting] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [isMapperOpen, setIsMapperOpen] = useState(false)
  const [isOptionsOpen, setIsOptionsOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const optionsRef = useRef<HTMLDivElement | null>(null)

  // Roles verification
  const isAdmin = authStore.isSuperAdmin() || authStore.hasRole('ADMIN' as any)
  const canView = authStore.hasAnyRole(['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'STOREKEEPER', 'MANAGER'] as any)
  const canManage = isAdmin
  const canDecideReceipt = authStore.hasAnyRole(['MANAGER', 'DIRECTOR', 'ADMIN', 'SUPER_ADMIN'] as any)

  useEffect(() => {
    store.fetchItems()
    store.fetchCategories()
  }, [])

  // Close Options dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (optionsRef.current && !optionsRef.current.contains(e.target as Node)) {
        setIsOptionsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filteredItems = useMemo(() => {
    let result = store.items
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(i => i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q))
    }
    if (activeTab === 'lowStock') {
      result = result.filter(i => i.reorderLevel !== undefined && i.onHand <= i.reorderLevel)
    } else if (activeTab === 'active') {
      result = result.filter(i => i.isActive)
    } else if (activeTab === 'inactive') {
      result = result.filter(i => !i.isActive)
    }
    return result
  }, [store.items, searchQuery, activeTab])

  const lowStockCount = store.items.filter(i => i.reorderLevel !== undefined && i.onHand <= i.reorderLevel).length
  const totalValue = store.items.reduce((sum, i) => sum + (i.onHand * (i.sellingPrice || 0)), 0)

  const handleDownloadTemplate = () => {
    try {
      downloadInventoryTemplateCsv(store.items, store.categories)
      toast.success("Stock Take Template Downloaded")
    } catch (err: any) {
      toast.error("Failed to download template", { description: err.message })
    }
  }

  const handleExportInventory = () => {
    try {
      exportInventoryCsv(store.items)
      toast.success("Inventory Exported Successfully")
    } catch (err: any) {
      toast.error("Failed to export inventory", { description: err.message })
    }
  }

  const triggerFileInput = () => {
    fileInputRef.current?.click()
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!authStore.user || !isAdmin) {
      toast.error("Administrator permission is required")
      return
    }

    setPendingFile(file)
    setIsMapperOpen(true)
  }

  if (store.loading && store.items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <RefreshCw className="size-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-medium">Loading Inventory Master...</p>
      </div>
    )
  }

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <AlertTriangle className="w-12 h-12 text-destructive" />
        <div>
          <h3 className="text-lg font-semibold">Access Denied</h3>
          <p className="text-muted-foreground">You do not have permission to view the inventory master.</p>
        </div>
        <Button variant="outline" onClick={() => router.push('/')}>Go to Dashboard</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {canDecideReceipt && <PmoReceiptQueue canDecide />}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Inventory Master</h2>
          <p className="text-muted-foreground">Manage stock items, pricing, margins, and reorder alerts in real-time.</p>
        </div>
        <div className="flex items-center gap-2">
          {canManage && <input type="file" ref={fileInputRef} accept=".csv" className="hidden" onChange={handleFileUpload} />}

          <Button variant="outline" size="sm" onClick={() => store.fetchItems()} disabled={store.loading || isImporting}>
            <RefreshCw className={`size-4 mr-2 ${store.loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          {canManage && (
            <div ref={optionsRef} className="relative">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isImporting || stockMode}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setIsOptionsOpen(prev => !prev)
                }}
              >
                {isImporting ? <RefreshCw className="size-4 mr-2 animate-spin" /> : <Upload className="size-4 mr-2" />}
                Options
              </Button>
              {isOptionsOpen && (
                <div
                  className="absolute right-0 top-full mt-1 z-50 min-w-44 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <p className="px-1.5 py-1 text-xs font-medium text-muted-foreground">Batch Actions</p>
                  <div className="-mx-1 my-1 h-px bg-border" />
                  <button
                    type="button"
                    className="flex w-full cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-sm hover:bg-accent hover:text-accent-foreground"
                    onClick={() => { setIsOptionsOpen(false); triggerFileInput() }}
                  >
                    <Upload className="mr-2 h-4 w-4 text-primary" /> Import Stock Take (CSV)
                  </button>
                  <button
                    type="button"
                    className="flex w-full cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-sm hover:bg-accent hover:text-accent-foreground"
                    onClick={() => { setIsOptionsOpen(false); handleExportInventory() }}
                  >
                    <Download className="mr-2 h-4 w-4 text-primary" /> Export Inventory (CSV)
                  </button>
                  <div className="-mx-1 my-1 h-px bg-border" />
                  <button
                    type="button"
                    className="flex w-full cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-sm hover:bg-accent hover:text-accent-foreground"
                    onClick={() => { setIsOptionsOpen(false); handleDownloadTemplate() }}
                  >
                    <FileSpreadsheet className="mr-2 h-4 w-4" /> Download Empty Template
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Items</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{store.items.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Low Stock Items</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-500">{lowStockCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">IRD Selling Value</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Categories</CardTitle>
            <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{store.categories.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by SKU or name..."
            className="pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">All Items</TabsTrigger>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="inactive">Inactive</TabsTrigger>
          <TabsTrigger value="lowStock" className="text-amber-500">
            Low Stock {lowStockCount > 0 && <Badge variant="secondary" className="ml-2 bg-amber-500 text-white">{lowStockCount}</Badge>}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Spreadsheet Grid */}
      {!store.categoriesLoading && (store.categoriesError || store.categories.length === 0) && (
        <Card className={store.categoriesError ? 'border-destructive/50' : 'border-amber-500/50'}>
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">
                {store.categoriesError ? 'Inventory categories are unavailable' : 'No inventory categories configured'}
              </p>
              <p className="text-sm text-muted-foreground">
                {store.categoriesError
                  ? store.categoriesError
                  : 'Create an inventory category under Settings → Inventory Cats before adding inventory items.'}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => store.fetchCategories()}
              disabled={store.categoriesLoading}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${store.categoriesLoading ? 'animate-spin' : ''}`} />
              Refresh Categories
            </Button>
          </CardContent>
        </Card>
      )}
      <InventorySpreadsheetGrid
          onStockModeChange={setStockMode}
        items={filteredItems}
        categories={store.categories}
        canManage={canManage}
        canCreateItem={canManage && store.categories.length > 0 && !store.categoriesError}
        onRefresh={() => store.fetchItems()}
      />

      {canManage && (
        <CsvMapperModal
          isOpen={isMapperOpen}
          onClose={() => {
            setIsMapperOpen(false)
            setPendingFile(null)
            if (fileInputRef.current) fileInputRef.current.value = ''
          }}
          file={pendingFile}
          onSuccess={() => {
            store.fetchItems()
          }}
        />
      )}
    </div>
  )
}
