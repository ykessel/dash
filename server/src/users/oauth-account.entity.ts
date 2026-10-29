import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

export type OAuthProvider = 'google' | 'github'

@Entity('oauth_accounts')
@Index(['provider', 'providerUserId'], { unique: true })
export class OAuthAccount {
  @PrimaryGeneratedColumn('uuid') id: string
  @Column({ name: 'user_id', type: 'uuid' }) userId: string
  @Column({ type: 'text' }) provider: OAuthProvider
  @Column({ name: 'provider_user_id', type: 'text' }) providerUserId: string
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date
}
