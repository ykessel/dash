import { Inject, Injectable } from '@nestjs/common'
import { DataSource, type EntityManager } from 'typeorm'
import { AccessService } from '../access/access.service'
import type { Actor } from '../common/actor.decorator'
import { isUniqueViolation } from '../common/db-errors'
import { CLOCK, type Clock } from '../common/clock'
import { DomainEvents } from '../common/domain-events'
import { AppError } from '../common/http-exception.filter'
import { NoticeGate } from '../notices/notice-gate'
import { Project } from '../projects/project.entity'
import type { Membership } from '../workspaces/membership.entity'
import { UUID } from '../workspaces/workspace-member.guard'
import { localToday, periodEnd, periodStart } from './periods'
import { type PeriodView, toPeriodView } from './period-view'
import { TimesheetPeriod } from './timesheet-period.entity'

export type Review = 'approve' | 'reject' | 'reopen'

const projectNotFound = () => new AppError(404, 'project_not_found', 'That project doesn’t exist.')
const notSubmitted = () => new AppError(409, 'period_not_submitted', 'That period isn’t waiting for approval.')

/**
 * Per-project approval, Tempo style. No row = open. Submitting creates (or revives a rejected) row,
 * withdrawing and reopening delete it, approving and rejecting review it. Rows lock worklogs by range.
 */
@Injectable()
export class TimesheetsService {
  constructor(
    private readonly ds: DataSource,
    private readonly access: AccessService,
    private readonly events: DomainEvents,
    private readonly notices: NoticeGate,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async submit(wsId: string, projectId: string, start: string, by: Membership, actor: Actor): Promise<PeriodView> {
    const p = await this.project(wsId, projectId)
    await this.access.assert(wsId, p.id, by, 'time.log')
    if (!p.approvalEnabled) throw new AppError(409, 'approval_off', 'This project doesn’t require approval.')
    if (periodStart(start, p.approvalPeriod) !== start) {
      throw new AppError(400, 'invalid', p.approvalPeriod === 'week' ? 'Pick a Monday.' : 'Pick the first day of a month.', 'periodStart')
    }
    if (start > periodStart(localToday(by.tz, this.clock.now()), p.approvalPeriod)) {
      throw new AppError(400, 'future_date', 'That period hasn’t started yet.', 'periodStart')
    }
    const row = await this.ds.transaction(async em => {
      const cur = await this.row(em, p.id, by.userId, start)
      if (cur && cur.status !== 'rejected' && cur.period !== p.approvalPeriod) {
        throw new AppError(409, 'period_type_changed', `Part of this ${p.approvalPeriod} was sent as a ${cur.period}. Withdraw or reopen that ${cur.period} first.`)
      }
      if (cur && cur.status !== 'rejected') throw new AppError(409, 'period_already_submitted', 'You already submitted that period.')
      // A rejected row revives with the project's current period type, so its lock covers what the UI says.
      const fields = {
        status: 'submitted' as const, submittedAt: this.clock.now(), reviewerId: null, reviewedAt: null, comment: '',
        period: p.approvalPeriod, periodEnd: periodEnd(start, p.approvalPeriod),
      }
      if (cur) {
        await em.update(TimesheetPeriod, { id: cur.id }, fields)
      } else {
        try {
          await em.insert(TimesheetPeriod, {
            workspaceId: wsId, projectId: p.id, userId: by.userId, periodStart: start, ...fields,
          })
        } catch (e) {
          if (isUniqueViolation(e)) throw new AppError(409, 'period_already_submitted', 'You already submitted that period.')
          throw e
        }
      }
      return this.row(em, p.id, by.userId, start) as Promise<TimesheetPeriod>
    })
    const view = toPeriodView(row)
    const approvers = await this.access.holders(wsId, p.id, ['time.approve'])
    await Promise.all(approvers.map(u => this.notices.send(wsId, u, actor, 'timesheet', `submitted their hours for ${p.name} (${this.span(view)})`)))
    await this.changed(wsId, actor, p.id, view)
    return view
  }

  async withdraw(wsId: string, projectId: string, start: string, by: Membership, actor: Actor): Promise<void> {
    const p = await this.project(wsId, projectId)
    const gone = await this.ds.transaction(async em => {
      const cur = await this.row(em, p.id, by.userId, start)
      if (!cur || cur.status !== 'submitted') throw notSubmitted()
      await em.delete(TimesheetPeriod, { id: cur.id })
      return cur
    })
    await this.changed(wsId, actor, p.id, { ...toPeriodView(gone), status: 'open' })
  }

  async review(wsId: string, projectId: string, userId: string, start: string, action: Review, comment: string, by: Membership, actor: Actor): Promise<PeriodView | null> {
    const p = await this.project(wsId, projectId)
    await this.access.assert(wsId, p.id, by, 'time.approve')
    if (userId === by.userId) throw new AppError(403, 'cannot_review_own', 'Someone else has to review your own hours.')
    const result = await this.ds.transaction(async em => {
      const cur = UUID.test(userId) ? await this.row(em, p.id, userId, start) : null
      if (action === 'reopen') {
        if (!cur || cur.status !== 'approved') throw new AppError(409, 'period_not_approved', 'Only approved periods can be reopened.')
        await em.delete(TimesheetPeriod, { id: cur.id })
        return { row: cur, deleted: true }
      }
      if (!cur || cur.status !== 'submitted') throw notSubmitted()
      await em.update(TimesheetPeriod, { id: cur.id }, {
        status: action === 'approve' ? 'approved' : 'rejected', reviewerId: by.userId, reviewedAt: this.clock.now(), comment: action === 'reject' ? comment : '',
      })
      return { row: (await this.row(em, p.id, userId, start))!, deleted: false }
    })
    const view = toPeriodView(result.row)
    if (result.deleted) {
      await this.changed(wsId, actor, p.id, { ...view, status: 'open' })
      return null
    }
    const text = action === 'approve'
      ? `approved your hours for ${p.name} (${this.span(view)})`
      : `sent back your hours for ${p.name} (${this.span(view)}): ${comment}`
    await this.notices.send(wsId, userId, actor, 'timesheet', text)
    await this.changed(wsId, actor, p.id, view)
    return view
  }

  private async project(wsId: string, id: string): Promise<Project> {
    const p = UUID.test(id) ? await this.ds.getRepository(Project).findOneBy({ id, workspaceId: wsId }) : null
    if (!p || p.deletedAt) throw projectNotFound()
    return p
  }

  private row(em: EntityManager, projectId: string, userId: string, start: string): Promise<TimesheetPeriod | null> {
    return em.findOne(TimesheetPeriod, { where: { projectId, userId, periodStart: start }, lock: { mode: 'pessimistic_write' } })
  }

  private span(v: PeriodView) {
    return `${v.start} – ${v.end}`
  }

  /** The person and whoever may see or approve the project's time hear about it; nobody else. */
  private async changed(wsId: string, actor: Actor, projectId: string, period: Omit<PeriodView, 'status'> & { status: PeriodView['status'] | 'open' }) {
    const to = new Set([period.user, ...await this.access.holders(wsId, projectId, ['time.view_all', 'time.approve'])])
    for (const u of to) this.events.publish('timesheet.changed', wsId, actor, { period }, u)
  }
}
