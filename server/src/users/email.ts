/** One spelling per address: "  Lin@Pane.APP " and "lin@pane.app" are the same account. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}
