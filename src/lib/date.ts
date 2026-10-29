// Small date helpers. Dates are stored as local "YYYY-MM-DD" strings so the
// demo data can be laid out relative to today and survive JSON round-trips.

export const DAY = 86_400_000

// The demo runs on its own clock: every visit starts at 10:40 AM today and
// then ticks in real time, so "up next", the now-line and greetings always
// have something to show.
const DEMO_START_MIN = 10 * 60 + 40
const LOADED_AT = Date.now()

export function demoNow(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return new Date(d.getTime() + DEMO_START_MIN * 60_000 + (Date.now() - LOADED_AT))
}

export function startOfDay(d = new Date()): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function iso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parse(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export function todayIso(): string {
  return iso(startOfDay())
}

export function offset(n: number): string {
  return iso(addDays(startOfDay(), n))
}

export function diffDays(a: string, b: string): number {
  return Math.round((parse(a).getTime() - parse(b).getTime()) / DAY)
}

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function short(s: string): string {
  if (!s) return 'No date'
  const d = parse(s)
  return `${MON[d.getMonth()]} ${d.getDate()}`
}

export function weekday(s: string): string {
  return WD[parse(s).getDay()]
}

/** "Today", "Tomorrow", "Fri" within the week, otherwise "Nov 21". */
export function relDue(s: string): string {
  if (!s) return 'No date'
  const n = diffDays(s, todayIso())
  if (n === 0) return 'Today'
  if (n === 1) return 'Tomorrow'
  if (n === -1) return 'Yesterday'
  if (n > 1 && n < 7) return weekday(s)
  return short(s)
}

export function monthName(d: Date) {
  return MONTHS_LONG[d.getMonth()]
}

export function longDate(d = new Date()): string {
  return `${WEEKDAYS_LONG[d.getDay()]}, ${MONTHS_LONG[d.getMonth()]} ${d.getDate()}`
}

/** Monday of the week containing d. */
export function weekStart(d: Date): Date {
  const x = startOfDay(d)
  const wd = (x.getDay() + 6) % 7
  return addDays(x, -wd)
}

export function fmtTime(min: number): string {
  const h = Math.floor(min / 60) % 24
  const m = min % 60
  const ap = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`
}

export function fmtHourLabel(h: number): string {
  if (h === 12) return 'Noon'
  return `${h % 12 === 0 ? 12 : h % 12} ${h >= 12 ? 'PM' : 'AM'}`
}

export function fmtDur(min: number): string {
  if (min < 60) return `${min} min`
  const h = min / 60
  return `${Number.isInteger(h) ? h : h.toFixed(1)} h`
}

export function nowMinutes(): number {
  const d = demoNow()
  return d.getHours() * 60 + d.getMinutes()
}

export function ago(ts: number): string {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  return `${Math.round(h / 24)} d ago`
}

export function greeting(): string {
  const h = demoNow().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}
