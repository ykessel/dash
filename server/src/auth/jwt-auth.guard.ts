import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common'
import type { Request } from 'express'
import { AppError } from '../common/http-exception.filter'
import { SessionService } from './session.service'

export interface AuthUser {
  id: string
}

/** Requires `Authorization: Bearer <access token>` and puts `{ id }` on the request. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>()
    const [scheme, token] = (req.headers.authorization ?? '').split(' ')
    if (scheme !== 'Bearer' || !token) throw new AppError(401, 'unauthorized', 'Sign in to continue.')
    req.user = { id: this.sessions.verifyAccess(token) }
    return true
  }
}
