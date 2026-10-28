import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { buildSeed, DATA_VERSION } from './data/seed'
import type { CalEvent, Data, Look, Person, Project, Status, Task } from './data/types'
import { todayIso } from './lib/date'

const DATA_KEY = 'pane-demo:data'
const LOOK_KEY = 'pane-demo:look'

function loadData(): Data {
  try {
    const raw = localStorage.getItem(DATA_KEY)
    if (raw) {
      const d = JSON.parse(raw) as Data
      if (d.version === DATA_VERSION) return d
    }
  } catch { /* storage unavailable */ }
  return buildSeed()
}

const DEFAULT_LOOK: Look = { theme: 'dark', wall: 'ash', accent: 'blue', glass: 'tinted', solid: false }

function loadLook(): Look {
  try {
    return { ...DEFAULT_LOOK, ...JSON.parse(localStorage.getItem(LOOK_KEY) || '{}') }
  } catch {
    return DEFAULT_LOOK
  }
}

export type Drawer = { kind: 'task' | 'event' | 'person'; id: string } | null
export type Modal =
  | { kind: 'task'; preset?: Partial<Task> }
  | { kind: 'event'; preset?: Partial<CalEvent> }
  | { kind: 'project' }
  | { kind: 'invite' }
  | { kind: 'shortcuts' }
  | null

export interface Note {
  id: number
  text: string
  tone: 'ok' | 'info' | 'warn'
  undo?: () => void
}

export interface FocusState {
  label: string
  taskId?: string
  total: number // seconds
  left: number // seconds
  paused: boolean
}

interface Store {
  data: Data
  me: Person
  look: Look
  setLook: (p: Partial<Look>) => void
  person: (id: string) => Person
  project: (id: string) => Project
  // tasks
  addTask: (t: Omit<Task, 'id' | 'order' | 'subtasks' | 'comments'>) => Task
  updateTask: (id: string, p: Partial<Task>) => void
  moveTask: (id: string, status: Status, beforeId?: string | null) => void
  toggleDone: (id: string) => void
  removeTask: (id: string) => void
  // events / projects / people
  addEvent: (e: Omit<CalEvent, 'id'>) => void
  removeEvent: (id: string) => void
  addProject: (p: Pick<Project, 'name' | 'desc' | 'hue' | 'icon' | 'due' | 'status'>) => Project
  updateProject: (id: string, p: Partial<Project>) => void
  invite: (name: string, email: string, team: Person['team'], role: string) => void
  markAllRead: () => void
  setPrefs: (p: Partial<Data['prefs']>) => void
  resetDemo: () => void
  // ui
  drawer: Drawer
  openDrawer: (d: Drawer) => void
  modal: Modal
  openModal: (m: Modal) => void
  finder: boolean
  setFinder: (v: boolean) => void
  note: Note | null
  notify: (text: string, tone?: Note['tone'], undo?: () => void) => void
  focus: FocusState | null
  startFocus: (minutes?: number, label?: string, taskId?: string) => void
  pauseFocus: () => void
  stopFocus: () => void
  extendFocus: (min: number) => void
}

const Ctx = createContext<Store | null>(null)

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore outside provider')
  return s
}

let uid = Date.now() % 100000
const nextId = (p: string) => `${p}${(uid++).toString(36)}`

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Data>(loadData)
  const [look, setLookState] = useState<Look>(loadLook)
  const [drawer, openDrawer] = useState<Drawer>(null)
  const [modal, openModal] = useState<Modal>(null)
  const [finder, setFinder] = useState(false)
  const [note, setNote] = useState<Note | null>(null)
  const [focus, setFocus] = useState<FocusState | null>(null)
  const noteTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    try { localStorage.setItem(DATA_KEY, JSON.stringify(data)) } catch { /* ignore */ }
  }, [data])

  // Apply the look to <html> and keep "system" in sync with the OS.
  useEffect(() => {
    try { localStorage.setItem(LOOK_KEY, JSON.stringify(look)) } catch { /* ignore */ }
    const root = document.documentElement
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      root.dataset.theme = look.theme === 'system' ? (mq.matches ? 'dark' : 'light') : look.theme
      root.dataset.wall = look.wall
      root.dataset.accent = look.accent
      root.dataset.glass = look.glass
      root.classList.toggle('is-solid', look.solid)
      const meta = document.querySelector('meta[name=theme-color]')
      meta?.setAttribute('content', root.dataset.theme === 'dark' ? '#0a0a0c' : '#e4e9f4')
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [look])

  const setLook = useCallback((p: Partial<Look>) => setLookState(l => ({ ...l, ...p })), [])

  const notify = useCallback((text: string, tone: Note['tone'] = 'ok', undo?: () => void) => {
    window.clearTimeout(noteTimer.current)
    setNote({ id: Date.now(), text, tone, undo })
    noteTimer.current = window.setTimeout(() => setNote(null), undo ? 4200 : 3000)
  }, [])

  // Focus timer tick
  useEffect(() => {
    if (!focus || focus.paused) return
    const t = window.setInterval(() => {
      setFocus(f => (f && !f.paused ? { ...f, left: f.left - 1 } : f))
    }, 1000)
    return () => window.clearInterval(t)
  }, [focus?.paused, focus === null]) // eslint-disable-line react-hooks/exhaustive-deps

  const logFocus = useCallback((seconds: number) => {
    const minutes = Math.round(seconds / 60)
    if (minutes < 1) return
    setData(d => {
      const day = todayIso()
      const has = d.focus.find(f => f.date === day)
      const focusLog = has
        ? d.focus.map(f => (f.date === day ? { ...f, minutes: f.minutes + minutes } : f))
        : [...d.focus, { date: day, minutes }]
      return { ...d, focus: focusLog }
    })
  }, [])

  useEffect(() => {
    if (focus && focus.left <= 0) {
      logFocus(focus.total)
      setFocus(null)
      notify(`Focus session done — take a ${data.prefs.pause}-minute break`, 'ok')
    }
  }, [focus, logFocus, notify, data.prefs.pause])

  const startFocus = useCallback((minutes?: number, label?: string, taskId?: string) => {
    const m = minutes ?? data.prefs.session
    setFocus({ label: label || `${m}-minute block`, taskId, total: m * 60, left: m * 60, paused: false })
  }, [data.prefs.session])

  const pauseFocus = useCallback(() => setFocus(f => (f ? { ...f, paused: !f.paused } : f)), [])
  const stopFocus = useCallback(() => {
    setFocus(f => {
      if (f) logFocus(f.total - f.left)
      return null
    })
    notify('Focus ended', 'info')
  }, [logFocus, notify])
  const extendFocus = useCallback((min: number) => setFocus(f => (f ? { ...f, left: f.left + min * 60, total: f.total + min * 60 } : f)), [])

  const person = useCallback((id: string) => data.people.find(p => p.id === id) ?? data.people[0], [data.people])
  const project = useCallback((id: string) => data.projects.find(p => p.id === id) ?? data.projects[0], [data.projects])

  const updateTask = useCallback((id: string, p: Partial<Task>) => {
    setData(d => ({ ...d, tasks: d.tasks.map(t => (t.id === id ? { ...t, ...p } : t)) }))
  }, [])

  const addTask: Store['addTask'] = useCallback(t => {
    const task: Task = { ...t, id: nextId('t'), order: -Date.now(), subtasks: [], comments: [], doneAt: t.status === 'done' ? todayIso() : undefined }
    setData(d => ({ ...d, tasks: [task, ...d.tasks] }))
    return task
  }, [])

  const moveTask = useCallback((id: string, status: Status, beforeId?: string | null) => {
    setData(d => {
      const col = d.tasks.filter(t => t.status === status && t.id !== id).sort((a, b) => a.order - b.order)
      let order: number
      if (beforeId) {
        const i = col.findIndex(t => t.id === beforeId)
        const prev = col[i - 1]?.order ?? (col[i]?.order ?? 0) - 2
        order = ((prev + (col[i]?.order ?? prev + 2)) / 2)
      } else {
        order = (col[col.length - 1]?.order ?? 0) + 1
      }
      return {
        ...d,
        tasks: d.tasks.map(t =>
          t.id === id ? { ...t, status, order, doneAt: status === 'done' ? t.doneAt ?? todayIso() : undefined } : t,
        ),
      }
    })
  }, [])

  const toggleDone = useCallback((id: string) => {
    let before: Task | undefined
    setData(d => {
      before = d.tasks.find(t => t.id === id)
      return {
        ...d,
        tasks: d.tasks.map(t =>
          t.id === id
            ? t.status === 'done'
              ? { ...t, status: 'todo', doneAt: undefined }
              : { ...t, status: 'done', doneAt: todayIso() }
            : t,
        ),
      }
    })
    queueMicrotask(() => {
      if (before && before.status !== 'done') {
        const prev = before
        notify(`“${prev.title}” done`, 'ok', () => updateTask(prev.id, { status: prev.status, doneAt: undefined }))
      }
    })
  }, [notify, updateTask])

  const removeTask = useCallback((id: string) => {
    let removed: Task | undefined
    setData(d => {
      removed = d.tasks.find(t => t.id === id)
      return { ...d, tasks: d.tasks.filter(t => t.id !== id) }
    })
    queueMicrotask(() => {
      if (removed) {
        const r = removed
        notify('Task deleted', 'warn', () => setData(d => ({ ...d, tasks: [r, ...d.tasks] })))
      }
    })
  }, [notify])

  const addEvent = useCallback((e: Omit<CalEvent, 'id'>) => {
    setData(d => ({ ...d, events: [...d.events, { ...e, id: nextId('e') }] }))
  }, [])

  const removeEvent = useCallback((id: string) => {
    let removed: CalEvent | undefined
    setData(d => {
      removed = d.events.find(e => e.id === id)
      return { ...d, events: d.events.filter(e => e.id !== id) }
    })
    queueMicrotask(() => {
      if (removed) {
        const r = removed
        notify('Event removed', 'warn', () => setData(d => ({ ...d, events: [...d.events, r] })))
      }
    })
  }, [notify])

  const addProject: Store['addProject'] = useCallback(p => {
    const proj: Project = {
      ...p, id: nextId('p'), start: todayIso(), lead: data.me, members: [data.me], pinned: false, starred: false,
      milestones: [{ id: 'm1', title: 'Kickoff', due: p.due, done: false }],
    }
    setData(d => ({ ...d, projects: [...d.projects, proj] }))
    return proj
  }, [data.me])

  const updateProject = useCallback((id: string, p: Partial<Project>) => {
    setData(d => ({ ...d, projects: d.projects.map(x => (x.id === id ? { ...x, ...p } : x)) }))
  }, [])

  const invite = useCallback((name: string, email: string, team: Person['team'], role: string) => {
    const p: Person = {
      id: nextId('u'), name, email, team, role, city: 'London', tz: 'Europe/London', presence: 'away', capacity: 32, skin: Math.floor(Math.random() * 6),
    }
    setData(d => ({ ...d, people: [...d.people, p] }))
  }, [])

  const markAllRead = useCallback(() => setData(d => ({ ...d, notices: d.notices.map(n => ({ ...n, read: true })) })), [])
  const setPrefs = useCallback((p: Partial<Data['prefs']>) => setData(d => ({ ...d, prefs: { ...d.prefs, ...p } })), [])
  const resetDemo = useCallback(() => {
    setData(buildSeed())
    setFocus(null)
    openDrawer(null)
    notify('Demo data reset', 'info')
  }, [notify])

  const me = useMemo(() => data.people.find(p => p.id === data.me)!, [data.people, data.me])

  const value: Store = {
    data, me, look, setLook, person, project,
    addTask, updateTask, moveTask, toggleDone, removeTask,
    addEvent, removeEvent, addProject, updateProject, invite, markAllRead, setPrefs, resetDemo,
    drawer, openDrawer, modal, openModal, finder, setFinder, note, notify,
    focus, startFocus, pauseFocus, stopFocus, extendFocus,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
