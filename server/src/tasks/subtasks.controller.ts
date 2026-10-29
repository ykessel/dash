import { Body, Controller, Delete, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { Actor } from '../common/actor.decorator'
import { parseBody } from '../common/validate'
import { WorkspaceMemberGuard } from '../workspaces/workspace-member.guard'
import { TaskPartsService } from './task-parts.service'

const title = z.string().trim().min(1, 'Give the subtask a title.').max(200)
const AddBody = z.object({ title })
const PatchBody = z.object({ title: title.optional(), done: z.boolean().optional() })

@Controller('workspaces/:wsId/tasks/:taskId/subtasks')
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
export class SubtasksController {
  constructor(private readonly parts: TaskPartsService) {}

  @Post()
  add(@Param('wsId') wsId: string, @Param('taskId') taskId: string, @Actor() actor: Actor, @Body() body: unknown) {
    return this.parts.addSubtask(wsId, taskId, parseBody(AddBody, body).title, actor)
  }

  @Patch(':sid')
  update(@Param('wsId') wsId: string, @Param('taskId') taskId: string, @Param('sid') sid: string, @Actor() actor: Actor, @Body() body: unknown) {
    return this.parts.updateSubtask(wsId, taskId, sid, parseBody(PatchBody, body), actor)
  }

  @Delete(':sid')
  remove(@Param('wsId') wsId: string, @Param('taskId') taskId: string, @Param('sid') sid: string, @Actor() actor: Actor) {
    return this.parts.removeSubtask(wsId, taskId, sid, actor)
  }
}
