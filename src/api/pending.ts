/* Optimistic creates show up under a temp id (`tmp-…`) until the server answers. */

/**
 * Puts `item` where `replaceId` (the temp) was, dropping any other copy of `item.id` that a
 * snapshot or live event brought in meanwhile; with neither present it goes at `at`.
 */
export function replaceById<T extends { id: string }>(list: T[], item: T, replaceId: string, at: 'start' | 'end'): T[] {
  const i = list.findIndex(x => x.id === replaceId)
  const j = i < 0 ? list.findIndex(x => x.id === item.id) : i
  if (j < 0) return at === 'start' ? [item, ...list] : [...list, item]
  const out: T[] = []
  list.forEach((x, k) => {
    if (k === j) out.push(item)
    else if (x.id !== item.id && x.id !== replaceId) out.push(x)
  })
  return out
}

/** Temp id → the create that will name it, so follow-up calls wait for the real id. */
export class PendingIds {
  private readonly creates = new Map<string, Promise<string | null>>()

  track(tempId: string, create: Promise<string | null>): void {
    this.creates.set(tempId, create)
  }

  /** The id to send to the API: itself, or the real one once the create lands (null if it failed). */
  async real(id: string): Promise<string | null> {
    if (!id.startsWith('tmp-')) return id
    return (await this.creates.get(id)) ?? null
  }
}
