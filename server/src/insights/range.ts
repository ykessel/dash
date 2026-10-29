import { AppError } from '../common/http-exception.filter'

export type RangeDays = 7 | 30 | 90

const RANGES: Record<string, RangeDays> = { '7d': 7, '30d': 30, '90d': 90 }

/** `?range=7d|30d|90d`, 30d when missing; anything else is 400 on `range`. */
export function parseRange(raw: unknown): RangeDays {
  if (raw === undefined || raw === '') return 30
  const n = typeof raw === 'string' ? RANGES[raw] : undefined
  if (!n) throw new AppError(400, 'invalid', 'Pick 7d, 30d or 90d.', 'range')
  return n
}

/** `YYYY-MM-DD` plus `n` days (negative goes back). */
export const shiftDay = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
