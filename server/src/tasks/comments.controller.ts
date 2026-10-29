import { Body, Controller, Delete, HttpCode, Param, Post, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { Actor } from '../common/actor.decorator'
import { parseBody } from '../common/validate'
import { WorkspaceMemberGuard } from '../workspaces/workspace-member.guard'
import { TaskPartsService } from './task-parts.service'

const AddBody = z.object({
  text: z.string().trim().min(1, 'Write something first.').max(2000, 'Keep it under 2000 characters.'),
  mentions: z.array(z.string().uuid('Mention people by their id.'), { error: 'Mention people by their id.' }).max(20, 'Mention at most 20 people.').optional(),
})

@Controller('workspaces/:wsId/tasks/:taskId/comments')
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
export class CommentsController {
  constructor(private readonly parts: TaskPartsService) {}

  @Post()
  add(@Param('wsId') wsId: string, @Param('taskId') taskId: string, @Actor() actor: Actor, @Body() body: unknown) {
    const { text, mentions } = parseBody(AddBody, body)
    return this.parts.addComment(wsId, taskId, text, actor, mentions)
  }

  @Delete(':cid')
  @HttpCode(204)
  remove(@Param('wsId') wsId: string, @Param('taskId') taskId: string, @Param('cid') cid: string, @Actor() actor: Actor) {
    return this.parts.removeComment(wsId, taskId, cid, actor)
  }
}
