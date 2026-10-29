import type { TestApp } from './app'

const DAY = 86_400_000

/** Noon UTC `n` days ago (n = 0 is today), so the UTC date never flips. */
export const daysAgo = (n: number, hourUtc = 12) => {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hourUtc) - n * DAY)
}

/** `YYYY-MM-DD` of `daysAgo(n)`. */
export const dayAgo = (n: number) => daysAgo(n).toISOString().slice(0, 10)

/** The instant a wall-clock `time` on `day` happens in `tz`, worked out by Postgres. */
export async function localAt(t: TestApp, day: string, time: string, tz: string): Promise<Date> {
  const [{ at }] = await t.db.query(`SELECT ($1::date + $2::time) AT TIME ZONE $3 AS at`, [day, time, tz])
  return new Date(at)
}

/** Today's date in `tz`, as Postgres sees it. */
export async function localToday(t: TestApp, tz: string): Promise<string> {
  const [{ d }] = await t.db.query(`SELECT to_char((now() AT TIME ZONE $1)::date, 'YYYY-MM-DD') AS d`, [tz])
  return d
}

/** Moves a task to done at `at`, the way the API records it: a status activity plus `done_at`. */
export async function finishedAt(t: TestApp, taskId: string, actorId: string, at: Date): Promise<void> {
  const [{ workspace_id }] = await t.db.query(`SELECT workspace_id FROM tasks WHERE id = $1`, [taskId])
  await t.db.query(
    `INSERT INTO task_activity (task_id, workspace_id, actor_id, kind, from_status, to_status, at) VALUES ($1, $2, $3, 'status', 'todo', 'done', $4)`,
    [taskId, workspace_id, actorId, at],
  )
  await t.db.query(`UPDATE tasks SET status = 'done', done_at = $2::date WHERE id = $1`, [taskId, at.toISOString().slice(0, 10)])
}

/** A finished focus block of `sec` seconds starting at `at`. */
export async function focusAt(t: TestApp, wsId: string, userId: string, at: Date, sec: number): Promise<void> {
  await t.db.query(
    `INSERT INTO focus_sessions (workspace_id, user_id, planned_sec, actual_sec, started_at, ended_at) VALUES ($1, $2, 1500, $3, $4, $5)`,
    [wsId, userId, sec, at, new Date(at.getTime() + sec * 1000)],
  )
}

/** Backdates a task's `created` activity (cycle time runs from it). */
export async function createdAt(t: TestApp, taskId: string, at: Date): Promise<void> {
  await t.db.query(`UPDATE task_activity SET at = $2 WHERE task_id = $1 AND kind = 'created'`, [taskId, at])
}
