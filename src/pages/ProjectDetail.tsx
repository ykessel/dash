import { useMemo, useState } from 'react'
import { LineChart } from '../components/Charts'
import { Icon } from '../components/Icon'
import { PRESENCE_LABEL } from '../components/Overlays'
import { Avatar, CountUp, Prio, Seg, Stack, Stat, Switch } from '../components/ui'
import type { Status, Task } from '../data/types'
import { addDays, diffDays, fmtTime, iso, parse, relDue, short, todayIso, weekday } from '../lib/date'
import { daysLeft, projectProgress, sortByDue } from '../lib/metrics'
import { go } from '../lib/router'
import { useStore } from '../store'
import { StatusBadge } from './Projects'

const GROUPS: { s: Status; label: string }[] = [
  { s: 'todo', label: 'To do' },
  { s: 'progress', label: 'In progress' },
  { s: 'review', label: 'In review' },
  { s: 'done', label: 'Done' },
]
const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const smoothstep = (x: number) => x * x * (3 - 2 * x)

export function ProjectDetail({ id }: { id: string }) {
  const { data, updateProject, openModal, notify } = useStore()
  const p = data.projects.find(x => x.id === id)

  // A plausible history: scope grows early on, work gets done later.
  const burn = useMemo(() => {
    if (!p) return null
    const tasks = data.tasks.filter(t => t.project === p.id)
    const end = todayIso() < p.due ? todayIso() : p.due
    const span = Math.max(1, diffDays(end, p.start))
    const days = Array.from({ length: span + 1 }, (_, i) => iso(addDays(parse(p.start), i)))
    const total = tasks.length
    const done = tasks.filter(t => t.status === 'done').length
    const totalSeries = days.map((_, i) => +(total * smoothstep(Math.min(1, (i / span) * 1.15))).toFixed(1))
    const doneSeries = days.map((_, i) => Math.min(totalSeries[i], +(done * smoothstep(Math.max(0, (i / span - 0.25) / 0.75))).toFixed(1)))
    return { days, doneSeries, totalSeries, total }
  }, [data.tasks, p])

  if (!p || !burn) {
    return (
      <>
        <header className="page-head"><h1>Not found</h1><p>This project doesn’t exist anymore.</p></header>
        <a className="btn btn--glass" href="#/projects">Back to projects</a>
      </>
    )
  }

  const pr = projectProgress(data, p.id)
  const dl = daysLeft(p.due)

  return (
    <>
      <header className="page-head page-head--with-back">
        <button className="ibtn ibtn--glass head__back" onClick={() => go('projects')} aria-label="Back to projects"><Icon name="left" size={20} /></button>
        <span className="picon picon--xl head__icon" data-hue={p.hue}><Icon name={p.icon} /></span>
        <div>
          <h1>{p.name}</h1>
          <p>{p.desc}</p>
        </div>
      </header>
      <div className="page-bar">
        <div className="stats">
          <Stat label="Progress"><CountUp value={Math.round(pr.pct * 100)} />%</Stat>
          <Stat label="Open tasks"><CountUp value={pr.open} /></Stat>
          <Stat label="Done"><CountUp value={pr.done} /></Stat>
          <Stat label={dl < 0 ? 'Days late' : 'Days left'}><CountUp value={Math.abs(dl)} /></Stat>
        </div>
        <div className="page-actions">
          <button className="btn btn--glass pstar--btn" aria-pressed={p.pinned} onClick={() => { updateProject(p.id, { pinned: !p.pinned }); notify(p.pinned ? 'Unpinned from the sidebar' : 'Pinned to the sidebar', 'info') }}>
            <Icon name="star" className={p.pinned ? 'star-fill' : ''} /> {p.pinned ? 'Pinned' : 'Pin'}
          </button>
          <button className="btn btn--glass" onClick={() => openModal({ kind: 'event', preset: { project: p.id } })}><Icon name="calplus" /> New event</button>
        </div>
      </div>

      <div className="pd" data-hue={p.hue}>
        <div className="pd__col">
          <Overview id={p.id} />
          <Milestones id={p.id} />
          <TimeApproval id={p.id} />
          <ComingUp id={p.id} />
        </div>
        <div className="pd__col">
          <section className="card glass rise pd-burn" style={{ ['--i' as string]: 1 }}>
            <div className="card__head">
              <div><h2>Burn-up</h2><p>Tasks done against the total, over the project’s life</p></div>
            </div>
            <div className="burn__legend">
              <span><i style={{ background: `var(--${p.hue})` }} /> Done</span>
              <span><i className="burn__dash" /> Total</span>
            </div>
            <LineChart
              height={250}
              labels={burn.days.map(short)}
              yMax={Math.max(10, Math.ceil(burn.total / 10) * 10)}
              fmtY={v => `${v} tasks`}
              series={[
                { name: 'Total', values: burn.totalSeries, color: 'var(--text-3)', dashed: true },
                { name: 'Done', values: burn.doneSeries, color: `var(--${p.hue})`, area: true },
              ]}
              fmtTip={i => <>{Math.round(burn.doneSeries[i])} of {Math.round(burn.totalSeries[i])} done<small>{short(burn.days[i])}</small></>}
              xTicks={6}
            />
          </section>
          <TaskGroups id={p.id} />
        </div>
      </div>
    </>
  )
}

/* ---------------- Overview: lead, status, timeline, people ---------------- */

function Overview({ id }: { id: string }) {
  const { data, person, openDrawer } = useStore()
  const p = data.projects.find(x => x.id === id)!
  const lead = person(p.lead)
  const span = Math.max(1, diffDays(p.due, p.start))
  const at = (day: string) => Math.max(0, Math.min(1, diffDays(day, p.start) / span))
  const now = at(todayIso())
  const nowCls = now < 0.08 ? 'is-start' : now > 0.92 ? 'is-end' : ''

  return (
    <section className="card glass rise pd-over" style={{ ['--i' as string]: 0 }}>
      <div className="card__head"><h2>Overview</h2></div>
      <dl className="tp__meta">
        <div><dt>Lead</dt><dd><button className="ov__lead" onClick={() => openDrawer({ kind: 'person', id: lead.id })}><Avatar p={lead} size={24} /><span>{lead.name}</span></button></dd></div>
        <div><dt>Status</dt><dd><StatusBadge s={p.status} /></dd></div>
      </dl>
      <div className="tline" aria-label={`${Math.round(now * 100)}% of the project timeline has passed`}>
        <div className="tline__track">
          <span className="tline__fill" style={{ transform: `scaleX(${now})` }} />
          {p.milestones.map(m => (
            <span key={m.id} className={`tline__ms ${m.done ? 'is-done' : ''}`} style={{ left: `${at(m.due) * 100}%` }} title={`${m.title} · ${short(m.due)}`} />
          ))}
          {p.status !== 'shipped' && (
            <span className={`tline__now ${nowCls}`} style={{ left: `${now * 100}%` }}><em>Today</em></span>
          )}
        </div>
        <div className="tline__ends">
          <span><small>Started</small>{short(p.start)}</span>
          <span><small>{p.status === 'shipped' ? 'Shipped' : 'Due'}</small>{short(p.due)}</span>
        </div>
      </div>
      <People id={p.id} />
    </section>
  )
}

/** The project's people and their roles; the lead and anyone with project.admin can change them. */
function People({ id }: { id: string }) {
  const { data, person, openDrawer, can, setProjectMember, removeProjectMember, setDefaultRole } = useStore()
  const p = data.projects.find(x => x.id === id)!
  const admin = can(p.id, 'project.admin')
  const roleName = (rid: string | undefined) => data.roles.find(r => r.id === rid)?.name ?? 'Member'
  const outside = data.people.filter(x => !p.members.includes(x.id))
  const [adding, setAdding] = useState('')
  const [addRole, setAddRole] = useState(p.defaultRole)
  const roleSelect = (value: string, onChange: (v: string) => void, label: string) => (
    <select className="input" value={value} onChange={e => onChange(e.target.value)} aria-label={label}>
      {data.roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
    </select>
  )

  return (
    <>
      <h3 className="ov__h">People <span className="badge num">{p.members.length}</span></h3>
      <ul className="ov__people">
        {p.members.map(mid => {
          const m = person(mid)
          const lead = m.id === p.lead
          return (
            <li key={mid} className={admin ? 'pp-row' : undefined}>
              <button className="ov__person" onClick={() => openDrawer({ kind: 'person', id: m.id })}>
                <Avatar p={m} size={34} presence />
                <span><b>{m.name}</b><small>{lead ? 'Lead · ' : ''}{admin ? PRESENCE_LABEL[m.presence] : roleName(p.roles[mid])}</small></span>
              </button>
              {admin && roleSelect(p.roles[mid] ?? p.defaultRole, v => setProjectMember(p.id, mid, v), `${m.name}’s role`)}
              {admin && (lead
                ? <span className="ibtn" aria-hidden="true" />
                : <button className="ibtn ibtn--glass" aria-label={`Remove ${m.name}`} onClick={() => removeProjectMember(p.id, mid)}><Icon name="close" size={16} /></button>)}
            </li>
          )
        })}
      </ul>
      {admin && (
        <div className="pp-add">
          {outside.length > 0 && (
            <>
              <select className="input" value={adding} onChange={e => setAdding(e.target.value)} aria-label="Person to add">
                <option value="">Add someone…</option>
                {outside.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
              {roleSelect(addRole, setAddRole, 'Their role')}
              <button className="btn btn--glass btn--sm" disabled={!adding} onClick={() => { setProjectMember(p.id, adding, addRole); setAdding('') }}>Add</button>
            </>
          )}
          <small>Everyone else in the workspace:</small>
          {roleSelect(p.defaultRole, v => setDefaultRole(p.id, v), 'Role for everyone else')}
        </div>
      )}
      {!admin && <p className="pp-add"><small>Everyone else in the workspace: {roleName(p.defaultRole)}</small></p>}
    </>
  )
}

/* ---------------- Time approval (project admins) ---------------- */

function TimeApproval({ id }: { id: string }) {
  const { data, can, updateProject } = useStore()
  const p = data.projects.find(x => x.id === id)!
  if (!can(p.id, 'project.admin')) return null
  return (
    <section className="card glass rise pd-approval" style={{ ['--i' as string]: 2 }}>
      <div className="card__head"><div><h2>Time approval</h2><p>Hours are locked once submitted for a period</p></div></div>
      <ul className="set-rows">
        <li>
          <div><b>Require time approval</b><small>People submit their hours; approvers accept or send them back</small></div>
          <Switch on={p.approvalEnabled} onToggle={() => updateProject(p.id, { approvalEnabled: !p.approvalEnabled })} label="Require time approval" />
        </li>
        <li className={p.approvalEnabled ? '' : 'is-off'}>
          <div><b>Period</b><small>New submissions use it; earlier ones keep theirs</small></div>
          <Seg size="sm" value={p.approvalPeriod} label="Approval period"
            onChange={v => { if (p.approvalEnabled) updateProject(p.id, { approvalPeriod: v }) }}
            options={[{ value: 'week', label: 'Weekly' }, { value: 'month', label: 'Monthly' }]} />
        </li>
      </ul>
    </section>
  )
}

/* ---------------- Milestones ---------------- */

function Milestones({ id }: { id: string }) {
  const { data, updateProject, can } = useStore()
  const p = data.projects.find(x => x.id === id)!
  const reached = p.milestones.filter(m => m.done).length
  const nextId = p.milestones.find(m => !m.done)?.id
  return (
    <section className="card glass rise pd-ms" style={{ ['--i' as string]: 2 }}>
      <div className="card__head"><div><h2>Milestones</h2><p>{reached} of {p.milestones.length} reached</p></div></div>
      <ol className="ms">
        {p.milestones.map(m => {
          const d = daysLeft(m.due)
          return (
            <li key={m.id} className={`ms__item ${m.done ? 'is-done' : ''} ${m.id === nextId ? 'is-next' : ''}`}>
              <button
                className="ms__check"
                aria-label={m.done ? `Mark “${m.title}” not reached` : `Mark “${m.title}” reached`}
                aria-pressed={m.done}
                disabled={!can(p.id, 'project.admin')}
                onClick={() => updateProject(p.id, { milestones: p.milestones.map(x => (x.id === m.id ? { ...x, done: !x.done } : x)) })}
              >
                <Icon name="check" />
              </button>
              <div className="ms__body">
                <b>{m.title}</b>
                <small>{short(m.due)} · {m.done ? 'Done' : d < 0 ? `${-d} days late` : d === 0 ? 'Today' : `in ${d} days`}</small>
              </div>
              {m.id === nextId && <span className="ms__tag">Next</span>}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/* ---------------- Coming up + recent activity ---------------- */

const VERBS = ['finished', 'completed', 'wrapped up', 'shipped']

function ComingUp({ id }: { id: string }) {
  const { data, person, openDrawer } = useStore()
  const p = data.projects.find(x => x.id === id)!
  const today = todayIso()
  const upcoming = data.events
    .filter(e => e.project === p.id && e.date >= today)
    .sort((a, b) => (a.date === b.date ? a.start - b.start : a.date < b.date ? -1 : 1))
    .slice(0, 4)
  const recent = data.tasks
    .filter(t => t.project === p.id && t.status === 'done' && t.doneAt)
    .sort((a, b) => (a.doneAt! < b.doneAt! ? 1 : -1))
    .slice(0, 4)
  const ago = (t: Task, i: number) => {
    const days = diffDays(today, t.doneAt!)
    return days === 0 ? `${[24, 2, 3, 5][i] ?? 6}${i === 0 ? ' min' : ' h'} ago` : days === 1 ? 'Yesterday' : `${days} d ago`
  }

  return (
    <section className="card glass rise pd-up" style={{ ['--i' as string]: 4 }}>
      <div className="card__head"><h2>Coming up</h2><a className="btn btn--ghost btn--sm" href="#/calendar">Calendar</a></div>
      {upcoming.length === 0 ? (
        <p className="pup__none"><Icon name="calendar" /> Nothing scheduled for this project.</p>
      ) : (
        <ul className="pup__events">
          {upcoming.map(e => {
            const d = parse(e.date)
            return (
              <li key={e.id}>
                <button className="pev" data-hue={e.hue} onClick={() => openDrawer({ kind: 'event', id: e.id })}>
                  <span className="pev__date"><small>{MON3[d.getMonth()]}</small><b>{d.getDate()}</b></span>
                  <span className="pev__body">
                    <b>{e.title}</b>
                    <small>{relDue(e.date) === weekday(e.date) ? `${weekday(e.date)}, ${MON3[d.getMonth()]} ${d.getDate()}` : relDue(e.date)} · {fmtTime(e.start)} · {e.where}</small>
                  </span>
                  <Stack people={e.people.map(person)} size={24} max={3} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <h3 className="pup__h">Recent activity</h3>
      {recent.length === 0 ? <p className="pup__none"><Icon name="sparkle" /> No activity yet.</p> : (
        <ul className="pact">
          {recent.map((t, i) => {
            const who = person(t.assignee)
            return (
              <li key={t.id}>
                <Avatar p={who} size={28} />
                <span>
                  <span className="pact__text"><b>{who.name.split(' ')[0]}</b> {VERBS[i % VERBS.length]} “{t.title}”</span>
                  <small>{ago(t, i)}</small>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/* ---------------- Tasks grouped by status ---------------- */

function TaskGroups({ id }: { id: string }) {
  const { data, person, openDrawer, openModal, can } = useStore()
  const [showDone, setShowDone] = useState(false)
  const tasks = data.tasks.filter(t => t.project === id)
  const open = tasks.filter(t => t.status !== 'done').length
  const today = todayIso()
  return (
    <section className="card glass rise pd-tasks" style={{ ['--i' as string]: 3 }}>
      <div className="card__head">
        <div><h2>Tasks</h2><p>{open} open · {tasks.length - open} done</p></div>
        {can(id, 'tasks.create') && <button className="btn btn--primary btn--sm" onClick={() => openModal({ kind: 'task', preset: { project: id } })}><Icon name="plus" /> Add task</button>}
      </div>
      <div className="ptasks">
        {GROUPS.map(g => {
          const list = tasks.filter(t => t.status === g.s).sort(g.s === 'done' ? (a, b) => ((a.doneAt ?? '') < (b.doneAt ?? '') ? 1 : -1) : sortByDue)
          const hidden = g.s === 'done' && !showDone
          return (
            <div className="pgroup" key={g.s}>
              <div className="pgroup__head">
                <span className={`sdot sdot--${g.s}`} />
                <h3>{g.label}</h3>
                <span className="badge num">{list.length}</span>
                {g.s === 'done' && list.length > 0 && (
                  <button className="btn btn--ghost btn--sm pgroup__more" onClick={() => setShowDone(v => !v)} aria-expanded={showDone}>{showDone ? 'Hide' : 'Show'}</button>
                )}
              </div>
              {list.length === 0 ? <p className="pgroup__none">Nothing here.</p> : !hidden && (
                <ul className="pgroup__list">
                  {list.map(t => (
                    <li key={t.id}>
                      <button className={`prow ${t.status === 'done' ? 'is-done' : ''}`} onClick={() => openDrawer({ kind: 'task', id: t.id })}>
                        <span className="prow__title">{t.title}</span>
                        {t.status !== 'done' ? <Prio v={t.priority} hideLow /> : <span />}
                        <span className={`prow__due ${t.status !== 'done' && (!!t.due && t.due < today) ? 'is-late' : ''}`}>{t.status === 'done' ? short(t.doneAt ?? t.due) : relDue(t.due)}</span>
                        <Avatar p={person(t.assignee)} size={24} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
