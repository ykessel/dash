import { createTestApp, resetAll, type TestApp } from './utils/app'
import { signedIn } from './utils/seed'
import { closeSockets, connect, nextEvent, noEvent } from './utils/socket'

type Signed = Awaited<ReturnType<typeof signedIn>>

describe('realtime', () => {
  let t: TestApp
  let lin: Signed
  let nia: Signed
  let kai: Signed
  let ws: string
  beforeAll(async () => { t = await createTestApp() })
  beforeEach(async () => {
    await resetAll(t)
    lin = await signedIn(t)
    nia = await signedIn(t, 'nia@pane.app')
    kai = await signedIn(t, 'kai@pane.app')
    ws = (await t.http.post('/api/v1/workspaces').set(lin.auth).send({ name: 'Pane' })).body.workspace.id
    await t.http.post('/api/v1/workspaces').set(kai.auth).send({ name: 'Other team' }).expect(201)
  })
  afterEach(() => closeSockets())
  afterAll(() => t.app.close())

  const join = (u: Signed) => t.db.query(`INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'member')`, [ws, u.user.id])
  const rename = (name: string, clientId?: string) => {
    const r = t.http.patch(`/api/v1/workspaces/${ws}`).set(lin.auth)
    return (clientId ? r.set('X-Client-Id', clientId) : r).send({ name }).expect(200)
  }

  it('refuses a socket without a valid token', async () => {
    await expect(connect(t, 'nope')).rejects.toThrow('unauthorized')
    await expect(connect(t, '')).rejects.toThrow('unauthorized')
  })

  it('refuses an expired token with token_expired so the client can refresh', async () => {
    t.clock.advance(16 * 60_000)
    await expect(connect(t, lin.token)).rejects.toThrow('token_expired')
  })

  it('a change in the workspace reaches the other member but not the author tab nor another team', async () => {
    await join(nia)
    const [a, b, other] = await Promise.all([connect(t, lin.token, 'tab-a'), connect(t, nia.token), connect(t, kai.token)])
    const seen = nextEvent(b, 'workspace.updated')
    await rename('Pane HQ', 'tab-a')
    expect(await seen).toMatchObject({ by: lin.user.id, at: expect.any(String), workspace: { id: ws, name: 'Pane HQ' } })
    await Promise.all([noEvent(a, 'workspace.updated'), noEvent(other, 'workspace.updated')])
  })

  it('the author’s other tabs still get the change', async () => {
    const [, tabB] = await Promise.all([connect(t, lin.token, 'tab-a'), connect(t, lin.token, 'tab-b')])
    const seen = nextEvent(tabB, 'workspace.updated')
    await rename('Pane HQ', 'tab-a')
    await seen
  })

  it('accepting an invite while connected starts delivering that workspace’s events, and only that one', async () => {
    const [b, other] = await Promise.all([connect(t, nia.token), connect(t, kai.token)])
    await t.http.post(`/api/v1/workspaces/${ws}/invitations`).set(lin.auth).send({ email: 'nia@pane.app', team: 'Design' }).expect(201)
    const joined = nextEvent(b, 'member.joined')
    await t.http.post('/api/v1/invitations/accept').set(nia.auth).send({ token: t.mailer.tokenFor('nia@pane.app') }).expect(200)
    expect(await joined).toMatchObject({ member: { id: nia.user.id } })
    const seen = nextEvent(b, 'workspace.updated')
    await rename('Pane HQ')
    await seen
    await noEvent(other, 'workspace.updated')
  })

  it('a removed member stops receiving the workspace’s events', async () => {
    await join(nia)
    const b = await connect(t, nia.token)
    const left = nextEvent(b, 'member.left')
    await t.http.delete(`/api/v1/workspaces/${ws}/members/${nia.user.id}`).set(lin.auth).expect(204)
    expect(await left).toMatchObject({ userId: nia.user.id })
    const quiet = noEvent(b, 'workspace.updated')
    await rename('Pane HQ')
    await quiet
  })

  it('another person’s tab with the same client id still gets the change', async () => {
    await join(nia)
    const b = await connect(t, nia.token, 'tab-1')
    const seen = nextEvent(b, 'workspace.updated')
    await rename('Pane HQ', 'tab-1')
    await seen
  })

  it('HTTP rate limits do not break sockets', async () => {
    for (let i = 0; i < 3; i++) await connect(t, lin.token)
  })
})
