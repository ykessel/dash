import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { Actor } from '../common/actor.decorator'
import { dateField } from '../common/dates'
import { PRIORITIES, STATUSES } from '../common/enums'
import { parseBody } from '../common/validate'
import { versionField } from '../common/version'
import { WorkspaceMemberGuard } from '../workspaces/workspace-member.guard'
import { TasksService } from './tasks.service'

const title = z.string().trim().min(1, 'Give the task a title.').max(200)
const person = z.string().nullable()
const due = z.union([dateField, z.literal(''), z.null()])
const estimate = z.number({ error: 'Estimate is in hours, 0 to 100.' }).min(0, 'Estimate is in hours, 0 to 100.').max(100, 'Estimate is in hours, 0 to 100.')

const CreateBody = z.object({
  title,
  project: z.string({ error: 'Pick a project.' }),
  assignee: person.optional(),
  status: z.enum(STATUSES).default('todo'),
  priority: z.enum(PRIORITIES).default('medium'),
  due: due.optional(),
  estimate: estimate.default(1),
})
const PatchBody = z.object({
  version: versionField,
  title: title.optional(),
  project: z.string().optional(),
  assignee: person.optional(),
  status: z.enum(STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  due: due.optional(),
  estimate: estimate.optional(),
})
const ListQuery = z.object({
  project: z.string().optional(),
  assignee: z.string().optional(),
  status: z.enum(STATUSES).optional(),
  q: z.string().trim().max(200).optional(),
})

@Controller('workspaces/:wsId/tasks')
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list(@Param('wsId') wsId: string, @Query() query: unknown) {
    return this.tasks.list(wsId, parseBody(ListQuery, query))
  }

  @Post()
  create(@Param('wsId') wsId: string, @Actor() actor: Actor, @Body() body: unknown) {
    return this.tasks.create(wsId, parseBody(CreateBody, body), actor)
  }

  @Get(':id')
  get(@Param('wsId') wsId: string, @Param('id') id: string) {
    return this.tasks.view(wsId, id)
  }

  @Patch(':id')
  update(@Param('wsId') wsId: string, @Param('id') id: string, @Actor() actor: Actor, @Body() body: unknown) {
    return this.tasks.update(wsId, id, parseBody(PatchBody, body), actor)
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('wsId') wsId: string, @Param('id') id: string, @Actor() actor: Actor) {
    return this.tasks.remove(wsId, id, actor)
  }

  @Post(':id/restore')
  @HttpCode(200)
  restore(@Param('wsId') wsId: string, @Param('id') id: string, @Actor() actor: Actor) {
    return this.tasks.restore(wsId, id, actor)
  }
}
