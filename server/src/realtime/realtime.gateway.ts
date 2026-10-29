import { type OnGatewayDisconnect, type OnGatewayInit, WebSocketGateway, WebSocketServer } from '@nestjs/websockets'
import type { Namespace, Socket } from 'socket.io'
import { SessionService } from '../auth/session.service'
import { AppError } from '../common/http-exception.filter'
import { WorkspacesService } from '../workspaces/workspaces.service'

const CLIENT_ID = /^[\w-]{1,64}$/

/** Rooms: `user:{id}`, `ws:{wsId}` for each membership, and `client:{userId}:{clientId}` for echo suppression. */
export const rooms = {
  user: (id: string) => `user:${id}`,
  workspace: (id: string) => `ws:${id}`,
  // Scoped to the user, so nobody can pick another person's client id and mute their updates.
  client: (userId: string, clientId: string) => `client:${userId}:${clientId}`,
}

export interface SocketListener {
  connected(userId: string): void
  disconnected(userId: string): void
}

/**
 * `io('/realtime', { auth: { token, clientId } })`. The handshake checks the access token and
 * joins the rooms before the client sees `connect`, so nothing published after that is missed.
 */
@WebSocketGateway({ namespace: '/realtime' })
export class RealtimeGateway implements OnGatewayInit, OnGatewayDisconnect {
  @WebSocketServer() server: Namespace
  private listener?: SocketListener

  constructor(
    private readonly sessions: SessionService,
    private readonly workspaces: WorkspacesService,
  ) {}

  /** Presence hooks in here; one listener is enough. */
  setListener(listener: SocketListener) {
    this.listener = listener
  }

  afterInit(ns: Namespace) {
    ns.use((socket, next) => {
      this.admit(socket).then(() => next(), (e: unknown) => {
        next(new Error(e instanceof AppError ? e.code : 'unauthorized'))
      })
    })
    ns.on('connection', (socket: Socket) => {
      if (socket.data.userId) this.listener?.connected(socket.data.userId as string)
    })
  }

  handleDisconnect(socket: Socket) {
    if (socket.data.userId) this.listener?.disconnected(socket.data.userId as string)
  }

  private async admit(socket: Socket) {
    const auth = (socket.handshake.auth ?? {}) as { token?: unknown; clientId?: unknown }
    const userId = this.sessions.verifyAccess(typeof auth.token === 'string' ? auth.token : '')
    const mine = await this.workspaces.listForUser(userId)
    const join = [rooms.user(userId), ...mine.map(w => rooms.workspace(w.id))]
    if (typeof auth.clientId === 'string' && CLIENT_ID.test(auth.clientId)) join.push(rooms.client(userId, auth.clientId))
    await socket.join(join)
    socket.data.userId = userId
  }
}
