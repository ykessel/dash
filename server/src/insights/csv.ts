/** Same rule as the frontend's `src/lib/csv.ts`: quote cells holding `"`, `,` or a newline; `"` becomes `""`. */
export function toCsv(rows: (string | number)[][]): string {
  return rows
    .map(r => r.map(v => {
      // A leading = + - @ would run as a formula in a spreadsheet; a quote keeps it text.
      const s = typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }).join(','))
    .join('\n')
}
