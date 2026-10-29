/** Below this gap two neighbours are too close to split again; the column gets renumbered. */
export const MIN_GAP = 1e-6

/**
 * Where a card lands in a column. `column` holds the `order` values of the target column, sorted,
 * without the moved card. `beforeIndex` is the index of the card it goes above.
 * Returns the new `order`, or `null` when the gap is too small and the column needs renumbering.
 */
export function placeOrder(column: number[], beforeIndex: number | 'top' | 'end'): number | null {
  if (!column.length) return 0
  if (beforeIndex === 'end') return column[column.length - 1] + 1
  if (beforeIndex === 'top' || beforeIndex === 0) return column[0] - 1
  const below = column[beforeIndex]
  const above = column[beforeIndex - 1]
  if (below - above < MIN_GAP) return null
  return (above + below) / 2
}
