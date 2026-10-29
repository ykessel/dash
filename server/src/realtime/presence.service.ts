import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { DomainEvents, type DomainEvent } from '../common/domain-events'
import type { Presence } from '../workspaces/enums'
import { MembersService } from '../workspaces/members.service'
import { RealtimeGateway, type SocketListener } from './realtime.gateway'

/** How long after the last socket closes before someone shows as away. Tests shorten it. */
export const PRESENCE_GRACE_MS = 'PRESENCE_GRACE_MS'

/**
 * Online when a socket opens (only from away, so focus and meeting stay), away once the person
 * has had no socket on any instance for the grace period. "Any socket" is asked of the Socket.IO
 * cluster (`fetchSockets`), so with the Redis adapter it holds across instances. On boot, whoever
 * is not connected anywhere is reset to away: presence left over from a crash, without touching
 * people connected to the other instances.
 */
@Injectable()
export class PresenceService implements SocketListener, OnModuleInit, OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger('Presence')
  private readonly timers = new Map<string, NodeJS.Timeout>()
  // One write at a time per user, so a late "away" can't land after a reconnect's "online".
  private readonly queues = new Map<string, Promise<void>>()

  constructor(
    private readonly gateway: RealtimeGateway,
    private readonly members: MembersService,
    private readonly events: DomainEvents,
    @Inject(PRESENCE_GRACE_MS) private readonly grace: number,
  ) {}

  onModuleInit() {
    this.gateway.setListener(this)
  }

  async onApplicationBootstrap() {
    await this.members.resetPresenceExcept(await this.gateway.connectedUserIds())
  }

  onModuleDestroy() {
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
  }

  connected(userId: string): void {
    clearTimeout(this.timers.get(userId))
    this.timers.delete(userId)
    this.mark(userId, ['away'], 'online')
  }

  disconnected(userId: string): void {
    clearTimeout(this.timers.get(userId))
    const timer = setTimeout(() => {
      this.timers.delete(userId)
      this.mark(userId, 'any', 'away')
    }, this.grace)
    timer.unref()
    this.timers.set(userId, timer)
  }

  /** A membership added while its person is connected (new workspace, accepted invite) starts online. */
  @OnEvent('domain')
  onDomain(e: DomainEvent) {
    if (e.type !== 'member.joined') return
    this.mark((e.data.member as { id: string }).id, ['away'], 'online')
  }

  private mark(userId: string, from: Presence[] | 'any', to: Presence) {
    const prev = this.queues.get(userId) ?? Promise.resolve()
    const next = prev.then(async () => {
      // Decide with the sockets as they are now, on every instance, not when the write was requested.
      if ((to === 'online') !== (await this.gateway.hasSockets(userId))) return
      const changed = await this.members.setPresenceWhere(userId, from, to)
      for (const m of changed) this.events.publish('presence.changed', m.workspaceId, { userId }, { userId, presence: to, note: null })
    }).catch((e: unknown) => this.log.error(e))
    this.queues.set(userId, next)
    void next.then(() => { if (this.queues.get(userId) === next) this.queues.delete(userId) })
  }
}
