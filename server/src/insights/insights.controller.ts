import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { Actor } from '../common/actor.decorator'
import { WorkspaceMemberGuard } from '../workspaces/workspace-member.guard'
import { InsightsService } from './insights.service'
import { parseRange } from './range'

@Controller('workspaces/:wsId')
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  @Get('insights')
  async get(@Param('wsId') wsId: string, @Actor() actor: Actor, @Query('range') range: unknown) {
    const n = parseRange(range)
    const w = await this.insights.window(wsId, actor.userId, n)
    const [series, finished] = await Promise.all([this.insights.series(wsId, w), this.insights.finished(wsId, w)])
    return { range: n, days: w.days, ...series, ...finished }
  }
}
