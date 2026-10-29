import type { Socket } from 'socket.io-client'
import { PRESENCE_GRACE_MS, PresenceService } from '../src/realtime/presence.service'
import { MembersService } from '../src/workspaces/members.service'
import type { Person } from '../src/workspaces/person'
import { createTestApp, resetAll, type TestApp } from './utils/app'
import { signedIn } from './utils/seed'
import { closeSockets, connect, eventWhere } from './utils/socket'

type Signed = Awaited<ReturnType<typeof signedIn>>
const GRACE = 100

describe('presence', () => {
  let t: TestApp
  let lin: Signed
  let nia: Signed
  let ws: string
  beforeAll(async () => { t = await createTestApp(b => b.overrideProvider(PRESENCE_GRACE_MS).useValue(GRACE)) })
  beforeEach(async () => {
    await resetAll(t)
    lin = await signedIn(t)
    nia = await signedIn(t, 'nia@pane.app')
    ws = (await t.http.post('/api/v1/workspaces').set(lin.auth).send({ name: 'Pane' })).body.workspace.id
  })
  afterEach(async () => {
    closeSockets()
    await new Promise(r => setTimeout(r, GRACE * 2)) // let pending away timers fire before the next reset
  })
  afterAll(() => t.app.close())

  const presenceOf = async (userId: string) => {
    const res = await t.http.get(`/api/v1/workspaces/${ws}/members`).set(lin.auth).expect(200)
    return (res.body as Person[]).find(p => p.id === userId)!.presence
  }
  const changeFor = (s: Socket, userId: string, presence: string, ms = 1000) =>
    eventWhere(s, 'presence.changed', (p: { userId: string; presence: string }) => p.userId === userId && p.presence === presence, ms)
  const noChangeFor = (s: Socket, userId: string, ms = GRACE * 3) =>
    changeFor(s, userId, 'away', ms).then(p => { throw new Error(`unexpected presence.changed ${JSON.stringify(p)}`) }, () => undefined)
  const join = () => t.db.query(`INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'member')`, [ws, nia.user.id])

  it('done when: lin creates a team, invites nia, nia accepts and both see each other online live', async () => {
    await t.http.post(`/api/v1/workspaces/${ws}/invitations`).set(lin.auth).send({ email: 'nia@pane.app', team: 'Design' }).expect(201)
    const a = await connect(t, lin.token)
    await t.http.post('/api/v1/invitations/accept').set(nia.auth).send({ token: t.mailer.tokenFor('nia@pane.app') }).expect(200)
    const seen = changeFor(a, nia.user.id, 'online')
    const b = await connect(t, nia.token)
    expect(await seen).toMatchObject({ by: nia.user.id, userId: nia.user.id, presence: 'online', at: expect.any(String) })
    expect(b.connected).toBe(true)
    const res = await t.http.get(`/api/v1/workspaces/${ws}/members`).set(nia.auth).expect(200)
    expect((res.body as Person[]).map(p => p.presence)).toEqual(['online', 'online'])
  })

  it('closing the last socket turns you away after the grace period', async () => {
    await join()
    const a = await connect(t, lin.token)
    const b = await connect(t, nia.token)
    const away = changeFor(a, nia.user.id, 'away')
    b.close()
    await away
    expect(await presenceOf(nia.user.id)).toBe('away')
  })

  it('closing one of two tabs keeps you online', async () => {
    await join()
    const a = await connect(t, lin.token)
    const [b1] = await Promise.all([connect(t, nia.token), connect(t, nia.token)])
    const quiet = noChangeFor(a, nia.user.id)
    b1.close()
    await quiet
    expect(await presenceOf(nia.user.id)).toBe('online')
  })

  it('reconnecting within the grace period never shows away', async () => {
    await join()
    const a = await connect(t, lin.token)
    const b = await connect(t, nia.token)
    const quiet = noChangeFor(a, nia.user.id)
    b.close()
    await connect(t, nia.token)
    await quiet
    expect(await presenceOf(nia.user.id)).toBe('online')
  })

  it('connecting does not overwrite focus', async () => {
    await join()
    await t.http.patch(`/api/v1/workspaces/${ws}/members/me/presence`).set(nia.auth).send({ presence: 'focus', note: 'deep work' }).expect(200)
    const a = await connect(t, lin.token)
    const quiet = changeFor(a, nia.user.id, 'online', GRACE * 3).then(() => { throw new Error('focus was overwritten') }, () => undefined)
    await connect(t, nia.token)
    await quiet
    expect(await presenceOf(nia.user.id)).toBe('focus')
  })

  it('creating a workspace while connected joins its room and shows you online there', async () => {
    const a = await connect(t, lin.token)
    const created = await t.http.post('/api/v1/workspaces').set(lin.auth).send({ name: 'Second' }).expect(201)
    const ws2 = created.body.workspace.id
    await eventWhere(a, 'presence.changed', (p: { userId: string; presence: string; by: string }) => p.userId === lin.user.id && p.presence === 'online')
    const res = await t.http.get(`/api/v1/workspaces/${ws2}/members`).set(lin.auth).expect(200)
    expect((res.body as Person[])[0].presence).toBe('online')
    const renamed = eventWhere(a, 'workspace.updated', (p: { workspace: { id: string } }) => p.workspace.id === ws2)
    await t.http.patch(`/api/v1/workspaces/${ws2}`).set(lin.auth).send({ name: 'Second HQ' }).expect(200)
    await renamed
  })

  it('accepting an invite while connected shows you online to the team live', async () => {
    const a = await connect(t, lin.token)
    await connect(t, nia.token)
    await t.http.post(`/api/v1/workspaces/${ws}/invitations`).set(lin.auth).send({ email: 'nia@pane.app', team: 'Design' }).expect(201)
    const seen = changeFor(a, nia.user.id, 'online')
    await t.http.post('/api/v1/invitations/accept').set(nia.auth).send({ token: t.mailer.tokenFor('nia@pane.app') }).expect(200)
    await seen
    expect(await presenceOf(nia.user.id)).toBe('online')
  })

  it('reconnecting while the away write is in flight still ends online', async () => {
    await join()
    const members = t.app.get(MembersService)
    const original = members.setPresenceWhere.bind(members)
    const spy = jest.spyOn(members, 'setPresenceWhere').mockImplementation(async (userId, from, to) => {
      if (to === 'away') await new Promise(r => setTimeout(r, 150))
      return original(userId, from, to)
    })
    try {
      const b = await connect(t, nia.token)
      await new Promise(r => setTimeout(r, 50))
      b.close()
      await new Promise(r => setTimeout(r, GRACE + 50)) // the away write has started and is still waiting
      await connect(t, nia.token)
      await new Promise(r => setTimeout(r, 400))
      expect(await presenceOf(nia.user.id)).toBe('online')
    } finally {
      spy.mockRestore()
    }
  })

  it('on boot, presence left over from a previous run is reset to away', async () => {
    await join()
    await t.db.query(`UPDATE memberships SET presence = 'online' WHERE user_id = $1`, [lin.user.id])
    await t.db.query(`UPDATE memberships SET presence = 'focus', presence_note = 'x' WHERE user_id = $1`, [nia.user.id])
    const fresh = await createTestApp(b => b.overrideProvider(PRESENCE_GRACE_MS).useValue(GRACE))
    try {
      const rows: { presence: string; presence_note: string | null }[] = await t.db.query(`SELECT presence, presence_note FROM memberships WHERE workspace_id = $1`, [ws])
      expect(rows).toEqual([{ presence: 'away', presence_note: null }, { presence: 'away', presence_note: null }])
    } finally {
      await fresh.app.close()
    }
  })

  it('the boot reset spares whoever is connected (another instance starting mid-session)', async () => {
    await join()
    const a = await connect(t, lin.token)
    await t.db.query(`UPDATE memberships SET presence = 'online' WHERE user_id = $1`, [nia.user.id])
    await t.app.get(PresenceService).onApplicationBootstrap()
    expect(await presenceOf(lin.user.id)).toBe('online')
    expect(await presenceOf(nia.user.id)).toBe('away')
    expect(a.connected).toBe(true)
  })
})
