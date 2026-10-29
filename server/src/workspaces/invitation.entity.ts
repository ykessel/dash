import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm'
import type { Team } from './enums'

@Entity('invitations')
export class Invitation {
  @PrimaryGeneratedColumn('uuid') id: string
  @Column({ name: 'workspace_id', type: 'uuid' }) workspaceId: string
  @Column({ type: 'citext' }) email: string
  @Column({ type: 'text' }) role: 'admin' | 'member'
  @Column({ type: 'text' }) team: Team
  @Column({ type: 'text', default: '' }) title: string
  @Column({ name: 'token_hash', type: 'text', unique: true }) tokenHash: string
  @Column({ name: 'invited_by', type: 'uuid', nullable: true }) invitedBy: string | null
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt: Date
  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true }) acceptedAt: Date | null
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date
}
