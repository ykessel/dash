import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api, ApiError, API_URL, onSignedOut, refresh, setToken, type PublicUser } from './api/client'
import { applyEvent } from './api/live'
import { PendingIds, replaceById } from './api/pending'
import { mergeWorkspaces, pickWorkspace, toAuthResult, type AuthResult, type WorkspaceRef } from './api/session'
import { connectLive } from './api/socket'
import { DATA_VERSION } from './data/seed'
import type { CalEvent, Comment, Data, Look, Notice, Permission, Person, Project, ProjectRole, Status, Task, TimePeriod, TimeReport, TimesheetData, Worklog } from './data/types'
import { can as canIn, canOnTask } from './lib/access'
import { todayIso } from './lib/date'

export type { AuthResult } from './api/session'

/* Only UI conveniences live in the browser; the team's data comes from the API. */
const LOOK_KEY = 'pane:look'
const LAST_WS_KEY = 'pane:workspace'
const LAST_USER_KEY = 'pane:last-user'

const DEFAULT_LOOK: Look = { theme: 'dark', wall: 'ash', accent: 'blue', glass: 'tinted', solid: false }

const readJson = <T,>(key: string, fallback: T): T => {
  try { return { ...fallback, ...JSON.parse(localStorage.getItem(key) || 'null') } } catch { return fallback }
}
const write = (key: string, value: unknown) => {
  try { localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value)) } catch { /* ignore */ }
}
const readLastWs = () => { try { return localStorage.getItem(LAST_WS_KEY) } catch { return null } }

/** An invite opened while signed out waits here (localStorage, so a magic link in another tab still finds it). */
const INVITE_KEY = 'pane:invite'
export const rememberInvite = (token: string) => write(INVITE_KEY, token)
const takeInvite = () => {
  try {
    const t = localStorage.getItem(INVITE_KEY)
    localStorage.removeItem(INVITE_KEY)
    return t
  } catch {
    return null
  }
}

/** Who an unassigned task (or a member who has left) shows as. */
const NOBODY: Person = {
  id: '', name: 'Unassigned', email: '', role: '', team: 'Product', city: '', tz: 'UTC', presence: 'away', capacity: 0, skin: 0,
}

const EMPTY: Data = {
  version: DATA_VERSION, me: '', people: [], projects: [], tasks: [], events: [], notices: [], focus: [],
  prefs: { notify: { mentions: true, due: true, meetings: true, digest: false, focus: true }, session: 25, pause: 5 },
  roles: [], access: {},
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

/** Who signed in last on this browser, so Sign in can greet them. */
export interface TimeReportQuery {
  from: string
  to: string
  groupBy: 'user' | 'project' | 'task'
  bucket: 'day' | 'week' | 'month' | 'year'
  scope: 'me' | 'team'
  approvedOnly: boolean
}

export interface LastUser { name: string; email: string; skin: number }

type Provider = 'google' | 'github'

interface Store {
  /** Boot finished: we know whether there is a session. */
  ready: boolean
  /** The current workspace's data has arrived. */
  loaded: boolean
  /** Why the workspace couldn't load, if it couldn't. */
  loadError: string | null
  retryLoad: () => void
  data: Data
  me: Person
  look: Look
  setLook: (p: Partial<Look>) => void
  person: (id: string) => Person
  project: (id: string) => Project
  // workspaces
  workspaces: WorkspaceRef[]
  workspaceId: string | null
  switchWorkspace: (id: string) => void
  acceptInvite: (token: string) => Promise<AuthResult>
  // tasks
  addTask: (t: Omit<Task, 'id' | 'order' | 'subtasks' | 'comments' | 'loggedMinutes' | 'remainingMinutes'>) => Task
  updateTask: (id: string, p: Partial<Task>) => void
  moveTask: (id: string, status: Status, beforeId?: string | null) => void
  toggleDone: (id: string) => void
  removeTask: (id: string) => void
  addSubtask: (taskId: string, title: string) => void
  toggleSubtask: (taskId: string, sid: string) => void
  addComment: (taskId: string, text: string, mentions?: string[]) => void
  // events / projects / people
  addEvent: (e: Omit<CalEvent, 'id'>) => void
  removeEvent: (id: string) => void
  addProject: (p: Pick<Project, 'name' | 'desc' | 'hue' | 'icon' | 'due' | 'status'>) => Promise<Project | null>
  updateProject: (id: string, p: Partial<Project>) => void
  /** What I may do in a project, as the server last said; the server still checks every write. */
  can: (projectId: string, p: Permission) => boolean
  canTask: (t: Task, action: 'edit' | 'delete') => boolean
  createRole: (r: { name: string; description?: string; permissions: Permission[] }) => Promise<ProjectRole | null>
  updateRole: (id: string, patch: Partial<Pick<ProjectRole, 'name' | 'description' | 'permissions'>>) => Promise<boolean>
  duplicateRole: (id: string) => Promise<ProjectRole | null>
  removeRole: (id: string) => Promise<boolean>
  setProjectMember: (projectId: string, userId: string, roleId: string) => void
  removeProjectMember: (projectId: string, userId: string) => void
  setDefaultRole: (projectId: string, roleId: string) => void
  // time
  /** Bumps on every worklog or timesheet change I hear about, so open time views refetch. */
  timeTick: number
  logWork: (taskId: string, w: { minutes: number; date: string; comment?: string; remaining?: number }) => Promise<boolean>
  editWorklog: (id: string, patch: { minutes?: number; date?: string; comment?: string }) => Promise<boolean>
  deleteWorklog: (id: string) => Promise<boolean>
  worklogsOf: (taskId: string) => Promise<Worklog[]>
  timesheet: (q: { from: string; to: string; user?: string; project?: string }) => Promise<TimesheetData>
  timeReport: (q: TimeReportQuery) => Promise<TimeReport>
  submitPeriod: (projectId: string, start: string) => Promise<boolean>
  withdrawPeriod: (projectId: string, start: string) => Promise<boolean>
  reviewPeriod: (projectId: string, userId: string, start: string, action: 'approve' | 'reject' | 'reopen', comment?: string) => Promise<boolean>
  invite: (name: string, email: string, team: Person['team'], role: string) => Promise<boolean>
  markAllRead: () => void
  setPrefs: (p: Partial<Data['prefs']>) => void
  // auth
  signedIn: boolean
  lastUser: LastUser | null
  signIn: (email: string, password: string, remember: boolean) => Promise<AuthResult>
  signUp: (f: { name: string; email: string; password: string; team: Person['team']; role: string }) => Promise<AuthResult>
  signInWith: (provider: Provider) => void
  requestMagicLink: (email: string) => Promise<AuthResult>
  forgotPassword: (email: string) => Promise<AuthResult>
  /** Finishes a sign-in that arrived by redirect or email link: verify the token, or just refresh. */
  completeSignIn: (via: { magic?: string; reset?: { token: string; password: string }; verify?: string }) => Promise<AuthResult>
  signOut: () => void
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
const tempId = (p: string) => `tmp-${p}${(uid++).toString(36)}`

const message = (e: unknown) => (e instanceof ApiError ? e.message : 'Can’t reach Pane. Check your connection.')

/** Fields a task PATCH accepts. */
const TASK_FIELDS = ['title', 'project', 'assignee', 'status', 'priority', 'due', 'estimate'] as const
const PROJECT_FIELDS = ['name', 'desc', 'hue', 'icon', 'status', 'start', 'due', 'lead', 'approvalEnabled', 'approvalPeriod'] as const
const pick = <T extends object>(o: T, keys: readonly string[]) =>
  Object.fromEntries(Object.entries(o).filter(([k, v]) => keys.includes(k) && v !== undefined))

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [user, setUser] = useState<PublicUser | null>(null)
  const [workspaces, setWorkspaces] = useState<WorkspaceRef[]>([])
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [data, setData] = useState<Data>(EMPTY)
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [look, setLookState] = useState<Look>(() => readJson(LOOK_KEY, DEFAULT_LOOK))
  const [lastUser, setLastUser] = useState<LastUser | null>(() => {
    const u = readJson<LastUser | null>(LAST_USER_KEY, null)
    return u?.email ? u : null
  })
  const [drawer, openDrawer] = useState<Drawer>(null)
  const [modal, openModal] = useState<Modal>(null)
  const [finder, setFinder] = useState(false)
  const [note, setNote] = useState<Note | null>(null)
  const [focus, setFocus] = useState<FocusState | null>(null)
  const noteTimer = useRef<number | undefined>(undefined)
  const wsRef = useRef<string | null>(null)
  const dataRef = useRef<Data>(EMPTY)
  const focusId = useRef<Promise<string | null> | null>(null)
  /** Team and role typed at sign-up, used for the first workspace. */
  const pendingTeam = useRef<{ team: Person['team']; title: string } | null>(null)

  const [pending] = useState(() => new PendingIds())

  dataRef.current = data
  const ws = () => `/workspaces/${wsRef.current}`
  /** Wraps response handlers so they only run while the workspace that was open at call time still is. */
  const here = () => {
    const id = wsRef.current
    return <A extends unknown[]>(fn: (...a: A) => void) => (...a: A) => { if (wsRef.current === id) fn(...a) }
  }

  const notify = useCallback((text: string, tone: Note['tone'] = 'ok', undo?: () => void) => {
    window.clearTimeout(noteTimer.current)
    setNote({ id: Date.now(), text, tone, undo })
    noteTimer.current = window.setTimeout(() => setNote(null), undo ? 4200 : 3000)
  }, [])

  /* ---- look: applied to <html>, kept locally and in /me/prefs ---- */
  useEffect(() => {
    write(LOOK_KEY, look)
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

  const setLook = useCallback((p: Partial<Look>) => {
    setLookState(l => ({ ...l, ...p }))
    if (user) api('/me/prefs', { method: 'PATCH', body: { look: p } }).catch(() => { /* stays local */ })
  }, [user])

  /* ---- loading a workspace ---- */
  const loadSnapshot = useCallback(async (id: string) => {
    const snap = await api<Data>(`/workspaces/${id}/snapshot`)
    if (wsRef.current === id) {
      setData(snap)
      setLoaded(true)
    }
  }, [])

  /** My permissions changed (a role, a project's people, my workspace access): ask again. */
  const refreshAccess = useCallback((id: string) => {
    api<{ projects: Data['access'] }>(`/workspaces/${id}/access`)
      .then(r => { if (wsRef.current === id) setData(d => ({ ...d, access: r.projects })) })
      .catch(() => { /* the next reconnect re-reads the snapshot */ })
  }, [])

  /** Something went wrong after an optimistic change: say so and take the server's word for it. */
  const resync = useCallback((e: unknown) => {
    notify(message(e), 'warn')
    const id = wsRef.current
    if (id) loadSnapshot(id).catch(() => { /* next event or reload */ })
  }, [notify, loadSnapshot])

  const openWorkspace = useCallback((id: string) => {
    wsRef.current = id
    setWorkspaceId(id)
    write(LAST_WS_KEY, id)
    setLoaded(false)
    setLoadError(null)
    setData(EMPTY)
    openDrawer(null)
    openModal(null)
    loadSnapshot(id).catch(e => { if (wsRef.current === id) setLoadError(message(e)) })
  }, [loadSnapshot])

  const retryLoad = useCallback(() => {
    if (wsRef.current) openWorkspace(wsRef.current)
  }, [openWorkspace])

  /**
   * A session exists: accept an invite that was waiting for sign-in, find (or make) a workspace,
   * then mark the person signed in and open it. Throws if the workspace list can't be had, so
   * the caller stays signed out instead of spinning forever.
   */
  const enter = useCallback(async (u: PublicUser, preferWs?: string) => {
    api<{ look: Partial<Look> }>('/me/prefs').then(p => setLookState(l => ({ ...l, ...p.look }))).catch(() => { /* keep local look */ })
    let joined: WorkspaceRef | null = null
    const invite = takeInvite()
    if (invite) {
      try {
        joined = (await api<{ workspace: WorkspaceRef }>('/invitations/accept', { method: 'POST', body: { token: invite } })).workspace
        notify(`You joined ${joined.name}`, 'ok')
      } catch (e) {
        if (!(e instanceof ApiError && e.code === 'already_member')) notify(message(e), 'warn')
      }
    }
    let list = await api<WorkspaceRef[]>('/me/workspaces')
    if (!list.length) {
      const first = u.name.split(' ')[0] || 'My'
      const made = await api<{ workspace: WorkspaceRef }>('/workspaces', {
        method: 'POST',
        body: { name: `${first}’s team`, team: pendingTeam.current?.team, title: pendingTeam.current?.title },
      })
      list = [made.workspace]
    }
    pendingTeam.current = null
    // Merge, never replace: an accept that finished meanwhile may already have added its team.
    setWorkspaces(have => mergeWorkspaces(have, list))
    setUser(u)
    const last: LastUser = { name: u.name, email: u.email, skin: u.avatarSkin ?? 0 }
    setLastUser(last)
    write(LAST_USER_KEY, last)
    const id = pickWorkspace(list, joined?.id ?? preferWs ?? readLastWs())
    if (id) openWorkspace(id)
  }, [openWorkspace, notify])

  const leave = useCallback(() => {
    setToken(null)
    setUser(null)
    wsRef.current = null
    setWorkspaceId(null)
    setWorkspaces([])
    setData(EMPTY)
    setLoaded(false)
    setLoadError(null)
    setFocus(null)
    openDrawer(null)
    openModal(null)
  }, [])

  // Boot: a refresh cookie, if any, becomes a session.
  useEffect(() => {
    let live = true
    refresh()
      .then(s => (s && live ? enter(s.user) : undefined))
      .catch(e => { setToken(null); if (live) notify(message(e), 'warn') })
      .finally(() => live && setReady(true))
    const off = onSignedOut(() => leave())
    return () => { live = false; off() }
  }, [enter, leave, notify])

  // Live updates for the open workspace; every (re)connect re-reads the snapshot to catch what was missed.
  useEffect(() => {
    if (!user || !workspaceId) return
    return connectLive(
      (type, payload) => {
        if (type === 'workspace.updated') {
          const w = (payload as { workspace?: WorkspaceRef }).workspace
          if (w) setWorkspaces(list => list.map(x => (x.id === w.id ? { id: w.id, name: w.name } : x)))
          return
        }
        const p = payload as { workspaceId?: string; member?: { id?: string } }
        if (p.workspaceId === workspaceId && (type === 'project.access_changed' || type === 'project.created' || (type === 'member.updated' && p.member?.id === user.id))) {
          refreshAccess(workspaceId)
        }
        if (type.startsWith('worklog.') || type === 'timesheet.changed') setTimeTick(n => n + 1)
        setData(d => applyEvent(d, type, payload, workspaceId))
      },
      () => { loadSnapshot(workspaceId).catch(() => { /* try again on next reconnect */ }) },
    )
  }, [user, workspaceId, loadSnapshot, refreshAccess])

  const switchWorkspace = useCallback((id: string) => {
    if (id !== wsRef.current) openWorkspace(id)
  }, [openWorkspace])

  /* ---- focus ---- */
  useEffect(() => {
    if (!focus || focus.paused) return
    const t = window.setInterval(() => {
      setFocus(f => (f && !f.paused ? { ...f, left: f.left - 1 } : f))
    }, 1000)
    return () => window.clearInterval(t)
  }, [focus?.paused, focus === null]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Ends the running focus session on the server and adds it to my log. */
  const logFocus = useCallback((seconds: number) => {
    const pending = focusId.current
    focusId.current = null
    pending?.then(id => id && api(`${ws()}/focus-sessions/${id}`, { method: 'PATCH', body: { actualSec: Math.max(0, Math.round(seconds)) } }))
      .catch(() => { /* the log is best effort */ })
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
    const name = label || `${m}-minute block`
    setFocus({ label: name, taskId, total: m * 60, left: m * 60, paused: false })
    focusId.current = api<{ id: string }>(`${ws()}/focus-sessions`, {
      method: 'POST',
      body: { plannedSec: Math.max(60, m * 60), label: name, taskId: taskId ?? null },
    }).then(s => s.id, () => null)
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

  /* ---- lookups ---- */
  const fallbackMe = useMemo<Person>(() => ({
    id: user?.id ?? '', name: user?.name ?? '', email: user?.email ?? '', role: '', team: 'Product', city: '', tz: 'UTC',
    presence: 'online', capacity: 32, skin: user?.avatarSkin ?? 0,
  }), [user])
  const person = useCallback(
    (id: string) => data.people.find(p => p.id === id) ?? (id && id === user?.id ? fallbackMe : NOBODY),
    [data.people, fallbackMe, user],
  )
  const project = useCallback((id: string) => data.projects.find(p => p.id === id) ?? data.projects[0], [data.projects])
  const me = useMemo(() => data.people.find(p => p.id === data.me) ?? fallbackMe, [data.people, data.me, fallbackMe])

  /**
   * A follow-up call on something that may still carry a temp id: waits for its create, then
   * calls with the real id. The answer only lands if the same workspace is still open.
   */
  const follow = useCallback(<T,>(id: string, call: (base: string, real: string) => Promise<T>, then: (v: T, real: string) => void) => {
    const keep = here()
    const base = ws()
    pending.real(id)
      .then(real => (real ? call(base, real).then(keep((v: T) => then(v, real))) : undefined))
      .catch(keep(resync))
  }, [pending, resync]) // eslint-disable-line react-hooks/exhaustive-deps

  /** When a temp item gets its real id, an open drawer on it follows along. */
  const renamed = (temp: string, real: string) => openDrawer(d => (d && d.id === temp ? { ...d, id: real } : d))

  /* ---- tasks ---- */
  const putTask = useCallback((t: Task, replaceId = t.id) => {
    setData(d => ({ ...d, tasks: replaceById(d.tasks, t, replaceId, 'start') }))
  }, [])

  const addTask: Store['addTask'] = useCallback(t => {
    const temp: Task = {
      ...t, id: tempId('t'), order: -Date.now(), subtasks: [], comments: [], loggedMinutes: 0, remainingMinutes: Math.round(t.estimate * 60),
      doneAt: t.status === 'done' ? todayIso() : undefined,
    }
    setData(d => ({ ...d, tasks: [temp, ...d.tasks] }))
    const keep = here()
    const create = api<Task>(`${ws()}/tasks`, { method: 'POST', body: { ...pick(t, TASK_FIELDS), assignee: t.assignee || null } })
      .then(real => {
        keep(() => { putTask(real, temp.id); renamed(temp.id, real.id) })()
        return real.id
      }, e => {
        keep(resync)(e)
        return null
      })
    pending.track(temp.id, create)
    return temp
  }, [putTask, resync, pending]) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Stops a change the server would refuse anyway, before the optimistic update, and says why.
   * A project I have no permissions for yet (just created, still a temp id) is left to the server.
   */
  const allowed = (projectId: string, ...need: Permission[]) => {
    const mine = dataRef.current.access[projectId]
    if (!mine || need.every(p => mine.includes(p))) return true
    notify('You don’t have permission to do that.', 'warn')
    return false
  }
  /** Edit or delete a task: the `_any` permission, or `_own` on a task assigned to me. */
  const allowedOn = (t: Task, action: 'edit' | 'delete') => {
    if (canOnTask(dataRef.current.access, dataRef.current.me, t, action)) return true
    notify('You don’t have permission to do that.', 'warn')
    return false
  }

  const updateTask = useCallback((id: string, p: Partial<Task>) => {
    const cur = dataRef.current.tasks.find(t => t.id === id)
    if (!cur) return
    if (!allowedOn(cur, 'edit')) return
    if (p.assignee !== undefined && p.assignee !== cur.assignee && !allowed(cur.project, 'tasks.assign')) return
    if (p.status !== undefined && p.status !== cur.status && !allowed(cur.project, 'tasks.transition')) return
    if (p.project !== undefined && p.project !== cur.project && !allowed(p.project, 'tasks.create')) return
    setData(d => ({ ...d, tasks: d.tasks.map(t => (t.id === id ? { ...t, ...p } : t)) }))
    const body = pick(p, TASK_FIELDS)
    if (!Object.keys(body).length) return
    // A task still being created is at version 1 when it lands.
    follow(id, (base, real) => api<Task>(`${base}/tasks/${real}`, { method: 'PATCH', body: { ...body, version: cur.version ?? 1 } }), t => putTask(t))
  }, [follow, putTask])

  const moveTask = useCallback((id: string, status: Status, beforeId?: string | null) => {
    const cur = dataRef.current.tasks.find(t => t.id === id)
    if (cur && !allowed(cur.project, 'tasks.transition')) return
    setData(d => {
      const col = d.tasks.filter(t => t.status === status && t.id !== id).sort((a, b) => a.order - b.order)
      let order: number
      if (beforeId === 'top') {
        order = (col[0]?.order ?? 0) - 1
      } else if (beforeId) {
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
    follow(id, async (base, real) => {
      // A neighbour that is itself still being created is named by its real id too.
      const before = beforeId && beforeId !== 'top' ? await pending.real(beforeId) : beforeId ?? null
      return api<Task>(`${base}/tasks/${real}/move`, { method: 'POST', body: { status, beforeId: before } })
    }, t => putTask(t))
  }, [follow, pending, putTask])

  const toggleDone = useCallback((id: string) => {
    const before = dataRef.current.tasks.find(t => t.id === id)
    if (!before) return
    if (!allowed(before.project, 'tasks.transition')) return
    const to: Status = before.status === 'done' ? 'todo' : 'done'
    moveTask(id, to, 'top')
    if (to === 'done') notify(`Done: ${before.title}`, 'ok', () => moveTask(id, before.status, 'top'))
  }, [moveTask, notify])

  const removeTask = useCallback((id: string) => {
    const removed = dataRef.current.tasks.find(t => t.id === id)
    if (!removed) return
    if (!allowedOn(removed, 'delete')) return
    setData(d => ({ ...d, tasks: d.tasks.filter(t => t.id !== id) }))
    follow(id, (base, real) => api(`${base}/tasks/${real}`, { method: 'DELETE' }), (_, real) => {
      notify('Task deleted', 'warn', () => follow(real, (base, r) => api<Task>(`${base}/tasks/${r}/restore`, { method: 'POST' }), t => putTask(t)))
    })
  }, [follow, notify, putTask])

  const addSubtask = useCallback((taskId: string, title: string) => {
    const cur = dataRef.current.tasks.find(t => t.id === taskId)
    if (cur && !allowedOn(cur, 'edit')) return
    setData(d => ({ ...d, tasks: d.tasks.map(t => (t.id === taskId ? { ...t, subtasks: [...t.subtasks, { id: tempId('s'), title, done: false }] } : t)) }))
    follow(taskId, (base, real) => api<Task>(`${base}/tasks/${real}/subtasks`, { method: 'POST', body: { title } }), t => putTask(t))
  }, [follow, putTask])

  const toggleSubtask = useCallback((taskId: string, sid: string) => {
    const cur = dataRef.current.tasks.find(t => t.id === taskId)
    if (cur && !allowedOn(cur, 'edit')) return
    const sub = cur?.subtasks.find(s => s.id === sid)
    // A subtask still being added has no id the API knows yet.
    if (!sub || sid.startsWith('tmp-')) return
    setData(d => ({ ...d, tasks: d.tasks.map(t => (t.id === taskId ? { ...t, subtasks: t.subtasks.map(s => (s.id === sid ? { ...s, done: !s.done } : s)) } : t)) }))
    follow(taskId, (base, real) => api<Task>(`${base}/tasks/${real}/subtasks/${sid}`, { method: 'PATCH', body: { done: !sub.done } }), t => putTask(t))
  }, [follow, putTask])

  const addComment = useCallback((taskId: string, text: string, mentions: string[] = []) => {
    const cur = dataRef.current.tasks.find(t => t.id === taskId)
    if (cur && !allowed(cur.project, 'comments.add')) return
    const temp: Comment = { id: tempId('c'), who: dataRef.current.me, text, at: Date.now() }
    setData(d => ({ ...d, tasks: d.tasks.map(t => (t.id === taskId ? { ...t, comments: [...t.comments, temp] } : t)) }))
    follow(taskId, (base, real) => api<Comment>(`${base}/tasks/${real}/comments`, { method: 'POST', body: { text, mentions } }), (c, real) => {
      setData(d => ({ ...d, tasks: d.tasks.map(t => (t.id === real ? { ...t, comments: replaceById(t.comments, c, temp.id, 'end') } : t)) }))
    })
  }, [follow])

  /* ---- events ---- */
  const putEvent = useCallback((e: CalEvent, replaceId = e.id) => {
    setData(d => ({ ...d, events: replaceById(d.events, e, replaceId, 'end') }))
  }, [])

  const addEvent = useCallback((e: Omit<CalEvent, 'id'>) => {
    const temp: CalEvent = { ...e, id: tempId('e') }
    setData(d => ({ ...d, events: [...d.events, temp] }))
    const keep = here()
    const create = api<CalEvent>(`${ws()}/events`, { method: 'POST', body: { ...e, project: e.project ?? null } })
      .then(real => {
        keep(() => { putEvent(real, temp.id); renamed(temp.id, real.id) })()
        return real.id
      }, err => {
        keep(resync)(err)
        return null
      })
    pending.track(temp.id, create)
  }, [putEvent, resync, pending]) // eslint-disable-line react-hooks/exhaustive-deps

  const removeEvent = useCallback((id: string) => {
    setData(d => ({ ...d, events: d.events.filter(e => e.id !== id) }))
    follow(id, (base, real) => api(`${base}/events/${real}`, { method: 'DELETE' }), (_, real) => {
      notify('Event removed', 'warn', () => follow(real, (base, r) => api<CalEvent>(`${base}/events/${r}/restore`, { method: 'POST' }), e => putEvent(e)))
    })
  }, [follow, notify, putEvent])

  /* ---- projects ---- */
  const putProject = useCallback((p: Project) => {
    setData(d => ({ ...d, projects: replaceById(d.projects, p, p.id, 'end') }))
  }, [])

  const addProject: Store['addProject'] = useCallback(async p => {
    const keep = here()
    try {
      const real = await api<Project>(`${ws()}/projects`, { method: 'POST', body: p })
      keep(putProject)(real)
      refreshAccess(wsRef.current!)
      return real
    } catch (e) {
      notify(message(e), 'warn')
      return null
    }
  }, [putProject, notify, refreshAccess]) // eslint-disable-line react-hooks/exhaustive-deps

  const updateProject = useCallback((id: string, p: Partial<Project>) => {
    const cur = dataRef.current.projects.find(x => x.id === id)
    if (!cur) return
    if (p.milestones && !allowed(id, 'project.admin')) return
    setData(d => ({ ...d, projects: d.projects.map(x => (x.id === id ? { ...x, ...p } : x)) }))
    const keep = here()
    const base = ws()
    const calls: Promise<unknown>[] = []
    if (p.pinned !== undefined || p.starred !== undefined) {
      calls.push(api(`${base}/projects/${id}/prefs`, { method: 'PUT', body: { pinned: p.pinned, starred: p.starred } }))
    }
    if (p.milestones) {
      for (const m of p.milestones) {
        const was = cur.milestones.find(x => x.id === m.id)
        if (was && was.done !== m.done) calls.push(api(`${base}/projects/${id}/milestones/${m.id}`, { method: 'PATCH', body: { done: m.done } }))
      }
    }
    const fields = pick(p, PROJECT_FIELDS)
    if (Object.keys(fields).length) {
      calls.push(api<Project>(`${base}/projects/${id}`, { method: 'PATCH', body: { ...fields, version: cur.version } }))
    }
    Promise.all(calls)
      .then(keep(() => { if (p.lead !== undefined && p.lead !== cur.lead) refreshAccess(wsRef.current!) }))
      .catch(keep(resync))
  }, [resync]) // eslint-disable-line react-hooks/exhaustive-deps

  const can = useCallback((projectId: string, p: Permission) => canIn(data.access, projectId, p), [data.access])
  const canTask = useCallback((t: Task, action: 'edit' | 'delete') => canOnTask(data.access, data.me, t, action), [data.access, data.me])

  const upsertRole = (r: ProjectRole) =>
    setData(d => ({ ...d, roles: d.roles.some(x => x.id === r.id) ? d.roles.map(x => (x.id === r.id ? r : x)) : [...d.roles, r] }))

  const createRole = useCallback(async (r: { name: string; description?: string; permissions: Permission[] }) => {
    try {
      const role = await api<ProjectRole>(`${ws()}/roles`, { method: 'POST', body: r })
      upsertRole(role)
      return role
    } catch (e) {
      notify(message(e), 'warn')
      return null
    }
  }, [notify]) // eslint-disable-line react-hooks/exhaustive-deps

  const updateRole = useCallback(async (id: string, patch: Partial<Pick<ProjectRole, 'name' | 'description' | 'permissions'>>) => {
    try {
      upsertRole(await api<ProjectRole>(`${ws()}/roles/${id}`, { method: 'PATCH', body: patch }))
      return true
    } catch (e) {
      notify(message(e), 'warn')
      return false
    }
  }, [notify]) // eslint-disable-line react-hooks/exhaustive-deps

  const duplicateRole = useCallback(async (id: string) => {
    try {
      const role = await api<ProjectRole>(`${ws()}/roles/${id}/duplicate`, { method: 'POST' })
      upsertRole(role)
      return role
    } catch (e) {
      notify(message(e), 'warn')
      return null
    }
  }, [notify]) // eslint-disable-line react-hooks/exhaustive-deps

  const removeRole = useCallback(async (id: string) => {
    try {
      await api(`${ws()}/roles/${id}`, { method: 'DELETE' })
      setData(d => ({ ...d, roles: d.roles.filter(r => r.id !== id) }))
      return true
    } catch (e) {
      notify(message(e), 'warn')
      return false
    }
  }, [notify]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Project people: optimistic, then the server's view of the project replaces mine. */
  const projectCall = useCallback((id: string, optimistic: (p: Project) => Project, call: () => Promise<Project>) => {
    setData(d => ({ ...d, projects: d.projects.map(x => (x.id === id ? optimistic(x) : x)) }))
    const keep = here()
    call()
      .then(keep(view => {
        setData(d => ({ ...d, projects: d.projects.map(x => (x.id === id ? { ...view, pinned: x.pinned, starred: x.starred } : x)) }))
        // The server doesn't echo my own access_changed back to this tab.
        refreshAccess(wsRef.current!)
      }))
      .catch(keep(resync))
  }, [resync, refreshAccess]) // eslint-disable-line react-hooks/exhaustive-deps

  const setProjectMember = useCallback((projectId: string, userId: string, roleId: string) => {
    projectCall(projectId,
      p => ({ ...p, members: p.members.includes(userId) ? p.members : [...p.members, userId], roles: { ...p.roles, [userId]: roleId } }),
      () => api<Project>(`${ws()}/projects/${projectId}/members/${userId}`, { method: 'PUT', body: { roleId } }))
  }, [projectCall])

  const removeProjectMember = useCallback((projectId: string, userId: string) => {
    projectCall(projectId,
      p => { const { [userId]: _gone, ...roles } = p.roles; return { ...p, members: p.members.filter(m => m !== userId), roles } },
      () => api<Project>(`${ws()}/projects/${projectId}/members/${userId}`, { method: 'DELETE' }))
  }, [projectCall])

  const setDefaultRole = useCallback((projectId: string, roleId: string) => {
    const cur = dataRef.current.projects.find(x => x.id === projectId)
    if (!cur) return
    projectCall(projectId, p => ({ ...p, defaultRole: roleId }),
      () => api<Project>(`${ws()}/projects/${projectId}`, { method: 'PATCH', body: { defaultRole: roleId, version: cur.version } }))
  }, [projectCall])

  /* ---- time ---- */
  const [timeTick, setTimeTick] = useState(0)
  const setTotals = (t: { id: string; loggedMinutes: number; remainingMinutes: number }) =>
    setData(d => ({ ...d, tasks: d.tasks.map(x => (x.id === t.id ? { ...x, loggedMinutes: t.loggedMinutes, remainingMinutes: t.remainingMinutes } : x)) }))
  /** Runs a time call: on success applies the task totals it returns and refreshes time views; on failure says why. */
  const timeCall = useCallback(async (call: () => Promise<unknown>) => {
    try {
      const r = await call() as { task?: { id: string; loggedMinutes: number; remainingMinutes: number } } | undefined
      if (r?.task) setTotals(r.task)
      setTimeTick(n => n + 1)
      return true
    } catch (e) {
      notify(message(e), 'warn')
      return false
    }
  }, [notify]) // eslint-disable-line react-hooks/exhaustive-deps

  const logWork = useCallback((taskId: string, w: { minutes: number; date: string; comment?: string; remaining?: number }) =>
    timeCall(() => api(`${ws()}/tasks/${taskId}/worklogs`, { method: 'POST', body: w })), [timeCall]) // eslint-disable-line react-hooks/exhaustive-deps
  const editWorklog = useCallback((id: string, patch: { minutes?: number; date?: string; comment?: string }) =>
    timeCall(() => api(`${ws()}/worklogs/${id}`, { method: 'PATCH', body: patch })), [timeCall]) // eslint-disable-line react-hooks/exhaustive-deps
  const deleteWorklog = useCallback((id: string) =>
    timeCall(() => api(`${ws()}/worklogs/${id}`, { method: 'DELETE' })), [timeCall]) // eslint-disable-line react-hooks/exhaustive-deps
  const worklogsOf = useCallback((taskId: string) => api<Worklog[]>(`${ws()}/tasks/${taskId}/worklogs`), []) // eslint-disable-line react-hooks/exhaustive-deps
  const timesheet = useCallback((q: { from: string; to: string; user?: string; project?: string }) =>
    api<TimesheetData>(`${ws()}/timesheet?${new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][])}`), []) // eslint-disable-line react-hooks/exhaustive-deps
  const timeReport = useCallback((q: TimeReportQuery) =>
    api<TimeReport>(`${ws()}/time-reports?${new URLSearchParams({ ...q, approvedOnly: String(q.approvedOnly) })}`), []) // eslint-disable-line react-hooks/exhaustive-deps
  const submitPeriod = useCallback((projectId: string, start: string) =>
    timeCall(() => api<TimePeriod>(`${ws()}/projects/${projectId}/timesheets/submit`, { method: 'POST', body: { periodStart: start } })), [timeCall]) // eslint-disable-line react-hooks/exhaustive-deps
  const withdrawPeriod = useCallback((projectId: string, start: string) =>
    timeCall(() => api(`${ws()}/projects/${projectId}/timesheets/withdraw`, { method: 'POST', body: { periodStart: start } })), [timeCall]) // eslint-disable-line react-hooks/exhaustive-deps
  const reviewPeriod = useCallback((projectId: string, userId: string, start: string, action: 'approve' | 'reject' | 'reopen', comment?: string) =>
    timeCall(() => api(`${ws()}/projects/${projectId}/timesheets/${userId}/${action}`, { method: 'POST', body: { periodStart: start, ...(comment ? { comment } : {}) } })), [timeCall]) // eslint-disable-line react-hooks/exhaustive-deps

  const invite = useCallback(async (_name: string, email: string, team: Person['team'], role: string) => {
    try {
      await api(`${ws()}/invitations`, { method: 'POST', body: { email, team, title: role } })
      return true
    } catch (e) {
      notify(message(e), 'warn')
      return false
    }
  }, [notify])

  const markAllRead = useCallback(() => {
    setData(d => ({ ...d, notices: d.notices.map((n: Notice) => ({ ...n, read: true })) }))
    api(`${ws()}/notifications/read-all`, { method: 'POST' }).catch(resync)
  }, [resync])

  const setPrefs = useCallback((p: Partial<Data['prefs']>) => {
    setData(d => ({ ...d, prefs: { ...d.prefs, ...p, notify: { ...d.prefs.notify, ...p.notify } } }))
    api('/me/prefs', { method: 'PATCH', body: p }).catch(resync)
  }, [resync])

  /* ---- auth ---- */
  const session = useCallback(async (call: () => Promise<{ accessToken: string; user: PublicUser }>): Promise<AuthResult> => {
    try {
      const s = await call()
      setToken(s.accessToken)
      await enter(s.user)
      return { ok: true }
    } catch (e) {
      setToken(null)
      return toAuthResult(e)
    }
  }, [enter])

  const signIn = useCallback((email: string, password: string, remember: boolean) =>
    session(() => api('/auth/login', { method: 'POST', body: { email: email.trim(), password, remember } })), [session])

  const signUp = useCallback((f: { name: string; email: string; password: string; team: Person['team']; role: string }) => {
    pendingTeam.current = { team: f.team, title: f.role.trim() }
    return session(() => api('/auth/signup', { method: 'POST', body: { name: f.name.trim(), email: f.email.trim(), password: f.password } }))
  }, [session])

  const signInWith = useCallback((provider: Provider) => {
    location.assign(`${API_URL}/api/v1/auth/${provider}`)
  }, [])

  const ask = useCallback(async (path: string, body: unknown): Promise<AuthResult> => {
    try {
      await api(path, { method: 'POST', body })
      return { ok: true }
    } catch (e) {
      return toAuthResult(e)
    }
  }, [])
  const requestMagicLink = useCallback((email: string) => ask('/auth/magic-link', { email: email.trim() }), [ask])
  const forgotPassword = useCallback((email: string) => ask('/auth/password/forgot', { email: email.trim() }), [ask])

  const completeSignIn: Store['completeSignIn'] = useCallback(async via => {
    if (via.magic) return session(() => api('/auth/magic-link/verify', { method: 'POST', body: { token: via.magic } }))
    if (via.reset) return session(() => api('/auth/password/reset', { method: 'POST', body: via.reset }))
    if (via.verify) {
      const r = await ask('/auth/verify-email', { token: via.verify })
      if (!r.ok || user) return r
    }
    // Back from Google/GitHub: boot's refresh may already have signed us in.
    else if (user) return { ok: true }
    const s = await refresh()
    // A confirmed email opened on another device has no session here; it still worked.
    if (!s) return via.verify ? { ok: true } : { ok: false, field: 'email', error: 'That sign-in didn’t finish. Try again.' }
    try {
      await enter(s.user)
      return { ok: true }
    } catch (e) {
      setToken(null)
      return toAuthResult(e)
    }
  }, [session, ask, enter, user])

  const acceptInvite = useCallback(async (token: string): Promise<AuthResult> => {
    try {
      const r = await api<{ workspace: WorkspaceRef }>('/invitations/accept', { method: 'POST', body: { token } })
      setWorkspaces(list => mergeWorkspaces(list, [r.workspace]))
      openWorkspace(r.workspace.id)
      return { ok: true }
    } catch (e) {
      return toAuthResult(e)
    }
  }, [openWorkspace])

  const signOut = useCallback(() => {
    api('/auth/logout', { method: 'POST' }).catch(() => { /* the cookie may already be gone */ })
    leave()
  }, [leave])

  const value: Store = {
    ready, loaded, loadError, retryLoad, data, me, look, setLook, person, project,
    workspaces, workspaceId, switchWorkspace, acceptInvite,
    addTask, updateTask, moveTask, toggleDone, removeTask, addSubtask, toggleSubtask, addComment,
    addEvent, removeEvent, addProject, updateProject, invite, markAllRead, setPrefs,
    timeTick, logWork, editWorklog, deleteWorklog, worklogsOf, timesheet, timeReport, submitPeriod, withdrawPeriod, reviewPeriod,
    can, canTask, createRole, updateRole, duplicateRole, removeRole, setProjectMember, removeProjectMember, setDefaultRole,
    signedIn: !!user, lastUser, signIn, signUp, signInWith, requestMagicLink, forgotPassword, completeSignIn, signOut,
    drawer, openDrawer, modal, openModal, finder, setFinder, note, notify,
    focus, startFocus, pauseFocus, stopFocus, extendFocus,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
