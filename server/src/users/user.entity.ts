import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm'

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid') id: string
  @Column({ type: 'citext', unique: true }) email: string
  @Column({ name: 'email_verified_at', type: 'timestamptz', nullable: true }) emailVerifiedAt: Date | null
  @Column({ name: 'password_hash', type: 'text', nullable: true }) passwordHash: string | null
  @Column({ type: 'text' }) name: string
  @Column({ name: 'avatar_skin', type: 'smallint', default: 0 }) avatarSkin: number
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date
}
