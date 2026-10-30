import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'
import type { Period } from './periods'

export type PeriodStatus = 'submitted' | 'approved' | 'rejected'

/** Exists only once someone submits; no row means the period is open. */
@Entity('timesheet_periods')
export class TimesheetPeriod {
  @PrimaryGeneratedColumn('uuid') id: string
  @Column({ name: 'workspace_id', type: 'uuid' }) workspaceId: string
  @Column({ name: 'project_id', type: 'uuid' }) projectId: string
  @Column({ name: 'user_id', type: 'uuid' }) userId: string
  @Column({ name: 'period_start', type: 'date' }) periodStart: string
  @Column({ name: 'period_end', type: 'date' }) periodEnd: string
  @Column({ type: 'text' }) period: Period
  @Column({ type: 'text' }) status: PeriodStatus
  @Column({ name: 'submitted_at', type: 'timestamptz' }) submittedAt: Date
  @Column({ name: 'reviewer_id', type: 'uuid', nullable: true }) reviewerId: string | null
  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true }) reviewedAt: Date | null
  @Column({ type: 'text', default: '' }) comment: string
}
