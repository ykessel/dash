import { createTestApp, resetAll, type TestApp } from './utils/app'
import { refreshCookie, seedUser } from './utils/seed'

const SEC = 1000
const MIN = 60 * SEC

describe('login and sessions', () => {
  let t: TestApp
  beforeAll(async () => { t = await createTestApp() })
  beforeEach(async () => { await resetAll(t); await seedUser(t) })
  afterAll(() => t.app.close())

  const login = (body: object = {}) =>
    t.http.post('/api/v1/auth/login').send({ email: 'lin@pane.app', password: 'pane1234', remember: true, ...body })
  const refresh = (cookie: string) => t.http.post('/api/v1/auth/refresh').set('Cookie', cookie)

  it('logs in with any email casing and reaches /me', async () => {
    const res = await login({ email: ' LIN@pane.app' }).expect(200)
    const set = (res.headers['set-cookie'] as unknown as string[])[0]
    expect(set).toMatch(/^pane_rt=[\w-]+;/)
    expect(set).toMatch(/Path=\/api\/v1\/auth/)
    expect(set).toMatch(/HttpOnly/)
    expect(set).toMatch(/SameSite=Lax/)
    expect(set).toMatch(/Expires=/)
    const me = await t.http.get('/api/v1/me').set('Authorization', `Bearer ${res.body.accessToken}`).expect(200)
    expect(me.body).toEqual({ id: expect.any(String), email: 'lin@pane.app', name: 'lin', emailVerified: true, avatarSkin: expect.any(Number), providers: ['password'] })
  })

  it('remember=false sets a browser-session cookie', async () => {
    const res = await login({ remember: false }).expect(200)
    expect((res.headers['set-cookie'] as unknown as string[])[0]).not.toMatch(/Expires=/)
  })

  it('wrong password, unknown email and OAuth-only accounts give the same answer', async () => {
    await seedUser(t, 'oauth@pane.app', null)
    const a = await login({ password: 'wrongpass' }).expect(401)
    const b = await login({ email: 'ghost@pane.app' }).expect(401)
    const c = await login({ email: 'oauth@pane.app' }).expect(401)
    expect(a.body).toEqual({ code: 'bad_credentials', field: 'password', message: 'Email or password is incorrect.' })
    expect(b.body).toEqual(a.body)
    expect(c.body).toEqual(a.body)
  })

  it('signup returns a session', async () => {
    const res = await t.http.post('/api/v1/auth/signup').send({ name: 'Alex Rivera', email: 'alex@co.com', password: 'longenough1' }).expect(201)
    expect(res.body).toEqual({ accessToken: expect.any(String), user: expect.objectContaining({ email: 'alex@co.com', emailVerified: false }) })
    refreshCookie(res)
  })

  it('rotates refresh tokens and revokes the family when an old one comes back late', async () => {
    const first = refreshCookie(await login().expect(200))
    const r1 = await refresh(first).expect(200)
    const second = refreshCookie(r1)
    expect(second).not.toBe(first)
    expect(r1.body.accessToken).toEqual(expect.any(String))

    t.clock.advance(31 * SEC)
    const stolen = await refresh(first).expect(401)
    expect(stolen.body.code).toBe('session_revoked')
    await refresh(second).expect(401)
  })

  it('two tabs refreshing at once both succeed', async () => {
    const cookie = refreshCookie(await login().expect(200))
    const [r1, r2] = await Promise.all([refresh(cookie), refresh(cookie)])
    expect([r1.status, r2.status]).toEqual([200, 200])
    await refresh(refreshCookie(r1)).expect(200)
    await refresh(refreshCookie(r2)).expect(200)
  })

  it('a rotated token reused within 30 s still works', async () => {
    const cookie = refreshCookie(await login().expect(200))
    await refresh(cookie).expect(200)
    t.clock.advance(20 * SEC)
    await refresh(cookie).expect(200)
  })

  it('keeps remember=false through rotation', async () => {
    const cookie = refreshCookie(await login({ remember: false }).expect(200))
    const res = await refresh(cookie).expect(200)
    expect((res.headers['set-cookie'] as unknown as string[])[0]).not.toMatch(/Expires=/)
  })

  it('logout revokes the refresh token and clears the cookie', async () => {
    const cookie = refreshCookie(await login().expect(200))
    const out = await t.http.post('/api/v1/auth/logout').set('Cookie', cookie).expect(204)
    expect((out.headers['set-cookie'] as unknown as string[])[0]).toMatch(/pane_rt=;/)
    await refresh(cookie).expect(401)
  })

  it('refresh without a cookie is 401 no_session', async () => {
    const res = await t.http.post('/api/v1/auth/refresh').expect(401)
    expect(res.body.code).toBe('no_session')
  })

  it('an expired access token is 401 token_expired', async () => {
    const { body } = await login().expect(200)
    t.clock.advance(16 * MIN)
    const res = await t.http.get('/api/v1/me').set('Authorization', `Bearer ${body.accessToken}`).expect(401)
    expect(res.body.code).toBe('token_expired')
  })

  it('/me without a token is 401', async () => {
    await t.http.get('/api/v1/me').expect(401)
    await t.http.get('/api/v1/me').set('Authorization', 'Bearer garbage').expect(401)
  })

  it('a refresh session expires after 30 days', async () => {
    const cookie = refreshCookie(await login().expect(200))
    t.clock.advance(31 * 24 * 60 * MIN)
    const res = await refresh(cookie).expect(401)
    expect(res.body.code).toBe('session_expired')
  })
})
