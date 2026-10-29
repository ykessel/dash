import { Writable } from 'node:stream'
import pino from 'pino'
import { pinoOptions, requestId } from './logger'

function capture() {
  const lines: string[] = []
  const stream = new Writable({ write(chunk, _enc, done) { lines.push(String(chunk)); done() } })
  return { lines, stream }
}

describe('pinoOptions', () => {
  it('redacts credentials from requests, responses and bodies', () => {
    const { lines, stream } = capture()
    const http = pinoOptions({ LOG_LEVEL: 'info', NODE_ENV: 'production' }).pinoHttp as pino.LoggerOptions
    const log = pino({ level: http.level, redact: http.redact }, stream)
    log.info({
      req: { headers: { authorization: 'Bearer secret-token', cookie: 'rt=secret-cookie' } },
      res: { headers: { 'set-cookie': 'rt=secret-set' } },
      body: { password: 'secret-pw', token: 'secret-link', accessToken: 'secret-at', refreshToken: 'secret-rt' },
    })
    const out = lines.join('')
    for (const s of ['secret-token', 'secret-cookie', 'secret-set', 'secret-pw', 'secret-link', 'secret-at', 'secret-rt']) {
      expect(out).not.toContain(s)
    }
    expect(out).toContain('[Redacted]')
  })

  it('takes the level from LOG_LEVEL', () => {
    expect((pinoOptions({ LOG_LEVEL: 'silent', NODE_ENV: 'test' }).pinoHttp as pino.LoggerOptions).level).toBe('silent')
  })
})

describe('requestId', () => {
  const res = () => {
    const headers: Record<string, string> = {}
    return { headers, setHeader: (k: string, v: string) => { headers[k.toLowerCase()] = v } }
  }

  it('keeps a sane incoming id and echoes it', () => {
    const r = res()
    expect(requestId({ headers: { 'x-request-id': 'abc-123' } }, r)).toBe('abc-123')
    expect(r.headers['x-request-id']).toBe('abc-123')
  })

  it('replaces a missing or odd one with a uuid', () => {
    const uuid = /^[0-9a-f-]{36}$/
    expect(requestId({ headers: {} }, res())).toMatch(uuid)
    expect(requestId({ headers: { 'x-request-id': 'bad id with spaces' } }, res())).toMatch(uuid)
    expect(requestId({ headers: { 'x-request-id': 'x'.repeat(65) } }, res())).toMatch(uuid)
  })
})
