import { createHash, randomBytes } from 'node:crypto'
import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, type Repository } from 'typeorm'
import { CLOCK, type Clock } from '../common/clock'
import { AppError } from '../common/http-exception.filter'
import { normalizeEmail } from '../users/email'
import { AuthToken, type TokenKind } from './auth-token.entity'

const MIN = 60_000
export const TOKEN_TTL: Record<TokenKind, number> = {
  verify_email: 24 * 60 * MIN,
  reset_password: 30 * MIN,
  magic_link: 15 * MIN,
}

export type TokenErrorCode = 'token_invalid' | 'token_expired' | 'token_used'
const MESSAGES: Record<TokenErrorCode, string> = {
  token_invalid: 'This link isn’t valid.',
  token_expired: 'This link has expired. Ask for a new one.',
  token_used: 'This link was already used.',
}

export const tokenError = (code: TokenErrorCode) => new AppError(400, code, MESSAGES[code])
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
export const randomToken = () => randomBytes(32).toString('base64url')

/** Single-use email tokens. Only the hash is stored; the raw token lives in the email. */
@Injectable()
export class AuthTokensService {
  constructor(
    @InjectRepository(AuthToken) private readonly repo: Repository<AuthToken>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async issue(kind: TokenKind, email: string, userId: string | null): Promise<string> {
    const raw = randomToken()
    await this.repo.insert({
      kind,
      email: normalizeEmail(email),
      userId,
      tokenHash: sha256(raw),
      expiresAt: new Date(this.clock.now().getTime() + TOKEN_TTL[kind]),
    })
    return raw
  }

  /** Marks every unused token of this kind for this email as used. */
  async invalidatePending(kind: TokenKind, email: string): Promise<void> {
    await this.repo.update({ kind, email: normalizeEmail(email), usedAt: IsNull() }, { usedAt: this.clock.now() })
  }

  async consume(kind: TokenKind, raw: string): Promise<AuthToken> {
    const row = typeof raw === 'string' && raw ? await this.repo.findOneBy({ tokenHash: sha256(raw) }) : null
    if (!row || row.kind !== kind) throw tokenError('token_invalid')
    if (row.usedAt) throw tokenError('token_used')
    const now = this.clock.now()
    if (row.expiresAt.getTime() <= now.getTime()) throw tokenError('token_expired')
    // Conditional update: of two requests racing for one token, only one wins.
    const res = await this.repo.update({ id: row.id, usedAt: IsNull() }, { usedAt: now })
    if (!res.affected) throw tokenError('token_used')
    return { ...row, usedAt: now }
  }
}
