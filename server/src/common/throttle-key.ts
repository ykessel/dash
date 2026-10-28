import { type ExecutionContext, Injectable } from '@nestjs/common'
import { ThrottlerGuard, type ThrottlerLimitDetail, type ThrottlerModuleOptions } from '@nestjs/throttler'
import type { Request, Response } from 'express'
import { normalizeEmail } from '../users/email'
import { AppError } from './http-exception.filter'

const MIN = 60_000
const NEVER = 1_000_000_000

const emailOf = (req: Request) => {
  const e = (req.body as { email?: unknown } | undefined)?.email
  return typeof e === 'string' ? normalizeEmail(e) : ''
}

/**
 * Three counters on every route:
 * - `default`: per IP, 100/min (signup tightens it per route).
 * - `login`: per IP + email; off unless a route sets a limit.
 * - `mail`: per IP + email; off unless a route sets a limit.
 * - `mailbox`: per email address across all IPs, looser, so one IP can't lock an owner out
 *   but many IPs still can't flood one inbox; off unless a route sets a limit.
 */
export const throttlers: ThrottlerModuleOptions = {
  throttlers: [
    { name: 'default', ttl: MIN, limit: 100 },
    { name: 'login', ttl: MIN, limit: NEVER, getTracker: (req: Record<string, unknown>) => `${(req as unknown as Request).ip}|${emailOf(req as unknown as Request)}` },
    { name: 'mail', ttl: 15 * MIN, limit: NEVER, getTracker: (req: Record<string, unknown>) => `${(req as unknown as Request).ip}|${emailOf(req as unknown as Request)}` },
    { name: 'mailbox', ttl: 60 * MIN, limit: NEVER, getTracker: (req: Record<string, unknown>) => emailOf(req as unknown as Request) || String((req as unknown as Request).ip) },
  ],
}

export const LOGIN_LIMIT = { login: { limit: 5, ttl: MIN } }
export const MAIL_LIMIT = { mail: { limit: 3, ttl: 15 * MIN }, mailbox: { limit: 20, ttl: 60 * MIN } }
export const SIGNUP_LIMIT = { default: { limit: 10, ttl: 60 * MIN } }

/** Answers 429 in the API's error shape, with a plain `Retry-After` header. */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async throwThrottlingException(ctx: ExecutionContext, detail: ThrottlerLimitDetail): Promise<void> {
    ctx.switchToHttp().getResponse<Response>().setHeader('Retry-After', String(Math.max(1, detail.timeToBlockExpire)))
    throw new AppError(429, 'rate_limited', 'Too many attempts. Try again in a moment.')
  }
}
