import { describe, expect, it } from 'vitest'
import { monthStart, periodEndOf, weekStart } from './periods'

describe('periods', () => {
  it('weeks start on Monday; Sunday belongs to the week before', () => {
    expect(weekStart('2026-10-29')).toBe('2026-10-26')
    expect(weekStart('2026-11-01')).toBe('2026-10-26')
  })
  it('months and ends', () => {
    expect(monthStart('2026-10-29')).toBe('2026-10-01')
    expect(periodEndOf('2026-10-26', 'week')).toBe('2026-11-01')
    expect(periodEndOf('2026-02-01', 'month')).toBe('2026-02-28')
  })
})
