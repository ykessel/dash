import { describe, expect, it } from 'vitest'
import { formatMinutes, parseDuration } from './duration'

describe('parseDuration', () => {
  it('reads Jira-style times', () => {
    expect(parseDuration('2h 30m')).toBe(150)
    expect(parseDuration('1.5h')).toBe(90)
    expect(parseDuration('90m')).toBe(90)
    expect(parseDuration('1d')).toBe(480)
    expect(parseDuration('1d 2h')).toBe(600)
    expect(parseDuration(' 2H30M ')).toBe(150)
    expect(parseDuration('2,5h')).toBe(150)
  })
  it('a bare number is hours', () => {
    expect(parseDuration('3')).toBe(180)
  })
  it('rejects empty, zero, negative and garbage', () => {
    for (const s of ['', '0m', '-1h', 'abc', '2x', 'h', '1h abc']) expect(parseDuration(s)).toBeNull()
  })
})

describe('formatMinutes', () => {
  it('prints hours and minutes', () => {
    expect(formatMinutes(150)).toBe('2h 30m')
    expect(formatMinutes(45)).toBe('45m')
    expect(formatMinutes(180)).toBe('3h')
    expect(formatMinutes(0)).toBe('0h')
  })
})
