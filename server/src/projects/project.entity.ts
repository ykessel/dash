import { Column, CreateDateColumn, Entity, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm'
import type { Hue, ProjectIcon, ProjectStatus } from '../common/enums'

@Entity('projects')
export class Project {
  @PrimaryGeneratedColumn('uuid') id: string
  @Column({ name: 'workspace_id', type: 'uuid' }) workspaceId: string
  @Column({ type: 'text' }) name: string
  @Column({ type: 'text', default: '' }) description: string
  @Column({ type: 'text' }) hue: Hue
  @Column({ type: 'text' }) icon: ProjectIcon
  @Column({ type: 'text', default: 'planning' }) status: ProjectStatus
  @Column({ name: 'start_date', type: 'date' }) startDate: string
  @Column({ name: 'due_date', type: 'date' }) dueDate: string
  @Column({ name: 'lead_id', type: 'uuid', nullable: true }) leadId: string | null
  @Column({ type: 'int', default: 1 }) version: number
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true }) deletedAt: Date | null
}

@Entity('project_members')
export class ProjectMember {
  @PrimaryColumn({ name: 'project_id', type: 'uuid' }) projectId: string
  @PrimaryColumn({ name: 'user_id', type: 'uuid' }) userId: string
}

/** Pinned and starred belong to each person, not to the project. */
@Entity('project_user_prefs')
export class ProjectPrefs {
  @PrimaryColumn({ name: 'project_id', type: 'uuid' }) projectId: string
  @PrimaryColumn({ name: 'user_id', type: 'uuid' }) userId: string
  @Column({ type: 'boolean', default: false }) pinned: boolean
  @Column({ type: 'boolean', default: false }) starred: boolean
}

@Entity('milestones')
export class Milestone {
  @PrimaryGeneratedColumn('uuid') id: string
  @Column({ name: 'project_id', type: 'uuid' }) projectId: string
  @Column({ type: 'text' }) title: string
  @Column({ name: 'due_date', type: 'date' }) dueDate: string
  @Column({ type: 'boolean', default: false }) done: boolean
  @Column({ type: 'int', default: 0 }) position: number
}
