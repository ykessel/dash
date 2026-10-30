import type { Period } from './periods'
import type { PeriodStatus, TimesheetPeriod } from './timesheet-period.entity'

export interface PeriodView {
  project: string
  user: string
  start: string
  end: string
  period: Period
  status: PeriodStatus
  comment: string
  reviewer: string | null
  /** When it was last submitted or reviewed, ms. */
  at: number
}

export const toPeriodView = (r: TimesheetPeriod): PeriodView => ({
  project: r.projectId,
  user: r.userId,
  start: r.periodStart,
  end: r.periodEnd,
  period: r.period,
  status: r.status,
  comment: r.comment,
  reviewer: r.reviewerId,
  at: (r.reviewedAt ?? r.submittedAt).getTime(),
})
