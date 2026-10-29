import { createTestApp, type TestApp } from './utils/app'

describe('health', () => {
  let t: TestApp
  beforeAll(async () => { t = await createTestApp() })
  afterAll(async () => { await t.app.close() })

  it('GET /api/v1/health reports the database', async () => {
    const res = await t.http.get('/api/v1/health').expect(200)
    expect(res.body).toEqual({ status: 'ok', db: 'up' })
  })

  it('unknown route uses the error shape', async () => {
    const res = await t.http.get('/api/v1/nope').expect(404)
    expect(res.body).toMatchObject({ code: 'not_found', message: expect.any(String) })
  })

  it('echoes an incoming X-Request-Id', async () => {
    const res = await t.http.get('/api/v1/health').set('X-Request-Id', 'abc-123').expect(200)
    expect(res.headers['x-request-id']).toBe('abc-123')
  })

  it('makes one up when there is none', async () => {
    const res = await t.http.get('/api/v1/health').expect(200)
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)
  })
})
