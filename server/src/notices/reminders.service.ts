import { Inject, Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { CLOCK, type Clock } from '../common/clock'
import { NoticeGate } from './notice-gate'

export interface TickResult { due: number; meetings: number; digests: number }

/** Local hour the due reminder and the digest go out ("the morning", "9:00 AM" in Settings). */
export const MORNING = '09:00'
/** How far ahead a meeting reminder fires ("five minutes before they start"). */
export const MEETING_LEAD_MIN = 5

/**
 * Time-based notices. Each call looks at "now" (the CLOCK) in every member's own time zone and
 * hands out whatever is due; `reminders_sent` makes repeated or concurrent calls send each one once.
 */
@Injectable()
export class RemindersService {
  constructor(
    private readonly ds: DataSource,
    private readonly gate: NoticeGate,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async tick(): Promise<TickResult> {
    const now = this.clock.now()
    return { due: await this.dueTasks(now), meetings: await this.meetings(now), digests: 0 }
  }

  /** True the first time (kind, ref, user) is claimed; false for every later call. */
  async claim(kind: string, ref: string, userId: string): Promise<boolean> {
    const rows = await this.ds.query(
      `INSERT INTO reminders_sent (kind, ref, user_id, sent_at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING 1`,
      [kind, ref, userId, this.clock.now()],
    )
    return rows.length > 0
  }

  /** From the assignee's local 09:00 on the due day: open, live tasks due that day. */
  private async dueTasks(now: Date): Promise<number> {
    const rows: { id: string; title: string; ws: string; who: string; day: string }[] = await this.ds.query(
      `SELECT t.id, t.title, t.workspace_id AS ws, t.assignee_id AS who, to_char(t.due_date, 'YYYY-MM-DD') AS day
       FROM tasks t
       JOIN memberships m ON m.workspace_id = t.workspace_id AND m.user_id = t.assignee_id
       WHERE t.deleted_at IS NULL AND t.status <> 'done' AND t.assignee_id IS NOT NULL
         AND t.due_date BETWEEN ($1::timestamptz AT TIME ZONE 'UTC')::date - 1 AND ($1::timestamptz AT TIME ZONE 'UTC')::date + 1
         AND t.due_date = ($1::timestamptz AT TIME ZONE m.tz)::date
         AND ($1::timestamptz AT TIME ZONE m.tz)::time >= $2::time`,
      [now, MORNING],
    )
    let sent = 0
    for (const r of rows) {
      if (!(await this.claim('due', `${r.id}:${r.day}`, r.who))) continue
      if (await this.gate.send(r.ws, r.who, null, 'due', `“${r.title}” is due today`)) sent++
    }
    return sent
  }

  /** Live events starting within the next five minutes, read in each attendee's own time zone. */
  private async meetings(now: Date): Promise<number> {
    const rows: { id: string; title: string; ws: string; who: string; slot: string }[] = await this.ds.query(
      `SELECT e.id, e.title, e.workspace_id AS ws, a.user_id AS who, to_char(e.date, 'YYYY-MM-DD') || ':' || e.start_min AS slot
       FROM events e
       JOIN event_attendees a ON a.event_id = e.id
       JOIN memberships m ON m.workspace_id = e.workspace_id AND m.user_id = a.user_id
       WHERE e.deleted_at IS NULL
         AND e.date BETWEEN ($1::timestamptz AT TIME ZONE 'UTC')::date - 1 AND ($1::timestamptz AT TIME ZONE 'UTC')::date + 1
         AND ((e.date + make_interval(mins => e.start_min)) AT TIME ZONE m.tz) > $1::timestamptz
         AND ((e.date + make_interval(mins => e.start_min)) AT TIME ZONE m.tz) <= $1::timestamptz + make_interval(mins => $2)`,
      [now, MEETING_LEAD_MIN],
    )
    let sent = 0
    for (const r of rows) {
      if (!(await this.claim('meeting', `${r.id}:${r.slot}`, r.who))) continue
      if (await this.gate.send(r.ws, r.who, null, 'meeting', `“${r.title}” starts in ${MEETING_LEAD_MIN} minutes`)) sent++
    }
    return sent
  }
}
