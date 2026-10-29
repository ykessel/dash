import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, type EntityManager, In, IsNull, Not, type Repository } from 'typeorm'
import type { Actor } from '../common/actor.decorator'
import { CLOCK, type Clock } from '../common/clock'
import { isoDay } from '../common/dates'
import { DomainEvents } from '../common/domain-events'
import { type Priority, type Status, STATUSES } from '../common/enums'
import { AppError } from '../common/http-exception.filter'
import { assertVersion } from '../common/version'
import { WorkspaceRefs } from '../workspaces/refs.service'
import { UUID } from '../workspaces/workspace-member.guard'
import { placeOrder } from './order'
import { type ActivityKind, Subtask, Task, TaskActivity, TaskComment } from './task.entity'
import { type TaskView, toTaskView } from './task-view'

export interface TaskInput {
  title: string
  project: string
  assignee?: string | null
  status: Status
  priority: Priority
  due?: string | null
  estimate: number
}

export type TaskPatch = Partial<TaskInput> & { version: number }

export interface TaskFilter {
  project?: string
  assignee?: string
  status?: Status
  q?: string
}

export const taskNotFound = () => new AppError(404, 'task_not_found', 'That task doesn’t exist.')

/** `''` and `null` both mean "nobody" / "no date". */
const orNull = (v: string | null | undefined) => (v ? v : null)

@Injectable()
export class TasksService {
  constructor(
    private readonly ds: DataSource,
    @InjectRepository(Task) private readonly tasks: Repository<Task>,
    @InjectRepository(Subtask) private readonly subtasks: Repository<Subtask>,
    @InjectRepository(TaskComment) private readonly comments: Repository<TaskComment>,
    private readonly refs: WorkspaceRefs,
    private readonly events: DomainEvents,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Live tasks, board order: by column (todo → done), then `order`. */
  async list(wsId: string, f: TaskFilter): Promise<TaskView[]> {
    const qb = this.tasks.createQueryBuilder('t').where('t.workspace_id = :wsId AND t.deleted_at IS NULL', { wsId })
    if (f.project !== undefined) {
      if (!UUID.test(f.project)) return []
      qb.andWhere('t.project_id = :project', { project: f.project })
    }
    if (f.assignee !== undefined) {
      if (!UUID.test(f.assignee)) return []
      qb.andWhere('t.assignee_id = :assignee', { assignee: f.assignee })
    }
    if (f.status) qb.andWhere('t.status = :status', { status: f.status })
    if (f.q) qb.andWhere(`t.title ILIKE :q ESCAPE '\\'`, { q: `%${f.q.replace(/[\\%_]/g, m => `\\${m}`)}%` })
    qb.orderBy('array_position(:statuses::text[], t.status)').addOrderBy('t."order"').addOrderBy('t.id').setParameter('statuses', [...STATUSES])
    return this.views(await qb.getMany())
  }

  /** One live task as the frontend sees it (used by moves, subtasks, comments and the snapshot). */
  async view(wsId: string, id: string): Promise<TaskView> {
    return (await this.views([await this.find(wsId, id)]))[0]
  }

  async create(wsId: string, input: TaskInput, actor: Actor): Promise<TaskView> {
    await this.refs.assertProject(wsId, input.project, 'project')
    const assignee = orNull(input.assignee)
    if (assignee) await this.refs.assertMembers(wsId, [assignee], 'assignee')
    const id = await this.ds.transaction(async em => {
      const { identifiers } = await em.insert(Task, {
        workspaceId: wsId,
        projectId: input.project,
        assigneeId: assignee,
        title: input.title,
        status: input.status,
        priority: input.priority,
        dueDate: orNull(input.due),
        estimate: input.estimate,
        order: await this.topOrder(wsId, input.status, em),
        doneAt: input.status === 'done' ? this.today() : null,
        createdBy: actor.userId,
      })
      const taskId = identifiers[0].id as string
      await this.recordActivity({ id: taskId, workspaceId: wsId }, actor.userId, 'created', undefined, input.status, em)
      return taskId
    })
    return this.publish('task.created', wsId, id, actor)
  }

  async update(wsId: string, id: string, patch: TaskPatch, actor: Actor): Promise<TaskView> {
    const task = await this.find(wsId, id)
    assertVersion(task.version, patch.version)
    const { version, project, assignee, due, status, ...rest } = patch
    if (project !== undefined) await this.refs.assertProject(wsId, project, 'project')
    if (assignee) await this.refs.assertMembers(wsId, [assignee], 'assignee')
    const set: Partial<Task> = {
      ...rest,
      ...(project !== undefined ? { projectId: project } : {}),
      ...(assignee !== undefined ? { assigneeId: orNull(assignee) } : {}),
      ...(due !== undefined ? { dueDate: orNull(due) } : {}),
    }
    const moved = status !== undefined && status !== task.status
    if (!moved && !Object.values(set).some(v => v !== undefined)) return this.view(wsId, id)
    await this.ds.transaction(async em => {
      if (moved) Object.assign(set, await this.columnChange(wsId, task, status, em))
      // Conditional on the version: of two edits racing from the same version, one gets 409.
      const res = await em.update(Task, { id, version }, { ...set, version: version + 1 })
      if (!res.affected) assertVersion(-1, version)
      if (moved) await this.recordActivity(task, actor.userId, 'status', task.status, status, em)
    })
    return this.publish('task.updated', wsId, id, actor)
  }

  /** Soft delete: subtasks and comments stay so restore brings everything back. */
  async remove(wsId: string, id: string, actor: Actor): Promise<void> {
    const task = await this.find(wsId, id)
    await this.ds.transaction(async em => {
      await em.update(Task, { id }, { deletedAt: this.clock.now(), version: () => 'version + 1' })
      await this.recordActivity(task, actor.userId, 'deleted', undefined, undefined, em)
    })
    this.events.publish('task.deleted', wsId, actor, { id })
  }

  async restore(wsId: string, id: string, actor: Actor): Promise<TaskView> {
    const task = UUID.test(id) ? await this.tasks.findOneBy({ id, workspaceId: wsId }) : null
    if (!task) throw taskNotFound()
    if (!task.deletedAt) return this.view(wsId, id)
    await this.ds.transaction(async em => {
      await em.update(Task, { id, deletedAt: Not(IsNull()) }, { deletedAt: null, version: () => 'version + 1' })
      await this.recordActivity(task, actor.userId, 'restored', undefined, undefined, em)
    })
    return this.publish('task.restored', wsId, id, actor)
  }

  /**
   * Drag and drop: `beforeId` is the card it lands above, `'top'`, or `null`/missing for the end.
   * Needs no `version` (a drop always wins) but bumps it.
   */
  async move(wsId: string, id: string, input: { status: Status; beforeId?: string | null }, actor: Actor): Promise<TaskView> {
    const task = await this.find(wsId, id)
    const { status, beforeId } = input
    await this.ds.transaction(async em => {
      // Locking the target column serializes concurrent drops into it.
      const rows: { id: string; order: number }[] = await em.query(
        `SELECT id, "order" FROM tasks WHERE workspace_id = $1 AND status = $2 AND deleted_at IS NULL AND id <> $3
         ORDER BY "order", id FOR UPDATE`,
        [wsId, status, id],
      )
      let at: number | 'top' | 'end' = 'end'
      if (beforeId === 'top') at = 'top'
      else if (beforeId) {
        at = rows.findIndex(r => r.id === beforeId)
        if (at < 0) throw new AppError(400, 'invalid', 'Drop it next to a card in that column.', 'beforeId')
      }
      let order = placeOrder(rows.map(r => r.order), at)
      if (order === null) {
        await em.query(
          `UPDATE tasks SET "order" = n.i - 1 FROM unnest($1::uuid[]) WITH ORDINALITY AS n(id, i) WHERE tasks.id = n.id`,
          [rows.map(r => r.id)],
        )
        order = placeOrder(rows.map((_, i) => i), at) as number
      }
      const moved = status !== task.status
      const set: Partial<Task> = moved ? { ...(await this.columnChange(wsId, task, status, em)), order } : { order }
      await em.update(Task, { id }, { ...set, version: () => 'version + 1' })
      if (moved) await this.recordActivity(task, actor.userId, 'status', task.status, status, em)
    })
    return this.publish('task.moved', wsId, id, actor)
  }

  /** Top of a column: one above the lowest `order`, or 0 for an empty column. */
  async topOrder(wsId: string, status: Status, em: EntityManager = this.ds.manager): Promise<number> {
    const [{ top }] = await em.query(
      `SELECT coalesce(min("order") - 1, 0)::float8 AS top FROM tasks WHERE workspace_id = $1 AND status = $2 AND deleted_at IS NULL`,
      [wsId, status],
    )
    return top
  }

  /** What changes when a task enters another column: top of it, and `doneAt` set on entering done, cleared on leaving. */
  async columnChange(wsId: string, task: Task, status: Status, em: EntityManager): Promise<Partial<Task>> {
    return {
      status,
      order: await this.topOrder(wsId, status, em),
      doneAt: status === 'done' ? (task.doneAt ?? this.today()) : null,
    }
  }

  async recordActivity(
    task: Pick<Task, 'id' | 'workspaceId'>,
    actorId: string,
    kind: ActivityKind,
    from?: Status,
    to?: Status,
    em: EntityManager = this.ds.manager,
  ): Promise<void> {
    await em.insert(TaskActivity, {
      taskId: task.id,
      workspaceId: task.workspaceId,
      actorId,
      kind,
      fromStatus: from ?? null,
      toStatus: to ?? null,
      at: this.clock.now(),
    })
  }

  /** A live task of this workspace, or 404 — other teams' and deleted tasks don't exist. */
  async find(wsId: string, id: string): Promise<Task> {
    const task = UUID.test(id) ? await this.tasks.findOneBy({ id, workspaceId: wsId, deletedAt: IsNull() }) : null
    if (!task) throw taskNotFound()
    return task
  }

  async publish(type: 'task.created' | 'task.updated' | 'task.moved' | 'task.restored', wsId: string, id: string, actor: Actor): Promise<TaskView> {
    const task = await this.view(wsId, id)
    this.events.publish(type, wsId, actor, { task })
    return task
  }

  private today() {
    return isoDay(this.clock.now())
  }

  private async views(rows: Task[]): Promise<TaskView[]> {
    if (!rows.length) return []
    const ids = rows.map(t => t.id)
    const [subs, comments] = await Promise.all([
      this.subtasks.findBy({ taskId: In(ids) }),
      this.comments.findBy({ taskId: In(ids) }),
    ])
    return rows.map(t => toTaskView(t, subs.filter(s => s.taskId === t.id), comments.filter(c => c.taskId === t.id)))
  }
}
