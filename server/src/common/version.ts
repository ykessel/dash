import { z } from 'zod'
import { AppError } from './http-exception.filter'

/** Optimistic concurrency: the client sends the version it edited; a newer one on the server wins. */
export function assertVersion(current: number, sent: number): void {
  if (current !== sent) throw new AppError(409, 'version_conflict', 'Someone else changed this. Reload to see the latest.')
}

export const versionField = z.number({ error: 'Send the version you edited.' }).int().min(1)
