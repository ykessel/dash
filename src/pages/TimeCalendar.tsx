import { type FormEvent, useState } from 'react'
import { Icon } from '../components/Icon'
import { MONTHS_LONG, todayIso } from '../lib/date'
import { formatMinutes, parseDuration } from '../lib/duration'
import { addDaysIso, monthStart, periodEndOf, weekStart } from '../lib/periods'
import { useStore } from '../store'
import { hm, locked, sum, useSheet } from './timeShared'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
/** A full day's work; the bar under each day fills up to it. */
const FULL_DAY = 8 * 60

const shiftMonth = (start: string, n: number) => {
  const d = new Date(`${start}T00:00:00Z`)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)).toISOString().slice(0, 10)
}

/** My month at a glance: hours per day, and a panel to see or add the selected day's time. */
export function TimeCalendar() {
  const today = todayIso()
  const [month, setMonth] = useState(() => monthStart(today))
  const [day, setDay] = useState(today)
  const end = periodEndOf(month, 'month')
  const { sheet } = useSheet(month, end, 'me')

  // Monday-first weeks covering the whole month.
  const first = weekStart(month)
  const cells: string[] = []
  for (let d = first; d <= end || cells.length % 7; d = addDaysIso(d, 1)) cells.push(d)

  const pick = (d: string) => {
    setDay(d)
    if (d.slice(0, 7) !== month.slice(0, 7)) setMonth(monthStart(d))
  }
  const go = (n: number) => {
    const m = shiftMonth(month, n)
    setMonth(m)
    setDay(m.slice(0, 7) === today.slice(0, 7) ? today : m)
  }
  const monthTotal = sum(sheet.worklogs)
  const [y, mo] = month.split('-').map(Number)

  return (
    <div className="tc">
      <section className="card glass rise ts-card tc-month" style={{ ['--i' as string]: 0 }}>
        <div className="tc-head">
          <h2>{MONTHS_LONG[mo - 1]} {y}</h2>
          <span className="ts-chip num">{formatMinutes(monthTotal)} this month</span>
          <div className="tc-nav">
            <button className="ibtn" aria-label="Previous month" onClick={() => go(-1)}><Icon name="left" /></button>
            <button className="ibtn" aria-label="Next month" disabled={month >= monthStart(today)} onClick={() => go(1)}><Icon name="right" /></button>
            <button className="btn btn--glass btn--sm" disabled={month === monthStart(today)} onClick={() => { setMonth(monthStart(today)); setDay(today) }}>Today</button>
          </div>
        </div>
        <div className="tc-grid" role="grid" aria-label="Hours per day">
          {DAYS.map(d => <div key={d} className="tc-dow">{d}</div>)}
          {cells.map(d => {
            const m = sum(sheet.worklogs.filter(w => w.date === d))
            const out = d.slice(0, 7) !== month.slice(0, 7)
            const cls = ['tc-day', out && 'is-out', d === today && 'is-today', d === day && 'is-sel', d > today && 'is-future'].filter(Boolean).join(' ')
            return (
              <button key={d} className={cls} aria-pressed={d === day} aria-label={`${d}${m ? `, ${formatMinutes(m)}` : ''}`} onClick={() => pick(d)}>
                <span className="tc-num">{Number(d.slice(8))}</span>
                {!out && <b className="tc-h num">{hm(m)}</b>}
                {!out && m > 0 && <i className="tc-bar"><i style={{ width: `${Math.min(1, m / FULL_DAY) * 100}%` }} className={m > FULL_DAY ? 'is-over' : ''} /></i>}
              </button>
            )
          })}
        </div>
      </section>
      <DayPanel day={day} sheet={sheet} />
    </div>
  )
}

function DayPanel({ day, sheet }: { day: string; sheet: ReturnType<typeof useSheet>['sheet'] }) {
  const { data, me, can, project: projectOf, logWork, deleteWorklog, openDrawer } = useStore()
  const today = todayIso()
  const logs = sheet.worklogs.filter(w => w.date === day)
  const title = (id: string) => data.tasks.find(t => t.id === id)?.title ?? sheet.tasks.find(t => t.id === id)?.title ?? 'Task'
  const mine = data.tasks.filter(t => t.assignee === me.id && (t.status === 'progress' || t.status === 'review') && !t.id.startsWith('tmp-'))
  const [task, setTask] = useState('')
  const [time, setTime] = useState('')
  const [comment, setComment] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const chosen = mine.find(t => t.id === task) ?? mine[0]
  const future = day > today
  const isLocked = chosen ? locked(projectOf(chosen.project), sheet.periods, me.id, day) : false

  const add = async (e: FormEvent) => {
    e.preventDefault()
    if (!chosen) return
    const minutes = parseDuration(time)
    if (!minutes) { setErr('Use a time like 2h 30m, 1.5h or 90m.'); return }
    setBusy(true)
    const ok = await logWork(chosen.id, { minutes, date: day, comment: comment.trim() || undefined })
    setBusy(false)
    if (ok) { setTime(''); setComment(''); setErr(null) }
  }

  const label = new Date(`${day}T00:00:00Z`).toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })
  return (
    <section className="card glass rise ts-card tc-panel" style={{ ['--i' as string]: 1 }}>
      <div className="card__head"><div><h2>{label}</h2><p>{logs.length ? `${formatMinutes(sum(logs))} logged` : 'Nothing logged'}</p></div></div>

      {logs.length > 0 && (
        <ul className="lw__list">
          {logs.map(w => {
            const p = projectOf(w.project)
            const del = can(w.project, 'time.delete_own') && !locked(p, sheet.periods, me.id, w.date)
            return (
              <li key={w.id} className="lw__item tc-log">
                <i className={`dot hue-${p.hue}`} />
                <div>
                  <button className="tc-task" onClick={() => openDrawer({ kind: 'task', id: w.task })}>{title(w.task)}</button>
                  <small> · {p.name}</small>
                  {w.comment && <p>{w.comment}</p>}
                </div>
                <b className="num">{formatMinutes(w.minutes)}</b>
                {del ? <button className="ibtn" aria-label="Delete worklog" onClick={() => deleteWorklog(w.id)}><Icon name="trash" size={16} /></button> : <span />}
              </li>
            )
          })}
        </ul>
      )}

      <h3 className="tc-sub">Add time</h3>
      {mine.length === 0 ? (
        <p className="lw__note">You have no tasks In progress or In review. Time is logged on those.</p>
      ) : future ? (
        <p className="lw__note">That day hasn’t happened yet.</p>
      ) : (
        <form className="tc-form" onSubmit={add} noValidate>
          <select className="input" value={chosen?.id ?? ''} onChange={e => setTask(e.target.value)} aria-label="Task">
            {mine.map(t => <option key={t.id} value={t.id}>{t.title} · {projectOf(t.project).name}</option>)}
          </select>
          <div className="tc-row">
            <input className="input" value={time} onChange={e => { setTime(e.target.value); setErr(null) }} placeholder="2h 30m" aria-label="Time spent" aria-invalid={!!err} disabled={isLocked} />
            <input className="input" value={comment} onChange={e => setComment(e.target.value)} placeholder="What did you work on?" aria-label="Comment" disabled={isLocked} />
          </div>
          <button className="btn btn--primary btn--sm" disabled={busy || isLocked}>Log {time && parseDuration(time) ? formatMinutes(parseDuration(time)!) : 'time'}</button>
          {isLocked && <p className="lw__note">This day is in a period already submitted or approved for {projectOf(chosen!.project).name}.</p>}
          {err && <p className="lw__err" role="alert">{err}</p>}
        </form>
      )}
    </section>
  )
}
