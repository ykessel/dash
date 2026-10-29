import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { InjectRepository } from '@nestjs/typeorm'
import type { Request } from 'express'
import type { Repository } from 'typeorm'
import type { AuthUser } from '../auth/jwt-auth.guard'
import type { Access } from './enums'
import { forbidden, notAMember, workspaceNotFound } from './errors'
import { Membership } from './membership.entity'
import { ROLES } from './roles.decorator'
import { Workspace } from './workspace.entity'

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Runs after JwtAuthGuard on every `/workspaces/:wsId/…` route. Puts the caller's
 * membership on the request; another team's id is always 403, never data.
 */
@Injectable()
export class WorkspaceMemberGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(Workspace) private readonly workspaces: Repository<Workspace>,
    @InjectRepository(Membership) private readonly memberships: Repository<Membership>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { user: AuthUser; membership?: Membership }>()
    const wsId = req.params.wsId
    if (typeof wsId !== 'string' || !UUID.test(wsId) || !(await this.workspaces.existsBy({ id: wsId }))) throw workspaceNotFound()
    const membership = await this.memberships.findOneBy({ workspaceId: wsId, userId: req.user.id })
    if (!membership) throw notAMember()
    const roles = this.reflector.getAllAndOverride<Access[] | undefined>(ROLES, [ctx.getHandler(), ctx.getClass()])
    if (roles && !roles.includes(membership.role)) throw forbidden()
    req.membership = membership
    return true
  }
}
