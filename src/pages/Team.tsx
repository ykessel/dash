import { useState } from 'react'
import { Icon } from '../components/Icon'
import { localTime, localTimeMin, PRESENCE_LABEL, tzRel } from '../components/Overlays'
import { Avatar, Bar, CountUp, Seg, Stat, useTick } from '../components/ui'
import type { Team as TeamName } from '../data/types'
import { useStore } from '../store'

const TEAM_HUE: Record<TeamName, string> = { Product: 'blue', Design: 'pink', Engineering: 'indigo', Marketing: 'orange' }

export function Team() {
  const { data, me, openModal, openDrawer, notify } = useStore()
  useTick(30_000)
  const [team, setTeam] = useState<'All' | TeamName>('All')
  const online = data.people.filter(p => p.presence !== 'away').length
  const focus = data.people.filter(p => p.presence === 'focus').length
  const load = (p: (typeof data.people)[number]) => data.tasks.filter(t => t.assignee === p.id && t.status !== 'done').reduce((s, t) => s + t.estimate, 0)
  const avg = Math.round((data.people.reduce((s, p) => s + Math.min(1, load(p) / p.capacity), 0) / data.people.length) * 100)
  const teams = new Set(data.people.map(p => p.team)).size
  const list = data.people.filter(p => team === 'All' || p.team === team)

  return (
    <>
      <header className="page-head">
        <h1>Team</h1>
        <p>{data.people.length} people · {teams} teams</p>
      </header>
      <div className="page-bar">
        <div className="stats">
          <Stat label="Online now"><CountUp value={online} /><i> / {data.people.length}</i></Stat>
          <Stat label="In focus"><CountUp value={focus} /></Stat>
          <Stat label="Average load"><CountUp value={avg} />%</Stat>
        </div>
        <div className="page-actions">
          <Seg value={team} onChange={setTeam} options={(['All', 'Product', 'Design', 'Engineering', 'Marketing'] as const).map(t => ({ value: t, label: t }))} label="Team" />
          <button className="btn btn--primary" onClick={() => openModal({ kind: 'invite' })}><Icon name="userplus" /> Invite</button>
        </div>
      </div>
      <div className="team-grid">
        {list.map((p, i) => {
          const h = load(p)
          const open = data.tasks.filter(t => t.assignee === p.id && t.status !== 'done').length
          const lm = localTimeMin(p.tz, me.tz)
          const day = lm >= 7 * 60 && lm < 19 * 60
          return (
            <article key={p.id} className="person glass rise" style={{ ['--i' as string]: i }}>
              <div className="person__head">
                <Avatar p={p} size={48} presence />
                <div className="person__name">
                  <h2>{p.name} {p.id === me.id && <span className="you">You</span>}</h2>
                  <small>{p.role}</small>
                </div>
                <span className="tag" data-hue={TEAM_HUE[p.team]}>{p.team}</span>
              </div>
              <div className="person__meta">
                <span className="person__presence"><span className="presence-dot" data-presence={p.presence} /> {PRESENCE_LABEL[p.presence]}</span>
                <span className="person__time">
                  <span><Icon name={day ? 'sun' : 'moon'} size={16} className={day ? 'sun' : 'moon'} /> <b>{localTime(p.tz, me.tz)}</b> {p.city}</span>
                  <small>{p.id === me.id ? 'Your time' : tzRel(p.tz, me.tz)}</small>
                </span>
              </div>
              <div className="well person__load">
                <div><span>Workload</span><span><b>{h}h</b> / {p.capacity}h</span></div>
                <Bar value={Math.min(1, h / p.capacity)} hue={h > p.capacity ? 'pink' : 'green'} />
              </div>
              <footer className="person__foot">
                <span><Icon name="tasks" size={16} /> <b>{open}</b> open task{open === 1 ? '' : 's'}</span>
                <button className="btn btn--glass btn--sm" onClick={() => openDrawer({ kind: 'person', id: p.id })}>Profile</button>
                {p.id !== me.id && (
                  <button className="round-btn round-btn--msg" aria-label={`Message ${p.name}`} onClick={() => notify(`Message sent to ${p.name.split(' ')[0]}`, 'ok')}>
                    <Icon name="comment" size={16} />
                  </button>
                )}
              </footer>
            </article>
          )
        })}
      </div>
    </>
  )
}
