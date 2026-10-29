import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { JwtAuthGuard, type AuthUser } from '../auth/jwt-auth.guard'
import { Actor } from '../common/actor.decorator'
import { CurrentUser } from '../common/current-user.decorator'
import { parseBody } from '../common/validate'
import { TEAMS } from './enums'
import type { Membership } from './membership.entity'
import { CurrentMembership, Roles } from './roles.decorator'
import { WorkspaceMemberGuard } from './workspace-member.guard'
import { WorkspacesService } from './workspaces.service'

const name = z.string().trim().min(1, 'Give the workspace a name.').max(60, 'Keep the name under 60 characters.')
const CreateBody = z.object({
  name,
  team: z.enum(TEAMS).optional(),
  title: z.string().trim().max(60).optional(),
})
const RenameBody = z.object({ name })

@Controller()
@UseGuards(JwtAuthGuard)
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Post('workspaces')
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.workspaces.create(user.id, parseBody(CreateBody, body))
  }

  // Lives here rather than in MeController so AuthModule doesn't depend on workspaces.
  @Get('me/workspaces')
  mine(@CurrentUser() user: AuthUser) {
    return this.workspaces.listForUser(user.id)
  }

  @Get('workspaces/:wsId')
  @UseGuards(WorkspaceMemberGuard)
  get(@Param('wsId') wsId: string, @CurrentMembership() m: Membership) {
    return this.workspaces.get(wsId, m.role)
  }

  @Patch('workspaces/:wsId')
  @UseGuards(WorkspaceMemberGuard)
  @Roles('owner', 'admin')
  rename(@Param('wsId') wsId: string, @CurrentMembership() m: Membership, @Actor() actor: Actor, @Body() body: unknown) {
    return this.workspaces.rename(wsId, parseBody(RenameBody, body).name, m, actor)
  }
}
