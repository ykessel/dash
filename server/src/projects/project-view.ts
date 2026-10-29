import type { Hue, ProjectIcon, ProjectStatus } from '../common/enums'
import type { Milestone, Project, ProjectPrefs } from './project.entity'

export interface MilestoneView {
  id: string
  title: string
  due: string
  done: boolean
}

/** The frontend's `Project`, plus `version` for concurrent edits. */
export interface ProjectView {
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
  pinned: boolean
  starred: boolean
  milestones: MilestoneView[]
  version: number
}

export const toMilestoneView = (m: Milestone): MilestoneView => ({ id: m.id, title: m.title, due: m.dueDate, done: m.done })

export function toProjectView(p: Project, memberIds: string[], milestones: Milestone[], prefs?: ProjectPrefs | null): ProjectView {
  return {
    id: p.id,
    name: p.name,
    desc: p.description,
    hue: p.hue,
    icon: p.icon,
    status: p.status,
    start: p.startDate,
    due: p.dueDate,
    lead: p.leadId ?? '',
    members: memberIds,
    pinned: prefs?.pinned ?? false,
    starred: prefs?.starred ?? false,
    milestones: [...milestones].sort((a, b) => a.position - b.position).map(toMilestoneView),
    version: p.version,
  }
}

/** What everyone in the team shares; pinned and starred are each person's own. */
export function sharedProject(v: ProjectView): Omit<ProjectView, 'pinned' | 'starred'> {
  const { pinned: _p, starred: _s, ...shared } = v
  return shared
}
