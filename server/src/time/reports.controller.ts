import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
import { z } from 'zod'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { dateField } from '../common/dates'
import { parseBody } from '../common/validate'
import { toCsv } from '../insights/csv'
import type { Membership } from '../workspaces/membership.entity'
import { CurrentMembership } from '../workspaces/roles.decorator'
import { WorkspaceMemberGuard } from '../workspaces/workspace-member.guard'
import { ReportsService } from './reports.service'

const SheetQuery = z.object({
  from: dateField,
  to: dateField,
  user: z.string().default('me'),
  project: z.string().optional(),
})
const ReportQuery = z.object({
  from: dateField,
  to: dateField,
  groupBy: z.enum(['user', 'project', 'task']).default('project'),
  bucket: z.enum(['day', 'week', 'month', 'year']).default('week'),
  scope: z.enum(['me', 'team']).default('me'),
  approvedOnly: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
})

@Controller('workspaces/:wsId')
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('timesheet')
  timesheet(@Param('wsId') wsId: string, @CurrentMembership() m: Membership, @Query() query: unknown) {
    return this.reports.timesheet(wsId, parseBody(SheetQuery, query), m)
  }

  @Get('time-reports')
  report(@Param('wsId') wsId: string, @CurrentMembership() m: Membership, @Query() query: unknown) {
    return this.reports.report(wsId, parseBody(ReportQuery, query), m)
  }

  @Get('time-reports.csv')
  async csv(@Param('wsId') wsId: string, @CurrentMembership() m: Membership, @Query() query: unknown, @Res({ passthrough: true }) res: Response) {
    const q = parseBody(ReportQuery, query)
    const report = await this.reports.report(wsId, q, m)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="pane-time-${q.from}-${q.to}.csv"`)
    return toCsv(this.reports.toCsvRows(report))
  }
}
