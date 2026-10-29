import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { CalEvent, Hue, Priority, ProjectIcon, Status, Team } from '../data/types'
import { demoNow, fmtDur, fmtTime, offset, parse, relDue, short, todayIso, weekday } from '../lib/date'
import { go } from '../lib/router'
import { useStore, type Drawer as DrawerState, type Modal as ModalState } from '../store'
import { Icon } from './Icon'
import { Avatar, Check, Prio, ProjectTag, Ring, Seg, Stack, usePresence } from './ui'

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
  const [shown, leaving] = usePresence<NonNullable<ModalState>>(modal, 260)
  const close = () => openModal(null)
  useEscape(close, !!modal)
  if (!shown) return null
  return (
    <>
      <div className={`scrim ${leaving ? 'is-out' : ''}`} onClick={close} />
      <ModalPanel leaving={leaving}>
        {shown.kind === 'task' && <TaskForm preset={shown.preset} onDone={close} />}
        {shown.kind === 'event' && <EventForm preset={shown.preset} onDone={close} />}
        {shown.kind === 'project' && <ProjectForm onDone={close} />}
        {shown.kind === 'invite' && <InviteForm onDone={close} />}
        {shown.kind === 'shortcuts' && <Shortcuts onDone={close} />}
      </ModalPanel>
    </>
  )
}

function ModalPanel({ leaving, children }: { leaving: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useSheetMotion(ref, leaving, 'modal')
  return (
    <div ref={ref} className="modal glass glass--thick" role="dialog" aria-modal="true">
      <span className="grabber" aria-hidden="true" />
      {children}
    </div>
  )
}

function FormError({ msg }: { msg: string }) {
  return <p className="mform__err" role="alert">{msg}</p>
}

function FormHead({ title, onClose, submit = 'Add' }: { title: string; onClose: () => void; submit?: string | null }) {
  return (
    <div className="modal__head">
      <button type="button" className="ibtn ibtn--glass" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
      <h2>{title}</h2>
      {submit ? <button type="submit" className="btn btn--primary btn--sm">{submit}</button> : <span className="ibtn" aria-hidden="true" />}
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
  const { data, me, addTask, notify, openModal } = useStore()
  const [title, setTitle] = useState(preset?.title ?? '')
  const [projectId, setProject] = useState(preset?.project ?? data.projects[0]?.id ?? '')
  const [assignee, setAssignee] = useState(preset?.assignee ?? me.id)
  const [priority, setPriority] = useState<Priority>(preset?.priority ?? 'medium')
  const [due, setDue] = useState(preset?.due ?? offset(2))
  const [status, setStatus] = useState<Status>(preset?.status ?? 'todo')
  const [estimate, setEstimate] = useState(preset?.estimate ?? 2)
  const [err, setErr] = useState(false)

  // A brand-new workspace has no projects yet, and every task belongs to one.
  if (!data.projects.length) {
    return (
      <div className="mform">
        <FormHead title="New task" onClose={onDone} submit={null} />
        <p className="mform__empty">Tasks live in projects. Create your first project, then add tasks to it.</p>
        <button type="button" className="btn btn--primary" onClick={() => openModal({ kind: 'project' })}>New project</button>
      </div>
    )
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) { setErr(true); return }
    const t = addTask({ title: title.trim(), project: projectId, assignee, priority, due, status, estimate })
    onDone()
    notify(`Added “${t.title}”`, 'ok')
  }
  return (
    <form className="mform" onSubmit={submit} noValidate>
      <FormHead title="New task" onClose={onDone} />
      <div className="modal__grid">
        <Field label="Title" full>
          <input className="input" autoFocus value={title} onChange={e => { setTitle(e.target.value); setErr(false) }} placeholder="What needs doing?" aria-invalid={err} />
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
      {err && <FormError msg="Title is required." />}
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
    <form className="mform" onSubmit={submit} noValidate>
      <FormHead title="New event" onClose={onDone} />
      <div className="modal__grid">
        <Field label="Title" full>
          <input className="input" autoFocus value={title} onChange={e => { setTitle(e.target.value); setErr(false) }} placeholder="What’s happening?" />
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
      {err && <FormError msg="Title is required." />}
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
    addProject({ name: name.trim(), desc: desc.trim() || 'A fresh project.', hue, icon, due, status: 'planning' }).then(p => {
      if (!p) return
      onDone()
      notify(`Created ${p.name}`, 'ok')
      go(`projects/${p.id}`)
    })
  }
  return (
    <form className="mform" onSubmit={submit} noValidate>
      <FormHead title="New project" onClose={onDone} submit="Create" />
      <div className="modal__grid">
        <Field label="Name" full>
          <input className="input" autoFocus value={name} onChange={e => { setName(e.target.value); setErr(false) }} placeholder="Project name" />
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
      {err && <FormError msg="Name is required." />}
    </form>
  )
}

function InviteForm({ onDone }: { onDone: () => void }) {
  const { invite, notify } = useStore()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [team, setTeam] = useState<Team>('Product')
  const [role, setRole] = useState('')
  const [err, setErr] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setErr('Name is required.'); return }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setErr('Enter a valid email address.'); return }
    invite(name.trim(), email.trim(), team, role.trim() || `${team} teammate`).then(ok => {
      if (!ok) return
      onDone()
      notify(`Invite sent to ${email.trim()}`, 'ok')
    })
  }
  return (
    <form className="mform" onSubmit={submit} noValidate>
      <FormHead title="Invite to Pane" onClose={onDone} submit="Send" />
      <div className="modal__grid">
        <Field label="Name"><input className="input" autoFocus value={name} onChange={e => { setName(e.target.value); setErr('') }} placeholder="Full name" /></Field>
        <Field label="Email"><input className="input" type="email" value={email} onChange={e => { setEmail(e.target.value); setErr('') }} placeholder="name@company.com" /></Field>
        <Field label="Team">
          <select className="input" value={team} onChange={e => setTeam(e.target.value as Team)}>
            {['Product', 'Design', 'Engineering', 'Marketing'].map(t => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Role"><input className="input" value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Designer" /></Field>
      </div>
      {err && <FormError msg={err} />}
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
  const [shown, leaving] = usePresence<NonNullable<DrawerState>>(drawer, 260)
  const close = () => openDrawer(null)
  useEscape(close, !!drawer)
  if (!shown) return null
  return (
    <>
      <div className={`scrim ${leaving ? 'is-out' : ''}`} onClick={close} />
      <DrawerPanel key={`${shown.kind}${shown.id}`} leaving={leaving} onClose={close}>
        {shown.kind === 'task' && <TaskDetail id={shown.id} onClose={close} />}
        {shown.kind === 'event' && <EventDetail id={shown.id} onClose={close} />}
        {shown.kind === 'person' && <PersonDetail id={shown.id} onClose={close} />}
      </DrawerPanel>
    </>
  )
}

function DrawerPanel({ leaving, onClose, children }: { leaving: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null)
  useSheetMotion(ref, leaving, 'drawer')
  return (
    <aside ref={ref} className="drawer glass glass--thick" role="dialog" aria-modal="true">
      <span className="grabber" aria-hidden="true" />
      <button className="ibtn ibtn--glass drawer__close" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
      <div className="drawer__body">{children}</div>
    </aside>
  )
}

function TaskDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, person, project, moveTask, removeTask, startFocus, toggleDone, addSubtask, toggleSubtask, addComment: comment } = useStore()
  const t = data.tasks.find(x => x.id === id)
  const [sub, setSub] = useState('')
  const [msg, setMsg] = useState('')
  if (!t) return <p className="tp-none">This task no longer exists.</p>
  const p = project(t.project)
  const a = person(t.assignee)
  const doneSubs = t.subtasks.filter(s => s.done).length

  const addSub = (e: FormEvent) => {
    e.preventDefault()
    if (!sub.trim()) return
    addSubtask(t.id, sub.trim())
    setSub('')
  }
  const addComment = (e: FormEvent) => {
    e.preventDefault()
    if (!msg.trim()) return
    // @Name of a teammate becomes a mention, so they get a notice.
    const text = msg.trim()
    comment(t.id, text, data.people.filter(x => text.includes(`@${x.name.split(' ')[0]}`)).map(x => x.id))
    setMsg('')
  }
  const toggleSub = (sid: string) => toggleSubtask(t.id, sid)

  return (
    <>
      <div className="tp__top">
        <ProjectTag p={p} onClick={() => { onClose(); go(`projects/${p.id}`) }} />
        <Prio v={t.priority} />
      </div>
      <h2 className="tp__title">{t.title}</h2>
      <Seg
        block
        value={t.status}
        onChange={s => moveTask(t.id, s, 'top')}
        options={(Object.keys(STATUS_LABEL) as Status[]).map(s => ({ value: s, label: STATUS_LABEL[s] }))}
        label="Status"
      />
      <dl className="tp__meta">
        <div><dt>Assignee</dt><dd><Avatar p={a} size={28} /><span>{a.name}</span></dd></div>
        <div><dt>Due</dt><dd><Icon name="calendar" /><span>{t.status === 'done' ? short(t.doneAt ?? t.due) : relDue(t.due)}</span></dd></div>
        <div><dt>Estimate</dt><dd><Icon name="clock" /><span>{t.estimate} h</span></dd></div>
        <div><dt>Project</dt><dd><a href={`#/projects/${p.id}`} onClick={onClose}><span>{p.name}</span></a></dd></div>
      </dl>

      <section className="tp__block">
        <header><h3>Subtasks</h3><span className="badge num">{doneSubs}/{t.subtasks.length}</span></header>
        {t.subtasks.length > 0 && (
          <ul className="tp__subs">
            {t.subtasks.map(s => (
              <li className="tp-sub" key={s.id} onClick={() => toggleSub(s.id)}>
                <Check on={s.done} label={s.title} onToggle={() => toggleSub(s.id)} />
                <span className={s.done ? 'is-done' : ''}>{s.title}</span>
              </li>
            ))}
          </ul>
        )}
        <form className="tp__add" onSubmit={addSub}>
          <input className="input" value={sub} onChange={e => setSub(e.target.value)} placeholder="Add a subtask" aria-label="Add a subtask" />
          <button className="btn btn--glass btn--sm">Add</button>
        </form>
      </section>

      <section className="tp__block">
        <header><h3>Comments</h3></header>
        {t.comments.length === 0 ? <p className="tp-none">No comments yet.</p> : (
          <ul className="tp__comments">
            {t.comments.map(c => {
              const w = person(c.who)
              return (
                <li className="tp-comment" key={c.id}>
                  <Avatar p={w} size={28} />
                  <div>
                    <b>{w.name.split(' ')[0]}</b> <small>{agoShort(c.at)}</small>
                    <p>{c.text}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <form className="tp__add" onSubmit={addComment}>
          <input className="input" value={msg} onChange={e => setMsg(e.target.value)} placeholder="Write a comment" aria-label="Write a comment" />
          <button className="btn btn--glass btn--sm">Post</button>
        </form>
      </section>

      <footer className="tp__foot">
        <button className="btn btn--glass" onClick={() => { startFocus(undefined, t.title, t.id); onClose() }}><Icon name="moon" /> Focus on this</button>
        <button className="btn btn--primary" onClick={() => toggleDone(t.id)}>
          <Icon name={t.status === 'done' ? 'refresh' : 'check'} /> {t.status === 'done' ? 'Reopen' : 'Mark done'}
        </button>
        <button className="ibtn ibtn--glass tp__del" aria-label="Delete task" onClick={() => { removeTask(t.id); onClose() }}><Icon name="trash" size={18} /></button>
      </footer>
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
  if (!e) return <p className="tp-none">This event was removed.</p>
  const ppl = e.people.map(person)
  return (
    <>
      <div className="tp__top"><span className="tag tag--plain" data-hue={e.hue}>{KIND_LABEL[e.kind]}</span></div>
      <h2 className="tp__title">{e.title}</h2>
      <dl className="tp__meta">
        <div><dt>When</dt><dd><Icon name="clock" /><span>{relDue(e.date)} · {fmtTime(e.start)} – {fmtTime(e.start + e.dur)}</span></dd></div>
        <div><dt>Where</dt><dd><Icon name={e.where === 'Video call' ? 'video' : e.kind === 'focus' ? 'moon' : 'pin'} /><span>{e.where}</span></dd></div>
        <div><dt>Project</dt><dd>{e.project ? <ProjectTag p={project(e.project)} onClick={() => { onClose(); go(`projects/${e.project}`) }} /> : <span>None</span>}</dd></div>
        <div><dt>People</dt><dd><Stack people={ppl} size={28} /><span>{ppl.length}</span></dd></div>
      </dl>
      <footer className="tp__foot">
        {e.where === 'Video call' && <button className="btn btn--primary" onClick={() => notify('Joining the call…', 'info')}><Icon name="video" /> Join call</button>}
        <button className="btn btn--glass" onClick={() => { removeEvent(e.id); onClose() }}><Icon name="trash" /> Remove</button>
      </footer>
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

const TEAM_HUE: Record<Team, Hue> = { Product: 'blue', Design: 'pink', Engineering: 'indigo', Marketing: 'orange' }

function PersonDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, person, project, me, openDrawer, notify } = useStore()
  const p = person(id)
  const first = p.name.split(' ')[0]
  const tasks = data.tasks.filter(t => t.assignee === p.id && t.status !== 'done').sort((x, y) => (x.due < y.due ? -1 : 1))
  const projects = data.projects.filter(x => x.members.includes(p.id))
  const hours = tasks.reduce((sum, t) => sum + t.estimate, 0)
  const load = Math.round((hours / p.capacity) * 100)
  const level = load > 100 ? 'over' : load >= 80 ? 'high' : 'ok'
  const today = todayIso()
  const week = data.events
    .filter(e => e.people.includes(p.id) && e.date >= today && e.date <= offset(6))
    .sort((x, y) => (x.date === y.date ? x.start - y.start : x.date < y.date ? -1 : 1))
  // Demo focus hours: my real log, a stable made-up number for everyone else.
  const focusWeek = p.id === me.id
    ? data.focus.filter(f => f.date > offset(-7)).reduce((sum, f) => sum + f.minutes, 0) / 60
    : 1 + ([...p.id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 45) / 10
  const lm = localTimeMin(p.tz, me.tz)
  const day = lm >= 7 * 60 && lm < 19 * 60

  return (
    <div className="prof">
      <header className="prof__hero" data-hue={TEAM_HUE[p.team]}>
        <Avatar p={p} size={96} presence />
        <div className="prof__who">
          <h2 className="prof__name">{p.name}</h2>
          <p className="prof__role">{p.role}</p>
          <div className="prof__chips">
            <span className="tag" data-hue={TEAM_HUE[p.team]}>{p.team}</span>
            <span className="presence-label"><i className="presence-dot" data-presence={p.presence} /> {PRESENCE_LABEL[p.presence]}</span>
          </div>
        </div>
      </header>

      <dl className="tp__meta">
        <div><dt>Email</dt><dd><Icon name="mail" /><a href={`mailto:${p.email}`}><span>{p.email}</span></a></dd></div>
        <div><dt>Local time</dt><dd><Icon name={day ? 'sun' : 'moon'} /><span><b>{localTime(p.tz, me.tz)} · {p.city}</b></span></dd></div>
      </dl>

      <div className="prof__stats">
        <div className={`prof__ring mload--${level}`}>
          <Ring value={Math.min(1, load / 100)} size={92} stroke={9} color="var(--lv)" track="var(--well)" />
          <span className="prof__ringval"><b className="num">{load}%</b><small>load</small></span>
        </div>
        <div className="prof__nums">
          <div><small>Workload</small><b className="num">{hours}h <span>of {p.capacity}h</span></b></div>
          <div><small>Focus this week</small><b className="num">{focusWeek.toFixed(1)}h</b></div>
          <div><small>Open tasks</small><b className="num">{tasks.length}</b></div>
        </div>
      </div>

      <section className="tp__block">
        <header><h3>Open tasks</h3><span className="badge num">{tasks.length}</span></header>
        {tasks.length === 0 ? <p className="prof__none"><Icon name="check" /> Nothing open</p> : (
          <ul className="prof__list">
            {tasks.slice(0, 6).map(t => {
              const pr = project(t.project)
              return (
                <li key={t.id}>
                  <button className="prof__row" onClick={() => openDrawer({ kind: 'task', id: t.id })}>
                    <span className="picon" data-hue={pr.hue}><Icon name={pr.icon} /></span>
                    <span className="prof__rowtext">
                      <b>{t.title}</b>
                      <small className={(!!t.due && t.due < today) ? 'is-late' : ''}>{relDue(t.due)} · {pr.name}</small>
                    </span>
                    <Prio v={t.priority} hideLow />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="tp__block">
        <header><h3>This week</h3><span className="badge num">{week.length}</span></header>
        {week.length === 0 ? <p className="prof__none"><Icon name="calendar" /> Nothing scheduled</p> : (
          <ul className="prof__list">
            {week.slice(0, 5).map(e => (
              <li key={e.id}>
                <button className="prof__row" onClick={() => openDrawer({ kind: 'event', id: e.id })}>
                  <span className="prof__day" data-hue={e.hue}><small>{weekday(e.date)}</small><b>{parse(e.date).getDate()}</b></span>
                  <span className="prof__rowtext">
                    <b>{e.title}</b>
                    <small>{relDue(e.date)} · {fmtTime(e.start)}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="tp__block">
        <header><h3>Projects</h3><span className="badge num">{projects.length}</span></header>
        {projects.length === 0 ? <p className="prof__none"><Icon name="folder" /> No projects yet</p> : (
          <ul className="prof__list">
            {projects.map(x => (
              <li key={x.id}>
                <button className="prof__row" onClick={() => { onClose(); go(`projects/${x.id}`) }}>
                  <span className="picon" data-hue={x.hue}><Icon name={x.icon} /></span>
                  <span className="prof__rowtext"><b>{x.name}</b><small>{x.lead === p.id ? 'Lead' : 'Member'}</small></span>
                  <Icon name="right" size={18} className="prof__chev" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="tp__foot">
        {p.id !== me.id ? (
          <>
            <button className="btn btn--primary" onClick={() => notify(`Message sent to ${first}`, 'ok')}><Icon name="comment" /> Message {first}</button>
            <a className="btn btn--glass" href={`mailto:${p.email}`}><Icon name="mail" /> Email</a>
          </>
        ) : (
          <button className="btn btn--glass" onClick={() => { onClose(); go('settings') }}><Icon name="gear" /> Edit profile</button>
        )}
      </footer>
    </div>
  )
}

/* ======================= Motion ======================= */

const EXPO_OUT = 'cubic-bezier(.16, 1, .3, 1)'
const POWER3_OUT = 'cubic-bezier(.215, .61, .355, 1)'
const POWER2_IN = 'cubic-bezier(.55, .085, .68, .53)'

/** A clip-path inset that hides `t` of the element around its centre (t=0 shows it all, grown by `n`px). */
function clipInset(el: HTMLElement, t: number, n = 0) {
  const w = el.offsetWidth
  const h = el.offsetHeight
  const r = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0
  const x = (w / 2) * t - n
  const y = (h / 2) * t - n
  return `inset(${y}px ${x}px ${y}px ${x}px round ${Math.max(0, Math.min(r + n, Math.min(w, h) / 2))}px)`
}

/**
 * Opening: the sheet unfolds from its centre (clip-path) while it slides in
 * and settles from 97% scale; then its contents rise in one after another.
 * Closing: it folds back towards the centre and slides away.
 */
function useSheetMotion(ref: React.RefObject<HTMLElement | null>, leaving: boolean, kind: 'modal' | 'drawer') {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const phone = matchMedia('(max-width: 760px)').matches
    const from = phone ? 'translateY(120px)' : kind === 'drawer' ? 'translateX(70px)' : 'translateY(30px)'
    el.animate(
      [{ transform: `${from} scale(.97)`, clipPath: clipInset(el, 0.5) }, { transform: 'none', clipPath: clipInset(el, 0, 60) }],
      { duration: 850, easing: EXPO_OUT },
    )
    const kids = kind === 'drawer'
      ? el.querySelectorAll<HTMLElement>('.drawer__body > *, .prof > *')
      : el.querySelectorAll<HTMLElement>('.field, .shortcuts li')
    const [y, stagger, delay] = kind === 'drawer' ? [14, 50, 80] : [10, 35, 100]
    Array.from(kids).filter(k => !k.classList.contains('prof')).forEach((k, i) => {
      k.animate([{ opacity: 0, transform: `translateY(${y}px)` }, { opacity: 1, transform: 'none' }], {
        duration: 550, easing: POWER3_OUT, delay: delay + i * stagger, fill: 'backwards',
      })
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = ref.current
    if (!leaving || !el || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const phone = matchMedia('(max-width: 760px)').matches
    const to = phone ? 'translateY(80px)' : kind === 'drawer' ? 'translateX(48px)' : 'translateY(16px)'
    el.animate(
      [{ transform: 'none', clipPath: clipInset(el, 0, 60), opacity: 1 }, { transform: `${to} scale(.97)`, clipPath: clipInset(el, 0.1), opacity: 0 }],
      { duration: 240, easing: POWER2_IN, fill: 'forwards' },
    )
  }, [leaving]) // eslint-disable-line react-hooks/exhaustive-deps
}
