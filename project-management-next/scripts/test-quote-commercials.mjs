import assert from 'node:assert/strict'
import { test } from 'node:test'
import { computeFinancials } from '../src/lib/financial-engine.ts'
import {
  calculateQuoteCommercials,
  lineExtendedAmounts,
  prepareQuoteAcceptanceCommercial,
  sectionExtendedTotal,
} from '../src/lib/crm/quotation-commercial.ts'

const round2 = (value) => Number(Number(value || 0).toFixed(2))

const pan = {
  id: 'pan',
  inventoryItemId: 'pan',
  itemName: 'Pan (PF01)',
  qtyRequired: 4,
  irdSellingPrice: 12.2,
  markupPercent: 0,
  costSnapshot: 0,
}
const curtains = {
  id: 'pvc',
  inventoryItemId: 'pvc',
  itemName: 'PVC Curtains 3m x 1m (PVC3M)',
  qtyRequired: 6,
  irdSellingPrice: 34.5,
  markupPercent: 0,
  costSnapshot: 0,
}

test('line totals follow quantity, not the unit price', () => {
  assert.equal(lineExtendedAmounts(pan).totalPrice, 48.8)
  assert.equal(lineExtendedAmounts(curtains).totalPrice, 207)
  assert.equal(sectionExtendedTotal({ items: [pan, curtains] }), 255.8)
})

test('quote, invoice, and job use the same extended total and purchase cost', () => {
  const quote = {
    requisitionSections: [{
      id: 'section-1',
      qty: 4,
      unit: 'UNIT',
      jobCategoryId: 'cat',
      items: [pan, curtains],
    }],
    otherServices: [],
    summary: { subtotal: 46.7, vatAmount: 0, vatRate: 15 },
  }
  const prepared = prepareQuoteAcceptanceCommercial(quote, { pan: 3.05, pvc: 23 })

  assert.equal(prepared.calculated.subtotal, 255.8)
  assert.equal(prepared.calculated.purchaseCost, 150.2)
  assert.equal(prepared.grandTotal, 255.8)
  assert.equal(prepared.calculated.vatAmount, 0)
  assert.equal(prepared.items[0].costSnapshot, 3.05)
  assert.equal(prepared.items[0].rowGrandTot, 48.8)
  assert.equal(prepared.items[1].costSnapshot, 23)
  assert.equal(prepared.items[1].rowGrandTot, 207)

  const financials = computeFinancials(prepared.sections, [], [], [], [], 'DRAFT', [])
  assert.equal(financials.irdGrossRevenue, 255.8)
  assert.equal(financials.irdBaseCost, 150.2)
  assert.equal(financials.totalInvoiceValue, 255.8)
})

test('linked job bills the quote and keeps a later subcontract as cost', () => {
  const pvc = {
    itemName: 'PVC Curtains 3m x 1m (PVC3M)',
    qtyRequired: 3,
    irdSellingPrice: 34.5,
    markupPercent: 10,
    costSnapshot: 23,
    approvalStatus: 'PENDING',
  }
  const panLine = {
    itemName: 'Pan (PF01)',
    qtyRequired: 4,
    irdSellingPrice: 12.2,
    markupPercent: 10,
    costSnapshot: 3.05,
    approvalStatus: 'PENDING',
  }
  const financials = computeFinancials(
    [{ items: [pvc, panLine] }],
    [],
    [],
    [],
    [],
    'APPROVED_MANAGER',
    [{
      isScnLink: true,
      contractValue: 20,
      totalAmount: 20,
      paidApprovedTotal: 10,
      approvalStatus: 'PENDING',
    }],
    [{ description: 'Installation', qty: 1, price: 100, total: 100 }],
    { countPendingMaterials: true, linkedCrmTotal: 267.53 },
  )

  assert.equal(financials.totalInvoiceValue, 267.53)
  assert.equal(financials.initialInvoiceValue, 267.53)
  assert.equal(financials.irdGrossRevenue, 152.3)
  assert.equal(financials.irdBaseCost, 81.2)
  assert.equal(financials.irdNetRevenue, 71.1)
  assert.equal(financials.irdRevenuePercentage.toFixed(1), '46.7')
  assert.equal(financials.twidNetAfterAdjustments, 15.23)
  assert.equal(financials.twidRevenuePercentage.toFixed(2), '5.69')
  assert.equal(financials.billedLabor, 100)
  assert.equal(financials.subcontractWorksTotal, 20)
  assert.equal(financials.totalCost, 101.2)
  assert.equal(financials.netProfit, 166.33)
  assert.equal(financials.profitMargin.toFixed(1), '62.2')

  const hiddenUntilApproved = computeFinancials(
    [{ items: [pvc, panLine] }],
    [],
    [],
    [],
    [],
    'DRAFT',
    [{ totalAmount: 20, approvalStatus: 'APPROVED_MANAGER' }],
  )
  assert.equal(hiddenUntilApproved.irdGrossRevenue, 0)
  assert.equal(hiddenUntilApproved.totalInvoiceValue, 20)
  assert.equal(hiddenUntilApproved.totalCost, 20)
})

test('internal profit subtracts purchase cost, not the selling price', () => {
  const calculated = calculateQuoteCommercials({
    materials: [
      { ...pan, costSnapshot: 3.05 },
      { ...curtains, costSnapshot: 23 },
    ],
    services: [],
    vatEnabled: false,
  })
  assert.equal(calculated.subtotal, 255.8)
  assert.equal(calculated.purchaseCost, 150.2)
  assert.equal(calculated.estimatedProfit, 105.6)
  assert.equal(calculated.discountAmount, 0)

  const percentOff = calculateQuoteCommercials({
    materials: [{ ...pan, costSnapshot: 3.05 }],
    services: [],
    vatEnabled: true,
    vatRate: 15,
    discountType: 'PERCENT',
    discountValue: 10,
  })
  assert.equal(percentOff.discountAmount, round2(percentOff.subtotal * 0.1))
  assert.equal(percentOff.vatAmount, round2(percentOff.netSubtotal * 0.15))
  assert.equal(percentOff.customerTotal, round2(percentOff.netSubtotal + percentOff.vatAmount))

  const flatOff = calculateQuoteCommercials({
    materials: [{ ...pan, costSnapshot: 3.05 }],
    services: [],
    vatEnabled: false,
    discountType: 'FLAT',
    discountValue: 999999,
  })
  assert.equal(flatOff.discountAmount, flatOff.subtotal)
  assert.equal(flatOff.customerTotal, 0)
})
