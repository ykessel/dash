import { Inject, Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { CLOCK, type Clock } from '../common/clock'
import { shiftDay } from './range'

/** The `n` days ending today in the caller's time zone, and the `n` days before them. */
export interface Window {
  tz: string
  today: string
  days: string[]
  prevDays: string[]
}

export interface Series {
  current: number[]
  previous: number[]
  total: number
  previousTotal: number
}

/** Hours to one decimal, from whole seconds (integer maths, so 0.25 h rounds to 0.3). */
const hours = (sec: number) => Math.round(sec / 360) / 10
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)

@Injectable()
export class InsightsService {
  constructor(
    private readonly ds: DataSource,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async window(wsId: string, userId: string, n: number): Promise<Window> {
    const [{ tz, today }] = await this.ds.query(
      `SELECT tz, to_char(($3::timestamptz AT TIME ZONE tz)::date, 'YYYY-MM-DD') AS today
       FROM memberships WHERE workspace_id = $1 AND user_id = $2`,
      [wsId, userId, this.clock.now()],
    )
    const days = Array.from({ length: n }, (_, i) => shiftDay(today, i - n + 1))
    const prevDays = days.map(d => shiftDay(d, -n))
    return { tz, today, days, prevDays }
  }

  /** Tasks finished and team focus per local day, for the window and the period before it. */
  async series(wsId: string, w: Window): Promise<{ throughput: Series; focus: Series }> {
    const from = w.prevDays[0]
    const params = [wsId, w.tz, from, w.today]
    // A live task counts once on each local day it entered done.
    const finished: { day: string; n: number }[] = await this.ds.query(
      `${DAYS}, done AS (
         SELECT DISTINCT a.task_id, (a.at AT TIME ZONE $2)::date AS day
         FROM task_activity a JOIN tasks t ON t.id = a.task_id AND t.deleted_at IS NULL
         WHERE a.workspace_id = $1 AND a.kind = 'status' AND a.to_status = 'done' AND ${IN_RANGE('a.at')})
       SELECT to_char(days.day, 'YYYY-MM-DD') AS day, count(done.task_id)::int AS n
       FROM days LEFT JOIN done ON done.day = days.day GROUP BY days.day ORDER BY days.day`,
      params,
    )
    const focused: { day: string; n: number }[] = await this.ds.query(
      `${DAYS}, f AS (
         SELECT (started_at AT TIME ZONE $2)::date AS day, actual_sec
         FROM focus_sessions WHERE workspace_id = $1 AND ended_at IS NOT NULL AND ${IN_RANGE('started_at')})
       SELECT to_char(days.day, 'YYYY-MM-DD') AS day, coalesce(sum(f.actual_sec), 0)::int AS n
       FROM days LEFT JOIN f ON f.day = days.day GROUP BY days.day ORDER BY days.day`,
      params,
    )
    const n = w.days.length
    const split = (rows: { n: number }[]) => ({ previous: rows.slice(0, n).map(r => r.n), current: rows.slice(n).map(r => r.n) })
    const t = split(finished)
    const f = split(focused)
    return {
      throughput: { ...t, total: sum(t.current), previousTotal: sum(t.previous) },
      focus: {
        current: f.current.map(hours),
        previous: f.previous.map(hours),
        total: hours(sum(f.current)),
        previousTotal: hours(sum(f.previous)),
      },
    }
  }
}

/** Every local day from $3 to $4 (params: wsId, tz, from, to). */
const DAYS = `WITH days AS (SELECT d::date AS day FROM generate_series($3::date, $4::date, interval '1 day') AS d)`

/** `col` falls between the start of local day $3 and the end of local day $4. */
const IN_RANGE = (col: string) =>
  `${col} >= ($3::date::timestamp AT TIME ZONE $2) AND ${col} < (($4::date + 1)::timestamp AT TIME ZONE $2)`
