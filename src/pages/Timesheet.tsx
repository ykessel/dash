import { type KeyboardEvent, useEffect, useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { Avatar, Seg } from '../components/ui'
import type { Project, TimePeriod, TimesheetData, Worklog } from '../data/types'
import { short, todayIso } from '../lib/date'
import { formatMinutes, parseDuration } from '../lib/duration'
import { addDaysIso, periodStartOf, weekStart } from '../lib/periods'
import { useStore } from '../store'
import { TimeReports } from './TimeReports'

type Tab = 'mine' | 'team' | 'reports'
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const EMPTY: TimesheetData = { worklogs: [], periods: [], tasks: [] }

/** Weekly timesheet, Tempo style: my grid, the team's hours to approve, and reports. */
export function Timesheet() {
  const { data, can } = useStore()
  const [tab, setTab] = useState<Tab>('mine')
  const [week, setWeek] = useState(() => weekStart(todayIso()))
  const team = data.projects.some(p => can(p.id, 'time.view_all'))

  const options: { value: Tab; label: string }[] = [{ value: 'mine', label: 'My time' }]
  if (team) options.push({ value: 'team', label: 'Team' })
  options.push({ value: 'reports', label: 'Reports' })

  return (
    <>
      <header className="page-head">
        <h1>Timesheet</h1>
        <p>Log hours by day, send them for approval and see where the time went</p>
      </header>
      <div className="page-bar">
        <Seg value={tab === 'team' && !team ? 'mine' : tab} onChange={setTab} options={options} label="View" />
        {tab !== 'reports' && <WeekNav week={week} onChange={setWeek} />}
      </div>
      {tab === 'reports' ? <TimeReports /> : tab === 'team' && team ? <TeamWeek week={week} /> : <MyWeek week={week} />}
    </>
  )
}

function WeekNav({ week, onChange }: { week: string; onChange: (w: string) => void }) {
  const now = weekStart(todayIso())
  return (
    <div className="page-actions ts-weeknav">
      <button className="ibtn" aria-label="Previous week" onClick={() => onChange(addDaysIso(week, -7))}><Icon name="left" /></button>
      <b className="num">{short(week)} – {short(addDaysIso(week, 6))}</b>
      <button className="ibtn" aria-label="Next week" disabled={week >= now} onClick={() => onChange(addDaysIso(week, 7))}><Icon name="right" /></button>
      <button className="btn btn--glass btn--sm" disabled={week === now} onClick={() => onChange(now)}>This week</button>
    </div>
  )
}

/** The week's data for `user`, refetched whenever time changes somewhere I can hear about. */
function useSheet(week: string, user: string) {
  const { timesheet, timeTick } = useStore()
  const [sheet, setSheet] = useState<TimesheetData>(EMPTY)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let live = true
    setLoading(true)
    timesheet({ from: week, to: addDaysIso(week, 6), user })
      .then(s => { if (live) setSheet(s) })
      .catch(() => { if (live) setSheet(EMPTY) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [week, user, timeTick, timesheet])
  return { sheet, loading }
}

const days = (week: string) => DAYS.map((_, i) => addDaysIso(week, i))
const sum = (ws: Worklog[]) => ws.reduce((s, w) => s + w.minutes, 0)
/** Blank for an empty day so the grid reads at a glance. */
const hm = (m: number) => (m ? formatMinutes(m) : '')

/** The approval row for this person, project and week: the period holding the week's Monday. */
function periodOf(p: Project, user: string, week: string, periods: TimePeriod[]): { start: string; row: TimePeriod | undefined } {
  const start = periodStartOf(week, p.approvalPeriod)
  return { start, row: periods.find(x => x.project === p.id && x.user === user && x.start <= week && x.end >= week) }
}

/** Same rule as the server: once approval is off, old rows lock nothing. */
const locked = (p: Project, periods: TimePeriod[], user: string, day: string) =>
  p.approvalEnabled && periods.some(x => x.project === p.id && x.user === user && x.status !== 'rejected' && x.start <= day && x.end >= day)

/* ---------------- My time ---------------- */

function MyWeek({ week }: { week: string }) {
  const { data, me, project: projectOf, submitPeriod, withdrawPeriod } = useStore()
  const { sheet, loading } = useSheet(week, 'me')
  const [added, setAdded] = useState<string[]>([])
  const ds = days(week)
  const today = todayIso()

  const active = data.tasks.filter(t => t.assignee === me.id && (t.status === 'progress' || t.status === 'review'))
  const rows = useMemo(() => {
    const ids = new Set([...sheet.tasks.map(t => t.id), ...added])
    const byId = new Map(sheet.tasks.map(t => [t.id, t]))
    return [...ids].map(id => {
      const live = data.tasks.find(t => t.id === id)
      const t = byId.get(id)
      return live ? { id, title: live.title, project: live.project, status: live.status } : t ? { id, title: t.title, project: t.project, status: t.status } : null
    }).filter(r => r !== null)
  }, [sheet.tasks, added, data.tasks])
  const groups = [...new Set(rows.map(r => r.project))]
  const candidates = active.filter(t => !rows.some(r => r.id === t.id))

  return (
    <section className="card glass rise ts-card" style={{ ['--i' as string]: 0 }}>
      {groups.length === 0 && !loading && <p className="ts-empty">No hours this week yet. Add a task you’re working on to start logging.</p>}
      {groups.length > 0 && (
        <div className="ts-scroll">
          <table className="ts-grid">
            <thead>
              <tr>
                <th>Task</th>
                {ds.map((d, i) => <th key={d} className={d === today ? 'is-today' : ''}>{DAYS[i]} <small>{d.slice(8)}</small></th>)}
                <th>Total</th>
              </tr>
            </thead>
            {groups.map(pid => {
              const p = projectOf(pid)
              const mine = rows.filter(r => r.project === pid)
              const logs = sheet.worklogs.filter(w => w.project === pid)
              const { start, row } = periodOf(p, me.id, week, sheet.periods)
              return (
                <tbody key={pid}>
                  <tr className="ts-proj">
                    <th colSpan={9}>
                      <span className="ts-proj__name"><i className={`dot hue-${p.hue}`} /> {p.name}</span>
                      <Status p={p} row={row} />
                      {p.approvalEnabled && (!row || row.status === 'rejected') && start <= today && (
                        <button className="btn btn--glass btn--sm" onClick={() => submitPeriod(p.id, start)}>Submit for approval</button>
                      )}
                      {row?.status === 'submitted' && <button className="btn btn--ghost btn--sm" onClick={() => withdrawPeriod(p.id, row.start)}>Withdraw</button>}
                    </th>
                  </tr>
                  {mine.map(r => {
                    const own = logs.filter(w => w.task === r.id)
                    const canLog = r.status === 'progress' || r.status === 'review'
                    return (
                      <tr key={r.id}>
                        <th className="ts-task">{r.title}</th>
                        {ds.map(d => (
                          <td key={d} className={d === today ? 'is-today' : ''}>
                            <Cell task={r.id} day={d} logs={own.filter(w => w.date === d)}
                              disabled={d > today || locked(p, sheet.periods, me.id, d)} canCreate={canLog} />
                          </td>
                        ))}
                        <td className="ts-total num">{formatMinutes(sum(own))}</td>
                      </tr>
                    )
                  })}
                </tbody>
              )
            })}
            <tfoot>
              <tr>
                <th>Total</th>
                {ds.map(d => <td key={d} className="num">{hm(sum(sheet.worklogs.filter(w => w.date === d)))}</td>)}
                <td className="ts-total num">{formatMinutes(sum(sheet.worklogs))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {candidates.length > 0 && (
        <label className="ts-add">
          <Icon name="plus" size={16} />
          <select className="input" value="" aria-label="Add a task to this week" onChange={e => { if (e.target.value) setAdded(a => [...a, e.target.value]) }}>
            <option value="">Add a task to this week…</option>
            {candidates.map(t => <option key={t.id} value={t.id}>{t.title} · {projectOf(t.project).name}</option>)}
          </select>
        </label>
      )}
    </section>
  )
}

function Status({ p, row }: { p: Project; row: TimePeriod | undefined }) {
  if (!p.approvalEnabled && !row) return <span className="ts-chip">No approval</span>
  if (!row) return <span className="ts-chip">Open · {p.approvalPeriod === 'week' ? 'weekly' : 'monthly'}</span>
  if (row.status === 'submitted') return <span className="ts-chip is-sub">Submitted</span>
  if (row.status === 'approved') return <span className="ts-chip is-ok"><Icon name="shield" size={12} /> Approved</span>
  return <span className="ts-chip is-back" title={row.comment}>Sent back{row.comment ? `: ${row.comment}` : ''}</span>
}

/**
 * One day of one task. 0 or 1 worklogs: edit inline (empty deletes, a new value creates).
 * Several: show them, read-only here; they're edited on the task.
 */
function Cell({ task, day, logs, disabled, canCreate }: { task: string; day: string; logs: Worklog[]; disabled: boolean; canCreate: boolean }) {
  const { logWork, editWorklog, deleteWorklog, openDrawer } = useStore()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [bad, setBad] = useState(false)
  const total = sum(logs)
  const label = total ? formatMinutes(total) : ''

  if (logs.length > 1) {
    return (
      <button className="ts-cell is-multi" title={logs.map(w => `${formatMinutes(w.minutes)}${w.comment ? ` — ${w.comment}` : ''}`).join('\n')}
        onClick={() => openDrawer({ kind: 'task', id: task })}>
        {label}<small>×{logs.length}</small>
      </button>
    )
  }
  const one = logs[0]
  if (disabled || (!one && !canCreate)) return <span className={`ts-cell is-off ${disabled ? 'is-locked' : ''}`}>{label}</span>
  if (!editing) {
    return <button className="ts-cell" aria-label={`${label || 'Log time'} on ${day}`} onClick={() => { setText(label); setBad(false); setEditing(true) }}>{label}</button>
  }

  const save = async () => {
    const s = text.trim()
    if (!s) {
      if (one) await deleteWorklog(one.id)
      setEditing(false)
      return
    }
    const minutes = parseDuration(s)
    if (!minutes) { setBad(true); return }
    if (one && minutes === one.minutes) { setEditing(false); return }
    const ok = one ? await editWorklog(one.id, { minutes }) : await logWork(task, { minutes, date: day })
    if (ok) setEditing(false)
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); void save() }
    if (e.key === 'Escape') setEditing(false)
  }
  return (
    <input className="input ts-input" autoFocus value={text} placeholder="2h" aria-label={`Time on ${day}`} aria-invalid={bad}
      title={bad ? 'Use a time like 2h 30m, 1.5h or 90m.' : undefined}
      onChange={e => { setText(e.target.value); setBad(false) }} onKeyDown={onKey} onBlur={() => void save()} />
  )
}

/* ---------------- Team ---------------- */

function TeamWeek({ week }: { week: string }) {
  const { data, can } = useStore()
  const { sheet, loading } = useSheet(week, 'team')
  const projects = data.projects.filter(p => can(p.id, 'time.view_all'))
  const shown = projects.filter(p => p.approvalEnabled || sheet.worklogs.some(w => w.project === p.id) || sheet.periods.some(x => x.project === p.id))
  if (!loading && shown.length === 0) {
    return <section className="card glass rise ts-card"><p className="ts-empty">Nobody logged time this week on the projects you can see.</p></section>
  }
  return <>{shown.map((p, i) => <TeamProject key={p.id} p={p} week={week} sheet={sheet} i={i} />)}</>
}

function TeamProject({ p, week, sheet, i }: { p: Project; week: string; sheet: TimesheetData; i: number }) {
  const { me, can, person, reviewPeriod } = useStore()
  const [open, setOpen] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const ds = days(week)
  const logs = sheet.worklogs.filter(w => w.project === p.id)
  const people = [...new Set([...logs.map(w => w.user), ...sheet.periods.filter(x => x.project === p.id).map(x => x.user)])]
  const approver = can(p.id, 'time.approve')
  /** The row on screen may predate a weekly/monthly switch, so act on its own start. */
  const reject = async (user: string) => {
    const row = periodOf(p, user, week, sheet.periods).row
    if (!comment.trim() || !row) return
    if (await reviewPeriod(p.id, user, row.start, 'reject', comment.trim())) { setRejecting(null); setComment('') }
  }

  return (
    <section className="card glass rise ts-card" style={{ ['--i' as string]: i }}>
      <div className="card__head"><div><h2><i className={`dot hue-${p.hue}`} /> {p.name}</h2><p>{p.approvalEnabled ? `Approval ${p.approvalPeriod === 'week' ? 'weekly' : 'monthly'}` : 'No approval'}</p></div></div>
      {people.length === 0 ? <p className="ts-empty">No hours this week.</p> : (
        <div className="ts-scroll">
          <table className="ts-grid">
            <thead><tr><th>Person</th>{ds.map((d, k) => <th key={d}>{DAYS[k]} <small>{d.slice(8)}</small></th>)}<th>Total</th><th>Status</th></tr></thead>
            <tbody>
              {people.map(u => {
                const theirs = logs.filter(w => w.user === u)
                const { row } = periodOf(p, u, week, sheet.periods)
                const tasks = [...new Set(theirs.map(w => w.task))]
                return [
                  <tr key={u} className="ts-person">
                    <th>
                      <button className="ts-who" aria-expanded={open === u} onClick={() => setOpen(open === u ? null : u)}>
                        <Avatar p={person(u)} size={24} /> {person(u).name}
                      </button>
                    </th>
                    {ds.map(d => <td key={d} className="num">{hm(sum(theirs.filter(w => w.date === d)))}</td>)}
                    <td className="ts-total num">{formatMinutes(sum(theirs))}</td>
                    <td className="ts-actions">
                      <Status p={p} row={row} />
                      {approver && u !== me.id && row?.status === 'submitted' && (
                        <>
                          <button className="btn btn--primary btn--sm" onClick={() => reviewPeriod(p.id, u, row.start, 'approve')}>Approve</button>
                          <button className="btn btn--ghost btn--sm" onClick={() => { setRejecting(rejecting === u ? null : u); setComment('') }}>Reject</button>
                        </>
                      )}
                      {approver && u !== me.id && row?.status === 'approved' && (
                        <button className="btn btn--ghost btn--sm" onClick={() => reviewPeriod(p.id, u, row.start, 'reopen')}>Reopen</button>
                      )}
                    </td>
                  </tr>,
                  rejecting === u && (
                    <tr key={`${u}-reject`} className="ts-reject">
                      <td colSpan={10}>
                        <form onSubmit={e => { e.preventDefault(); void reject(u) }}>
                          <input className="input" autoFocus value={comment} onChange={e => setComment(e.target.value)} placeholder="What needs fixing?" aria-label="Reason for sending back" />
                          <button className="btn btn--primary btn--sm" disabled={!comment.trim()}>Send back</button>
                          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setRejecting(null)}>Cancel</button>
                        </form>
                      </td>
                    </tr>
                  ),
                  ...(open === u ? tasks.map(tid => {
                    const t = sheet.tasks.find(x => x.id === tid)
                    const tl = theirs.filter(w => w.task === tid)
                    return (
                      <tr key={`${u}-${tid}`} className="ts-sub">
                        <th className="ts-task">{t?.title ?? 'Task'}</th>
                        {ds.map(d => <td key={d} className="num">{hm(sum(tl.filter(w => w.date === d)))}</td>)}
                        <td className="num">{formatMinutes(sum(tl))}</td>
                        <td />
                      </tr>
                    )
                  }) : []),
                ]
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
