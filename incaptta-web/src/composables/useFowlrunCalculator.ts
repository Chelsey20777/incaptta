import { computed, ref } from 'vue'
import type { BOQLineItem, CalculatorConfig, FowlrunCalculation, StructureSize } from '@/types/fowlrun.types'

const BASE = { L: 80, W: 10 }

export function useFowlrunCalculator() {
  const config = ref<CalculatorConfig>({
    brickUnitCost: 0.10,
    cementUnitCost: 10.00,
    includeLabour: true,
    includeTransport: true,
  })

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

    const brickQty = Math.ceil(wallArea * 55)

    const materials: BOQLineItem[] = [
      { unit: 'BRICKS', qty: brickQty,            description: 'Common bricks (115mm thick wall)',           unitPrice: config.value.brickUnitCost,   category: 'material', total: 0 },
      { unit: 'pc',     qty: Math.ceil(7  * scale), description: 'Deformed bar 14mm',                         unitPrice: 6.00,                          category: 'material', total: 0 },
      { unit: 'm³',     qty: Math.ceil(85 * scale), description: 'River sand / quarry dust',                  unitPrice: 20.00,                         category: 'material', total: 0 },
      { unit: 'm³',     qty: Math.ceil(30 * scale), description: 'Pit sand',                                  unitPrice: 20.00,                         category: 'material', total: 0 },
      { unit: 'BAGS',   qty: Math.ceil(400* scale), description: 'Cement (Preferably Superset)',              unitPrice: config.value.cementUnitCost,  category: 'material', total: 0 },
      { unit: 'ROLLS',  qty: Math.ceil(2  * scale), description: 'Damp proof course 230mm wall',              unitPrice: 2.50,                          category: 'material', total: 0 },
      { unit: 'm³',     qty: Math.ceil(80 * scale), description: 'Quarry stones',                             unitPrice: 18.00,                         category: 'material', total: 0 },
      { unit: 'm²',     qty: Math.ceil(area),        description: 'Black polythene paper',                    unitPrice: 0.39,                          category: 'material', total: 0 },
      { unit: 'litres', qty: Math.ceil(80 * scale), description: 'Termite poison',                            unitPrice: 0.50,                          category: 'material', total: 0 },
      { unit: 'units',  qty: Math.ceil(11 * scale), description: 'Brickforce 230x20',                         unitPrice: 2.50,                          category: 'material', total: 0 },
      { unit: 'rolls',  qty: Math.ceil(14 * scale), description: 'DPC 115x20',                                unitPrice: 2.50,                          category: 'material', total: 0 },
      { unit: 'm³',     qty: Math.ceil(18 * scale), description: 'Gravel (estimated on site)',                unitPrice: 18.00,                         category: 'material', total: 0 },
      { unit: 'BRFCE',  qty: Math.ceil(16 * scale), description: 'Brickforce 115x20',                        unitPrice: 2.50,                          category: 'material', total: 0 },
    ]

    const labour: BOQLineItem[] = [
      { unit: 'LBR', qty: 1, description: 'Labour — foundation, plastering, flooring', unitPrice: Math.ceil(4000 * scale), category: 'labour', total: 0 },
    ]

    const transport: BOQLineItem[] = [
      { unit: 'trips', qty: Math.ceil(10 * scale), description: 'Transport / deliveries',    unitPrice: 150.00,                    category: 'transport', total: 0 },
      { unit: '-',     qty: 1,                      description: 'Supervisor transport',      unitPrice: Math.ceil(400 * scale),    category: 'transport', total: 0 },
    ]

    const allItems: BOQLineItem[] = [
      ...materials,
      ...(config.value.includeLabour ? labour : []),
      ...(config.value.includeTransport ? transport : []),
    ].map(i => ({ ...i, total: parseFloat((i.qty * i.unitPrice).toFixed(2)) }))

    const materialsTotal  = materials.reduce((s, i) => s + i.qty * i.unitPrice, 0)
    const labourTotal     = labour.reduce((s, i) => s + i.qty * i.unitPrice, 0)
    const transportTotal  = transport.reduce((s, i) => s + i.qty * i.unitPrice, 0)

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
      grandTotal:
        materialsTotal +
        (config.value.includeLabour ? labourTotal : 0) +
        (config.value.includeTransport ? transportTotal : 0),
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
