import type { Worklog } from './worklog.entity'

export interface WorklogView {
  id: string
  task: string
  project: string
  user: string
  date: string
  minutes: number
  comment: string
  createdAt: number
  updatedAt: number
}

export const toWorklogView = (w: Worklog): WorklogView => ({
  id: w.id,
  task: w.taskId,
  project: w.projectId,
  user: w.userId,
  date: w.workDate,
  minutes: w.minutes,
  comment: w.comment,
  createdAt: w.createdAt.getTime(),
  updatedAt: w.updatedAt.getTime(),
})
