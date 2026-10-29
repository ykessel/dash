import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { Actor } from '../common/actor.decorator'
import { dateField } from '../common/dates'
import { parseBody } from '../common/validate'
import { WorkspaceMemberGuard } from '../workspaces/workspace-member.guard'
import { FocusService } from './focus.service'

const planned = 'A focus block runs 1 to 240 minutes.'
const StartBody = z.object({
  plannedSec: z.number({ error: planned }).int(planned).min(60, planned).max(14400, planned),
  label: z.string().trim().max(120).default(''),
  taskId: z.string().nullable().optional(),
})
const actual = 'Send the seconds you focused.'
const EndBody = z.object({ actualSec: z.number({ error: actual }).int(actual).min(0, actual).max(86400, actual) })
const RangeQuery = z.object({ from: dateField, to: dateField })

@Controller('workspaces/:wsId/focus-sessions')
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
export class FocusController {
  constructor(private readonly focus: FocusService) {}

  @Post()
  start(@Param('wsId') wsId: string, @Actor() actor: Actor, @Body() body: unknown) {
    return this.focus.start(wsId, parseBody(StartBody, body), actor)
  }

  @Patch(':id')
  end(@Param('wsId') wsId: string, @Param('id') id: string, @Actor() actor: Actor, @Body() body: unknown) {
    return this.focus.end(wsId, id, parseBody(EndBody, body).actualSec, actor)
  }

  @Get()
  log(@Param('wsId') wsId: string, @Actor() actor: Actor, @Query() query: unknown) {
    return this.focus.log(wsId, actor.userId, parseBody(RangeQuery, query))
  }
}
