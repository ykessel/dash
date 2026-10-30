import { type FormEvent, useEffect, useState } from 'react'
import type { Task, Worklog } from '../data/types'
import { todayIso } from '../lib/date'
import { formatMinutes, parseDuration } from '../lib/duration'
import { useStore } from '../store'
import { Icon } from './Icon'
import { Avatar } from './ui'

const ONLY_ACTIVE = 'Time can only be logged while the task is In progress or In review.'
const BAD_TIME = 'Use a time like 2h 30m, 1.5h or 90m.'

/**
 * Task → Log work, Jira style: logged / remaining / estimate, a form for the assignee, and the
 * worklogs I'm allowed to see (mine, or everyone's with "See everyone's time").
 */
export function LogWork({ t }: { t: Task }) {
  const { data, me, can, person, logWork, editWorklog, deleteWorklog, worklogsOf, timeTick } = useStore()
  const [list, setList] = useState<Worklog[]>([])
  const [time, setTime] = useState('')
  const [date, setDate] = useState(todayIso())
  const [comment, setComment] = useState('')
  const [remaining, setRemaining] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const real = !t.id.startsWith('tmp-')
  useEffect(() => {
    if (!real) return
    let live = true
    worklogsOf(t.id).then(l => { if (live) setList(l) }).catch(() => { /* the totals still show */ })
    return () => { live = false }
  }, [t.id, real, timeTick, worklogsOf])

  const mine = t.assignee === me.id && can(t.project, 'time.log')
  const active = t.status === 'progress' || t.status === 'review'
  const estimate = Math.round(t.estimate * 60)
  const total = Math.max(1, t.loggedMinutes + t.remainingMinutes, estimate)
  const mayEdit = (w: Worklog) => can(t.project, w.user === me.id ? 'time.edit_own' : 'time.edit_any') || can(t.project, 'time.edit_any')
  const mayDelete = (w: Worklog) => can(t.project, w.user === me.id ? 'time.delete_own' : 'time.delete_any') || can(t.project, 'time.delete_any')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const minutes = parseDuration(time)
    if (!minutes) { setErr(BAD_TIME); return }
    const left = remaining.trim() ? parseDuration(remaining) ?? (remaining.trim() === '0' ? 0 : null) : undefined
    if (left === null) { setErr(BAD_TIME); return }
    setBusy(true)
    const ok = await logWork(t.id, { minutes, date, comment: comment.trim() || undefined, ...(left !== undefined ? { remaining: left } : {}) })
    setBusy(false)
    if (ok) { setTime(''); setComment(''); setRemaining(''); setErr(null) }
  }

  return (
    <section className="tp__block lw">
      <header><h3>Time</h3><span className="badge num">{formatMinutes(t.loggedMinutes)}</span></header>
      <div className="lw__bar" role="img" aria-label={`${formatMinutes(t.loggedMinutes)} logged, ${formatMinutes(t.remainingMinutes)} remaining`}>
        <span className="lw__logged" style={{ width: `${(t.loggedMinutes / total) * 100}%` }} />
        <span className="lw__left" style={{ width: `${(t.remainingMinutes / total) * 100}%` }} />
      </div>
      <dl className="lw__nums">
        <div><dt>Logged</dt><dd>{formatMinutes(t.loggedMinutes)}</dd></div>
        <div><dt>Remaining</dt><dd>{formatMinutes(t.remainingMinutes)}</dd></div>
        <div><dt>Estimate</dt><dd>{formatMinutes(estimate)}</dd></div>
      </dl>

      {mine && real && (
        <form className="lw__form" onSubmit={submit} noValidate>
          <input className="input" value={time} onChange={e => { setTime(e.target.value); setErr(null) }} placeholder="2h 30m" aria-label="Time spent" aria-invalid={!!err} disabled={!active} />
          <input className="input" type="date" value={date} max={todayIso()} onChange={e => setDate(e.target.value)} aria-label="Day" disabled={!active} />
          <input className="input lw__comment" value={comment} onChange={e => setComment(e.target.value)} placeholder="What did you work on?" aria-label="Comment" disabled={!active} />
          <input className="input" value={remaining} onChange={e => { setRemaining(e.target.value); setErr(null) }} placeholder="Remaining (auto)" aria-label="Remaining estimate" disabled={!active} />
          <button className="btn btn--primary btn--sm" disabled={!active || busy}>Log</button>
          {!active && <p className="lw__note">{ONLY_ACTIVE}</p>}
          {err && <p className="lw__err" role="alert">{err}</p>}
        </form>
      )}

      {list.length > 0 && (
        <ul className="lw__list">
          {list.map(w => editing === w.id
            ? <EditRow key={w.id} w={w} onDone={() => setEditing(null)} onSave={patch => editWorklog(w.id, patch)} />
            : (
              <li key={w.id} className="lw__item">
                <Avatar p={person(w.user)} size={24} />
                <div>
                  <b>{formatMinutes(w.minutes)}</b> <small>{w.date}{w.user !== me.id ? ` · ${person(w.user).name.split(' ')[0]}` : ''}</small>
                  {w.comment && <p>{w.comment}</p>}
                </div>
                {mayEdit(w) && <button className="ibtn" aria-label="Edit worklog" onClick={() => setEditing(w.id)}><Icon name="gear" size={16} /></button>}
                {mayDelete(w) && <button className="ibtn" aria-label="Delete worklog" onClick={() => deleteWorklog(w.id)}><Icon name="trash" size={16} /></button>}
              </li>
            ))}
        </ul>
      )}
      {data.access[t.project] && !can(t.project, 'time.view_all') && t.loggedMinutes > list.reduce((s, w) => s + w.minutes, 0) && (
        <p className="lw__note">Others’ worklogs are hidden; the totals include them.</p>
      )}
    </section>
  )
}

function EditRow({ w, onSave, onDone }: { w: Worklog; onSave: (p: { minutes: number; comment: string }) => Promise<boolean>; onDone: () => void }) {
  const [time, setTime] = useState(formatMinutes(w.minutes))
  const [comment, setComment] = useState(w.comment)
  const [err, setErr] = useState(false)
  const save = async (e: FormEvent) => {
    e.preventDefault()
    const minutes = parseDuration(time)
    if (!minutes) { setErr(true); return }
    if (await onSave({ minutes, comment: comment.trim() })) onDone()
  }
  return (
    <li className="lw__item">
      <form className="lw__form" onSubmit={save} noValidate>
        <input className="input" value={time} autoFocus onChange={e => { setTime(e.target.value); setErr(false) }} aria-label="Time spent" aria-invalid={err} />
        <input className="input lw__comment" value={comment} onChange={e => setComment(e.target.value)} aria-label="Comment" />
        <button className="btn btn--primary btn--sm">Save</button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onDone}>Cancel</button>
        {err && <p className="lw__err" role="alert">{BAD_TIME}</p>}
      </form>
    </li>
  )
}
