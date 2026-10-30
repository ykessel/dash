import { Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { AccessService } from '../access/access.service'
import { AppError } from '../common/http-exception.filter'
import type { Membership } from '../workspaces/membership.entity'
import { UUID } from '../workspaces/workspace-member.guard'
import { type Bucket, bucketStart } from './periods'
import { type PeriodView, toPeriodView } from './period-view'
import { TimesheetPeriod } from './timesheet-period.entity'
import { toWorklogView, type WorklogView } from './worklog-view'
import type { Worklog } from './worklog.entity'

export type GroupBy = 'user' | 'project' | 'task'
export interface ReportQuery { from: string; to: string; groupBy: GroupBy; bucket: Bucket; scope: 'me' | 'team'; approvedOnly: boolean }
export interface ReportRow { key: string; label: string; minutes: Record<string, number>; total: number }
export interface TimeReport { buckets: string[]; rows: ReportRow[]; total: number }
export interface TimesheetQuery { from: string; to: string; user: string; project?: string }
export interface TimesheetData {
  worklogs: WorklogView[]
  periods: PeriodView[]
  tasks: { id: string; title: string; project: string; status: string; assignee: string }[]
}

const DAY = 86_400_000
const SHEET_MAX_DAYS = 62
const REPORT_MAX_DAYS = 731
const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY)

interface Row {
  id: string; task_id: string; project_id: string; user_id: string; work_date: string; minutes: number; comment: string
  created_at: Date; updated_at: Date; user_name: string; project_name: string; task_title: string
}

/** Reads of logged time: the timesheet grid and the day/week/month/year reports. Live tasks and projects only. */
@Injectable()
export class ReportsService {
  constructor(private readonly ds: DataSource, private readonly access: AccessService) {}

  async timesheet(wsId: string, q: TimesheetQuery, by: Membership): Promise<TimesheetData> {
    this.assertRange(q.from, q.to, SHEET_MAX_DAYS)
    const mine = q.user === 'me' || q.user === by.userId
    const projects = mine ? null : await this.viewAll(wsId, by)
    const user = mine ? by.userId : q.user === 'team' ? null : UUID.test(q.user) ? q.user : by.userId
    const rows = await this.rows(wsId, q.from, q.to, { user, projects, project: q.project })
    const periods = await this.ds.getRepository(TimesheetPeriod).createQueryBuilder('tp')
      .where('tp.workspace_id = :wsId', { wsId })
      .andWhere('tp.period_start <= :to AND tp.period_end >= :from', { from: q.from, to: q.to })
      .andWhere(user ? 'tp.user_id = :user' : '1=1', { user })
      .andWhere(projects ? 'tp.project_id = ANY(:projects)' : '1=1', { projects })
      .andWhere(q.project ? 'tp.project_id = :project' : '1=1', { project: q.project })
      .getMany()
    const taskIds = [...new Set(rows.map(r => r.task_id))]
    const tasks: TimesheetData['tasks'] = taskIds.length
      ? (await this.ds.query(`SELECT id, title, project_id, status, assignee_id FROM tasks WHERE id = ANY($1)`, [taskIds]))
        .map((t: { id: string; title: string; project_id: string; status: string; assignee_id: string | null }) =>
          ({ id: t.id, title: t.title, project: t.project_id, status: t.status, assignee: t.assignee_id ?? '' }))
      : []
    return { worklogs: rows.map(r => toWorklogView(this.entity(r))), periods: periods.map(toPeriodView), tasks }
  }

  async report(wsId: string, q: ReportQuery, by: Membership): Promise<TimeReport> {
    this.assertRange(q.from, q.to, REPORT_MAX_DAYS)
    const projects = q.scope === 'team' ? await this.viewAll(wsId, by) : null
    const rows = await this.rows(wsId, q.from, q.to, { user: q.scope === 'me' ? by.userId : null, projects, approvedOnly: q.approvedOnly })
    const buckets: string[] = []
    for (let d = q.from; d <= q.to; d = new Date(Date.parse(`${d}T00:00:00Z`) + DAY).toISOString().slice(0, 10)) {
      const b = bucketStart(d, q.bucket)
      if (buckets[buckets.length - 1] !== b) buckets.push(b)
    }
    const groups = new Map<string, ReportRow>()
    for (const r of rows) {
      const [key, label] = q.groupBy === 'user' ? [r.user_id, r.user_name] : q.groupBy === 'project' ? [r.project_id, r.project_name] : [r.task_id, r.task_title]
      const g = groups.get(key) ?? { key, label, minutes: {}, total: 0 }
      const b = bucketStart(r.work_date, q.bucket)
      g.minutes[b] = (g.minutes[b] ?? 0) + r.minutes
      g.total += r.minutes
      groups.set(key, g)
    }
    const sorted = [...groups.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label))
    return { buckets, rows: sorted, total: sorted.reduce((s, r) => s + r.total, 0) }
  }

  /** `group,period,hours`, one line per non-empty cell. */
  toCsvRows(r: TimeReport): (string | number)[][] {
    const out: (string | number)[][] = [['group', 'period', 'hours']]
    for (const row of r.rows) {
      for (const b of r.buckets) if (row.minutes[b]) out.push([row.label, b, (row.minutes[b] / 60).toFixed(2)])
    }
    return out
  }

  /** Projects where the caller may see everyone's time; an empty list means none. */
  private async viewAll(wsId: string, by: Membership): Promise<string[]> {
    const access = await this.access.byProject(wsId, by)
    return Object.entries(access).filter(([, perms]) => perms.includes('time.view_all')).map(([id]) => id)
  }

  private async rows(wsId: string, from: string, to: string, f: { user: string | null; projects: string[] | null; project?: string; approvedOnly?: boolean }): Promise<Row[]> {
    const params: unknown[] = [wsId, from, to]
    const where: string[] = []
    if (f.user) { params.push(f.user); where.push(`w.user_id = $${params.length}`) }
    if (f.projects) { params.push(f.projects); where.push(`w.project_id = ANY($${params.length})`) }
    if (f.project) { params.push(f.project); where.push(`w.project_id::text = $${params.length}`) }
    if (f.approvedOnly) {
      where.push(`EXISTS (SELECT 1 FROM timesheet_periods tp WHERE tp.project_id = w.project_id AND tp.user_id = w.user_id
        AND tp.status = 'approved' AND w.work_date BETWEEN tp.period_start AND tp.period_end)`)
    }
    return this.ds.query(
      `SELECT w.id, w.task_id, w.project_id, w.user_id, to_char(w.work_date, 'YYYY-MM-DD') AS work_date, w.minutes, w.comment,
              w.created_at, w.updated_at, u.name AS user_name, p.name AS project_name, t.title AS task_title
         FROM worklogs w
         JOIN tasks t ON t.id = w.task_id AND t.deleted_at IS NULL
         JOIN projects p ON p.id = w.project_id AND p.deleted_at IS NULL
         JOIN users u ON u.id = w.user_id
        WHERE w.workspace_id = $1 AND w.deleted_at IS NULL AND w.work_date BETWEEN $2 AND $3
          ${where.map(c => `AND ${c}`).join(' ')}
        ORDER BY w.work_date, w.created_at`, params)
  }

  private entity(r: Row): Worklog {
    return {
      id: r.id, workspaceId: '', projectId: r.project_id, taskId: r.task_id, userId: r.user_id, workDate: r.work_date,
      minutes: r.minutes, comment: r.comment, createdAt: r.created_at, updatedAt: r.updated_at, updatedBy: null, deletedAt: null,
    }
  }

  private assertRange(from: string, to: string, max: number) {
    const n = days(from, to)
    if (n < 0 || n > max) throw new AppError(400, 'invalid', `Pick a range of at most ${max + 1} days.`, 'range')
  }
}
