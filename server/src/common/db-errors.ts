import { QueryFailedError } from 'typeorm'

/** Postgres 23505: another request inserted the same unique key first. */
export function isUniqueViolation(e: unknown): boolean {
  return e instanceof QueryFailedError && (e as QueryFailedError & { code?: string }).code === '23505'
}
