import { createTestApp, resetAll, type TestApp } from './utils/app'
import { signedIn } from './utils/seed'

type Method = 'get' | 'patch' | 'post' | 'delete'

/** Every team-scoped route. Each task that adds routes adds them here. */
const routes: [Method, (ws: string, ctx: { otherId: string }) => string][] = [
  ['get', ws => `/api/v1/workspaces/${ws}`],
  ['patch', ws => `/api/v1/workspaces/${ws}`],
  ['get', ws => `/api/v1/workspaces/${ws}/members`],
  ['patch', (ws, c) => `/api/v1/workspaces/${ws}/members/${c.otherId}`],
  ['delete', (ws, c) => `/api/v1/workspaces/${ws}/members/${c.otherId}`],
  ['patch', ws => `/api/v1/workspaces/${ws}/members/me/presence`],
]

describe('tenant isolation', () => {
  let t: TestApp
  let wsA: string
  let ctx: { otherId: string }
  let nia: Awaited<ReturnType<typeof signedIn>>
  beforeAll(async () => { t = await createTestApp() })
  beforeEach(async () => {
    await resetAll(t)
    const lin = await signedIn(t)
    nia = await signedIn(t, 'nia@pane.app')
    wsA = (await t.http.post('/api/v1/workspaces').set(lin.auth).send({ name: 'Team A' })).body.workspace.id
    await t.http.post('/api/v1/workspaces').set(nia.auth).send({ name: 'Team B' }).expect(201)
    ctx = { otherId: lin.user.id }
  })
  afterAll(() => t.app.close())

  it.each(routes)('%s %p from another team is 403 not_a_member and leaks nothing', async (m, path) => {
    const res = await t.http[m](path(wsA, ctx)).set(nia.auth).send({ name: 'x', presence: 'online', email: 'x@pane.app', team: 'Design', token: 'x' }).expect(403)
    expect(res.body).toEqual({ code: 'not_a_member', message: expect.any(String) })
  })
})
