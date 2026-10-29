import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { DomainEvents, type DomainEvent } from '../common/domain-events'
import type { Presence } from '../workspaces/enums'
import { MembersService } from '../workspaces/members.service'
import { RealtimeGateway, type SocketListener } from './realtime.gateway'

/** How long after the last socket closes before someone shows as away. Tests shorten it. */
export const PRESENCE_GRACE_MS = 'PRESENCE_GRACE_MS'

/**
 * Online when the first socket opens (only from away, so focus and meeting stay), away once
 * the last one has been closed for the grace period. Counts live in memory: one instance only,
 * so every presence is reset to away when the process starts.
 */
@Injectable()
export class PresenceService implements SocketListener, OnModuleInit, OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger('Presence')
  private readonly sockets = new Map<string, number>()
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
    await this.members.resetAllPresence()
  }

  onModuleDestroy() {
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
  }

  connected(userId: string): void {
    const count = (this.sockets.get(userId) ?? 0) + 1
    this.sockets.set(userId, count)
    clearTimeout(this.timers.get(userId))
    this.timers.delete(userId)
    if (count === 1) this.mark(userId, ['away'], 'online')
  }

  disconnected(userId: string): void {
    const count = (this.sockets.get(userId) ?? 1) - 1
    if (count > 0) {
      this.sockets.set(userId, count)
      return
    }
    this.sockets.delete(userId)
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
    const userId = (e.data.member as { id: string }).id
    if (this.sockets.has(userId)) this.mark(userId, ['away'], 'online')
  }

  private mark(userId: string, from: Presence[] | 'any', to: Presence) {
    const prev = this.queues.get(userId) ?? Promise.resolve()
    const next = prev.then(async () => {
      // Decide with the socket count as it is now, not when the write was requested.
      if ((to === 'online') !== this.sockets.has(userId)) return
      const changed = await this.members.setPresenceWhere(userId, from, to)
      for (const m of changed) this.events.publish('presence.changed', m.workspaceId, { userId }, { userId, presence: to, note: null })
    }).catch((e: unknown) => this.log.error(e))
    this.queues.set(userId, next)
    void next.then(() => { if (this.queues.get(userId) === next) this.queues.delete(userId) })
  }
}
