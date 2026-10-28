import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { Request } from 'express'

const COOKIE = 'pane_oauth_state'
const PATH = '/api/v1/auth'

/**
 * passport-oauth2 state store without server sessions: the CSRF `state`
 * lives in a short httpOnly cookie and must come back unchanged on the callback.
 */
export class CookieStateStore {
  constructor(private readonly secure: boolean) {}

  store(req: Request, _meta: unknown, cb: (err: Error | null, state?: string) => void) {
    const state = randomBytes(16).toString('base64url')
    req.res?.cookie(COOKIE, state, { httpOnly: true, sameSite: 'lax', secure: this.secure, path: PATH, maxAge: 10 * 60_000 })
    cb(null, state)
  }

  verify(req: Request, provided: string, cb: (err: Error | null, ok: boolean, info?: { message: string }) => void) {
    const expected = String(req.cookies?.[COOKIE] ?? '')
    req.res?.clearCookie(COOKIE, { path: PATH })
    const a = Buffer.from(expected)
    const b = Buffer.from(String(provided ?? ''))
    const ok = a.length > 0 && a.length === b.length && timingSafeEqual(a, b)
    cb(null, ok, ok ? undefined : { message: 'Invalid OAuth state' })
  }
}
