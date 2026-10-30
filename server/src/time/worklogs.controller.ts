import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { Actor } from '../common/actor.decorator'
import { dateField } from '../common/dates'
import { parseBody } from '../common/validate'
import type { Membership } from '../workspaces/membership.entity'
import { CurrentMembership } from '../workspaces/roles.decorator'
import { WorkspaceMemberGuard } from '../workspaces/workspace-member.guard'
import { WorklogsService } from './worklogs.service'

const MINUTES = 'Time is 1 minute to 24 hours.'
const minutes = z.number({ error: MINUTES }).int(MINUTES).min(1, MINUTES).max(1440, MINUTES)
const comment = z.string().trim().max(1000, 'Keep the comment under 1000 characters.')

const LogBody = z.object({
  minutes,
  date: dateField,
  comment: comment.optional(),
  remaining: z.number({ error: 'Remaining is in minutes.' }).int().min(0).max(1_000_000).optional(),
})
const PatchBody = z.object({ minutes: minutes.optional(), date: dateField.optional(), comment: comment.optional() })

@Controller('workspaces/:wsId')
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
export class WorklogsController {
  constructor(private readonly worklogs: WorklogsService) {}

  @Get('tasks/:taskId/worklogs')
  list(@Param('wsId') wsId: string, @Param('taskId') taskId: string, @CurrentMembership() m: Membership) {
    return this.worklogs.list(wsId, taskId, m)
  }

  @Post('tasks/:taskId/worklogs')
  create(@Param('wsId') wsId: string, @Param('taskId') taskId: string, @Actor() actor: Actor, @CurrentMembership() m: Membership, @Body() body: unknown) {
    return this.worklogs.create(wsId, taskId, parseBody(LogBody, body), m, actor)
  }

  @Patch('worklogs/:id')
  update(@Param('wsId') wsId: string, @Param('id') id: string, @Actor() actor: Actor, @CurrentMembership() m: Membership, @Body() body: unknown) {
    return this.worklogs.update(wsId, id, parseBody(PatchBody, body), m, actor)
  }

  @Delete('worklogs/:id')
  @HttpCode(204)
  remove(@Param('wsId') wsId: string, @Param('id') id: string, @Actor() actor: Actor, @CurrentMembership() m: Membership) {
    return this.worklogs.remove(wsId, id, m, actor)
  }
}
