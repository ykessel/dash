import { Column, CreateDateColumn, Entity, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm'
import type { EventKind, Hue } from '../common/enums'

@Entity('events')
export class CalEvent {
  @PrimaryGeneratedColumn('uuid') id: string
  @Column({ name: 'workspace_id', type: 'uuid' }) workspaceId: string
  @Column({ type: 'text' }) title: string
  @Column({ type: 'date' }) date: string
  @Column({ name: 'start_min', type: 'int' }) startMin: number
  @Column({ name: 'dur_min', type: 'int' }) durMin: number
  @Column({ type: 'text', default: '' }) location: string
  @Column({ type: 'text' }) kind: EventKind
  @Column({ type: 'text' }) hue: Hue
  @Column({ name: 'project_id', type: 'uuid', nullable: true }) projectId: string | null
  @Column({ name: 'created_by', type: 'uuid', nullable: true }) createdBy: string | null
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true }) deletedAt: Date | null
}

@Entity('event_attendees')
export class EventAttendee {
  @PrimaryColumn({ name: 'event_id', type: 'uuid' }) eventId: string
  @PrimaryColumn({ name: 'user_id', type: 'uuid' }) userId: string
}
