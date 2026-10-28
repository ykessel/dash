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
})

export type Env = z.infer<typeof schema>

/** Validates process env; throws one error naming every bad variable. */
export function loadEnv(raw: Record<string, string | undefined>): Env {
  const res = schema.safeParse(raw)
  if (res.success) return res.data
  const lines = res.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
  throw new Error(`Invalid environment:\n${lines.join('\n')}`)
}
