import type { Socket } from 'socket.io-client'
import { PRESENCE_GRACE_MS } from '../src/realtime/presence.service'
import type { Person } from '../src/workspaces/person'
import { createTestApp, resetAll, type TestApp } from './utils/app'
import { signedIn } from './utils/seed'
import { closeSockets, connect, eventWhere, nextEvent, noEvent } from './utils/socket'

/** Two instances sharing Redis, as on Fly with more than one machine. Needs TEST_REDIS_URL. */
const REDIS = process.env.TEST_REDIS_URL
const GRACE = 100
const maybe = REDIS ? describe : describe.skip

maybe('two instances over Redis', () => {
  let a: TestApp
  let b: TestApp
  let ana: Awaited<ReturnType<typeof signedIn>>
  let ben: Awaited<ReturnType<typeof signedIn>>
  let ws: string
  let project: string

  beforeAll(async () => {
    const opts = { redisUrl: REDIS }
    a = await createTestApp(m => m.overrideProvider(PRESENCE_GRACE_MS).useValue(GRACE), opts)
    b = await createTestApp(m => m.overrideProvider(PRESENCE_GRACE_MS).useValue(GRACE), opts)
  })
  beforeEach(async () => {
    await resetAll(a)
    await resetAll(b)
    ana = await signedIn(a)
    ben = await signedIn(a, 'ben@pane.app')
    ws = (await a.http.post('/api/v1/workspaces').set(ana.auth).send({ name: 'Pane' })).body.workspace.id
    await a.db.query(`INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'member')`, [ws, ben.user.id])
    project = (await a.http.post(`/api/v1/workspaces/${ws}/projects`).set(ana.auth)
      .send({ name: 'Launch', desc: '', hue: 'blue', icon: 'rocket', due: '2026-12-01', status: 'planning' })).body.id
  })
  afterEach(async () => {
    closeSockets()
    await new Promise(r => setTimeout(r, GRACE * 3))
  })
  afterAll(async () => {
    await a.app.close()
    await b.app.close()
  })

  const presenceOf = async (userId: string) => {
    const res = await a.http.get(`/api/v1/workspaces/${ws}/members`).set(ana.auth).expect(200)
    return (res.body as Person[]).find(p => p.id === userId)!.presence
  }
  const newTask = (clientId?: string) => {
    const req = a.http.post(`/api/v1/workspaces/${ws}/tasks`).set(ana.auth)
    return (clientId ? req.set('X-Client-Id', clientId) : req).send({ title: 'Ship it', project, assignee: null }).expect(201)
  }

  it('an event published on A reaches a socket on B', async () => {
    const s = await connect(b, ben.token)
    const got = nextEvent(s, 'task.created', 2000)
    await newTask()
    expect(await got).toMatchObject({ workspaceId: ws, task: { title: 'Ship it' } })
  })

  it('my own tab on B is not echoed a change I made through A', async () => {
    const mine: Socket = await connect(b, ana.token, 'c1')
    const other = await connect(b, ana.token, 'c2')
    const seen = nextEvent(other, 'task.created', 2000)
    const quiet = noEvent(mine, 'task.created', 800)
    await newTask('c1')
    await seen
    await quiet
  })

  it('closing my last socket on A while one is open on B keeps me online', async () => {
    const onA = await connect(a, ben.token)
    const watcher = await connect(b, ana.token)
    await connect(b, ben.token)
    const away = eventWhere(watcher, 'presence.changed', (p: { userId: string; presence: string }) => p.userId === ben.user.id && p.presence === 'away', GRACE * 5)
    onA.close()
    await expect(away).rejects.toThrow()
    expect(await presenceOf(ben.user.id)).toBe('online')
  })

  it('an instance booting while I am connected elsewhere keeps me online', async () => {
    await connect(a, ben.token)
    await new Promise(r => setTimeout(r, 200))
    expect(await presenceOf(ben.user.id)).toBe('online')
    const c = await createTestApp(m => m.overrideProvider(PRESENCE_GRACE_MS).useValue(GRACE), { redisUrl: REDIS })
    try {
      expect(await presenceOf(ben.user.id)).toBe('online')
    } finally {
      await c.app.close()
    }
  })
})
