import { z } from 'zod'

const bool = z
  .enum(['true', 'false'])
  .default('true')
  .transform(v => v === 'true')

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  DATABASE_URL_DIRECT: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  APP_URL: z.string().url(),
  API_URL: z.string().url(),
  SMTP_URL: z.string().url(),
  MAIL_FROM: z.string().min(3),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GITHUB_CLIENT_ID: z.string().default(''),
  GITHUB_CLIENT_SECRET: z.string().default(''),
  COOKIE_SECURE: bool,
  /** How often reminders and digests are checked; 0 turns the timer off (tests call tick() directly). */
  REMINDER_TICK_MS: z.coerce.number().int().min(0).default(60_000),
  /** Optional services: unset means off. */
  SENTRY_DSN: z.string().url().optional(),
  REDIS_URL: z.string().url().optional(),
  /** The built web app, served at `/` next to the API (one origin in production). */
  WEB_DIR: z.string().min(1).optional(),
  /** Defaults to `info`, or `silent` under NODE_ENV=test. */
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
}).superRefine((e, ctx) => {
  if (e.NODE_ENV !== 'production') return
  const bad = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message })
  if (!e.COOKIE_SECURE) bad('COOKIE_SECURE', 'must be true in production (the refresh cookie travels over https only)')
  if (!e.APP_URL.startsWith('https://')) bad('APP_URL', 'must be https in production')
  if (!e.API_URL.startsWith('https://')) bad('API_URL', 'must be https in production')
  if (e.JWT_SECRET === EXAMPLE_SECRET) bad('JWT_SECRET', 'is still the .env.example value; generate a new one')
})

/** The placeholder in `.env.example`; production refuses to sign tokens with it. */
const EXAMPLE_SECRET = 'change-me-to-a-long-random-string-of-32-chars'

export type Env = Omit<z.infer<typeof schema>, 'LOG_LEVEL'> & { LOG_LEVEL: NonNullable<z.infer<typeof schema>['LOG_LEVEL']> }

/** Validates process env; throws one error naming every bad variable. */
export function loadEnv(raw: Record<string, string | undefined>): Env {
  const res = schema.safeParse(raw)
  if (res.success) return { ...res.data, LOG_LEVEL: res.data.LOG_LEVEL ?? (res.data.NODE_ENV === 'test' ? 'silent' : 'info') }
  const lines = res.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
  throw new Error(`Invalid environment:\n${lines.join('\n')}`)
}
