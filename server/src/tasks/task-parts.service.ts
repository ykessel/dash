import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, type Repository } from 'typeorm'
import type { Actor } from '../common/actor.decorator'
import { CLOCK, type Clock } from '../common/clock'
import { DomainEvents } from '../common/domain-events'
import { AppError } from '../common/http-exception.filter'
import { forbidden } from '../workspaces/errors'
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
  ) {}

  async addSubtask(wsId: string, taskId: string, title: string, actor: Actor): Promise<TaskView> {
    await this.tasks.find(wsId, taskId)
    await this.ds.transaction(async em => {
      const [{ next }] = await em.query(`SELECT coalesce(max(position) + 1, 0)::int AS next FROM subtasks WHERE task_id = $1`, [taskId])
      await em.insert(Subtask, { taskId, title, position: next })
      await this.bump(em.getRepository(Task), taskId)
    })
    return this.tasks.publish('task.updated', wsId, taskId, actor)
  }

  async updateSubtask(wsId: string, taskId: string, sid: string, patch: { title?: string; done?: boolean }, actor: Actor): Promise<TaskView> {
    await this.tasks.find(wsId, taskId)
    await this.findSubtask(taskId, sid)
    if (patch.title === undefined && patch.done === undefined) return this.tasks.view(wsId, taskId)
    await this.ds.transaction(async em => {
      await em.update(Subtask, { id: sid }, { title: patch.title, done: patch.done })
      await this.bump(em.getRepository(Task), taskId)
    })
    return this.tasks.publish('task.updated', wsId, taskId, actor)
  }

  async removeSubtask(wsId: string, taskId: string, sid: string, actor: Actor): Promise<TaskView> {
    await this.tasks.find(wsId, taskId)
    await this.findSubtask(taskId, sid)
    await this.ds.transaction(async em => {
      await em.delete(Subtask, { id: sid })
      await this.bump(em.getRepository(Task), taskId)
    })
    return this.tasks.publish('task.updated', wsId, taskId, actor)
  }

  async addComment(wsId: string, taskId: string, text: string, actor: Actor): Promise<CommentView> {
    await this.tasks.find(wsId, taskId)
    const { identifiers } = await this.comments.insert({ taskId, authorId: actor.userId, body: text, createdAt: this.clock.now() })
    const comment = toCommentView(await this.comments.findOneByOrFail({ id: identifiers[0].id as string }))
    this.events.publish('comment.created', wsId, actor, { taskId, comment })
    return comment
  }

  /** Only the author takes a comment back. */
  async removeComment(wsId: string, taskId: string, cid: string, actor: Actor): Promise<void> {
    await this.tasks.find(wsId, taskId)
    const c = UUID.test(cid) ? await this.comments.findOneBy({ id: cid, taskId }) : null
    if (!c) throw commentNotFound()
    if (c.authorId !== actor.userId) throw forbidden()
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
