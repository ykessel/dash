import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DataSource } from 'typeorm'
import { CLOCK, type Clock } from '../common/clock'
import type { Env } from '../config/env'
import { MailService } from '../mail/mail.service'
import { DEFAULT_PREFS } from '../prefs/user-prefs.entity'
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
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async tick(): Promise<TickResult> {
    const now = this.clock.now()
    // The digest first: it summarises the morning before the day's own reminders land in the inbox.
    const digests = await this.digests(now)
    return { due: await this.dueTasks(now), meetings: await this.meetings(now), digests }
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

  /** From local 09:00, once a day: members who opted in get what is due, overdue, on the calendar and unread. */
  private async digests(now: Date): Promise<number> {
    const rows: { ws: string; wsName: string; who: string; email: string; day: string }[] = await this.ds.query(
      `SELECT m.workspace_id AS ws, w.name AS "wsName", m.user_id AS who, u.email,
              to_char(($1::timestamptz AT TIME ZONE m.tz)::date, 'YYYY-MM-DD') AS day
       FROM memberships m
       JOIN workspaces w ON w.id = m.workspace_id
       JOIN users u ON u.id = m.user_id
       LEFT JOIN user_prefs p ON p.user_id = m.user_id
       WHERE coalesce((p.notify->>'digest')::boolean, $3) AND ($1::timestamptz AT TIME ZONE m.tz)::time >= $2::time`,
      [now, MORNING, DEFAULT_PREFS.notify.digest],
    )
    const link = `${this.config.get('APP_URL', { infer: true })}/#/home`
    let sent = 0
    for (const r of rows) {
      if (!(await this.claim('digest', `${r.ws}:${r.day}`, r.who))) continue
      const [tasks] = await this.ds.query(
        `SELECT coalesce(array_agg(title ORDER BY title) FILTER (WHERE due_date = $3::date), '{}') AS due,
                count(*) FILTER (WHERE due_date < $3::date)::int AS overdue
         FROM tasks
         WHERE workspace_id = $1 AND assignee_id = $2 AND deleted_at IS NULL AND status <> 'done' AND due_date <= $3::date`,
        [r.ws, r.who, r.day],
      )
      const meetings: { title: string; start: string }[] = await this.ds.query(
        `SELECT e.title, to_char(make_time(e.start_min / 60, e.start_min % 60, 0), 'HH24:MI') AS start
         FROM events e JOIN event_attendees a ON a.event_id = e.id AND a.user_id = $2
         WHERE e.workspace_id = $1 AND e.deleted_at IS NULL AND e.date = $3::date
         ORDER BY e.start_min, e.title`,
        [r.ws, r.who, r.day],
      )
      const [{ unread }] = await this.ds.query(
        `SELECT count(*)::int AS unread FROM notifications WHERE workspace_id = $1 AND recipient_id = $2 AND read_at IS NULL`,
        [r.ws, r.who],
      )
      if (!tasks.due.length && !tasks.overdue && !meetings.length && !unread) continue
      await this.mail.sendDigest(r.email, r.wsName, { due: tasks.due, overdue: tasks.overdue, meetings, unread, link })
      sent++
    }
    return sent
  }
}
