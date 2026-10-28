import { createTestApp, resetAll, type TestApp } from './utils/app'
import { seedUser } from './utils/seed'

describe('rate limits, headers and CORS', () => {
  let t: TestApp
  beforeAll(async () => { t = await createTestApp() })
  beforeEach(async () => { await resetAll(t); await seedUser(t) })
  afterAll(() => t.app.close())

  const login = (email: string) => t.http.post('/api/v1/auth/login').send({ email, password: 'wrongpass' })

  it('the 6th login attempt for one email within a minute is 429 with Retry-After', async () => {
    for (let i = 0; i < 5; i++) await login('lin@pane.app').expect(401)
    const res = await login('LIN@pane.app ').expect(429)
    expect(res.body).toEqual({ code: 'rate_limited', message: 'Too many attempts. Try again in a moment.' })
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0)
  })

  it('another email from the same IP can still try', async () => {
    for (let i = 0; i < 6; i++) await login('lin@pane.app')
    await login('nia@pane.app').expect(401)
  })

  it.each(['/api/v1/auth/magic-link', '/api/v1/auth/password/forgot', '/api/v1/auth/verify-email/resend'])(
    '%s allows 3 mails per address per 15 minutes',
    async path => {
      for (let i = 0; i < 3; i++) await t.http.post(path).send({ email: 'lin@pane.app' }).expect(202)
      await t.http.post(path).send({ email: 'Lin@pane.app' }).expect(429)
      await t.http.post(path).send({ email: 'other@pane.app' }).expect(202)
    },
  )

  it('sends security headers', async () => {
    const res = await t.http.get('/api/v1/health').expect(200)
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['content-security-policy']).toBeDefined()
    expect(res.headers['x-powered-by']).toBeUndefined()
  })

  it('allows credentialed CORS from the app origin only', async () => {
    const ok = await t.http.options('/api/v1/auth/login')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST')
      .expect(204)
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173')
    expect(ok.headers['access-control-allow-credentials']).toBe('true')

    const evil = await t.http.options('/api/v1/auth/login')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST')
    // The header names the app origin, which the browser won't match against the evil one.
    expect(evil.headers['access-control-allow-origin']).not.toBe('https://evil.example')
    expect(evil.headers['access-control-allow-origin']).not.toBe('*')
  })
})
