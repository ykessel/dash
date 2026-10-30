import type { DataSource, EntityManager } from 'typeorm'

export interface TaskTotals { loggedMinutes: number; remainingMinutes: number }

/** Minutes logged per task (live worklogs only), in one query. Tasks with nothing logged are absent. */
export async function loggedByTask(db: DataSource | EntityManager, taskIds: string[]): Promise<Map<string, number>> {
  if (!taskIds.length) return new Map()
  const rows: { task_id: string; total: number }[] = await db.query(
    `SELECT task_id, sum(minutes)::int AS total FROM worklogs WHERE task_id = ANY($1) AND deleted_at IS NULL GROUP BY task_id`, [taskIds])
  return new Map(rows.map(r => [r.task_id, r.total]))
}

/** Jira's remaining estimate: the value set by hand, else the estimate (hours) minus logged, never below 0. */
export const remainingOf = (estimateHours: number, remainingMinutes: number | null, logged: number): number =>
  remainingMinutes ?? Math.max(0, Math.round(estimateHours * 60) - logged)
