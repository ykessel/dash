import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { QueryFailedError } from 'typeorm'
import type { Env } from '../config/env'
import { AppError } from '../common/http-exception.filter'
import { MailService } from '../mail/mail.service'
import type { User } from '../users/user.entity'
import { UsersService } from '../users/users.service'
import { AuthTokensService, tokenError } from './auth-tokens.service'
import { hashPassword, verifyPassword } from './passwords'
import { SessionService, type Issued, type SessionMeta } from './session.service'

const emailTaken = () => new AppError(409, 'email_taken', 'That email already has an account. Sign in instead.', 'email')
const badCredentials = () => new AppError(401, 'bad_credentials', 'Email or password is incorrect.', 'password')

// Verified against when the account has no password, so a miss costs as long as a wrong password.
let dummyHash: Promise<string> | undefined

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly tokens: AuthTokensService,
    private readonly sessions: SessionService,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Frontend route that receives the token; the API never consumes tokens on GET. */
  link(route: 'verify' | 'reset' | 'magic', token: string) {
    return `${this.config.get('APP_URL', { infer: true })}/#/auth/${route}?token=${token}`
  }

  async signup(input: { name: string; email: string; password: string }, meta: SessionMeta): Promise<Issued> {
    if (await this.users.findByEmail(input.email)) throw emailTaken()
    let user: User
    try {
      user = await this.users.create({ ...input, passwordHash: await hashPassword(input.password), emailVerified: false })
    } catch (e) {
      // Two sign-ups racing for one address: the unique index decides.
      if (e instanceof QueryFailedError && (e as QueryFailedError & { code?: string }).code === '23505') throw emailTaken()
      throw e
    }
    await this.sendVerification(user)
    return this.sessions.start(user, meta)
  }

  /** Same answer for unknown email, wrong password and password-less (OAuth-only) accounts. */
  async login(input: { email: string; password: string }, meta: SessionMeta): Promise<Issued> {
    const user = await this.users.findByEmail(input.email)
    const ok = user?.passwordHash
      ? await verifyPassword(user.passwordHash, input.password)
      : await verifyPassword(await (dummyHash ??= hashPassword('not-a-real-password')), input.password).then(() => false)
    if (!user || !ok) throw badCredentials()
    return this.sessions.start(user, meta)
  }

  /** Mails a reset link if the account exists; the caller always answers 202. */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.users.findByEmail(email)
    if (!user) return
    await this.tokens.invalidatePending('reset_password', user.email)
    const raw = await this.tokens.issue('reset_password', user.email, user.id)
    await this.mail.sendPasswordReset(user.email, this.link('reset', raw))
  }

  /** Sets the new password, ends every other session, and signs in. Receiving the mail proves the address. */
  async resetPassword(token: string, password: string, meta: SessionMeta): Promise<Issued> {
    const row = await this.tokens.consume('reset_password', token)
    const user = row.userId ? await this.users.findById(row.userId) : null
    if (!user) throw tokenError('token_invalid')
    await this.users.setPassword(user.id, await hashPassword(password))
    await this.users.markVerified(user.id)
    await this.sessions.revokeAllForUser(user.id)
    return this.sessions.start((await this.users.findById(user.id))!, meta)
  }

  async resendVerification(email: string): Promise<void> {
    const user = await this.users.findByEmail(email)
    if (user && !user.emailVerifiedAt) await this.sendVerification(user)
  }

  async verifyEmail(token: string): Promise<void> {
    const row = await this.tokens.consume('verify_email', token)
    if (row.userId) await this.users.markVerified(row.userId)
  }

  private async sendVerification(user: User) {
    await this.tokens.invalidatePending('verify_email', user.email)
    const raw = await this.tokens.issue('verify_email', user.email, user.id)
    await this.mail.sendVerifyEmail(user.email, this.link('verify', raw))
  }
}
