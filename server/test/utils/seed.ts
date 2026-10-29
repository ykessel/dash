import { hashPassword } from '../../src/auth/passwords'
import { SessionService } from '../../src/auth/session.service'
import type { User } from '../../src/users/user.entity'
import { UsersService } from '../../src/users/users.service'
import type { TestApp } from './app'

/** A verified account that signs in with `password` (pass null for an OAuth-only account). */
export async function seedUser(t: TestApp, email = 'lin@pane.app', password: string | null = 'pane1234', verified = true): Promise<User> {
  const users = t.app.get(UsersService)
  return users.create({
    email,
    name: email.split('@')[0],
    passwordHash: password ? await hashPassword(password) : undefined,
    emailVerified: verified,
  })
}

/** The `pane_rt=…` pair from a response, ready to send back as a Cookie header. */
export function refreshCookie(res: { headers: Record<string, unknown> }): string {
  const all = ([] as string[]).concat((res.headers['set-cookie'] as string[] | undefined) ?? [])
  const c = all.find(x => x.startsWith('pane_rt='))
  if (!c) throw new Error('no pane_rt cookie set')
  return c.split(';')[0]
}

/** A signed-in user (seeded if new) with a fresh access token and its Authorization header. */
export async function signedIn(t: TestApp, email = 'lin@pane.app'): Promise<{ user: User; token: string; auth: { Authorization: string } }> {
  const user = (await t.app.get(UsersService).findByEmail(email)) ?? (await seedUser(t, email))
  const { accessToken } = await t.app.get(SessionService).start(user, { ip: '127.0.0.1', userAgent: 'test', persistent: true })
  return { user, token: accessToken, auth: { Authorization: `Bearer ${accessToken}` } }
}
