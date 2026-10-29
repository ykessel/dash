import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { Request } from 'express'
import type { AuthUser } from '../auth/jwt-auth.guard'

/** Who made a change, and from which client tab (`X-Client-Id`) so live updates skip it. */
export interface Actor {
  userId: string
  clientId?: string
}

export const Actor = createParamDecorator((_: unknown, ctx: ExecutionContext): Actor => {
  const req = ctx.switchToHttp().getRequest<Request & { user: AuthUser }>()
  const raw = req.headers['x-client-id']
  const clientId = typeof raw === 'string' && /^[\w-]{1,64}$/.test(raw) ? raw : undefined
  return clientId ? { userId: req.user.id, clientId } : { userId: req.user.id }
})
