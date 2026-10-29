import type { INestApplicationContext } from '@nestjs/common'
import { IoAdapter } from '@nestjs/platform-socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import { Redis } from 'ioredis'
import type { ServerOptions } from 'socket.io'

/**
 * Socket.IO with the same CORS rule as the REST API: only the app's origin, with credentials.
 * With `connectToRedis`, rooms span every instance (broadcasts, `fetchSockets`, `socketsJoin`).
 */
export class AppIoAdapter extends IoAdapter {
  private redis?: ReturnType<typeof createAdapter>
  private clients: Redis[] = []

  constructor(app: INestApplicationContext, private readonly origin: string) {
    super(app)
  }

  /** Call before the app listens. */
  async connectToRedis(url: string): Promise<void> {
    const pub = new Redis(url, { lazyConnect: true })
    const sub = pub.duplicate()
    await Promise.all([pub.connect(), sub.connect()])
    this.clients = [pub, sub]
    this.redis = createAdapter(pub, sub)
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, { ...options, cors: { origin: this.origin, credentials: true } })
    if (this.redis) server.adapter(this.redis)
    return server
  }

  async close(server: unknown): Promise<void> {
    await super.close(server as never)
    await Promise.all(this.clients.map(c => c.quit().catch(() => undefined)))
    this.clients = []
  }
}
