import { loadEnv } from './env'

const valid = {
  NODE_ENV: 'test',
  PORT: '3000',
  DATABASE_URL: 'postgres://u:p@localhost:5434/db',
  DATABASE_URL_DIRECT: 'postgres://u:p@localhost:5434/db',
  JWT_SECRET: 'x'.repeat(32),
  APP_URL: 'http://localhost:5173',
  API_URL: 'http://localhost:3000',
  SMTP_URL: 'smtp://localhost:1025',
  MAIL_FROM: 'Pane <no-reply@pane.local>',
}

describe('loadEnv', () => {
  it('rejects a short JWT_SECRET', () => {
    expect(() => loadEnv({ ...valid, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/)
  })

  it('parses COOKIE_SECURE=false as false', () => {
    expect(loadEnv({ ...valid, COOKIE_SECURE: 'false' }).COOKIE_SECURE).toBe(false)
  })

  it('defaults COOKIE_SECURE to true', () => {
    expect(loadEnv(valid).COOKIE_SECURE).toBe(true)
  })

  it('lists every invalid variable', () => {
    expect(() => loadEnv({ ...valid, DATABASE_URL: undefined, APP_URL: 'nope' })).toThrow(/DATABASE_URL[\s\S]*APP_URL|APP_URL[\s\S]*DATABASE_URL/)
  })

  it('REMINDER_TICK_MS defaults to a minute and 0 turns the timer off', () => {
    expect(loadEnv(valid).REMINDER_TICK_MS).toBe(60_000)
    expect(loadEnv({ ...valid, REMINDER_TICK_MS: '0' }).REMINDER_TICK_MS).toBe(0)
  })

  describe('production', () => {
    const prod = {
      ...valid,
      NODE_ENV: 'production',
      APP_URL: 'https://app.pane.dev',
      API_URL: 'https://app.pane.dev',
      COOKIE_SECURE: 'true',
    }

    it('accepts a secure setup', () => {
      expect(loadEnv(prod).NODE_ENV).toBe('production')
    })

    it('rejects COOKIE_SECURE=false', () => {
      expect(() => loadEnv({ ...prod, COOKIE_SECURE: 'false' })).toThrow(/COOKIE_SECURE/)
    })

    it('rejects an http APP_URL or API_URL', () => {
      expect(() => loadEnv({ ...prod, APP_URL: 'http://app.pane.dev' })).toThrow(/APP_URL/)
      expect(() => loadEnv({ ...prod, API_URL: 'http://app.pane.dev' })).toThrow(/API_URL/)
    })

    it('rejects the example JWT_SECRET', () => {
      expect(() => loadEnv({ ...prod, JWT_SECRET: 'change-me-to-a-long-random-string-of-32-chars' })).toThrow(/JWT_SECRET/)
    })
  })

  it('development accepts what production refuses', () => {
    expect(() => loadEnv({ ...valid, NODE_ENV: 'development', COOKIE_SECURE: 'false', JWT_SECRET: 'change-me-to-a-long-random-string-of-32-chars' })).not.toThrow()
  })

  it('optional services are off by default; LOG_LEVEL is info, silent in tests', () => {
    const e = loadEnv({ ...valid, NODE_ENV: 'development' })
    expect([e.SENTRY_DSN, e.REDIS_URL, e.WEB_DIR]).toEqual([undefined, undefined, undefined])
    expect(e.LOG_LEVEL).toBe('info')
    expect(loadEnv(valid).LOG_LEVEL).toBe('silent')
    expect(loadEnv({ ...valid, LOG_LEVEL: 'debug' }).LOG_LEVEL).toBe('debug')
  })
})
