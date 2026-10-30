import type { DomainEvent } from '../src/common/domain-events'
import { createTestApp, resetAll, type TestApp } from './utils/app'
import { captureEvents } from './utils/events'
import { type Signed, twoTeams } from './utils/team'

describe('roles', () => {
  let t: TestApp
  let events: DomainEvent[]
  let lin: Signed
  let nia: Signed
  let kai: Signed
  let wsA: string
  let wsB: string
  let base: string
  beforeAll(async () => { t = await createTestApp(); events = captureEvents(t) })
  beforeEach(async () => {
    await resetAll(t)
    ;({ lin, nia, kai, wsA, wsB, base } = await twoTeams(t))
    events.length = 0
  })
  afterAll(() => t.app.close())

  const project = async (who: Signed) =>
    (await t.http.post(`${base}/projects`).set(who.auth).send({ name: 'Tide', hue: 'teal', icon: 'leaf', due: '2026-12-01' }).expect(201)).body
  const roleIds = async (ws: string): Promise<Record<string, string>> => {
    const rows: { id: string; key: string }[] = await t.db.query(`SELECT id, key FROM project_roles WHERE workspace_id = $1 AND key IS NOT NULL`, [ws])
    return Object.fromEntries(rows.map(r => [r.key, r.id]))
  }

  it('a new workspace has Administrator, Member and Viewer', async () => {
    const rows = await t.db.query(`SELECT key, name FROM project_roles WHERE workspace_id = $1 ORDER BY key`, [wsA])
    expect(rows).toEqual([
      { key: 'administrator', name: 'Administrator' },
      { key: 'member', name: 'Member' },
      { key: 'viewer', name: 'Viewer' },
    ])
    const ids = await roleIds(wsA)
    const p = await project(lin)
    expect((await t.db.query(`SELECT default_role_id FROM projects WHERE id = $1`, [p.id]))[0].default_role_id).toBe(ids.member)
    expect((await t.db.query(`SELECT role_id FROM project_members WHERE project_id = $1 AND user_id = $2`, [p.id, lin.user.id]))[0].role_id).toBe(ids.member)
  })

  const create = (who: Signed, body: object) => t.http.post(`${base}/roles`).set(who.auth).send(body)

  it('lists the three defaults in order for any member', async () => {
    const res = await t.http.get(`${base}/roles`).set(nia.auth).expect(200)
    expect(res.body.map((r: { key: string }) => r.key)).toEqual(['administrator', 'member', 'viewer'])
    expect(res.body[2]).toEqual({ id: expect.any(String), key: 'viewer', name: 'Viewer', description: '', permissions: ['project.browse', 'comments.add'] })
  })

  it('owner creates a role; browse is added; unknown keys are 400', async () => {
    const res = await create(lin, { name: 'Lead', permissions: ['time.view_all'] }).expect(201)
    expect(res.body).toMatchObject({ key: null, name: 'Lead', description: '' })
    expect([...res.body.permissions].sort()).toEqual(['project.browse', 'time.view_all'])
    expect((await create(lin, { name: 'Other', permissions: ['nope'] }).expect(400)).body).toMatchObject({ code: 'invalid', field: 'permissions' })
    expect(events.map(e => e.type)).toEqual(['role.created'])
  })

  it("a member can't create roles", async () => {
    expect((await create(nia, { name: 'Lead', permissions: [] }).expect(403)).body.code).toBe('forbidden')
  })

  it('names are unique case-insensitively', async () => {
    await create(lin, { name: 'Lead', permissions: [] }).expect(201)
    expect((await create(lin, { name: ' lead ', permissions: [] }).expect(409)).body).toMatchObject({ code: 'role_name_taken', field: 'name' })
    expect((await create(lin, { name: 'member', permissions: [] }).expect(409)).body.code).toBe('role_name_taken')
  })

  it('keyed roles are locked', async () => {
    const ids = await roleIds(wsA)
    expect((await t.http.patch(`${base}/roles/${ids.member}`).set(lin.auth).send({ name: 'Crew' }).expect(403)).body.code).toBe('role_locked')
    expect((await t.http.delete(`${base}/roles/${ids.member}`).set(lin.auth).expect(403)).body.code).toBe('role_locked')
  })

  it('owner edits a custom role', async () => {
    const r = (await create(lin, { name: 'Lead', permissions: [] }).expect(201)).body
    const res = await t.http.patch(`${base}/roles/${r.id}`).set(lin.auth).send({ description: 'Runs a team', permissions: ['time.approve'] }).expect(200)
    expect(res.body).toMatchObject({ name: 'Lead', description: 'Runs a team' })
    expect([...res.body.permissions].sort()).toEqual(['project.browse', 'time.approve'])
  })

  it('duplicate copies permissions', async () => {
    const ids = await roleIds(wsA)
    const res = await t.http.post(`${base}/roles/${ids.viewer}/duplicate`).set(lin.auth).expect(201)
    expect(res.body).toMatchObject({ key: null, name: 'Viewer copy', permissions: ['project.browse', 'comments.add'] })
    expect((await t.http.post(`${base}/roles/${ids.viewer}/duplicate`).set(lin.auth).expect(201)).body.name).toBe('Viewer copy 2')
  })

  it("a role in use can't be deleted", async () => {
    const p = await project(lin)
    const used = (await create(lin, { name: 'Used', permissions: [] })).body
    const asDefault = (await create(lin, { name: 'Default', permissions: [] })).body
    const unused = (await create(lin, { name: 'Unused', permissions: [] })).body
    await t.db.query(`UPDATE project_members SET role_id = $1 WHERE project_id = $2`, [used.id, p.id])
    await t.db.query(`UPDATE projects SET default_role_id = $1 WHERE id = $2`, [asDefault.id, p.id])
    const res = await t.http.delete(`${base}/roles/${used.id}`).set(lin.auth).expect(409)
    expect(res.body).toMatchObject({ code: 'role_in_use', message: expect.stringContaining('1 place') })
    expect((await t.http.delete(`${base}/roles/${asDefault.id}`).set(lin.auth).expect(409)).body.code).toBe('role_in_use')
    await t.http.delete(`${base}/roles/${unused.id}`).set(lin.auth).expect(204)
  })

  it('places in deleted projects or held by people who left do not block a delete', async () => {
    const gone = await project(lin)
    const live = await project(lin)
    const role = (await create(lin, { name: 'Old', permissions: [] })).body
    const ids = await roleIds(wsA)
    await t.db.query(`UPDATE projects SET default_role_id = $1 WHERE id = $2`, [role.id, gone.id])
    await t.db.query(`UPDATE project_members SET role_id = $1 WHERE project_id = $2`, [role.id, gone.id])
    await t.db.query(`UPDATE projects SET deleted_at = now() WHERE id = $1`, [gone.id])
    await t.db.query(`INSERT INTO project_members (project_id, user_id, role_id) VALUES ($1, $2, $3)`, [live.id, kai.user.id, role.id])
    await t.http.delete(`${base}/roles/${role.id}`).set(lin.auth).expect(204)
    const [p] = await t.db.query(`SELECT default_role_id FROM projects WHERE id = $1`, [gone.id])
    expect(p.default_role_id).toBe(ids.member)
  })

  it("another workspace's role is 404 role_not_found", async () => {
    const theirs = await roleIds(wsB)
    expect((await t.http.patch(`${base}/roles/${theirs.viewer}`).set(lin.auth).send({ name: 'x' }).expect(404)).body.code).toBe('role_not_found')
    expect((await t.http.delete(`${base}/roles/${theirs.viewer}`).set(lin.auth).expect(404)).body.code).toBe('role_not_found')
  })
})
