import { IdentityLinker, type OAuthProfile } from '../src/auth/oauth/identity-linker.service'
import { UsersService } from '../src/users/users.service'
import { createTestApp, resetAll, type TestApp } from './utils/app'
import { seedUser } from './utils/seed'

const profile = (p: Partial<OAuthProfile> = {}): OAuthProfile => ({
  provider: 'google', providerUserId: 'g-1', email: 'lin@pane.app', emailVerified: true, name: 'Lin Zhao', ...p,
})

describe('IdentityLinker', () => {
  let t: TestApp
  let linker: IdentityLinker
  beforeAll(async () => { t = await createTestApp(); linker = t.app.get(IdentityLinker) })
  beforeEach(() => resetAll(t))
  afterAll(() => t.app.close())

  it('an already linked account returns the same user even if the provider email changed', async () => {
    const first = await linker.resolve(profile())
    const again = await linker.resolve(profile({ email: 'renamed@pane.app' }))
    expect(again.id).toBe(first.id)
  })

  it('a new verified email creates a verified user', async () => {
    const u = await linker.resolve(profile({ email: 'New@Co.com', name: 'New Person' }))
    expect(u).toMatchObject({ email: 'new@co.com', name: 'New Person' })
    expect(u.emailVerifiedAt).toBeInstanceOf(Date)
  })

  it('links to an existing verified local account', async () => {
    const local = await seedUser(t)
    const u = await linker.resolve(profile({ provider: 'github', providerUserId: '42' }))
    expect(u.id).toBe(local.id)
  })

  it('refuses to link to an unverified local account', async () => {
    await seedUser(t, 'lin@pane.app', 'pane1234', false)
    await expect(linker.resolve(profile())).rejects.toMatchObject({ code: 'account_exists_unverified' })
  })

  it('two simultaneous first logins resolve to one user', async () => {
    const [a, b] = await Promise.all([linker.resolve(profile()), linker.resolve(profile())])
    expect(a.id).toBe(b.id)
    const [{ n }] = await t.db.query(`SELECT count(*)::int AS n FROM oauth_accounts`)
    expect(n).toBe(1)
  })

  it('a first login racing a magic-link sign-up for the same email resolves to that user', async () => {
    const users = t.app.get(UsersService)
    const [viaOAuth, viaLink] = await Promise.all([
      linker.resolve(profile({ email: 'race@co.com' })),
      users.create({ email: 'race@co.com', name: 'Race', emailVerified: true }),
    ])
    expect(viaOAuth.id).toBe(viaLink.id)
  })

  it('refuses an email the provider has not verified', async () => {
    await expect(linker.resolve(profile({ emailVerified: false }))).rejects.toMatchObject({ code: 'email_unverified' })
    expect(await t.app.get(UsersService).findByEmail('lin@pane.app')).toBeNull()
  })
})
