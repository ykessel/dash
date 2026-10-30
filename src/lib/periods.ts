/** Mirrors server/src/time/periods.ts: weeks run Monday to Sunday. */
export type Period = 'week' | 'month'

const DAY = 86_400_000
const toMs = (day: string) => Date.parse(`${day}T00:00:00Z`)
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export const addDaysIso = (day: string, n: number) => fromMs(toMs(day) + n * DAY)

export function weekStart(day: string): string {
  return addDaysIso(day, -((new Date(toMs(day)).getUTCDay() + 6) % 7))
}

export const monthStart = (day: string) => `${day.slice(0, 7)}-01`

export const periodStartOf = (day: string, p: Period) => (p === 'week' ? weekStart(day) : monthStart(day))

export function periodEndOf(start: string, p: Period): string {
  if (p === 'week') return addDaysIso(start, 6)
  const d = new Date(toMs(start))
  return fromMs(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - DAY)
}
