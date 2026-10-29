import type { ExecutionContext } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { IdentityLinker } from '../src/auth/oauth/identity-linker.service'
import { loadEnv } from '../src/config/env'
import { GithubOAuthGuard, GoogleOAuthGuard } from '../src/auth/oauth/oauth.guards'
import { createTestApp, resetAll, type TestApp } from './utils/app'
import { seedUser } from './utils/seed'

/** Stands in for the provider round trip: the profile comes from a test header. */
const fakeProvider = {
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest()
    const raw = req.headers['x-test-profile']
    req.user = raw ? JSON.parse(raw) : { error: 'oauth_failed' }
    return true
  },
}

describe('OAuth callbacks', () => {
  let t: TestApp
  beforeAll(async () => {
    t = await createTestApp(b => b.overrideGuard(GoogleOAuthGuard).useValue(fakeProvider).overrideGuard(GithubOAuthGuard).useValue(fakeProvider))
  })
  beforeEach(() => resetAll(t))
  afterAll(() => t.app.close())

  const callback = (provider: string, p?: object) => {
    const r = t.http.get(`/api/v1/auth/${provider}/callback`)
    return p ? r.set('x-test-profile', JSON.stringify(p)) : r
  }
  const profile = { provider: 'google', providerUserId: 'g-1', email: 'lin@pane.app', emailVerified: true, name: 'Lin Zhao' }

  it('signs in and sends the browser back to the app with a session cookie', async () => {
    const res = await callback('google', profile).expect(302)
    expect(res.headers.location).toBe('http://localhost:5173/#/auth/callback')
    expect((res.headers['set-cookie'] as unknown as string[]).join(';')).toMatch(/pane_rt=[\w-]+/)
  })

  it('github works the same way', async () => {
    const res = await callback('github', { ...profile, provider: 'github', providerUserId: '42' }).expect(302)
    expect(res.headers.location).toBe('http://localhost:5173/#/auth/callback')
  })

  it('an unverified local account sends the browser back with an error code', async () => {
    await seedUser(t, 'lin@pane.app', 'pane1234', false)
    const res = await callback('google', profile).expect(302)
    expect(res.headers.location).toBe('http://localhost:5173/#/signin?error=account_exists_unverified')
    expect(res.headers['set-cookie'] ?? []).toEqual([])
  })

  it('a failed or cancelled provider round trip goes back with oauth_failed', async () => {
    const res = await callback('google').expect(302)
    expect(res.headers.location).toBe('http://localhost:5173/#/signin?error=oauth_failed')
  })
})

describe('OAuth callback when something unexpected fails', () => {
  let t: TestApp
  beforeAll(async () => {
    t = await createTestApp(b => b
      .overrideGuard(GoogleOAuthGuard).useValue(fakeProvider)
      .overrideProvider(IdentityLinker).useValue({ resolve: () => Promise.reject(new Error('db down')) }))
  })
  afterAll(() => t.app.close())

  it('still sends the browser back to the app', async () => {
    const res = await t.http.get('/api/v1/auth/google/callback')
      .set('x-test-profile', JSON.stringify({ provider: 'google', providerUserId: 'g-1', email: 'lin@pane.app', emailVerified: true, name: 'Lin' }))
      .expect(302)
    expect(res.headers.location).toBe('http://localhost:5173/#/signin?error=oauth_failed')
  })
})

describe('OAuth start with provider credentials', () => {
  let t: TestApp
  beforeAll(async () => {
    const config = new ConfigService({ ...loadEnv(process.env), GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret' })
    t = await createTestApp(b => b.overrideProvider(ConfigService).useValue(config))
  })
  afterAll(() => t.app.close())

  it('redirects to Google with a state that matches a short-lived cookie', async () => {
    const res = await t.http.get('/api/v1/auth/google').expect(302)
    const url = new URL(res.headers.location)
    expect(url.host).toBe('accounts.google.com')
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3000/api/v1/auth/google/callback')
    const state = url.searchParams.get('state')
    const cookie = (res.headers['set-cookie'] as unknown as string[]).find(c => c.startsWith('pane_oauth_state='))!
    expect(cookie).toContain(`pane_oauth_state=${state};`)
    expect(cookie).toMatch(/HttpOnly/)
  })

  it('a callback whose state does not match the cookie is refused', async () => {
    const res = await t.http.get('/api/v1/auth/google/callback?code=abc&state=forged').set('Cookie', 'pane_oauth_state=real').expect(302)
    expect(res.headers.location).toBe('http://localhost:5173/#/signin?error=oauth_failed')
  })
})

describe('OAuth start without provider credentials', () => {
  let t: TestApp
  beforeAll(async () => { t = await createTestApp() })
  afterAll(() => t.app.close())

  it('sends the browser back to sign-in with provider_disabled', async () => {
    for (const p of ['google', 'github']) {
      const res = await t.http.get(`/api/v1/auth/${p}`).expect(302)
      expect(res.headers.location).toBe('http://localhost:5173/#/signin?error=provider_disabled')
    }
  })
})
