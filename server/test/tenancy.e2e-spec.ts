import { createTestApp, resetAll, type TestApp } from './utils/app'
import { signedIn } from './utils/seed'

type Method = 'get' | 'patch' | 'post' | 'put' | 'delete'
const ANY = '00000000-0000-4000-8000-000000000000'

/** Every team-scoped route. Each task that adds routes adds them here. */
const routes: [Method, (ws: string, ctx: { otherId: string }) => string][] = [
  ['get', ws => `/api/v1/workspaces/${ws}`],
  ['patch', ws => `/api/v1/workspaces/${ws}`],
  ['get', ws => `/api/v1/workspaces/${ws}/members`],
  ['patch', (ws, c) => `/api/v1/workspaces/${ws}/members/${c.otherId}`],
  ['delete', (ws, c) => `/api/v1/workspaces/${ws}/members/${c.otherId}`],
  ['patch', ws => `/api/v1/workspaces/${ws}/members/me/presence`],
  ['post', ws => `/api/v1/workspaces/${ws}/invitations`],
  ['get', ws => `/api/v1/workspaces/${ws}/invitations`],
  ['delete', ws => `/api/v1/workspaces/${ws}/invitations/00000000-0000-4000-8000-000000000000`],
  ['get', ws => `/api/v1/workspaces/${ws}/projects`],
  ['post', ws => `/api/v1/workspaces/${ws}/projects`],
  ['get', ws => `/api/v1/workspaces/${ws}/projects/${ANY}`],
  ['patch', ws => `/api/v1/workspaces/${ws}/projects/${ANY}`],
  ['delete', ws => `/api/v1/workspaces/${ws}/projects/${ANY}`],
  ['put', ws => `/api/v1/workspaces/${ws}/projects/${ANY}/members`],
  ['put', ws => `/api/v1/workspaces/${ws}/projects/${ANY}/prefs`],
  ['post', ws => `/api/v1/workspaces/${ws}/projects/${ANY}/milestones`],
  ['patch', ws => `/api/v1/workspaces/${ws}/projects/${ANY}/milestones/${ANY}`],
  ['delete', ws => `/api/v1/workspaces/${ws}/projects/${ANY}/milestones/${ANY}`],
  ['get', ws => `/api/v1/workspaces/${ws}/tasks`],
  ['post', ws => `/api/v1/workspaces/${ws}/tasks`],
  ['get', ws => `/api/v1/workspaces/${ws}/tasks/${ANY}`],
  ['patch', ws => `/api/v1/workspaces/${ws}/tasks/${ANY}`],
  ['delete', ws => `/api/v1/workspaces/${ws}/tasks/${ANY}`],
  ['post', ws => `/api/v1/workspaces/${ws}/tasks/${ANY}/restore`],
  ['post', ws => `/api/v1/workspaces/${ws}/tasks/${ANY}/move`],
  ['post', ws => `/api/v1/workspaces/${ws}/tasks/${ANY}/subtasks`],
  ['patch', ws => `/api/v1/workspaces/${ws}/tasks/${ANY}/subtasks/${ANY}`],
  ['delete', ws => `/api/v1/workspaces/${ws}/tasks/${ANY}/subtasks/${ANY}`],
  ['post', ws => `/api/v1/workspaces/${ws}/tasks/${ANY}/comments`],
  ['delete', ws => `/api/v1/workspaces/${ws}/tasks/${ANY}/comments/${ANY}`],
  ['get', ws => `/api/v1/workspaces/${ws}/events?from=2026-01-01&to=2026-01-31`],
  ['post', ws => `/api/v1/workspaces/${ws}/events`],
  ['patch', ws => `/api/v1/workspaces/${ws}/events/${ANY}`],
  ['delete', ws => `/api/v1/workspaces/${ws}/events/${ANY}`],
  ['post', ws => `/api/v1/workspaces/${ws}/events/${ANY}/restore`],
  ['get', ws => `/api/v1/workspaces/${ws}/notifications`],
  ['post', ws => `/api/v1/workspaces/${ws}/notifications/read-all`],
  ['post', ws => `/api/v1/workspaces/${ws}/focus-sessions`],
  ['patch', ws => `/api/v1/workspaces/${ws}/focus-sessions/${ANY}`],
  ['get', ws => `/api/v1/workspaces/${ws}/focus-sessions?from=2026-01-01&to=2026-01-31`],
  ['get', ws => `/api/v1/workspaces/${ws}/snapshot`],
  ['get', ws => `/api/v1/workspaces/${ws}/insights`],
  ['get', ws => `/api/v1/workspaces/${ws}/insights.csv`],
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
