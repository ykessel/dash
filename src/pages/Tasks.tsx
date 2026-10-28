import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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

/* ---------------- Board ----------------
   Pointer-driven drag and drop. The picked card is lifted into a fixed layer
   above the page and follows the pointer with a little tilt; a dashed slot
   marks where it will land and the other cards glide out of the way (FLIP).
   On release the card flies into its slot and settles. */

interface DragView {
  id: string
  col: Status
  index: number
  h: number
}

interface Session {
  id: string
  pointerId: number
  mouse: boolean
  x0: number
  y0: number
  x: number
  y: number
  offX: number
  offY: number
  left: number
  top: number
  width: number
  h: number
  on: boolean
  col0: Status
  index0: number
  col: Status
  index: number
  rot: number
  vx: number
  lastX: number
  lastT: number
  raf: number
  hold?: number
  landing: boolean
  cleanup?: () => void
  press?: Animation
}

const clamp = (min: number, max: number, v: number) => Math.max(min, Math.min(max, v))
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const SPRING = 'cubic-bezier(.34, 1.56, .64, 1)'

function Board({ tasks }: { tasks: Task[] }) {
  const { moveTask, openModal, openDrawer, notify } = useStore()
  const [drag, setDrag] = useState<DragView | null>(null)
  const [landed, setLanded] = useState<string | null>(null)
  const [showAllDone, setShowAllDone] = useState(false)
  const boardRef = useRef<HTMLDivElement>(null)
  const floatRef = useRef<HTMLDivElement>(null)
  const liftRef = useRef<HTMLDivElement>(null)
  const ses = useRef<Session | null>(null)
  const flipRects = useRef<Map<string, DOMRect> | null>(null)
  const clickBlock = useRef(0)
  // Cards that were dropped skip the entrance animation for good, so it never replays.
  const settled = useRef(new Set<string>())

  const byCol = (s: Status, without?: string) =>
    tasks.filter(t => t.status === s && t.id !== without).sort((a, b) => a.order - b.order)

  /* ----- FLIP: remember where every card is, then animate from there after React moves them ----- */
  const snapshot = () => {
    const m = new Map<string, DOMRect>()
    boardRef.current?.querySelectorAll<HTMLElement>('[data-card]').forEach(el => m.set(el.dataset.card!, el.getBoundingClientRect()))
    flipRects.current = m
  }
  useLayoutEffect(() => {
    const prev = flipRects.current
    flipRects.current = null
    if (!prev || reduceMotion()) return
    boardRef.current?.querySelectorAll<HTMLElement>('[data-card]').forEach(el => {
      const r0 = prev.get(el.dataset.card!)
      if (!r0) return
      const r1 = el.getBoundingClientRect()
      const dx = r0.left - r1.left
      const dy = r0.top - r1.top
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2, .9, .25, 1.08)' })
    })
  }, [drag?.col, drag?.index])

  /* ----- hit testing: which column, and where in it ----- */
  const target = (s: Session): { col: Status; index: number } => {
    const board = boardRef.current
    if (!board) return { col: s.col, index: s.index }
    const cols = Array.from(board.querySelectorAll<HTMLElement>('[data-col]'))
    let best = cols[0]
    let bestD = Infinity
    for (const c of cols) {
      const r = c.getBoundingClientRect()
      const d = s.x < r.left ? r.left - s.x : s.x > r.right ? s.x - r.right : 0
      if (d < bestD) { bestD = d; best = c }
    }
    const col = best.dataset.col as Status
    const list = best.querySelector<HTMLElement>('.col__body')!
    const lr = list.getBoundingClientRect()
    const cy = s.y - s.offY + s.h / 2
    let index = 0
    list.querySelectorAll<HTMLElement>('[data-card]').forEach(el => {
      // offsetTop ignores the FLIP transforms, so the target doesn't jitter
      if (lr.top + el.offsetTop + el.offsetHeight / 2 < cy) index++
    })
    return { col, index }
  }

  /* ----- per-frame: follow the pointer, tilt with velocity, auto-scroll, retarget ----- */
  const frame = () => {
    const s = ses.current
    if (!s || !s.on || s.landing) return
    const now = performance.now()
    const dt = Math.max(1, now - s.lastT)
    s.vx = s.vx * 0.75 + ((s.x - s.lastX) / dt) * 0.25
    s.lastX = s.x
    s.lastT = now
    const want = reduceMotion() ? 0 : clamp(-9, 9, 2.5 + s.vx * 7)
    s.rot += (want - s.rot) * 0.18
    const el = floatRef.current
    if (el) el.style.transform = `translate3d(${s.x - s.offX - s.left}px, ${s.y - s.offY - s.top}px, 0) rotate(${s.rot.toFixed(2)}deg)`

    // Auto-scroll near the edges of the window, and sideways on a scrolling board.
    const edge = 70
    if (s.y < edge) window.scrollBy(0, -Math.ceil((edge - s.y) / 5))
    else if (s.y > innerHeight - edge) window.scrollBy(0, Math.ceil((s.y - innerHeight + edge) / 5))
    const board = boardRef.current
    if (board && board.scrollWidth > board.clientWidth) {
      const br = board.getBoundingClientRect()
      if (s.x < br.left + edge) board.scrollLeft -= Math.ceil((br.left + edge - s.x) / 4)
      else if (s.x > br.right - edge) board.scrollLeft += Math.ceil((s.x - br.right + edge) / 4)
    }

    const t = target(s)
    if (t.col !== s.col || t.index !== s.index) {
      s.col = t.col
      s.index = t.index
      snapshot()
      setDrag(d => (d ? { ...d, col: t.col, index: t.index } : d))
    }
    s.raf = requestAnimationFrame(frame)
  }

  /* ----- lift ----- */
  const lift = () => {
    const s = ses.current
    if (!s || s.on) return
    const el = boardRef.current?.querySelector<HTMLElement>(`[data-card="${s.id}"]`)
    if (!el) return
    const r = el.getBoundingClientRect()
    const list = Array.from(el.parentElement!.querySelectorAll<HTMLElement>('[data-card]'))
    Object.assign(s, {
      on: true, left: r.left, top: r.top, width: r.width, h: r.height,
      offX: s.x0 - r.left, offY: s.y0 - r.top, index: list.indexOf(el), index0: list.indexOf(el), rot: 0,
    })
    el.getAnimations().forEach(a => a.cancel())
    document.documentElement.classList.add('is-card-dragging')
    if (!s.mouse) navigator.vibrate?.(8)
    setDrag({ id: s.id, col: s.col, index: s.index, h: r.height })
    s.raf = requestAnimationFrame(frame)
  }

  // Once the floating card exists, pop it up.
  useLayoutEffect(() => {
    if (!drag || reduceMotion()) return
    const s = ses.current
    liftRef.current?.animate([{ transform: `scale(${s?.mouse ? 1 : 0.975})` }, { transform: 'scale(1.045)' }], { duration: 500, easing: SPRING, fill: 'forwards' })
  }, [drag?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ----- drop / cancel ----- */
  const finish = (cancel: boolean) => {
    const s = ses.current
    if (!s) return
    window.clearTimeout(s.hold)
    ;(s.cleanup ?? removeListeners)()
    s.press?.cancel()
    if (!s.on) { ses.current = null; return }
    clickBlock.current = Date.now()
    s.landing = true
    cancelAnimationFrame(s.raf)
    document.documentElement.classList.remove('is-card-dragging')
    if (cancel && (s.col !== s.col0 || s.index !== s.index0)) {
      s.col = s.col0
      s.index = s.index0
      snapshot()
      setDrag(d => (d ? { ...d, col: s.col0, index: s.index0 } : d))
    }
    // Wait a frame so the slot is in its final place, then fly the card into it.
    requestAnimationFrame(() => requestAnimationFrame(() => land(s, cancel)))
  }

  const land = (s: Session, cancel: boolean) => {
    const slot = boardRef.current?.querySelector<HTMLElement>('.tslot')
    const el = floatRef.current
    const commit = () => {
      const t = tasks.find(x => x.id === s.id)
      if (!cancel && t && (s.col !== s.col0 || s.index !== s.index0)) {
        const rest = byCol(s.col, s.id)
        moveTask(s.id, s.col, rest[s.index]?.id ?? null)
        if (s.col !== s.col0) notify(s.col === 'done' ? `“${t.title}” done` : `Moved to ${STATUS_LABEL[s.col]}`, s.col === 'done' ? 'ok' : 'info')
        if (s.col === 'done') {
          setLanded(s.id)
          window.setTimeout(() => setLanded(l => (l === s.id ? null : l)), 900)
        }
      }
      settled.current.add(s.id)
      ses.current = null
      setDrag(null)
    }
    if (!slot || !el || reduceMotion()) { commit(); return }
    const r = slot.getBoundingClientRect()
    const from = el.style.transform
    const to = `translate3d(${r.left - s.left}px, ${r.top - s.top}px, 0) rotate(0deg)`
    liftRef.current?.animate([{ transform: 'scale(1.045)' }, { transform: 'scale(1)' }], { duration: 380, easing: 'cubic-bezier(.2, .8, .2, 1)', fill: 'forwards' })
    const anim = el.animate([{ transform: from }, { transform: to }], { duration: 380, easing: 'cubic-bezier(.2, .8, .2, 1)', fill: 'forwards' })
    el.classList.add('is-landing')
    anim.onfinish = commit
    anim.oncancel = commit
  }

  /* ----- pointer plumbing ----- */
  const onMove = (e: PointerEvent) => {
    const s = ses.current
    if (!s || e.pointerId !== s.pointerId) return
    s.x = e.clientX
    s.y = e.clientY
    if (!s.on) {
      const d = Math.hypot(s.x - s.x0, s.y - s.y0)
      if (s.mouse && d > 5) lift()
      else if (!s.mouse && d > 10) finish(true) // a touch that moves before the hold is a scroll
    }
  }
  const onUp = (e: PointerEvent) => { if (ses.current && e.pointerId === ses.current.pointerId) finish(false) }
  const onCancel = () => finish(true)
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && ses.current?.on) { e.stopPropagation(); finish(true) } }
  const onTouchMove = (e: TouchEvent) => { if (ses.current?.on && e.cancelable) e.preventDefault() }
  const removeListeners = () => {
    removeEventListener('pointermove', onMove)
    removeEventListener('pointerup', onUp)
    removeEventListener('pointercancel', onCancel)
    removeEventListener('keydown', onKey, true)
    document.removeEventListener('touchmove', onTouchMove)
  }
  useEffect(() => () => {
    ses.current?.cleanup?.()
    cancelAnimationFrame(ses.current?.raf ?? 0)
    document.documentElement.classList.remove('is-card-dragging')
  }, [])

  const onPointerDown = (e: React.PointerEvent, t: Task) => {
    if (ses.current || (e.pointerType === 'mouse' && e.button !== 0)) return
    if ((e.target as HTMLElement).closest('button, a, input')) return
    const mouse = e.pointerType === 'mouse'
    ses.current = {
      id: t.id, pointerId: e.pointerId, mouse, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY,
      offX: 0, offY: 0, left: 0, top: 0, width: 0, h: 0, on: false, col0: t.status, index0: 0, col: t.status, index: 0,
      rot: 0, vx: 0, lastX: e.clientX, lastT: performance.now(), raf: 0, landing: false, cleanup: removeListeners,
    }
    if (!mouse) {
      // Touch events keep targeting the card node even after React moves it
      // out of the list, so block scrolling on that node once it is lifted.
      const node = e.currentTarget as HTMLElement
      node.addEventListener('touchmove', onTouchMove, { passive: false })
      const prev = removeListeners
      ses.current.cleanup = () => { prev(); node.removeEventListener('touchmove', onTouchMove) }
      // Touch: press and hold to pick a card up.
      ses.current.hold = window.setTimeout(lift, 280)
      ses.current.press = node.animate([{ transform: 'scale(1)' }, { transform: 'scale(.975)' }], { duration: 280, easing: 'ease-out', fill: 'forwards' })
    }
    addEventListener('pointermove', onMove, { passive: true })
    addEventListener('pointerup', onUp)
    addEventListener('pointercancel', onCancel)
    addEventListener('keydown', onKey, true)
    document.addEventListener('touchmove', onTouchMove, { passive: false })
  }

  const open = (id: string) => {
    if (Date.now() - clickBlock.current < 250) return
    openDrawer({ kind: 'task', id })
  }

  const dragged = drag ? tasks.find(t => t.id === drag.id) : undefined

  return (
    <div className={`board ${drag ? 'is-dragging' : ''}`} ref={boardRef}>
      {COLS.map((s, ci) => {
        const all = byCol(s, drag?.id)
        // Counts stay put while dragging and only change once the card is dropped.
        const total = tasks.filter(t => t.status === s).length
        const cap = s === 'done' && !showAllDone ? 8 : Infinity
        const list = all.slice(0, Math.max(cap, drag && drag.col === s ? drag.index : 0))
        const items: React.ReactNode[] = list.map(t => (
          <Card
            key={t.id}
            t={t}
            landed={landed === t.id}
            settled={settled.current.has(t.id)}
            onPointerDown={e => onPointerDown(e, t)}
            onOpen={() => open(t.id)}
          />
        ))
        if (drag && drag.col === s) {
          items.splice(Math.min(drag.index, items.length), 0, <div key={`slot-${s}`} className="tslot" style={{ height: drag.h }} aria-hidden="true" />)
        }
        return (
          <section
            key={s}
            data-col={s}
            className={`col glass glass--chrome rise ${drag?.col === s ? 'is-over' : ''}`}
            style={{ ['--i' as string]: ci + 2 }}
            aria-label={STATUS_LABEL[s]}
          >
            <header className="col__head">
              <span className={`col__dot col__dot--${s}`} data-hue={COL_HUE[s]} />
              <h2>{STATUS_LABEL[s]}</h2>
              <span className="count num" key={total}>{total}</span>
              <button className="col__add" aria-label={`Add to ${STATUS_LABEL[s]}`} onClick={() => openModal({ kind: 'task', preset: { status: s } })}><Icon name="plus" size={18} /></button>
            </header>
            <div className="col__body">
              {items}
              {all.length === 0 && !(drag && drag.col === s) && <p className="empty col__empty">Drop tasks here</p>}
            </div>
            {s === 'done' && all.length > 8 && (
              <button className="link col__more" onClick={() => setShowAllDone(v => !v)}>{showAllDone ? 'Show less' : `Show all ${all.length}`}</button>
            )}
          </section>
        )
      })}
      {drag && dragged && ses.current && createPortal(
        <div className="tk-layer" aria-hidden="true">
          <div
            ref={floatRef}
            className="tk-float"
            style={{ left: ses.current.left, top: ses.current.top, width: ses.current.width }}
          >
            <div ref={liftRef} className="tk-float__lift">
              <Card t={dragged} lifted />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

function Card({ t, landed, settled, lifted, onPointerDown, onOpen }: {
  t: Task
  landed?: boolean
  settled?: boolean
  lifted?: boolean
  onPointerDown?: (e: React.PointerEvent) => void
  onOpen?: () => void
}) {
  const { project, person, toggleDone } = useStore()
  const p = project(t.project)
  const a = person(t.assignee)
  const subs = t.subtasks.length
  const doneSubs = t.subtasks.filter(s => s.done).length
  const done = t.status === 'done'
  const isToday = !done && t.due <= todayIso()
  return (
    <article
      className={`tcard ${lifted ? 'is-lifted' : ''} ${landed ? 'is-landed' : ''} ${settled ? 'is-settled' : ''}`}
      data-card={lifted ? undefined : t.id}
      onPointerDown={onPointerDown}
      onClick={onOpen}
      tabIndex={lifted ? -1 : 0}
      onKeyDown={e => e.key === 'Enter' && onOpen?.()}
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
