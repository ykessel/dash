import { slugify } from './slug'

describe('slugify', () => {
  it.each([
    ['Pane Studio', 'pane-studio'],
    ['  Ñandú & Co!! ', 'nandu-co'],
    ['!!!', 'team'],
    ['a'.repeat(60), 'a'.repeat(40)],
  ])('slugify(%s) = %s', (a, b) => expect(slugify(a)).toBe(b))
})
