import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm'
import type { Access, Presence, Team } from './enums'

/** A person inside one workspace: their access role and team profile. */
@Entity('memberships')
export class Membership {
  @PrimaryColumn({ name: 'workspace_id', type: 'uuid' }) workspaceId: string
  @PrimaryColumn({ name: 'user_id', type: 'uuid' }) userId: string
  @Column({ type: 'text' }) role: Access
  @Column({ type: 'text', default: 'Product' }) team: Team
  @Column({ type: 'text', default: '' }) title: string
  @Column({ type: 'text', default: '' }) city: string
  @Column({ type: 'text', default: 'UTC' }) tz: string
  @Column({ type: 'smallint', default: 32 }) capacity: number
  @Column({ type: 'text', default: 'away' }) presence: Presence
  @Column({ name: 'presence_note', type: 'text', nullable: true }) presenceNote: string | null
  @CreateDateColumn({ name: 'joined_at', type: 'timestamptz' }) joinedAt: Date
}
