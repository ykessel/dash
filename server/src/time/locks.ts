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
