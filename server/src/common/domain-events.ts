import { Global, Inject, Injectable, Module } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import type { Actor } from './actor.decorator'
import { CLOCK, type Clock } from './clock'

export type DomainEventType =
  | 'workspace.updated' | 'member.joined' | 'member.updated' | 'member.left' | 'presence.changed'
  | 'project.created' | 'project.updated' | 'project.deleted' | 'milestone.updated'
  | 'task.created' | 'task.updated' | 'task.moved' | 'task.deleted' | 'task.restored' | 'comment.created'
  | 'event.created' | 'event.updated' | 'event.deleted'
  | 'notification.created'
  | 'role.created' | 'role.updated' | 'role.deleted' | 'project.access_changed'
  | 'worklog.created' | 'worklog.updated' | 'worklog.deleted' | 'task.time_changed' | 'timesheet.changed'

/** Something that changed in a workspace. Services publish it; RealtimeBridge decides who hears it. */
export interface DomainEvent {
  type: DomainEventType
  workspaceId: string
  actor: Actor
  data: Record<string, unknown>
  at: Date
  /** Private to one person (a notice): only their tabs hear it, never the rest of the workspace. */
  toUser?: string
}

@Injectable()
export class DomainEvents {
  constructor(
    private readonly emitter: EventEmitter2,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  publish(type: DomainEventType, workspaceId: string, actor: Actor, data: Record<string, unknown>, toUser?: string): void {
    const event: DomainEvent = { type, workspaceId, actor, data, at: this.clock.now(), ...(toUser ? { toUser } : {}) }
    this.emitter.emit('domain', event)
  }
}

@Global()
@Module({ providers: [DomainEvents], exports: [DomainEvents] })
export class DomainEventsModule {}
