import { UsersService } from '../src/users/users.service'
import { createTestApp, resetDb, type TestApp } from './utils/app'

describe('users', () => {
  let t: TestApp
  let users: UsersService
  beforeAll(async () => { t = await createTestApp(); users = t.app.get(UsersService) })
  beforeEach(() => resetDb(t.db))
  afterAll(() => t.app.close())

  it('email is unique ignoring case', async () => {
    await users.create({ email: 'lin@pane.app', name: 'Lin', emailVerified: false })
    await expect(t.db.query(`INSERT INTO users (email, name) VALUES ('LIN@pane.app', 'X')`)).rejects.toThrow(/unique/i)
  })

  it('creates, finds by normalized email and marks verified', async () => {
    const u = await users.create({ email: ' Nia@Pane.app', name: 'Nia', emailVerified: false })
    expect(u.email).toBe('nia@pane.app')
    expect(u.emailVerifiedAt).toBeNull()
    await users.markVerified(u.id)
    const found = await users.findByEmail('NIA@pane.app ')
    expect(found?.id).toBe(u.id)
    expect(found?.emailVerifiedAt).toBeInstanceOf(Date)
  })

  it('stores a password hash', async () => {
    const u = await users.create({ email: 'a@b.co', name: 'A', emailVerified: true })
    await users.setPassword(u.id, 'hash')
    expect((await users.findById(u.id))?.passwordHash).toBe('hash')
  })
})
