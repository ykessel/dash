import { Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { Actor } from '../common/actor.decorator'
import { WorkspaceMemberGuard } from '../workspaces/workspace-member.guard'
import { NotificationsService } from './notifications.service'

@Controller('workspaces/:wsId/notifications')
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
export class NotificationsController {
  constructor(private readonly notices: NotificationsService) {}

  @Get()
  list(@Param('wsId') wsId: string, @Actor() actor: Actor) {
    return this.notices.list(wsId, actor.userId)
  }

  @Post('read-all')
  @HttpCode(204)
  readAll(@Param('wsId') wsId: string, @Actor() actor: Actor) {
    return this.notices.readAll(wsId, actor.userId)
  }
}
