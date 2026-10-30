import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/** Time someone spent on a task, on their own local date. `project_id` follows the task. */
@Entity('worklogs')
export class Worklog {
  @PrimaryGeneratedColumn('uuid') id: string
  @Column({ name: 'workspace_id', type: 'uuid' }) workspaceId: string
  @Column({ name: 'project_id', type: 'uuid' }) projectId: string
  @Column({ name: 'task_id', type: 'uuid' }) taskId: string
  @Column({ name: 'user_id', type: 'uuid' }) userId: string
  @Column({ name: 'work_date', type: 'date' }) workDate: string
  @Column({ type: 'int' }) minutes: number
  @Column({ type: 'text', default: '' }) comment: string
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date
  @Column({ name: 'updated_by', type: 'uuid', nullable: true }) updatedBy: string | null
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true }) deletedAt: Date | null
}
