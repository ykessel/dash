import type { DomainEvent } from '../src/common/domain-events'
import { createTestApp, resetAll, type TestApp } from './utils/app'
import { captureEvents } from './utils/events'
import { signedIn } from './utils/seed'

type Signed = Awaited<ReturnType<typeof signedIn>>

describe('members', () => {
  let t: TestApp
  let events: DomainEvent[]
  let lin: Signed
  let nia: Signed
  let kai: Signed
  let ws: string
  beforeAll(async () => { t = await createTestApp(); events = captureEvents(t) })
  beforeEach(async () => {
    await resetAll(t)
    lin = await signedIn(t)
    nia = await signedIn(t, 'nia@pane.app')
    kai = await signedIn(t, 'kai@pane.app')
    ws = (await t.http.post('/api/v1/workspaces').set(lin.auth).send({ name: 'Pane' })).body.workspace.id
    for (const u of [nia, kai]) await t.db.query(`INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'member')`, [ws, u.user.id])
    events.length = 0
  })
  afterAll(() => t.app.close())

  const member = (id: string) => `/api/v1/workspaces/${ws}/members/${id}`

  it('lists everyone in the team with the frontend Person shape', async () => {
    const res = await t.http.get(`/api/v1/workspaces/${ws}/members`).set(nia.auth).expect(200)
    expect(res.body.map((p: { email: string }) => p.email)).toEqual(['kai@pane.app', 'lin@pane.app', 'nia@pane.app'])
    expect(res.body[1]).toMatchObject({ id: lin.user.id, name: 'lin', access: 'owner', team: 'Product', role: '', presence: 'away', capacity: 32 })
  })

  it('a member edits their own profile and the change is published once', async () => {
    const res = await t.http.patch(member(nia.user.id)).set(nia.auth).set('X-Client-Id', 'tab-1')
      .send({ team: 'Engineering', title: 'iOS Engineer', city: 'Lagos', tz: 'Africa/Lagos', capacity: 36 }).expect(200)
    expect(res.body).toMatchObject({ team: 'Engineering', role: 'iOS Engineer', city: 'Lagos', tz: 'Africa/Lagos', capacity: 36 })
    expect(events).toEqual([expect.objectContaining({
      type: 'member.updated',
      workspaceId: ws,
      actor: { userId: nia.user.id, clientId: 'tab-1' },
      data: { member: expect.objectContaining({ id: nia.user.id, team: 'Engineering' }) },
    })])
  })

  it('a member cannot promote themselves or edit someone else', async () => {
    expect((await t.http.patch(member(nia.user.id)).set(nia.auth).send({ role: 'admin' }).expect(403)).body.code).toBe('forbidden')
    expect((await t.http.patch(member(kai.user.id)).set(nia.auth).send({ title: 'Intern' }).expect(403)).body.code).toBe('forbidden')
    expect(events).toEqual([])
  })

  it('an admin can change roles and other people’s profiles, but not the owner', async () => {
    await t.http.patch(member(nia.user.id)).set(lin.auth).send({ role: 'admin' }).expect(200)
    const res = await t.http.patch(member(kai.user.id)).set(nia.auth).send({ title: 'Engineer', role: 'admin' }).expect(200)
    expect(res.body).toMatchObject({ role: 'Engineer', access: 'admin' })
    expect((await t.http.patch(member(lin.user.id)).set(nia.auth).send({ role: 'member' }).expect(403)).body.code).toBe('cannot_change_owner')
  })

  it.each([
    [{ tz: 'Mars/Olympus' }, 'tz'],
    [{ capacity: 0 }, 'capacity'],
    [{ capacity: 81 }, 'capacity'],
    [{ team: 'Sales' }, 'team'],
    [{ role: 'owner' }, 'role'],
  ])('%p is 400 invalid on field %s', async (body, field) => {
    const res = await t.http.patch(member(nia.user.id)).set(lin.auth).send(body).expect(400)
    expect(res.body).toMatchObject({ code: 'invalid', field })
  })

  it('anyone can leave, the owner cannot leave and cannot be removed', async () => {
    await t.http.delete(member(nia.user.id)).set(nia.auth).expect(204)
    expect(events).toEqual([expect.objectContaining({ type: 'member.left', data: { userId: nia.user.id } })])
    expect((await t.http.delete(member(lin.user.id)).set(lin.auth).expect(409)).body.code).toBe('owner_cannot_leave')
    await t.db.query(`UPDATE memberships SET role = 'admin' WHERE user_id = $1`, [kai.user.id])
    expect((await t.http.delete(member(lin.user.id)).set(kai.auth).expect(403)).body.code).toBe('cannot_change_owner')
    await t.http.get(`/api/v1/workspaces/${ws}`).set(nia.auth).expect(403)
  })

  it('only owner/admin remove others', async () => {
    await t.http.delete(member(kai.user.id)).set(nia.auth).expect(403)
    await t.http.delete(member(kai.user.id)).set(lin.auth).expect(204)
  })

  it('an unknown member is 404 member_not_found', async () => {
    const res = await t.http.patch(member('00000000-0000-4000-8000-000000000000')).set(lin.auth).send({ title: 'x' }).expect(404)
    expect(res.body.code).toBe('member_not_found')
  })

  it('presence: focus with a note shows in the list and is published', async () => {
    const res = await t.http.patch(`/api/v1/workspaces/${ws}/members/me/presence`).set(nia.auth).send({ presence: 'focus', note: 'until 11:30 AM' }).expect(200)
    expect(res.body).toMatchObject({ id: nia.user.id, presence: 'focus', note: 'until 11:30 AM' })
    expect(events).toEqual([expect.objectContaining({ type: 'presence.changed', data: { userId: nia.user.id, presence: 'focus', note: 'until 11:30 AM' } })])
    await t.http.patch(`/api/v1/workspaces/${ws}/members/me/presence`).set(nia.auth).send({ presence: 'online' }).expect(200)
    const list = await t.http.get(`/api/v1/workspaces/${ws}/members`).set(lin.auth).expect(200)
    const me = list.body.find((p: { id: string }) => p.id === nia.user.id)
    expect(me.presence).toBe('online')
    expect(me.note).toBeUndefined()
  })

  it('renaming the workspace is published', async () => {
    await t.http.patch(`/api/v1/workspaces/${ws}`).set(lin.auth).send({ name: 'Pane HQ' }).expect(200)
    expect(events).toEqual([expect.objectContaining({ type: 'workspace.updated', data: { workspace: { id: ws, name: 'Pane HQ', slug: 'pane' } } })])
  })
})
