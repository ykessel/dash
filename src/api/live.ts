import type { CalEvent, Comment, Data, Milestone, Notice, Person, Presence, Project, Task } from '../data/types'

type Payload = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const upsert = <T extends { id: string }>(list: T[], item: T): T[] =>
  list.some(x => x.id === item.id) ? list.map(x => (x.id === item.id ? item : x)) : [...list, item]

/**
 * Folds one live event from the API into `Data`. Events for another workspace, and types the
 * app doesn't draw, return `d` untouched (same object), so callers can skip a re-render.
 */
export function applyEvent(d: Data, type: string, p: Payload, wsId: string): Data {
  if (p.workspaceId !== wsId) return d
  switch (type) {
    case 'task.created':
    case 'task.updated':
    case 'task.moved':
    case 'task.restored':
      return { ...d, tasks: upsert(d.tasks, p.task as Task) }
    case 'task.deleted':
      return { ...d, tasks: d.tasks.filter(t => t.id !== p.id) }
    case 'comment.created': {
      const c = p.comment as Comment
      return {
        ...d,
        tasks: d.tasks.map(t => (t.id === p.taskId && !t.comments.some(x => x.id === c.id) ? { ...t, comments: [...t.comments, c] } : t)),
      }
    }
    case 'project.created':
    case 'project.updated': {
      // The shared view has no pinned/starred: those are mine and stay as they are.
      const mine = d.projects.find(x => x.id === p.project.id)
      const proj: Project = { ...p.project, pinned: mine?.pinned ?? false, starred: mine?.starred ?? false }
      return { ...d, projects: upsert(d.projects, proj) }
    }
    case 'project.deleted':
      return { ...d, projects: d.projects.filter(x => x.id !== p.id) }
    case 'milestone.updated':
      return { ...d, projects: d.projects.map(x => (x.id === p.projectId ? { ...x, milestones: p.milestones as Milestone[] } : x)) }
    case 'event.created':
    case 'event.updated':
      return { ...d, events: upsert(d.events, p.event as CalEvent) }
    case 'event.deleted':
      return { ...d, events: d.events.filter(e => e.id !== p.id) }
    case 'notification.created': {
      const n = p.notice as Notice
      return d.notices.some(x => x.id === n.id) ? d : { ...d, notices: [n, ...d.notices] }
    }
    case 'member.joined':
    case 'member.updated':
      return { ...d, people: upsert(d.people, p.member as Person) }
    case 'member.left':
      return { ...d, people: d.people.filter(x => x.id !== p.userId) }
    case 'presence.changed':
      return {
        ...d,
        people: d.people.map(x => (x.id === p.userId ? { ...x, presence: p.presence as Presence, note: p.note ?? undefined } : x)),
      }
    default:
      return d
  }
}
