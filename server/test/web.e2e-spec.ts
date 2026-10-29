import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { TestApp } from './utils/app'

/** One image serves the built web app next to the API (WEB_DIR). */
describe('web app', () => {
  let t: TestApp
  const dir = mkdtempSync(join(tmpdir(), 'pane-web-'))

  beforeAll(async () => {
    writeFileSync(join(dir, 'index.html'), '<!doctype html><h1>pane</h1>')
    process.env.WEB_DIR = dir
    const { createTestApp } = await import('./utils/app')
    t = await createTestApp()
  })
  afterAll(async () => {
    await t.app.close()
    delete process.env.WEB_DIR
    rmSync(dir, { recursive: true, force: true })
  })

  it('serves index.html at /', async () => {
    const res = await t.http.get('/').expect(200)
    expect(res.text).toContain('<h1>pane</h1>')
  })

  it('leaves the API where it was', async () => {
    const res = await t.http.get('/api/v1/health').expect(200)
    expect(res.body).toEqual({ status: 'ok', db: 'up' })
  })

  it('a CSP that lets the app load fonts and talk to its own origin', async () => {
    const res = await t.http.get('/').expect(200)
    const csp = res.headers['content-security-policy']
    expect(csp).toContain('https://fonts.googleapis.com')
    expect(csp).toContain('https://fonts.gstatic.com')
    expect(csp).toContain("connect-src 'self'")
  })
})
