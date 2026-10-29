import type { INestApplicationContext } from '@nestjs/common'
import { IoAdapter } from '@nestjs/platform-socket.io'
import type { ServerOptions } from 'socket.io'

/** Socket.IO with the same CORS rule as the REST API: only the app's origin, with credentials. */
export class AppIoAdapter extends IoAdapter {
  constructor(app: INestApplicationContext, private readonly origin: string) {
    super(app)
  }

  createIOServer(port: number, options?: ServerOptions) {
    return super.createIOServer(port, { ...options, cors: { origin: this.origin, credentials: true } })
  }
}
