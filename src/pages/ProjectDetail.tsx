import { useMemo } from 'react'
import { LineChart } from '../components/Charts'
import { Icon } from '../components/Icon'
import { PRESENCE_LABEL } from '../components/Overlays'
import { Avatar, Bar, Check, CountUp, Prio, Stat } from '../components/ui'
import { addDays, diffDays, iso, parse, relDue, short, todayIso } from '../lib/date'
import { daysLeft, projectProgress, sortByDue } from '../lib/metrics'
import { go } from '../lib/router'
import { useStore } from '../store'
import { StatusBadge } from './Projects'

export function ProjectDetail({ id }: { id: string }) {
  const { data, person, updateProject, openModal, openDrawer, toggleDone, notify } = useStore()
  const p = data.projects.find(x => x.id === id)

  const burn = useMemo(() => {
    if (!p) return null
    const tasks = data.tasks.filter(t => t.project === p.id)
    const end = todayIso() < p.due ? todayIso() : p.due
    const span = Math.max(1, diffDays(end, p.start))
    const days = Array.from({ length: span + 1 }, (_, i) => iso(addDays(parse(p.start), i)))
    // Spread finished tasks across the project's life so the curve climbs.
    const done = tasks.filter(t => t.status === 'done').length
    const doneSeries = days.map((_, i) => Math.round(done * Math.pow(i / span, 1.4)))
    const total = tasks.length
    const totalSeries = days.map((_, i) => Math.round(total * (0.6 + 0.4 * Math.min(1, (i / span) * 1.3))))
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
  const lead = person(p.lead)
  const dl = daysLeft(p.due)
  const tasks = data.tasks.filter(t => t.project === p.id).sort((a, b) => (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0) || sortByDue(a, b))
  const reached = p.milestones.filter(m => m.done).length

  return (
    <>
      <header className="page-head page-head--with-back">
        <button className="round-btn" onClick={() => go('projects')} aria-label="Back to projects"><Icon name="left" size={20} /></button>
        <span className="pj-icon pj-icon--xl" data-hue={p.hue}><Icon name={p.icon} /></span>
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
          <Stat label="Days left"><CountUp value={Math.max(0, dl)} /></Stat>
        </div>
        <div className="page-actions">
          <button className={`btn btn--glass ${p.pinned ? 'is-pinned' : ''}`} onClick={() => { updateProject(p.id, { pinned: !p.pinned }); notify(p.pinned ? 'Unpinned from the sidebar' : 'Pinned to the sidebar', 'info') }}>
            <Icon name="star" className={p.pinned ? 'star-fill' : ''} /> {p.pinned ? 'Pinned' : 'Pin'}
          </button>
          <button className="btn btn--glass" onClick={() => openModal({ kind: 'event', preset: { project: p.id } })}><Icon name="calplus" /> New event</button>
        </div>
      </div>

      <div className="pd-grid">
        <div className="pd-col">
        <section className="card glass rise pd-overview" style={{ ['--i' as string]: 0 }}>
          <div className="card__head"><h2>Overview</h2></div>
          <div className="facts">
            <div className="fact well"><small>Lead</small><b><Avatar p={lead} size={24} /> <a className="link" onClick={() => openDrawer({ kind: 'person', id: lead.id })}>{lead.name}</a></b></div>
            <div className="fact well"><small>Status</small><b><StatusBadge s={p.status} /></b></div>
          </div>
          <div data-hue={p.hue}><Bar value={pr.pct} hue={p.hue} /></div>
          <div className="pd-dates">
            <div><small>Started</small><b>{short(p.start)}</b></div>
            <div style={{ textAlign: 'right' }}><small>Due</small><b>{short(p.due)}</b></div>
          </div>
          <div className="section-title" style={{ justifyContent: 'flex-start', gap: 8, marginTop: 18 }}>People <span className="count">{p.members.length}</span></div>
          <ul className="pd-people">
            {p.members.map(mid => {
              const m = person(mid)
              return (
                <li key={mid} onClick={() => openDrawer({ kind: 'person', id: m.id })}>
                  <Avatar p={m} size={34} presence />
                  <div><b>{m.name}</b><small>{m.id === p.lead ? 'Lead · ' : ''}{PRESENCE_LABEL[m.presence]}</small></div>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="card glass rise pd-ms" style={{ ['--i' as string]: 2 }}>
          <div className="card__head"><div><h2>Milestones</h2><p>{reached} of {p.milestones.length} reached</p></div></div>
          <ol className="timeline">
            {p.milestones.map(m => {
              const d = daysLeft(m.due)
              return (
                <li key={m.id} className={m.done ? 'is-done' : ''} data-hue={p.hue}>
                  <button
                    className="timeline__dot"
                    aria-label={m.done ? 'Mark not reached' : 'Mark reached'}
                    onClick={() => updateProject(p.id, { milestones: p.milestones.map(x => (x.id === m.id ? { ...x, done: !x.done } : x)) })}
                  >
                    <Icon name="check" size={13} />
                  </button>
                  <div>
                    <b>{m.title}</b>
                    <small>{short(m.due)} · {m.done ? 'Done' : d < 0 ? `${-d} days late` : d === 0 ? 'Today' : `in ${d} days`}</small>
                  </div>
                </li>
              )
            })}
          </ol>
        </section>

        </div>
        <div className="pd-col">
        <section className="card glass rise pd-burn" style={{ ['--i' as string]: 1 }}>
          <div className="card__head">
            <div><h2>Burn-up</h2><p>Tasks done against the total, over the project’s life</p></div>
          </div>
          <div className="legend">
            <span><i style={{ background: `var(--${p.hue})` }} /> Done</span>
            <span><i className="dash" /> Total</span>
          </div>
          <LineChart
            height={230}
            labels={burn.days.map(short)}
            yMax={Math.max(10, Math.ceil(burn.total / 10) * 10)}
            fmtY={v => `${v} tasks`}
            series={[
              { name: 'Total', values: burn.totalSeries, color: 'var(--text-3)', dashed: true },
              { name: 'Done', values: burn.doneSeries, color: `var(--${p.hue})`, area: true },
            ]}
            fmtTip={i => <>{burn.doneSeries[i]} of {burn.totalSeries[i]} done<small>{short(burn.days[i])}</small></>}
            xTicks={6}
          />
        </section>

        <section className="card glass rise pd-tasks" style={{ ['--i' as string]: 3 }}>
          <div className="card__head">
            <div><h2>Tasks</h2><p>{pr.open} open · {pr.done} done</p></div>
            <button className="btn btn--primary btn--sm" onClick={() => openModal({ kind: 'task', preset: { project: p.id } })}><Icon name="plus" /> Add task</button>
          </div>
          <ul className="task-rows">
            {tasks.map(t => (
              <li key={t.id} className={`task-row ${t.status === 'done' ? 'is-done' : ''}`} onClick={() => openDrawer({ kind: 'task', id: t.id })}>
                <Check on={t.status === 'done'} onToggle={() => toggleDone(t.id)} label={t.title} />
                <div className="task-row__main">
                  <b>{t.title}</b>
                  <span><small>{t.status === 'done' ? `Done ${short(t.doneAt ?? t.due)}` : relDue(t.due)}</small></span>
                </div>
                {t.status !== 'done' && <Prio v={t.priority} hideLow />}
                <Avatar p={person(t.assignee)} size={26} />
              </li>
            ))}
            {tasks.length === 0 && <li className="empty">No tasks yet — add the first one.</li>}
          </ul>
        </section>
        </div>
      </div>
    </>
  )
}
