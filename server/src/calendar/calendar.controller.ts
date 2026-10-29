import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { Actor } from '../common/actor.decorator'
import { dateField } from '../common/dates'
import { EVENT_KINDS, HUES } from '../common/enums'
import { parseBody } from '../common/validate'
import { WorkspaceMemberGuard } from '../workspaces/workspace-member.guard'
import { CalendarService } from './calendar.service'

const minutes = (min: number, max: number, message: string) => z.number({ error: message }).int(message).min(min, message).max(max, message)

const fields = {
  title: z.string().trim().min(1, 'Give the event a title.').max(200),
  date: dateField,
  start: minutes(0, 1439, 'Start is minutes from midnight, 0 to 1439.'),
  dur: minutes(5, 1440, 'Length is 5 to 1440 minutes.'),
  where: z.string().trim().max(200),
  kind: z.enum(EVENT_KINDS),
  hue: z.enum(HUES),
  project: z.string().nullable(),
  people: z.array(z.string()).max(200),
}

const CreateBody = z.object({
  ...fields,
  where: fields.where.default(''),
  project: fields.project.optional(),
  people: fields.people.default([]),
})
const PatchBody = z.object(fields).partial()
const RangeQuery = z.object({ from: dateField, to: dateField })

@Controller('workspaces/:wsId/events')
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get()
  list(@Param('wsId') wsId: string, @Query() query: unknown) {
    const { from, to } = parseBody(RangeQuery, query)
    return this.calendar.list(wsId, from, to)
  }

  @Post()
  create(@Param('wsId') wsId: string, @Actor() actor: Actor, @Body() body: unknown) {
    return this.calendar.create(wsId, parseBody(CreateBody, body), actor)
  }

  @Patch(':id')
  update(@Param('wsId') wsId: string, @Param('id') id: string, @Actor() actor: Actor, @Body() body: unknown) {
    return this.calendar.update(wsId, id, parseBody(PatchBody, body), actor)
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('wsId') wsId: string, @Param('id') id: string, @Actor() actor: Actor) {
    return this.calendar.remove(wsId, id, actor)
  }

  @Post(':id/restore')
  @HttpCode(200)
  restore(@Param('wsId') wsId: string, @Param('id') id: string, @Actor() actor: Actor) {
    return this.calendar.restore(wsId, id, actor)
  }
}
