/** Jira-style durations: `2h 30m`, `1.5h`, `90m`, `1d` (a day is 8 hours). A bare number is hours. */
const UNIT: Record<string, number> = { d: 480, h: 60, m: 1 }

/** Minutes, or null when the text isn't a positive duration. */
export function parseDuration(text: string): number | null {
  const s = text.trim().toLowerCase().replace(/,/g, '.')
  if (!s) return null
  if (/^\d+(\.\d+)?$/.test(s)) return positive(Math.round(Number(s) * 60))
  const parts = s.replace(/\s+/g, '').match(/\d+(?:\.\d+)?[dhm]/g)
  if (!parts || parts.join('') !== s.replace(/\s+/g, '')) return null
  return positive(Math.round(parts.reduce((sum, p) => sum + Number(p.slice(0, -1)) * UNIT[p.slice(-1)], 0)))
}

const positive = (n: number) => (n > 0 ? n : null)

/** `2h 30m`, `45m`, `3h`. */
export function formatMinutes(m: number): string {
  const h = Math.floor(m / 60)
  const r = m % 60
  if (!h && r) return `${r}m`
  return r ? `${h}h ${r}m` : `${h}h`
}
