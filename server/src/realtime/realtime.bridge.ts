import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import type { DomainEvent } from '../common/domain-events'
import { RealtimeGateway, rooms } from './realtime.gateway'

/** Turns domain events into socket messages: `{ by, at, ...data }` to the workspace room, minus the author's tab. */
@Injectable()
export class RealtimeBridge {
  constructor(private readonly gateway: RealtimeGateway) {}

  @OnEvent('domain')
  relay(e: DomainEvent) {
    const ns = this.gateway.server
    if (!ns) return
    const room = rooms.workspace(e.workspaceId)
    // A new member's open tabs start hearing the workspace, including their own arrival.
    if (e.type === 'member.joined') ns.in(rooms.user((e.data.member as { id: string }).id)).socketsJoin(room)
    const payload = { by: e.actor.userId, at: e.at.toISOString(), ...e.data }
    const target = e.actor.clientId ? ns.to(room).except(rooms.client(e.actor.userId, e.actor.clientId)) : ns.to(room)
    target.emit(e.type, payload)
    // Whoever left hears it, then stops hearing the workspace.
    if (e.type === 'member.left') ns.in(rooms.user(e.data.userId as string)).socketsLeave(room)
  }
}
