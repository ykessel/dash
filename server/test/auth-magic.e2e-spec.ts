import { UsersService } from '../src/users/users.service'
import { createTestApp, resetAll, type TestApp } from './utils/app'
import { refreshCookie, seedUser } from './utils/seed'

describe('magic link', () => {
  let t: TestApp
  beforeAll(async () => { t = await createTestApp() })
  beforeEach(() => resetAll(t))
  afterAll(() => t.app.close())

  const ask = (email: string) => t.http.post('/api/v1/auth/magic-link').send({ email })
  const verify = (token: string) => t.http.post('/api/v1/auth/magic-link/verify').send({ token })

  it('signs in an existing account', async () => {
    await seedUser(t)
    await ask('Lin@Pane.app').expect(202)
    expect(t.mailer.lastTo('lin@pane.app')!.text).toContain('http://localhost:5173/#/auth/magic?token=')
    const res = await verify(t.mailer.tokenFor('lin@pane.app')).expect(200)
    expect(res.body).toEqual({ accessToken: expect.any(String), user: expect.objectContaining({ email: 'lin@pane.app' }), created: false })
    refreshCookie(res)
  })

  it('creates a verified account for a new email', async () => {
    await ask('new.person@co.com').expect(202)
    const res = await verify(t.mailer.tokenFor('new.person@co.com')).expect(200)
    expect(res.body.created).toBe(true)
    expect(res.body.user).toMatchObject({ email: 'new.person@co.com', name: 'new.person', emailVerified: true })
  })

  it('verifies an unverified account that signs in by link', async () => {
    const u = await seedUser(t, 'lin@pane.app', 'pane1234', false)
    await ask('lin@pane.app').expect(202)
    await verify(t.mailer.tokenFor('lin@pane.app')).expect(200)
    expect((await t.app.get(UsersService).findById(u.id))!.emailVerifiedAt).toBeInstanceOf(Date)
  })

  it('a link works once', async () => {
    await ask('lin@pane.app').expect(202)
    const token = t.mailer.tokenFor('lin@pane.app')
    await verify(token).expect(200)
    expect((await verify(token).expect(400)).body.code).toBe('token_used')
  })

  it('a mail scanner opening the link does not spend it', async () => {
    await ask('lin@pane.app').expect(202)
    const token = t.mailer.tokenFor('lin@pane.app')
    await t.http.get(`/api/v1/auth/magic-link/verify?token=${token}`).expect(404)
    await verify(token).expect(200)
  })

  it('asking again invalidates the earlier link', async () => {
    await ask('lin@pane.app').expect(202)
    const first = t.mailer.tokenFor('lin@pane.app')
    await ask('lin@pane.app').expect(202)
    expect((await verify(first).expect(400)).body.code).toBe('token_used')
    await verify(t.mailer.tokenFor('lin@pane.app')).expect(200)
  })

  it('expires after 15 minutes', async () => {
    await ask('lin@pane.app').expect(202)
    t.clock.advance(16 * 60_000)
    expect((await verify(t.mailer.tokenFor('lin@pane.app')).expect(400)).body.code).toBe('token_expired')
  })
})
