'use client'

import React, { useEffect, useState } from 'react'
import { useAgricStructuresStore } from '@/stores/agric-structures-store'
import { OverviewTab } from '@/components/agric-structures/OverviewTab'

export default function OverviewPage() {
  const {
    jobCards,
    rates,
    loadingJobCards,
    loadingRates,
    isProcessing,
    fetchJobCards,
    fetchRates,
    updateRates,
    cleanup,
  } = useAgricStructuresStore()

  const [editRates, setEditRates] = useState({ brickUnitCost: 0, cementUnitCost: 0 })
  const [includeLabour, setIncludeLabour] = useState(true)
  const [includeTransport, setIncludeTransport] = useState(true)

  useEffect(() => {
    const unsub = fetchJobCards()
    fetchRates()
    return () => {
      unsub()
      cleanup()
    }
  }, [])

  useEffect(() => {
    setEditRates({
      brickUnitCost: rates.brickUnitCost,
      cementUnitCost: rates.cementUnitCost,
    })
    setIncludeLabour(rates.includeLabour)
    setIncludeTransport(rates.includeTransport)
  }, [rates])

  const handleSaveRates = async () => {
    try {
      await updateRates({
        brickUnitCost: editRates.brickUnitCost,
        cementUnitCost: editRates.cementUnitCost,
        includeLabour,
        includeTransport,
      })
    } catch (err: any) {
      console.error(err)
    }
  }

  return (
    <OverviewTab
      jobCards={jobCards}
      rates={rates}
      loadingJobCards={loadingJobCards}
      loadingRates={loadingRates}
      isProcessing={isProcessing}
      editRates={editRates}
      setEditRates={setEditRates}
      includeLabour={includeLabour}
      setIncludeLabour={setIncludeLabour}
      includeTransport={includeTransport}
      setIncludeTransport={setIncludeTransport}
      onSaveRates={handleSaveRates}
    />
  )
}