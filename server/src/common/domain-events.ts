import { Global, Inject, Injectable, Module } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import type { Actor } from './actor.decorator'
import { CLOCK, type Clock } from './clock'

export type DomainEventType = 'workspace.updated' | 'member.joined' | 'member.updated' | 'member.left' | 'presence.changed'

/** Something that changed in a workspace. Services publish it; RealtimeBridge decides who hears it. */
export interface DomainEvent {
  type: DomainEventType
  workspaceId: string
  actor: Actor
  data: Record<string, unknown>
  at: Date
}

@Injectable()
export class DomainEvents {
  constructor(
    private readonly emitter: EventEmitter2,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  publish(type: DomainEventType, workspaceId: string, actor: Actor, data: Record<string, unknown>): void {
    const event: DomainEvent = { type, workspaceId, actor, data, at: this.clock.now() }
    this.emitter.emit('domain', event)
  }
}

@Global()
@Module({ providers: [DomainEvents], exports: [DomainEvents] })
export class DomainEventsModule {}
