import { randomUUID } from 'node:crypto'
import { createTestApp, resetAll, type TestApp } from './utils/app'
import { signedIn } from './utils/seed'

describe('workspaces', () => {
  let t: TestApp
  beforeAll(async () => { t = await createTestApp() })
  beforeEach(() => resetAll(t))
  afterAll(() => t.app.close())

  const create = (auth: Record<string, string>, body: object) => t.http.post('/api/v1/workspaces').set(auth).send(body)

  it('creating a workspace makes you its owner', async () => {
    const lin = await signedIn(t)
    const res = await create(lin.auth, { name: 'Pane Studio', team: 'Design', title: 'Lead' }).expect(201)
    expect(res.body.workspace).toMatchObject({ name: 'Pane Studio', slug: 'pane-studio' })
    expect(res.body.member).toMatchObject({ id: lin.user.id, email: 'lin@pane.app', access: 'owner', team: 'Design', role: 'Lead', presence: 'away', capacity: 32, tz: 'UTC' })
    const mine = await t.http.get('/api/v1/me/workspaces').set(lin.auth).expect(200)
    expect(mine.body).toEqual([{ id: res.body.workspace.id, name: 'Pane Studio', slug: 'pane-studio', access: 'owner' }])
  })

  it('two workspaces with the same name get different slugs', async () => {
    const lin = await signedIn(t)
    const a = await create(lin.auth, { name: 'Pane Studio' }).expect(201)
    const b = await create(lin.auth, { name: 'Pane Studio' }).expect(201)
    expect(a.body.workspace.slug).toBe('pane-studio')
    expect(b.body.workspace.slug).not.toBe('pane-studio')
    expect(b.body.workspace.slug).toMatch(/^pane-studio-[a-z0-9]{4}$/)
  })

  it('an empty name is 400 invalid on field name', async () => {
    const lin = await signedIn(t)
    const res = await create(lin.auth, { name: '   ' }).expect(400)
    expect(res.body).toMatchObject({ code: 'invalid', field: 'name' })
  })

  it('a member can read the workspace but only owner/admin can rename it', async () => {
    const lin = await signedIn(t)
    const nia = await signedIn(t, 'nia@pane.app')
    const ws = (await create(lin.auth, { name: 'Pane Studio' })).body.workspace.id
    await t.db.query(`INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'member')`, [ws, nia.user.id])
    const got = await t.http.get(`/api/v1/workspaces/${ws}`).set(nia.auth).expect(200)
    expect(got.body).toMatchObject({ id: ws, name: 'Pane Studio', slug: 'pane-studio', access: 'member' })
    const denied = await t.http.patch(`/api/v1/workspaces/${ws}`).set(nia.auth).send({ name: 'Mine' }).expect(403)
    expect(denied.body.code).toBe('forbidden')
    const ok = await t.http.patch(`/api/v1/workspaces/${ws}`).set(lin.auth).send({ name: 'Pane HQ' }).expect(200)
    expect(ok.body).toMatchObject({ name: 'Pane HQ', slug: 'pane-studio' })
  })

  it('an unknown or malformed workspace id is 404 workspace_not_found', async () => {
    const lin = await signedIn(t)
    for (const id of [randomUUID(), 'abc']) {
      const res = await t.http.get(`/api/v1/workspaces/${id}`).set(lin.auth).expect(404)
      expect(res.body.code).toBe('workspace_not_found')
    }
  })

  it('no token is 401', async () => {
    await t.http.post('/api/v1/workspaces').send({ name: 'X' }).expect(401)
    await t.http.get('/api/v1/me/workspaces').expect(401)
  })
})
