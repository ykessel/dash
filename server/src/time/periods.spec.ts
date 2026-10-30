import { bucketStart, localToday, periodEnd, periodStart } from './periods'

describe('periods', () => {
  it('weeks start on Monday; a Sunday belongs to the week before', () => {
    expect(periodStart('2026-10-29', 'week')).toBe('2026-10-26')
    expect(periodStart('2026-11-01', 'week')).toBe('2026-10-26')
    expect(periodStart('2026-10-26', 'week')).toBe('2026-10-26')
  })
  it('months start on the 1st', () => {
    expect(periodStart('2026-10-29', 'month')).toBe('2026-10-01')
  })
  it('period ends', () => {
    expect(periodEnd('2026-10-26', 'week')).toBe('2026-11-01')
    expect(periodEnd('2026-02-01', 'month')).toBe('2026-02-28')
    expect(periodEnd('2026-12-01', 'month')).toBe('2026-12-31')
  })
  it('report buckets', () => {
    expect(bucketStart('2026-10-29', 'day')).toBe('2026-10-29')
    expect(bucketStart('2026-10-29', 'week')).toBe('2026-10-26')
    expect(bucketStart('2026-10-29', 'month')).toBe('2026-10-01')
    expect(bucketStart('2026-10-29', 'year')).toBe('2026-01-01')
  })
  it("today is the member's local date", () => {
    expect(localToday('Pacific/Kiritimati', new Date('2026-10-29T12:00:00Z'))).toBe('2026-10-30')
    expect(localToday('America/Los_Angeles', new Date('2026-10-29T03:00:00Z'))).toBe('2026-10-28')
    expect(localToday('Not/AZone', new Date('2026-10-29T03:00:00Z'))).toBe('2026-10-29')
  })
})
