import { describe, expect, it } from 'vitest'
import type { Data, Person, Project, ProjectRole, Task } from '../data/types'
import { applyEvent } from './live'

const person = (id: string): Person => ({ id, name: id, role: '', team: 'Design', city: '', tz: 'UTC', presence: 'away', capacity: 32, email: `${id}@x`, skin: 0 })
const task = (id: string, p: Partial<Task> = {}): Task => ({ id, title: id, project: 'p1', assignee: 'a', status: 'todo', priority: 'medium', due: '', estimate: 1, loggedMinutes: 0, remainingMinutes: 60, subtasks: [], comments: [], order: 0, ...p })
const project = (id: string, p: Partial<Project> = {}): Project => ({ id, name: id, desc: '', hue: 'blue', icon: 'grid', status: 'planning', start: '', due: '', lead: 'a', members: [], roles: {}, defaultRole: 'rm', approvalEnabled: false, approvalPeriod: 'week', pinned: false, starred: false, milestones: [], ...p })
const role = (id: string, r: Partial<ProjectRole> = {}): ProjectRole => ({ id, key: null, name: id, description: '', permissions: ['project.browse'], ...r })
const base = (): Data => ({
  version: 5, me: 'a', people: [person('a'), person('b')], projects: [project('p1', { pinned: true, starred: true })],
  tasks: [task('t1')], events: [], notices: [], focus: [], prefs: { notify: { mentions: true, due: true, meetings: true, digest: false, focus: true }, session: 25, pause: 5 },
  roles: [role('rm')], access: { p1: ['project.browse'] },
})
const WS = 'ws1'
const ev = (type: string, p: Record<string, unknown>, d = base()) => applyEvent(d, type, { workspaceId: WS, ...p }, WS)

describe('applyEvent', () => {
  it('upserts tasks on created, updated, moved and restored', () => {
    const d1 = ev('task.created', { task: task('t2') })
    expect(d1.tasks.map(t => t.id)).toEqual(['t1', 't2'])
    const d2 = ev('task.updated', { task: task('t1', { title: 'New' }) }, d1)
    expect(d2.tasks.find(t => t.id === 't1')!.title).toBe('New')
    expect(ev('task.moved', { task: task('t1', { status: 'done' }) }).tasks[0].status).toBe('done')
    expect(ev('task.restored', { task: task('t9') }).tasks).toHaveLength(2)
  })

  it('removes a deleted task', () => {
    expect(ev('task.deleted', { id: 't1' }).tasks).toEqual([])
  })

  it('appends a comment once', () => {
    const c = { id: 'c1', who: 'b', text: 'hi', at: 1 }
    const d1 = ev('comment.created', { taskId: 't1', comment: c })
    const d2 = ev('comment.created', { taskId: 't1', comment: c }, d1)
    expect(d2.tasks[0].comments).toEqual([c])
  })

  it('projects keep my pinned and starred', () => {
    const shared = { ...project('p1', { name: 'Renamed' }) } as Partial<Project>
    delete shared.pinned
    delete shared.starred
    const d = ev('project.updated', { project: shared })
    expect(d.projects[0]).toMatchObject({ name: 'Renamed', pinned: true, starred: true })
    const d2 = ev('project.created', { project: { ...shared, id: 'p2' } })
    expect(d2.projects[1]).toMatchObject({ id: 'p2', pinned: false, starred: false })
    expect(ev('project.deleted', { id: 'p1' }).projects).toEqual([])
  })

  it('replaces milestones', () => {
    const ms = [{ id: 'm1', title: 'Kickoff', due: '2026-11-01', done: true }]
    expect(ev('milestone.updated', { projectId: 'p1', milestones: ms }).projects[0].milestones).toEqual(ms)
  })

  it('upserts and removes events', () => {
    const e = { id: 'e1', title: 'Standup', date: '2026-11-02', start: 570, dur: 15, where: '', kind: 'team', hue: 'blue', people: [] }
    const d1 = ev('event.created', { event: e })
    expect(ev('event.updated', { event: { ...e, title: 'Sync' } }, d1).events[0].title).toBe('Sync')
    expect(ev('event.deleted', { id: 'e1' }, d1).events).toEqual([])
  })

  it('prepends a notice once', () => {
    const n = { id: 'n1', who: 'b', text: 'mentioned you', at: 1, read: false, to: 'a' }
    const d1 = ev('notification.created', { notice: n })
    expect(ev('notification.created', { notice: n }, d1).notices).toEqual([n])
  })

  it('tracks members and presence', () => {
    const d1 = ev('member.joined', { member: person('c') })
    expect(d1.people.map(p => p.id)).toEqual(['a', 'b', 'c'])
    expect(ev('member.updated', { member: { ...person('b'), role: 'Lead' } }).people[1].role).toBe('Lead')
    expect(ev('member.left', { userId: 'b' }).people.map(p => p.id)).toEqual(['a'])
    expect(ev('presence.changed', { userId: 'b', presence: 'focus', note: 'Deep work' }).people[1]).toMatchObject({ presence: 'focus', note: 'Deep work' })
  })

  it('ignores another workspace’s event and unknown types', () => {
    const d = base()
    expect(applyEvent(d, 'task.deleted', { workspaceId: 'other', id: 't1' }, WS)).toBe(d)
    expect(applyEvent(d, 'something.else', { workspaceId: WS }, WS)).toBe(d)
  })

  it('keeps roles in sync', () => {
    let d = applyEvent(base(), 'role.created', { workspaceId: WS, role: role('lead', { name: 'Lead' }) }, WS)
    expect(d.roles.map(r => r.id)).toEqual(['rm', 'lead'])
    d = applyEvent(d, 'role.updated', { workspaceId: WS, role: role('lead', { name: 'Leads' }) }, WS)
    expect(d.roles.find(r => r.id === 'lead')?.name).toBe('Leads')
    d = applyEvent(d, 'role.deleted', { workspaceId: WS, id: 'lead' }, WS)
    expect(d.roles.map(r => r.id)).toEqual(['rm'])
  })

  it('project updates carry member roles and the default role', () => {
    const d = applyEvent(base(), 'project.updated', { workspaceId: WS, project: project('p1', { roles: { b: 'rv' }, defaultRole: 'rv' }) }, WS)
    expect(d.projects[0]).toMatchObject({ roles: { b: 'rv' }, defaultRole: 'rv', pinned: true })
  })

  it('time totals follow task.time_changed', () => {
    const d = applyEvent(base(), 'task.time_changed', { workspaceId: WS, taskId: 't1', loggedMinutes: 90, remainingMinutes: 30 }, WS)
    expect(d.tasks[0]).toMatchObject({ loggedMinutes: 90, remainingMinutes: 30 })
  })
})
