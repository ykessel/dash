/* The one way the app talks to the Pane API: JSON over fetch, the access token in memory,
   the refresh token in an httpOnly cookie, one refresh-and-retry when the token runs out. */

export const API_URL: string = (import.meta.env?.VITE_API_URL as string | undefined) ?? 'http://localhost:3000'
const BASE = `${API_URL}/api/v1`

/** What the API sends back on failure: `{ code, message, field? }`. */
export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly field?: string) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface PublicUser {
  id: string
  email: string
  name: string
  emailVerified?: boolean
  avatarSkin?: number
}

/** This tab's id: the API skips echoing our own changes back to us over the socket. */
export const clientId: string = (() => {
  const key = 'pane:client-id'
  try {
    const have = sessionStorage.getItem(key)
    if (have) return have
    const id = Math.random().toString(36).slice(2, 12)
    sessionStorage.setItem(key, id)
    return id
  } catch {
    return Math.random().toString(36).slice(2, 12)
  }
})()

let token: string | null = null
const signedOut = new Set<() => void>()
let refreshing: Promise<{ accessToken: string; user: PublicUser } | null> | null = null

export const setToken = (t: string | null) => { token = t }
export const getToken = () => token
/** Called when the session is gone for good (refresh refused). Returns an unsubscribe. */
export function onSignedOut(cb: () => void): () => void {
  signedOut.add(cb)
  return () => signedOut.delete(cb)
}

async function send(path: string, method: string, body: unknown): Promise<Response> {
  const headers: Record<string, string> = { 'X-Client-Id': clientId }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  return fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function read<T>(r: Response): Promise<T> {
  if (r.status === 204) return undefined as T
  const text = await r.text()
  let json: unknown
  try { json = text ? JSON.parse(text) : undefined } catch { json = undefined }
  if (r.ok) return json as T
  const e = (json ?? {}) as { code?: string; message?: string; field?: string }
  throw new ApiError(r.status, e.code ?? 'unknown', e.message ?? 'Something went wrong. Try again.', e.field)
}

/** Swaps the refresh cookie for a new access token. Concurrent callers share one request. */
export function refresh(): Promise<{ accessToken: string; user: PublicUser } | null> {
  refreshing ??= (async () => {
    try {
      const r = await send('/auth/refresh', 'POST', undefined)
      if (!r.ok) return null
      const s = await read<{ accessToken: string; user: PublicUser }>(r)
      token = s.accessToken
      return s
    } catch {
      return null
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

/** `path` is relative to `/api/v1`. A 401 outside `/auth/*` refreshes once and retries. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = init.method ?? 'GET'
  let r = await send(path, method, init.body)
  if (r.status === 401 && !path.startsWith('/auth/')) {
    const s = await refresh()
    if (s) {
      r = await send(path, method, init.body)
    } else {
      token = null
      signedOut.forEach(cb => cb())
    }
  }
  return read<T>(r)
}
