import type { z } from 'zod'
import { AppError, type ErrorField } from './http-exception.filter'

const FIELDS: ErrorField[] = ['email', 'password', 'name']

/** Parses a request body; the first problem becomes `400 { code: 'invalid', field, message }`. */
export function parseBody<S extends z.ZodType>(schema: S, body: unknown): z.infer<S> {
  const res = schema.safeParse(body ?? {})
  if (res.success) return res.data
  const issue = res.error.issues[0]
  const key = String(issue.path[0] ?? '')
  const field = FIELDS.includes(key as ErrorField) ? (key as ErrorField) : undefined
  throw new AppError(400, 'invalid', issue.message, field)
}
