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
})
