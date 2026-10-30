import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { RoleKey } from './permissions'

/** A named set of permissions, held per project. `key` marks the three seeded, locked roles. */
@Entity('project_roles')
export class ProjectRole {
  @PrimaryGeneratedColumn('uuid') id: string
  @Column({ name: 'workspace_id', type: 'uuid' }) workspaceId: string
  @Column({ type: 'text', nullable: true }) key: RoleKey | null
  @Column({ type: 'text' }) name: string
  @Column({ type: 'text', default: '' }) description: string
  @Column({ type: 'text', array: true }) permissions: string[]
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date
}
