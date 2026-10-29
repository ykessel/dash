import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common'
import type { Access } from './enums'
import type { Membership } from './membership.entity'

export const ROLES = 'workspace_roles'
/** Limits a route to these access roles; WorkspaceMemberGuard enforces it. */
export const Roles = (...roles: Access[]) => SetMetadata(ROLES, roles)

/** The caller's membership in `:wsId`, loaded by WorkspaceMemberGuard. */
export const CurrentMembership = createParamDecorator((_: unknown, ctx: ExecutionContext): Membership => {
  return ctx.switchToHttp().getRequest<{ membership: Membership }>().membership
})
