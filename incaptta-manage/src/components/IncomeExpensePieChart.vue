<script setup lang="ts">
import { computed, ref, onMounted, watch, onUnmounted } from 'vue'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { useAdminStore } from '@/stores/adminStore'
import { storeToRefs } from 'pinia'

const props = defineProps<{ ledger: any[] }>()
const adminStore = useAdminStore()
const { appSettings } = storeToRefs(adminStore)
const canvasRef = ref<HTMLCanvasElement | null>(null)
let resizeObserver: ResizeObserver | null = null

const chartData = computed(() => {
    if (!props.ledger || props.ledger.length === 0) return []
    let totalIncome = 0, totalExpense = 0
    props.ledger.forEach(item => {
        if (item.type === 'INCOME') totalIncome += Math.abs(Number(item.amount) || 0)
        else if (item.type === 'EXPENSE') totalExpense += Math.abs(Number(item.amount) || 0)
    })
    return [
        { name: 'Income', value: totalIncome, color: appSettings.value?.uiColors?.pieChartIncomeColor || '#79c21b' },
        { name: 'Expenses', value: totalExpense, color: appSettings.value?.uiColors?.pieChartExpenseColor || '#ff8903' }
    ]
})

function formatCurrency(val: any) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(val) || 0)
}

function hexToRgb(hex: string) {
    hex = hex.replace(/^\s*#|\s*$/g, '')
    if (hex.length === 3) hex = hex.replace(/(.)/g, '$1$1')
    return {
        r: parseInt(hex.substr(0, 2), 16),
        g: parseInt(hex.substr(2, 2), 16),
        b: parseInt(hex.substr(4, 2), 16)
    }
}


function drawSideWall(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number,
    rx: number, ry: number,
    depth: number,
    startAngle: number, endAngle: number,
    color: string
) {
    const { r, g, b } = hexToRgb(color)


    ctx.beginPath()
    ctx.moveTo(cx + rx * Math.cos(startAngle), cy + ry * Math.sin(startAngle))
    ctx.ellipse(cx, cy, rx, ry, 0, startAngle, endAngle)
    ctx.lineTo(cx + rx * Math.cos(endAngle), cy + depth + ry * Math.sin(endAngle))
    ctx.ellipse(cx, cy + depth, rx, ry, 0, endAngle, startAngle, true)
    ctx.closePath()

    // Horizontal gradient: dark edges, lighter in middle of front face
    const grad = ctx.createLinearGradient(cx - rx, cy, cx + rx, cy)
    grad.addColorStop(0,   `rgba(${Math.floor(r*0.3)},${Math.floor(g*0.3)},${Math.floor(b*0.3)},1)`)
    grad.addColorStop(0.35,`rgba(${Math.floor(r*0.55)},${Math.floor(g*0.55)},${Math.floor(b*0.55)},1)`)
    grad.addColorStop(0.5, `rgba(${Math.floor(r*0.75)},${Math.floor(g*0.75)},${Math.floor(b*0.75)},1)`)
    grad.addColorStop(0.65,`rgba(${Math.floor(r*0.55)},${Math.floor(g*0.55)},${Math.floor(b*0.55)},1)`)
    grad.addColorStop(1,   `rgba(${Math.floor(r*0.3)},${Math.floor(g*0.3)},${Math.floor(b*0.3)},1)`)

    ctx.fillStyle = grad
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'
    ctx.lineWidth = 0.8
    ctx.stroke()
}

function drawTopFace(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number,
    rx: number, ry: number,
    startAngle: number, endAngle: number,
    color: string
) {
    const { r, g, b } = hexToRgb(color)
    const midAngle = (startAngle + endAngle) / 2

    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.ellipse(cx, cy, rx, ry, 0, startAngle, endAngle)
    ctx.closePath()

    // Radial gradient: bright highlight offset toward top-left
    const hx = cx + rx * 0.3 * Math.cos(midAngle - 0.5)
    const hy = cy + ry * 0.3 * Math.sin(midAngle - 0.5)
    const grad = ctx.createRadialGradient(hx, hy, 0, cx, cy, rx)
    grad.addColorStop(0,   `rgba(${Math.min(255,r+80)},${Math.min(255,g+80)},${Math.min(255,b+80)},1)`)
    grad.addColorStop(0.45,`rgba(${r},${g},${b},1)`)
    grad.addColorStop(1,   `rgba(${Math.floor(r*0.75)},${Math.floor(g*0.75)},${Math.floor(b*0.75)},1)`)
    ctx.fillStyle = grad
    ctx.fill()

    // Slice border
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'
    ctx.lineWidth = 1.2
    ctx.stroke()
}

function drawChart() {
    const canvas = canvasRef.value
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    canvas.width  = rect.width  * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const W = rect.width
    const H = rect.height
    ctx.clearRect(0, 0, W, H)

    const data = chartData.value
    const hasData = data.length >= 2 && ((data[0]?.value ?? 0) > 0 || (data[1]?.value ?? 0) > 0)
    if (!hasData) return

    const total = data.reduce((s, d) => s + d.value, 0)
    if (total === 0) return

    const cx    = W / 2
    const cy    = H * 0.40
    const rx    = Math.min(W * 0.40, H * 0.52)
    const ry    = rx * 0.40        // tilt ratio — makes it look viewed from ~23° elevation
    const depth = rx * 0.30        // extrusion height

    // Build slice angles
    type Slice = { start: number; end: number; mid: number; color: string; name: string; value: number }
    const slices: Slice[] = []
    let cur = -Math.PI / 2        // start from 12 o'clock
    for (const item of data) {
        const sweep = (item.value / total) * Math.PI * 2
        const start = cur
        const end   = cur + sweep
        slices.push({ start, end, mid: (start + end) / 2, color: item.color, name: item.name, value: item.value })
        cur = end
    }

    // ── Drop shadow beneath the pie ──────────────────────────────────────────
    ctx.save()
    ctx.shadowColor   = 'rgba(0,0,0,0.55)'
    ctx.shadowBlur    = 36
    ctx.shadowOffsetY = depth + 8
    ctx.beginPath()
    ctx.ellipse(cx, cy + depth + 4, rx * 0.88, ry * 0.88, 0, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,0,0,0.01)'   // nearly transparent fill just to trigger shadow
    ctx.fill()
    ctx.restore()

    // ── Render order: back side walls → all top faces → front side walls ────
    //   "back"  = sin(midAngle) < 0  (upper half of tilted ellipse, far from viewer)
    //   "front" = sin(midAngle) >= 0 (lower half, near viewer)
    const backSlices  = [...slices].filter(s => Math.sin(s.mid) < 0)
        .sort((a, b) => Math.sin(a.mid) - Math.sin(b.mid))
    const frontSlices = [...slices].filter(s => Math.sin(s.mid) >= 0)
        .sort((a, b) => Math.sin(a.mid) - Math.sin(b.mid))

    // 1. Back side walls
    for (const s of backSlices) drawSideWall(ctx, cx, cy, rx, ry, depth, s.start, s.end, s.color)

    // 2. Top faces (back → front for correct painter's order)
    const topOrder = [...slices].sort((a, b) => Math.sin(a.mid) - Math.sin(b.mid))
    for (const s of topOrder) drawTopFace(ctx, cx, cy, rx, ry, s.start, s.end, s.color)

    // 3. Front side walls (on top of everything)
    for (const s of frontSlices) drawSideWall(ctx, cx, cy, rx, ry, depth, s.start, s.end, s.color)

    // ── Donut hole ───────────────────────────────────────────────────────────
    const holeRx = rx * 0.42
    const holeRy = ry * 0.42

    // Hole side wall (dark cylinder)
    ctx.beginPath()
    ctx.ellipse(cx, cy,         holeRx, holeRy, 0, 0, Math.PI * 2)
    ctx.ellipse(cx, cy + depth, holeRx, holeRy, 0, Math.PI * 2, 0, true)
    ctx.closePath()
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fill()

    // Hole bottom cap
    ctx.beginPath()
    ctx.ellipse(cx, cy + depth, holeRx, holeRy, 0, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    ctx.fill()

    // Hole top cap (matches background — use very dark fill)
    ctx.beginPath()
    ctx.ellipse(cx, cy, holeRx, holeRy, 0, 0, Math.PI * 2)
    const bgGrad = ctx.createRadialGradient(cx, cy - holeRy * 0.3, 0, cx, cy, holeRx)
    bgGrad.addColorStop(0, 'rgba(20,30,20,0.95)')
    bgGrad.addColorStop(1, 'rgba(8,15,8,0.98)')
    ctx.fillStyle = bgGrad
    ctx.fill()

    // ── Center label ─────────────────────────────────────────────────────────
    const netBalance = (data[0]?.value || 0) - (data[1]?.value || 0)
    const labelColor = data[0]?.color || '#79c21b'

    ctx.save()
    ctx.textAlign    = 'center'
    ctx.textBaseline = 'middle'

    // "NET BALANCE" sub-label
    ctx.font         = `bold ${Math.max(8, rx * 0.09)}px system-ui,sans-serif`
    ctx.fillStyle    = labelColor
    ctx.shadowColor  = 'rgba(0,0,0,0.9)'
    ctx.shadowBlur   = 6
    ctx.fillText('NET BALANCE', cx, cy - rx * 0.10)

    // Amount
    ctx.font         = `bold ${Math.max(13, rx * 0.17)}px system-ui,sans-serif`
    ctx.fillStyle    = '#ffffff'
    ctx.shadowBlur   = 8
    ctx.fillText(formatCurrency(netBalance), cx, cy + rx * 0.10)
    ctx.restore()
}

onMounted(() => {
    const canvas = canvasRef.value
    if (!canvas) return
    resizeObserver = new ResizeObserver(() => drawChart())
    resizeObserver.observe(canvas)
    drawChart()
})

onUnmounted(() => resizeObserver?.disconnect())

watch(chartData, () => drawChart(), { deep: true })
</script>

<template>
    <Card class="h-full bg-card backdrop-blur-md text-foreground dark:text-white border shadow-lg">
        <CardHeader>
            <CardTitle :style="{ color: appSettings?.uiColors?.pieChartIncomeColor || '#79c21b' }">
                Financial Summary
            </CardTitle>
        </CardHeader>
        <CardContent class="flex flex-col items-center justify-center px-4 pb-4">
            <div v-if="chartData.length < 2 || ((chartData[0]?.value || 0) === 0 && (chartData[1]?.value || 0) === 0)"
                class="h-[240px] flex items-center justify-center text-muted-foreground italic text-sm">
                No financial data available...
            </div>
            <div v-else class="w-full">
                <canvas ref="canvasRef" class="w-full" style="height: 240px; display: block;" />
                <!-- Legend -->
                <div class="grid grid-cols-2 gap-3 w-full mt-1 px-2">
                    <div v-for="item in chartData" :key="item.name"
                        class="flex items-center gap-2.5 rounded-lg p-2.5 border border-border/40 bg-muted/20">
                        <div class="size-3 rounded-full shrink-0 shadow-md" :style="{ backgroundColor: item.color }" />
                        <div class="min-w-0">
                            <p class="text-[10px] text-muted-foreground font-medium uppercase tracking-wide truncate">{{ item.name }}</p>
                            <p class="text-sm font-bold truncate">{{ formatCurrency(item.value) }}</p>
                        </div>
                    </div>
                </div>
            </div>
        </CardContent>
    </Card>
</template>
