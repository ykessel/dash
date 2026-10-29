import { Controller, Get, Param, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { Actor } from '../common/actor.decorator'
import { WorkspaceMemberGuard } from '../workspaces/workspace-member.guard'
import { SnapshotService } from './snapshot.service'

@Controller('workspaces/:wsId/snapshot')
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
export class SnapshotController {
  constructor(private readonly snapshot: SnapshotService) {}

  @Get()
  get(@Param('wsId') wsId: string, @Actor() actor: Actor) {
    return this.snapshot.get(wsId, actor.userId)
  }
}
