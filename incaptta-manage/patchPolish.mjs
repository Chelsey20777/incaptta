import { readFileSync, writeFileSync } from 'fs'

const file = 'src\\views\\Approvals.vue'
let src = readFileSync(file, 'utf8')

// Helper to safely replace without regex special chars
function replaceOnce(str, search, replacement) {
  const idx = str.indexOf(search)
  if (idx === -1) { console.warn('NOT FOUND:', search.slice(0, 60)); return str }
  return str.slice(0, idx) + replacement + str.slice(idx + search.length)
}

// 1. Add "Actual vs Original Target" subtitle under Profit Variance value
const A_FIND = `<p class="text-[8px] italic mt-0.5" style="color:#3d6645">Expected margin at creation</p>`
const A_NEXT = `</div>\n                        </div>`
const BENCH_START = src.indexOf('<!-- Performance Benchmarks -->')
const a_idx = src.indexOf(A_FIND, BENCH_START)
// Find the profit variance value paragraph closing
const VARIANCE_LABEL = `<p class="text-[9px] font-black uppercase tracking-tighter" style="color:#3d6645">PROFIT VARIANCE</p>`
const v_idx = src.indexOf(VARIANCE_LABEL)
// Add subtitle after the variance amount closing p tag - find it
const VARIANCE_P_CLOSE = `</p>\n                          </div>`
const vp_idx = src.indexOf(VARIANCE_P_CLOSE, v_idx)
if (vp_idx !== -1) {
  src = src.slice(0, vp_idx) + `</p>\n                            <p class="text-[8px] italic mt-0.5" style="color:#3d6645">Actual vs Original Target</p>\n                          </div>` + src.slice(vp_idx + VARIANCE_P_CLOSE.length)
  console.log('1. Added Actual vs Original Target label')
} else {
  console.warn('1. VARIANCE_P_CLOSE not found')
}

// 2. Upgrade Revenue Breakdown rows - add separators
const REV_FIND = `<div class="space-y-3">
                            <div class="flex justify-between"><span class="text-[11px]" style="color:#5a9c64">Inventory Sales</span><span class="text-[11px] font-black text-white">${{ fmt(fin.irdGrossRevenue) }}</span></div>
                            <div class="flex justify-between"><span class="text-[11px]" style="color:#5a9c64">Labor &amp; Expenses Billed</span><span class="text-[11px] font-black text-white">${{ fmt(fin.implementationCost) }}</span></div>
                            <div v-if="fin.totalAdjustments > 0" class="flex justify-between"><span class="text-[11px]" style="color:#f59e0b">Adjustments (Reductions)</span><span class="text-[11px] font-black" style="color:#f59e0b">-${{ fmt(fin.totalAdjustments) }}</span></div>
                          </div>`

const REV_REPLACE = `<div class="space-y-0">
                            <div class="flex justify-between items-center py-2 border-b" style="border-color:#1c3a21">
                              <span class="text-[12px]" style="color:#5a9c64">Inventory Sales</span>
                              <span class="text-[12px] font-black text-white">$\{{ fmt(fin.irdGrossRevenue) }}</span>
                            </div>
                            <div class="flex justify-between items-center py-2 border-b" style="border-color:#1c3a21">
                              <span class="text-[12px]" style="color:#5a9c64">Labor &amp; Expenses Billed</span>
                              <span class="text-[12px] font-black text-white">$\{{ fmt(fin.implementationCost) }}</span>
                            </div>
                            <div v-if="fin.totalAdjustments > 0" class="flex justify-between items-center py-2">
                              <span class="text-[12px] font-medium" style="color:#f59e0b">Adjustments (Reductions)</span>
                              <span class="text-[12px] font-black" style="color:#f59e0b">-$\{{ fmt(fin.totalAdjustments) }}</span>
                            </div>
                          </div>`

src = replaceOnce(src, REV_FIND, REV_REPLACE)
console.log('2. Revenue breakdown styled')

// 3. Upgrade Cost Breakdown rows
const COST_FIND = `<div class="space-y-2">
                            <div class="flex justify-between"><span class="text-[11px]" style="color:#5a9c64">Inventory Base Cost</span><span class="text-[11px] font-black text-white">${{ fmt(fin.irdBaseCost) }}</span></div>
                            <div class="flex justify-between"><span class="text-[11px]" style="color:#5a9c64">Staff &amp; Labor Costs</span><span class="text-[11px] font-black text-white">${{ fmt(fin.staffRatesTotal || 0) }}</span></div>
                            <div class="flex justify-between"><span class="text-[11px]" style="color:#5a9c64">Ad-hoc Expenses</span><span class="text-[11px] font-black text-white">${{ fmt(fin.operationalExpenses) }}</span></div>
                          </div>`

const COST_REPLACE = `<div class="space-y-0">
                            <div class="flex justify-between items-center py-2 border-b" style="border-color:#1c3a21">
                              <span class="text-[12px]" style="color:#5a9c64">Inventory Base Cost</span>
                              <span class="text-[12px] font-black text-white">$\{{ fmt(fin.irdBaseCost) }}</span>
                            </div>
                            <div class="flex justify-between items-center py-2 border-b" style="border-color:#1c3a21">
                              <span class="text-[12px]" style="color:#5a9c64">Staff &amp; Labor Costs</span>
                              <span class="text-[12px] font-black text-white">$\{{ fmt(fin.staffRatesTotal || 0) }}</span>
                            </div>
                            <div class="flex justify-between items-center py-2">
                              <span class="text-[12px]" style="color:#5a9c64">Ad-hoc Expenses</span>
                              <span class="text-[12px] font-black text-white">$\{{ fmt(fin.operationalExpenses) }}</span>
                            </div>
                          </div>`

src = replaceOnce(src, COST_FIND, COST_REPLACE)
console.log('3. Cost breakdown styled')

// 4. Upgrade Collection Stats to 3-column
const COLL_FIND = `<!-- Collection Stats — 3-column matching main project -->`
const COLL_OLD_FIND = `<!-- Collection Stats -->`
const collStart = src.indexOf(COLL_OLD_FIND) !== -1 ? src.indexOf(COLL_OLD_FIND) : src.indexOf(COLL_FIND)

// Find the end of collection block
const COLL_END_MARKER = `</div>\n\n</template>`
let coll_end = src.indexOf(COLL_END_MARKER, collStart)
if (coll_end === -1) {
  // Try alternative ending
  const ALT = `</div>\n</template>`
  coll_end = src.indexOf(ALT, collStart)
}

if (collStart !== -1 && coll_end !== -1) {
  // Find actual end of outer div
  // Count divs from collStart to find closing
  let depth = 0
  let i = collStart
  let foundStart = false
  let divEnd = -1
  while (i < src.length) {
    if (src.slice(i, i+4) === '<div') { depth++; foundStart = true }
    if (src.slice(i, i+6) === '</div>') { 
      if (foundStart) depth--
      if (foundStart && depth === 0) { divEnd = i + 6; break }
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
                          <p class="text-xl font-black" style="color:#3b82f6">$\{{ fmt(fin.totalPaid) }}</p>
                        </div>
                        <div class="p-4 flex flex-col" style="background:#1c150a">
                          <div class="flex items-center gap-1.5 mb-2">
                            <Clock class="size-3.5" style="color:#f59e0b" />
                            <span class="text-[8px] font-black uppercase tracking-tighter" style="color:#f59e0b">BALANCE DUE</span>
                          </div>
                          <p class="text-xl font-black" style="color:#f59e0b">$\{{ fmt(fin.balanceDue) }}</p>
                        </div>
                        <div class="p-4 flex flex-col" style="background:#0d1f10">
                          <div class="flex items-center justify-between mb-2">
                            <span class="text-[8px] font-black uppercase tracking-tighter" style="color:#3d6645">COLLECTION RATE</span>
                            <span class="text-[8px] font-black" style="color:#22c55e">\{{ fin.collectionRate.toFixed(0) }}%</span>
                          </div>
                          <div class="flex-1 flex flex-col justify-end">
                            <div class="h-2.5 rounded-full overflow-hidden" style="background:#1c3a21">
                              <div class="h-full rounded-full transition-all duration-1000" style="background:#22c55e" :style="{width:fin.collectionRate+'%'}" />
                            </div>
                          </div>
                        </div>
                      </div>`
    src = src.slice(0, collStart) + NEW_COLL + src.slice(divEnd)
    console.log('4. Collection stats upgraded to 3-column')
  }
}

writeFileSync(file, src, 'utf8')
console.log('Done!')
