import { useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { PRESENCE_LABEL } from '../components/Overlays'
import { Avatar, Bar, Check, CountUp, Prio, ProjectTag, Ring, Seg, Stack, Stat } from '../components/ui'
import type { CalEvent } from '../data/types'
import { ago, fmtTime, greeting, longDate, nowMinutes, relDue, short, todayIso } from '../lib/date'
import { focusToday, meetingsToday, myToday, nextEvent, pct, projectProgress, sortByDue, thisWeek, todaysEvents } from '../lib/metrics'
import { go } from '../lib/router'
import { useStore } from '../store'

export const STATUS_P = { progress: 'In progress', review: 'In review', planning: 'Planning', shipped: 'Shipped' } as const

export function Home() {
  const { data, me, openModal, openDrawer } = useStore()
  const t = myToday(data)
  const m = meetingsToday(data)
  const focusMin = focusToday(data)
  const next = nextEvent(data)

  return (
    <>
      <header className="page-head">
        <h1>{greeting()}, {me.name.split(' ')[0]}</h1>
        <p>{longDate()} · {m.left} meetings and {t.left} tasks left today</p>
      </header>
      <div className="page-bar">
        <div className="stats">
          <Stat label="Done today"><CountUp value={t.done} /><i> / {t.total}</i></Stat>
          <Stat label="Focus today"><CountUp value={focusMin / 60} decimals={1} />h</Stat>
          <Stat label="Overdue"><CountUp value={t.overdue} /></Stat>
        </div>
        <div className="page-actions">
          <button className="btn btn--glass" onClick={() => openModal({ kind: 'task' })}><Icon name="plus" /> New task</button>
          {next && (
            <button className="btn btn--primary" onClick={() => openDrawer({ kind: 'event', id: next.id })}>
              <Icon name="video" /> Next: {next.date === todayIso() ? fmtTime(next.start) : relDue(next.date)}
            </button>
          )}
        </div>
      </div>

      <div className="home-grid">
        <TodayRings />
        <UpNext />
        <FocusCard />
        <MyTasks />
        <ThisWeek />
        <ProjectsCard />
        <RightNow />
      </div>
    </>
  )
}

function TodayRings() {
  const { data } = useStore()
  const t = myToday(data)
  const m = meetingsToday(data)
  const f = focusToday(data) / 60
  const goal = 2
  const rings = [
    { v: t.total ? t.done / t.total : 0, c: 'var(--ring-tasks)' },
    { v: Math.min(1, f / goal), c: 'var(--ring-focus)' },
    { v: m.total ? m.done / m.total : 0, c: 'var(--ring-meet)' },
  ]
  return (
    <section className="card glass rise" style={{ ['--i' as string]: 0 }}>
      <div className="card__head"><div><h2>Today</h2><p>Close your rings</p></div></div>
      <div className="rings">
        <div className="rings__art">
          {rings.map((r, i) => (
            <Ring key={i} value={r.v} size={124 - i * 34} stroke={13} color={r.c} track={`color-mix(in srgb, ${r.c} 22%, transparent)`} delay={i * 120} />
          ))}
        </div>
        <ul className="rings__legend">
          <li style={{ ['--c' as string]: 'var(--ring-tasks)' }}><small>Tasks</small><b><CountUp value={t.done} /><i> / {t.total}</i></b></li>
          <li style={{ ['--c' as string]: 'var(--ring-focus)' }}><small>Focus</small><b><CountUp value={f} decimals={1} />h<i> / {goal}h</i></b></li>
          <li style={{ ['--c' as string]: 'var(--ring-meet)' }}><small>Meetings</small><b><CountUp value={m.done} /><i> / {m.total}</i></b></li>
        </ul>
      </div>
    </section>
  )
}

function UpNext() {
  const { data, person, openDrawer, notify } = useStore()
  const today = todaysEvents(data)
  const now = nowMinutes()
  const upcoming = today.filter(e => e.start + e.dur > now)
  const next = nextEvent(data)
  const rest = (next && next.date === todayIso() ? upcoming.filter(e => e.id !== next.id) : upcoming).slice(0, 3)
  const mins = next && next.date === todayIso() ? next.start - now : null

  return (
    <section className="card glass rise" style={{ ['--i' as string]: 1 }}>
      <div className="card__head"><div><h2>Up next</h2></div><a className="link" href="#/calendar">Calendar</a></div>
      {next ? (
        <button className="next-ev" data-hue={next.hue} onClick={() => openDrawer({ kind: 'event', id: next.id })}>
          <small>{mins === null ? relDue(next.date) : mins <= 0 ? <b>Now</b> : <>in <b>{mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`}</b></>}</small>
          <strong>{next.title}</strong>
          <span className="next-ev__meta">{fmtTime(next.start)} – {fmtTime(next.start + next.dur)} · {next.where}</span>
          <span className="next-ev__foot">
            <Stack people={next.people.map(person)} size={28} />
            {next.where === 'Video call' && (
              <span className="btn btn--primary btn--sm" role="button" onClick={e => { e.stopPropagation(); notify('Joining the call…', 'info') }}>
                <Icon name="video" /> Join
              </span>
            )}
          </span>
        </button>
      ) : <p className="empty">Nothing else on the calendar.</p>}
      <ul className="ev-list">
        {rest.map(e => <EvRow key={e.id} e={e} onClick={() => openDrawer({ kind: 'event', id: e.id })} />)}
        {rest.length === 0 && next && <li className="empty" style={{ padding: 10 }}>That’s the last one today.</li>}
      </ul>
    </section>
  )
}

function EvRow({ e, onClick }: { e: CalEvent; onClick: () => void }) {
  return (
    <li className="ev-row" data-hue={e.hue} onClick={onClick}>
      <span>{e.title}</span>
      <small>{fmtTime(e.start)}</small>
    </li>
  )
}

function FocusCard() {
  const { data, me, focus, startFocus, pauseFocus, stopFocus } = useStore()
  const [len, setLen] = useState<'15' | '25' | '50'>(String(data.prefs.session) as '25')
  const [taskId, setTaskId] = useState('')
  const mins = Number(len) || 25
  const open = data.tasks.filter(t => t.assignee === me.id && t.status !== 'done').sort(sortByDue)
  const focusMin = focusToday(data)
  const sessions = Math.max(1, Math.round(focusMin / 33))
  const left = focus ? focus.left : mins * 60
  const k = focus ? focus.left / focus.total : 1
  const mmss = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`

  return (
    <section className="card glass rise focus-card" style={{ ['--i' as string]: 2 }}>
      <div className="card__head">
        <div><h2>Focus</h2><p>The island keeps the time</p></div>
        {!focus && <Seg size="sm" value={len} onChange={setLen} options={[{ value: '15', label: '15m' }, { value: '25', label: '25m' }, { value: '50', label: '50m' }]} label="Session length" />}
      </div>
      <div className="focus-card__body">
        <Ring value={k} size={100} stroke={7} color={focus ? '#ffb340' : 'var(--fill-2)'} track="var(--fill)">
          <span className="focus-card__time">
            <b style={focus ? { color: '#ffb340' } : undefined}>{mmss}</b>
            <small>{focus ? (focus.paused ? 'Paused' : 'Focusing') : 'Ready'}</small>
          </span>
        </Ring>
        <div className="focus-card__ctl">
          {focus ? (
            <>
              <small>Focusing on</small>
              <b className="focus-card__label">{focus.label}</b>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn--glass btn--sm" onClick={pauseFocus}><Icon name={focus.paused ? 'play' : 'pause'} /> {focus.paused ? 'Resume' : 'Pause'}</button>
                <button className="btn btn--glass btn--sm" onClick={stopFocus}><Icon name="stop" /> End</button>
              </div>
            </>
          ) : (
            <>
              <small>Focus on</small>
              <select className="input" value={taskId} onChange={e => setTaskId(e.target.value)} style={{ height: 40, fontSize: 15 }}>
                <option value="">No task — just focus</option>
                {open.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
              <button className="btn btn--primary" onClick={() => startFocus(mins, open.find(t => t.id === taskId)?.title, taskId || undefined)}>
                <Icon name="play" style={{ fill: 'currentColor' }} /> Start focus
              </button>
            </>
          )}
        </div>
      </div>
      <div className="well focus-card__today">
        <div><span>Focused today</span><b>{(focusMin / 60).toFixed(1)}h · {sessions} sessions</b></div>
        <Bar value={Math.min(1, focusMin / 120)} hue="orange" />
      </div>
    </section>
  )
}

function MyTasks() {
  const { data, me, project, toggleDone, openDrawer } = useStore()
  const today = todayIso()
  const list = data.tasks
    .filter(t => t.assignee === me.id && ((t.status !== 'done' && t.due <= today) || t.doneAt === today))
    .sort((a, b) => (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0) || sortByDue(a, b))
    .slice(0, 7)
  return (
    <section className="card glass rise mytasks" style={{ ['--i' as string]: 3 }}>
      <div className="card__head"><div><h2>My tasks</h2><p>Due today and late</p></div><a className="link" href="#/tasks">All tasks</a></div>
      <ul className="task-rows">
        {list.map(t => (
          <li key={t.id} className={`task-row ${t.status === 'done' ? 'is-done' : ''}`} onClick={() => openDrawer({ kind: 'task', id: t.id })}>
            <Check on={t.status === 'done'} onToggle={() => toggleDone(t.id)} label={`Complete ${t.title}`} />
            <div className="task-row__main">
              <b>{t.title}</b>
              <span><ProjectTag p={project(t.project)} /> <small>{t.status === 'done' ? short(t.doneAt!) : relDue(t.due)}</small></span>
            </div>
            <Prio v={t.priority} hideLow />
          </li>
        ))}
        {list.length === 0 && <li className="empty">All clear for today ✨</li>}
      </ul>
    </section>
  )
}

const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function ThisWeek() {
  const { data } = useStore()
  const { values, todayIndex } = useMemo(() => thisWeek(data), [data])
  const total = values.reduce((a, b) => a + b, 0)
  const max = Math.max(10, ...values)
  const prev = Math.max(1, Math.round(total / 1.25))
  const [hover, setHover] = useState<number | null>(null)
  return (
    <section className="card glass rise week" style={{ ['--i' as string]: 4 }}>
      <div className="card__head">
        <div><h2>This week</h2><p>Tasks the team finished</p></div>
        <a className="round-btn round-btn--sm" href="#/insights" aria-label="Open insights"><Icon name="out" size={16} /></a>
      </div>
      <div className="big-line"><span className="big"><CountUp value={total} /></span> finished so far <span className="delta delta--up">+{pct(total, prev)}% vs last week</span></div>
      <div className="week__bars">
        {values.map((v, i) => (
          <div key={i} className={`week__col ${i === todayIndex ? 'is-today' : ''}`} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <div className="week__track">
              <i style={{ height: `${(v / max) * 100}%`, animationDelay: `${i * 70}ms` }} />
              {hover === i && <span className="tip" style={{ left: '50%', top: `${100 - (v / max) * 100}%` }}>{v} done</span>}
            </div>
            <small>{WD[i]}</small>
          </div>
        ))}
      </div>
    </section>
  )
}

function ProjectsCard() {
  const { data, person } = useStore()
  const list = data.projects.filter(p => p.status !== 'shipped')
  return (
    <section className="card glass rise" style={{ ['--i' as string]: 5 }}>
      <div className="card__head"><div><h2>Projects</h2></div><a className="link" href="#/projects">See all</a></div>
      <ul className="proj-rows">
        {list.map(p => {
          const pr = projectProgress(data, p.id)
          return (
            <li key={p.id} onClick={() => go(`projects/${p.id}`)}>
              <span className="pj-icon" data-hue={p.hue}><Icon name={p.icon} /></span>
              <div className="proj-rows__name"><b>{p.name}</b><small>{STATUS_P[p.status]} · due {short(p.due)}</small></div>
              <div className="proj-rows__bar"><Bar value={pr.pct} hue={p.hue} /></div>
              <b className="num proj-rows__pct">{Math.round(pr.pct * 100)}%</b>
              <Stack people={p.members.map(person)} size={24} max={3} />
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function RightNow() {
  const { data, me, person, project, openDrawer } = useStore()
  const [tab, setTab] = useState<'team' | 'activity'>('team')
  const order = { focus: 0, meeting: 1, online: 2, away: 3 }
  const people = data.people.filter(p => p.id !== me.id && p.presence !== 'away').sort((a, b) => order[a.presence] - order[b.presence])
  const activity = data.tasks
    .filter(t => t.status === 'done' && t.doneAt)
    .sort((a, b) => (a.doneAt! < b.doneAt! ? 1 : -1))
    .slice(0, 6)
  return (
    <section className="card glass rise" style={{ ['--i' as string]: 6 }}>
      <div className="card__head">
        <div><h2>Right now</h2></div>
        <Seg size="sm" value={tab} onChange={setTab} options={[{ value: 'team', label: 'Team' }, { value: 'activity', label: 'Activity' }]} />
      </div>
      <ul className="people-rows" key={tab}>
        {tab === 'team'
          ? people.map((p, i) => (
            <li key={p.id} onClick={() => openDrawer({ kind: 'person', id: p.id })} style={{ ['--i' as string]: i }}>
              <Avatar p={p} size={36} presence />
              <div><b>{p.name}</b><small>{PRESENCE_LABEL[p.presence]} · {p.note ?? p.role}</small></div>
            </li>
          ))
          : activity.map((t, i) => (
            <li key={t.id} onClick={() => openDrawer({ kind: 'task', id: t.id })} style={{ ['--i' as string]: i }}>
              <Avatar p={person(t.assignee)} size={36} />
              <div><b>{person(t.assignee).name.split(' ')[0]} finished “{t.title}”</b><small>{project(t.project).name} · {t.doneAt === todayIso() ? ago(Date.now() - 3_600_000 * (i + 1)) : relDue(t.doneAt!)}</small></div>
            </li>
          ))}
      </ul>
    </section>
  )
}
