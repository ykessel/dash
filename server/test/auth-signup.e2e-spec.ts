import { AuthTokensService } from '../src/auth/auth-tokens.service'
import { UsersService } from '../src/users/users.service'
import { createTestApp, resetAll, type TestApp } from './utils/app'

const HOUR = 3_600_000

describe('signup and email verification', () => {
  let t: TestApp
  let users: UsersService
  beforeAll(async () => { t = await createTestApp(); users = t.app.get(UsersService) })
  beforeEach(() => resetAll(t))
  afterAll(() => t.app.close())

  const signup = (body: object) =>
    t.http.post('/api/v1/auth/signup').send({ name: 'Alex Rivera', email: 'alex@co.com', password: 'longenough1', ...body })

  it('signs up, emails a verify link to the frontend, and verifies', async () => {
    await signup({ email: ' Alex@Co.com ' }).expect(201)
    const mail = t.mailer.lastTo('alex@co.com')!
    expect(mail.text).toContain('http://localhost:5173/#/auth/verify?token=')
    expect((await users.findByEmail('alex@co.com'))!.emailVerifiedAt).toBeNull()

    await t.http.post('/api/v1/auth/verify-email').send({ token: t.mailer.tokenFor('alex@co.com') }).expect(204)
    expect((await users.findByEmail('alex@co.com'))!.emailVerifiedAt).toBeInstanceOf(Date)
  })

  it('never stores the plain password', async () => {
    await signup({}).expect(201)
    const u = await users.findByEmail('alex@co.com')
    expect(u!.passwordHash).toMatch(/^\$argon2id\$/)
  })

  it('rejects a taken email in any case', async () => {
    await signup({}).expect(201)
    const res = await signup({ email: 'ALEX@co.com' }).expect(409)
    expect(res.body).toEqual({ code: 'email_taken', field: 'email', message: 'That email already has an account. Sign in instead.' })
  })

  it.each([
    ['name', { name: 'A' }, 'Tell us your name.'],
    ['password', { password: 'short' }, 'Use at least 8 characters.'],
    ['email', { email: 'nope' }, 'Enter a valid email address.'],
  ])('validates %s', async (field, patch, message) => {
    const res = await signup(patch).expect(400)
    expect(res.body).toEqual({ code: 'invalid', field, message })
  })

  it('resend answers 202 whether or not the account exists', async () => {
    await signup({}).expect(201)
    t.mailer.clear()
    await t.http.post('/api/v1/auth/verify-email/resend').send({ email: 'ALEX@co.com' }).expect(202)
    await t.http.post('/api/v1/auth/verify-email/resend').send({ email: 'ghost@co.com' }).expect(202)
    expect(t.mailer.sent.map(m => m.to)).toEqual(['alex@co.com'])
  })

  describe('token errors', () => {
    let tokens: AuthTokensService
    beforeAll(() => { tokens = t.app.get(AuthTokensService) })

    it('a used token is token_used', async () => {
      const raw = await tokens.issue('verify_email', 'a@b.co', null)
      await tokens.consume('verify_email', raw)
      await expect(tokens.consume('verify_email', raw)).rejects.toMatchObject({ code: 'token_used' })
    })

    it('an old token is token_expired', async () => {
      const raw = await tokens.issue('verify_email', 'a@b.co', null)
      t.clock.advance(25 * HOUR)
      await expect(tokens.consume('verify_email', raw)).rejects.toMatchObject({ code: 'token_expired' })
    })

    it('an unknown or wrong-kind token is token_invalid', async () => {
      const raw = await tokens.issue('magic_link', 'a@b.co', null)
      await expect(tokens.consume('verify_email', raw)).rejects.toMatchObject({ code: 'token_invalid' })
      await expect(tokens.consume('verify_email', 'nope')).rejects.toMatchObject({ code: 'token_invalid' })
    })

    it('the HTTP error carries the code', async () => {
      const raw = await tokens.issue('verify_email', 'a@b.co', null)
      await tokens.consume('verify_email', raw)
      const res = await t.http.post('/api/v1/auth/verify-email').send({ token: raw }).expect(400)
      expect(res.body.code).toBe('token_used')
    })
  })
})
