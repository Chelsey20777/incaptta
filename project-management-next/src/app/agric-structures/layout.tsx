'use client'

import React from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Building2, Calculator, Hammer, ClipboardList, Settings } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'

export default function AgricStructuresLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()

  const getTabFromPath = (path: string) => {
    const segments = path.split('/').filter(Boolean)
    if (segments.includes('fowlrun-calculator')) return 'calculator'
    if (segments.includes('inventory')) return 'inventory'
    if (segments.includes('job-cards')) return 'quotes'
    if (segments.includes('settings')) return 'settings'
    return 'overview'
  }

  const activeTab = getTabFromPath(pathname)

  const handleTabChange = (newTab: string) => {
    if (newTab === 'overview') {
      router.push('/agric-structures')
    } else if (newTab === 'quotes') {
      router.push('/agric-structures/job-cards')
    } else if (newTab === 'calculator') {
      router.push('/agric-structures/fowlrun-calculator')
    } else if (newTab === 'inventory') {
      router.push('/agric-structures/inventory')
    } else if (newTab === 'settings') {
      router.push('/agric-structures/settings')
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6 pb-24">
      {/* Header section */}
      <div>
        <h2 className="text-3xl font-extrabold tracking-tight flex items-center gap-2.5">
          <Building2 className="size-8 text-primary" />
          <span>Agricultural Structures Portal</span>
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          Calculate construction quotes, BOQ cost analysis, brick/cement template rates, and materials inventory.
        </p>
      </div>

      {/* Tabs Layout */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="flex items-center w-full justify-start overflow-x-auto scrollbar-none md:w-auto mb-6 gap-1.5 p-1 bg-muted/40 border backdrop-blur-md rounded-xl max-w-full">
          <TabsTrigger value="overview" className="flex items-center gap-1.5 font-bold shrink-0">
            <Building2 className="size-4" />
            <span>Overview</span>
          </TabsTrigger>
          <TabsTrigger value="quotes" className="flex items-center gap-1.5 font-bold shrink-0">
            <ClipboardList className="size-4" />
            <span>Quotes & Jobs</span>
          </TabsTrigger>
          <TabsTrigger value="calculator" className="flex items-center gap-1.5 font-bold shrink-0">
            <Calculator className="size-4" />
            <span>Fowlrun Calculator</span>
          </TabsTrigger>
          <TabsTrigger value="inventory" className="flex items-center gap-1.5 font-bold shrink-0">
            <Hammer className="size-4" />
            <span>Materials</span>
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-1.5 font-bold shrink-0">
            <Settings className="size-4" />
            <span>Settings</span>
          </TabsTrigger>
        </TabsList>

        <div className="mt-0">
          {children}
        </div>
      </Tabs>
    </div>
  )
}
