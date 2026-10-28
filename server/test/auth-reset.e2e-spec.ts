import { UsersService } from '../src/users/users.service'
import { createTestApp, resetAll, type TestApp } from './utils/app'
import { refreshCookie, seedUser } from './utils/seed'

describe('password reset', () => {
  let t: TestApp
  beforeAll(async () => { t = await createTestApp() })
  beforeEach(() => resetAll(t))
  afterAll(() => t.app.close())

  const forgot = (email: string) => t.http.post('/api/v1/auth/password/forgot').send({ email })
  const reset = (token: string, password: string) => t.http.post('/api/v1/auth/password/reset').send({ token, password })
  const login = (password: string) => t.http.post('/api/v1/auth/login').send({ email: 'lin@pane.app', password })

  it('resets with the mailed link and signs in', async () => {
    await seedUser(t)
    await forgot(' LIN@pane.app').expect(202)
    expect(t.mailer.lastTo('lin@pane.app')!.text).toContain('http://localhost:5173/#/auth/reset?token=')

    const res = await reset(t.mailer.tokenFor('lin@pane.app'), 'brand-new-pass').expect(200)
    expect(res.body).toEqual({ accessToken: expect.any(String), user: expect.objectContaining({ email: 'lin@pane.app' }) })
    refreshCookie(res)
    await login('brand-new-pass').expect(200)
    await login('pane1234').expect(401)
  })

  it('signs out every earlier session', async () => {
    await seedUser(t)
    const old = refreshCookie(await login('pane1234').expect(200))
    await forgot('lin@pane.app').expect(202)
    await reset(t.mailer.tokenFor('lin@pane.app'), 'brand-new-pass').expect(200)
    await t.http.post('/api/v1/auth/refresh').set('Cookie', old).expect(401)
  })

  it('unknown email: 202 and no mail', async () => {
    await forgot('ghost@pane.app').expect(202)
    expect(t.mailer.sent).toHaveLength(0)
  })

  it('rejects a short new password', async () => {
    await seedUser(t)
    await forgot('lin@pane.app').expect(202)
    const res = await reset(t.mailer.tokenFor('lin@pane.app'), 'short12').expect(400)
    expect(res.body).toMatchObject({ code: 'invalid', field: 'password' })
  })

  it('lets an OAuth-only account set a password and verifies the email', async () => {
    const u = await seedUser(t, 'lin@pane.app', null, false)
    await forgot('lin@pane.app').expect(202)
    await reset(t.mailer.tokenFor('lin@pane.app'), 'brand-new-pass').expect(200)
    await login('brand-new-pass').expect(200)
    expect((await t.app.get(UsersService).findById(u.id))!.emailVerifiedAt).toBeInstanceOf(Date)
  })

  it('a reset link works once and for 30 minutes', async () => {
    await seedUser(t)
    await forgot('lin@pane.app').expect(202)
    const token = t.mailer.tokenFor('lin@pane.app')
    await reset(token, 'brand-new-pass').expect(200)
    expect((await reset(token, 'another-pass').expect(400)).body.code).toBe('token_used')

    await forgot('lin@pane.app').expect(202)
    t.clock.advance(31 * 60_000)
    expect((await reset(t.mailer.tokenFor('lin@pane.app'), 'another-pass').expect(400)).body.code).toBe('token_expired')
  })
})
