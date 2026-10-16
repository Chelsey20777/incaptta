import type { Task, KPI, KPIScore, PerformanceReview } from '../types'
import { getRating } from '../types'

/**
 * Calculate score for a single KPI based on its linked Verified tasks.
 * Overdue tasks count as 0. Pending/In-Progress excluded until Verified.
 */
export function calculateKpiScore(kpiId: string, tasks: Task[]): number {
    const verifiedTasks = tasks.filter(
        t => t.kpiCategory === kpiId && t.status === 'Completed' && t.verifiedBy
    )
    if (verifiedTasks.length === 0) return 0
    const total = verifiedTasks.reduce((sum, t) => sum + (t.completionPercent || 0), 0)
    return Math.round(total / verifiedTasks.length)
}

/**
 * Build the full KPI scores array for a performance review.
 */
export function buildKpiScores(kpis: KPI[], tasks: Task[]): KPIScore[] {
    return kpis.map(kpi => {
        const actualScore = calculateKpiScore(kpi.id!, tasks)
        const weightedScore = (actualScore / 100) * kpi.weight
        return {
            kpiId: kpi.id!,
            kpiName: kpi.name,
            weight: kpi.weight,
            targetValue: kpi.targetValue,
            actualScore,
            weightedScore: Math.round(weightedScore * 100) / 100
        }
    })
}

/**
 * Calculate overall weighted performance score from KPI scores.
 */
export function calculateOverallScore(kpiScores: KPIScore[]): number {
    if (kpiScores.length === 0) return 0
    const total = kpiScores.reduce((sum, k) => sum + k.weightedScore, 0)
    return Math.round(total * 100) / 100
}

/**
 * Build a complete PerformanceReview object (not yet saved to Firestore).
 */
export function buildPerformanceReview(
    employeeId: string,
    period: string,
    kpis: KPI[],
    tasks: Task[]
): Omit<PerformanceReview, 'id'> {
    const kpiScores = buildKpiScores(kpis, tasks)
    const overallScore = calculateOverallScore(kpiScores)
    const rating = getRating(overallScore)
    return {
        employeeId,
        period,
        kpiScores,
        overallScore,
        rating,
        generatedAt: new Date()
    }
}
