import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm'

export type TokenKind = 'verify_email' | 'reset_password' | 'magic_link'

@Entity('auth_tokens')
export class AuthToken {
  @PrimaryGeneratedColumn('uuid') id: string
  @Column({ type: 'text' }) kind: TokenKind
  @Column({ type: 'citext' }) email: string
  @Column({ name: 'user_id', type: 'uuid', nullable: true }) userId: string | null
  @Column({ name: 'token_hash', type: 'text' }) tokenHash: string
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt: Date
  @Column({ name: 'used_at', type: 'timestamptz', nullable: true }) usedAt: Date | null
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date
}
