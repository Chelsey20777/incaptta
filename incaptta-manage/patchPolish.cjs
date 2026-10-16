const fs = require('fs')
const file = 'src\\views\\Approvals.vue'
let src = fs.readFileSync(file, 'utf8')

function replaceOnce(str, search, replacement) {
  const idx = str.indexOf(search)
  if (idx === -1) { console.warn('NOT FOUND:', search.slice(0, 80)); return str }
  return str.slice(0, idx) + replacement + str.slice(idx + search.length)
}

// 1. Add "Actual vs Original Target" under profit variance
// Find the closing p tag of the variance value, which is inside the Performance Benchmarks div
const BENCH = src.indexOf('<!-- Performance Benchmarks -->')
// Find "PROFIT VARIANCE" label within that section
const VAR_LABEL = 'PROFIT VARIANCE</p>'
const vl = src.indexOf(VAR_LABEL, BENCH)
// The variance amount is the next large text paragraph after that label
// Find its closing </p> followed by </div>
const VAR_CLOSE = '</p>\n                          </div>'
const vc = src.indexOf(VAR_CLOSE, vl)
if (vc !== -1) {
  const INSERT = '</p>\n                            <p class="text-[8px] italic mt-0.5" style="color:#3d6645">Actual vs Original Target</p>\n                          </div>'
  src = src.slice(0, vc) + INSERT + src.slice(vc + VAR_CLOSE.length)
  console.log('1. Added "Actual vs Original Target"')
} else {
  console.warn('1. variance close not found')
}

// 2. Make Revenue Breakdown rows have separators
// Use unique surrounding context to locate them
const REV_SPACE_FIND = 'class="space-y-3">\n                            <div class="flex justify-between"><span class="text-[11px]" style="color:#5a9c64">Inventory Sales'
const REV_SPACE_IDX = src.indexOf(REV_SPACE_FIND)
if (REV_SPACE_IDX !== -1) {
  // Find end of this div
  const REV_END = '</div>\n                          </div>\n                           <div class="mt-4 rounded-xl'
  const rev_end_idx = src.indexOf(REV_END, REV_SPACE_IDX)
  if (rev_end_idx !== -1) {
    const OLD_REV = src.slice(REV_SPACE_IDX, rev_end_idx + 6)
    // Extract the 3 line values from the old content
    const invSales = OLD_REV.match(/Inventory Sales<\/span><span[^>]+>(\$[^<]+)<\/span>/)?.[1] || ''
    const laborBilled = OLD_REV.match(/Labor[^<]+Billed<\/span><span[^>]+>(\$[^<]+)<\/span>/)?.[1] || ''
    
    const NEW_REV = `class="space-y-0">
                            <div class="flex justify-between items-center py-2.5 border-b" style="border-color:#1c3a21">
                              <span class="text-sm font-medium" style="color:#5a9c64">Inventory Sales</span>
                              <span class="text-sm font-black text-white">${{ fmt(fin.irdGrossRevenue) }}</span>
                            </div>
                            <div class="flex justify-between items-center py-2.5 border-b" style="border-color:#1c3a21">
                              <span class="text-sm font-medium" style="color:#5a9c64">Labor &amp; Expenses Billed</span>
                              <span class="text-sm font-black text-white">${{ fmt(fin.implementationCost) }}</span>
                            </div>
                            <div v-if="fin.totalAdjustments > 0" class="flex justify-between items-center py-2.5" style="color:#f59e0b">
                              <span class="text-sm font-medium">Adjustments (Reductions)</span>
                              <span class="text-sm font-black">-${{ fmt(fin.totalAdjustments) }}</span>
                            </div>
                          </div>`
    src = src.slice(0, REV_SPACE_IDX) + NEW_REV + src.slice(REV_SPACE_IDX + OLD_REV.length)
    console.log('2. Revenue breakdown rows upgraded')
  }
}

// 3. Make Cost Breakdown rows have separators
const COST_SPACE_FIND = 'class="space-y-2">\n                            <div class="flex justify-between"><span class="text-[11px]" style="color:#5a9c64">Inventory Base Cost'
const COST_SPACE_IDX = src.indexOf(COST_SPACE_FIND)
if (COST_SPACE_IDX !== -1) {
  const COST_END = '</div>\n                         </div>'
  const cost_end_idx = src.indexOf(COST_END, COST_SPACE_IDX)
  if (cost_end_idx !== -1) {
    const OLD_COST = src.slice(COST_SPACE_IDX, cost_end_idx)
    const NEW_COST = `class="space-y-0">
                            <div class="flex justify-between items-center py-2.5 border-b" style="border-color:#1c3a21">
                              <span class="text-sm font-medium" style="color:#5a9c64">Inventory Base Cost</span>
                              <span class="text-sm font-black text-white">${{ fmt(fin.irdBaseCost) }}</span>
                            </div>
                            <div class="flex justify-between items-center py-2.5 border-b" style="border-color:#1c3a21">
                              <span class="text-sm font-medium" style="color:#5a9c64">Staff &amp; Labor Costs</span>
                              <span class="text-sm font-black text-white">${{ fmt(fin.staffRatesTotal || 0) }}</span>
                            </div>
                            <div class="flex justify-between items-center py-2.5">
                              <span class="text-sm font-medium" style="color:#5a9c64">Ad-hoc Expenses</span>
                              <span class="text-sm font-black text-white">${{ fmt(fin.operationalExpenses) }}</span>
                            </div>
                          </div>`
    src = src.slice(0, COST_SPACE_IDX) + NEW_COST + src.slice(COST_SPACE_IDX + OLD_COST.length)
    console.log('3. Cost breakdown rows upgraded')
  }
}

// 4. Upgrade Collection Stats - find the block by its comment and replace the entire outer div
const OLD_COLL_COMMENT = '<!-- Collection Stats — 3-column matching main project -->'
const OLD_COLL_SIMPLE = '<!-- Collection Stats -->'
let collIdx = src.indexOf(OLD_COLL_COMMENT)
if (collIdx === -1) collIdx = src.indexOf(OLD_COLL_SIMPLE)

if (collIdx !== -1) {
  // Find the div opening after the comment
  const divStart = src.indexOf('<div', collIdx)
  // Walk to find matching closing div
  let depth = 0
  let i = divStart
  let divEnd = -1
  while (i < src.length) {
    if (src.slice(i, i+4) === '<div') depth++
    if (src.slice(i, i+6) === '</div>') {
      depth--
      if (depth === 0) { divEnd = i + 6; break }
    }
    i++
  }
  if (divEnd !== -1) {
    const NEW_COLL = `<!-- Collection Stats — 3-column matching main project -->
                      <div class="grid grid-cols-3 gap-px rounded-2xl overflow-hidden border border-white/5" style="background:#132b16">
                        <div class="p-4 flex flex-col" style="background:#0d1525">
                          <div class="flex items-center gap-1.5 mb-2">
                            <Wallet class="size-3.5" style="color:#3b82f6" />
                            <span class="text-[8px] font-black uppercase tracking-tighter" style="color:#3b82f6">TOTAL COLLECTED</span>
                          </div>
                          <p class="text-xl font-black" style="color:#3b82f6">${{ fmt(fin.totalPaid) }}</p>
                        </div>
                        <div class="p-4 flex flex-col" style="background:#1c150a">
                          <div class="flex items-center gap-1.5 mb-2">
                            <Clock class="size-3.5" style="color:#f59e0b" />
                            <span class="text-[8px] font-black uppercase tracking-tighter" style="color:#f59e0b">BALANCE DUE</span>
                          </div>
                          <p class="text-xl font-black" style="color:#f59e0b">${{ fmt(fin.balanceDue) }}</p>
                        </div>
                        <div class="p-4 flex flex-col" style="background:#0d1f10">
                          <div class="flex items-center justify-between mb-2">
                            <span class="text-[8px] font-black uppercase tracking-tighter" style="color:#3d6645">COLLECTION RATE</span>
                            <span class="text-[8px] font-black" style="color:#22c55e">{{ fin.collectionRate.toFixed(0) }}%</span>
                          </div>
                          <div class="flex-1 flex flex-col justify-end">
                            <div class="h-2.5 rounded-full overflow-hidden" style="background:#1c3a21">
                              <div class="h-full rounded-full transition-all duration-1000" style="background:#22c55e" :style="{width:fin.collectionRate+'%'}" />
                            </div>
                          </div>
                        </div>
                      </div>`
    src = src.slice(0, collIdx) + NEW_COLL + src.slice(divEnd)
    console.log('4. Collection stats upgraded to 3-column')
  }
}

fs.writeFileSync(file, src, 'utf8')
console.log('Done!')
