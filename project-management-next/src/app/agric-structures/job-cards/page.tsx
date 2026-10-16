'use client'

import React, { useEffect } from 'react'
import { useAgricStructuresStore } from '@/stores/agric-structures-store'
import { QuotesTab } from '@/components/agric-structures/QuotesTab'
import { useRouter } from 'next/navigation'

export default function QuotesPage() {
  const {
    jobCards,
    loadingJobCards,
    fetchJobCards,
    cleanup,
  } = useAgricStructuresStore()

  const router = useRouter()

  useEffect(() => {
    const unsub = fetchJobCards()
    return () => {
      unsub()
      cleanup()
    }
  }, [])

  const handleTabChange = (newTab: string) => {
    if (newTab === 'overview') {
      router.push('/agric-structures')
    } else if (newTab === 'quotes') {
      router.push('/agric-structures/job-cards')
    } else if (newTab === 'calculator') {
      router.push('/agric-structures/fowlrun-calculator')
    } else if (newTab === 'inventory') {
      router.push('/agric-structures/inventory')
    }
  }

  return (
    <QuotesTab
      jobCards={jobCards}
      loadingJobCards={loadingJobCards}
      onSwitchTab={handleTabChange}
    />
  )
}