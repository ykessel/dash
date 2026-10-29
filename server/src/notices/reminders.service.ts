import { Inject, Injectable, Logger } from '@nestjs/common'
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

/** Members whose time zone Postgres knows; a bad zone skips that member instead of failing the query. */
const KNOWN_TZ = `JOIN pg_timezone_names z ON z.name = m.tz`
/** Not handed out yet: `ref` and `who` are SQL expressions for the row's claim key. */
const UNSENT = (kind: string, ref: string, who: string) =>
  `NOT EXISTS (SELECT 1 FROM reminders_sent s WHERE s.kind = '${kind}' AND s.ref = ${ref} AND s.user_id = ${who})`

/**
 * Time-based notices. Each call looks at "now" (the CLOCK) in every member's own time zone and
 * hands out whatever is due; `reminders_sent` makes repeated or concurrent calls send each one once.
 * A failure on one row is logged and its claim released, so the next tick retries it and the
 * other rows (and the other kinds) still go out.
 */
@Injectable()
export class RemindersService {
  private readonly log = new Logger(RemindersService.name)

  constructor(
    private readonly ds: DataSource,
    private readonly gate: NoticeGate,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async tick(): Promise<TickResult> {
    const now = this.clock.now()
    // Meetings first: their five-minute window is the tightest. The digest runs before the due
    // reminders so it summarises the morning without counting them as unread.
    const meetings = await this.phase('meetings', () => this.meetings(now))
    const digests = await this.phase('digests', () => this.digests(now))
    const due = await this.phase('due', () => this.dueTasks(now))
    return { due, meetings, digests }
  }

  /** True the first time (kind, ref, user) is claimed; false for every later call. */
  async claim(kind: string, ref: string, userId: string): Promise<boolean> {
    const rows = await this.ds.query(
      `INSERT INTO reminders_sent (kind, ref, user_id, sent_at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING 1`,
      [kind, ref, userId, this.clock.now()],
    )
    return rows.length > 0
  }

  private async phase(name: string, run: () => Promise<number>): Promise<number> {
    try {
      return await run()
    } catch (err) {
      this.log.error(`Reminder phase ${name} failed: ${(err as Error).message}`)
      return 0
    }
  }

  /** Claims, then sends; a send that throws gives the claim back. Resolves true when something went out. */
  private async deliver(kind: string, ref: string, userId: string, send: () => Promise<boolean>): Promise<boolean> {
    if (!(await this.claim(kind, ref, userId))) return false
    try {
      return await send()
    } catch (err) {
      this.log.error(`Reminder ${kind} ${ref} for ${userId} failed: ${(err as Error).message}`)
      await this.ds.query(`DELETE FROM reminders_sent WHERE kind = $1 AND ref = $2 AND user_id = $3`, [kind, ref, userId])
      return false
    }
  }

  /** From the assignee's local 09:00 on the due day: open, live tasks due that day. */
  private async dueTasks(now: Date): Promise<number> {
    const rows: { title: string; ws: string; who: string; ref: string }[] = await this.ds.query(
      `SELECT x.* FROM (
         SELECT t.title, t.workspace_id AS ws, t.assignee_id AS who, t.id || ':' || to_char(t.due_date, 'YYYY-MM-DD') AS ref
         FROM tasks t
         JOIN memberships m ON m.workspace_id = t.workspace_id AND m.user_id = t.assignee_id
         ${KNOWN_TZ}
         WHERE t.deleted_at IS NULL AND t.status <> 'done' AND t.assignee_id IS NOT NULL
           AND t.due_date BETWEEN ($1::timestamptz AT TIME ZONE 'UTC')::date - 1 AND ($1::timestamptz AT TIME ZONE 'UTC')::date + 1
           AND t.due_date = ($1::timestamptz AT TIME ZONE m.tz)::date
           AND ($1::timestamptz AT TIME ZONE m.tz)::time >= $2::time) x
       WHERE ${UNSENT('due', 'x.ref', 'x.who')}`,
      [now, MORNING],
    )
    let sent = 0
    for (const r of rows) {
      if (await this.deliver('due', r.ref, r.who, () => this.gate.send(r.ws, r.who, null, 'due', `“${r.title}” is due today`))) sent++
    }
    return sent
  }

  /** Live events starting within the next five minutes, read in each attendee's own time zone. */
  private async meetings(now: Date): Promise<number> {
    const rows: { title: string; ws: string; who: string; ref: string }[] = await this.ds.query(
      `SELECT x.* FROM (
         SELECT e.title, e.workspace_id AS ws, a.user_id AS who,
                e.id || ':' || to_char(e.date, 'YYYY-MM-DD') || ':' || e.start_min AS ref
         FROM events e
         JOIN event_attendees a ON a.event_id = e.id
         JOIN memberships m ON m.workspace_id = e.workspace_id AND m.user_id = a.user_id
         ${KNOWN_TZ}
         WHERE e.deleted_at IS NULL
           AND e.date BETWEEN ($1::timestamptz AT TIME ZONE 'UTC')::date - 1 AND ($1::timestamptz AT TIME ZONE 'UTC')::date + 1
           AND ((e.date + make_interval(mins => e.start_min)) AT TIME ZONE m.tz) > $1::timestamptz
           AND ((e.date + make_interval(mins => e.start_min)) AT TIME ZONE m.tz) <= $1::timestamptz + make_interval(mins => $2)) x
       WHERE ${UNSENT('meeting', 'x.ref', 'x.who')}`,
      [now, MEETING_LEAD_MIN],
    )
    let sent = 0
    for (const r of rows) {
      const text = `“${r.title}” starts in ${MEETING_LEAD_MIN} minutes`
      if (await this.deliver('meeting', r.ref, r.who, () => this.gate.send(r.ws, r.who, null, 'meeting', text))) sent++
    }
    return sent
  }

  /** From local 09:00, once a day: members who opted in get what is due, overdue, on the calendar and unread. */
  private async digests(now: Date): Promise<number> {
    const rows: { ws: string; wsName: string; who: string; email: string; day: string; ref: string }[] = await this.ds.query(
      `SELECT x.* FROM (
         SELECT m.workspace_id AS ws, w.name AS "wsName", m.user_id AS who, u.email,
                to_char(($1::timestamptz AT TIME ZONE m.tz)::date, 'YYYY-MM-DD') AS day,
                m.workspace_id || ':' || to_char(($1::timestamptz AT TIME ZONE m.tz)::date, 'YYYY-MM-DD') AS ref
         FROM memberships m
         ${KNOWN_TZ}
         JOIN workspaces w ON w.id = m.workspace_id
         JOIN users u ON u.id = m.user_id
         LEFT JOIN user_prefs p ON p.user_id = m.user_id
         WHERE coalesce((p.notify->>'digest')::boolean, $3) AND ($1::timestamptz AT TIME ZONE m.tz)::time >= $2::time) x
       WHERE ${UNSENT('digest', 'x.ref', 'x.who')}`,
      [now, MORNING, DEFAULT_PREFS.notify.digest],
    )
    let sent = 0
    for (const r of rows) {
      if (await this.deliver('digest', r.ref, r.who, () => this.digestFor(r))) sent++
    }
    return sent
  }

  /** Builds and mails one digest; false (claim kept) when the day has nothing to report. */
  private async digestFor(r: { ws: string; wsName: string; who: string; email: string; day: string }): Promise<boolean> {
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
    if (!tasks.due.length && !tasks.overdue && !meetings.length && !unread) return false
    const link = `${this.config.get('APP_URL', { infer: true })}/#/home`
    await this.mail.sendDigest(r.email, r.wsName, { due: tasks.due, overdue: tasks.overdue, meetings, unread, link })
    return true
  }
}
