import { computed, ref, watch } from 'vue'
import type { BOQLineItem, CalculatorConfig, FowlrunCalculation, StructureSize } from '../types/fowlrun.types'
import { useAgricRates } from './useAgricRates'
import { useAgricTemplate } from './useAgricTemplate'

const BASE = { L: 80, W: 10 }

export function useFowlrunCalculator() {
  const { rates: storeRates, loading: loadingRates } = useAgricRates()
  const { items: templateItems, loading: loadingTemplate, fetchTemplate } = useAgricTemplate()

  const config = ref<CalculatorConfig>({
    brickUnitCost: 0.10,
    cementUnitCost: 10.00,
    includeLabour: true,
    includeTransport: true,
  })

  // Sync with store rates when they load
  watch(storeRates, (newRates) => {
    config.value = {
      brickUnitCost: newRates.brickUnitCost,
      cementUnitCost: newRates.cementUnitCost,
      includeLabour: newRates.includeLabour,
      includeTransport: newRates.includeTransport,
    }
  }, { immediate: true })

  const selectedSize = ref<StructureSize>({ label: '80x10m', length: 80, width: 10 })
  const customLength = ref<number | null>(null)
  const customWidth = ref<number | null>(null)
  const useCustom = ref(false)

  const activeSize = computed<StructureSize>(() => {
    if (useCustom.value && customLength.value && customWidth.value) {
      return {
        label: `${customLength.value}x${customWidth.value}m`,
        length: customLength.value,
        width: customWidth.value,
      }
    }
    return selectedSize.value
  })

  const calculation = computed<FowlrunCalculation>(() => {
    const { length: L, width: W } = activeSize.value
    const area = L * W
    const perimeter = 2 * (L + W)
    const wallH = 1.8
    const wallArea = perimeter * wallH
    const scale = area / (BASE.L * BASE.W)
    const bays = Math.ceil(L / 5)

    // Context for dynamic formula evaluation
    const context: Record<string, number> = {
      area,
      perimeter,
      wallArea,
      scale,
      bays
    }

    const allItems: BOQLineItem[] = templateItems.value
      .filter(item => {
        if (item.category === 'labour' && !config.value.includeLabour) return false
        if (item.category === 'transport' && !config.value.includeTransport) return false
        return true
      })
      .map(item => {
        const qty = Math.ceil(item.multiplier * (context[item.variable] || 0))
        
        // Determine unit price: use global rates for bricks/cement, else use template's baseUnitPrice
        let unitPrice = item.baseUnitPrice || 0
        if (item.id === 'bricks') unitPrice = config.value.brickUnitCost
        if (item.id === 'cement') unitPrice = config.value.cementUnitCost

        return {
          id: item.id,
          description: item.description,
          unit: item.unit,
          qty,
          unitPrice,
          category: item.category,
          total: parseFloat((qty * unitPrice).toFixed(2))
        }
      })

    const materialsTotal  = allItems.filter(i => i.category === 'material').reduce((s, i) => s + i.total, 0)
    const labourTotal     = allItems.filter(i => i.category === 'labour').reduce((s, i) => s + i.total, 0)
    const transportTotal  = allItems.filter(i => i.category === 'transport').reduce((s, i) => s + i.total, 0)

    return {
      size: activeSize.value,
      area,
      perimeter,
      bays,
      birdCapacityMin: area * 10,
      birdCapacityMax: area * 15,
      items: allItems,
      materialsTotal,
      labourTotal,
      transportTotal,
      grandTotal: materialsTotal + labourTotal + transportTotal,
    }
  })

  function selectSize(size: StructureSize) {
    useCustom.value = false
    selectedSize.value = size
  }

  function applyCustomSize() {
    if (customLength.value && customWidth.value) {
      useCustom.value = true
    }
  }

  function resetCustom() {
    useCustom.value = false
    customLength.value = null
    customWidth.value = null
  }

  return {
    config,
    selectedSize,
    activeSize,
    customLength,
    customWidth,
    useCustom,
    calculation,
    selectSize,
    applyCustomSize,
    resetCustom,
  }
}
