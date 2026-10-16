/**
 * useHrAnalytics — HR Domain Analytics Composable
 *
 * Computes HrAnalyticsContext by reading:
 *   - hrStore.employees          → headcount breakdown
 *   - hrStore.leaveRequests      → leave pipeline
 *   - hrStore.performanceReviews → review scores (period-filtered by generatedAt)
 *   - hrStore.jobPostings        → open roles and applicant count
 *
 * The caller is responsible for ensuring all HR stores are hydrated.
 * No Firestore writes occur here.
 *
 * IMPORTANT CAVEATS:
 *   - employee.department is a free-text string — grouping is by string equality.
 *     Inconsistent capitalisation or spelling produces separate buckets.
 *   - PerformanceReview has no department field — byDepartment is always empty.
 *   - LeaveRequest.createdAt is used as a proxy for approval date (no approvedAt field).
 */

import { computed, toValue } from 'vue'
import type { Ref } from 'vue'
import { useHrStore } from '@/features/hr/store/hrStore'
import type {
  HrAnalyticsContext,
  HrHeadcountAnalytics,
  HrHeadcountByDepartment,
  HrLeaveAnalytics,
  HrLeaveByType,
  HrPerformanceAnalytics,
  HrRecruitmentAnalytics,
} from '../types/unified-context'

// ─── Helper ───────────────────────────────────────────────────────────────────

function toDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null
  if (typeof (value as any).toDate === 'function') {
    try {
      const d = (value as any).toDate() as Date
      return isNaN(d.getTime()) ? null : d
    } catch { return null }
  }
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value
  if (typeof value === 'string') {
    const d = new Date(value)
    return isNaN(d.getTime()) ? null : d
  }
  if (typeof value === 'number') {
    const d = new Date(value)
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

// ─── Composable ───────────────────────────────────────────────────────────────

export function useHrAnalytics(periodDays: Ref<number>) {
  const hrStore = useHrStore()

  const context = computed<HrAnalyticsContext>(() => {
    const days = toValue(periodDays)
    const now = new Date()
    const periodStartDate = new Date(now)
    periodStartDate.setDate(periodStartDate.getDate() - days)

    // ── Headcount ────────────────────────────────────────────────────────────
    // Employee.status: 'Active' | 'On Leave' | 'Probation' | 'Terminated'
    // Employee.department: free-text string (not a Firestore document ID)
    const allEmployees = hrStore.employees
    let activeCount = 0
    let onLeaveCount = 0
    const deptMap = new Map<string, number>()

    for (const emp of allEmployees) {
      if (emp.status === 'Active') activeCount++
      if (emp.status === 'On Leave') onLeaveCount++

      const dept = String(emp.department || 'Unknown')
      deptMap.set(dept, (deptMap.get(dept) ?? 0) + 1)
    }

    const byDepartment: HrHeadcountByDepartment[] = Array.from(deptMap.entries())
      .map(([departmentLabel, count]) => ({ departmentLabel, count }))
      .sort((a, b) => b.count - a.count)

    const headcount: HrHeadcountAnalytics = {
      total: allEmployees.length,
      active: activeCount,
      onLeave: onLeaveCount,
      byDepartment,
    }

    // ── Leave ────────────────────────────────────────────────────────────────
    // LeaveRequest.status: 'Pending' | 'Approved' | 'Rejected'
    // LeaveRequest.createdAt is optional — used as proxy for approval date
    // since no dedicated approvedAt timestamp exists on the document.
    const allLeave = hrStore.leaveRequests
    let pendingRequests = 0
    let approvedThisPeriod = 0
    const leaveTypeMap = new Map<string, number>()

    for (const lr of allLeave) {
      if (lr.status === 'Pending') pendingRequests++
      if (lr.status === 'Approved') {
        // createdAt used as proxy — may differ from actual approval date
        const d = toDate(lr.createdAt)
        if (d !== null && d >= periodStartDate) approvedThisPeriod++
      }

      const type = String(lr.type || 'Unknown')
      leaveTypeMap.set(type, (leaveTypeMap.get(type) ?? 0) + 1)
    }

    const byType: HrLeaveByType[] = Array.from(leaveTypeMap.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)

    const leave: HrLeaveAnalytics = {
      pendingRequests,
      approvedThisPeriod,
      byType,
    }

    // ── Performance ──────────────────────────────────────────────────────────
    // PerformanceReview.generatedAt is the date field to filter on.
    // PerformanceReview has no department field — byDepartment is always [].
    // See HrPerformanceByDepartment JSDoc in unified-context.ts.
    const allReviews = hrStore.performanceReviews
    const reviewsInPeriod = allReviews.filter(r => {
      const d = toDate(r.generatedAt)
      return d !== null && d >= periodStartDate
    })

    let scoreSum = 0
    let scoreCount = 0

    for (const r of reviewsInPeriod) {
      const score = Number(r.overallScore)
      if (!isNaN(score)) {
        scoreSum += score
        scoreCount++
      }
    }

    const performance: HrPerformanceAnalytics = {
      reviewCount: reviewsInPeriod.length,
      ...(scoreCount > 0
        ? { avgScore: Math.round((scoreSum / scoreCount) * 100) / 100 }
        : {}),
      // byDepartment is empty — PerformanceReview has no department field.
      // A future migration could add employeeId → department resolution here.
      byDepartment: [],
    }

    // ── Recruitment ──────────────────────────────────────────────────────────
    // JobPosting.status: 'Open' | 'Closed' | 'On Hold'
    // Only 'Open' postings count toward openRoles and applicant total.
    const allPostings = hrStore.jobPostings
    let openRoles = 0
    let totalApplicants = 0

    for (const jp of allPostings) {
      if (jp.status === 'Open') {
        openRoles++
        totalApplicants += (jp.applicants ?? []).length
      }
    }

    const recruitment: HrRecruitmentAnalytics = { openRoles, totalApplicants }

    return { headcount, leave, performance, recruitment }
  })

  return {
    /**
     * Readonly reactive computed ref. Access via context.value.
     * Recomputes whenever any hrStore collection updates.
     */
    context: context as Readonly<typeof context>,
  }
}
