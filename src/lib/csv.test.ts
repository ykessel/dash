import { describe, expect, it } from 'vitest'
import { toCsv } from './csv'

describe('toCsv', () => {
  it('neutralises cells that a spreadsheet would run as formulas', () => {
    expect(toCsv([['=SUM(A1)', '-2', '@x', 'ok', -3]])).toBe("'=SUM(A1),'-2,'@x,ok,-3")
  })
})
