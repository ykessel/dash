import { toCsv } from './csv'

describe('toCsv', () => {
  it('quotes cells with commas, quotes or newlines and doubles inner quotes', () => {
    expect(toCsv([['a,b', 'say "hi"', 3]])).toBe('"a,b","say ""hi""",3')
    expect(toCsv([['line\nbreak', 'plain']])).toBe('"line\nbreak",plain')
  })

  it('joins rows with \n', () => expect(toCsv([['date', 'n'], ['2026-10-29', 2]])).toBe('date,n\n2026-10-29,2'))
})
