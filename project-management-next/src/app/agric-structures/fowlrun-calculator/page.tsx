'use client'

import React from 'react'
import { CalculatorTab } from '@/components/agric-structures/CalculatorTab'
import { useRouter } from 'next/navigation'

export default function CalculatorPage() {
  const router = useRouter()

  const handleQuoteCreated = (jobCardId: string, jobNumber: string) => {
    router.push('/agric-structures/job-cards')
  }

  return (
    <CalculatorTab
      onQuoteCreated={handleQuoteCreated}
    />
  )
}