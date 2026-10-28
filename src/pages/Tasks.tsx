import { useMemo, useRef, useState, type DragEvent } from 'react'
import { Icon } from '../components/Icon'
import { STATUS_LABEL } from '../components/Overlays'
import { Avatar, Check, CountUp, Popover, Prio, ProjectTag, Seg, Stat } from '../components/ui'
import type { Priority, Status, Task } from '../data/types'
import { diffDays, relDue, short, todayIso } from '../lib/date'
import { prioRank, sortByDue } from '../lib/metrics'
import { useStore } from '../store'

const COLS: Status[] = ['todo', 'progress', 'review', 'done']
const COL_HUE: Record<Status, string> = { todo: 'none', progress: 'blue', review: 'purple', done: 'green' }

let viewPref: 'board' | 'list' = 'board'

export function Tasks() {
  const { data, me, openModal } = useStore()
  const [view, setViewState] = useState<'board' | 'list'>(viewPref)
  const setView = (v: 'board' | 'list') => { viewPref = v; setViewState(v) }
  const [proj, setProj] = useState<string>('all')
  const [mine, setMine] = useState(false)
  const [prio, setPrio] = useState<Priority | 'any'>('any')
  const [q, setQ] = useState('')

  const today = todayIso()
  const open = data.tasks.filter(t => t.status !== 'done')
  const projectsWithOpen = new Set(open.map(t => t.project)).size
  const dueWeek = open.filter(t => diffDays(t.due, today) <= 7 && diffDays(t.due, today) >= 0).length
  const overdue = open.filter(t => t.due < today).length
  const doneWeek = data.tasks.filter(t => t.status === 'done' && t.doneAt && diffDays(today, t.doneAt) < 7).length

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return data.tasks.filter(t =>
      (proj === 'all' || t.project === proj) &&
      (!mine || t.assignee === me.id) &&
      (prio === 'any' || t.priority === prio) &&
      (!s || t.title.toLowerCase().includes(s) || data.projects.find(p => p.id === t.project)!.name.toLowerCase().includes(s) || data.people.find(p => p.id === t.assignee)!.name.toLowerCase().includes(s)),
    )
  }, [data, proj, mine, prio, q, me.id])

  return (
    <>
      <header className="page-head">
        <h1>Tasks</h1>
        <p>{open.length} open across {projectsWithOpen} projects</p>
      </header>
      <div className="page-bar">
        <div className="stats">
          <Stat label="Open"><CountUp value={open.length} /></Stat>
          <Stat label="Due this week"><CountUp value={dueWeek} /></Stat>
          <Stat label="Overdue"><CountUp value={overdue} /></Stat>
          <Stat label="Done this week"><CountUp value={doneWeek} /></Stat>
        </div>
        <div className="page-actions">
          <Seg value={view} onChange={setView} options={[{ value: 'board', label: 'Board', icon: 'board' }, { value: 'list', label: 'List', icon: 'list' }]} label="View" />
          <button className="btn btn--primary" onClick={() => openModal({ kind: 'task' })}><Icon name="plus" /> New task</button>
        </div>
      </div>

      <Filters proj={proj} setProj={setProj} mine={mine} setMine={setMine} prio={prio} setPrio={setPrio} q={q} setQ={setQ} />

      {view === 'board' ? <Board tasks={filtered} /> : <List tasks={filtered} />}
    </>
  )
}

function Filters(p: {
  proj: string; setProj: (v: string) => void
  mine: boolean; setMine: (v: boolean) => void
  prio: Priority | 'any'; setPrio: (v: Priority | 'any') => void
  q: string; setQ: (v: string) => void
}) {
  const { data, me } = useStore()
  const [menu, setMenu] = useState<null | 'proj' | 'prio'>(null)
  const projRef = useRef<HTMLButtonElement>(null)
  const prioRef = useRef<HTMLButtonElement>(null)
  const projName = p.proj === 'all' ? 'All projects' : data.projects.find(x => x.id === p.proj)?.name
  const prioName = p.prio === 'any' ? 'Any priority' : p.prio[0].toUpperCase() + p.prio.slice(1)
  return (
    <div className="filters glass glass--chrome rise" style={{ ['--i' as string]: 1 }}>
      <button ref={projRef} className={`chip-btn ${p.proj !== 'all' ? 'is-on' : ''}`} onClick={() => setMenu(menu === 'proj' ? null : 'proj')} aria-expanded={menu === 'proj'}>
        <Icon name="folder" size={17} /> {projName} <Icon name="down" size={15} />
      </button>
      <button className={`chip-btn ${p.mine ? 'is-on' : ''}`} aria-pressed={p.mine} onClick={() => p.setMine(!p.mine)}>
        <Avatar p={me} size={22} /> Mine only
      </button>
      <button ref={prioRef} className={`chip-btn ${p.prio !== 'any' ? 'is-on' : ''}`} onClick={() => setMenu(menu === 'prio' ? null : 'prio')} aria-expanded={menu === 'prio'}>
        <Icon name="flag" size={17} /> {prioName} <Icon name="down" size={15} />
      </button>
      <label className="filters__q">
        <Icon name="search" size={17} />
        <input value={p.q} onChange={e => p.setQ(e.target.value)} placeholder="Filter by title, project or person" />
        {p.q && <button onClick={() => p.setQ('')} aria-label="Clear filter"><Icon name="close" size={15} /></button>}
      </label>
      {menu === 'proj' && (
        <Popover anchor={projRef.current} onClose={() => setMenu(null)} align="left">
          {[{ id: 'all', name: 'All projects', hue: undefined }, ...data.projects].map(x => (
            <button key={x.id} className="menu__item" onClick={() => { p.setProj(x.id); setMenu(null) }}>
              <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                {x.hue && <span className="dot" data-hue={x.hue} />} {x.name}
              </span>
              {p.proj === x.id && <Icon name="check" className="on" />}
            </button>
          ))}
        </Popover>
      )}
      {menu === 'prio' && (
        <Popover anchor={prioRef.current} onClose={() => setMenu(null)} align="left">
          {(['any', 'urgent', 'high', 'medium', 'low'] as const).map(x => (
            <button key={x} className="menu__item" onClick={() => { p.setPrio(x); setMenu(null) }}>
              {x === 'any' ? 'Any priority' : <Prio v={x} />}
              {p.prio === x && <Icon name="check" className="on" />}
            </button>
          ))}
        </Popover>
      )}
    </div>
  )
}

/* ---------------- Board ---------------- */

function Board({ tasks }: { tasks: Task[] }) {
  const { moveTask, openModal, notify } = useStore()
  const [drag, setDrag] = useState<string | null>(null)
  const [over, setOver] = useState<{ col: Status; before: string | null } | null>(null)
  const [landed, setLanded] = useState<string | null>(null)
  const [showAllDone, setShowAllDone] = useState(false)

  const byCol = (s: Status) => {
    const list = tasks.filter(t => t.status === s)
    return s === 'done'
      ? list.sort((a, b) => ((a.doneAt ?? '') < (b.doneAt ?? '') ? 1 : -1) || a.order - b.order)
      : list.sort((a, b) => a.order - b.order)
  }

  const onOver = (e: DragEvent, col: Status) => {
    if (!drag) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const cards = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[data-card]'))
    let before: string | null = null
    for (const c of cards) {
      if (c.dataset.card === drag) continue
      const r = c.getBoundingClientRect()
      if (e.clientY < r.top + r.height / 2) { before = c.dataset.card!; break }
    }
    if (over?.col !== col || over.before !== before) setOver({ col, before })
  }

  const onDrop = (e: DragEvent, col: Status) => {
    e.preventDefault()
    if (!drag) return
    const t = tasks.find(x => x.id === drag)
    moveTask(drag, col, over?.before ?? null)
    if (t && t.status !== col) notify(`Moved to ${STATUS_LABEL[col]}`, col === 'done' ? 'ok' : 'info')
    setLanded(drag)
    window.setTimeout(() => setLanded(null), 600)
    setDrag(null)
    setOver(null)
  }

  return (
    <div className="board">
      {COLS.map((s, ci) => {
        let list = byCol(s)
        const total = list.length
        const cap = s === 'done' && !showAllDone ? 8 : Infinity
        list = list.slice(0, cap)
        return (
          <section
            key={s}
            className={`col glass glass--chrome rise ${over?.col === s ? 'is-over' : ''}`}
            style={{ ['--i' as string]: ci + 2 }}
            onDragOver={e => onOver(e, s)}
            onDragLeave={e => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOver(null) }}
            onDrop={e => onDrop(e, s)}
            aria-label={STATUS_LABEL[s]}
          >
            <header className="col__head">
              <span className={`col__dot col__dot--${s}`} data-hue={COL_HUE[s]} />
              <h2>{STATUS_LABEL[s]}</h2>
              <span className="count">{total}</span>
              <button className="col__add" aria-label={`Add to ${STATUS_LABEL[s]}`} onClick={() => openModal({ kind: 'task', preset: { status: s } })}><Icon name="plus" size={18} /></button>
            </header>
            <div className="col__body">
              {list.map(t => (
                <div key={t.id} style={{ display: 'contents' }}>
                  {over?.col === s && over.before === t.id && drag !== t.id && <div className="drop-ghost" />}
                  <Card t={t} dragging={drag === t.id} landed={landed === t.id} onDragStart={() => setDrag(t.id)} onDragEnd={() => { setDrag(null); setOver(null) }} />
                </div>
              ))}
              {over?.col === s && over.before === null && <div className="drop-ghost" />}
              {total === 0 && over?.col !== s && <p className="empty col__empty">Drop tasks here</p>}
            </div>
            {s === 'done' && total > 8 && (
              <button className="link col__more" onClick={() => setShowAllDone(v => !v)}>{showAllDone ? 'Show less' : `Show all ${total}`}</button>
            )}
          </section>
        )
      })}
    </div>
  )
}

function Card({ t, dragging, landed, onDragStart, onDragEnd }: { t: Task; dragging: boolean; landed: boolean; onDragStart: () => void; onDragEnd: () => void }) {
  const { project, person, openDrawer, toggleDone } = useStore()
  const p = project(t.project)
  const a = person(t.assignee)
  const subs = t.subtasks.length
  const doneSubs = t.subtasks.filter(s => s.done).length
  const done = t.status === 'done'
  const isToday = !done && t.due <= todayIso()
  return (
    <article
      className={`tcard ${dragging ? 'is-dragging' : ''} ${landed ? 'is-landed' : ''}`}
      data-card={t.id}
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.id); onDragStart() }}
      onDragEnd={onDragEnd}
      onClick={() => openDrawer({ kind: 'task', id: t.id })}
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && openDrawer({ kind: 'task', id: t.id })}
    >
      <div className="tcard__tags">
        <ProjectTag p={p} />
        <Prio v={t.priority} hideLow />
      </div>
      <h3>
        {done && <Check on onToggle={() => toggleDone(t.id)} label="Reopen" />}
        <span>{t.title}</span>
      </h3>
      {subs > 0 && (
        <div className="tcard__prog" data-hue={p.hue}>
          <div className="bar"><i style={{ width: `${(doneSubs / subs) * 100}%` }} /></div>
          <small>{doneSubs}/{subs}</small>
        </div>
      )}
      <footer className="tcard__foot">
        <span className={`tcard__due ${isToday ? 'is-today' : ''}`}>
          <Icon name={done ? 'check' : 'calendar'} size={15} /> {done ? short(t.doneAt ?? t.due) : relDue(t.due)}
        </span>
        {t.comments.length > 0 && <span className="tcard__meta"><Icon name="comment" size={15} /> {t.comments.length}</span>}
        <Avatar p={a} size={24} />
      </footer>
    </article>
  )
}

/* ---------------- List ---------------- */

function List({ tasks }: { tasks: Task[] }) {
  const { project, person, toggleDone, openDrawer } = useStore()
  const [sort, setSort] = useState<'due' | 'priority'>('due')
  const [closed, setClosed] = useState<Record<string, boolean>>({ done: true })
  const sorter = sort === 'due' ? sortByDue : (a: Task, b: Task) => prioRank(a) - prioRank(b) || sortByDue(a, b)
  return (
    <section className="card glass rise list-card" style={{ ['--i' as string]: 2 }}>
      <div className="card__head">
        <div><h2>All tasks</h2><p>{tasks.length} on the board</p></div>
        <Seg size="sm" value={sort} onChange={setSort} options={[{ value: 'due', label: 'Due' }, { value: 'priority', label: 'Priority' }]} />
      </div>
      {COLS.map(s => {
        const list = tasks.filter(t => t.status === s).sort(sorter)
        const isClosed = closed[s]
        return (
          <div key={s} className="lgroup">
            <button className="lgroup__head" onClick={() => setClosed(c => ({ ...c, [s]: !c[s] }))} aria-expanded={!isClosed}>
              <Icon name="down" size={16} className={isClosed ? 'rot' : ''} />
              <span className={`col__dot col__dot--${s}`} data-hue={COL_HUE[s]} />
              {STATUS_LABEL[s]} <span className="count">{list.length}</span>
            </button>
            {!isClosed && (
              <ul>
                {list.map(t => (
                  <li key={t.id} className={`lrow ${t.status === 'done' ? 'is-done' : ''}`} onClick={() => openDrawer({ kind: 'task', id: t.id })}>
                    <Check on={t.status === 'done'} onToggle={() => toggleDone(t.id)} label={t.title} />
                    <b>{t.title}</b>
                    <span className="lrow__proj"><ProjectTag p={project(t.project)} /></span>
                    <span className={`lrow__due ${t.status !== 'done' && t.due <= todayIso() ? 'is-today' : ''}`}><Icon name="calendar" size={15} /> {t.status === 'done' ? short(t.doneAt ?? t.due) : relDue(t.due)}</span>
                    <span className="lrow__prio"><Prio v={t.priority} /></span>
                    <Avatar p={person(t.assignee)} size={28} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </section>
  )
}
