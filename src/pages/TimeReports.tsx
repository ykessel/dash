import { useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import { Check, Seg } from '../components/ui'
import type { TimeReport } from '../data/types'
import { todayIso } from '../lib/date'
import { downloadCsv } from '../lib/csv'
import { formatMinutes } from '../lib/duration'
import { addDaysIso, weekStart } from '../lib/periods'
import { type TimeReportQuery, useStore } from '../store'

type Bucket = TimeReportQuery['bucket']
type GroupBy = TimeReportQuery['groupBy']

/** Default range per bucket: Day → this week, Week → last 8 weeks, Month → this year, Year → last 3 years. */
function rangeFor(b: Bucket): { from: string; to: string } {
  const to = todayIso()
  if (b === 'day') return { from: weekStart(to), to }
  if (b === 'week') return { from: addDaysIso(weekStart(to), -49), to }
  if (b === 'month') return { from: `${to.slice(0, 4)}-01-01`, to }
  return { from: `${Number(to.slice(0, 4)) - 2}-01-01`, to }
}

const bucketLabel = (b: string, bucket: Bucket) => {
  if (bucket === 'year') return b.slice(0, 4)
  if (bucket === 'month') return new Date(`${b}T00:00:00Z`).toLocaleString('en', { month: 'short', year: '2-digit', timeZone: 'UTC' })
  return new Date(`${b}T00:00:00Z`).toLocaleString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export function TimeReports() {
  const { data, can, timeReport, timeTick, notify } = useStore()
  const team = data.projects.some(p => can(p.id, 'time.view_all'))
  const [bucket, setBucket] = useState<Bucket>('week')
  const [range, setRange] = useState(() => rangeFor('week'))
  const [groupBy, setGroupBy] = useState<GroupBy>('project')
  const [scope, setScope] = useState<'me' | 'team'>('me')
  const [approvedOnly, setApprovedOnly] = useState(false)
  const [report, setReport] = useState<TimeReport | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const q: TimeReportQuery = { ...range, bucket, groupBy, scope: team ? scope : 'me', approvedOnly }
  const key = JSON.stringify(q)
  useEffect(() => {
    let live = true
    setErr(null)
    timeReport(JSON.parse(key) as TimeReportQuery)
      .then(r => { if (live) setReport(r) })
      .catch((e: Error) => { if (live) { setReport(null); setErr(e.message) } })
    return () => { live = false }
  }, [key, timeTick, timeReport])

  const pickBucket = (b: Bucket) => { setBucket(b); setRange(rangeFor(b)) }
  const exportCsv = () => {
    if (!report) return
    const rows: (string | number)[][] = [['group', 'period', 'hours']]
    for (const r of report.rows) for (const b of report.buckets) if (r.minutes[b]) rows.push([r.label, b, (r.minutes[b] / 60).toFixed(2)])
    downloadCsv(`pane-time-${range.from}-${range.to}.csv`, rows)
    notify('Time report exported')
  }

  const groupOptions: { value: GroupBy; label: string }[] = [
    { value: 'project', label: 'Project' }, { value: 'task', label: 'Task' }, { value: 'user', label: 'Person' },
  ]

  return (
    <section className="card glass rise ts-card ts-report" style={{ ['--i' as string]: 0 }}>
      <div className="ts-filters">
        <Seg size="sm" value={bucket} onChange={pickBucket} label="Group dates by"
          options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }]} />
        <label className="ts-date">From <input className="input" type="date" value={range.from} max={range.to} onChange={e => e.target.value && setRange(r => ({ ...r, from: e.target.value }))} /></label>
        <label className="ts-date">To <input className="input" type="date" value={range.to} min={range.from} onChange={e => e.target.value && setRange(r => ({ ...r, to: e.target.value }))} /></label>
        <Seg size="sm" value={groupBy} onChange={setGroupBy} label="Rows" options={groupOptions} />
        {team && <Seg size="sm" value={scope} onChange={setScope} label="Whose time" options={[{ value: 'me', label: 'Mine' }, { value: 'team', label: 'Team' }]} />}
        <span className="ts-check"><Check on={approvedOnly} onToggle={() => setApprovedOnly(v => !v)} label="Approved only" /> Approved only</span>
        <button className="btn btn--glass btn--sm" onClick={exportCsv} disabled={!report?.rows.length}><Icon name="download" size={16} /> Export CSV</button>
      </div>

      {err && <p className="ts-empty" role="alert">{err}</p>}
      {report && report.rows.length === 0 && <p className="ts-empty">No time in this range.</p>}
      {report && report.rows.length > 0 && (
        <div className="ts-scroll">
          <table className="ts-grid">
            <thead>
              <tr><th>{groupOptions.find(o => o.value === groupBy)?.label}</th>{report.buckets.map(b => <th key={b}>{bucketLabel(b, bucket)}</th>)}<th>Total</th></tr>
            </thead>
            <tbody>
              {report.rows.map(r => (
                <tr key={r.key}>
                  <th className="ts-task">{r.label}</th>
                  {report.buckets.map(b => <td key={b} className="num">{r.minutes[b] ? formatMinutes(r.minutes[b]) : ''}</td>)}
                  <td className="ts-total num">{formatMinutes(r.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>Total</th>
                {report.buckets.map(b => {
                  const m = report.rows.reduce((s, r) => s + (r.minutes[b] ?? 0), 0)
                  return <td key={b} className="num">{m ? formatMinutes(m) : ''}</td>
                })}
                <td className="ts-total num">{formatMinutes(report.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  )
}
