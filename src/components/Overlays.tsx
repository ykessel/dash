import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { CalEvent, Hue, Priority, ProjectIcon, Status, Team } from '../data/types'
import { demoNow, fmtDur, fmtTime, offset, relDue, short, todayIso } from '../lib/date'
import { go } from '../lib/router'
import { useStore, type Drawer as DrawerState, type Modal as ModalState } from '../store'
import { Icon } from './Icon'
import { Avatar, Check, Prio, ProjectTag, Seg, Stack, usePresence } from './ui'

export const STATUS_LABEL: Record<Status, string> = { todo: 'To do', progress: 'In progress', review: 'In review', done: 'Done' }

function useEscape(on: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && on()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [on, active])
}

/* ======================= Modals ======================= */

export function ModalHost() {
  const { modal, openModal } = useStore()
  const [shown, leaving] = usePresence<NonNullable<ModalState>>(modal, 200)
  const close = () => openModal(null)
  useEscape(close, !!modal)
  if (!shown) return null
  return (
    <>
      <div className={`scrim ${leaving ? 'is-out' : ''}`} onClick={close} />
      <div className={`modal glass glass--thick ${leaving ? 'is-out' : ''}`} role="dialog" aria-modal="true">
        {shown.kind === 'task' && <TaskForm preset={shown.preset} onDone={close} />}
        {shown.kind === 'event' && <EventForm preset={shown.preset} onDone={close} />}
        {shown.kind === 'project' && <ProjectForm onDone={close} />}
        {shown.kind === 'invite' && <InviteForm onDone={close} />}
        {shown.kind === 'shortcuts' && <Shortcuts onDone={close} />}
      </div>
    </>
  )
}

function FormHead({ title, onClose, submit = 'Add' }: { title: string; onClose: () => void; submit?: string | null }) {
  return (
    <div className="modal__head">
      <button type="button" className="round-btn" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
      <h2>{title}</h2>
      {submit ? <button type="submit" className="btn btn--primary btn--sm" style={{ ['--h' as string]: '40px', fontSize: 15 }}>{submit}</button> : <span />}
    </div>
  )
}

function Field({ label, children, full }: { label: string; children: ReactNode; full?: boolean }) {
  return (
    <label className={`field ${full ? 'full' : ''}`}>
      <span>{label}</span>
      {children}
    </label>
  )
}

function TaskForm({ preset, onDone }: { preset?: Partial<import('../data/types').Task>; onDone: () => void }) {
  const { data, me, addTask, notify } = useStore()
  const [title, setTitle] = useState(preset?.title ?? '')
  const [projectId, setProject] = useState(preset?.project ?? data.projects[0].id)
  const [assignee, setAssignee] = useState(preset?.assignee ?? me.id)
  const [priority, setPriority] = useState<Priority>(preset?.priority ?? 'medium')
  const [due, setDue] = useState(preset?.due ?? offset(2))
  const [status, setStatus] = useState<Status>(preset?.status ?? 'todo')
  const [estimate, setEstimate] = useState(preset?.estimate ?? 2)
  const [err, setErr] = useState(false)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) { setErr(true); return }
    const t = addTask({ title: title.trim(), project: projectId, assignee, priority, due, status, estimate })
    onDone()
    notify(`Added “${t.title}”`, 'ok')
  }
  return (
    <form onSubmit={submit}>
      <FormHead title="New task" onClose={onDone} />
      <div className="modal__grid">
        <Field label="Title" full>
          <input className="input" autoFocus value={title} onChange={e => { setTitle(e.target.value); setErr(false) }} placeholder="What needs doing?" aria-invalid={err} style={err ? { boxShadow: 'inset 0 0 0 2px var(--danger)' } : undefined} />
        </Field>
        <Field label="Project">
          <select className="input" value={projectId} onChange={e => setProject(e.target.value)}>
            {data.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Assignee">
          <select className="input" value={assignee} onChange={e => setAssignee(e.target.value)}>
            {data.people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Priority">
          <select className="input" value={priority} onChange={e => setPriority(e.target.value as Priority)}>
            <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
          </select>
        </Field>
        <Field label="Due">
          <input className="input" type="date" value={due} onChange={e => setDue(e.target.value)} />
        </Field>
        <Field label="Status">
          <select className="input" value={status} onChange={e => setStatus(e.target.value as Status)}>
            {(Object.keys(STATUS_LABEL) as Status[]).map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </Field>
        <Field label="Estimate (hours)">
          <input className="input" type="number" min={0} max={80} value={estimate} onChange={e => setEstimate(Number(e.target.value))} />
        </Field>
      </div>
    </form>
  )
}

const toHM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

function EventForm({ preset, onDone }: { preset?: Partial<CalEvent>; onDone: () => void }) {
  const { data, me, addEvent, notify } = useStore()
  const [title, setTitle] = useState(preset?.title ?? '')
  const [date, setDate] = useState(preset?.date ?? todayIso())
  const [start, setStart] = useState(toHM(preset?.start ?? 15 * 60))
  const [dur, setDur] = useState(preset?.dur ?? 30)
  const [where, setWhere] = useState(preset?.where ?? 'Video call')
  const [projectId, setProject] = useState(preset?.project ?? '')
  const [kind, setKind] = useState<CalEvent['kind']>(preset?.kind ?? 'meeting')
  const [err, setErr] = useState(false)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) { setErr(true); return }
    const [h, m] = start.split(':').map(Number)
    const proj = data.projects.find(p => p.id === projectId)
    const hue: Hue = kind === 'focus' ? 'purple' : proj?.hue ?? 'indigo'
    addEvent({ title: title.trim(), date, start: h * 60 + m, dur, where, kind, hue, project: projectId || undefined, people: [me.id] })
    onDone()
    notify(`“${title.trim()}” on ${relDue(date)} at ${fmtTime(h * 60 + m)}`, 'ok')
  }
  return (
    <form onSubmit={submit}>
      <FormHead title="New event" onClose={onDone} />
      <div className="modal__grid">
        <Field label="Title" full>
          <input className="input" autoFocus value={title} onChange={e => { setTitle(e.target.value); setErr(false) }} placeholder="What’s happening?" style={err ? { boxShadow: 'inset 0 0 0 2px var(--danger)' } : undefined} />
        </Field>
        <Field label="Date"><input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
        <Field label="Starts"><input className="input" type="time" value={start} step={900} onChange={e => setStart(e.target.value)} /></Field>
        <Field label="Length">
          <select className="input" value={dur} onChange={e => setDur(Number(e.target.value))}>
            {[15, 30, 45, 60, 90, 120].map(d => <option key={d} value={d}>{fmtDur(d)}</option>)}
          </select>
        </Field>
        <Field label="Where"><input className="input" value={where} onChange={e => setWhere(e.target.value)} /></Field>
        <Field label="Kind">
          <select className="input" value={kind} onChange={e => setKind(e.target.value as CalEvent['kind'])}>
            <option value="meeting">Meeting</option><option value="review">Review</option><option value="team">Team</option><option value="focus">Focus block</option><option value="call">Call</option>
          </select>
        </Field>
        <Field label="Project">
          <select className="input" value={projectId} onChange={e => setProject(e.target.value)}>
            <option value="">None</option>
            {data.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
      </div>
    </form>
  )
}

const ICONS: ProjectIcon[] = ['rocket', 'phone', 'grid', 'leaf', 'flame', 'chart']
const HUES: Hue[] = ['blue', 'purple', 'pink', 'orange', 'green', 'teal']

function ProjectForm({ onDone }: { onDone: () => void }) {
  const { addProject, notify } = useStore()
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [hue, setHue] = useState<Hue>('blue')
  const [icon, setIcon] = useState<ProjectIcon>('rocket')
  const [due, setDue] = useState(offset(30))
  const [err, setErr] = useState(false)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setErr(true); return }
    const p = addProject({ name: name.trim(), desc: desc.trim() || 'A fresh project.', hue, icon, due, status: 'planning' })
    onDone()
    notify(`Created ${p.name}`, 'ok')
    go(`projects/${p.id}`)
  }
  return (
    <form onSubmit={submit}>
      <FormHead title="New project" onClose={onDone} submit="Create" />
      <div className="modal__grid">
        <Field label="Name" full>
          <input className="input" autoFocus value={name} onChange={e => { setName(e.target.value); setErr(false) }} placeholder="Project name" style={err ? { boxShadow: 'inset 0 0 0 2px var(--danger)' } : undefined} />
        </Field>
        <Field label="Description" full>
          <textarea className="input" value={desc} onChange={e => setDesc(e.target.value)} placeholder="One line on what this is for" />
        </Field>
        <div className="field full">
          <span>Colour and icon</span>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {HUES.map(h => (
              <button type="button" key={h} className="swatch" data-hue={h} aria-pressed={h === hue} onClick={() => setHue(h)} aria-label={h} />
            ))}
            <span style={{ width: 12 }} />
            {ICONS.map(i => (
              <button type="button" key={i} className="pj-icon pj-icon--pick" data-hue={hue} aria-pressed={i === icon} onClick={() => setIcon(i)} aria-label={i}>
                <Icon name={i} />
              </button>
            ))}
          </div>
        </div>
        <Field label="Due"><input className="input" type="date" value={due} onChange={e => setDue(e.target.value)} /></Field>
      </div>
    </form>
  )
}

function InviteForm({ onDone }: { onDone: () => void }) {
  const { invite, notify } = useStore()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [team, setTeam] = useState<Team>('Product')
  const [role, setRole] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !email.includes('@')) return
    invite(name.trim(), email.trim(), team, role.trim() || `${team} teammate`)
    onDone()
    notify(`Invite sent to ${email.trim()}`, 'ok')
  }
  return (
    <form onSubmit={submit}>
      <FormHead title="Invite to Pane" onClose={onDone} submit="Send" />
      <div className="modal__grid">
        <Field label="Name"><input className="input" autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Full name" required /></Field>
        <Field label="Email"><input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@company.com" required /></Field>
        <Field label="Team">
          <select className="input" value={team} onChange={e => setTeam(e.target.value as Team)}>
            {['Product', 'Design', 'Engineering', 'Marketing'].map(t => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Role"><input className="input" value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Designer" /></Field>
      </div>
    </form>
  )
}

function Shortcuts({ onDone }: { onDone: () => void }) {
  const rows: [string, string][] = [
    ['⌘ K', 'Search everything'], ['/', 'Search'], ['N', 'New task'], ['E', 'New event'], ['F', 'Start a focus session'],
    ['T', 'Toggle theme'], ['G then H/T/C/P/I/M/S', 'Go to a page'], ['Esc', 'Close'],
  ]
  return (
    <div>
      <FormHead title="Keyboard shortcuts" onClose={onDone} submit={null} />
      <ul className="shortcuts">
        {rows.map(([k, v]) => <li key={k}><span>{v}</span><kbd>{k}</kbd></li>)}
      </ul>
    </div>
  )
}

/* ======================= Drawers ======================= */

export function DrawerHost() {
  const { drawer, openDrawer } = useStore()
  const [shown, leaving] = usePresence<NonNullable<DrawerState>>(drawer, 240)
  const close = () => openDrawer(null)
  useEscape(close, !!drawer)
  if (!shown) return null
  return (
    <>
      <div className={`scrim ${leaving ? 'is-out' : ''}`} onClick={close} />
      <aside className={`drawer glass glass--thick ${leaving ? 'is-out' : ''}`} role="dialog" aria-modal="true" key={`${shown.kind}${shown.id}`}>
        <button className="round-btn drawer__close" onClick={close} aria-label="Close"><Icon name="close" size={18} /></button>
        {shown.kind === 'task' && <TaskDetail id={shown.id} onClose={close} />}
        {shown.kind === 'event' && <EventDetail id={shown.id} onClose={close} />}
        {shown.kind === 'person' && <PersonDetail id={shown.id} />}
      </aside>
    </>
  )
}

function TaskDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, me, person, project, updateTask, removeTask, startFocus, toggleDone } = useStore()
  const t = data.tasks.find(x => x.id === id)
  const [sub, setSub] = useState('')
  const [msg, setMsg] = useState('')
  if (!t) return <p className="empty">This task no longer exists.</p>
  const p = project(t.project)
  const a = person(t.assignee)
  const doneSubs = t.subtasks.filter(s => s.done).length

  const addSub = (e: FormEvent) => {
    e.preventDefault()
    if (!sub.trim()) return
    updateTask(t.id, { subtasks: [...t.subtasks, { id: `s${Date.now()}`, title: sub.trim(), done: false }] })
    setSub('')
  }
  const addComment = (e: FormEvent) => {
    e.preventDefault()
    if (!msg.trim()) return
    updateTask(t.id, { comments: [...t.comments, { id: `c${Date.now()}`, who: me.id, text: msg.trim(), at: Date.now() }] })
    setMsg('')
  }

  return (
    <>
      <div className="drawer__tags">
        <ProjectTag p={p} onClick={() => { onClose(); go(`projects/${p.id}`) }} />
        <Prio v={t.priority} />
      </div>
      <h2>{t.title}</h2>
      <div style={{ marginBottom: 16 }}>
        <Seg
          value={t.status}
          onChange={s => updateTask(t.id, { status: s, doneAt: s === 'done' ? todayIso() : undefined })}
          options={(Object.keys(STATUS_LABEL) as Status[]).map(s => ({ value: s, label: STATUS_LABEL[s] }))}
          label="Status"
        />
      </div>
      <div className="facts">
        <div className="fact well"><small>Assignee</small><b><Avatar p={a} size={26} /> {a.name}</b></div>
        <div className="fact well"><small>Due</small><b><Icon name="calendar" /> {t.status === 'done' ? short(t.doneAt ?? t.due) : relDue(t.due)}</b></div>
        <div className="fact well"><small>Estimate</small><b><Icon name="clock" /> {t.estimate} h</b></div>
        <div className="fact well"><small>Project</small><b><a className="link" href={`#/projects/${p.id}`} onClick={onClose}>{p.name}</a></b></div>
      </div>

      <div className="section-title">Subtasks <span className="count">{doneSubs}/{t.subtasks.length}</span></div>
      {t.subtasks.map(s => (
        <div className="sub-row" key={s.id}>
          <Check on={s.done} label={s.title} onToggle={() => updateTask(t.id, { subtasks: t.subtasks.map(x => (x.id === s.id ? { ...x, done: !x.done } : x)) })} />
          <span className={s.done ? 'done-text' : ''}>{s.title}</span>
        </div>
      ))}
      <form className="input-row" onSubmit={addSub} style={{ margin: '6px 0 18px' }}>
        <input className="input" value={sub} onChange={e => setSub(e.target.value)} placeholder="Add a subtask" />
        <button className="btn btn--glass btn--sm" style={{ ['--h' as string]: '40px' }}>Add</button>
      </form>

      <div className="section-title">Comments</div>
      {t.comments.map(c => {
        const w = person(c.who)
        return (
          <div className="comment" key={c.id}>
            <Avatar p={w} size={28} />
            <div>
              <b>{w.name.split(' ')[0]}</b><small>{agoShort(c.at)}</small>
              <p>{c.text}</p>
            </div>
          </div>
        )
      })}
      <form className="input-row" onSubmit={addComment}>
        <input className="input" value={msg} onChange={e => setMsg(e.target.value)} placeholder="Write a comment" />
        <button className="btn btn--glass btn--sm" style={{ ['--h' as string]: '40px' }}>Post</button>
      </form>

      <div className="drawer__actions">
        <button className="btn btn--glass" onClick={() => { startFocus(undefined, t.title, t.id); onClose() }}><Icon name="moon" /> Focus on this</button>
        <button className="btn btn--primary" onClick={() => toggleDone(t.id)}>
          <Icon name={t.status === 'done' ? 'refresh' : 'check'} /> {t.status === 'done' ? 'Reopen' : 'Mark done'}
        </button>
        <span className="spacer" />
        <button className="round-btn" aria-label="Delete task" onClick={() => { removeTask(t.id); onClose() }}><Icon name="trash" size={18} /></button>
      </div>
    </>
  )
}

function agoShort(ts: number) {
  const h = Math.round((Date.now() - ts) / 3_600_000)
  if (h < 1) return 'now'
  if (h < 24) return `${h} h ago`
  return `${Math.round(h / 24)} d ago`
}

const KIND_LABEL: Record<CalEvent['kind'], string> = { meeting: 'Meeting', review: 'Review', team: 'Team', focus: 'Focus block', call: 'Call', milestone: 'Milestone' }

function EventDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, person, project, removeEvent, notify } = useStore()
  const e = data.events.find(x => x.id === id)
  if (!e) return <p className="empty">This event was removed.</p>
  const ppl = e.people.map(person)
  return (
    <>
      <div className="drawer__tags"><span className="tag tag--plain" data-hue={e.hue}>{KIND_LABEL[e.kind]}</span></div>
      <h2>{e.title}</h2>
      <div className="facts">
        <div className="fact well"><small>When</small><b><Icon name="clock" /> {relDue(e.date)} · {fmtTime(e.start)} – {fmtTime(e.start + e.dur)}</b></div>
        <div className="fact well"><small>Where</small><b><Icon name={e.where === 'Video call' ? 'video' : 'pin'} /> {e.where}</b></div>
        <div className="fact well"><small>Project</small><b>{e.project ? <ProjectTag p={project(e.project)} /> : 'None'}</b></div>
        <div className="fact well"><small>People</small><b><Stack people={ppl} size={26} /> {ppl.length}</b></div>
      </div>
      <div className="drawer__actions" style={{ marginTop: 6 }}>
        {e.where === 'Video call' && <button className="btn btn--primary" onClick={() => notify('Joining the call…', 'info')}><Icon name="video" /> Join call</button>}
        <button className="btn btn--glass" onClick={() => { removeEvent(e.id); onClose() }}><Icon name="trash" /> Remove</button>
      </div>
    </>
  )
}

/** Offset of a time zone from UTC, in hours, right now. */
export function tzOffsetHours(tz: string) {
  const d = new Date()
  const loc = new Date(d.toLocaleString('en-US', { timeZone: tz }))
  const utc = new Date(d.toLocaleString('en-US', { timeZone: 'UTC' }))
  return Math.round(((loc.getTime() - utc.getTime()) / 3_600_000) * 2) / 2
}
/** The person's wall-clock time, given that "my" wall clock reads demoNow() in my zone. */
export function localTimeMin(tz: string, mineTz: string) {
  const n = demoNow()
  const mine = n.getHours() * 60 + n.getMinutes()
  return (((mine + (tzOffsetHours(tz) - tzOffsetHours(mineTz)) * 60) % 1440) + 1440) % 1440
}
export function localTime(tz: string, mineTz: string) {
  return fmtTime(localTimeMin(tz, mineTz))
}
export function tzRel(tz: string, mineTz: string) {
  const diff = tzOffsetHours(tz) - tzOffsetHours(mineTz)
  if (diff === 0) return 'Same time as you'
  return `${Math.abs(diff)}h ${diff > 0 ? 'ahead' : 'behind'}`
}
export const PRESENCE_LABEL = { online: 'Online', focus: 'In focus', meeting: 'In a meeting', away: 'Away' } as const

function PersonDetail({ id }: { id: string }) {
  const { data, person, project, me, openDrawer, notify } = useStore()
  const p = person(id)
  const tasks = data.tasks.filter(t => t.assignee === p.id && t.status !== 'done')
  const projects = data.projects.filter(x => x.members.includes(p.id))
  const load = tasks.reduce((s, t) => s + t.estimate, 0)
  return (
    <>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 8 }}>
        <Avatar p={p} size={84} presence />
        <div>
          <h2 style={{ margin: 0 }}>{p.name}</h2>
          <p style={{ color: 'var(--text-2)' }}>{p.role} · {p.team}</p>
        </div>
      </div>
      <div className="facts" style={{ marginTop: 20 }}>
        <div className="fact well"><small>Status</small><b><span className="presence-dot" data-presence={p.presence} /> {PRESENCE_LABEL[p.presence]}</b></div>
        <div className="fact well"><small>Local time</small><b><Icon name="clock" /> {localTime(p.tz, me.tz)} · {p.city}</b></div>
        <div className="fact well"><small>Email</small><b><Icon name="mail" /> {p.email}</b></div>
        <div className="fact well"><small>Workload</small><b>{load}h / {p.capacity}h</b></div>
      </div>
      <div className="section-title">Projects</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
        {projects.length ? projects.map(x => <ProjectTag key={x.id} p={x} />) : <span className="empty" style={{ padding: 0 }}>No projects yet</span>}
      </div>
      <div className="section-title">Open tasks <span className="count">{tasks.length}</span></div>
      <ul className="mini-list">
        {tasks.slice(0, 8).map(t => (
          <li key={t.id} onClick={() => openDrawer({ kind: 'task', id: t.id })}>
            <span>{t.title}</span>
            <ProjectTag p={project(t.project)} />
          </li>
        ))}
        {tasks.length === 0 && <li className="empty">Nothing open</li>}
      </ul>
      {p.id !== me.id && (
        <div className="drawer__actions">
          <button className="btn btn--primary" onClick={() => notify(`Message sent to ${p.name.split(' ')[0]}`, 'ok')}><Icon name="comment" /> Message</button>
          <button className="btn btn--glass" onClick={() => notify(`Calling ${p.name.split(' ')[0]}…`, 'info')}><Icon name="video" /> Call</button>
        </div>
      )}
    </>
  )
}
