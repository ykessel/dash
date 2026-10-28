import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { AuthUser } from '../auth/jwt-auth.guard'

/** The signed-in user set by JwtAuthGuard. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest<{ user: AuthUser }>().user
})
