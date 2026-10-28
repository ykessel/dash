import { rng } from '../data/seed'
import type { Data, Task } from '../data/types'
import { addDays, iso, nowMinutes, offset, parse, startOfDay, todayIso, weekStart } from './date'

/** Synthetic history so charts look lived-in: finished tasks per day for the last `n` days (oldest first). */
export function throughput(n: number, salt = 0): number[] {
  const r = rng(1234 + salt)
  const today = startOfDay()
  const out: number[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = addDays(today, -i)
    const wd = d.getDay()
    const weekend = wd === 0 || wd === 6
    out.push(weekend ? (r() < 0.25 ? 1 : 0) : Math.round(2 + r() * 7))
  }
  return out
}

/** Previous period of the same length, slightly lower on average. */
export function throughputPrev(n: number): number[] {
  return throughput(n * 2, 7).slice(0, n).map(v => Math.max(0, Math.round(v * 0.82)))
}

/** Team focus hours per day. */
export function focusHours(n: number): number[] {
  const r = rng(99)
  const today = startOfDay()
  const out: number[] = []
  for (let i = n - 1; i >= 0; i--) {
    const wd = addDays(today, -i).getDay()
    out.push(wd === 0 || wd === 6 ? 0 : Math.round(7 + r() * 9))
  }
  return out
}

export function dayLabels(n: number): string[] {
  const today = startOfDay()
  return Array.from({ length: n }, (_, i) => iso(addDays(today, i - n + 1)))
}

export function sum(a: number[]) {
  return a.reduce((s, v) => s + v, 0)
}

export function pct(a: number, b: number) {
  if (!b) return 0
  return Math.round(((a - b) / b) * 100)
}

/** Finished-per-weekday for the current week, Monday first. Past days use history, today uses real data. */
export function thisWeek(data: Data): { values: number[]; todayIndex: number } {
  const ws = weekStart(new Date())
  const hist = throughput(14)
  const todayIndex = (new Date().getDay() + 6) % 7
  const values = Array.from({ length: 7 }, (_, i) => {
    const day = iso(addDays(ws, i))
    if (i > todayIndex) return 0
    if (day === todayIso()) return Math.max(1, data.tasks.filter(t => t.doneAt === day).length)
    return hist[13 - (todayIndex - i)]
  })
  return { values, todayIndex }
}

export function myToday(data: Data) {
  const today = todayIso()
  const mine = data.tasks.filter(t => t.assignee === data.me)
  const dueToday = mine.filter(t => (t.status !== 'done' && t.due <= today) || t.doneAt === today)
  const done = dueToday.filter(t => t.status === 'done').length
  const overdue = mine.filter(t => t.status !== 'done' && t.due < today).length
  return { total: dueToday.length, done, left: dueToday.length - done, overdue, list: dueToday }
}

export function todaysEvents(data: Data) {
  const today = todayIso()
  return data.events.filter(e => e.date === today).sort((a, b) => a.start - b.start)
}

export function meetingsToday(data: Data) {
  const evs = todaysEvents(data).filter(e => e.kind !== 'focus')
  const now = nowMinutes()
  const done = evs.filter(e => e.start + e.dur <= now).length
  return { total: evs.length, done, left: evs.length - done }
}

export function nextEvent(data: Data) {
  const today = todayIso()
  const now = nowMinutes()
  return [...data.events]
    .filter(e => e.date > today || (e.date === today && e.start + e.dur > now))
    .sort((a, b) => (a.date === b.date ? a.start - b.start : a.date < b.date ? -1 : 1))[0]
}

export function focusToday(data: Data) {
  return data.focus.find(f => f.date === todayIso())?.minutes ?? 0
}

export function projectProgress(data: Data, id: string) {
  const ts = data.tasks.filter(t => t.project === id)
  const done = ts.filter(t => t.status === 'done').length
  return { total: ts.length, done, open: ts.length - done, pct: ts.length ? done / ts.length : 0 }
}

export function prioRank(t: Task) {
  return { urgent: 0, high: 1, medium: 2, low: 3 }[t.priority]
}

export function sortByDue(a: Task, b: Task) {
  return a.due === b.due ? prioRank(a) - prioRank(b) : a.due < b.due ? -1 : 1
}

export function daysLeft(due: string) {
  return Math.round((parse(due).getTime() - startOfDay().getTime()) / 86_400_000)
}

export { offset }
