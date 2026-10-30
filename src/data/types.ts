export type Hue = 'blue' | 'purple' | 'pink' | 'orange' | 'green' | 'teal' | 'indigo' | 'yellow'

export type Team = 'Product' | 'Design' | 'Engineering' | 'Marketing'
export type Presence = 'online' | 'focus' | 'meeting' | 'away'

export interface Person {
  id: string
  name: string
  role: string
  team: Team
  city: string
  tz: string
  presence: Presence
  note?: string
  capacity: number
  email: string
  skin: number
}

export type ProjectStatus = 'progress' | 'review' | 'planning' | 'shipped'
export type ProjectIcon = 'phone' | 'grid' | 'rocket' | 'leaf' | 'flame' | 'chart'

export interface Milestone {
  id: string
  title: string
  due: string
  done: boolean
}

export interface Project {
  id: string
  name: string
  desc: string
  hue: Hue
  icon: ProjectIcon
  status: ProjectStatus
  start: string
  due: string
  lead: string
  members: string[]
  /** Each member's project role id. */
  roles: Record<string, string>
  /** The role of everyone in the workspace who isn't on `members`. */
  defaultRole: string
  pinned: boolean
  starred: boolean
  milestones: Milestone[]
  /** Server edit counter, sent back on PATCH. */
  version?: number
}

export type Permission =
  | 'project.browse' | 'project.admin'
  | 'tasks.create' | 'tasks.edit_own' | 'tasks.edit_any' | 'tasks.delete_own' | 'tasks.delete_any' | 'tasks.assign' | 'tasks.transition'
  | 'comments.add' | 'comments.delete_any'
  | 'time.log' | 'time.edit_own' | 'time.edit_any' | 'time.delete_own' | 'time.delete_any' | 'time.view_all' | 'time.approve'

/** A named set of permissions, held per project. `key` marks the three built-in, locked roles. */
export interface ProjectRole {
  id: string
  key: 'administrator' | 'member' | 'viewer' | null
  name: string
  description: string
  permissions: Permission[]
}

export type Status = 'todo' | 'progress' | 'review' | 'done'
export type Priority = 'low' | 'medium' | 'high' | 'urgent'

export interface Subtask {
  id: string
  title: string
  done: boolean
}

export interface Comment {
  id: string
  who: string
  text: string
  at: number
}

export interface Task {
  id: string
  title: string
  project: string
  assignee: string
  status: Status
  priority: Priority
  due: string
  estimate: number
  subtasks: Subtask[]
  comments: Comment[]
  doneAt?: string
  order: number
  /** Server edit counter; PATCH sends it back so a stale edit gets 409. */
  version?: number
}

export type EventKind = 'meeting' | 'review' | 'team' | 'focus' | 'call' | 'milestone'

export interface CalEvent {
  id: string
  title: string
  date: string
  start: number // minutes from midnight
  dur: number // minutes
  where: string
  kind: EventKind
  hue: Hue
  project?: string
  people: string[]
}

export interface Notice {
  id: string
  who: string
  text: string
  at: number
  read: boolean
  to?: string
}

export interface FocusLog {
  date: string
  minutes: number
}

export interface Prefs {
  notify: { mentions: boolean; due: boolean; meetings: boolean; digest: boolean; focus: boolean }
  session: number
  pause: number
}

export interface Data {
  version: number
  me: string
  people: Person[]
  projects: Project[]
  tasks: Task[]
  events: CalEvent[]
  notices: Notice[]
  focus: FocusLog[]
  prefs: Prefs
  roles: ProjectRole[]
  /** My own permissions per project id. */
  access: Record<string, Permission[]>
}

export type Theme = 'light' | 'dark' | 'system'
export type Wall = 'ash' | 'sand' | 'sage' | 'aurora' | 'smoke' | 'tide' | 'bloom' | 'ember' | 'grove' | 'dusk'
export type Accent = 'blue' | 'purple' | 'pink' | 'orange' | 'green' | 'graphite'

export interface Look {
  theme: Theme
  wall: Wall
  accent: Accent
  glass: 'clear' | 'tinted'
  solid: boolean
}
