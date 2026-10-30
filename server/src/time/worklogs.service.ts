import { Inject, Injectable } from '@nestjs/common'
import { DataSource, type EntityManager, IsNull } from 'typeorm'
import { AccessService } from '../access/access.service'
import type { Permission } from '../access/permissions'
import type { Actor } from '../common/actor.decorator'
import { CLOCK, type Clock } from '../common/clock'
import { DomainEvents } from '../common/domain-events'
import { AppError } from '../common/http-exception.filter'
import { Task } from '../tasks/task.entity'
import { forbidden } from '../workspaces/errors'
import type { Membership } from '../workspaces/membership.entity'
import { UUID } from '../workspaces/workspace-member.guard'
import { lockedOn } from './locks'
import { localToday } from './periods'
import { loggedByTask, remainingOf, type TaskTotals } from './totals'
import { Worklog } from './worklog.entity'
import { toWorklogView, type WorklogView } from './worklog-view'

export interface LogInput { minutes: number; date: string; comment?: string; remaining?: number }
export interface WorklogPatch { minutes?: number; date?: string; comment?: string }
export interface WorklogResult { worklog: WorklogView; task: { id: string } & TaskTotals }

const DAY_MAX = 1440
const taskNotFound = () => new AppError(404, 'task_not_found', 'That task doesn’t exist.')
const worklogNotFound = () => new AppError(404, 'worklog_not_found', 'That worklog doesn’t exist.')
const periodLocked = () => new AppError(409, 'period_locked', 'Those hours are submitted or approved. Withdraw or reopen the period first.')

/**
 * Time logged on tasks. Only the assignee logs, only while the task is in progress or review, on their
 * own local date (never in the future), and never past 24 h a day across the workspace.
 */
@Injectable()
export class WorklogsService {
  constructor(
    private readonly ds: DataSource,
    private readonly access: AccessService,
    private readonly events: DomainEvents,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Everyone's worklogs with `time.view_all`; otherwise only mine. Newest date first. */
  async list(wsId: string, taskId: string, by: Membership): Promise<WorklogView[]> {
    const task = await this.liveTask(this.ds.manager, wsId, taskId)
    const have = await this.access.permissions(wsId, task.projectId, by)
    const rows = await this.ds.manager.find(Worklog, {
      where: { taskId: task.id, deletedAt: IsNull(), ...(have.has('time.view_all') ? {} : { userId: by.userId }) },
      order: { workDate: 'DESC', createdAt: 'DESC' },
    })
    return rows.map(toWorklogView)
  }

  async create(wsId: string, taskId: string, input: LogInput, by: Membership, actor: Actor): Promise<WorklogResult> {
    const result = await this.ds.transaction(async em => {
      const task = await this.liveTask(em, wsId, taskId, true)
      await this.access.assert(wsId, task.projectId, by, 'time.log')
      if (task.assigneeId !== by.userId) throw new AppError(403, 'not_assignee', 'Only the task’s assignee can log time on it.')
      if (task.status !== 'progress' && task.status !== 'review') {
        throw new AppError(409, 'task_not_in_progress', 'Time can only be logged while the task is In progress or In review.')
      }
      this.assertNotFuture(input.date, by)
      if (await lockedOn(em, task.projectId, by.userId, input.date)) throw periodLocked()
      await this.assertDayFits(em, wsId, by.userId, input.date, input.minutes)
      const { identifiers } = await em.insert(Worklog, {
        workspaceId: wsId, projectId: task.projectId, taskId: task.id, userId: by.userId,
        workDate: input.date, minutes: input.minutes, comment: input.comment ?? '', updatedBy: by.userId,
      })
      const remaining = input.remaining ?? (task.remainingMinutes === null ? null : Math.max(0, task.remainingMinutes - input.minutes))
      if (remaining !== task.remainingMinutes) await em.update(Task, { id: task.id }, { remainingMinutes: remaining })
      const worklog = await em.findOneByOrFail(Worklog, { id: identifiers[0].id as string })
      return { worklog, task: await this.totals(em, task.id) }
    })
    return this.announce('worklog.created', wsId, actor, result.worklog, result.task)
  }

  async update(wsId: string, id: string, patch: WorklogPatch, by: Membership, actor: Actor): Promise<WorklogResult> {
    const result = await this.ds.transaction(async em => {
      const w = await this.liveWorklog(em, wsId, id)
      await this.assertMay(wsId, w, by, 'edit')
      const date = patch.date ?? w.workDate
      const minutes = patch.minutes ?? w.minutes
      if (patch.date !== undefined) this.assertNotFuture(date, by)
      if (await lockedOn(em, w.projectId, w.userId, w.workDate)) throw periodLocked()
      if (date !== w.workDate && await lockedOn(em, w.projectId, w.userId, date)) throw periodLocked()
      await this.assertDayFits(em, wsId, w.userId, date, minutes, w.id)
      await em.update(Worklog, { id: w.id }, {
        workDate: date, minutes, ...(patch.comment !== undefined ? { comment: patch.comment } : {}), updatedBy: by.userId,
      })
      await this.shiftRemaining(em, w.taskId, minutes - w.minutes)
      return { worklog: await em.findOneByOrFail(Worklog, { id: w.id }), task: await this.totals(em, w.taskId) }
    })
    return this.announce('worklog.updated', wsId, actor, result.worklog, result.task)
  }

  async remove(wsId: string, id: string, by: Membership, actor: Actor): Promise<void> {
    const result = await this.ds.transaction(async em => {
      const w = await this.liveWorklog(em, wsId, id)
      await this.assertMay(wsId, w, by, 'delete')
      if (await lockedOn(em, w.projectId, w.userId, w.workDate)) throw periodLocked()
      await em.update(Worklog, { id: w.id }, { deletedAt: this.clock.now(), updatedBy: by.userId })
      await this.shiftRemaining(em, w.taskId, -w.minutes)
      return { worklog: w, task: await this.totals(em, w.taskId) }
    })
    await this.tell('worklog.deleted', wsId, actor, result.worklog, { id: result.worklog.id, task: result.worklog.taskId })
    this.timeChanged(wsId, actor, result.task)
  }

  /** The `logged` and `remaining` minutes of one task, as its view shows them. */
  async totals(db: DataSource | EntityManager, taskId: string): Promise<{ id: string } & TaskTotals> {
    const task = await db.getRepository(Task).findOneByOrFail({ id: taskId })
    const logged = (await loggedByTask(db, [taskId])).get(taskId) ?? 0
    return { id: taskId, loggedMinutes: logged, remainingMinutes: remainingOf(task.estimate, task.remainingMinutes, logged) }
  }

  private async liveTask(em: EntityManager, wsId: string, taskId: string, lock = false): Promise<Task> {
    if (!UUID.test(taskId)) throw taskNotFound()
    const task = await em.getRepository(Task).findOne({
      where: { id: taskId, workspaceId: wsId },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    })
    if (!task || task.deletedAt) throw taskNotFound()
    return task
  }

  /** A live worklog of this workspace whose task is live too. */
  private async liveWorklog(em: EntityManager, wsId: string, id: string): Promise<Worklog> {
    if (!UUID.test(id)) throw worklogNotFound()
    const w = await em.findOne(Worklog, { where: { id, workspaceId: wsId }, lock: { mode: 'pessimistic_write' } })
    if (!w || w.deletedAt) throw worklogNotFound()
    const [task] = await em.query(`SELECT deleted_at FROM tasks WHERE id = $1`, [w.taskId])
    if (!task || task.deleted_at) throw worklogNotFound()
    return w
  }

  private async assertMay(wsId: string, w: Worklog, by: Membership, action: 'edit' | 'delete') {
    const have = await this.access.permissions(wsId, w.projectId, by)
    const need: Permission = w.userId === by.userId ? `time.${action}_own` : `time.${action}_any`
    if (!have.has(need) && !have.has(`time.${action}_any`)) throw forbidden()
  }

  private assertNotFuture(date: string, by: Membership) {
    if (date > localToday(by.tz, this.clock.now())) {
      throw new AppError(400, 'future_date', 'You can’t log time on a day that hasn’t happened yet.', 'workDate')
    }
  }

  /**
   * At most 24 h per person per day across the workspace, counting live worklogs on live tasks. One
   * advisory lock per person and day keeps two requests from both squeezing under the cap.
   */
  private async assertDayFits(em: EntityManager, wsId: string, userId: string, date: string, minutes: number, except?: string) {
    await em.query(`SELECT pg_advisory_xact_lock(hashtext($1 || ':' || $2 || ':' || $3))`, [wsId, userId, date])
    const [{ total }] = await em.query(
      `SELECT coalesce(sum(w.minutes), 0)::int AS total
         FROM worklogs w JOIN tasks t ON t.id = w.task_id AND t.deleted_at IS NULL
        WHERE w.workspace_id = $1 AND w.user_id = $2 AND w.work_date = $3 AND w.deleted_at IS NULL
          ${except ? 'AND w.id <> $4' : ''}`,
      except ? [wsId, userId, date, except] : [wsId, userId, date])
    if (total + minutes > DAY_MAX) {
      throw new AppError(422, 'day_over_24h', `That day would go over 24 hours (${Math.floor(total / 60)}h ${total % 60}m already logged).`, 'minutes')
    }
  }

  /** A remaining set by hand moves with the time logged against it (Jira's "auto"); an unset one stays computed. */
  private async shiftRemaining(em: EntityManager, taskId: string, delta: number) {
    if (!delta) return
    await em.query(
      `UPDATE tasks SET remaining_minutes = greatest(0, remaining_minutes - $2) WHERE id = $1 AND remaining_minutes IS NOT NULL`,
      [taskId, delta])
  }

  private async announce(type: 'worklog.created' | 'worklog.updated', wsId: string, actor: Actor, w: Worklog, task: { id: string } & TaskTotals): Promise<WorklogResult> {
    const worklog = toWorklogView(w)
    await this.tell(type, wsId, actor, w, { worklog })
    this.timeChanged(wsId, actor, task)
    return { worklog, task }
  }

  /** Worklog content only reaches its author and the people who may see or approve everyone's time. */
  private async tell(type: 'worklog.created' | 'worklog.updated' | 'worklog.deleted', wsId: string, actor: Actor, w: Worklog, data: Record<string, unknown>) {
    const to = new Set([w.userId, ...await this.access.holders(wsId, w.projectId, ['time.view_all', 'time.approve'])])
    for (const userId of to) this.events.publish(type, wsId, actor, data, userId)
  }

  private timeChanged(wsId: string, actor: Actor, t: { id: string } & TaskTotals) {
    this.events.publish('task.time_changed', wsId, actor, { taskId: t.id, loggedMinutes: t.loggedMinutes, remainingMinutes: t.remainingMinutes })
  }
}
