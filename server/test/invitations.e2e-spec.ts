import type { DomainEvent } from '../src/common/domain-events'
import { createTestApp, resetAll, type TestApp } from './utils/app'
import { captureEvents } from './utils/events'
import { seedUser, signedIn } from './utils/seed'

type Signed = Awaited<ReturnType<typeof signedIn>>
const DAY = 24 * 3600_000

describe('invitations', () => {
  let t: TestApp
  let events: DomainEvent[]
  let lin: Signed
  let ws: string
  beforeAll(async () => { t = await createTestApp(); events = captureEvents(t) })
  beforeEach(async () => {
    await resetAll(t)
    lin = await signedIn(t)
    ws = (await t.http.post('/api/v1/workspaces').set(lin.auth).send({ name: 'Pane Studio' })).body.workspace.id
    events.length = 0
  })
  afterAll(() => t.app.close())

  const invite = (auth: Record<string, string>, body: object) => t.http.post(`/api/v1/workspaces/${ws}/invitations`).set(auth).send(body)
  const accept = (auth: Record<string, string>, token: string) => t.http.post('/api/v1/invitations/accept').set(auth).send({ token })

  it('owner invites, invitee accepts and becomes a member with the invited role and team', async () => {
    const created = await invite(lin.auth, { email: 'Nia@Pane.app ', team: 'Design', title: 'Design Lead' }).expect(201)
    expect(created.body).toMatchObject({ email: 'nia@pane.app', role: 'member', team: 'Design', title: 'Design Lead', expiresAt: expect.any(String) })
    const mail = t.mailer.lastTo('nia@pane.app')!
    expect(mail.subject).toBe('lin invited you to Pane Studio on Pane')
    expect(mail.text).toContain('http://localhost:5173/#/invite?token=')
    const token = t.mailer.tokenFor('nia@pane.app')

    const nia = await signedIn(t, 'nia@pane.app')
    const res = await accept(nia.auth, token).expect(200)
    expect(res.body.workspace).toEqual({ id: ws, name: 'Pane Studio', slug: 'pane-studio' })
    expect(res.body.member).toMatchObject({ id: nia.user.id, access: 'member', team: 'Design', role: 'Design Lead' })
    expect(events).toEqual([expect.objectContaining({ type: 'member.joined', workspaceId: ws, actor: { userId: nia.user.id }, data: { member: res.body.member } })])
    await t.http.get(`/api/v1/workspaces/${ws}`).set(nia.auth).expect(200)

    const again = await accept(nia.auth, token).expect(400)
    expect(again.body.code).toBe('token_used')
  })

  it('accepting with a different account is 403 invite_email_mismatch and adds nobody', async () => {
    await invite(lin.auth, { email: 'ana@pane.app', team: 'Design' }).expect(201)
    const bob = await signedIn(t, 'bob@pane.app')
    const res = await accept(bob.auth, t.mailer.tokenFor('ana@pane.app')).expect(403)
    expect(res.body.code).toBe('invite_email_mismatch')
    await t.http.get(`/api/v1/workspaces/${ws}`).set(bob.auth).expect(403)
    expect(events).toEqual([])
  })

  it('an invite older than 7 days is token_expired', async () => {
    await invite(lin.auth, { email: 'nia@pane.app', team: 'Design' }).expect(201)
    t.clock.advance(7 * DAY + 1)
    const nia = await signedIn(t, 'nia@pane.app')
    expect((await accept(nia.auth, t.mailer.tokenFor('nia@pane.app')).expect(400)).body.code).toBe('token_expired')
  })

  it('a revoked invite is token_invalid and no longer listed', async () => {
    const { body } = await invite(lin.auth, { email: 'nia@pane.app', team: 'Design' }).expect(201)
    expect((await t.http.get(`/api/v1/workspaces/${ws}/invitations`).set(lin.auth).expect(200)).body).toEqual([expect.objectContaining({ id: body.id })])
    await t.http.delete(`/api/v1/workspaces/${ws}/invitations/${body.id}`).set(lin.auth).expect(204)
    expect((await t.http.get(`/api/v1/workspaces/${ws}/invitations`).set(lin.auth).expect(200)).body).toEqual([])
    const nia = await signedIn(t, 'nia@pane.app')
    expect((await accept(nia.auth, t.mailer.tokenFor('nia@pane.app')).expect(400)).body.code).toBe('token_invalid')
  })

  it('inviting again replaces the pending invite', async () => {
    await invite(lin.auth, { email: 'nia@pane.app', team: 'Design' }).expect(201)
    const first = t.mailer.tokenFor('nia@pane.app')
    await invite(lin.auth, { email: 'nia@pane.app', team: 'Engineering' }).expect(201)
    const list = (await t.http.get(`/api/v1/workspaces/${ws}/invitations`).set(lin.auth)).body
    expect(list).toHaveLength(1)
    expect(list[0].team).toBe('Engineering')
    const nia = await signedIn(t, 'nia@pane.app')
    expect((await accept(nia.auth, first).expect(400)).body.code).toBe('token_invalid')
  })

  it('inviting an existing member is 409 already_member', async () => {
    const res = await invite(lin.auth, { email: 'LIN@pane.app', team: 'Design' }).expect(409)
    expect(res.body).toMatchObject({ code: 'already_member', field: 'email' })
  })

  it('a plain member cannot invite or see invites', async () => {
    const nia = await signedIn(t, 'nia@pane.app')
    await t.db.query(`INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'member')`, [ws, nia.user.id])
    expect((await invite(nia.auth, { email: 'kai@pane.app', team: 'Design' }).expect(403)).body.code).toBe('forbidden')
    await t.http.get(`/api/v1/workspaces/${ws}/invitations`).set(nia.auth).expect(403)
  })

  it('accepting verifies an unverified account with that email', async () => {
    await seedUser(t, 'nia@pane.app', 'pane1234', false)
    await invite(lin.auth, { email: 'nia@pane.app', team: 'Design' }).expect(201)
    const nia = await signedIn(t, 'nia@pane.app')
    await accept(nia.auth, t.mailer.tokenFor('nia@pane.app')).expect(200)
    expect((await t.http.get('/api/v1/me').set(nia.auth).expect(200)).body.emailVerified).toBe(true)
  })

  it('a bad body is 400 invalid', async () => {
    expect((await invite(lin.auth, { email: 'nope', team: 'Design' }).expect(400)).body).toMatchObject({ code: 'invalid', field: 'email' })
    expect((await invite(lin.auth, { email: 'nia@pane.app', team: 'Sales' }).expect(400)).body).toMatchObject({ code: 'invalid', field: 'team' })
  })
})
