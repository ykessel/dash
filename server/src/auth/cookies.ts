import type { Response } from 'express'

export const REFRESH_COOKIE = 'pane_rt'
const PATH = '/api/v1/auth'

/** `expires` null = browser-session cookie ("Keep me signed in" unchecked). */
export function setRefreshCookie(res: Response, token: string, expires: Date | null, secure: boolean) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: PATH,
    ...(expires ? { expires } : {}),
  })
}

export function clearRefreshCookie(res: Response, secure: boolean) {
  res.clearCookie(REFRESH_COOKIE, { httpOnly: true, sameSite: 'lax', secure, path: PATH })
}
