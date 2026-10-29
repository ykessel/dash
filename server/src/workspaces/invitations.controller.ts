import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { z } from 'zod'
import { emailField, tokenField } from '../auth/dto/auth.dto'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { Actor } from '../common/actor.decorator'
import { MAIL_LIMIT } from '../common/throttle-key'
import { parseBody } from '../common/validate'
import { TEAMS } from './enums'
import { InvitationsService } from './invitations.service'
import type { Membership } from './membership.entity'
import { CurrentMembership, Roles } from './roles.decorator'
import { WorkspaceMemberGuard } from './workspace-member.guard'

const InviteBody = z.object({
  email: emailField,
  role: z.enum(['admin', 'member']).default('member'),
  team: z.enum(TEAMS),
  title: z.string().trim().max(60).default(''),
})
const AcceptBody = z.object({ token: tokenField })

@Controller('workspaces/:wsId/invitations')
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
@Roles('owner', 'admin')
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post()
  @Throttle(MAIL_LIMIT)
  create(@Param('wsId') wsId: string, @CurrentMembership() m: Membership, @Body() body: unknown) {
    return this.invitations.create(wsId, parseBody(InviteBody, body), m)
  }

  @Get()
  list(@Param('wsId') wsId: string) {
    return this.invitations.list(wsId)
  }

  @Delete(':id')
  @HttpCode(204)
  revoke(@Param('wsId') wsId: string, @Param('id') id: string) {
    return this.invitations.revoke(wsId, id)
  }
}

@Controller('invitations')
@UseGuards(JwtAuthGuard)
export class AcceptInvitationController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post('accept')
  @HttpCode(200)
  accept(@Actor() actor: Actor, @Body() body: unknown) {
    return this.invitations.accept(parseBody(AcceptBody, body).token, actor)
  }
}
