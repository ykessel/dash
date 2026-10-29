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
})
