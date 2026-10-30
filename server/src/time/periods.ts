/** Approval periods. Weeks run Monday to Sunday. */
export type Period = 'week' | 'month'
export type Bucket = 'day' | 'week' | 'month' | 'year'

const DAY = 86_400_000
const toMs = (day: string) => Date.parse(`${day}T00:00:00Z`)
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** The first day of the period `day` falls in. */
export function periodStart(day: string, p: Period): string {
  if (p === 'month') return `${day.slice(0, 7)}-01`
  const ms = toMs(day)
  const sinceMonday = (new Date(ms).getUTCDay() + 6) % 7
  return fromMs(ms - sinceMonday * DAY)
}

/** The last day of the period that starts on `start`. */
export function periodEnd(start: string, p: Period): string {
  if (p === 'week') return fromMs(toMs(start) + 6 * DAY)
  const d = new Date(toMs(start))
  return fromMs(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - DAY)
}

/** The start of the report bucket `day` falls in. */
export function bucketStart(day: string, b: Bucket): string {
  if (b === 'day') return day
  if (b === 'year') return `${day.slice(0, 4)}-01-01`
  return periodStart(day, b)
}

/** Today's date where the member is; an unknown zone counts as UTC. */
export function localToday(tz: string, now: Date): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  } catch {
    return now.toISOString().slice(0, 10)
  }
}
