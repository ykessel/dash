import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Reply = { status: number; body?: unknown; text?: string }
const res = ({ status, body, text }: Reply) =>
  new Response(text ?? (body === undefined ? null : JSON.stringify(body)), { status, headers: { 'Content-Type': 'application/json' } })

let calls: { url: string; init: RequestInit }[] = []
function stubFetch(handler: (url: string, init: RequestInit) => Reply | Promise<Reply>) {
  calls = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return res(await handler(url, init))
  }))
}

const store = new Map<string, string>()
vi.stubGlobal('sessionStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) })

const load = async () => {
  vi.resetModules()
  return import('./client')
}
const header = (i: number, name: string) => new Headers(calls[i].init.headers).get(name)

describe('api client', () => {
  beforeEach(() => store.clear())
  afterEach(() => vi.unstubAllGlobals())

  it('sends JSON with the token, credentials and client id', async () => {
    const c = await load()
    stubFetch(() => ({ status: 200, body: { ok: 1 } }))
    c.setToken('tok')
    expect(await c.api('/things', { method: 'POST', body: { a: 1 } })).toEqual({ ok: 1 })
    expect(calls[0].url).toBe(`${c.API_URL}/api/v1/things`)
    expect(calls[0].init).toMatchObject({ method: 'POST', credentials: 'include', body: '{"a":1}' })
    expect(header(0, 'Authorization')).toBe('Bearer tok')
    expect(header(0, 'Content-Type')).toBe('application/json')
    expect(header(0, 'X-Client-Id')).toBe(c.clientId)
  })

  it('a 204 resolves undefined', async () => {
    const c = await load()
    stubFetch(() => ({ status: 204 }))
    expect(await c.api('/x', { method: 'DELETE' })).toBeUndefined()
  })

  it('a 401 refreshes once and retries with the new token', async () => {
    const c = await load()
    c.setToken('old')
    stubFetch((url, init) => {
      if (url.endsWith('/auth/refresh')) return { status: 200, body: { accessToken: 'new', user: { id: 'u' } } }
      return new Headers(init.headers).get('Authorization') === 'Bearer new' ? { status: 200, body: 'yes' } : { status: 401, body: { code: 'unauthorized', message: 'no' } }
    })
    expect(await c.api('/x')).toBe('yes')
    expect(calls.map(x => x.url.split('/api/v1')[1])).toEqual(['/x', '/auth/refresh', '/x'])
    expect(c.getToken()).toBe('new')
  })

  it('a failed refresh clears the token and fires onSignedOut', async () => {
    const c = await load()
    c.setToken('old')
    const out = vi.fn()
    c.onSignedOut(out)
    stubFetch(() => ({ status: 401, body: { code: 'unauthorized', message: 'no' } }))
    await expect(c.api('/x')).rejects.toMatchObject({ status: 401 })
    expect(calls).toHaveLength(2)
    expect(c.getToken()).toBeNull()
    expect(out).toHaveBeenCalledTimes(1)
  })

  it('two concurrent 401s share one refresh', async () => {
    const c = await load()
    c.setToken('old')
    stubFetch((url, init) => {
      if (url.endsWith('/auth/refresh')) return { status: 200, body: { accessToken: 'new', user: { id: 'u' } } }
      return new Headers(init.headers).get('Authorization') === 'Bearer new' ? { status: 200, body: 1 } : { status: 401, body: {} }
    })
    await Promise.all([c.api('/a'), c.api('/b')])
    expect(calls.filter(x => x.url.endsWith('/auth/refresh'))).toHaveLength(1)
  })

  it('an error body becomes ApiError with code and field; a non-JSON 500 is unknown', async () => {
    const c = await load()
    stubFetch(url => (url.endsWith('/bad') ? { status: 400, body: { code: 'invalid', message: 'Pick one.', field: 'email' } } : { status: 500, text: '<html>' }))
    await expect(c.api('/bad')).rejects.toMatchObject({ status: 400, code: 'invalid', message: 'Pick one.', field: 'email' })
    await expect(c.api('/boom')).rejects.toMatchObject({ status: 500, code: 'unknown' })
    await expect(c.api('/bad')).rejects.toBeInstanceOf(c.ApiError)
  })

  it('a duplicated tab gets its own client id', async () => {
    vi.stubGlobal('sessionStorage', { getItem: () => 'copied-from-the-other-tab', setItem: () => undefined })
    const a = await load()
    const b = await load()
    expect(a.clientId).not.toBe('copied-from-the-other-tab')
    expect(a.clientId).not.toBe(b.clientId)
  })

  it('a production build without VITE_API_URL talks to its own origin', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_API_URL', undefined)
    vi.stubGlobal('location', { origin: 'https://app.pane.dev' })
    try {
      expect((await load()).API_URL).toBe('https://app.pane.dev')
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
