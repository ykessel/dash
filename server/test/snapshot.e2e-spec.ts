import { NotificationsService } from '../src/notifications/notifications.service'
import { createTestApp, resetAll, type TestApp } from './utils/app'
import { type Signed, twoTeams } from './utils/team'

describe('snapshot', () => {
  let t: TestApp
  let lin: Signed
  let nia: Signed
  let kai: Signed
  let wsA: string
  let wsB: string
  let base: string
  let baseB: string
  beforeAll(async () => { t = await createTestApp() })
  beforeEach(async () => {
    await resetAll(t)
    ;({ lin, nia, kai, wsA, wsB, base, baseB } = await twoTeams(t))
  })
  afterAll(() => t.app.close())

  /** A project, two live tasks and a deleted one, an event, a notice and a finished focus block. */
  const seed = async (root: string, ws: string, owner: Signed, other: Signed | null) => {
    const project = (await t.http.post(`${root}/projects`).set(owner.auth).send({ name: `P ${ws.slice(0, 4)}`, hue: 'teal', icon: 'leaf', due: '2026-12-01' })).body
    await t.http.put(`${root}/projects/${project.id}/prefs`).set(owner.auth).send({ pinned: true }).expect(200)
    const mk = async (title: string, status = 'todo') =>
      (await t.http.post(`${root}/tasks`).set(owner.auth).send({ title, project: project.id, status }).expect(201)).body
    const done = await mk('Done one', 'done')
    const todo = await mk('Todo one')
    const gone = await mk('Gone')
    await t.http.delete(`${root}/tasks/${gone.id}`).set(owner.auth).expect(204)
    const event = (await t.http.post(`${root}/events`).set(owner.auth).send({ title: 'Sync', date: '2026-11-02', start: 600, dur: 30, kind: 'meeting', hue: 'blue' })).body
    const notices = t.app.get(NotificationsService)
    await notices.create(ws, owner.user.id, { userId: owner.user.id }, 'note', `for ${owner.user.id}`)
    if (other) await notices.create(ws, other.user.id, { userId: owner.user.id }, 'note', `for ${other.user.id}`)
    const s = (await t.http.post(`${root}/focus-sessions`).set(owner.auth).send({ plannedSec: 1500 })).body
    await t.http.patch(`${root}/focus-sessions/${s.id}`).set(owner.auth).send({ actualSec: 1200 }).expect(200)
    return { project, done, todo, event }
  }

  it('returns the frontend Data shape with only this workspace’s live data', async () => {
    const a = await seed(base, wsA, lin, nia)
    await seed(baseB, wsB, kai, null)
    const snap = (await t.http.get(`${base}/snapshot`).set(lin.auth).expect(200)).body
    expect(Object.keys(snap).sort()).toEqual(['access', 'events', 'focus', 'me', 'notices', 'people', 'prefs', 'projects', 'roles', 'tasks', 'version'])
    expect(snap.version).toBe(4)
    expect(snap.roles.map((r: { key: string }) => r.key)).toEqual(['administrator', 'member', 'viewer'])
    expect(snap.access[a.project.id]).toContain('project.admin')
    expect(snap.me).toBe(lin.user.id)
    expect(snap.people.map((p: { id: string }) => p.id).sort()).toEqual([lin.user.id, nia.user.id].sort())
    expect(snap.projects).toEqual([expect.objectContaining({ id: a.project.id, pinned: true })])
    expect(snap.tasks.map((x: { title: string }) => x.title)).toEqual(['Todo one', 'Done one'])
    expect(snap.events).toEqual([a.event])
    expect(snap.notices).toEqual([expect.objectContaining({ text: `for ${lin.user.id}`, to: lin.user.id })])
    expect(snap.focus).toEqual([{ date: new Date().toISOString().slice(0, 10), minutes: 20 }])
    expect(snap.prefs).toEqual({ notify: { mentions: true, due: true, meetings: true, digest: false, focus: true }, session: 25, pause: 5 })

    const niaSnap = (await t.http.get(`${base}/snapshot`).set(nia.auth).expect(200)).body
    expect(niaSnap.me).toBe(nia.user.id)
    expect(niaSnap.projects[0].pinned).toBe(false)
    expect(niaSnap.notices.map((n: { to: string }) => n.to)).toEqual([nia.user.id])
    expect(niaSnap.focus).toEqual([])
  })
})
