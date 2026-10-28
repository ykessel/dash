import { hashPassword } from '../../src/auth/passwords'
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
