import { randomUUID } from 'node:crypto'
import { Inject, Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, type Repository } from 'typeorm'
import { CLOCK, type Clock } from '../common/clock'
import { AppError } from '../common/http-exception.filter'
import type { User } from '../users/user.entity'
import { UsersService } from '../users/users.service'
import { randomToken, sha256 } from './auth-tokens.service'
import { RefreshSession } from './refresh-session.entity'

const SEC = 1000
export const ACCESS_TTL_SEC = 15 * 60
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * SEC
/** A just-rotated token may come back this long after rotation (two tabs, a retried request) without counting as theft. */
export const REUSE_GRACE_MS = 30 * SEC

export interface SessionMeta {
  ip: string
  userAgent: string
  persistent: boolean
}

export interface Issued {
  accessToken: string
  refreshToken: string
  refreshExpiresAt: Date
  persistent: boolean
  user: User
}

const fail = (code: string, message: string) => new AppError(401, code, message)

@Injectable()
export class SessionService {
  constructor(
    @InjectRepository(RefreshSession) private readonly repo: Repository<RefreshSession>,
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  start(user: User, meta: SessionMeta): Promise<Issued> {
    return this.issue(user, randomUUID(), meta)
  }

  async rotate(raw: string | undefined, meta: Omit<SessionMeta, 'persistent'>): Promise<Issued> {
    if (!raw) throw fail('no_session', 'You’re signed out.')
    const row = await this.repo.findOneBy({ tokenHash: sha256(raw) })
    if (!row) throw fail('session_invalid', 'You’re signed out.')
    const now = this.clock.now().getTime()
    if (row.revokedAt) throw fail('session_revoked', 'You’re signed out.')
    if (row.expiresAt.getTime() <= now) throw fail('session_expired', 'Your session expired. Sign in again.')

    if (row.rotatedAt) {
      if (now - row.rotatedAt.getTime() > REUSE_GRACE_MS) {
        // An old token came back long after rotation: assume it leaked and end the whole chain.
        await this.revokeFamily(row.familyId)
        throw fail('session_revoked', 'You’re signed out.')
      }
    } else {
      // Conditional update: if another request rotated it a moment ago, we fall into the grace path.
      await this.repo.update({ id: row.id, rotatedAt: IsNull() }, { rotatedAt: new Date(now) })
    }

    const user = await this.users.findById(row.userId)
    if (!user) throw fail('session_invalid', 'You’re signed out.')
    return this.issue(user, row.familyId, { ...meta, persistent: row.persistent })
  }

  async revoke(raw: string | undefined): Promise<void> {
    if (!raw) return
    const row = await this.repo.findOneBy({ tokenHash: sha256(raw) })
    if (row) await this.revokeFamily(row.familyId)
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.repo.update({ userId, revokedAt: IsNull() }, { revokedAt: this.clock.now() })
  }

  /** `sub` of a valid access token; 401 token_expired / unauthorized otherwise. */
  verifyAccess(token: string): string {
    try {
      const p = this.jwt.verify<{ sub: string }>(token, { clockTimestamp: Math.floor(this.clock.now().getTime() / SEC) })
      return p.sub
    } catch (e) {
      if ((e as Error).name === 'TokenExpiredError') throw fail('token_expired', 'Your session expired.')
      throw fail('unauthorized', 'Sign in to continue.')
    }
  }

  private async revokeFamily(familyId: string) {
    await this.repo.update({ familyId, revokedAt: IsNull() }, { revokedAt: this.clock.now() })
  }

  private async issue(user: User, familyId: string, meta: SessionMeta): Promise<Issued> {
    const now = this.clock.now()
    const refreshToken = randomToken()
    const refreshExpiresAt = new Date(now.getTime() + REFRESH_TTL_MS)
    await this.repo.insert({
      userId: user.id,
      familyId,
      tokenHash: sha256(refreshToken),
      expiresAt: refreshExpiresAt,
      userAgent: meta.userAgent.slice(0, 300),
      ip: meta.ip,
      persistent: meta.persistent,
    })
    const accessToken = this.jwt.sign(
      { sub: user.id, iat: Math.floor(now.getTime() / SEC) },
      { expiresIn: ACCESS_TTL_SEC },
    )
    return { accessToken, refreshToken, refreshExpiresAt, persistent: meta.persistent, user }
  }
}
