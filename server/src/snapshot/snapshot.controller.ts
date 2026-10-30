import { Controller, Get, Param, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import type { Membership } from '../workspaces/membership.entity'
import { CurrentMembership } from '../workspaces/roles.decorator'
import { WorkspaceMemberGuard } from '../workspaces/workspace-member.guard'
import { SnapshotService } from './snapshot.service'

@Controller('workspaces/:wsId/snapshot')
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
export class SnapshotController {
  constructor(private readonly snapshot: SnapshotService) {}

  @Get()
  get(@Param('wsId') wsId: string, @CurrentMembership() m: Membership) {
    return this.snapshot.get(wsId, m)
  }
}
