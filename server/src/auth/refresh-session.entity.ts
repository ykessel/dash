import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm'

@Entity('refresh_sessions')
export class RefreshSession {
  @PrimaryGeneratedColumn('uuid') id: string
  @Column({ name: 'user_id', type: 'uuid' }) userId: string
  @Column({ name: 'family_id', type: 'uuid' }) familyId: string
  @Column({ name: 'token_hash', type: 'text' }) tokenHash: string
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt: Date
  @Column({ name: 'rotated_at', type: 'timestamptz', nullable: true }) rotatedAt: Date | null
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true }) revokedAt: Date | null
  @Column({ name: 'user_agent', type: 'text', default: '' }) userAgent: string
  @Column({ type: 'text', default: '' }) ip: string
  @Column({ type: 'boolean', default: true }) persistent: boolean
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date
}
