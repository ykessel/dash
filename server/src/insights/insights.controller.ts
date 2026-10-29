import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { Actor } from '../common/actor.decorator'
import { WorkspaceMemberGuard } from '../workspaces/workspace-member.guard'
import { toCsv } from './csv'
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
    const [series, finished, load] = await Promise.all([
      this.insights.series(wsId, w),
      this.insights.finished(wsId, w),
      this.insights.load(wsId, w),
    ])
    return { range: n, days: w.days, ...series, ...finished, ...load }
  }

  /** The same columns the Insights page exports today, one row per day of the window. */
  @Get('insights.csv')
  async csv(
    @Param('wsId') wsId: string,
    @Actor() actor: Actor,
    @Query('range') range: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const n = parseRange(range)
    const w = await this.insights.window(wsId, actor.userId, n)
    const { throughput, focus } = await this.insights.series(wsId, w)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="pane-insights-${n}d.csv"`)
    return toCsv([
      ['date', 'finished', 'previous_period', 'focus_hours'],
      ...w.days.map((d, i) => [d, throughput.current[i], throughput.previous[i], focus.current[i]]),
    ])
  }
}
