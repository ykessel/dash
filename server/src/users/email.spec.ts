import { normalizeEmail } from './email'

describe('normalizeEmail', () => {
  it('trims and lowercases', () => expect(normalizeEmail('  Lin@Pane.APP ')).toBe('lin@pane.app'))
})
