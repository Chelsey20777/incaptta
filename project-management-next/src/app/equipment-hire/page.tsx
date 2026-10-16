'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { useEquipmentHireStore } from '@/stores/equipment-hire-store'
import { HireContract, EquipmentAsset } from '@/types/equipment-hire'
import { useAuthStore } from '@/stores/auth-store'
import { UserRole } from '@/constants/roles'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { DispatchBoard } from '@/components/equipment-hire/DispatchBoard'
import { RentalWizard } from '@/components/equipment-hire/RentalWizard'
import { AssetForm } from '@/components/equipment-hire/AssetForm'
import { StandbyDayManager } from '@/components/equipment-hire/StandbyDayManager'
import { 
  Truck, 
  Plus, 
  Calendar, 
  FileText, 
  Settings2, 
  Search, 
  CloudRain, 
  History, 
  ClipboardCheck, 
  Ban,
  Wrench,
  Egg,
  Tag
} from 'lucide-react'

// Gated roles allowed to access B2B Equipment Hire
const ALLOWED_ROLES: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TECHNICAL', 'DIRECTOR']

export default function EquipmentHirePage() {
  const { assets, contracts, fetchData, createAsset, loading } = useEquipmentHireStore()
  const { user, hasAnyRole, loading: authLoading } = useAuthStore()

  // Tab State
  const [activeTab, setActiveTab] = useState('dispatch')

  // Modals state
  const [wizardOpen, setWizardOpen] = useState(false)
  const [activeContractToProgress, setActiveContractToProgress] = useState<HireContract | null>(null)
  const [assetFormOpen, setAssetFormOpen] = useState(false)
  const [standbyOpen, setStandbyOpen] = useState(false)
  const [selectedStandbyContract, setSelectedStandbyContract] = useState<HireContract | null>(null)

  // Filters state
  const [contractSearch, setContractSearch] = useState('')
  const [assetSearch, setAssetSearch] = useState('')

  // Bind snapshot listeners
  useEffect(() => {
    const unsub = fetchData()
    return () => unsub()
  }, [fetchData])

  // Filtered lists
  const filteredContracts = useMemo(() => {
    return contracts.filter(c => 
      c.customerName.toLowerCase().includes(contractSearch.toLowerCase()) ||
      c.assetName.toLowerCase().includes(contractSearch.toLowerCase()) ||
      c.id.toLowerCase().includes(contractSearch.toLowerCase())
    )
  }, [contracts, contractSearch])

  const filteredAssets = useMemo(() => {
    return assets.filter(a => 
      a.name.toLowerCase().includes(assetSearch.toLowerCase()) ||
      a.serialNumber.toLowerCase().includes(assetSearch.toLowerCase()) ||
      a.category.toLowerCase().includes(assetSearch.toLowerCase())
    )
  }, [assets, assetSearch])

  // Helper stats
  const stats = useMemo(() => {
    const active = contracts.filter(c => c.status === 'Active').length
    const available = assets.filter(a => a.status === 'Available').length
    const maintenance = assets.filter(a => a.status === 'Maintenance').length
    return { active, available, maintenance }
  }, [contracts, assets])

  // Auth gate check
  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-2">
          <div className="size-8 animate-spin rounded-full border-4 border-brand-primary border-t-transparent" />
          <span className="text-sm font-semibold text-muted-foreground">Authenticating session...</span>
        </div>
      </div>
    )
  }

  if (!user || !hasAnyRole(ALLOWED_ROLES)) {
    return (
      <div className="flex h-[80vh] flex-col items-center justify-center gap-4 text-center p-6">
        <Ban className="size-16 text-red-500" />
        <h1 className="text-2xl font-bold">Access Denied</h1>
        <p className="text-muted-foreground max-w-md">
          You do not have the required permissions to view the B2B Equipment Hire module. Please contact your administrator.
        </p>
      </div>
    )
  }

  const getContractStatusBadge = (status: HireContract['status']) => {
    const styles: Record<HireContract['status'], string> = {
      Draft: 'bg-muted text-muted-foreground border-muted-foreground/30',
      Active: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
      Pending_Return: 'bg-amber-500/10 text-amber-500 border-amber-500/20 animate-pulse',
      Closed: 'bg-blue-500/10 text-blue-500 border-blue-500/20'
    }
    return (
      <Badge variant="outline" className={`font-bold ${styles[status]}`}>
        {status.replace('_', ' ')}
      </Badge>
    )
  }

  const openWizardForContract = (contract: HireContract) => {
    setActiveContractToProgress(contract)
    setWizardOpen(true)
  }

  const openStandbyManager = (contract: HireContract) => {
    setSelectedStandbyContract(contract)
    setStandbyOpen(true)
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6 pb-24">
      {/* Header and Quick Stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-2.5">
            <Truck className="size-8 text-brand-primary" />
            <span>B2B Equipment Hire</span>
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage heavy agricultural machinery, implements, customer contracts, and dispatch logs.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={() => {
              setActiveContractToProgress(null)
              setWizardOpen(true)
            }}
            className="bg-brand-primary hover:bg-brand-primary/95 text-white flex items-center gap-1.5 font-bold shadow-md rounded-lg"
          >
            <Plus className="size-4" />
            <span>New Hire Contract</span>
          </Button>
        </div>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card/50 backdrop-blur-sm shadow border-muted/50 rounded-xl">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-xs font-semibold text-muted-foreground uppercase">Active Contracts</span>
              <p className="text-3xl font-black text-foreground">{stats.active}</p>
            </div>
            <div className="p-3 rounded-lg bg-emerald-500/10 text-emerald-500">
              <FileText className="size-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm shadow border-muted/50 rounded-xl">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-xs font-semibold text-muted-foreground uppercase">Available Fleet Assets</span>
              <p className="text-3xl font-black text-brand-primary">{stats.available}</p>
            </div>
            <div className="p-3 rounded-lg bg-green-500/10 text-brand-primary">
              <Truck className="size-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm shadow border-muted/50 rounded-xl">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-xs font-semibold text-muted-foreground uppercase">Assets in Maintenance</span>
              <p className="text-3xl font-black text-amber-500">{stats.maintenance}</p>
            </div>
            <div className="p-3 rounded-lg bg-amber-500/10 text-amber-500">
              <Wrench className="size-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs Layout */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-3 w-full max-w-[400px] mb-4">
          <TabsTrigger value="dispatch">Dispatch Board</TabsTrigger>
          <TabsTrigger value="contracts">Contracts</TabsTrigger>
          <TabsTrigger value="assets">Assets Fleet</TabsTrigger>
        </TabsList>

        {/* TAB 1: DISPATCH BOARD */}
        <TabsContent value="dispatch" className="mt-0">
          <DispatchBoard assets={assets} contracts={contracts} />
        </TabsContent>

        {/* TAB 2: CONTRACTS */}
        <TabsContent value="contracts" className="mt-0 space-y-4">
          <Card className="bg-card/45 backdrop-blur-sm border shadow-md rounded-xl">
            <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4">
              <div>
                <CardTitle>Hire Contracts Ledger</CardTitle>
                <CardDescription>View, approve standby days, and run inspections on rental contracts.</CardDescription>
              </div>
              <div className="relative w-full md:max-w-[280px]">
                <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  placeholder="Search by customer or asset..."
                  value={contractSearch}
                  onChange={e => setContractSearch(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-12 text-center text-muted-foreground">Loading contracts...</div>
              ) : filteredContracts.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground italic">No contracts found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left divide-y border-t">
                    <thead className="bg-muted/30 uppercase text-[10px] text-muted-foreground font-bold">
                      <tr>
                        <th className="p-4">Contract ID</th>
                        <th className="p-4">Customer</th>
                        <th className="p-4">Asset</th>
                        <th className="p-4">Date Range</th>
                        <th className="p-4">Type</th>
                        <th className="p-4">Daily Rate</th>
                        <th className="p-4">Status</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y font-semibold">
                      {filteredContracts.map(contract => (
                        <tr key={contract.id} className="hover:bg-muted/10 transition-colors">
                          <td className="p-4 font-mono font-bold text-foreground">{contract.id}</td>
                          <td className="p-4">
                            <div className="flex flex-col">
                              <span>{contract.customerName}</span>
                              <span className="text-[10px] text-muted-foreground font-mono">{contract.customerId}</span>
                            </div>
                          </td>
                          <td className="p-4">{contract.assetName}</td>
                          <td className="p-4">
                            <div className="flex flex-col">
                              <span>{contract.startDate} to {contract.endDate}</span>
                              {contract.standbyDays && contract.standbyDays.length > 0 && (
                                <span className="text-[10px] text-blue-500 font-semibold">
                                  {contract.standbyDays.length} Standby Day(s) Approved
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-4">
                            <Badge variant={contract.hireType === 'WET' ? 'default' : 'secondary'} className="text-[10px]">
                              {contract.hireType}
                            </Badge>
                          </td>
                          <td className="p-4">${contract.baseDailyRate}/day</td>
                          <td className="p-4">{getContractStatusBadge(contract.status)}</td>
                          <td className="p-4 text-right space-x-1.5 whitespace-nowrap">
                            {contract.status === 'Draft' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openWizardForContract(contract)}
                                className="h-8 border-brand-primary/30 text-brand-primary hover:bg-brand-primary/10"
                              >
                                <ClipboardCheck className="size-3.5 mr-1" />
                                Inspect Gate-Out
                              </Button>
                            )}
                            {contract.status === 'Active' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openStandbyManager(contract)}
                                  className="h-8 border-blue-500/30 text-blue-500 hover:bg-blue-500/10"
                                >
                                  <CloudRain className="size-3.5 mr-1" />
                                  Standby
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => openWizardForContract(contract)}
                                  className="h-8 bg-brand-primary hover:bg-brand-primary/95 text-white"
                                >
                                  Record Return
                                </Button>
                              </>
                            )}
                            {contract.status === 'Pending_Return' && (
                              <Button
                                size="sm"
                                onClick={() => openWizardForContract(contract)}
                                className="h-8 bg-brand-primary hover:bg-brand-primary/95 text-white font-bold"
                              >
                                Review Invoice
                              </Button>
                            )}
                            {contract.status === 'Closed' && (
                              <span className="text-[10px] text-muted-foreground italic pr-4">Posted</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: ASSETS */}
        <TabsContent value="assets" className="mt-0 space-y-4">
          <Card className="bg-card/45 backdrop-blur-sm border shadow-md rounded-xl">
            <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4">
              <div>
                <CardTitle>Fleet Assets Ledger</CardTitle>
                <CardDescription>View HP rating, implement compatibility tags, and operational hours.</CardDescription>
              </div>
              <div className="flex items-center gap-2 w-full md:max-w-[450px]">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, serial, category..."
                    value={assetSearch}
                    onChange={e => setAssetSearch(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>
                <Button
                  onClick={() => setAssetFormOpen(true)}
                  className="bg-brand-primary hover:bg-brand-primary/95 text-white h-9 font-bold shrink-0"
                >
                  <Plus className="size-4 mr-1" />
                  Add Asset
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-12 text-center text-muted-foreground">Loading assets...</div>
              ) : filteredAssets.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground italic">No assets found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left divide-y border-t">
                    <thead className="bg-muted/30 uppercase text-[10px] text-muted-foreground font-bold">
                      <tr>
                        <th className="p-4">Asset Name</th>
                        <th className="p-4">Serial Number</th>
                        <th className="p-4">Category</th>
                        <th className="p-4">Current Engine Hours</th>
                        <th className="p-4">Odometer</th>
                        <th className="p-4">Compatibility Specs</th>
                        <th className="p-4 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y font-semibold">
                      {filteredAssets.map(asset => (
                        <tr key={asset.id} className="hover:bg-muted/10 transition-colors">
                          <td className="p-4 font-bold text-foreground">{asset.name}</td>
                          <td className="p-4 font-mono">{asset.serialNumber}</td>
                          <td className="p-4">
                            <Badge variant="outline" className="text-[10px]">
                              {asset.category}
                            </Badge>
                          </td>
                          <td className="p-4">{asset.currentEngineHours.toFixed(1)} hrs</td>
                          <td className="p-4">{asset.currentOdometer.toFixed(0)} km</td>
                          <td className="p-4">
                            <div className="flex flex-wrap gap-1">
                              {asset.compatibilityTags.length === 0 ? (
                                <span className="text-muted-foreground text-[10px] italic">No tags</span>
                              ) : (
                                asset.compatibilityTags.map(tag => (
                                  <Badge key={tag} variant="secondary" className="text-[9px] px-1.5 py-0">
                                    <Tag className="size-2 mr-0.5 text-muted-foreground" />
                                    {tag}
                                  </Badge>
                                ))
                              )}
                            </div>
                          </td>
                          <td className="p-4 text-right">
                            {asset.status === 'Available' && <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 font-bold uppercase text-[10px]">Available</Badge>}
                            {asset.status === 'On_Hire' && <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 font-bold uppercase text-[10px]">On Hire</Badge>}
                            {asset.status === 'Maintenance' && <Badge className="bg-red-500/10 text-red-500 border-red-500/20 font-bold uppercase text-[10px]">Maintenance</Badge>}
                            {asset.status === 'Standby' && <Badge className="bg-purple-500/10 text-purple-500 border-purple-500/20 font-bold uppercase text-[10px]">Standby</Badge>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modals & Dialogs */}
      <RentalWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        contractToProgress={activeContractToProgress}
      />

      <AssetForm
        open={assetFormOpen}
        onOpenChange={setAssetFormOpen}
        onSubmit={createAsset}
      />

      <StandbyDayManager
        open={standbyOpen}
        onOpenChange={setStandbyOpen}
        contract={selectedStandbyContract}
      />
    </div>
  )
}
