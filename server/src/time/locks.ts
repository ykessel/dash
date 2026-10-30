import { AppError } from '../common/http-exception.filter'
import type { DataSource, EntityManager } from 'typeorm'

/**
 * Is `day` inside a submitted or approved period of this person on this project? Checked by date
 * range, not by key, so old weekly rows still lock after the project switches to monthly. Only while
 * approval is on: once it's off, approved rows are history and lock nothing.
 */
export async function lockedOn(db: DataSource | EntityManager, projectId: string, userId: string, day: string): Promise<boolean> {
  const rows = await db.query(
    `SELECT 1 FROM timesheet_periods tp
       JOIN projects p ON p.id = tp.project_id AND p.approval_enabled
      WHERE tp.project_id = $1 AND tp.user_id = $2 AND tp.status IN ('submitted', 'approved')
        AND $3::date BETWEEN tp.period_start AND tp.period_end
      LIMIT 1`, [projectId, userId, day])
  return rows.length > 0
}

/**
 * Does any live worklog of this task fall in a locked period of its author? In its own project by
 * default, or in `inProject` — where a move would put the hours. The task itself may be deleted
 * (restore asks too).
 */
export async function taskHasLockedTime(db: DataSource | EntityManager, taskId: string, inProject?: string): Promise<boolean> {
  const rows = await db.query(
    `SELECT 1 FROM worklogs w
       JOIN projects p ON p.id = coalesce($2::uuid, w.project_id) AND p.approval_enabled
       JOIN timesheet_periods tp ON tp.project_id = p.id AND tp.user_id = w.user_id
        AND tp.status IN ('submitted', 'approved') AND w.work_date BETWEEN tp.period_start AND tp.period_end
      WHERE w.task_id = $1 AND w.deleted_at IS NULL
      LIMIT 1`, [taskId, inProject ?? null])
  return rows.length > 0
}

export const taskHasLockedTimeError = () =>
  new AppError(409, 'task_has_locked_time', 'This task has hours in a submitted or approved period. Withdraw or reopen it first.')
