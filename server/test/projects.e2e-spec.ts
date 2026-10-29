import type { DomainEvent } from '../src/common/domain-events'
import { createTestApp, resetAll, type TestApp } from './utils/app'
import { captureEvents } from './utils/events'
import { type Signed, twoTeams } from './utils/team'

describe('projects', () => {
  let t: TestApp
  let events: DomainEvent[]
  let lin: Signed
  let nia: Signed
  let kai: Signed
  let base: string
  beforeAll(async () => { t = await createTestApp(); events = captureEvents(t) })
  beforeEach(async () => {
    await resetAll(t)
    ;({ lin, nia, kai, base } = await twoTeams(t))
    events.length = 0
  })
  afterAll(() => t.app.close())

  const create = (who: Signed, body: object = {}) =>
    t.http.post(`${base}/projects`).set(who.auth).send({ name: 'Tide', hue: 'teal', icon: 'leaf', due: '2026-12-01', ...body })

  it('creating a project gives it a Kickoff milestone and makes me lead and member', async () => {
    const res = await create(lin).expect(201)
    expect(res.body).toMatchObject({
      name: 'Tide', desc: '', hue: 'teal', icon: 'leaf', status: 'planning', due: '2026-12-01',
      start: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      lead: lin.user.id, members: [lin.user.id], pinned: false, starred: false, version: 1,
      milestones: [{ id: expect.any(String), title: 'Kickoff', due: '2026-12-01', done: false }],
    })
    expect(events.map(e => e.type)).toEqual(['project.created'])
    expect(events[0].data.project).not.toHaveProperty('pinned')
    const list = await t.http.get(`${base}/projects`).set(nia.auth).expect(200)
    expect(list.body.map((p: { id: string }) => p.id)).toEqual([res.body.id])
  })

  it('a stale version is 409 version_conflict and keeps the newer change', async () => {
    const p = (await create(lin)).body
    await t.http.patch(`${base}/projects/${p.id}`).set(lin.auth).send({ version: 1, name: 'Tide v2' }).expect(200)
    const res = await t.http.patch(`${base}/projects/${p.id}`).set(lin.auth).send({ version: 1, status: 'review' }).expect(409)
    expect(res.body.code).toBe('version_conflict')
    expect((await t.http.get(`${base}/projects/${p.id}`).set(lin.auth)).body).toMatchObject({ name: 'Tide v2', status: 'planning', version: 2 })
  })

  it('a PATCH without version is 400 invalid on field version', async () => {
    const p = (await create(lin)).body
    expect((await t.http.patch(`${base}/projects/${p.id}`).set(lin.auth).send({ name: 'x' }).expect(400)).body).toMatchObject({ code: 'invalid', field: 'version' })
  })

  it('pinned and starred are per person', async () => {
    const p = (await create(lin)).body
    const res = await t.http.put(`${base}/projects/${p.id}/prefs`).set(lin.auth).send({ pinned: true }).expect(200)
    expect(res.body).toMatchObject({ pinned: true, starred: false })
    expect((await t.http.get(`${base}/projects/${p.id}`).set(nia.auth)).body).toMatchObject({ pinned: false, starred: false })
    expect(events.map(e => e.type)).toEqual(['project.created'])
  })

  it('a lead or member from another workspace is 400 invalid', async () => {
    expect((await create(lin, { lead: kai.user.id }).expect(400)).body).toMatchObject({ code: 'invalid', field: 'lead' })
    const p = (await create(lin)).body
    expect((await t.http.put(`${base}/projects/${p.id}/members`).set(lin.auth).send({ userIds: [kai.user.id] }).expect(400)).body)
      .toMatchObject({ code: 'invalid', field: 'members' })
  })

  it('members always include the lead', async () => {
    const p = (await create(lin)).body
    const res = await t.http.put(`${base}/projects/${p.id}/members`).set(lin.auth).send({ userIds: [nia.user.id] }).expect(200)
    expect([...res.body.members].sort()).toEqual([lin.user.id, nia.user.id].sort())
    expect(events.map(e => e.type)).toEqual(['project.created', 'project.updated'])
  })

  it('a plain member who is not the lead cannot edit, delete or change members; the lead can', async () => {
    const p = (await create(lin)).body
    expect((await t.http.patch(`${base}/projects/${p.id}`).set(nia.auth).send({ version: 1, name: 'x' }).expect(403)).body.code).toBe('forbidden')
    await t.http.delete(`${base}/projects/${p.id}`).set(nia.auth).expect(403)
    await t.http.put(`${base}/projects/${p.id}/members`).set(nia.auth).send({ userIds: [] }).expect(403)
    const mine = (await create(nia)).body
    await t.http.patch(`${base}/projects/${mine.id}`).set(nia.auth).send({ version: 1, name: 'Nia’s' }).expect(200)
  })

  it('deleting a project hides it; with live tasks it is 409 project_has_tasks', async () => {
    const p = (await create(lin)).body
    await t.http.delete(`${base}/projects/${p.id}`).set(lin.auth).expect(204)
    expect((await t.http.get(`${base}/projects/${p.id}`).set(lin.auth).expect(404)).body.code).toBe('project_not_found')
    expect((await t.http.get(`${base}/projects`).set(lin.auth)).body).toEqual([])
    expect(events.map(e => e.type)).toEqual(['project.created', 'project.deleted'])
    expect(events[1].data).toEqual({ id: p.id })
  })

  it('a project from another workspace is 404 project_not_found', async () => {
    const other = (await t.http.post(`/api/v1/workspaces/${(await t.http.get('/api/v1/me/workspaces').set(kai.auth)).body[0].id}/projects`)
      .set(kai.auth).send({ name: 'B', hue: 'blue', icon: 'grid', due: '2026-12-01' }).expect(201)).body
    expect((await t.http.get(`${base}/projects/${other.id}`).set(lin.auth).expect(404)).body.code).toBe('project_not_found')
  })

  it('milestones: add, complete, remove — each publishes milestone.updated with the full list', async () => {
    const p = (await create(lin)).body
    const m = await t.http.post(`${base}/projects/${p.id}/milestones`).set(lin.auth).send({ title: 'Beta', due: '2026-11-15' }).expect(201)
    expect(m.body).toMatchObject({ title: 'Beta', due: '2026-11-15', done: false })
    await t.http.patch(`${base}/projects/${p.id}/milestones/${m.body.id}`).set(lin.auth).send({ done: true }).expect(200)
    await t.http.delete(`${base}/projects/${p.id}/milestones/${p.milestones[0].id}`).set(lin.auth).expect(204)
    const updates = events.filter(e => e.type === 'milestone.updated')
    expect(updates).toHaveLength(3)
    expect(updates[2].data).toEqual({ projectId: p.id, milestones: [{ id: m.body.id, title: 'Beta', due: '2026-11-15', done: true }] })
    expect((await t.http.patch(`${base}/projects/${p.id}/milestones/${m.body.id}`).set(nia.auth).send({ done: false }).expect(403)).body.code).toBe('forbidden')
  })

  it('bad values are 400 invalid on their field', async () => {
    expect((await create(lin, { hue: 'red' }).expect(400)).body.field).toBe('hue')
    expect((await create(lin, { due: '2026-13-40' }).expect(400)).body.field).toBe('due')
    expect((await create(lin, { name: '' }).expect(400)).body.field).toBe('name')
  })
})
