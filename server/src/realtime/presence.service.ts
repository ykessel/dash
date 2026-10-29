import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { DomainEvents } from '../common/domain-events'
import type { Presence } from '../workspaces/enums'
import { MembersService } from '../workspaces/members.service'
import { RealtimeGateway, type SocketListener } from './realtime.gateway'

/** How long after the last socket closes before someone shows as away. Tests shorten it. */
export const PRESENCE_GRACE_MS = 'PRESENCE_GRACE_MS'

/**
 * Online when the first socket opens (only from away, so focus and meeting stay), away once
 * the last one has been closed for the grace period. Counts live in memory: one instance only.
 */
@Injectable()
export class PresenceService implements SocketListener, OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Presence')
  private readonly sockets = new Map<string, number>()
  private readonly timers = new Map<string, NodeJS.Timeout>()

  constructor(
    private readonly gateway: RealtimeGateway,
    private readonly members: MembersService,
    private readonly events: DomainEvents,
    @Inject(PRESENCE_GRACE_MS) private readonly grace: number,
  ) {}

  onModuleInit() {
    this.gateway.setListener(this)
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
    if (count === 1) void this.mark(userId, ['away'], 'online')
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
      if (!this.sockets.has(userId)) void this.mark(userId, 'any', 'away')
    }, this.grace)
    timer.unref()
    this.timers.set(userId, timer)
  }

  private async mark(userId: string, from: Presence[] | 'any', to: Presence) {
    try {
      const changed = await this.members.setPresenceWhere(userId, from, to)
      for (const m of changed) this.events.publish('presence.changed', m.workspaceId, { userId }, { userId, presence: to, note: null })
    } catch (e) {
      this.log.error(e)
    }
  }
}
