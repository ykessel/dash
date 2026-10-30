import { Controller, Get, Param, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import type { Membership } from '../workspaces/membership.entity'
import { CurrentMembership } from '../workspaces/roles.decorator'
import { WorkspaceMemberGuard } from '../workspaces/workspace-member.guard'
import { AccessService } from './access.service'

/** The caller's own permissions per project; the client refetches it when roles change. */
@Controller('workspaces/:wsId/access')
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
export class AccessController {
  constructor(private readonly access: AccessService) {}

  @Get()
  async get(@Param('wsId') wsId: string, @CurrentMembership() m: Membership) {
    return { projects: await this.access.byProject(wsId, m) }
  }
}
