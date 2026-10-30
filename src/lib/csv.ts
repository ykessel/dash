export function toCsv(rows: (string | number)[][]): string {
  return rows
    .map(r => r.map(v => {
      // A leading = + - @ would run as a formula in a spreadsheet; a quote keeps it text.
      const s = typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }).join(','))
    .join('\n')
}

export function downloadCsv(name: string, rows: (string | number)[][]) {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
