import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

// Target fields expected in our Inventory schema
const TARGET_FIELDS = [
  { name: 'sku', description: 'Unique Stock Keeping Unit code or part number' },
  { name: 'name', description: 'Name or title of the inventory item' },
  { name: 'description', description: 'Short description of the item' },
  { name: 'uom', description: 'Unit of Measure (e.g., PCS, sqm, kg, set)' },
  { name: 'onHand', description: 'Current available stock quantity / on hand' },
  { name: 'categoryName', description: 'Category of the item' },
  { name: 'location', description: 'Physical location of the stock' },
  { name: 'reorderLevel', description: 'Safety stock count that triggers a reorder alert' },
  { name: 'purchasePrice', description: 'Factory / Purchase price per unit' },
  { name: 'freightDuty', description: 'Freight, shipping, logistics, or duty cost per unit' },
  { name: 'markupPercent', description: 'Markup percentage to calculate selling price' },
  { name: 'isActive', description: 'Boolean indicating if the item is active' }
]

/**
 * Fallback fuzzy matcher if Gemini API key is missing
 */
function localFuzzyMapper(headers: string[], samples: string[][]) {
  const mappings: any[] = []
  const unmappedHeaders: string[] = []
  const formatWarnings: any[] = []

  const schemaWords: Record<string, string[]> = {
    sku: ['sku', 'item code', 'product code', 'part #', 'part number', 'id', 'barcode'],
    name: ['name', 'title', 'item', 'product', 'designation'],
    description: ['description', 'desc', 'notes', 'specifications'],
    uom: ['uom', 'unit', 'measure', 'measurement', 'pack size'],
    onHand: ['qty', 'quantity', 'on hand', 'count', 'stock', 'stock take', 'amount'],
    categoryName: ['category', 'group', 'type', 'classification'],
    location: ['location', 'shelf', 'warehouse', 'aisle', 'bin'],
    reorderLevel: ['reorder', 'safety', 'trigger', 'min level'],
    purchasePrice: ['purchase', 'cost', 'price', 'factory', 'buy', 'purchasing'],
    freightDuty: ['freight', 'duty', 'shipping', 'delivery', 'customs', 'transport'],
    markupPercent: ['markup', 'mark up', 'margin', 'profit', 'markup %'],
    isActive: ['active', 'status', 'enabled', 'isactive']
  }

  for (const header of headers) {
    const norm = header.toLowerCase().trim()
    let matched = false

    // Run fuzzy checks against schema definitions
    for (const [field, words] of Object.entries(schemaWords)) {
      if (words.some(w => norm.includes(w) || w.includes(norm))) {
        // Avoid mapping to same target multiple times
        if (!mappings.some(m => m.targetField === field)) {
          mappings.push({
            userHeader: header,
            targetField: field,
            confidence: norm === field ? 1.0 : 0.85
          })
          matched = true
          break
        }
      }
    }

    if (!matched) {
      unmappedHeaders.push(header)
    }

    // Inspect first sample rows to flag warning triggers (like currency signs or commas)
    const headerIndex = headers.indexOf(header)
    if (headerIndex !== -1) {
      const sampleVals = samples.map(row => row[headerIndex] || '').filter(Boolean)
      const hasCurrency = sampleVals.some(v => v.includes('$') || v.includes('€') || v.includes('£'))
      if (hasCurrency) {
        formatWarnings.push({
          userHeader: header,
          warning: `Contains currency signs. AI will clean these automatically.`
        })
      }
    }
  }

  return { mappings, unmappedHeaders, formatWarnings }
}

export async function POST(req: Request) {
  try {
    const { headers, samples } = await req.json()

    if (!headers || !Array.isArray(headers)) {
      return NextResponse.json({ error: 'Headers are required' }, { status: 400 })
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
    if (!apiKey) {
      console.warn('GEMINI_API_KEY is not defined in environment variables. Falling back to fuzzy local matcher.')
      const localResult = localFuzzyMapper(headers, samples || [])
      return NextResponse.json(localResult)
    }

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            mappings: {
              type: 'ARRAY',
              description: 'List of mapped headers against target inventory fields',
              items: {
                type: 'OBJECT',
                properties: {
                  userHeader: { type: 'STRING', description: 'The original column header name from the uploaded CSV' },
                  targetField: { type: 'STRING', description: 'The internal matching field in our inventory schema' },
                  confidence: { type: 'NUMBER', description: 'Confidence score between 0.0 and 1.0' }
                },
                required: ['userHeader', 'targetField', 'confidence']
              }
            },
            unmappedHeaders: {
              type: 'ARRAY',
              description: 'Any headers that did not map to any inventory field',
              items: { type: 'STRING' }
            },
            formatWarnings: {
              type: 'ARRAY',
              description: 'Warnings about formatting patterns noticed in sample rows (e.g., currency symbols, spaces)',
              items: {
                type: 'OBJECT',
                properties: {
                  userHeader: { type: 'STRING', description: 'The header of the column with the warning' },
                  warning: { type: 'STRING', description: 'The explanation of the formatting mismatch' }
                },
                required: ['userHeader', 'warning']
              }
            }
          },
          required: ['mappings', 'unmappedHeaders', 'formatWarnings']
        } as any
      }
    })

    const prompt = `
      You are an expert data migration assistant mapping user-supplied CSV files into our exact inventory database schema.
      
      ### Database Target Fields:
      ${JSON.stringify(TARGET_FIELDS, null, 2)}
      
      ### User Uploaded File Info:
      CSV Headers: ${JSON.stringify(headers)}
      First few rows (Samples): ${JSON.stringify(samples)}
      
      ### Instructions:
      1. Map each userHeader to at most ONE targetField. If a column has no corresponding target field, list it in "unmappedHeaders".
      2. If multiple CSV columns look like they could fit a target field, map the best match and leave the others unmapped or assign them lower priority.
      3. Inspect the sample row data. If any mapped numerical field (like purchasePrice, freightDuty, markupPercent, reorderLevel, onHand) contains non-numeric symbols like currency ($), commas, percent signs, spaces, or letters, add a warning in "formatWarnings" explaining that the format needs automatic cleaning on import.
      4. If active field contains non-standard values (e.g. Yes/No, Active/Inactive, 1/0), add a warning that it will be normalized to boolean.
    `

    const response = await model.generateContent(prompt)
    const text = response.response.text()
    const result = JSON.parse(text)

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Gemini Mapping API Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
