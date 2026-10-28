import { useState } from 'react'
import { Icon } from '../components/Icon'
import { CountUp, Ring, Seg, Stack, Stat } from '../components/ui'
import type { Project, ProjectStatus } from '../data/types'
import { short, todayIso } from '../lib/date'
import { daysLeft, projectProgress } from '../lib/metrics'
import { go } from '../lib/router'
import { useStore } from '../store'
import { STATUS_P } from './Home'

export const STATUS_HUE: Record<ProjectStatus, string> = { progress: 'green', review: 'orange', planning: 'indigo', shipped: 'teal' }

export function StatusBadge({ s }: { s: ProjectStatus }) {
  return (
    <span className={`badge-status ${s === 'shipped' ? 'badge-status--shipped' : ''}`} data-hue={STATUS_HUE[s]}>
      {s === 'shipped' && <Icon name="check" />}
      {STATUS_P[s]}
    </span>
  )
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
  )
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
      <div className="proj-grid">
        {list.map((p, i) => <ProjectCard key={p.id} p={p} i={i} />)}
      </div>
    </>
  )
}

function ProjectCard({ p, i }: { p: Project; i: number }) {
  const { data, person, updateProject } = useStore()
  const pr = projectProgress(data, p.id)
  const next = p.milestones.find(m => !m.done)
  const dl = next ? daysLeft(next.due) : 0
  return (
    <article className="pcard glass rise" data-hue={p.hue} style={{ ['--i' as string]: i }} onClick={() => go(`projects/${p.id}`)} tabIndex={0} onKeyDown={e => e.key === 'Enter' && go(`projects/${p.id}`)}>
      <div className="pcard__head">
        <span className="pj-icon pj-icon--lg"><Icon name={p.icon} /></span>
        <div className="pcard__name">
          <h2>{p.name}</h2>
          <StatusBadge s={p.status} />
        </div>
        <button
          className={`star ${p.starred ? 'is-on' : ''}`}
          aria-label={p.starred ? 'Unstar' : 'Star'}
          aria-pressed={p.starred}
          onClick={e => { e.stopPropagation(); updateProject(p.id, { starred: !p.starred }) }}
        >
          <Icon name="star" size={18} />
        </button>
      </div>
      <p className="pcard__desc">{p.desc}</p>
      <div className="well pcard__ms">
        <Ring value={p.status === 'shipped' ? 1 : pr.pct} size={60} stroke={6} color="var(--hue)" delay={i * 60}>
          <b className="num">{Math.round((p.status === 'shipped' ? 1 : pr.pct) * 100)}%</b>
        </Ring>
        <div>
          <small>{next ? 'Next milestone' : 'Shipped'}</small>
          <b>{next ? next.title : 'Every milestone met'}</b>
          <span>{next ? `${short(next.due)} · ${dl < 0 ? `${-dl} days late` : dl === 0 ? 'today' : `in ${dl} days`}` : short(p.due)}</span>
        </div>
      </div>
      <footer className="pcard__foot">
        <Stack people={p.members.map(person)} size={28} max={4} />
        <span>{pr.done}/{pr.total} tasks</span>
        <span className="pcard__due"><Icon name="calendar" size={16} /> {short(p.due)}</span>
      </footer>
    </article>
  )
}
