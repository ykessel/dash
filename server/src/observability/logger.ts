import { randomUUID } from 'node:crypto'
import type { Params } from 'nestjs-pino'
import type { Env } from '../config/env'

/** Never written to the logs: credentials in headers, and secrets in any logged object. */
export const REDACT = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
]

const SANE_ID = /^[\w-]{1,64}$/

/** Keeps a well-formed incoming `X-Request-Id` (from Fly's proxy or the client), else makes one; echoes it back. */
export function requestId(
  req: { headers: Record<string, string | string[] | undefined> },
  res: { setHeader(name: string, value: string): unknown },
): string {
  const got = req.headers['x-request-id']
  const id = typeof got === 'string' && SANE_ID.test(got) ? got : randomUUID()
  res.setHeader('X-Request-Id', id)
  return id
}

/** JSON lines on stdout, one per request (health checks skipped). */
export function pinoOptions(env: Pick<Env, 'LOG_LEVEL' | 'NODE_ENV'>): Params {
  return {
    pinoHttp: {
      level: env.LOG_LEVEL,
      redact: REDACT,
      genReqId: requestId as never,
      autoLogging: { ignore: req => (req.url ?? '').startsWith('/api/v1/health') },
    },
  }
}
