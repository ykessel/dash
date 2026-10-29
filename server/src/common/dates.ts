import { z } from 'zod'
import { AppError } from './http-exception.filter'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** A calendar date `YYYY-MM-DD` that exists (no 2026-02-30). */
export const dateField = z.string({ error: 'Use a YYYY-MM-DD date.' }).refine(s => {
  if (!ISO_DATE.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}, 'Use a YYYY-MM-DD date.')

/** The UTC date of an instant, as `YYYY-MM-DD`. */
export const isoDay = (d: Date) => d.toISOString().slice(0, 10)

export const uuidField = z.string().uuid('That id isn’t valid.')

const DAY_MS = 86_400_000
export const MAX_RANGE_DAYS = 366

/** `from`..`to` inclusive must run forward and span a year at most; the error points at `to`. */
export function assertRange(from: string, to: string): void {
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS
  if (days < 0) throw new AppError(400, 'invalid', 'The range ends before it starts.', 'to')
  if (days > MAX_RANGE_DAYS) throw new AppError(400, 'invalid', 'Ask for a year at most.', 'to')
}
