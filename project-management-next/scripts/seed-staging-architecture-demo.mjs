/**
 * Idempotent staging-only demo: customer, won lead, open follow-up lead,
 * accepted quote with items, draft deposit invoice, and draft job card.
 *
 *   node --env-file=.env.local scripts/seed-staging-architecture-demo.mjs
 *
 * Always writes to incaptta-pro-staging. Aborts if any env or credential
 * still names production (incaptta-pro).
 */
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

const STAGING_PROJECT = 'incaptta-pro-staging'
const PRODUCTION_PROJECT = 'incaptta-pro'

const CUSTOMER_ID = 'sample_customer_riverside'
const WON_LEAD_ID = 'sample_lead_riverside'
const OPEN_LEAD_ID = 'sample_lead_open_followup'
const QUOTE_ID = 'sample_quote_riverside'
const JOB_ID = `job_from_quote_${QUOTE_ID}`
const INVOICE_ID = `inv_from_quote_${QUOTE_ID}_r1`

const SAMPLE_OWNER = { uid: 'sample-seed-owner', name: 'Ada Moyo' }
const ACCEPTOR = 'Tinashe Ncube'

const FALLBACK_ITEMS = [
  { id: 'sample-tank-5000', name: '5000L JoJo tank', sellingPrice: 420, unit: 'ea' },
  { id: 'sample-stand-steel', name: 'Steel tank stand', sellingPrice: 280, unit: 'ea' },
]

function abortIfProduction(label, value) {
  const normalized = String(value || '').trim()
  if (normalized === PRODUCTION_PROJECT) {
    throw new Error(`${label} is ${PRODUCTION_PROJECT}. Refusing to seed production.`)
  }
}

function loadCredential() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  if (raw) {
    const config = JSON.parse(raw)
    abortIfProduction('FIREBASE_SERVICE_ACCOUNT_KEY.project_id', config.project_id)
    return cert(config)
  }
  return applicationDefault()
}

abortIfProduction('FIREBASE_PROJECT_ID', process.env.FIREBASE_PROJECT_ID)
abortIfProduction('NEXT_PUBLIC_FIREBASE_PROJECT_ID', process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID)
abortIfProduction('GOOGLE_CLOUD_PROJECT', process.env.GOOGLE_CLOUD_PROJECT)
abortIfProduction('GCLOUD_PROJECT', process.env.GCLOUD_PROJECT)
abortIfProduction('GCP_PROJECT', process.env.GCP_PROJECT)

if (!getApps().length) {
  initializeApp({
    credential: loadCredential(),
    projectId: STAGING_PROJECT,
  })
}

const db = getFirestore()
const round2 = (value) => Number((Number(value) || 0).toFixed(2))
const nowIso = () => new Date().toISOString()

async function pickMaterials() {
  const snap = await db.collection('inventoryItems').limit(8).get()
  const live = snap.docs
    .map((docSnap) => {
      const data = docSnap.data()
      const name = data.name || data.itemName || ''
      const sellingPrice = Number(data.sellingPrice || 0)
      if (!name || !(sellingPrice > 0)) return null
      return { id: docSnap.id, name, sellingPrice, unit: data.uom || data.unit || 'ea' }
    })
    .filter(Boolean)
    .slice(0, 2)
  return live.length >= 2 ? live : FALLBACK_ITEMS
}

async function pickJobCategoryId() {
  const snap = await db.collection('jobCategories').limit(1).get()
  return snap.empty ? 'sample-water-systems' : snap.docs[0].id
}

function buildQuote(materials, jobCategoryId) {
  const qtys = [1, 1]
  const markups = [10, 15]
  const sectionItems = materials.map((item, index) => ({
    id: `sample_req_${item.id}`,
    inventoryItemId: item.id,
    itemName: item.name,
    description: item.name,
    qtyRequired: qtys[index] || 1,
    irdSellingPrice: item.sellingPrice,
    markupPercent: markups[index] || 10,
  }))
  const items = sectionItems.map((item) => {
    const base = round2(item.qtyRequired * item.irdSellingPrice)
    return {
      inventoryItemId: item.inventoryItemId,
      description: item.itemName,
      qty: item.qtyRequired,
      price: item.irdSellingPrice,
      markupPercent: item.markupPercent,
      total: round2(base + base * (item.markupPercent / 100)),
    }
  })
  const otherServices = [{
    id: 'sample_service_install',
    description: 'Site installation and commissioning',
    qty: 1,
    price: 150,
    total: 150,
  }]
  let irdCharge = 0
  let twidMarkup = 0
  for (const item of sectionItems) {
    const base = round2(item.qtyRequired * item.irdSellingPrice)
    irdCharge = round2(irdCharge + base)
    twidMarkup = round2(twidMarkup + round2(base * (item.markupPercent / 100)))
  }
  const services = 150
  const subtotal = round2(irdCharge + twidMarkup + services)
  const vatRate = 15
  const vatAmount = round2(subtotal * (vatRate / 100))
  const grandTotal = round2(subtotal + vatAmount)
  return {
    sectionItems,
    items,
    otherServices,
    jobCategoryId,
    summary: {
      totalIrdCost: irdCharge,
      totalMarkup: twidMarkup,
      totalOtherServices: services,
      subtotal,
      vatRate,
      vatAmount,
    },
    grandTotal,
    billingTerms: {
      arrangement: 'DEPOSIT_BALANCE',
      netDays: 0,
      depositPercent: 30,
    },
    internalCosting: {
      labourEstimate: 80,
      transportEstimate: 40,
      subcontractorEstimate: 0,
      otherDeliveryEstimate: 20,
    },
  }
}

async function main() {
  const appProject = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || ''
  if (appProject && appProject !== STAGING_PROJECT) {
    throw new Error(`Initialized against unexpected Cloud project ${appProject}`)
  }

  const materials = await pickMaterials()
  const jobCategoryId = await pickJobCategoryId()
  const quote = buildQuote(materials, jobCategoryId)
  const depositAmount = round2(quote.grandTotal * 0.3)
  const capturedAt = nowIso()
  const receivedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()

  await db.collection('customers').doc(CUSTOMER_ID).set({
    name: 'Riverside Poultry',
    company: 'Riverside Poultry',
    companyName: 'Riverside Poultry',
    email: 'sample.riverside@incaptta.example',
    phone: '0772123456',
    status: 'CUSTOMER',
    becameCustomerAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true })

  await db.collection('leads').doc(WON_LEAD_ID).set({
    companyName: 'Riverside Poultry',
    contactName: 'Tinashe Ncube',
    email: 'sample.riverside@incaptta.example',
    phone: '0772123456',
    stage: 'Won',
    priority: 'HIGH',
    value: quote.grandTotal,
    source: 'WhatsApp',
    notes: 'Need a 5000L tank and stand at the Riverside broiler site.',
    assignedTo: SAMPLE_OWNER.name,
    expectedCloseDate: new Date().toISOString().slice(0, 10),
    createdBy: SAMPLE_OWNER,
    receivedBy: SAMPLE_OWNER,
    owner: SAMPLE_OWNER,
    partyType: 'business',
    channel: 'WhatsApp',
    requirementSummary: 'Need a 5000L tank and stand at the Riverside broiler site.',
    nextActionSummary: 'Handover to delivery after acceptance',
    nextActionDueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
    customerId: CUSTOMER_ID,
    identityStatus: 'CUSTOMER',
    receivedAt,
    capturedAt,
    firstRespondedAt: capturedAt,
    linkedJobCardId: JOB_ID,
    activities: [
      {
        id: 'sample_act_capture',
        type: 'interaction',
        at: receivedAt,
        authorUid: SAMPLE_OWNER.uid,
        authorName: SAMPLE_OWNER.name,
        channel: 'WhatsApp',
        summary: 'Captured enquiry for tank and stand',
      },
      {
        id: 'sample_act_accept',
        type: 'stage',
        at: capturedAt,
        authorUid: SAMPLE_OWNER.uid,
        authorName: SAMPLE_OWNER.name,
        summary: 'Customer accepted approved quotation QT-SAMPLE-0001',
      },
    ],
    pendingHandover: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true })

  await db.collection('leads').doc(OPEN_LEAD_ID).set({
    companyName: '',
    contactName: 'Chipo Dube',
    email: 'chipo.dube@incaptta.example',
    phone: '0772987654',
    stage: 'Contacted',
    priority: 'MEDIUM',
    value: 900,
    source: 'phone',
    notes: 'Asked about a smaller tank for a garden cottage.',
    assignedTo: SAMPLE_OWNER.name,
    expectedCloseDate: '',
    createdBy: SAMPLE_OWNER,
    receivedBy: SAMPLE_OWNER,
    owner: SAMPLE_OWNER,
    partyType: 'individual',
    channel: 'phone',
    requirementSummary: 'Asked about a smaller tank for a garden cottage.',
    nextActionSummary: 'Call back with 2500L options',
    nextActionDueAt: new Date(Date.now() - 45 * 60 * 1000).toISOString().slice(0, 16),
    customerId: '',
    identityStatus: 'PROSPECT',
    receivedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    capturedAt,
    firstRespondedAt: capturedAt,
    activities: [{
      id: 'sample_act_open',
      type: 'next-action',
      at: capturedAt,
      authorUid: SAMPLE_OWNER.uid,
      authorName: SAMPLE_OWNER.name,
      channel: 'phone',
      summary: 'Left a voicemail; callback overdue',
    }],
    pendingHandover: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true })

  const requisitionSections = [{
    id: 'sample_section_water',
    jobCategoryId,
    description: 'Water storage',
    qty: 1,
    unit: 'Set',
    items: quote.sectionItems,
  }]

  await db.collection('crmQuotes').doc(QUOTE_ID).set({
    quoteNumber: 'QT-SAMPLE-0001',
    customerId: CUSTOMER_ID,
    customerName: 'Riverside Poultry',
    customerEmail: 'sample.riverside@incaptta.example',
    dimensionsOfStructure: '5000L tank on steel stand',
    status: 'ACCEPTED',
    reviewStatus: 'APPROVED_TO_SEND',
    validUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    notes: 'Deposit 30% on acceptance. Balance before dispatch.',
    billingTerms: quote.billingTerms,
    internalCosting: quote.internalCosting,
    leadId: WON_LEAD_ID,
    leadName: 'Riverside Poultry',
    linkedJobCardId: JOB_ID,
    linkedInvoiceId: INVOICE_ID,
    requisitionSections,
    items: quote.items,
    otherServices: quote.otherServices,
    summary: quote.summary,
    grandTotal: quote.grandTotal,
    acceptedBy: ACCEPTOR,
    acceptedAt: nowIso(),
    acceptanceEvidence: 'Verbal acceptance on WhatsApp, recorded for staging demo',
    acceptedRevisionId: QUOTE_ID,
    createdBy: SAMPLE_OWNER.uid,
    createdByName: SAMPLE_OWNER.name,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true })

  await db.collection('crmInvoices').doc(INVOICE_ID).set({
    invoiceNumber: `INV-DRAFT-${QUOTE_ID.slice(0, 8)}`,
    customerId: CUSTOMER_ID,
    customerName: 'Riverside Poultry',
    customerEmail: 'sample.riverside@incaptta.example',
    amount: depositAmount,
    amountPaid: 0,
    balance: depositAmount,
    status: 'DRAFT',
    dueDate: null,
    issuable: true,
    billingTerms: quote.billingTerms,
    billingHoldReason: 'Draft invoice. Finance issues it separately from sending and from job approval.',
    quoteId: QUOTE_ID,
    quoteNumber: 'QT-SAMPLE-0001',
    jobCardId: JOB_ID,
    notes: 'Draft billing stub from accepted quote QT-SAMPLE-0001 (30% deposit)',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true })

  await db.collection('jobCards').doc(JOB_ID).set({
    status: 'DRAFT',
    sourceQuoteId: QUOTE_ID,
    createdFromQuoteAcceptance: true,
    generalInfo: {
      jobCardTitle: 'Delivery from QT-SAMPLE-0001',
      jobTitle: 'Delivery from QT-SAMPLE-0001',
      projectDescription: 'Install tank and stand at Riverside Poultry.',
      dimensionsOfStructure: '5000L tank on steel stand',
      recipientName: 'Tinashe Ncube',
      recipientPhone: '0772123456',
      projectLocation: 'Riverside broiler site',
      linkedCrmId: QUOTE_ID,
      linkedCrmType: 'QUOTE',
      linkedCrmNumber: 'QT-SAMPLE-0001',
      linkedCrmTotal: quote.grandTotal,
      enquiryId: WON_LEAD_ID,
      acceptedQuoteRevisionId: QUOTE_ID,
      jobNumber: `JC-DRAFT-${QUOTE_ID.slice(0, 8)}`,
    },
    requisitionSections,
    requisitionItems: quote.items,
    otherServices: quote.otherServices,
    adHocExpenses: [],
    subcontractWorks: [],
    staffRates: [],
    internalEstimate: quote.internalCosting,
    paymentConditions: 'Pending finance billing arrangement',
    jobChecklists: {},
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true })

  console.log(JSON.stringify({
    project: STAGING_PROJECT,
    customerId: CUSTOMER_ID,
    wonLeadId: WON_LEAD_ID,
    openLeadId: OPEN_LEAD_ID,
    quoteId: QUOTE_ID,
    invoiceId: INVOICE_ID,
    jobCardId: JOB_ID,
    quoteNumber: 'QT-SAMPLE-0001',
    invoiceNumber: `INV-DRAFT-${QUOTE_ID.slice(0, 8)}`,
    jobNumber: `JC-DRAFT-${QUOTE_ID.slice(0, 8)}`,
    grandTotal: quote.grandTotal,
    depositAmount,
    materials: materials.map((item) => item.name),
  }, null, 2))
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
