import { Column, CreateDateColumn, Entity, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm'
import type { Priority, Status } from '../common/enums'

/** `double precision` comes back from pg as a number already; estimate and order need no transformer. */
@Entity('tasks')
export class Task {
  @PrimaryGeneratedColumn('uuid') id: string
  @Column({ name: 'workspace_id', type: 'uuid' }) workspaceId: string
  @Column({ name: 'project_id', type: 'uuid' }) projectId: string
  @Column({ name: 'assignee_id', type: 'uuid', nullable: true }) assigneeId: string | null
  @Column({ type: 'text' }) title: string
  @Column({ type: 'text', default: 'todo' }) status: Status
  @Column({ type: 'text', default: 'medium' }) priority: Priority
  @Column({ name: 'due_date', type: 'date', nullable: true }) dueDate: string | null
  @Column({ type: 'double precision', default: 1 }) estimate: number
  /** Set by hand in Log work; null means estimate minus logged. */
  @Column({ name: 'remaining_minutes', type: 'int', nullable: true }) remainingMinutes: number | null
  @Column({ type: 'double precision', default: 0 }) order: number
  @Column({ name: 'done_at', type: 'date', nullable: true }) doneAt: string | null
  @Column({ type: 'int', default: 1 }) version: number
  @Column({ name: 'created_by', type: 'uuid', nullable: true }) createdBy: string | null
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true }) deletedAt: Date | null
}

@Entity('subtasks')
export class Subtask {
  @PrimaryGeneratedColumn('uuid') id: string
  @Column({ name: 'task_id', type: 'uuid' }) taskId: string
  @Column({ type: 'text' }) title: string
  @Column({ type: 'boolean', default: false }) done: boolean
  @Column({ type: 'int', default: 0 }) position: number
}

@Entity('task_comments')
export class TaskComment {
  @PrimaryGeneratedColumn('uuid') id: string
  @Column({ name: 'task_id', type: 'uuid' }) taskId: string
  @Column({ name: 'author_id', type: 'uuid', nullable: true }) authorId: string | null
  @Column({ type: 'text' }) body: string
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date
}

export type ActivityKind = 'created' | 'status' | 'deleted' | 'restored'

@Entity('task_activity')
export class TaskActivity {
  @PrimaryColumn({ type: 'bigint', generated: 'increment' }) id: string
  @Column({ name: 'task_id', type: 'uuid' }) taskId: string
  @Column({ name: 'workspace_id', type: 'uuid' }) workspaceId: string
  @Column({ name: 'actor_id', type: 'uuid', nullable: true }) actorId: string | null
  @Column({ type: 'text' }) kind: ActivityKind
  @Column({ name: 'from_status', type: 'text', nullable: true }) fromStatus: Status | null
  @Column({ name: 'to_status', type: 'text', nullable: true }) toStatus: Status | null
  @Column({ type: 'timestamptz' }) at: Date
}
