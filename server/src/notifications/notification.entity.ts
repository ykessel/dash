import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid') id: string
  @Column({ name: 'workspace_id', type: 'uuid' }) workspaceId: string
  @Column({ name: 'recipient_id', type: 'uuid' }) recipientId: string
  @Column({ name: 'actor_id', type: 'uuid', nullable: true }) actorId: string | null
  @Column({ type: 'text' }) kind: string
  @Column({ type: 'jsonb', default: {} }) payload: { text?: string }
  @Column({ name: 'read_at', type: 'timestamptz', nullable: true }) readAt: Date | null
  @Column({ name: 'created_at', type: 'timestamptz' }) createdAt: Date
}

/** The frontend's `Notice`. */
export interface Notice {
  id: string
  who: string
  text: string
  at: number
  read: boolean
  to: string
}

export const toNotice = (n: Notification): Notice => ({
  id: n.id,
  who: n.actorId ?? '',
  text: n.payload.text ?? '',
  at: n.createdAt.getTime(),
  read: !!n.readAt,
  to: n.recipientId,
})
