import type { Priority, Status } from '../common/enums'
import type { Subtask, Task, TaskComment } from './task.entity'

export interface SubtaskView { id: string; title: string; done: boolean }
export interface CommentView { id: string; who: string; text: string; at: number }

/** The frontend's `Task`, plus `version` for concurrent edits. */
export interface TaskView {
  id: string
  title: string
  project: string
  assignee: string
  status: Status
  priority: Priority
  due: string
  estimate: number
  subtasks: SubtaskView[]
  comments: CommentView[]
  doneAt?: string
  order: number
  version: number
}

export const toSubtaskView = (s: Subtask): SubtaskView => ({ id: s.id, title: s.title, done: s.done })
export const toCommentView = (c: TaskComment): CommentView => ({ id: c.id, who: c.authorId ?? '', text: c.body, at: c.createdAt.getTime() })

export function toTaskView(t: Task, subtasks: Subtask[], comments: TaskComment[]): TaskView {
  return {
    id: t.id,
    title: t.title,
    project: t.projectId,
    assignee: t.assigneeId ?? '',
    status: t.status,
    priority: t.priority,
    due: t.dueDate ?? '',
    estimate: t.estimate,
    subtasks: [...subtasks].sort((a, b) => a.position - b.position).map(toSubtaskView),
    comments: [...comments].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map(toCommentView),
    ...(t.doneAt ? { doneAt: t.doneAt } : {}),
    order: t.order,
    version: t.version,
  }
}
