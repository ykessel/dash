import { useEffect, useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import { Popover, Seg } from '../components/ui'
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

const fmtDay = (iso: string, year = false) =>
  new Date(`${iso}T00:00:00Z`).toLocaleString('en', { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' })

/** "Sep 21 – Nov 11, 2026", with both years when the range crosses one. */
const rangeLabel = (from: string, to: string) =>
  `${fmtDay(from, from.slice(0, 4) !== to.slice(0, 4))} – ${fmtDay(to, true)}`

const BUCKETS: { value: Bucket; label: string; unit: string }[] = [
  { value: 'day', label: 'Day', unit: 'day' }, { value: 'week', label: 'Week', unit: 'week' },
  { value: 'month', label: 'Month', unit: 'month' }, { value: 'year', label: 'Year', unit: 'year' },
]

const PRESETS: { label: string; get: () => { from: string; to: string } }[] = [
  { label: 'This week', get: () => rangeFor('day') },
  { label: 'Last 8 weeks', get: () => rangeFor('week') },
  { label: 'This month', get: () => { const to = todayIso(); return { from: `${to.slice(0, 7)}-01`, to } } },
  { label: 'This year', get: () => rangeFor('month') },
]

const GROUPS: { value: GroupBy; label: string; one: string; many: string }[] = [
  { value: 'project', label: 'Project', one: 'project', many: 'projects' },
  { value: 'task', label: 'Task', one: 'task', many: 'tasks' },
  { value: 'user', label: 'Person', one: 'person', many: 'people' },
]

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

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
  const [menu, setMenu] = useState<null | 'range' | 'bucket' | 'rows'>(null)
  const rangeRef = useRef<HTMLButtonElement>(null)
  const bucketRef = useRef<HTMLButtonElement>(null)
  const rowsRef = useRef<HTMLButtonElement>(null)

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

  const toggle = (m: NonNullable<typeof menu>) => setMenu(cur => (cur === m ? null : m))
  const pickBucket = (b: Bucket) => { setBucket(b); setRange(rangeFor(b)) }
  const exportCsv = () => {
    if (!report) return
    const rows: (string | number)[][] = [['group', 'period', 'hours']]
    for (const r of report.rows) for (const b of report.buckets) if (r.minutes[b]) rows.push([r.label, b, (r.minutes[b] / 60).toFixed(2)])
    downloadCsv(`pane-time-${range.from}-${range.to}.csv`, rows)
    notify('Time report exported')
  }

  const group = GROUPS.find(g => g.value === groupBy)!
  const unit = BUCKETS.find(b => b.value === bucket)!

  return (
    <section className="card glass rise ts-card ts-report" style={{ ['--i' as string]: 0 }}>
      <div className="ts-head">
        <div className="ts-head__total">
          <b>{report ? formatMinutes(report.total) : '—'}</b>
          <small>
            {report ? `${count(report.rows.length, group.one, group.many)} · ${count(report.buckets.length, unit.unit)}` : 'Loading…'}
            {approvedOnly && ' · approved only'}
          </small>
        </div>
        <div className="ts-head__actions">
          {team && <Seg size="sm" value={scope} onChange={setScope} label="Whose time" options={[{ value: 'me', label: 'Mine' }, { value: 'team', label: 'Team' }]} />}
          <button className="btn btn--glass btn--sm" onClick={exportCsv} disabled={!report?.rows.length}><Icon name="download" size={16} /> Export CSV</button>
        </div>
      </div>

      <div className="ts-chips" role="toolbar" aria-label="Report filters">
        <button ref={rangeRef} className="chip-btn" onClick={() => toggle('range')} aria-expanded={menu === 'range'}>
          <Icon name="calendar" size={16} /> {rangeLabel(range.from, range.to)} <Icon name="down" size={14} />
        </button>
        <button ref={bucketRef} className="chip-btn" onClick={() => toggle('bucket')} aria-expanded={menu === 'bucket'}>
          <Icon name="grid" size={16} /> By {unit.unit} <Icon name="down" size={14} />
        </button>
        <button ref={rowsRef} className="chip-btn" onClick={() => toggle('rows')} aria-expanded={menu === 'rows'}>
          <Icon name="layers" size={16} /> Rows: {group.label} <Icon name="down" size={14} />
        </button>
        <button className={`chip-btn ${approvedOnly ? 'is-on' : ''}`} aria-pressed={approvedOnly} onClick={() => setApprovedOnly(v => !v)}>
          <Icon name={approvedOnly ? 'check' : 'plus'} size={16} /> Approved only
        </button>
      </div>

      {menu === 'range' && (
        <Popover anchor={rangeRef.current} onClose={() => setMenu(null)} align="left">
          {PRESETS.map(p => {
            const r = p.get()
            return (
              <button key={p.label} className="menu__item" onClick={() => { setRange(r); setMenu(null) }}>
                {p.label} {r.from === range.from && r.to === range.to && <Icon name="check" className="on" />}
              </button>
            )
          })}
          <div className="menu__sep" />
          <div className="ts-range-custom">
            <label className="ts-date">From <input className="input" type="date" value={range.from} max={range.to} onChange={e => e.target.value && setRange(r => ({ ...r, from: e.target.value }))} /></label>
            <label className="ts-date">To <input className="input" type="date" value={range.to} min={range.from} onChange={e => e.target.value && setRange(r => ({ ...r, to: e.target.value }))} /></label>
          </div>
        </Popover>
      )}
      {menu === 'bucket' && (
        <Popover anchor={bucketRef.current} onClose={() => setMenu(null)} align="left">
          {BUCKETS.map(b => (
            <button key={b.value} className="menu__item" onClick={() => { pickBucket(b.value); setMenu(null) }}>
              {b.label} {bucket === b.value && <Icon name="check" className="on" />}
            </button>
          ))}
        </Popover>
      )}
      {menu === 'rows' && (
        <Popover anchor={rowsRef.current} onClose={() => setMenu(null)} align="left">
          {GROUPS.map(g => (
            <button key={g.value} className="menu__item" onClick={() => { setGroupBy(g.value); setMenu(null) }}>
              {g.label} {groupBy === g.value && <Icon name="check" className="on" />}
            </button>
          ))}
        </Popover>
      )}

      {err && <p className="ts-empty" role="alert">{err}</p>}
      {report && report.rows.length === 0 && <p className="ts-empty">No time in this range.</p>}
      {report && report.rows.length > 0 && (
        <div className="ts-scroll">
          <table className="ts-grid">
            <thead>
              <tr><th>{group.label}</th>{report.buckets.map(b => <th key={b}>{bucketLabel(b, bucket)}</th>)}<th>Total</th></tr>
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
