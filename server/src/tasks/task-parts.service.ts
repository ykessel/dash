import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, type Repository } from 'typeorm'
import type { Actor } from '../common/actor.decorator'
import { CLOCK, type Clock } from '../common/clock'
import { DomainEvents } from '../common/domain-events'
import { AppError } from '../common/http-exception.filter'
import { NoticeGate } from '../notices/notice-gate'
import { AccessService } from '../access/access.service'
import { forbidden } from '../workspaces/errors'
import type { Membership } from '../workspaces/membership.entity'
import { UUID } from '../workspaces/workspace-member.guard'
import { Subtask, Task, TaskComment } from './task.entity'
import { type CommentView, type TaskView, toCommentView } from './task-view'
import { TasksService } from './tasks.service'

const subtaskNotFound = () => new AppError(404, 'subtask_not_found', 'That subtask doesn’t exist.')
const commentNotFound = () => new AppError(404, 'comment_not_found', 'That comment doesn’t exist.')

/** Subtasks and comments hang off a live task of the workspace; neither needs the task's `version`. */
@Injectable()
export class TaskPartsService {
  constructor(
    private readonly ds: DataSource,
    private readonly tasks: TasksService,
    @InjectRepository(Subtask) private readonly subtasks: Repository<Subtask>,
    @InjectRepository(TaskComment) private readonly comments: Repository<TaskComment>,
    private readonly events: DomainEvents,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly notices: NoticeGate,
    private readonly access: AccessService,
  ) {}

  async addSubtask(wsId: string, taskId: string, title: string, actor: Actor, by: Membership): Promise<TaskView> {
    await this.tasks.assertCan(wsId, await this.tasks.find(wsId, taskId), by, 'edit')
    await this.ds.transaction(async em => {
      const [{ next }] = await em.query(`SELECT coalesce(max(position) + 1, 0)::int AS next FROM subtasks WHERE task_id = $1`, [taskId])
      await em.insert(Subtask, { taskId, title, position: next })
      await this.bump(em.getRepository(Task), taskId)
    })
    return this.tasks.publish('task.updated', wsId, taskId, actor)
  }

  async updateSubtask(wsId: string, taskId: string, sid: string, patch: { title?: string; done?: boolean }, actor: Actor, by: Membership): Promise<TaskView> {
    await this.tasks.assertCan(wsId, await this.tasks.find(wsId, taskId), by, 'edit')
    await this.findSubtask(taskId, sid)
    if (patch.title === undefined && patch.done === undefined) return this.tasks.view(wsId, taskId)
    await this.ds.transaction(async em => {
      await em.update(Subtask, { id: sid }, { title: patch.title, done: patch.done })
      await this.bump(em.getRepository(Task), taskId)
    })
    return this.tasks.publish('task.updated', wsId, taskId, actor)
  }

  async removeSubtask(wsId: string, taskId: string, sid: string, actor: Actor, by: Membership): Promise<TaskView> {
    await this.tasks.assertCan(wsId, await this.tasks.find(wsId, taskId), by, 'edit')
    await this.findSubtask(taskId, sid)
    await this.ds.transaction(async em => {
      await em.delete(Subtask, { id: sid })
      await this.bump(em.getRepository(Task), taskId)
    })
    return this.tasks.publish('task.updated', wsId, taskId, actor)
  }

  /** `mentions` are user ids; each one in the workspace (other than me) gets a notice. */
  async addComment(wsId: string, taskId: string, text: string, actor: Actor, by: Membership, mentions: string[] = []): Promise<CommentView> {
    const task = await this.tasks.find(wsId, taskId)
    await this.access.assert(wsId, task.projectId, by, 'comments.add')
    const { identifiers } = await this.comments.insert({ taskId, authorId: actor.userId, body: text, createdAt: this.clock.now() })
    const comment = toCommentView(await this.comments.findOneByOrFail({ id: identifiers[0].id as string }))
    this.events.publish('comment.created', wsId, actor, { taskId, comment })
    for (const who of new Set(mentions)) await this.notices.send(wsId, who, actor, 'mention', `mentioned you on “${task.title}”`)
    return comment
  }

  /** The author takes a comment back; `comments.delete_any` moderates anyone's. */
  async removeComment(wsId: string, taskId: string, cid: string, actor: Actor, by: Membership): Promise<void> {
    const task = await this.tasks.find(wsId, taskId)
    const c = UUID.test(cid) ? await this.comments.findOneBy({ id: cid, taskId }) : null
    if (!c) throw commentNotFound()
    if (c.authorId !== actor.userId && !(await this.access.permissions(wsId, task.projectId, by)).has('comments.delete_any')) throw forbidden()
    await this.comments.delete({ id: cid })
    await this.tasks.publish('task.updated', wsId, taskId, actor)
  }

  private async findSubtask(taskId: string, sid: string): Promise<Subtask> {
    const s = UUID.test(sid) ? await this.subtasks.findOneBy({ id: sid, taskId }) : null
    if (!s) throw subtaskNotFound()
    return s
  }

  private bump(tasks: Repository<Task>, id: string) {
    return tasks.update({ id }, { version: () => 'version + 1' })
  }
}
