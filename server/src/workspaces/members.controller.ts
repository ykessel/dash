import { Body, Controller, Delete, Get, HttpCode, Param, Patch, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { Actor } from '../common/actor.decorator'
import { parseBody } from '../common/validate'
import { PRESENCES, TEAMS } from './enums'
import { MembersService } from './members.service'
import type { Membership } from './membership.entity'
import { CurrentMembership } from './roles.decorator'
import { WorkspaceMemberGuard } from './workspace-member.guard'

const isTimeZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

const PatchBody = z.object({
  team: z.enum(TEAMS).optional(),
  title: z.string().trim().max(60).optional(),
  city: z.string().trim().max(60).optional(),
  tz: z.string().refine(isTimeZone, 'Pick a valid time zone.').optional(),
  capacity: z.number().int().min(1, 'Capacity is 1 to 80 hours.').max(80, 'Capacity is 1 to 80 hours.').optional(),
  role: z.enum(['admin', 'member']).optional(),
})
const PresenceBody = z.object({
  presence: z.enum(PRESENCES),
  note: z.string().trim().max(80).nullable().optional(),
})

@Controller('workspaces/:wsId/members')
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  list(@Param('wsId') wsId: string) {
    return this.members.list(wsId)
  }

  // Declared before `:userId` so "me" isn't read as an id.
  @Patch('me/presence')
  presence(@Param('wsId') wsId: string, @CurrentMembership() m: Membership, @Actor() actor: Actor, @Body() body: unknown) {
    const { presence, note } = parseBody(PresenceBody, body)
    return this.members.setPresence(wsId, m.userId, presence, note || null, actor)
  }

  @Patch(':userId')
  update(@Param('wsId') wsId: string, @Param('userId') userId: string, @CurrentMembership() m: Membership, @Actor() actor: Actor, @Body() body: unknown) {
    return this.members.update(wsId, userId, parseBody(PatchBody, body), m, actor)
  }

  @Delete(':userId')
  @HttpCode(204)
  remove(@Param('wsId') wsId: string, @Param('userId') userId: string, @CurrentMembership() m: Membership, @Actor() actor: Actor) {
    return this.members.remove(wsId, userId, m, actor)
  }
}
