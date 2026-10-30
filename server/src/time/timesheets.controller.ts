import { Body, Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { Actor } from '../common/actor.decorator'
import { dateField } from '../common/dates'
import { parseBody } from '../common/validate'
import type { Membership } from '../workspaces/membership.entity'
import { CurrentMembership } from '../workspaces/roles.decorator'
import { WorkspaceMemberGuard } from '../workspaces/workspace-member.guard'
import { TimesheetsService } from './timesheets.service'

const PeriodBody = z.object({ periodStart: dateField })
const RejectBody = z.object({
  periodStart: dateField,
  comment: z.string({ error: 'Say what needs fixing.' }).trim().min(1, 'Say what needs fixing.').max(1000),
})

@Controller('workspaces/:wsId/projects/:id/timesheets')
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
export class TimesheetsController {
  constructor(private readonly timesheets: TimesheetsService) {}

  @Post('submit')
  submit(@Param('wsId') wsId: string, @Param('id') id: string, @Actor() actor: Actor, @CurrentMembership() m: Membership, @Body() body: unknown) {
    return this.timesheets.submit(wsId, id, parseBody(PeriodBody, body).periodStart, m, actor)
  }

  @Post('withdraw')
  @HttpCode(204)
  withdraw(@Param('wsId') wsId: string, @Param('id') id: string, @Actor() actor: Actor, @CurrentMembership() m: Membership, @Body() body: unknown) {
    return this.timesheets.withdraw(wsId, id, parseBody(PeriodBody, body).periodStart, m, actor)
  }

  @Post(':userId/approve')
  approve(@Param('wsId') wsId: string, @Param('id') id: string, @Param('userId') userId: string, @Actor() actor: Actor, @CurrentMembership() m: Membership, @Body() body: unknown) {
    return this.timesheets.review(wsId, id, userId, parseBody(PeriodBody, body).periodStart, 'approve', '', m, actor)
  }

  @Post(':userId/reject')
  reject(@Param('wsId') wsId: string, @Param('id') id: string, @Param('userId') userId: string, @Actor() actor: Actor, @CurrentMembership() m: Membership, @Body() body: unknown) {
    const b = parseBody(RejectBody, body)
    return this.timesheets.review(wsId, id, userId, b.periodStart, 'reject', b.comment, m, actor)
  }

  @Post(':userId/reopen')
  @HttpCode(204)
  async reopen(@Param('wsId') wsId: string, @Param('id') id: string, @Param('userId') userId: string, @Actor() actor: Actor, @CurrentMembership() m: Membership, @Body() body: unknown) {
    await this.timesheets.review(wsId, id, userId, parseBody(PeriodBody, body).periodStart, 'reopen', '', m, actor)
  }
}
