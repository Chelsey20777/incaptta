import {
  collection,
  doc,
  getDocs,
  updateDoc,
  writeBatch,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore'

export const WATER_SYSTEMS_NEW_NAME = 'Water System'

/** Legacy labels seen in inventory, job categories, and denormalized section fields. */
export const WATER_SYSTEMS_OLD_NAMES = [
  'Water systems installation',
  'Water system installations',
  'Water system systems',
  'Water Systems',
]

export function matchesWaterSystemsOldName(value: unknown): boolean {
  if (value == null || value === '') return false
  const normalized = String(value).trim().toLowerCase()
  return WATER_SYSTEMS_OLD_NAMES.some((old) => old.toLowerCase() === normalized)
}

function patchSectionFields(section: Record<string, unknown>, newName: string): boolean {
  let changed = false
  for (const key of ['name', 'category', 'description'] as const) {
    if (matchesWaterSystemsOldName(section[key])) {
      section[key] = newName
      changed = true
    }
  }
  return changed
}

function patchRequisitionSections(
  sections: unknown,
  newName: string
): { sections: unknown[]; changed: boolean } {
  if (!Array.isArray(sections)) return { sections: [], changed: false }
  let changed = false
  const patched = sections.map((raw) => {
    const section = { ...(raw as Record<string, unknown>) }
    if (patchSectionFields(section, newName)) changed = true
    return section
  })
  return { sections: patched, changed }
}

export type WaterSystemsRenameStats = {
  inventoryCategoriesUpdated: number
  inventoryItemsUpdated: number
  jobCategoriesUpdated: number
  jobCardsUpdated: number
  crmQuotesUpdated: number
  crmInvoicesUpdated: number
  bomTemplatesUpdated: number
}

export async function renameWaterSystemsCategoryFull(
  db: Firestore,
  newName: string = WATER_SYSTEMS_NEW_NAME
): Promise<WaterSystemsRenameStats> {
  const stats: WaterSystemsRenameStats = {
    inventoryCategoriesUpdated: 0,
    inventoryItemsUpdated: 0,
    jobCategoriesUpdated: 0,
    jobCardsUpdated: 0,
    crmQuotesUpdated: 0,
    crmInvoicesUpdated: 0,
    bomTemplatesUpdated: 0,
  }

  const catSnap = await getDocs(collection(db, 'inventoryCategories'))
  for (const d of catSnap.docs) {
    if (matchesWaterSystemsOldName(d.data().name)) {
      await updateDoc(doc(db, 'inventoryCategories', d.id), {
        name: newName,
        updatedAt: serverTimestamp(),
      })
      stats.inventoryCategoriesUpdated++
    }
  }

  let batch = writeBatch(db)
  let batchCount = 0
  const commitBatch = async () => {
    if (batchCount > 0) {
      await batch.commit()
      batch = writeBatch(db)
      batchCount = 0
    }
  }

  const itemsSnap = await getDocs(collection(db, 'inventoryItems'))
  for (const d of itemsSnap.docs) {
    if (matchesWaterSystemsOldName(d.data().categoryName)) {
      batch.update(doc(db, 'inventoryItems', d.id), {
        categoryName: newName,
        updatedAt: serverTimestamp(),
      })
      stats.inventoryItemsUpdated++
      batchCount++
      if (batchCount >= 500) await commitBatch()
    }
  }
  await commitBatch()

  const jobCatSnap = await getDocs(collection(db, 'jobCategories'))
  for (const d of jobCatSnap.docs) {
    if (matchesWaterSystemsOldName(d.data().name)) {
      await updateDoc(doc(db, 'jobCategories', d.id), {
        name: newName,
        updatedAt: serverTimestamp(),
      })
      stats.jobCategoriesUpdated++
    }
  }

  const jobSnap = await getDocs(collection(db, 'jobCards'))
  for (const d of jobSnap.docs) {
    const data = d.data()
    const sectionsResult = patchRequisitionSections(data.requisitionSections, newName)
    if (sectionsResult.changed) {
      batch.update(doc(db, 'jobCards', d.id), {
        requisitionSections: sectionsResult.sections,
        updatedAt: serverTimestamp(),
      })
      stats.jobCardsUpdated++
      batchCount++
      if (batchCount >= 400) await commitBatch()
    }
  }
  await commitBatch()

  for (const collName of ['crmQuotes', 'crmInvoices'] as const) {
    const snap = await getDocs(collection(db, collName))
    for (const d of snap.docs) {
      const data = d.data()
      const sectionsResult = patchRequisitionSections(data.requisitionSections, newName)
      if (sectionsResult.changed) {
        batch.update(doc(db, collName, d.id), {
          requisitionSections: sectionsResult.sections,
          updatedAt: serverTimestamp(),
        })
        if (collName === 'crmQuotes') stats.crmQuotesUpdated++
        else stats.crmInvoicesUpdated++
        batchCount++
        if (batchCount >= 400) await commitBatch()
      }
    }
  }
  await commitBatch()

  const bomSnap = await getDocs(collection(db, 'bomTemplates'))
  for (const d of bomSnap.docs) {
    const data = d.data()
    if (matchesWaterSystemsOldName(data.categoryDescription)) {
      batch.update(doc(db, 'bomTemplates', d.id), {
        categoryDescription: newName,
        updatedAt: serverTimestamp(),
      })
      stats.bomTemplatesUpdated++
      batchCount++
      if (batchCount >= 400) await commitBatch()
    }
  }
  await commitBatch()

  return stats
}
