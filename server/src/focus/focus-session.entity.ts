import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

@Entity('focus_sessions')
export class FocusSession {
  @PrimaryGeneratedColumn('uuid') id: string
  @Column({ name: 'workspace_id', type: 'uuid' }) workspaceId: string
  @Column({ name: 'user_id', type: 'uuid' }) userId: string
  @Column({ name: 'task_id', type: 'uuid', nullable: true }) taskId: string | null
  @Column({ type: 'text', default: '' }) label: string
  @Column({ name: 'planned_sec', type: 'int' }) plannedSec: number
  @Column({ name: 'actual_sec', type: 'int', nullable: true }) actualSec: number | null
  @Column({ name: 'started_at', type: 'timestamptz' }) startedAt: Date
  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true }) endedAt: Date | null
}

export interface FocusSessionView {
  id: string
  taskId?: string
  label: string
  plannedSec: number
  actualSec?: number
  startedAt: number
  endedAt?: number
}

export const toFocusView = (s: FocusSession): FocusSessionView => ({
  id: s.id,
  ...(s.taskId ? { taskId: s.taskId } : {}),
  label: s.label,
  plannedSec: s.plannedSec,
  ...(s.actualSec !== null ? { actualSec: s.actualSec } : {}),
  startedAt: s.startedAt.getTime(),
  ...(s.endedAt ? { endedAt: s.endedAt.getTime() } : {}),
})

/** The frontend's `FocusLog`: minutes focused on one day. */
export interface FocusLog {
  date: string
  minutes: number
}
