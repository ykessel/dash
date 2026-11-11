import { type KeyboardEvent, useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { Avatar, Bar, Popover, Seg, Stat } from '../components/ui'
import type { Project, TimePeriod, TimesheetData, Worklog } from '../data/types'
import { short, todayIso } from '../lib/date'
import { formatMinutes, parseDuration } from '../lib/duration'
import { addDaysIso, periodStartOf, weekStart } from '../lib/periods'
import { useStore } from '../store'
import { TimeCalendar } from './TimeCalendar'
import { TimeReports } from './TimeReports'
import { FULL_DAY, WEEK_TARGET, hm, locked, sum, useSheet } from './timeShared'

type Tab = 'mine' | 'calendar' | 'team' | 'reports'
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Weekly timesheet, Tempo style: my grid, the team's hours to approve, and reports. */
export function Timesheet() {
  const { data, can } = useStore()
  const [tab, setTab] = useState<Tab>('mine')
  const [week, setWeek] = useState(() => weekStart(todayIso()))
  const team = data.projects.some(p => can(p.id, 'time.view_all'))

  const options: { value: Tab; label: string }[] = [{ value: 'mine', label: 'My time' }, { value: 'calendar', label: 'Calendar' }]
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
        {(tab === 'mine' || tab === 'team') && <WeekNav week={week} onChange={setWeek} />}
      </div>
      {tab === 'reports' ? <TimeReports /> : tab === 'calendar' ? <TimeCalendar /> : tab === 'team' && team ? <TeamWeek week={week} /> : <MyWeek week={week} />}
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

const days = (week: string) => DAYS.map((_, i) => addDaysIso(week, i))

/** The approval row for this person, project and week: the period holding the week's Monday. */
function periodOf(p: Project, user: string, week: string, periods: TimePeriod[]): { start: string; row: TimePeriod | undefined } {
  const start = periodStartOf(week, p.approvalPeriod)
  return { start, row: periods.find(x => x.project === p.id && x.user === user && x.start <= week && x.end >= week) }
}


/* ---------------- My time ---------------- */

type Row = { id: string; title: string; project: string; status: string }

/** Projects whose period holding this week can be sent now and that have hours in it. */
function sendable(projects: Project[], me: string, week: string, sheet: TimesheetData, today: string) {
  return projects.flatMap(p => {
    const { start, row } = periodOf(p, me, week, sheet.periods)
    const open = p.approvalEnabled && (!row || row.status === 'rejected') && start <= today
    return open && sheet.worklogs.some(w => w.project === p.id) ? [{ p, start }] : []
  })
}

function MyWeek({ week }: { week: string }) {
  const { data, me, project: projectOf, submitPeriod, timesheet, notify } = useStore()
  const { sheet, loading } = useSheet(week, addDaysIso(week, 6), 'me')
  const [added, setAdded] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const ds = days(week)
  const today = todayIso()

  const loggable = (t: { assignee?: string | null; status: string; id: string }) =>
    t.assignee === me.id && (t.status === 'progress' || t.status === 'review') && !t.id.startsWith('tmp-')
  const active = data.tasks.filter(loggable)
  const rows = useMemo(() => {
    const ids = new Set([...sheet.tasks.map(t => t.id), ...added])
    const byId = new Map(sheet.tasks.map(t => [t.id, t]))
    return [...ids].map((id): Row | null => {
      const live = data.tasks.find(t => t.id === id)
      const t = byId.get(id)
      return live ? { id, title: live.title, project: live.project, status: live.status } : t ? { id, title: t.title, project: t.project, status: t.status } : null
    }).filter(r => r !== null)
  }, [sheet.tasks, added, data.tasks])
  const groups = [...new Set(rows.map(r => r.project))]
  const candidates = active.filter(t => !rows.some(r => r.id === t.id))

  const total = sum(sheet.worklogs)
  const isNow = week === weekStart(today)
  const todayMin = sum(sheet.worklogs.filter(w => w.date === today))
  const daysLogged = new Set(sheet.worklogs.map(w => w.date)).size
  const toSend = sendable(groups.map(projectOf), me.id, week, sheet, today)
  const pending = sum(sheet.worklogs.filter(w => toSend.some(s => s.p.id === w.project)))

  const submitAll = async () => {
    setBusy(true)
    let sent = 0
    for (const s of toSend) if (await submitPeriod(s.p.id, s.start)) sent++
    setBusy(false)
    if (sent) notify(sent === 1 ? `Sent ${toSend[0].p.name} for approval` : `Sent ${sent} projects for approval`)
  }
  const copyLast = async () => {
    setBusy(true)
    try {
      const last = await timesheet({ from: addDaysIso(week, -7), to: addDaysIso(week, -1), user: 'me' })
      const ids = last.tasks.map(t => t.id).filter(id => !rows.some(r => r.id === id) && active.some(t => t.id === id))
      if (ids.length) {
        setAdded(a => [...a, ...ids])
        notify(`Added ${ids.length} task${ids.length === 1 ? '' : 's'} from last week`)
      } else notify('Nothing from last week to add. Tasks need to be In progress or In review.', 'warn')
    } catch {
      notify('Couldn’t load last week.', 'warn')
    } finally {
      setBusy(false)
    }
  }

  /** Arrow keys move between day cells, like a spreadsheet. */
  const onGridKey = (e: KeyboardEvent<HTMLTableElement>) => {
    const from = (e.target as HTMLElement).closest<HTMLElement>('[data-r]')
    if (!from || (e.target as HTMLElement).tagName === 'INPUT') return
    const step = ({ ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] } as Record<string, number[]>)[e.key]
    if (!step) return
    const to = e.currentTarget.querySelector<HTMLElement>(`[data-r="${Number(from.dataset.r) + step[0]}"][data-c="${Number(from.dataset.c) + step[1]}"]`)
    if (to) { e.preventDefault(); to.focus() }
  }

  let r = 0
  return (
    <>
      <div className="ts-summary rise" style={{ ['--i' as string]: 0 }}>
        <div className="stats">
          <div className="stat ts-stat">
            <small>This week</small>
            <b>{formatMinutes(total) || '0h'}<i>/ {WEEK_TARGET / 60}h</i></b>
            <Bar value={total / WEEK_TARGET} />
          </div>
          {isNow
            ? <Stat label="Today">{formatMinutes(todayMin) || '0h'}<i>{todayMin >= FULL_DAY ? 'done' : `${formatMinutes(FULL_DAY - todayMin)} left`}</i></Stat>
            : <Stat label="Days logged">{daysLogged}<i>/ 5</i></Stat>}
          <Stat label="To submit">{toSend.length}<i>{toSend.length ? formatMinutes(pending) : 'all sent'}</i></Stat>
        </div>
        <div className="page-actions">
          <button className="btn btn--glass" disabled={busy} onClick={() => void copyLast()}><Icon name="layers" /> Copy last week</button>
          {toSend.length > 0 && <button className="btn btn--primary" disabled={busy} onClick={() => void submitAll()}><Icon name="check" /> Submit week</button>}
        </div>
      </div>

      <section className="card glass rise ts-card" style={{ ['--i' as string]: 1 }}>
        {groups.length === 0 && !loading && <p className="ts-empty">No hours this week yet. Add a task you’re working on, or copy last week’s.</p>}
        {(groups.length > 0 || candidates.length > 0) && (
          <div className="ts-scroll">
            <table className="ts-grid ts-grid--mine" onKeyDown={onGridKey}>
              {groups.length > 0 && (
                <thead>
                  <tr>
                    <th className="ts-head-task">Task</th>
                    {ds.map((d, i) => <th key={d} className={dayCls(d, i, today)}>{DAYS[i]} <small>{d.slice(8)}</small></th>)}
                    <th className="ts-total">Total</th>
                  </tr>
                </thead>
              )}
              {groups.map(pid => {
                const p = projectOf(pid)
                const mine = rows.filter(x => x.project === pid)
                const logs = sheet.worklogs.filter(w => w.project === pid)
                const { start, row } = periodOf(p, me.id, week, sheet.periods)
                return (
                  <tbody key={pid}>
                    <tr className="ts-proj" data-hue={p.hue}>
                      <th colSpan={8}>
                        <span className="ts-proj__name">{p.name}</span>
                        <StatusMenu p={p} row={row} start={start} canSubmit={start <= today && logs.length > 0} />
                      </th>
                      <th className="ts-total ts-proj__sum">{hm(sum(logs))}</th>
                    </tr>
                    {mine.map(x => {
                      const own = logs.filter(w => w.task === x.id)
                      const canLog = x.status === 'progress' || x.status === 'review'
                      const ri = r++
                      return (
                        <tr key={x.id}>
                          <th className="ts-task" title={x.title}>{x.title}</th>
                          {ds.map((d, i) => (
                            <td key={d} className={dayCls(d, i, today)}>
                              <Cell task={x.id} day={d} logs={own.filter(w => w.date === d)} pos={[ri, i]}
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
              {candidates.length > 0 && (
                <tbody>
                  <tr className="ts-addrow">
                    <td colSpan={9}>
                      <label className="ts-add">
                        <Icon name="plus" size={16} />
                        <select className="input" value="" aria-label="Add a task to this week" onChange={e => { if (e.target.value) setAdded(a => [...a, e.target.value]) }}>
                          <option value="">Add a task to this week…</option>
                          {candidates.map(t => <option key={t.id} value={t.id}>{t.title} · {projectOf(t.project).name}</option>)}
                        </select>
                      </label>
                    </td>
                  </tr>
                </tbody>
              )}
              {groups.length > 0 && (
                <tfoot>
                  <tr>
                    <th>Total</th>
                    {ds.map((d, i) => {
                      const m = sum(sheet.worklogs.filter(w => w.date === d))
                      return (
                        <td key={d} className={`num ${dayCls(d, i, today)}`}>
                          {hm(m) || '–'}
                          {i < 5 && <i className="tc-bar ts-daybar"><i style={{ width: `${Math.min(1, m / FULL_DAY) * 100}%` }} className={m > FULL_DAY ? 'is-over' : ''} /></i>}
                        </td>
                      )
                    })}
                    <td className="ts-total num">{formatMinutes(total)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </section>
    </>
  )
}

const dayCls = (d: string, i: number, today: string) => [d === today && 'is-today', i >= 5 && 'is-we'].filter(Boolean).join(' ')

/** The period's state; when there's something to do with it, the chip opens a small menu. */
function StatusMenu({ p, row, start, canSubmit }: { p: Project; row: TimePeriod | undefined; start: string; canSubmit: boolean }) {
  const { submitPeriod, withdrawPeriod } = useStore()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const submit = p.approvalEnabled && (!row || row.status === 'rejected') && canSubmit
  const withdraw = row?.status === 'submitted'
  if (!submit && !withdraw) return <Status p={p} row={row} />
  const close = () => setAnchor(null)
  return (
    <>
      <button className="ts-chipbtn" aria-haspopup="menu" aria-expanded={!!anchor} onClick={e => setAnchor(anchor ? null : e.currentTarget)}>
        <Status p={p} row={row} /><Icon name="down" size={14} />
      </button>
      {anchor && (
        <Popover anchor={anchor} onClose={close} align="left">
          {submit && <button className="menu__item" onClick={() => { close(); void submitPeriod(p.id, start) }}>Submit {p.name} for approval <Icon name="check" /></button>}
          {withdraw && <button className="menu__item" onClick={() => { close(); void withdrawPeriod(p.id, row.start) }}>Withdraw submission <Icon name="left" /></button>}
        </Popover>
      )}
    </>
  )
}

function Status({ p, row }: { p: Project; row: TimePeriod | undefined }) {
  if (!p.approvalEnabled && !row) return <span className="ts-chip is-quiet">No approval</span>
  if (!row) return <span className="ts-chip">Open · {p.approvalPeriod === 'week' ? 'weekly' : 'monthly'}</span>
  if (row.status === 'submitted') return <span className="ts-chip is-sub">Submitted</span>
  if (row.status === 'approved') return <span className="ts-chip is-ok"><Icon name="shield" size={12} /> Approved</span>
  return <span className="ts-chip is-back" title={row.comment}>Sent back{row.comment ? `: ${row.comment}` : ''}</span>
}

/**
 * One day of one task. 0 or 1 worklogs: edit inline (empty deletes, a new value creates).
 * Several: a menu lists them, and they're edited on the task.
 */
function Cell({ task, day, logs, disabled, canCreate, pos }: { task: string; day: string; logs: Worklog[]; disabled: boolean; canCreate: boolean; pos: [number, number] }) {
  const { logWork, editWorklog, deleteWorklog, openDrawer } = useStore()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [bad, setBad] = useState(false)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const total = sum(logs)
  const label = total ? formatMinutes(total) : ''
  const at = { 'data-r': pos[0], 'data-c': pos[1] }

  if (logs.length > 1) {
    return (
      <>
        <button {...at} className="ts-cell is-multi" aria-haspopup="menu" aria-label={`${label} in ${logs.length} entries on ${day}`}
          onClick={e => setAnchor(anchor ? null : e.currentTarget)}>
          {label}<small>{logs.length}</small>
        </button>
        {anchor && (
          <Popover anchor={anchor} onClose={() => setAnchor(null)} align="left" className="ts-entries">
            {logs.map(w => (
              <div key={w.id} className="ts-entry">
                <b className="num">{formatMinutes(w.minutes)}</b>
                <span>{w.comment || 'No comment'}</span>
              </div>
            ))}
            <div className="menu__sep" />
            <button className="menu__item" onClick={() => { setAnchor(null); openDrawer({ kind: 'task', id: task }) }}>Edit on the task <Icon name="right" /></button>
          </Popover>
        )}
      </>
    )
  }
  const one = logs[0]
  if (disabled || (!one && !canCreate)) {
    return <span {...at} tabIndex={-1} className={`ts-cell is-off ${disabled ? 'is-locked' : ''}`} title={disabled && day <= todayIso() ? 'Locked: this period was submitted or approved' : undefined}>{label}</span>
  }
  if (!editing) {
    return <button {...at} className={`ts-cell ${label ? '' : 'is-empty'}`} aria-label={`${label || 'Log time'} on ${day}`} onClick={() => { setText(label); setBad(false); setEditing(true) }}>{label}</button>
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
    <input {...at} className="input ts-input" autoFocus value={text} placeholder="2h" aria-label={`Time on ${day}`} aria-invalid={bad}
      title={bad ? 'Use a time like 2h 30m, 1.5h or 90m.' : undefined}
      onChange={e => { setText(e.target.value); setBad(false) }} onKeyDown={onKey} onBlur={() => void save()} />
  )
}

/* ---------------- Team ---------------- */

function TeamWeek({ week }: { week: string }) {
  const { data, can } = useStore()
  const { sheet, loading } = useSheet(week, addDaysIso(week, 6), 'team')
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
      <div className="card__head"><div><h2><i className="dot" data-hue={p.hue} /> {p.name}</h2><p>{p.approvalEnabled ? `Approval ${p.approvalPeriod === 'week' ? 'weekly' : 'monthly'}` : 'No approval'}</p></div></div>
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
