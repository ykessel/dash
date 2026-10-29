import { z } from 'zod'

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
