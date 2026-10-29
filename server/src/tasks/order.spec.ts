import { placeOrder } from './order'

describe('placeOrder', () => {
  it.each([
    [[1, 2, 3], 'top', 0],
    [[1, 2, 3], 'end', 4],
    [[1, 2, 3], 1, 1.5],
    [[1, 2, 3], 0, 0],
    [[], 'top', 0],
    [[], 'end', 0],
  ] as const)('placeOrder(%p, %p) = %p', (col, at, want) => expect(placeOrder([...col], at)).toBe(want))

  it('returns null when the gap is below 1e-6', () => expect(placeOrder([1, 1 + 5e-7], 1)).toBeNull())
})
