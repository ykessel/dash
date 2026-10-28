import { useState } from 'react'
import { Icon } from '../components/Icon'
import { CountUp, Ring, Seg, Stack, Stat } from '../components/ui'
import type { Project, ProjectStatus } from '../data/types'
import { short, todayIso } from '../lib/date'
import { daysLeft, projectProgress } from '../lib/metrics'
import { useStore } from '../store'
import { STATUS_P } from './Home'

export const STATUS_HUE: Record<ProjectStatus, string> = { progress: 'green', review: 'orange', planning: 'indigo', shipped: 'teal' }

export function StatusBadge({ s }: { s: ProjectStatus }) {
  return (
    <span className={`pstatus pstatus--${s}`}>
      {s === 'shipped' ? <Icon name="check" /> : <i />}
      {STATUS_P[s]}
    </span>
  )
}

const STATUS_ORDER: Record<ProjectStatus, number> = { progress: 0, review: 1, planning: 2, shipped: 3 }
/** Starred first, then by stage, then the soonest due date. */
export function projectOrder(a: Project, b: Project) {
  return Number(b.starred) - Number(a.starred) || STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || (a.due < b.due ? -1 : a.due > b.due ? 1 : 0)
}

type Filter = 'all' | 'active' | 'planning' | 'shipped'

export function Projects() {
  const { data, openModal } = useStore()
  const [f, setF] = useState<Filter>('all')
  const ps = data.projects
  const active = ps.filter(p => p.status === 'progress' || p.status === 'review')
  const shipped = ps.filter(p => p.status === 'shipped')
  const onTrack = Math.round(
    (active.reduce((s, p) => s + projectProgress(data, p.id).pct, 0) / Math.max(1, active.length)) * 100,
  )
  const month = todayIso().slice(0, 7)
  const dueMonth = ps.filter(p => p.status !== 'shipped' && p.due.startsWith(month)).length
  const list = ps.filter(p =>
    f === 'all' ? true : f === 'active' ? p.status === 'progress' || p.status === 'review' : f === 'planning' ? p.status === 'planning' : p.status === 'shipped',
  ).sort(projectOrder)
  return (
    <>
      <header className="page-head">
        <h1>Projects</h1>
        <p>{ps.length - shipped.length} in flight · {shipped.length} shipped</p>
      </header>
      <div className="page-bar">
        <div className="stats">
          <Stat label="Active"><CountUp value={active.length} /></Stat>
          <Stat label="Shipped"><CountUp value={shipped.length} /></Stat>
          <Stat label="On track"><CountUp value={onTrack} />%</Stat>
          <Stat label="Due this month"><CountUp value={dueMonth} /></Stat>
        </div>
        <div className="page-actions">
          <Seg value={f} onChange={setF} options={[{ value: 'all', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'planning', label: 'Planning' }, { value: 'shipped', label: 'Shipped' }]} label="Filter" />
          <button className="btn btn--primary" onClick={() => openModal({ kind: 'project' })}><Icon name="plus" /> New project</button>
        </div>
      </div>
      <div className="pgrid">
        {list.map((p, i) => <ProjectCard key={p.id} p={p} i={i} />)}
        {list.length === 0 && <p className="empty">No projects here yet.</p>}
      </div>
    </>
  )
}

function ProjectCard({ p, i }: { p: Project; i: number }) {
  const { data, person, updateProject } = useStore()
  const pr = projectProgress(data, p.id)
  const done = p.status === 'shipped'
  const pct = done ? 1 : pr.pct
  const next = p.milestones.find(m => !m.done)
  const dl = next ? daysLeft(next.due) : 0
  const members = p.members.map(person)
  return (
    <article className="pcard glass rise" data-hue={p.hue} style={{ ['--i' as string]: i }}>
      <div className="pcard__top">
        <span className="picon picon--lg" data-hue={p.hue}><Icon name={p.icon} /></span>
        <div className="pcard__id">
          <a className="pcard__link" href={`#/projects/${p.id}`}><h2 className="pcard__name">{p.name}</h2></a>
          <StatusBadge s={p.status} />
        </div>
        <button
          className="ibtn ibtn--sm pstar"
          aria-label={p.starred ? `Unstar ${p.name}` : `Star ${p.name}`}
          aria-pressed={p.starred}
          onClick={() => updateProject(p.id, { starred: !p.starred })}
        >
          <Icon name="star" />
        </button>
      </div>
      <p className="pcard__sum">{p.desc}</p>
      <div className="pcard__mid">
        <span className="pring">
          <Ring value={pct} size={64} stroke={7} color="var(--hue)" track="var(--well)" delay={i * 60} />
          <b className="pring__val">{Math.round(pct * 100)}%</b>
        </span>
        <div className="pcard__next">
          <small>{next ? 'Next milestone' : 'Shipped'}</small>
          <b>{next ? next.title : 'Every milestone met'}</b>
          <span>{next ? `${short(next.due)} · ${dl < 0 ? `${-dl} days late` : dl === 0 ? 'today' : `in ${dl} days`}` : short(p.due)}</span>
        </div>
      </div>
      <footer className="pcard__foot">
        <Stack people={members} size={26} max={4} />
        <span className="pcard__count num">{pr.done}/{pr.total} tasks</span>
        <span className="pcard__due"><Icon name="calendar" /> {short(p.due)}</span>
      </footer>
    </article>
  )
}
